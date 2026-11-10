// Главное окно приложения грузит СВОЮ сборку (dist/app), а не чужой сайт. Раньше рядом жил запасной вид: настоящий anilist.co со внедрённым бандлом скрипта во втором окне.

use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

// Авторизация окна у прокси. Только Windows: целиком событие WebView2.
#[cfg(windows)]
mod proxy_auth;

// Вход в аккаунт AniList отдельным окном.
mod auth;

// Запросы к API из процесса оболочки. Без cfg: запрос из Rust одинаков на всех платформах, в отличие от прокси для окна.
mod anilist;

// Дубль снимка в файл приватного каталога. Без cfg: работа с файлом одинакова везде, а на Android она нужнее всего.
mod files;

// Чтение и запись настроек окна. Файл у разметки не отдан: закрытые ключи команда не выдаёт.
mod storage;

// Выгрузка списка в папку, выбранную человеком. Отдельно от files.rs: там служебный каталог и список из трёх имён, здесь чужая папка и родное окно выбора.
mod export;

mod updater;

// Прокси для трафика окна. Без cfg сознательно: чтение настроек одинаково везде, разница в применении спрятана внутри модуля.
mod proxy;

// Хранилище секретов (SecretStore): пропуски и пароль прокси шифром DPAPI. Окно их не видит.
mod secrets;

// Запросы окна к внешним API (IBridge.http): прокси с паролем собирает Rust, адрес сверяется со списком hosts.rs.
mod hosts;
mod net;

// Облачная копия: пропуск Яндекс Диска читается и подставляется только здесь.
mod cloud;

/// Что запоминается между запусками. Не StateFlags::all(): сохранённый VISIBLE даёт запуск без единого окна, а из FULLSCREEN в окне без меню нечем выйти.
fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

/// Перезагружает окно, из которого пришёл вызов. Окно приходит параметром, а не ищется по метке: окон по-прежнему два — своё и окно входа, — и перезагружать надо то, откуда просили.
#[tauri::command]
fn animori_reload(window: WebviewWindow) -> Result<(), String> {
    window.reload().map_err(|e| e.to_string())
}

/// Перезапускает приложение. Нужна там, где перезагрузки страницы мало.
#[tauri::command]
fn animori_restart(app: AppHandle) -> Result<(), String> {
    log::info!("Перезапуск приложения по просьбе окна");
    app.restart()
}

/// Переключает полноэкранный режим окна и возвращает новое состояние: без него его пришлось бы спрашивать вторым вызовом после каждого нажатия.
#[tauri::command]
fn animori_toggle_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    let next = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}

/// Открывает адрес в браузере по умолчанию. В WebView2 target="_blank" и window.open() превращаются в запрос нового окна, и без обработчика он отбрасывается МОЛЧА.
#[tauri::command]
fn animori_open_external(app: AppHandle, url: String) -> Result<(), String> {
    let validated = net::validate_external_url(&url)?;
    app.opener()
        .open_url(validated.as_str(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Открывает системную панель трансляции экрана и больше ничего: выбор приёмника делает человек, и чем он кончился, система не сообщает никому.
#[tauri::command]
fn animori_cast_panel(app: AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        const PANELS: [&str; 2] = [
            "ms-settings-connectabledevices:devicediscovery",
            "ms-settings:connecteddevices",
        ];

        let mut reasons: Vec<String> = Vec::new();

        for uri in PANELS.iter().copied() {
            match app.opener().open_url(uri, None::<&str>) {
                Ok(()) => {
                    // Какая из двух открылась — видно только здесь, а разница в жалобах «открылось не то» решает всё.
                    log::info!("Панель трансляции открыта: {uri}");
                    return Ok(());
                }
                Err(e) => reasons.push(format!("{uri}: {e}")),
            }
        }

        let first = PANELS[0];
        let why = reasons.join("; ");

        // Последний заход. Тот же адрес по нажатию в самой Windows открывает проводник, и там, где плагин отказал, панель иногда всё равно появляется.
        match std::process::Command::new("explorer.exe")
            .arg(first)
            .spawn()
        {
            Ok(_) => {
                log::warn!("Панель трансляции: плагин отказал ({why}), отдано проводнику: {first}");
                Ok(())
            }
            Err(second) => Err(format!(
                "Панель трансляции не открылась: {why}; проводник: {second}"
            )),
        }
    }

    #[cfg(not(windows))]
    {
        // Параметр не убран из подписи: команда одна на все платформы, и разные подписи сломали бы generate_handler! под cfg.
        let _ = app;
        Err("Панель трансляции экрана есть только в Windows".to_string())
    }
}

/// Открывает консоль WebView2 отдельным окном: в установленном приложении F12 не работает, а журнал отладки
/// не показывает то, что движок печатает мимо него. Команда одна на все платформы — иначе generate_handler!.
#[tauri::command]
fn animori_devtools(window: WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        window
            .with_webview(|webview| {
                // Панель открывает ядро WebView2, а не контроллер: у контроллера в этой версии обёртки метода нет,
                // и HRESULT молчит — без проверки кнопка выглядела бы рабочей.
                let controller = webview.controller();
                unsafe {
                    if let Ok(core) = controller.CoreWebView2() {
                        let _ = core.OpenDevToolsWindow();
                    }
                }
            })
            .map_err(|e| e.to_string())
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        Err("Консоль разработчика есть только в Windows".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(anilist::AniListClientState::default())
        .manage(net::NetClientState::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        // Шифр секретов. На Windows пустышка (DPAPI зовётся напрямую), на Android — Keystore.
        .plugin(secrets::plugin("com.foulnike.animori"))
        // Плагин HTTP окну больше не выдан: запросы окна идут командой net.rs, крейт нужен ради reqwest.
        // Плагин открывает адреса в системных приложениях и нужен только со стороны Rust: opener:allow-open-url, выданный окну, открыл бы что угодно любому коду в нём.
        .plugin(tauri_plugin_opener::init())
        // Память геометрии окон. Регистрация именно в цепочке Builder, а не в setup(): плагины оттуда поднимаются ДО setup, а окно создаётся внутри него.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags())
                .build(),
        )
        // Родные окна системы. Потребителей теперь два: автообновление (обоснования — в updater.rs) и выбор папки для выгрузки списка и для трека темы (export.rs).
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Список команд дублируется в build.rs и в файлах capabilities: разрешено ровно то, что перечислено в capability нужного окна.
        .invoke_handler(tauri::generate_handler![
            animori_reload,
            animori_restart,
            animori_toggle_fullscreen,
            animori_open_external,
            animori_cast_panel,
            animori_devtools,
            auth::animori_auth_start,
            auth::animori_auth_submit,
            auth::animori_auth_status,
            auth::animori_auth_logout,
            anilist::animori_anilist_query,
            net::animori_http_request,
            cloud::animori_cloud_status,
            cloud::animori_cloud_connect,
            cloud::animori_cloud_delete,
            cloud::animori_cloud_check,
            cloud::animori_cloud_stat,
            cloud::animori_cloud_save,
            cloud::animori_cloud_restore,
            cloud::animori_cloud_share,
            cloud::animori_cloud_unshare,
            files::animori_file_read,
            files::animori_file_write,
            storage::animori_storage_read,
            storage::animori_storage_write,
            export::animori_export_pick_dir,
            export::animori_export_write,
            export::animori_track_pick_dir,
            export::animori_track_write,
            proxy::animori_proxy_status,
            proxy::animori_proxy_probe,
            proxy::animori_proxy_password_status,
            proxy::animori_proxy_password_set
        ])
        .setup(|app| {
            let log_level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                log::LevelFilter::Warn
            };

            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .rotation_strategy(RotationStrategy::KeepOne)
                    .timezone_strategy(TimezoneStrategy::UseLocal)
                    .max_file_size(2_000_000)
                    .targets([Target::new(TargetKind::LogDir { file_name: None })])
                    .build(),
            )?;

            // Открытые секреты прежних сборок — в шифр сразу, в фоне.
            secrets::spawn_migration(app.handle().clone());

            // движок читает аргументы один раз, на первом окне. Первым идёт свое окно, окно входа открывается позже и пользуется тем же окружением.
            proxy::apply_to_webview(app.handle());

            // Свое окно: WebviewUrl::default() — это index.html из frontendDist, то есть наша сборка dist/app.
            // Панель разработчика включена явно: в установленном приложении F12 не работает.
            WebviewWindowBuilder::new(app.handle(), "main", WebviewUrl::default())
                .title("AniMori")
                .inner_size(1280.0, 800.0)
                .min_inner_size(1024.0, 600.0)
                .resizable(true)
                .center()
                .devtools(true)
                .build()?;

            // Проверка обновлений — последним шагом и только фоновой задачей: запрос прямо здесь задержал бы окно на ответ GitHub, а при мёртвой сети — на весь таймаут.
            updater::spawn_check(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
