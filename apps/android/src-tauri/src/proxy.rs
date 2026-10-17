// Прокси для канала САМОГО ОКНА; наши запросы к API идут мимо, через TauriBridge.ts. Окно через прокси НЕ идёт — см. decide(): здесь движку адрес не передаётся, а запросам приложения прокси настраивает anilist.rs.

use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;

/// То же имя, что у storage.rs и auth.rs: файл один на все стороны.
const STORE_FILE: &str = "animori-settings.json";

/// Проверка идёт в setup() и задерживает появление окна; местному прокси хватает.
const PROBE_TIMEOUT_MS: u64 = 500;

/// По кнопке щедрее: удалённый прокси отвечает за секунду и зря счёлся бы мёртвым.
const PROBE_TIMEOUT_MANUAL_MS: u64 = 2000;

/// У to_socket_addrs() своего таймаута нет: при мёртвом DNS setup() висит десятки секунд без единого окна на экране.
const RESOLVE_TIMEOUT_MS: u64 = 700;

// Ключи повторяют PROXY_KEYS из packages/core/src/core/proxy.ts: Rust к модулям TypeScript не ходит.
const KEY_ENABLED: &str = "set_proxy_on";
const KEY_KIND: &str = "set_proxy_kind";
const KEY_HOST: &str = "set_proxy_host";
const KEY_PORT: &str = "set_proxy_port";
const KEY_LOGIN: &str = "set_proxy_login";

/// Applied значит лишь «движок получил адрес»: пускающий соединение, но не наружу, прокси TCP-щуп не отличит. WindowUnsupported разведён с Unreachable нарочно.
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProxyOutcome {
    Off,
    Invalid,
    Unreachable,
    WindowUnsupported,
    Applied,
}

/// Как окно живёт с авторизацией у прокси. На этой платформе окно через прокси не ходит
/// (см. decide()), поэтому состояние всегда None; тип сохранён — контракт с панелью общий.
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProxyAuth {
    None,
}

/// Что действует в окне прямо сейчас. Снимок делается один раз, при запуске.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStatus {
    outcome: ProxyOutcome,
    /// Пусто для всех исходов, кроме Applied.
    server: String,
    /// По этому полю панель объясняет разницу в поведении окна и наших запросов.
    has_credentials: bool,
    /// Панель показывает подпись «логин задан»; авторизации окна здесь нет — всегда none.
    auth: ProxyAuth,
}

/// Ответ про то, что записано в настройках СЕЙЧАС, а не про снимок запуска.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyProbe {
    /// Здесь Applied читается как «отвечает и был бы применён при следующем запуске».
    outcome: ProxyOutcome,
    server: String,
    has_credentials: bool,
    /// Ноль, когда до щупа дело не дошло.
    latency_ms: u64,
}

/// Состояние живёт в приложении: команда status вызывается из окна, а окно про setup() не знает. Mutex — требование Tauri, запись всё равно одна.
pub struct ProxyState(Mutex<ProxyStatus>);

/// Разобранная настройка в том виде, в каком её принимает проверка связи и панель.
struct ProxyArgs {
    /// Адрес без схемы и порт отдельно: только так их принимает проверка связи.
    host: String,
    port: u16,
    /// Схема://хост:порт — отдаётся панели как есть.
    server: String,
    /// Влияет на предупреждение в журнале и на подпись в панели.
    has_credentials: bool,
}

/// Три состояния файла настроек: Option не отличал «выключен» от «включён, но задан негодно», а панели надо сказать про них разное.
enum Config {
    Off,
    Invalid,
    On(Box<ProxyArgs>),
}

/// Числа тоже принимаются: файл настроек правят руками, и адрес запросто окажется числом, а порт — строкой.
fn read_string(value: Option<serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::String(s)) => s.trim().to_string(),
        Some(serde_json::Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

/// Ноль означает «значения нет», как и в normalizeProxyPort() из packages/core/src/core/proxy.ts: трактовка обязана совпадать.
fn read_port(value: Option<serde_json::Value>) -> u16 {
    let parsed = match value {
        Some(serde_json::Value::Number(n)) => n.as_u64().unwrap_or(0),
        Some(serde_json::Value::String(s)) => s.trim().parse::<u64>().unwrap_or(0),
        _ => 0,
    };

    if parsed == 0 || parsed > 65535 {
        0
    } else {
        parsed as u16
    }
}

/// Разбор уезжает в поток, потому что таймаут резольверу не навязать; брошенный поток ничего не держит и дешевле зависшего без окна приложения.
fn resolve_with_timeout(target: &str, timeout: Duration) -> Option<Vec<SocketAddr>> {
    let (tx, rx) = std::sync::mpsc::channel();
    let owned = target.to_string();

    std::thread::spawn(move || {
        let resolved = owned.to_socket_addrs().map(|it| it.collect::<Vec<_>>());
        // Ошибка отправки значит лишь, что ожидающая сторона уже сдалась по таймауту.
        let _ = tx.send(resolved);
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(addrs)) => Some(addrs),
        Ok(Err(e)) => {
            log::warn!("Прокси: не удалось разобрать адрес {target}: {e}");
            None
        }
        Err(_) => {
            log::warn!("Прокси: разбор адреса {target} не уложился в отведённое время");
            None
        }
    }
}

/// Самая грубая проверка: открылось ли TCP-соединение. Цель не «работает ли прокси», а отсечь опечатки и выключенные клиенты, оставляющие окно пустым.
fn probe(host: &str, port: u16, timeout_ms: u64) -> (bool, u64) {
    let target = format!("{host}:{port}");
    let started = Instant::now();

    let Some(addrs) = resolve_with_timeout(&target, Duration::from_millis(RESOLVE_TIMEOUT_MS))
    else {
        return (false, started.elapsed().as_millis() as u64);
    };

    // Имя может дать IPv6 и IPv4: достаточно любого ответившего, как и у движка.
    let ok = addrs
        .iter()
        .any(|addr| TcpStream::connect_timeout(addr, Duration::from_millis(timeout_ms)).is_ok());

    (ok, started.elapsed().as_millis() as u64)
}

/// Читает настройку прокси из файла настроек.
fn read_config(app: &AppHandle) -> Config {
    // Без файла настроек работаем напрямую, но молчать нельзя (инвариант 4).
    let store = match app.store(STORE_FILE) {
        Ok(store) => store,
        Err(e) => {
            log::warn!("Не удалось открыть файл настроек для чтения прокси: {e}");
            return Config::Off;
        }
    };

    let enabled = matches!(store.get(KEY_ENABLED), Some(serde_json::Value::Bool(true)));
    if !enabled {
        return Config::Off;
    }

    let host = read_string(store.get(KEY_HOST));
    let port = read_port(store.get(KEY_PORT));

    if host.is_empty() || port == 0 {
        // Человек видит включённый тумблер и считает, что трафик идёт через прокси.
        log::warn!("Прокси включён, но адрес или порт заданы неверно — окно идёт напрямую");
        return Config::Invalid;
    }

    // Неизвестное значение трактуется как http, как и в normalizeProxyKind().
    let scheme = if read_string(store.get(KEY_KIND)) == "socks5" {
        "socks5"
    } else {
        "http"
    };

    // Логин читается только для подписи «логин задан» в панели: окно через прокси не ходит,
    // подставлять учётные данные движку здесь нечем и незачем.
    let login = read_string(store.get(KEY_LOGIN));

    Config::On(Box::new(ProxyArgs {
        server: format!("{scheme}://{host}:{port}"),
        host,
        port,
        has_credentials: !login.is_empty(),
    }))
}

/// Вызывается ОДИН раз, в начале setup() и до создания окна. Состояние заводится здесь же: его нельзя забыть, и команда status найдёт готовый ответ.
pub fn apply_to_webview(app: &AppHandle) {
    let status = decide(app);
    app.manage(ProxyState(Mutex::new(status)));
}

fn decide(app: &AppHandle) -> ProxyStatus {
    let args = match read_config(app) {
        Config::Off => {
            return ProxyStatus {
                outcome: ProxyOutcome::Off,
                server: String::new(),
                has_credentials: false,
                auth: ProxyAuth::None,
            }
        }
        Config::Invalid => {
            return ProxyStatus {
                outcome: ProxyOutcome::Invalid,
                server: String::new(),
                has_credentials: false,
                auth: ProxyAuth::None,
            }
        }
        Config::On(args) => args,
    };

    // Страховка от кирпича: с мёртвым адресом вместе с сайтом пропадает панель настроек — единственный способ выключить прокси обратно.
    let (reachable, _) = probe(&args.host, args.port, PROBE_TIMEOUT_MS);
    if !reachable {
        log::warn!(
            "Прокси {} не отвечает — окно идёт напрямую. \
             Настройка не сброшена: исправьте адрес или выключите прокси в настройках",
            args.server
        );
        return ProxyStatus {
            outcome: ProxyOutcome::Unreachable,
            server: args.server,
            has_credentials: args.has_credentials,
            auth: ProxyAuth::None,
        };
    }

    // Не Applied: адрес движку никто не отдавал. И не Unreachable: щуп до адреса достучался, а «не ответил» сказало бы неправду. Беда не в адресе, а в платформе.
    log::warn!("Прокси для окна здесь не поддерживается — страница идёт напрямую, запросы приложения ходят через прокси сами");
    ProxyStatus {
        outcome: ProxyOutcome::WindowUnsupported,
        server: args.server,
        has_credentials: args.has_credentials,
        auth: ProxyAuth::None,
    }
}

/// Что действует в окне прямо сейчас: в сеть команда не ходит, адрес неизменен до перезапуска.
#[tauri::command]
pub fn animori_proxy_status(state: State<'_, ProxyState>) -> ProxyStatus {
    // Отравленный мьютекс не повод отказывать: внутри структура без инвариантов.
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    guard.clone()
}

/// Перечитывает файл ЗАНОВО: смысл кнопки — проверить только что введённый адрес. spawn_blocking обязателен: чтение, разбор имени и соединение блокируют поток.
#[tauri::command]
pub async fn animori_proxy_probe(app: AppHandle) -> Result<ProxyProbe, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let args = match read_config(&app) {
            Config::Off => {
                return ProxyProbe {
                    outcome: ProxyOutcome::Off,
                    server: String::new(),
                    has_credentials: false,
                    latency_ms: 0,
                }
            }
            Config::Invalid => {
                return ProxyProbe {
                    outcome: ProxyOutcome::Invalid,
                    server: String::new(),
                    has_credentials: false,
                    latency_ms: 0,
                }
            }
            Config::On(args) => args,
        };

        let (reachable, latency_ms) = probe(&args.host, args.port, PROBE_TIMEOUT_MANUAL_MS);

        ProxyProbe {
            outcome: if reachable {
                ProxyOutcome::Applied
            } else {
                ProxyOutcome::Unreachable
            },
            server: args.server,
            has_credentials: args.has_credentials,
            latency_ms,
        }
    })
    .await
    .map_err(|e| format!("Проверка прокси не завершилась: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{read_port, read_string};

    fn str_value(raw: &str) -> Option<serde_json::Value> {
        Some(serde_json::Value::String(raw.to_string()))
    }

    #[test]
    fn strings_are_trimmed_and_numbers_stringified() {
        assert_eq!(read_string(str_value("  10.0.0.1  ")), "10.0.0.1");
        assert_eq!(read_string(Some(serde_json::json!(8080))), "8080");
        assert_eq!(read_string(Some(serde_json::Value::Bool(true))), "");
        assert_eq!(read_string(None), "");
    }

    #[test]
    fn port_bounds_match_normalize_proxy_port() {
        assert_eq!(read_port(Some(serde_json::json!(8080))), 8080);
        assert_eq!(read_port(str_value(" 8080 ")), 8080);
        assert_eq!(read_port(Some(serde_json::json!(65535))), 65535);
        assert_eq!(read_port(Some(serde_json::json!(0))), 0);
        assert_eq!(read_port(Some(serde_json::json!(65536))), 0);
        assert_eq!(read_port(str_value("65536")), 0);
        assert_eq!(read_port(str_value("не число")), 0);
        assert_eq!(read_port(Some(serde_json::json!(-1))), 0);
        assert_eq!(read_port(None), 0);
    }
}
