// Настройки окна: прямого доступа к файлу у разметки нет, всё идёт этими двумя командами.
// Секреты (пропуски и пароль прокси) окну не выдаются и не принимаются: их читают и пишут
// только команды Rust через secrets.rs.

use std::collections::HashMap;

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::secrets::{self, Secret};

/// Тот же файл, что у secrets.rs, auth.rs и proxy.rs: второе хранилище разошлось бы с первым.
const STORE_FILE: &str = secrets::STORE_FILE;

/// Служебные ключи, закрытые от окна помимо секретов: срок пропуска пишет только вход.
const CLOSED_KEYS: &[&str] = &["auth_expires_at"];

/// Закрыт ли ключ для окна: секрет или служебный.
fn closed(key: &str) -> bool {
    Secret::is_secret_key(key) || CLOSED_KEYS.contains(&key)
}

/// Снимок файла настроек без закрытых ключей одним вызовом.
#[tauri::command]
pub fn animori_storage_read(app: AppHandle) -> Result<HashMap<String, serde_json::Value>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let mut out = HashMap::new();
    for (key, value) in store.entries() {
        if closed(&key) {
            continue;
        }
        out.insert(key, value);
    }
    Ok(out)
}

/// Пишет значение и сразу выгружает файл на диск. Закрытый ключ — отказ без записи:
/// значение в текст ошибки не попадает, только имя ключа.
#[tauri::command]
pub fn animori_storage_write(
    app: AppHandle,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    if closed(&key) {
        return Err(format!("Ключ закрыт для окна: {key}"));
    }

    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(key, value);
    store.save().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::closed;

    #[test]
    fn secrets_and_service_keys_are_closed() {
        for key in [
            "auth_token",
            "auth_expires_at",
            "am_cloud_token",
            "set_proxy_pass",
        ] {
            assert!(closed(key), "{key} должен быть закрыт");
        }
    }

    #[test]
    fn ordinary_keys_are_open() {
        for key in [
            "set_proxy_login",
            "set_proxy_host",
            "am_cloud_place",
            "set_logger",
        ] {
            assert!(!closed(key), "{key} должен быть открыт");
        }
    }
}
