// Главное окно грузит свою сборку (dist/app), а не чужой сайт. Метка «main» нужна capabilities/default.json, а окно создаётся здесь: способ создания один и в одном месте.

use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use tauri_plugin_opener::OpenerExt;

// Память геометрии окна: плагин десктопный, см. Cargo.toml.
#[cfg(desktop)]
use tauri_plugin_window_state::StateFlags;

use tauri::{AppHandle, WebviewWindow};
// Окно на телевизоре создаёт активность, а не мы: строитель окна и адрес содержимого нужны только там, где окно создаём сами.
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

// Вход в аккаунт AniList отдельным окном.
mod auth;

// Запросы к API из процесса оболочки. Без cfg: запрос из Rust одинаков на всех платформах, в отличие от прокси для окна.
mod anilist;

// Дубль снимка в файл приватного каталога. Без cfg: работа с файлом одинакова везде, а на Android она нужнее всего.
mod files;

// Чтение и запись настроек окна. Файл у разметки не отдан: закрытые ключи команда не выдаёт.
mod storage;

// Выгрузка списка в папку, выбранную человеком. Отдельно от files.rs: там служебный каталог, здесь чужая папка. Здесь же трек темы из карточки.
mod export;

// Прокси для трафика окна. Без cfg сознательно: чтение настроек везде одинаково, а разница в применении спрятана в модуле — на Linux будет предупреждение в журнале.
mod proxy;

// Секреты в хранилище: шифрация DPAPI для пропуска облака на Windows, прозрачный passthrough на прочих платформах.
mod secrets;

/// Что запоминается между запусками. Не StateFlags::all(): сохранённый VISIBLE даёт запуск без окна, а из FULLSCREEN нечем выйти. Флаги общие: это один параметр плагина.
#[cfg(desktop)]
fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

/// Перезагружает окно, из которого пришёл вызов: ищется по метке нельзя, окон два — своё и окно входа, — а перезагружать надо то, откуда просили.
#[tauri::command]
fn animori_reload(window: WebviewWindow) -> Result<(), String> {
    window.reload().map_err(|e| e.to_string())
}

/// Перезапускает приложение: перезагрузки страницы мало, когда изменениям нужно пройти через весь процесс, а не только через страницу.
#[tauri::command]
fn animori_restart(app: AppHandle) -> Result<(), String> {
    log::info!("Перезапуск приложения по просьбе окна");
    app.restart()
}

/// Открывает адрес в браузере по умолчанию. Схема проверяется здесь, а не на доверии к вызывающему: разметка не должна открыть что угодно.
#[tauri::command]
fn animori_open_external(app: AppHandle, url: String) -> Result<(), String> {
    let trimmed = url.trim();

    let lowered = trimmed.to_ascii_lowercase();
    if !(lowered.starts_with("https://") || lowered.starts_with("http://")) {
        return Err(format!("Схема адреса не разрешена: {trimmed}"));
    }

    // None во втором аргументе — «браузер по умолчанию».
    app.opener()
        .open_url(trimmed, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Мобильные плагины поднимаются отдельной переменной: память геометрии окна под Android отсутствует. Порядок важен: память должна восстановиться до setup.
    #[cfg(desktop)]
    let builder = tauri::Builder::default().plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(window_state_flags())
            .build(),
    );

    #[cfg(mobile)]
    let builder = tauri::Builder::default();

    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(anilist::AniListClientState::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        // Плагин открывает адреса в системных приложениях и нужен только со стороны Rust: opener:allow-open-url, выданный окну, открыл бы что угодно любому коду в нём.
        .plugin(tauri_plugin_opener::init())
        // Родные окна выбора папки для выгрузки и трека (export.rs). Дёргается только из Rust: dialog:default означал бы право открывать окна выбора без нашего ведома.
        .plugin(tauri_plugin_dialog::init())
        // Список команд дублируется в build.rs и в capabilities: пропуск любого из трёх мест даёт отказ "Plugin not found". Команды из модулей — с путём, иначе E0425.
        .invoke_handler(tauri::generate_handler![
            animori_reload,
            animori_restart,
            animori_open_external,
            auth::animori_auth_start,
            auth::animori_auth_submit,
            auth::animori_auth_status,
            auth::animori_auth_logout,
            anilist::animori_anilist_query,
            files::animori_file_read,
            files::animori_file_write,
            storage::animori_storage_read,
            storage::animori_storage_write,
            export::animori_export_pick_dir,
            export::animori_export_write,
            proxy::animori_proxy_status,
            proxy::animori_proxy_probe
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
                    // Stdout добавлен на время порта под Android TV: журнал в каталоге логов читается с компьютера только после остановки приложения.
                    .targets([
                        Target::new(TargetKind::LogDir { file_name: None }),
                        Target::new(TargetKind::Stdout),
                    ])
                    .build(),
            )?;

            // Контрольная строка журнала: если её нет в logs/AniMori.log, значит канал не работает и винить в молчании разметку нельзя.
            log::info!("оболочка: журнал поднят, diag готов");

            // Прокси — СТРОГО до первого окна: движок читает аргументы один раз. Здесь же заводится ProxyState, без которого animori_proxy_status не ответит.
            proxy::apply_to_webview(app.handle());

            // WebviewUrl::default() — index.html из frontendDist, наша сборка dist/app. На телевизере окно создаёт активность, метка «main» — её ждут capabilities.
            #[cfg(desktop)]
            {
                WebviewWindowBuilder::new(app.handle(), "main", WebviewUrl::default())
                    .title("AniMori")
                    .inner_size(1280.0, 800.0)
                    .min_inner_size(1024.0, 600.0)
                    .resizable(true)
                    .center()
                    .build()?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
