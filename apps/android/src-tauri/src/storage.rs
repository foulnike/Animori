// Настройки окна: прямого доступа к файлу у разметки нет, всё идёт этими двумя командами.

use std::collections::HashMap;

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::secrets;

/// Тот же файл, что у auth.rs и proxy.rs: второе хранилище разошлось бы с первым.
const STORE_FILE: &str = "animori-settings.json";

/// Пропуск и срок его жизни: читает и пишет их только Rust.
const CLOSED_KEYS: &[&str] = &["auth_token", "auth_expires_at"];

/// Ключ облака: шифруется через DPAPI, читается обратно прозрачно.
const CLOUD_KEY: &str = "am_cloud_token";

/// Расшифровывает значение для окна; секрет остаётся на диске шифром.
/// Не расшифровалось (чужая машина, битый файл) — отдаём пусто, а не роняем весь снимок настроек.
fn read_for_window(key: &str, value: serde_json::Value) -> serde_json::Value {
    if key == CLOUD_KEY {
        if let Some(stored) = value.as_str() {
            if let Some(res) = secrets::unprotect(stored) {
                return match res {
                    Ok(text) => serde_json::Value::String(text),
                    Err(e) => {
                        log::warn!(
                            "Пропуск облака не расшифрован ({e}) — потребуется повторный вход."
                        );
                        serde_json::Value::String(String::new())
                    }
                };
            }
        }
    }
    value
}

/// Снимок файла настроек без закрытых ключей одним вызовом.
#[tauri::command]
pub fn animori_storage_read(app: AppHandle) -> Result<HashMap<String, serde_json::Value>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let mut out = HashMap::new();
    for (key, value) in store.entries() {
        if CLOSED_KEYS.contains(&key.as_str()) {
            continue;
        }
        out.insert(key.clone(), read_for_window(&key, value));
    }
    Ok(out)
}

/// Пишет значение и сразу выгружает файл на диск.
#[tauri::command]
pub fn animori_storage_write(
    app: AppHandle,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    if CLOSED_KEYS.contains(&key.as_str()) {
        return Err(format!("Ключ закрыт для окна: {key}"));
    }

    let value = if key == CLOUD_KEY {
        match value.as_str() {
            Some(s) if !s.is_empty() => serde_json::Value::String(secrets::protect(s)?),
            _ => value,
        }
    } else {
        value
    };

    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(key, value);
    store.save().map_err(|e| e.to_string())
}
