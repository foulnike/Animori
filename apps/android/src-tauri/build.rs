// Собственные команды требуют разрешения в ACL Tauri: без объявления здесь такого нет, и JS падает с "Plugin not found". Места три: invoke_handler, COMMANDS, permissions.

const COMMANDS: &[&str] = &[
    "animori_reload",
    // Перезапуск приложения. Параметров нет и быть не может: команда лишь повторяет запуск
    // с тем, что уже лежит в настройках.
    "animori_restart",
    "animori_open_external",
    // Вход в AniList. Все четыре выданы только своему окну: оно лишь показывает чужую форму, а пропуск приезжает в приёмник обычным запросом.
    "animori_auth_start",
    "animori_auth_submit",
    "animori_auth_status",
    "animori_auth_logout",
    // Запрос к AniList из процесса оболочки. Адрес зашит, параметры — только тело запроса и признак авторизации: пропуск в разметку не отдаётся.
    "animori_anilist_query",
    // Дубль снимка в файл приватного каталога. Имя файла проверяется по списку в files.rs, каталог выбирает сама оболочка.
    "animori_file_read",
    "animori_file_write",
    // Настройки окна: вместо плагина store в разметке, закрытые ключи в ответ не попадают.
    "animori_storage_read",
    "animori_storage_write",
    // Выгрузка списка в папку, выбранную человеком. Окно выбора открывает сам Rust: разрешение dialog разметке не выдано и не будет.
    "animori_export_pick_dir",
    "animori_export_write",
    // Диагностика прокси. Обе только читают, и ни одна не принимает адрес параметром — иначе код в окне получил бы сканер портов чужими руками.
    "animori_proxy_status",
    "animori_proxy_probe",
];

fn main() {
    // Смена иконки должна пересобирать артефакт: при сборке под Windows (dev-прогон на столе,
    // CI-хост) tauri-build пишет в .rc строку `32512 ICON "icons/icon.ico"`. Под Android
    // картинку берёт gradle — строка здесь безвредна и держит пару с windows build.rs.
    println!("cargo:rerun-if-changed=icons/icon.ico");

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build")
}
