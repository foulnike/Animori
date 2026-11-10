// Секреты оболочки: единственное место, где они читаются и пишутся. Окно их не видит вовсе —
// ключи закрыты в storage.rs, а пользуются ими только команды Rust (вход, AniList, прокси, облако).
// Шифр: Windows — DPAPI текущего пользователя; Android — ключ AES-GCM в Android Keystore
// (SecretPlugin.kt, ключ не экспортируется). Логика (миграция, версии, отказы) отделена от файла
// и от шифра трейтами — иначе её не проверить тестом без Tauri и без платформы.
// Файл одинаков у трёх продуктов (KEPT_IN_SYNC в scripts/drift.mjs).
//
// Android: шифр зовёт Kotlin через главный поток и ждёт ответа. Звать read/write из главного
// потока нельзя — взаимная блокировка; поэтому всё, что шифрует, — async-команды.

use std::fmt;

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::{Store, StoreExt};

/// Тот же файл, что у остальных настроек: второе хранилище разошлось бы с первым при чистке руками.
pub const STORE_FILE: &str = "animori-settings.json";

/// Все секреты приложения. Перечисление, а не строки: опечатка в имени ключа не скомпилируется.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Secret {
    /// Пропуск AniList.
    AniListToken,
    /// Пропуск Яндекс Диска.
    CloudToken,
    /// Пароль прокси.
    ProxyPassword,
}

impl Secret {
    pub const ALL: [Secret; 3] = [
        Secret::AniListToken,
        Secret::CloudToken,
        Secret::ProxyPassword,
    ];

    /// Ключ в файле настроек. Имена прежние: старые файлы читаются без переименования.
    pub fn key(self) -> &'static str {
        match self {
            Secret::AniListToken => "auth_token",
            Secret::CloudToken => "am_cloud_token",
            Secret::ProxyPassword => "set_proxy_pass",
        }
    }

    /// Секретный ли ключ: по этому списку storage.rs закрывает их от окна.
    pub fn is_secret_key(key: &str) -> bool {
        Secret::ALL.iter().any(|s| s.key() == key)
    }
}

/// Отказ хранилища секретов. Тексты статичные: содержимое секрета сюда попасть не может
/// ни через сообщение, ни через Debug.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SecretError {
    /// Шифр платформы недоступен (Windows API отказал, ключа нет).
    Unavailable,
    /// Запись не расшифровывается: битый файл, чужая машина или чужой пользователь.
    Corrupted,
    /// Шифр формата, которого эта сборка не знает (запись из более новой версии).
    UnknownFormat,
    /// Файл настроек не открылся или не записался.
    Storage,
}

impl fmt::Display for SecretError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            SecretError::Unavailable => "секреты: шифр системы недоступен",
            SecretError::Corrupted => "секреты: запись не расшифрована — потребуется ввести заново",
            SecretError::UnknownFormat => "секреты: запись в неизвестном формате",
            SecretError::Storage => "секреты: файл настроек недоступен",
        })
    }
}

impl From<SecretError> for String {
    fn from(e: SecretError) -> String {
        e.to_string()
    }
}

/// Что лежит под ключами. Отдельный трейт ради тестов: настоящий Store требует живого приложения.
pub trait Backend {
    fn get(&self, key: &str) -> Option<serde_json::Value>;
    fn set(&self, key: &str, value: serde_json::Value);
    fn delete(&self, key: &str);
    fn save(&self) -> Result<(), SecretError>;
}

impl<R: Runtime> Backend for Store<R> {
    fn get(&self, key: &str) -> Option<serde_json::Value> {
        Store::get(self, key)
    }

    fn set(&self, key: &str, value: serde_json::Value) {
        Store::set(self, key, value)
    }

    fn delete(&self, key: &str) {
        Store::delete(self, key);
    }

    fn save(&self) -> Result<(), SecretError> {
        Store::save(self).map_err(|e| {
            // Ошибка файла секрета не содержит: это путь и причина ввода-вывода.
            log::warn!("Секреты: файл настроек не записан: {e}");
            SecretError::Storage
        })
    }
}

/// Расшифрованное значение. stale — шифр прежней версии: прочитан, но его надо переписать.
pub struct Opened {
    pub plain: String,
    pub stale: bool,
}

/// Шифр платформы.
pub trait Cipher {
    /// Возвращает запись с префиксом версии.
    fn seal(&self, plain: &str) -> Result<String, SecretError>;
    /// None — запись не шифр (открытый текст прежних сборок). Some(Err) — шифр, но не читается.
    fn open(&self, stored: &str) -> Option<Result<Opened, SecretError>>;
}

/// Сырое значение из файла. Число принимается: файл правят руками, и пароль из цифр ляжет числом.
fn raw_value(value: Option<serde_json::Value>) -> Result<Option<String>, SecretError> {
    match value {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::String(s)) if s.is_empty() => Ok(None),
        Some(serde_json::Value::String(s)) => Ok(Some(s)),
        Some(serde_json::Value::Number(n)) => Ok(Some(n.to_string())),
        Some(_) => Err(SecretError::Corrupted),
    }
}

/// Перешифровка на место старой записи: открытый текст или старый шифр затираются новым.
fn reseal<B: Backend + ?Sized, C: Cipher>(
    backend: &B,
    cipher: &C,
    secret: Secret,
    plain: &str,
) -> Result<(), SecretError> {
    let sealed = cipher.seal(plain)?;
    backend.set(secret.key(), serde_json::Value::String(sealed));
    backend.save()
}

/// Чтение с миграцией. Перешифровать не удалось — значение всё равно отдаётся: человек не должен
/// терять вход из-за временного отказа шифра, а следующая попытка будет при следующем чтении.
pub fn read_in<B: Backend + ?Sized, C: Cipher>(
    backend: &B,
    cipher: &C,
    secret: Secret,
) -> Result<Option<String>, SecretError> {
    let Some(raw) = raw_value(backend.get(secret.key()))? else {
        return Ok(None);
    };

    let (plain, migrate) = match cipher.open(&raw) {
        Some(Ok(opened)) => (opened.plain, opened.stale),
        Some(Err(e)) => return Err(e),
        None => (raw, true),
    };

    if migrate {
        match reseal(backend, cipher, secret, &plain) {
            Ok(()) => log::info!("Секреты: {} переведён в текущий шифр", secret.key()),
            Err(e) => log::warn!("Секреты: {} не перешифрован ({e})", secret.key()),
        }
    }

    Ok(Some(plain))
}

/// Запись. Пустое значение — удаление: «пароль пустой» и «пароля нет» для всех потребителей одно.
pub fn write_in<B: Backend + ?Sized, C: Cipher>(
    backend: &B,
    cipher: &C,
    secret: Secret,
    plain: &str,
) -> Result<(), SecretError> {
    if plain.is_empty() {
        return delete_in(backend, secret);
    }
    reseal(backend, cipher, secret, plain)
}

pub fn delete_in<B: Backend + ?Sized>(backend: &B, secret: Secret) -> Result<(), SecretError> {
    backend.delete(secret.key());
    backend.save()
}

/// Есть ли значение. Без расшифровки: статусу окна сам секрет не нужен.
pub fn exists_in<B: Backend + ?Sized>(backend: &B, secret: Secret) -> bool {
    matches!(raw_value(backend.get(secret.key())), Ok(Some(_)))
}

fn open_store<R: Runtime>(app: &AppHandle<R>) -> Result<std::sync::Arc<Store<R>>, SecretError> {
    app.store(STORE_FILE).map_err(|e| {
        log::warn!("Секреты: файл настроек не открыт: {e}");
        SecretError::Storage
    })
}

// ==== контракт SecretStore для остальных модулей ====

pub fn read<R: Runtime>(app: &AppHandle<R>, secret: Secret) -> Result<Option<String>, SecretError> {
    let store = open_store(app)?;
    // Пустой ключ шифра не нужен: без записи отвечаем сразу, даже если шифр недоступен.
    if !exists_in(&*store, secret) {
        return Ok(None);
    }
    read_in(&*store, &platform::cipher(app)?, secret)
}

pub fn write<R: Runtime>(
    app: &AppHandle<R>,
    secret: Secret,
    plain: &str,
) -> Result<(), SecretError> {
    let store = open_store(app)?;
    if plain.is_empty() {
        return delete_in(&*store, secret);
    }
    write_in(&*store, &platform::cipher(app)?, secret, plain)
}

pub fn delete<R: Runtime>(app: &AppHandle<R>, secret: Secret) -> Result<(), SecretError> {
    delete_in(&*open_store(app)?, secret)
}

pub fn exists<R: Runtime>(app: &AppHandle<R>, secret: Secret) -> bool {
    open_store(app)
        .map(|store| exists_in(&*store, secret))
        .unwrap_or(false)
}

/// Миграция при запуске: каждый секрет читается один раз, и открытый текст прежних сборок
/// тут же заменяется шифром — не дожидаясь, пока его прочтёт какая-нибудь команда (пароль прокси
/// без логина не читал бы никто). Отдельный поток обязателен: на Android шифр ждёт главный поток.
pub fn spawn_migration<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn_blocking(move || {
        for secret in Secret::ALL {
            if let Err(e) = read(&app, secret) {
                log::warn!("Секреты: {} не проверен при запуске ({e})", secret.key());
            }
        }
    });
}

/// Плагин шифра. На Android регистрирует SecretPlugin.kt из пакета приложения; окну у плагина
/// нет ни одного разрешения, и его команды из разметки отклоняет ACL. На прочих ОС — пустышка.
pub fn plugin<R: Runtime>(android_package: &'static str) -> TauriPlugin<R> {
    tauri::plugin::Builder::new("animori-secrets")
        .setup(move |app, api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = api.register_android_plugin(android_package, "SecretPlugin")?;
                app.manage(platform::Keystore(handle));
            }
            #[cfg(not(target_os = "android"))]
            let _ = (app, api, android_package);
            Ok(())
        })
        .build()
}

#[cfg(target_os = "android")]
mod platform {
    use super::{Cipher, Opened, SecretError};
    use serde::Deserialize;
    use tauri::plugin::mobile::PluginInvokeError;
    use tauri::plugin::PluginHandle;
    use tauri::{AppHandle, Manager, Runtime, State};

    /// Метка шифра Keystore. Другая семья, чем enc: у DPAPI: файлы двух ОС не смешиваются.
    const V1: &str = "ks:v1:";
    const FAMILY: &str = "ks:";

    pub struct Keystore<R: Runtime>(pub PluginHandle<R>);

    pub struct KeystoreCipher<'a, R: Runtime>(State<'a, Keystore<R>>);

    #[derive(Deserialize)]
    struct Sealed {
        sealed: String,
    }

    #[derive(Deserialize)]
    struct Plain {
        plain: String,
    }

    /// Отказ Kotlin в закрытый набор. Текст отказа сюда не идёт: в нём может быть что угодно.
    fn map(e: PluginInvokeError) -> SecretError {
        match e {
            PluginInvokeError::InvokeRejected(r) if r.code.as_deref() == Some("corrupted") => {
                SecretError::Corrupted
            }
            _ => SecretError::Unavailable,
        }
    }

    impl<R: Runtime> KeystoreCipher<'_, R> {
        fn handle(&self) -> &PluginHandle<R> {
            let Keystore(handle) = self.0.inner();
            handle
        }
    }

    impl<R: Runtime> Cipher for KeystoreCipher<'_, R> {
        fn seal(&self, plain: &str) -> Result<String, SecretError> {
            let out: Sealed = self
                .handle()
                .run_mobile_plugin("seal", serde_json::json!({ "plain": plain }))
                .map_err(map)?;
            Ok(format!("{V1}{}", out.sealed))
        }

        fn open(&self, stored: &str) -> Option<Result<Opened, SecretError>> {
            let body = match stored.strip_prefix(V1) {
                Some(body) => body,
                // Шифр будущей версии или файл с Windows: за открытый текст не принимаем.
                None if stored.starts_with(FAMILY) || stored.starts_with("enc:") => {
                    return Some(Err(SecretError::UnknownFormat))
                }
                None => return None,
            };
            let opened = self
                .handle()
                .run_mobile_plugin::<Plain>("open", serde_json::json!({ "sealed": body }))
                .map(|p| Opened {
                    plain: p.plain,
                    stale: false,
                })
                .map_err(map);
            Some(opened)
        }
    }

    pub fn cipher<R: Runtime>(app: &AppHandle<R>) -> Result<KeystoreCipher<'_, R>, SecretError> {
        app.try_state::<Keystore<R>>()
            .map(KeystoreCipher)
            .ok_or(SecretError::Unavailable)
    }
}

#[cfg(windows)]
mod platform {
    use super::{Cipher, Opened, SecretError};
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine as _;
    use tauri::{AppHandle, Runtime};
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    /// Первая версия: только пропуск облака, без энтропии. Читается и сразу переписывается в v2.
    const V1: &str = "enc:v1:";
    /// Текущая: энтропия приложения — чужая программа того же пользователя, вызвав DPAPI
    /// без неё, запись не откроет.
    const V2: &str = "enc:v2:";
    /// Общая приставка семейства: запись с ней не бывает открытым текстом.
    const FAMILY: &str = "enc:";
    const ENTROPY: &[u8] = b"AniMori/secrets/v2";
    /// CRYPTPROTECT_UI_FORBIDDEN: без окон системы — их некому показать из фонового вызова.
    const UI_FORBIDDEN: u32 = 0x1;

    fn blob(bytes: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        }
    }

    /// Копирует ответ Windows и сразу отдаёт память системе.
    fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        if out.pbData.is_null() {
            return Vec::new();
        }
        unsafe {
            let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
            LocalFree(Some(HLOCAL(out.pbData as _)));
            bytes
        }
    }

    pub(super) fn protect(plain: &[u8], entropy: Option<&[u8]>) -> Result<Vec<u8>, SecretError> {
        let input = blob(plain);
        let extra = entropy.map(blob);
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(
                &input,
                None,
                extra.as_ref().map(|e| e as *const _),
                None,
                None,
                UI_FORBIDDEN,
                &mut out,
            )
        }
        .map_err(|_| SecretError::Unavailable)?;
        Ok(take(out))
    }

    fn unprotect(sealed: &[u8], entropy: Option<&[u8]>) -> Result<Vec<u8>, SecretError> {
        let input = blob(sealed);
        let extra = entropy.map(blob);
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(
                &input,
                None,
                extra.as_ref().map(|e| e as *const _),
                None,
                None,
                UI_FORBIDDEN,
                &mut out,
            )
        }
        .map_err(|_| SecretError::Corrupted)?;
        Ok(take(out))
    }

    pub struct Dpapi;

    impl Cipher for Dpapi {
        fn seal(&self, plain: &str) -> Result<String, SecretError> {
            let sealed = protect(plain.as_bytes(), Some(ENTROPY))?;
            Ok(format!("{V2}{}", BASE64.encode(sealed)))
        }

        fn open(&self, stored: &str) -> Option<Result<Opened, SecretError>> {
            let (body, entropy, stale) = if let Some(body) = stored.strip_prefix(V2) {
                (body, Some(ENTROPY), false)
            } else if let Some(body) = stored.strip_prefix(V1) {
                (body, None, true)
            } else if stored.starts_with(FAMILY) {
                // Шифр из будущей версии: принять его за открытый текст значило бы
                // зашифровать шифр и потерять секрет навсегда.
                return Some(Err(SecretError::UnknownFormat));
            } else {
                return None;
            };

            Some((|| {
                let sealed = BASE64
                    .decode(body.as_bytes())
                    .map_err(|_| SecretError::Corrupted)?;
                let plain = unprotect(&sealed, entropy)?;
                let plain = String::from_utf8(plain).map_err(|_| SecretError::Corrupted)?;
                Ok(Opened { plain, stale })
            })())
        }
    }

    pub fn cipher<R: Runtime>(_app: &AppHandle<R>) -> Result<Dpapi, SecretError> {
        Ok(Dpapi)
    }

    /// Запись в формате v1 — так её писали сборки до 3.2. Нужна только тестам миграции.
    #[cfg(test)]
    pub fn legacy_v1(plain: &str) -> String {
        let sealed = protect(plain.as_bytes(), None).expect("DPAPI");
        format!("{V1}{}", BASE64.encode(sealed))
    }
}

/// Прочие ОС (проверка на машине разработчика): секреты не пишутся вовсе — открытый текст хуже
/// явного отказа.
#[cfg(not(any(windows, target_os = "android")))]
mod platform {
    use super::{Cipher, Opened, SecretError};
    use tauri::{AppHandle, Runtime};

    pub struct Refuse;

    impl Cipher for Refuse {
        fn seal(&self, _plain: &str) -> Result<String, SecretError> {
            Err(SecretError::Unavailable)
        }

        fn open(&self, stored: &str) -> Option<Result<Opened, SecretError>> {
            if stored.starts_with("enc:") {
                Some(Err(SecretError::Unavailable))
            } else {
                None
            }
        }
    }

    pub fn cipher<R: Runtime>(_app: &AppHandle<R>) -> Result<Refuse, SecretError> {
        Ok(Refuse)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::collections::HashMap;

    /// Файл настроек в памяти. saves считает записи на диск, fail_save имитирует отказ диска.
    #[derive(Default)]
    struct Mem {
        map: RefCell<HashMap<String, serde_json::Value>>,
        saves: Cell<u32>,
        fail_save: Cell<bool>,
    }

    impl Mem {
        fn with(key: &str, value: serde_json::Value) -> Self {
            let mem = Mem::default();
            mem.map.borrow_mut().insert(key.to_string(), value);
            mem
        }

        fn raw(&self, key: &str) -> Option<serde_json::Value> {
            self.map.borrow().get(key).cloned()
        }
    }

    impl Backend for Mem {
        fn get(&self, key: &str) -> Option<serde_json::Value> {
            self.raw(key)
        }
        fn set(&self, key: &str, value: serde_json::Value) {
            self.map.borrow_mut().insert(key.to_string(), value);
        }
        fn delete(&self, key: &str) {
            self.map.borrow_mut().remove(key);
        }
        fn save(&self) -> Result<(), SecretError> {
            if self.fail_save.get() {
                return Err(SecretError::Storage);
            }
            self.saves.set(self.saves.get() + 1);
            Ok(())
        }
    }

    /// Обратимый подставной шифр: «шифрует» переворотом строки. Две версии, как у DPAPI.
    struct Fake;

    impl Cipher for Fake {
        fn seal(&self, plain: &str) -> Result<String, SecretError> {
            Ok(format!("t:v2:{}", plain.chars().rev().collect::<String>()))
        }
        fn open(&self, stored: &str) -> Option<Result<Opened, SecretError>> {
            if let Some(body) = stored.strip_prefix("t:v2:") {
                if body.starts_with('!') {
                    return Some(Err(SecretError::Corrupted));
                }
                return Some(Ok(Opened {
                    plain: body.chars().rev().collect(),
                    stale: false,
                }));
            }
            if let Some(body) = stored.strip_prefix("t:v1:") {
                return Some(Ok(Opened {
                    plain: body.to_string(),
                    stale: true,
                }));
            }
            if stored.starts_with("t:") {
                return Some(Err(SecretError::UnknownFormat));
            }
            None
        }
    }

    const KEY: &str = "am_cloud_token";
    const SECRET: &str = "y0_secret-token-value";

    fn s(v: &str) -> serde_json::Value {
        serde_json::Value::String(v.to_string())
    }

    #[test]
    fn write_then_read_round_trip() {
        let mem = Mem::default();
        write_in(&mem, &Fake, Secret::CloudToken, SECRET).unwrap();

        let stored = mem.raw(KEY).unwrap();
        assert!(stored.as_str().unwrap().starts_with("t:v2:"));
        assert!(!stored.as_str().unwrap().contains(SECRET));
        assert_eq!(
            read_in(&mem, &Fake, Secret::CloudToken).unwrap().as_deref(),
            Some(SECRET)
        );
    }

    #[test]
    fn plaintext_is_migrated_on_first_read() {
        let mem = Mem::with(KEY, s(SECRET));

        let got = read_in(&mem, &Fake, Secret::CloudToken).unwrap();
        assert_eq!(got.as_deref(), Some(SECRET));

        let stored = mem.raw(KEY).unwrap();
        let stored = stored.as_str().unwrap();
        assert!(
            stored.starts_with("t:v2:"),
            "открытый текст остался: {stored}"
        );
        assert!(!stored.contains(SECRET));
        assert_eq!(mem.saves.get(), 1, "миграция должна дойти до диска");

        // Второе чтение уже ничего не переписывает.
        read_in(&mem, &Fake, Secret::CloudToken).unwrap();
        assert_eq!(mem.saves.get(), 1);
    }

    #[test]
    fn numeric_plaintext_is_migrated() {
        let mem = Mem::with("set_proxy_pass", serde_json::json!(123456));
        let got = read_in(&mem, &Fake, Secret::ProxyPassword).unwrap();
        assert_eq!(got.as_deref(), Some("123456"));
        assert!(mem
            .raw("set_proxy_pass")
            .unwrap()
            .as_str()
            .unwrap()
            .starts_with("t:v2:"));
    }

    #[test]
    fn stale_version_is_resealed() {
        let mem = Mem::with(KEY, s(&format!("t:v1:{SECRET}")));
        let got = read_in(&mem, &Fake, Secret::CloudToken).unwrap();
        assert_eq!(got.as_deref(), Some(SECRET));
        assert!(mem.raw(KEY).unwrap().as_str().unwrap().starts_with("t:v2:"));
    }

    #[test]
    fn failed_migration_keeps_value_and_reports_it() {
        let mem = Mem::with(KEY, s(SECRET));
        mem.fail_save.set(true);
        let got = read_in(&mem, &Fake, Secret::CloudToken).unwrap();
        assert_eq!(got.as_deref(), Some(SECRET));
    }

    #[test]
    fn corrupted_ciphertext_is_error_and_untouched() {
        let broken = "t:v2:!garbage";
        let mem = Mem::with(KEY, s(broken));

        assert_eq!(
            read_in(&mem, &Fake, Secret::CloudToken),
            Err(SecretError::Corrupted)
        );
        assert_eq!(
            mem.raw(KEY).unwrap(),
            s(broken),
            "битая запись не трогается"
        );
        assert_eq!(mem.saves.get(), 0);
    }

    #[test]
    fn unknown_version_is_never_taken_for_plaintext() {
        let future = "t:v9:whatever";
        let mem = Mem::with(KEY, s(future));
        assert_eq!(
            read_in(&mem, &Fake, Secret::CloudToken),
            Err(SecretError::UnknownFormat)
        );
        assert_eq!(mem.raw(KEY).unwrap(), s(future));
    }

    #[test]
    fn wrong_type_is_corrupted() {
        let mem = Mem::with(KEY, serde_json::json!({ "x": 1 }));
        assert_eq!(
            read_in(&mem, &Fake, Secret::CloudToken),
            Err(SecretError::Corrupted)
        );
    }

    #[test]
    fn empty_write_deletes_and_exists_follows() {
        let mem = Mem::default();
        assert!(!exists_in(&mem, Secret::CloudToken));

        write_in(&mem, &Fake, Secret::CloudToken, SECRET).unwrap();
        assert!(exists_in(&mem, Secret::CloudToken));

        write_in(&mem, &Fake, Secret::CloudToken, "").unwrap();
        assert!(!exists_in(&mem, Secret::CloudToken));
        assert!(mem.raw(KEY).is_none());
        assert_eq!(read_in(&mem, &Fake, Secret::CloudToken).unwrap(), None);
    }

    #[test]
    fn delete_removes_key() {
        let mem = Mem::with(KEY, s(SECRET));
        delete_in(&mem, Secret::CloudToken).unwrap();
        assert!(mem.raw(KEY).is_none());
    }

    #[test]
    fn secret_keys_are_known() {
        for key in ["auth_token", "am_cloud_token", "set_proxy_pass"] {
            assert!(Secret::is_secret_key(key), "{key}");
        }
        assert!(!Secret::is_secret_key("set_proxy_login"));
    }

    #[test]
    fn errors_never_carry_secret() {
        for e in [
            SecretError::Unavailable,
            SecretError::Corrupted,
            SecretError::UnknownFormat,
            SecretError::Storage,
        ] {
            assert!(!e.to_string().contains(SECRET));
            assert!(!format!("{e:?}").contains(SECRET));
        }
    }

    #[cfg(windows)]
    mod dpapi {
        use super::super::platform::{legacy_v1, Dpapi};
        use super::*;

        #[test]
        fn round_trip_v2() {
            let sealed = Dpapi.seal(SECRET).unwrap();
            assert!(sealed.starts_with("enc:v2:"));
            assert!(!sealed.contains(SECRET));
            let opened = Dpapi.open(&sealed).unwrap().unwrap();
            assert_eq!(opened.plain, SECRET);
            assert!(!opened.stale);
        }

        #[test]
        fn legacy_v1_is_read_and_migrated() {
            let mem = Mem::with(KEY, s(&legacy_v1(SECRET)));
            let got = read_in(&mem, &Dpapi, Secret::CloudToken).unwrap();
            assert_eq!(got.as_deref(), Some(SECRET));
            assert!(mem
                .raw(KEY)
                .unwrap()
                .as_str()
                .unwrap()
                .starts_with("enc:v2:"));
        }

        #[test]
        fn plaintext_is_not_ciphertext() {
            assert!(Dpapi.open("raw-token").is_none());
        }

        #[test]
        fn bad_base64_is_corrupted() {
            assert!(matches!(
                Dpapi.open("enc:v2:%%%"),
                Some(Err(SecretError::Corrupted))
            ));
        }

        #[test]
        fn tampered_blob_is_corrupted() {
            use base64::engine::general_purpose::STANDARD as BASE64;
            use base64::Engine as _;

            let sealed = Dpapi.seal(SECRET).unwrap();
            let mut bytes = BASE64.decode(&sealed["enc:v2:".len()..]).unwrap();
            let last = bytes.len() - 1;
            bytes[last] ^= 0xFF;
            let tampered = format!("enc:v2:{}", BASE64.encode(bytes));

            assert!(matches!(
                Dpapi.open(&tampered),
                Some(Err(SecretError::Corrupted))
            ));
        }

        #[test]
        fn v1_blob_does_not_open_as_v2() {
            // Без энтропии записанный шифр под меткой v2 не откроется: энтропия действительно участвует.
            let v1 = legacy_v1(SECRET);
            let relabeled = v1.replacen("enc:v1:", "enc:v2:", 1);
            assert!(matches!(
                Dpapi.open(&relabeled),
                Some(Err(SecretError::Corrupted))
            ));
        }

        #[test]
        fn future_version_is_unknown() {
            assert!(matches!(
                Dpapi.open("enc:v9:AAAA"),
                Some(Err(SecretError::UnknownFormat))
            ));
        }
    }
}
