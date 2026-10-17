// Вход в AniList. Своей формы нет: логин с паролем вводится на самом AniList, а пропуск ловит приёмник на своём адресе, минуя разметку.

use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Url};
// Окно входа открывается только на десктопе, там же нужны и его конструктор с адресом внешней страницы.
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

/// Порт приёмника. Постоянный, а не свободный из системы: этот же номер записан у клиента AniList в адресе возврата, и случайный пришлось бы согласовывать.
pub const PORT: u16 = 48513;

/// Путь странички-стрелочника. Вместе с портом даёт адрес возврата, который должен стоять у клиента AniMori в консоли разработчика AniList.
const RELAY_PATH: &str = "/relay";

const AUTHORIZE_BASE: &str = "https://anilist.co/api/v2/oauth/authorize";

/// Клиент AniMori. Секрета здесь нет и быть не может: неявный поток его не требует, а в раздаваемом приложении секрет всё равно достанут.
const CLIENT_ID: &str = "48513";

/// Метка окна входа. Своя: разрешения выдаются окну по метке, а здесь чужая страница с паролем, и файла capabilities у этой метки нет сознательно.
const LOGIN_WINDOW_LABEL: &str = "login";

/// Сколько приёмник ждёт пропуск. Пять минут человеку хватает, а открытый порт без нужды висеть не должен.
const WAIT_SECS: u64 = 300;

/// Шаг ожидания входящих. Приёмник неблокирующий: с обычным accept поток висел бы до первого соединения и никогда не заметил, что срок вышел.
const POLL_STEP_MS: u64 = 200;

/// Сроки на чтение и ответ одному соединению. Без них молчащий клиент занял бы приёмник до самого конца ожидания.
const IO_TIMEOUT_MS: u64 = 3000;

/// Тот же файл, что у прокси и остальных настроек: второе хранилище разошлось бы с первым при любой чистке настроек руками.
const STORE_FILE: &str = "animori-settings.json";
const KEY_TOKEN: &str = "auth_token";
const KEY_EXPIRES_AT: &str = "auth_expires_at";

/// Событие для своего окна: пропуск приходит со стороны, из окна входа, и без события настройки узнали бы о входе только опросом в цикле.
const EVENT_CHANGED: &str = "animori://auth-changed";

/// Запас на жизнь пропуска: срок, истекающий в ближайшую минуту, считаем истёкшим — иначе запрос ушёл бы с умирающим пропуском и вернулся отказом.
const EXPIRY_MARGIN_SECS: u64 = 60;

/// Границы здравого смысла для ручной вставки: пропуск AniList — длинная строка из трёх частей через точку. Проверка от опечаток, не от взлома.
const TOKEN_MIN_LEN: usize = 24;
const TOKEN_MAX_LEN: usize = 8192;

/// Приёмник поднят? Он один на приложение: второй попытался бы занять тот же порт и упал бы с отказом ровно там, где человек нажал кнопку.
static RUNNING: AtomicBool = AtomicBool::new(false);

/// Одноразовый nonce текущего входа: уезжает в запрос входа как state и возвращается приёмнику. Пусто — вход не запрашивался или уже закрыт.
static NONCE: Mutex<Option<String>> = Mutex::new(None);

/// Всё, что разметка знает о входе. Самого пропуска здесь нет сознательно.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub authorized: bool,
    /// Секунды эпохи Unix. None — срок неизвестен (ручная вставка).
    pub expires_at: Option<u64>,
}

/// Ответ на нажатие «Войти». Адресов здесь больше нет: окно входа поднимаем мы, осталось только ожидание, чтобы экран сказал, сколько времени есть.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoginStart {
    pub wait_secs: u64,
}

/// Секунды эпохи Unix. Шаг назад за 1970 год в работе невозможен, поэтому при сбитых часах честнее считать срок неизвестным.
fn now_secs() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

/// Проверка формы пропуска. Нужна из-за ручной вставки: человек легко пришлёт адрес целиком или половину строки, и внятный отказ полезнее молчаливого отказа.
fn check_token(raw: &str) -> Result<String, String> {
    let token = raw.trim();

    if token.is_empty() {
        return Err("Пропуск пустой".to_string());
    }

    if token.len() < TOKEN_MIN_LEN || token.len() > TOKEN_MAX_LEN {
        return Err("Длина не похожа на пропуск AniList".to_string());
    }

    // Допустимые символы веб-токена. Пробел или слеш значат, что приехал адрес или часть страницы, а не пропуск.
    let shaped = token
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_');

    if !shaped {
        return Err("В пропуске есть посторонние символы".to_string());
    }

    Ok(token.to_string())
}

/// Снимок состояния из файла настроек. Истёкший пропуск считается отсутствием входа: с ним всё равно ничего не сделать.
fn read_status(app: &AppHandle) -> Result<AuthStatus, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let has_token = store
        .get(KEY_TOKEN)
        .and_then(|v| v.as_str().map(|s| !s.trim().is_empty()))
        .unwrap_or(false);

    if !has_token {
        return Ok(AuthStatus {
            authorized: false,
            expires_at: None,
        });
    }

    let expires_at = store.get(KEY_EXPIRES_AT).and_then(|v| v.as_u64());

    Ok(AuthStatus {
        authorized: alive(expires_at, now_secs()),
        expires_at,
    })
}

/// Пропуск жив, пока до срока больше запаса EXPIRY_MARGIN_SECS. Срок или часы неизвестны — верим пропуску: так бывает после ручной вставки.
fn alive(expires_at: Option<u64>, now: Option<u64>) -> bool {
    match (expires_at, now) {
        (Some(deadline), Some(now)) => deadline > now + EXPIRY_MARGIN_SECS,
        _ => true,
    }
}

/// Запись пропуска и срока. save() явный: плагин не пишет файл сам, и без этого вызова вход жил бы только до закрытия приложения.
fn write_token(app: &AppHandle, token: &str, expires_in: Option<u64>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    store.set(KEY_TOKEN, token.to_string());

    match (expires_in, now_secs()) {
        (Some(secs), Some(now)) if secs > 0 => store.set(KEY_EXPIRES_AT, now + secs),
        // Старый срок убирается обязательно: иначе новый пропуск считался бы истёкшим по чужой отметке.
        _ => {
            store.delete(KEY_EXPIRES_AT);
        }
    }

    store.save().map_err(|e| e.to_string())
}

/// Общий хвост для всех путей: запись и сообщение своему окну.
fn accept_token(
    app: &AppHandle,
    token: &str,
    expires_in: Option<u64>,
) -> Result<AuthStatus, String> {
    let token = check_token(token)?;
    write_token(app, &token, expires_in)?;

    let status = read_status(app)?;

    // Ошибка только в журнал: пропуск уже записан, и отвечать отказом было бы ложью.
    if let Err(e) = app.emit(EVENT_CHANGED, status.clone()) {
        log::warn!("Событие о входе не разошлось: {e}");
    }

    log::info!("Вход в AniList выполнен");
    Ok(status)
}

/// Обратное превращение значения из адреса. Кодирования рядом нет: в адрес входа уезжают только цифры клиента и вид пропуска.
fn decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let pair = std::str::from_utf8(&bytes[index + 1..index + 3]).ok();
                match pair.and_then(|p| u8::from_str_radix(p, 16).ok()) {
                    Some(value) => {
                        out.push(value);
                        index += 3;
                    }
                    None => {
                        out.push(b'%');
                        index += 1;
                    }
                }
            }
            other => {
                out.push(other);
                index += 1;
            }
        }
    }

    String::from_utf8_lossy(&out).to_string()
}

/// Значение параметра из строки запроса.
fn param(query: &str, key: &str) -> Option<String> {
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find(|(name, _)| *name == key)
        .map(|(_, value)| decode(value))
}

/// Адрес странички-стрелочника: ровно эта строка должна стоять у клиента AniMori в консоли разработчика AniList, сверить её больше негде.
fn relay_url() -> String {
    ["http://127.0.0.1:", &PORT.to_string(), RELAY_PATH].concat()
}

/// Новый nonce входа: шестнадцать случайных байт в hex — в адресе посторонних символов быть не должно.
fn fresh_nonce() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|e| ["Случайность не вышла: ", &e.to_string()].concat())?;

    let mut nonce = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        nonce.push_str(&format!("{byte:02x}"));
    }

    Ok(nonce)
}

/// Запомнить nonce текущего входа.
fn remember_nonce(nonce: &str) -> Result<(), String> {
    let mut current = NONCE
        .lock()
        .map_err(|_| "Состояние входа потеряно".to_string())?;
    *current = Some(nonce.to_string());
    Ok(())
}

/// Забыть nonce: возвраты с прежним state больше не принимаются.
fn forget_nonce() {
    if let Ok(mut current) = NONCE.lock() {
        *current = None;
    }
}

/// Присланный state совпадает с текущим nonce. Входа нет или state чужой — отказ.
fn state_matches(given: Option<&str>) -> bool {
    let Ok(current) = NONCE.lock() else {
        return false;
    };

    match (given, current.as_deref()) {
        (Some(given), Some(current)) => given == current,
        _ => false,
    }
}

/// Адрес страницы входа AniList. redirect_uri не передаётся: в неявном потоке адрес возврата берётся из настроек клиента — лишний redirect_uri отвергался ответом unsupported_grant_type. state — одноразовый nonce текущего входа, приёмник сверяет его на `/token`.
fn authorize_url(nonce: &str) -> String {
    [
        AUTHORIZE_BASE,
        "?client_id=",
        CLIENT_ID,
        "&response_type=token&state=",
        nonce,
    ]
    .concat()
}

/// Ответ одной строкой. Свой мини-сервер вместо готового: нам нужны два адреса и три ответа, а любая библиотека сервера тянет с собой целый мир.
fn reply(mut stream: TcpStream, code: u16, kind: &str, body: &str) {
    let reason = match code {
        200 => "OK",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Error",
    };

    let head = [
        "HTTP/1.1 ",
        &code.to_string(),
        " ",
        reason,
        "\r\nContent-Type: ",
        kind,
        "\r\nContent-Length: ",
        &body.len().to_string(),
        "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
    ]
    .concat();

    let sent = stream
        .write_all(head.as_bytes())
        .and_then(|_| stream.write_all(body.as_bytes()))
        .and_then(|_| stream.flush());

    if let Err(e) = sent {
        log::warn!("Ответ приёмника не ушёл: {e}");
    }
}

/// Общая обёртка страницы под нашу палитру: возврат не должен выглядеть чужим. Тело собирается массивом строк, поэтому фигурные скобки не экранировать.
fn page(stream: TcpStream, title: &str, text: &str, script: &str) {
    let body = [
        "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        "<title>AniMori</title><style>:root{color-scheme:dark}",
        "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;",
        "background:#0b1622;color:#e7edf7;font:16px/1.5 system-ui,sans-serif;text-align:center}",
        "h1{margin:0 0 8px;font-size:22px;color:#4c9ffe}",
        "code{font-size:13px;color:#8ba1bd;word-break:break-all}</style></head><body><main><h1>",
        title,
        "</h1><p id=\"text\">",
        text,
        "</p></main>",
        script,
        "</body></html>",
    ]
    .concat();

    reply(stream, 200, "text/html; charset=utf-8", &body);
}

/// Скрипт странички-стрелочника: перекладывает фрагмент адреса целиком в обычный запрос. Склеен concat!: слеш переноса уезжал в код и ломал его.
const RELAY_SCRIPT: &str = concat!(
    "<script>(function(){",
    "var t=document.getElementById('text');",
    "var h=location.hash.slice(1);",
    "if(!h){t.textContent='В адресе возврата нет пропуска. Закрой окно и попробуй ещё раз.';return;}",
    "location.replace('/token?'+h);",
    "})();</script>"
);

/// Одно соединение. true — пропуск получен, приёмник больше не нужен.
fn serve(app: &AppHandle, stream: TcpStream) -> bool {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(IO_TIMEOUT_MS)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(IO_TIMEOUT_MS)));

    let copy = match stream.try_clone() {
        Ok(copy) => copy,
        Err(e) => {
            log::warn!("Соединение не прочитать: {e}");
            return false;
        }
    };

    let mut reader = BufReader::new(copy);

    let mut request = String::new();
    if let Err(e) = reader.read_line(&mut request) {
        log::warn!("Запрос к приёмнику не прочитан: {e}");
        return false;
    }

    // Заголовки вычитываются, а не выбрасываются: два из них решают, от кого пришёл возврат.
    // Остальные по-прежнему не нужны, но перешагнуть пустую строку конца обязательно —
    // недочитанный запрос мешает закрыть соединение чисто.
    let mut host_ok = false;
    let mut origin_present = false;

    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) if line.trim().is_empty() => break,
            Ok(_) => {
                let lowered = line.to_ascii_lowercase();

                // Имя заголовка сравниваем целиком с двоеточием: иначе `x-origin` сошёл бы за `origin`.
                if let Some(rest) = lowered.strip_prefix("host:") {
                    let value = rest.trim();
                    // localhost допускаем наравне: им адрес набирают и вручную, и в закладках.
                    let ours = ["127.0.0.1:", &PORT.to_string()].concat();
                    let named = ["localhost:", &PORT.to_string()].concat();
                    host_ok = value == ours || value == named;
                } else if lowered.starts_with("origin:") {
                    origin_present = true;
                }
            }
            Err(_) => break,
        }
    }

    // От чужого клиента возврат не принимаем. Правило «Origin не должно быть», а не «должно
    // быть anilist.co»: страница AniList приходит переходом и заголовка не несёт вовсе, а
    // скрипт с чужой страницы несёт. Сравнение с доменом связало бы вход с адресом сайта —
    // AniList сменит форму входа, и отказ выглядел бы как «AniList сломался».
    if !host_ok || origin_present {
        log::warn!("Запрос к приёмнику отклонён: чужой Host или пришёл Origin");
        reply(
            stream,
            403,
            "text/plain; charset=utf-8",
            "Так вход не работает",
        );
        return false;
    }

    let mut parts = request.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");

    if method != "GET" {
        reply(stream, 405, "text/plain; charset=utf-8", "Только GET");
        return false;
    }

    let (path, query) = target.split_once('?').unwrap_or((target, ""));

    if path == RELAY_PATH {
        page(stream, "Секунду", "Заканчиваем вход…", RELAY_SCRIPT);
        return false;
    }

    if path != "/token" {
        reply(
            stream,
            404,
            "text/plain; charset=utf-8",
            "Нет такой страницы",
        );
        return false;
    }

    // Без совпадения с текущим nonce возврат не принимается: иначе приёмник ловит адрес, присланный кем угодно.
    if !state_matches(param(query, "state").as_deref()) {
        log::warn!("Возврат не принят: state не совпал с текущим входом");
        page(
            stream,
            "Не вышло",
            "Вход не распознан. Попробуй ещё раз.",
            "",
        );
        return false;
    }

    let token = param(query, "access_token");
    let expires_in = param(query, "expires_in").and_then(|v| v.parse::<u64>().ok());

    let Some(token) = token else {
        page(stream, "Не вышло", "В адресе возврата нет пропуска.", "");
        return false;
    };

    match accept_token(app, &token, expires_in) {
        Ok(_) => {
            forget_nonce();
            page(stream, "Готово", "Вход выполнен, окно закроется само.", "");
            close_login_window(app);
            true
        }
        Err(e) => {
            log::warn!("Пропуск из адреса возврата не принят: {e}");
            page(
                stream,
                "Не вышло",
                "Пропуск не принят. Попробуй ещё раз.",
                "",
            );
            false
        }
    }
}

/// Поднимает приёмник, если его ещё нет.
fn start_receiver(app: &AppHandle) -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(());
    }

    // Только 127.0.0.1: пропуск возвращается в это же приложение, и слушать домашнюю сеть незачем — открытый наружу порт был бы лишним риском.
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, PORT))
        .map_err(|e| ["Приёмник не занял свой порт: ", &e.to_string()].concat())?;

    listener
        .set_nonblocking(true)
        .map_err(|e| ["Приёмник не перевести в ожидание: ", &e.to_string()].concat())?;

    RUNNING.store(true, Ordering::SeqCst);

    let handle = app.clone();

    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(WAIT_SECS);

        loop {
            if Instant::now() >= deadline {
                log::info!("Приёмник входа закрыт: время ожидания вышло");
                break;
            }

            match listener.accept() {
                Ok((stream, _)) => {
                    if serve(&handle, stream) {
                        log::info!("Приёмник входа закрыт: пропуск получен");
                        break;
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(POLL_STEP_MS));
                }
                Err(e) => {
                    log::warn!("Приёмник входа сломался: {e}");
                    break;
                }
            }
        }

        RUNNING.store(false, Ordering::SeqCst);
        forget_nonce();
    });

    // Адрес возврата в журнал: сверить его с консолью клиента больше негде.
    log::info!(
        "Приёмник входа слушает свой порт, адрес возврата: {}",
        relay_url()
    );
    Ok(())
}

/// Окно входа. Своё, а не системный браузер: движок окна работает в окружении с прокси. Строится СТРОГО из рабочего потока: build() ждёт ответа из цикла событий.
fn open_login_window(app: &AppHandle, url: &str) -> Result<(), String> {
    let address: Url = url
        .parse()
        .map_err(|_| "Адрес входа не разбирается".to_string())?;

    // Прошлое окно закрывается: адрес входа одноразовый, и старая форма привела бы к возврату, которого уже никто не ждёт.
    close_login_window(app);

    // Отметка перед созданием: без неё не отличить «не дошло до окна» от
    // «зависло внутри создания».
    log::info!("Создаю окно входа AniList");

    #[cfg(desktop)]
    {
        WebviewWindowBuilder::new(app, LOGIN_WINDOW_LABEL, WebviewUrl::External(address))
            .title("Вход в AniList")
            .inner_size(520.0, 720.0)
            .min_inner_size(420.0, 560.0)
            .resizable(true)
            .center()
            .build()
            .map_err(|e| ["Окно входа не открылось: ", &e.to_string()].concat())?;

        log::info!("Открыто окно входа AniList");
        Ok(())
    }

    #[cfg(mobile)]
    {
        // Второе окно — вещь десктопная: на телевизере активность одна, и строитель окна не имеет там ни размеров, ни центрирования. Пока вход недоступен.
        let _ = address;
        Err("Вход на телевизоре пока недоступен".to_string())
    }
}

/// Закрывает окно входа, если оно есть. Ошибка закрытия только в журнал: вход к этому моменту уже состоялся, и отказом отвечать было бы ложью.
fn close_login_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        if let Err(e) = window.close() {
            log::warn!("Окно входа не закрылось: {e}");
        }
    }
}

/// Начать вход. Поднимает приёмник и открывает окно с формой входа. async несёт смысл: синхронная команда создаёт окно в главном потоке и встаёт.
#[tauri::command]
pub async fn animori_auth_start(app: AppHandle) -> Result<LoginStart, String> {
    // Новый вход — новый nonce: прежний перестаёт действовать немедленно.
    let nonce = fresh_nonce()?;
    remember_nonce(&nonce)?;
    start_receiver(&app)?;
    open_login_window(&app, &authorize_url(&nonce))?;

    Ok(LoginStart {
        wait_secs: WAIT_SECS,
    })
}

/// Ручная вставка пропуска. Запасной путь на случай, когда возврат не дошёл.
#[tauri::command]
pub fn animori_auth_submit(
    app: AppHandle,
    token: String,
    expires_in: Option<u64>,
) -> Result<AuthStatus, String> {
    accept_token(&app, &token, expires_in)
}

/// Состояние входа без самого пропуска.
#[tauri::command]
pub fn animori_auth_status(app: AppHandle) -> Result<AuthStatus, String> {
    read_status(&app)
}

/// Выход: чистит только свои два ключа. Остальные настройки человек вводил сам, и терять их при выходе из аккаунта незачем.
#[tauri::command]
pub fn animori_auth_logout(app: AppHandle) -> Result<AuthStatus, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(KEY_TOKEN);
    store.delete(KEY_EXPIRES_AT);
    store.save().map_err(|e| e.to_string())?;

    let status = read_status(&app)?;

    if let Err(e) = app.emit(EVENT_CHANGED, status.clone()) {
        log::warn!("Событие о выходе не разошлось: {e}");
    }

    log::info!("Выход из аккаунта AniList");
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::{
        alive, authorize_url, check_token, decode, forget_nonce, fresh_nonce, param, relay_url,
        remember_nonce, state_matches, EXPIRY_MARGIN_SECS,
    };

    #[test]
    fn token_length_bounds() {
        assert!(check_token("").is_err());
        assert!(check_token(&"a".repeat(23)).is_err());
        assert!(check_token(&"a".repeat(24)).is_ok());
        assert!(check_token(&"a".repeat(8192)).is_ok());
        assert!(check_token(&"a".repeat(8193)).is_err());
    }

    #[test]
    fn token_shape_and_trim() {
        let valid = "a".repeat(24);

        // Копипаста тащит пробелы по краям — они срезаются.
        let pasted = check_token(&format!("  {valid}  ")).ok();
        assert_eq!(pasted.as_deref(), Some(valid.as_str()));

        // Пробел или слеш внутри — пришёл адрес или кусок страницы, не пропуск.
        let with_space = format!("{} {}", "a".repeat(12), "b".repeat(11));
        assert!(check_token(&with_space).is_err());
        let with_slash = format!("{}/{}", "a".repeat(12), "b".repeat(11));
        assert!(check_token(&with_slash).is_err());
        // Не-ASCII отсекается по символам, не по длине.
        assert!(check_token(&format!("{}я", "a".repeat(23))).is_err());
    }

    #[test]
    fn query_params_are_decoded() {
        assert_eq!(param("code=abc&state=xyz", "state").as_deref(), Some("xyz"));
        assert_eq!(param("state=a%20b", "state").as_deref(), Some("a b"));
        assert_eq!(param("state=a+b", "state").as_deref(), Some("a b"));
        assert_eq!(param("code=abc", "state"), None);

        // Битая кодировка не роняет разбор: процент остаётся процентом.
        assert_eq!(decode("%zz"), "%zz");
        assert_eq!(decode("100%"), "100%");
    }

    #[test]
    fn relay_url_matches_anilist_client() {
        // Ровно строка из консоли разработчика AniList — менять нельзя.
        assert_eq!(relay_url(), "http://127.0.0.1:48513/relay");
    }

    #[test]
    fn authorize_url_passes_state() {
        let url = authorize_url("nonce123");
        assert!(url.starts_with("https://anilist.co/api/v2/oauth/authorize?"));
        assert!(url.contains("client_id=48513"));
        assert!(url.contains("response_type=token"));
        assert!(url.ends_with("&state=nonce123"));
    }

    #[test]
    fn nonce_lifecycle() {
        // Один тест на весь цикл: NONCE — состояние модуля, другие тесты его не трогают.
        assert!(!state_matches(Some("рано")));
        remember_nonce("nonce1").expect("мьютекс доступен");
        assert!(state_matches(Some("nonce1")));
        assert!(!state_matches(Some("чужой")));
        assert!(!state_matches(None));
        forget_nonce();
        assert!(!state_matches(Some("nonce1")));
    }

    #[test]
    fn fresh_nonce_is_lowercase_hex() {
        let nonce = fresh_nonce().expect("случайность доступна");
        assert_eq!(nonce.len(), 32);
        assert!(nonce
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)));
    }

    #[test]
    fn expiry_margin_is_enforced() {
        let now = 1_000_000u64;

        // Жив, пока запаса больше минуты; ровно минута и меньше — уже истёк.
        assert!(alive(Some(now + EXPIRY_MARGIN_SECS + 1), Some(now)));
        assert!(!alive(Some(now + EXPIRY_MARGIN_SECS), Some(now)));
        assert!(!alive(Some(now + 30), Some(now)));
        assert!(!alive(Some(now - 1), Some(now)));

        // Срок или часы неизвестны — верим пропуску (ручная вставка, сбитые часы).
        assert!(alive(None, Some(now)));
        assert!(alive(Some(now + 30), None));
        assert!(alive(None, None));
    }
}
