// Облачная копия на Яндекс Диске со стороны оболочки. Пропуск читается только здесь, заголовок
// Authorization собирается только здесь, в окно пропуск не уходит ни ответом, ни текстом ошибки.
// Команды работают с одним файлом — копией списка в папке приложения; другого пути окно задать
// не может. Разбор ответов в человеческие фразы остаётся в api/yandex-disk.ts: сюда приходят
// код и тело ответа нужного шага.
// Файл одинаков у трёх продуктов (KEPT_IN_SYNC в scripts/drift.mjs).

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_http::reqwest;

use crate::net;
use crate::secrets::{self, Secret};

const API: &str = "https://cloud-api.yandex.net/v1/disk/resources";

/// Копия списка в папке приложения. Совпадает с `${DISK_APP_ROOT}/${CLOUD_FILE}` из
/// packages/core/src/api/yandex-disk.ts и core/cloud-file.ts.
const FILE_PATH: &str = "app:/animori-list.json";

/// Корень папки приложения: на нём проверяется пропуск.
const APP_ROOT: &str = "app:/";

const FILE_FIELDS: &str = "name,size,modified,type,public_url";

const LINK_TIMEOUT: Duration = Duration::from_secs(20);
const BODY_TIMEOUT: Duration = Duration::from_secs(60);

/// Потолок тела копии: список в десятки тысяч записей — единицы мегабайт.
const MAX_COPY_BYTES: usize = 32 * 1024 * 1024;

/// Куда Диск отдаёт тела файлов. Адрес приходит в ответе API, и пропуск (при чтении) уйдёт
/// только на эти хосты: подменённый ответ не уведёт его на чужой адрес.
const BODY_HOSTS: &[&str] = &[
    "https://*.disk.yandex.net/*",
    "https://*.dst.yandex.net/*",
    "https://*.dst.yandex.ru/*",
    "https://*.disk.yandex.ru/*",
];

/// Ответ шага. stage: api — один запрос к API; link — отказ на получении адреса тела;
/// body — запрос самого тела. Разбирает их yandex-disk.ts.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudStep {
    stage: &'static str,
    status: u16,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudStatus {
    connected: bool,
}

#[derive(Deserialize)]
struct Link {
    href: Option<String>,
    templated: Option<bool>,
}

/// Пропуск по форме: OAuth Яндекса — буквы, цифры, «_», «-», «.». Пробел или перевод строки
/// внутри значат, что вставили не то; заодно в заголовок не попадёт управляющий символ.
fn check_token_shape(raw: &str) -> Result<String, String> {
    let token = raw.trim();
    if token.is_empty() {
        return Err("auth: Пропуск Яндекс Диска не введён".to_string());
    }
    if token.len() > 4096
        || !token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
    {
        return Err("auth: Это не похоже на пропуск Яндекс Диска".to_string());
    }
    Ok(token.to_string())
}

fn stored_token(app: &AppHandle) -> Result<String, String> {
    match secrets::read(app, Secret::CloudToken) {
        Ok(Some(token)) => Ok(token),
        Ok(None) => Err("auth: Пропуск Яндекс Диска не введён".to_string()),
        Err(e) => {
            log::warn!("Облако: пропуск не прочитан ({e})");
            Err(format!("auth: {e}"))
        }
    }
}

fn api_url(tail: &str, pairs: &[(&str, &str)]) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(&format!("{API}{tail}"))
        .map_err(|_| "request: адрес API не собрался".to_string())?;
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(key, value);
        }
    }
    Ok(url)
}

fn authorized(builder: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    builder
        .header(reqwest::header::AUTHORIZATION, format!("OAuth {token}"))
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::USER_AGENT, net::user_agent())
}

async fn finish(stage: &'static str, response: reqwest::Response) -> Result<CloudStep, String> {
    let status = response.status().as_u16();
    let text = response.text().await.map_err(net::classify)?;
    Ok(CloudStep {
        stage,
        status,
        text,
    })
}

async fn api_call(
    client: &reqwest::Client,
    token: &str,
    method: reqwest::Method,
    url: reqwest::Url,
) -> Result<CloudStep, String> {
    let response = authorized(client.request(method, url), token)
        .timeout(LINK_TIMEOUT)
        .send()
        .await
        .map_err(net::classify)?;
    finish("api", response).await
}

/// Адрес тела из ответа-ссылки. None — ответ не тот (отказ, шаблон, нет адреса): тогда
/// наверх уходит сам ответ, и yandex-disk.ts объяснит его словами.
fn body_url(step: &CloudStep) -> Result<Option<reqwest::Url>, String> {
    if !(200..300).contains(&step.status) {
        return Ok(None);
    }
    let Ok(link) = serde_json::from_str::<Link>(&step.text) else {
        return Ok(None);
    };
    if link.templated == Some(true) {
        return Ok(None);
    }
    let Some(href) = link.href.filter(|h| !h.is_empty()) else {
        return Ok(None);
    };
    let url = reqwest::Url::parse(&href)
        .map_err(|_| "blocked: Диск прислал негодный адрес".to_string())?;
    if !net::allowed(&url, BODY_HOSTS) {
        log::warn!(
            "Облако: адрес тела вне списка ({}) — запрос не отправлен",
            url.host_str().unwrap_or("?")
        );
        return Err("blocked: Диск прислал адрес вне списка разрешённых".to_string());
    }
    Ok(Some(url))
}

fn link_step(mut step: CloudStep) -> CloudStep {
    step.stage = "link";
    step
}

async fn check_with(client: &reqwest::Client, token: &str) -> Result<CloudStep, String> {
    let url = api_url("", &[("path", APP_ROOT), ("fields", "name")])?;
    api_call(client, token, reqwest::Method::GET, url).await
}

/// Подключено ли облако. Без расшифровки: признак наличия пропуска.
#[tauri::command]
pub fn animori_cloud_status(app: AppHandle) -> CloudStatus {
    CloudStatus {
        connected: secrets::exists(&app, Secret::CloudToken),
    }
}

/// Проверяет вставленный пропуск и, если Диск его принял, сохраняет шифром.
/// 404 — тоже «принят»: папки приложения ещё нет, её заведёт сам Диск.
#[tauri::command]
pub async fn animori_cloud_connect(app: AppHandle, token: String) -> Result<CloudStep, String> {
    let token = check_token_shape(&token)?;
    let client = net::client_for_request(&app)?;
    let step = check_with(&client, &token).await?;

    if (200..300).contains(&step.status) || step.status == 404 {
        secrets::write(&app, Secret::CloudToken, &token)?;
        log::info!("Облако: пропуск принят и сохранён");
    }
    Ok(step)
}

/// Забывает пропуск. Файл копии на Диске не трогается: стирать чужое хранилище программа не вправе.
#[tauri::command]
pub async fn animori_cloud_delete(app: AppHandle) -> Result<CloudStatus, String> {
    secrets::delete(&app, Secret::CloudToken)?;
    log::info!("Облако: пропуск стёрт");
    Ok(CloudStatus { connected: false })
}

/// Проверяет сохранённый пропуск.
#[tauri::command]
pub async fn animori_cloud_check(app: AppHandle) -> Result<CloudStep, String> {
    let token = stored_token(&app)?;
    let client = net::client_for_request(&app)?;
    check_with(&client, &token).await
}

/// Сведения о файле копии.
#[tauri::command]
pub async fn animori_cloud_stat(app: AppHandle) -> Result<CloudStep, String> {
    let token = stored_token(&app)?;
    let client = net::client_for_request(&app)?;
    let url = api_url("", &[("path", FILE_PATH), ("fields", FILE_FIELDS)])?;
    api_call(&client, &token, reqwest::Method::GET, url).await
}

/// Кладёт копию с перезаписью. Тело уходит по одноразовому адресу без пропуска: доступ зашит в адрес.
#[tauri::command]
pub async fn animori_cloud_save(app: AppHandle, text: String) -> Result<CloudStep, String> {
    if text.len() > MAX_COPY_BYTES {
        return Err("request: копия больше допустимого".to_string());
    }
    let token = stored_token(&app)?;
    let client = net::client_for_request(&app)?;

    let url = api_url("/upload", &[("path", FILE_PATH), ("overwrite", "true")])?;
    let link = api_call(&client, &token, reqwest::Method::GET, url).await?;
    let Some(target) = body_url(&link)? else {
        return Ok(link_step(link));
    };

    let response = client
        .put(target)
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/json; charset=utf-8",
        )
        .header(reqwest::header::USER_AGENT, net::user_agent())
        .timeout(BODY_TIMEOUT)
        .body(text)
        .send()
        .await
        .map_err(net::classify)?;
    finish("body", response).await
}

/// Забирает текст копии. Пропуск на втором шаге обязателен и уходит только на хосты BODY_HOSTS.
#[tauri::command]
pub async fn animori_cloud_restore(app: AppHandle) -> Result<CloudStep, String> {
    let token = stored_token(&app)?;
    let client = net::client_for_request(&app)?;

    let url = api_url("/download", &[("path", FILE_PATH)])?;
    let link = api_call(&client, &token, reqwest::Method::GET, url).await?;
    let Some(target) = body_url(&link)? else {
        return Ok(link_step(link));
    };

    let response = authorized(client.get(target), &token)
        .timeout(BODY_TIMEOUT)
        .send()
        .await
        .map_err(net::classify)?;
    finish("body", response).await
}

/// Публикует копию. Ссылку yandex-disk.ts берёт следующим вызовом stat.
#[tauri::command]
pub async fn animori_cloud_share(app: AppHandle) -> Result<CloudStep, String> {
    let token = stored_token(&app)?;
    let client = net::client_for_request(&app)?;
    let url = api_url("/publish", &[("path", FILE_PATH)])?;
    api_call(&client, &token, reqwest::Method::PUT, url).await
}

/// Снимает публикацию; файл остаётся.
#[tauri::command]
pub async fn animori_cloud_unshare(app: AppHandle) -> Result<CloudStep, String> {
    let token = stored_token(&app)?;
    let client = net::client_for_request(&app)?;
    let url = api_url("/unpublish", &[("path", FILE_PATH)])?;
    api_call(&client, &token, reqwest::Method::PUT, url).await
}

#[cfg(test)]
mod tests {
    use super::{api_url, body_url, check_token_shape, CloudStep, FILE_PATH};

    fn link(status: u16, text: &str) -> CloudStep {
        CloudStep {
            stage: "api",
            status,
            text: text.to_string(),
        }
    }

    #[test]
    fn path_is_encoded_into_query() {
        let url = api_url("/upload", &[("path", FILE_PATH), ("overwrite", "true")]).unwrap();
        assert_eq!(
            url.as_str(),
            "https://cloud-api.yandex.net/v1/disk/resources/upload?path=app%3A%2Fanimori-list.json&overwrite=true"
        );
    }

    #[test]
    fn token_shape() {
        assert_eq!(check_token_shape("  y0_AbC-12.x  ").unwrap(), "y0_AbC-12.x");
        assert!(check_token_shape("").unwrap_err().starts_with("auth:"));
        assert!(check_token_shape("y0 abc").is_err());
        assert!(check_token_shape("abc\r\nX-Evil: 1").is_err());
    }

    #[test]
    fn errors_do_not_echo_token() {
        let secret = "y0_secret secret";
        let err = check_token_shape(secret).unwrap_err();
        assert!(!err.contains("y0_secret"));
    }

    #[test]
    fn body_url_accepts_yandex_hosts_only() {
        let ok = link(
            200,
            r#"{"href":"https://uploader1j.disk.yandex.net:443/upload-target/x","templated":false}"#,
        );
        assert!(body_url(&ok).unwrap().is_some());

        let evil = link(200, r#"{"href":"https://evil.example/steal"}"#);
        assert!(body_url(&evil).unwrap_err().starts_with("blocked:"));

        let plain_http = link(200, r#"{"href":"http://downloader.disk.yandex.ru/x"}"#);
        assert!(body_url(&plain_http).is_err());
    }

    #[test]
    fn body_url_leaves_bad_answers_to_caller() {
        assert!(body_url(&link(401, "{}")).unwrap().is_none());
        assert!(body_url(&link(200, "не json")).unwrap().is_none());
        assert!(body_url(&link(
            200,
            r#"{"href":"https://x.disk.yandex.net/{a}","templated":true}"#
        ))
        .unwrap()
        .is_none());
        assert!(body_url(&link(200, r#"{"href":""}"#)).unwrap().is_none());
    }
}
