// Выгрузка списка файлом, который человек найдёт руками. Отдельна от files.rs: там приватный каталог, здесь чужая папка, а диалог выбора живёт в Rust.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, WebviewWindow};
// Выбор папки спрашивает только десктоп, на приставке свой файловый менеджер.
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;

/// Потолок записи в байтах. Тот же, что у files.rs: выгрузка списка на десять тысяч записей весит около мегабайта, восемь закрывают живые случаи с запасом.
const MAX_BYTES: usize = 8 * 1024 * 1024;

/// Разрешённое окончание имени. Выгрузка у нас одна — список в XML, и проверка расширения не даёт превратить команду в способ положить рядом что угодно.
const ALLOWED_SUFFIX: &str = ".xml";

/// Проверяет, что пришло именно имя файла, а не путь. Path::file_name отсекает всё, что похоже на путь, поэтому сравнение ловит и разделители, и «..».
fn check_shape(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 200 {
        return Err(format!("Имя файла не годится: {name}"));
    }

    if Path::new(name).file_name().and_then(|part| part.to_str()) != Some(name) {
        return Err(format!("Имя файла не разрешено: {name}"));
    }

    Ok(())
}

/// Имя файла выгрузки: общая проверка вида плюс единственное расширение.
fn check_name(name: &str) -> Result<(), String> {
    if !name.to_ascii_lowercase().ends_with(ALLOWED_SUFFIX) {
        return Err(format!("Выгрузка бывает только {ALLOWED_SUFFIX}: {name}"));
    }

    check_shape(name)
}

/// Проверяет папку: только существующий полный путь, никакого создания. Нет её — значит настройка устарела, и плодить каталоги молча нельзя.
fn check_dir(dir: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(dir);

    if !path.is_absolute() {
        return Err(format!("Путь папки не полный: {dir}"));
    }

    if !path.is_dir() {
        return Err(format!("Папка не найдена: {dir}"));
    }

    Ok(path)
}

/// Спрашивает папку родным окном. None — отмена не ошибка. blocking_pick_folder нельзя: он запрещён на главном потоке. Родительское окно иначе уводит выбор ЗА приложением.
async fn ask_folder(
    app: AppHandle,
    window: WebviewWindow,
    title: &'static str,
) -> Result<Option<String>, String> {
    #[cfg(desktop)]
    {
        let (tx, rx) = std::sync::mpsc::channel();

        app.dialog()
            .file()
            .set_parent(&window)
            .set_title(title)
            .pick_folder(move |picked| {
                // Отправка не дойдёт, если ждущая сторона уже ушла: это не беда.
                let _ = tx.send(picked);
            });

        // Ожидание уводится с потока среды: обратный вызов придёт неизвестно когда, а человек вправе смотреть на окно выбора сколько ему угодно.
        let picked = tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
            .await
            .map_err(|e| format!("Выбор папки не завершился: {e}"))?;

        let Some(found) = picked else {
            return Ok(None);
        };

        let path = found
            .into_path()
            .map_err(|e| format!("Папку не разобрать: {e}"))?;

        Ok(Some(path.to_string_lossy().into_owned()))
    }

    #[cfg(mobile)]
    {
        // Родного окна выбора папки на телевизоре нет. Параметры не убраны из подписи: разные подписи сломали бы generate_handler! под cfg.
        let _ = (app, window, title);
        Err("Выбор папки недоступен на телевизоре".to_string())
    }
}

/// Папка под выгрузки списка: спрашивается один раз и живёт в настройках.
#[tauri::command]
pub async fn animori_export_pick_dir(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Option<String>, String> {
    ask_folder(app, window, "Куда сохранять выгрузки AniMori").await
}

/// Пишет выгрузку в выбранную папку и возвращает полный путь: настройки показывают его человеку. Сначала во временный файл, потом переименованием.
#[tauri::command]
pub async fn animori_export_write(
    dir: String,
    name: String,
    text: String,
) -> Result<String, String> {
    if text.len() > MAX_BYTES {
        return Err(format!("Выгрузка слишком большая: {} байт", text.len()));
    }

    check_name(&name)?;

    tauri::async_runtime::spawn_blocking(move || {
        let path = check_dir(&dir)?.join(&name);
        let temp = path.with_extension("xml.tmp");

        fs::write(&temp, text.as_bytes()).map_err(|e| format!("Не записать файл: {e}"))?;
        fs::rename(&temp, &path).map_err(|e| format!("Не заменить файл: {e}"))?;

        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| format!("Запись выгрузки не завершилась: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::{check_dir, check_name, check_shape};

    #[test]
    fn shape_rejects_empty_and_oversize() {
        assert!(check_shape("").is_err());
        assert!(check_shape(&"x".repeat(201)).is_err());
        assert!(check_shape(&"x".repeat(200)).is_ok());
    }

    #[test]
    fn shape_rejects_paths_not_names() {
        // «..», «.» и «каталог/имя» — не имя файла: file_name не равен строке целиком.
        assert!(check_shape("..").is_err());
        assert!(check_shape(".").is_err());
        assert!(check_shape("dir/file.xml").is_err());
        assert!(check_shape("список.xml").is_ok());
    }

    #[test]
    fn export_name_needs_xml_suffix() {
        assert!(check_name("list.xml").is_ok());
        assert!(check_name("LIST.XML").is_ok());
        assert!(check_name("list.txt").is_err());
        // Суффикс в середине не считается: конец имени — это конец.
        assert!(check_name("list.xml.tmp").is_err());
        // Суффикс не спасает, если в имени путь.
        assert!(check_name("dir/list.xml").is_err());
    }

    #[test]
    fn dir_must_exist_and_be_absolute() {
        assert!(check_dir("relative/dir").is_err());
        assert!(check_dir("/нет/такого/каталога-animori").is_err());

        let tmp = std::env::temp_dir();
        let found = check_dir(tmp.to_str().expect("путь временного каталога"))
            .expect("существующий каталог проходит");
        assert_eq!(found, tmp);
    }
}
