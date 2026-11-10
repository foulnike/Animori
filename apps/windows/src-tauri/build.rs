// Правка по итогам первого живого запуска. Собственные команды приложения требуют разрешения в ACL Tauri. Без объявления здесь такого разрешения вообще не существует.

const COMMANDS: &[&str] = &[
    "animori_reload",
    // Перезапуск приложения. Параметров нет и быть не может: команда ничего не настраивает, а повторяет запуск с тем, что уже лежит в настройках.
    "animori_restart",
    // Полноэкранный режим окна. Параметров нет: только переключение туда-обратно, чтобы код в окне не мог запереть его в полном экране повторными вызовами.
    "animori_toggle_fullscreen",
    "animori_open_external",
    // Картинка в картинке движку по силам самому, а отдать поток устройству — нет: приёмника трансляции в WebView2 нет.
    "animori_cast_panel",
    // Консоль WebView2 отдельным окном. Параметров нет: панель открывает тот, кто зовёт, и разговаривать ей не о чем.
    "animori_devtools",
    // Вход в AniList. Все четыре выданы только своему окну: окно входа ничего не вызывает, оно лишь показывает чужую форму, а пропуск приезжает в приёмник обычным запросом.
    "animori_auth_start",
    "animori_auth_submit",
    "animori_auth_status",
    "animori_auth_logout",
    // Запрос к AniList из процесса оболочки. Адрес зашит, параметры — только тело запроса и признак авторизации: пропуск в разметку не отдаётся.
    "animori_anilist_query",
    // Запрос окна к внешнему API. Адрес сверяется со списком hosts.rs до сети; прокси и его пароль подставляет Rust.
    "animori_http_request",
    // Облачная копия: один файл в папке приложения, пропуск окну не отдаётся ни одной командой.
    "animori_cloud_status",
    "animori_cloud_connect",
    "animori_cloud_delete",
    "animori_cloud_check",
    "animori_cloud_stat",
    "animori_cloud_save",
    "animori_cloud_restore",
    "animori_cloud_share",
    "animori_cloud_unshare",
    // Дубль снимка в файл приватного каталога. Имя файла проверяется по списку в files.rs, каталог выбирает сама оболочка.
    "animori_file_read",
    "animori_file_write",
    // Настройки окна: вместо плагина store в разметке, закрытые ключи в ответ не попадают.
    "animori_storage_read",
    "animori_storage_write",
    // Выгрузка списка в папку, выбранную человеком. Окно выбора открывает сам Rust: разрешение dialog разметке не выдано и не будет.
    "animori_export_pick_dir",
    "animori_export_write",
    // Загрузка темы с AnimeThemes отдельным файлом. Пара своя, а не переиспользованная: выгрузка списка спрашивает папку однажды и пишет текст.
    "animori_track_pick_dir",
    "animori_track_write",
    // Диагностика прокси для карточки настроек. Обе только читают: status отдаёт снимок состояния, probe открывает TCP-соединение на адрес из файла настроек.
    "animori_proxy_status",
    "animori_proxy_probe",
    // Пароль прокси: только «задан ли» и запись. Прочитать пароль окно не может никакой командой.
    "animori_proxy_password_status",
    "animori_proxy_password_set",
];

fn main() {
    // Иконка окна попадает в EXE ресурсом Windows: tauri-build пишет в .rc строку `32512 ICON "icons/icon.ico"`, а компилятор ресурсов кладёт картинку внутрь исполняемого файла.
    println!("cargo:rerun-if-changed=icons/icon.ico");

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build")
}
