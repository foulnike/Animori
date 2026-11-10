// Запросы окна к внешним API из процесса оболочки (IBridge.http). Раньше их слал плагин HTTP из
// разметки, и пароль прокси приходилось отдавать окну: он уходил в basicAuth плагина. Теперь
// прокси вместе с паролем собирает Rust, а окно передаёт только адрес, заголовки и тело.
// Список адресов — в hosts.rs (у каждого продукта свой); проверяется здесь, до сети.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_http::reqwest;
use tauri_plugin_store::StoreExt;

use crate::hosts::ALLOWED;
use crate::secrets::{self, Secret};

// Ключи повторяют PROXY_KEYS из packages/core/src/core/proxy.ts и proxy.rs.
const KEY_PROXY_ENABLED: &str = "set_proxy_on";
const KEY_PROXY_KIND: &str = "set_proxy_kind";
const KEY_PROXY_HOST: &str = "set_proxy_host";
const KEY_PROXY_PORT: &str = "set_proxy_port";
const KEY_PROXY_LOGIN: &str = "set_proxy_login";
const KEY_PROXY_BYPASS: &str = "set_proxy_bypass";

/// Совпадает с DEFAULT_PROXY.bypass: подставляется только при отсутствии ключа.
const DEFAULT_BYPASS: &str = "localhost, 127.0.0.1";

/// Потолок установки соединения. Общий таймаут задаёт вызывающий: тело копии может идти минуту.
const CONNECT_TIMEOUT_SECS: u64 = 10;

/// Перенаправления: как у плагина прежде — до десяти, но только на https.
const MAX_REDIRECTS: usize = 10;

const METHODS: &[&str] = &["GET", "POST", "HEAD", "PUT", "DELETE", "PATCH"];

/// Запрос в том виде, в каком его собирает мост. Куки не поддерживаются: их не было и у плагина.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetRequest {
    method: Option<String>,
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
    /// Тело ответа байтами в base64 вместо текста.
    #[serde(default)]
    bytes: bool,
}

/// Ответ для HttpResponse/HttpBytesResponse моста. Заполнено ровно одно из text и bytesBase64.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetReply {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    text: Option<String>,
    bytes_base64: Option<String>,
    url: String,
}

/// Совпадает ли путь с шаблоном вида https://host/path* (тот же вид, что был в capabilities).
/// `*.` в начале хоста — любой поддомен, но не сам домен; `*` в конце пути — любой хвост.
fn matches_pattern(pattern: &str, host: &str, path: &str) -> bool {
    let Some(rest) = pattern.strip_prefix("https://") else {
        return false;
    };
    let (p_host, p_path) = match rest.find('/') {
        Some(at) => (&rest[..at], &rest[at..]),
        None => (rest, "/"),
    };

    let host_ok = match p_host.strip_prefix("*.") {
        Some(suffix) => {
            host.len() > suffix.len() + 1
                && host.ends_with(suffix)
                && host.as_bytes()[host.len() - suffix.len() - 1] == b'.'
        }
        None => host == p_host,
    };
    if !host_ok {
        return false;
    }

    match p_path.strip_suffix('*') {
        Some(prefix) => path.starts_with(prefix),
        None => path == p_path,
    }
}

/// Разрешён ли адрес. Только https на стандартном порту и без учётных данных в адресе.
/// Путь уже нормализован разбором (точки-сегменты сняты), поэтому проверка префикса честная.
pub fn allowed(url: &reqwest::Url, patterns: &[&str]) -> bool {
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.to_ascii_lowercase();
    patterns
        .iter()
        .any(|pattern| matches_pattern(pattern, &host, url.path()))
}

fn read_string(value: Option<serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::String(s)) => s.trim().to_string(),
        Some(serde_json::Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

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

/// Исключения прокси в вид reqwest: через запятую, без пустых записей.
fn normalize_bypass(raw: &str) -> String {
    raw.split([',', ';', '\n', '\r'])
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>()
        .join(",")
}

#[derive(PartialEq, Eq)]
struct ProxyConf {
    url: String,
    login: String,
    password: String,
    bypass: String,
}

/// Прокси для наших запросов. None — напрямую.
fn read_proxy(app: &AppHandle) -> Option<ProxyConf> {
    let store = app.store(secrets::STORE_FILE).ok()?;

    if !matches!(
        store.get(KEY_PROXY_ENABLED),
        Some(serde_json::Value::Bool(true))
    ) {
        return None;
    }

    let host = read_string(store.get(KEY_PROXY_HOST));
    let port = read_port(store.get(KEY_PROXY_PORT));
    if host.is_empty() || port == 0 {
        log::warn!("Прокси включён, но адрес или порт заданы неверно — запросы идут напрямую");
        return None;
    }

    let scheme = if read_string(store.get(KEY_PROXY_KIND)) == "socks5" {
        "socks5"
    } else {
        "http"
    };

    let bypass = match store.get(KEY_PROXY_BYPASS) {
        None => DEFAULT_BYPASS.to_string(),
        Some(value) => read_string(Some(value)),
    };

    let login = read_string(store.get(KEY_PROXY_LOGIN));
    let password = if login.is_empty() {
        String::new()
    } else {
        match secrets::read(app, Secret::ProxyPassword) {
            Ok(value) => value.unwrap_or_default(),
            Err(e) => {
                log::warn!("Пароль прокси не прочитан ({e}) — запрос идёт без него");
                String::new()
            }
        }
    };

    Some(ProxyConf {
        url: format!("{scheme}://{host}:{port}"),
        login,
        password,
        bypass: normalize_bypass(&bypass),
    })
}

pub fn user_agent() -> String {
    format!(
        "AniMori/{} (+https://github.com/foulnike/Animori)",
        env!("CARGO_PKG_VERSION")
    )
}

/// Текст ошибки без адреса: в адресах тел Диска лежит подпись доступа, ей не место в журнале.
pub fn classify(error: reqwest::Error) -> String {
    let timeout = error.is_timeout();
    let builder = error.is_builder();
    let error = error.without_url();
    if timeout {
        format!("timeout: {error}")
    } else if builder {
        format!("request: {error}")
    } else {
        format!("network: {error}")
    }
}

fn build_client(proxy: Option<&ProxyConf>) -> Result<reqwest::Client, String> {
    let redirect = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            attempt.error("слишком много перенаправлений")
        } else if attempt.url().scheme() != "https" {
            attempt.stop()
        } else {
            attempt.follow()
        }
    });

    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .redirect(redirect);

    if let Some(conf) = proxy {
        let mut proxy = reqwest::Proxy::all(&conf.url)
            .map_err(|e| format!("network: адрес прокси не разбирается: {}", e.without_url()))?;
        // Логин отдельно от адреса: пароль с ':' или '@' сломал бы склейку.
        if !conf.login.is_empty() {
            proxy = proxy.basic_auth(&conf.login, &conf.password);
        }
        proxy = proxy.no_proxy(reqwest::NoProxy::from_string(&conf.bypass));
        builder = builder.proxy(proxy);
    }

    builder
        .build()
        .map_err(|e| format!("network: клиент не собрался: {}", e.without_url()))
}

/// Клиент держится до смены настроек прокси: TLS-сессии и соединения переиспользуются.
#[derive(Default)]
pub struct NetClientState(Mutex<Option<(Option<ProxyConf>, reqwest::Client)>>);

pub fn cached_client(app: &AppHandle, state: &NetClientState) -> Result<reqwest::Client, String> {
    let proxy = read_proxy(app);
    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());

    if let Some((key, client)) = guard.as_ref() {
        if *key == proxy {
            return Ok(client.clone());
        }
    }

    let client = build_client(proxy.as_ref())?;
    *guard = Some((proxy, client.clone()));
    Ok(client)
}

/// Один запрос окна. Адрес вне списка отклоняется до сети с префиксом blocked:.
#[tauri::command]
pub async fn animori_http_request(
    app: AppHandle,
    state: tauri::State<'_, NetClientState>,
    request: NetRequest,
) -> Result<NetReply, String> {
    let url = reqwest::Url::parse(request.url.trim())
        .map_err(|_| "blocked: адрес не разобран".to_string())?;

    if !allowed(&url, ALLOWED) {
        let host = url.host_str().unwrap_or("?").to_string();
        log::warn!("Запрос окна отклонён: {host} нет в списке адресов");
        return Err(format!("blocked: {host} нет в списке разрешённых адресов"));
    }

    let method = request
        .method
        .as_deref()
        .unwrap_or("GET")
        .to_ascii_uppercase();
    if !METHODS.contains(&method.as_str()) {
        return Err(format!("request: метод {method} не поддерживается"));
    }
    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|_| "request: метод не разобран".to_string())?;

    let client = cached_client(&app, &state)?;
    let mut builder = client.request(method, url);

    let has_agent = request
        .headers
        .keys()
        .any(|name| name.eq_ignore_ascii_case("user-agent"));
    for (name, value) in request.headers {
        builder = builder.header(name, value);
    }
    if !has_agent {
        builder = builder.header(reqwest::header::USER_AGENT, user_agent());
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    if let Some(ms) = request.timeout_ms {
        builder = builder.timeout(Duration::from_millis(ms));
    }

    let response = builder.send().await.map_err(classify)?;

    let status = response.status();
    let final_url = response.url().to_string();
    let mut headers = HashMap::new();
    for (name, value) in response.headers() {
        if let Ok(text) = value.to_str() {
            headers.insert(name.as_str().to_ascii_lowercase(), text.to_string());
        }
    }

    let (text, bytes_base64) = if request.bytes {
        let body = response.bytes().await.map_err(classify)?;
        (None, Some(BASE64.encode(body)))
    } else {
        (Some(response.text().await.map_err(classify)?), None)
    };

    Ok(NetReply {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
        text,
        bytes_base64,
        url: final_url,
    })
}

/// Список хостов, куда окно может направлять пользователя через `animori_open_external`.
/// Перечислены все адреса, которые UI реально открывает: репозиторий, документация,
/// каталоги, облачные сервисы, кредиты. Неизвестный хост — отказ без раскрытия URL.
const ALLOWED_EXTERNAL: &[&str] = &[
    "https://github.com/*",
    "https://anilist.co/*",
    "https://graphql.anilist.co/*",
    "https://shikimori.one/*",
    "https://shikimori.me/*",
    "https://*.shikimori.org/*",
    "https://moe.shikimori.one/*",
    "https://desu.shikimori.one/*",
    "https://kawai.shikimori.one/*",
    "https://myanimelist.net/*",
    "https://cdn.myanimelist.net/*",
    "https://oauth.yandex.com/*",
    "https://disk.yandex.ru/*",
    "https://disk.yandex.com/*",
    "https://yadi.sk/*",
    "https://animethemes.moe/*",
    "https://*.animethemes.moe/*",
    "https://music.youtube.com/*",
    "https://www.youtube.com/*",
    "https://www.dailymotion.com/*",
    "https://open.spotify.com/*",
];

/// Максимальная длина URL, открываемого в браузере.
const MAX_EXTERNAL_URL_LEN: usize = 2048;

/// Проверяет URL перед открытием в браузере пользователя.
/// Только HTTPS, без учётных данных, без явного нестандартного порта,
/// длина ограничена, нет управляющих символов, хост в списке ALLOWED_EXTERNAL.
/// Текст ошибки не раскрывает полный URL — только схему или хост.
pub fn validate_external_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = raw.trim();

    // Управляющие символы до разбора
    if url.contains('\r') || url.contains('\n') {
        return Err("Управляющие символы в адресе".to_string());
    }

    // Длина
    if url.len() > MAX_EXTERNAL_URL_LEN {
        return Err(format!(
            "Адрес слишком длинный: {} > {MAX_EXTERNAL_URL_LEN}",
            url.len()
        ));
    }

    let parsed = reqwest::Url::parse(url).map_err(|_| "Адрес не распознан".to_string())?;

    // Только HTTPS
    if parsed.scheme() != "https" {
        return Err(format!("Только https разрешён: {}", parsed.scheme()));
    }

    // Без учётных данных
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Логин/пароль в адресе не разрешены".to_string());
    }

    // Без нестандартного порта (443 нормализуется и возвращается как None)
    if parsed.port().is_some() {
        return Err("Явный порт не разрешён".to_string());
    }

    // Хост в списке
    if !allowed(&parsed, ALLOWED_EXTERNAL) {
        return Err(format!(
            "Хост не в списке разрешённых: {}",
            parsed.host_str().unwrap_or("?")
        ));
    }

    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::{allowed, normalize_bypass, validate_external_url};
    use tauri_plugin_http::reqwest::Url;

    const LIST: &[&str] = &[
        "https://graphql.anilist.co/*",
        "https://*.disk.yandex.net/*",
        "https://github.com/foulnike/animori-data/*",
    ];

    fn ok(url: &str) -> bool {
        allowed(&Url::parse(url).unwrap(), LIST)
    }

    #[test]
    fn exact_host_and_any_path() {
        assert!(ok("https://graphql.anilist.co/"));
        assert!(ok("https://graphql.anilist.co/x?y=1"));
        assert!(ok("https://GRAPHQL.anilist.co/"));
    }

    #[test]
    fn wildcard_needs_subdomain() {
        assert!(ok("https://downloader.disk.yandex.net/a"));
        assert!(ok("https://a.b.disk.yandex.net/a"));
        assert!(!ok("https://disk.yandex.net/a"));
        assert!(!ok("https://evildisk.yandex.net/a"));
        assert!(!ok("https://disk.yandex.net.evil.com/a"));
    }

    #[test]
    fn path_prefix_is_enforced_after_normalization() {
        assert!(ok("https://github.com/foulnike/animori-data/releases/x"));
        assert!(!ok("https://github.com/foulnike/other/x"));
        assert!(!ok("https://github.com/foulnike/animori-data/../other"));
        assert!(!ok("https://github.com/foulnike/animori-data/%2e%2e/other"));
        assert!(!ok("https://github.com/foulnike/animori-datax/"));
    }

    #[test]
    fn scheme_port_and_userinfo_are_rejected() {
        assert!(!ok("http://graphql.anilist.co/"));
        assert!(!ok("https://graphql.anilist.co:8443/"));
        assert!(!ok("https://user:pass@graphql.anilist.co/"));
        assert!(ok("https://graphql.anilist.co:443/"));
    }

    #[test]
    fn unknown_host_is_rejected() {
        assert!(!ok("https://example.com/"));
        assert!(!ok("https://127.0.0.1/"));
    }

    #[test]
    fn bypass_is_comma_list() {
        assert_eq!(
            normalize_bypass("localhost; 127.0.0.1\n, ,x"),
            "localhost,127.0.0.1,x"
        );
        assert_eq!(normalize_bypass(""), "");
    }

    #[test]
    fn external_https_allowed_host() {
        assert!(validate_external_url("https://github.com/foulnike/Animori").is_ok());
        assert!(validate_external_url("https://anilist.co/user/test").is_ok());
    }

    #[test]
    fn external_http_rejected() {
        assert!(validate_external_url("http://github.com").is_err());
    }

    #[test]
    fn external_file_rejected() {
        assert!(validate_external_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn external_ms_settings_rejected() {
        assert!(validate_external_url("ms-settings:privacy").is_err());
    }

    #[test]
    fn external_javascript_rejected() {
        assert!(validate_external_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn external_userinfo_rejected() {
        let err = validate_external_url("https://user:pass@github.com").unwrap_err();
        assert!(err.contains("Логин/пароль"));
    }

    #[test]
    fn external_host_not_in_allowlist() {
        let err = validate_external_url("https://evil.example/steal").unwrap_err();
        assert!(err.contains("не в списке"));
    }

    #[test]
    fn external_explicit_port_rejected() {
        assert!(validate_external_url("https://github.com:8443/").is_err());
    }

    #[test]
    fn external_too_long_rejected() {
        let long = format!("https://github.com/{}", "x".repeat(2049));
        let err = validate_external_url(&long).unwrap_err();
        assert!(err.contains("слишком длинный"));
    }

    #[test]
    fn external_crlf_rejected() {
        let err = validate_external_url("https://github.com/\r\nX-Header: evil").unwrap_err();
        assert!(err.contains("Управляющие символы"));
    }
}
