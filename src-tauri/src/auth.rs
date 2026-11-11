use std::collections::HashMap;
use std::fs;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use base64::Engine;
use md5::{Digest as Md5Digest, Md5};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::ApiError;
use crate::models::{Account, AccountPublic, SkinData};
use crate::store::Store;

const CLIENT_ID: &str = "00000000402b5328";
const REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";
const SCOPE: &str = "service::user.auth.xboxlive.com::MBI_SSL";
const USER_AGENT: &str = "SunspireLauncher/1.0.0";
const XBL_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

fn image_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn auth_error(message: impl Into<String>, code: impl Into<String>) -> ApiError {
    ApiError::new(message, code)
}

fn xsts_message(xerr: Option<&str>) -> String {
    match xerr.unwrap_or("") {
        "2148916233" => "У этого аккаунта Microsoft нет профиля Xbox. Создайте его на xbox.com и попробуйте снова.".into(),
        "2148916235" => "Xbox Live недоступен в вашем регионе.".into(),
        "2148916236" | "2148916237" => "Аккаунту нужно пройти проверку возраста на xbox.com.".into(),
        "2148916238" => "Детский аккаунт должен быть добавлен в семейную группу Microsoft.".into(),
        other => format!(
            "Xbox Live отклонил вход (код {}).",
            if other.is_empty() { "неизвестен" } else { other }
        ),
    }
}

fn client() -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(ApiError::from)
}

async fn post_form(client: &reqwest::Client, url: &str, data: &[(&str, &str)]) -> Result<Value, ApiError> {
    let response = client
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(data)
        .send()
        .await?;
    let status = response.status();
    let json: Value = response.json().await.unwrap_or_else(|_| json!({}));
    if !status.is_success() {
        let message = json
            .get("error_description")
            .or_else(|| json.get("error"))
            .and_then(Value::as_str)
            .unwrap_or("неизвестная ошибка");
        return Err(auth_error(
            format!("Ошибка Microsoft OAuth: {message}"),
            json.get("error").and_then(Value::as_str).unwrap_or("OAUTH_ERROR"),
        ));
    }
    Ok(json)
}

async fn post_json(
    client: &reqwest::Client,
    url: &str,
    data: Value,
    headers: &[(&str, &str)],
) -> Result<Value, ApiError> {
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json");
    for (key, value) in headers {
        request = request.header(*key, *value);
    }
    let response = request.json(&data).send().await?;
    let status = response.status();
    let json: Value = response.json().await.unwrap_or_else(|_| json!({}));
    if !status.is_success() {
        let xerr = json.get("XErr").and_then(Value::as_str);
        return Err(auth_error(xsts_message(xerr), "XBOX_ERROR"));
    }
    Ok(json)
}

async fn exchange_code(client: &reqwest::Client, code: &str) -> Result<Value, ApiError> {
    post_form(
        client,
        "https://login.live.com/oauth20_token.srf",
        &[
            ("client_id", CLIENT_ID),
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", REDIRECT_URI),
            ("scope", SCOPE),
        ],
    )
    .await
}

async fn refresh_live_token(client: &reqwest::Client, refresh_token: &str) -> Result<Value, ApiError> {
    post_form(
        client,
        "https://login.live.com/oauth20_token.srf",
        &[
            ("client_id", CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("redirect_uri", REDIRECT_URI),
            ("scope", SCOPE),
        ],
    )
    .await
}

async fn authenticate_xbox(
    client: &reqwest::Client,
    live_access_token: &str,
) -> Result<(String, i64), ApiError> {
    let xbl = post_json(
        client,
        XBL_URL,
        json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={live_access_token}")
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }),
        &[("x-xbl-contract-version", "1")],
    )
    .await?;
    let xbl_token = xbl
        .get("Token")
        .and_then(Value::as_str)
        .ok_or_else(|| auth_error("Xbox Live не вернул токен.", "XBOX_ERROR"))?;
    let xsts = post_json(
        client,
        XSTS_URL,
        json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }),
        &[("x-xbl-contract-version", "1")],
    )
    .await?;
    let xsts_token = xsts
        .get("Token")
        .and_then(Value::as_str)
        .ok_or_else(|| auth_error("Xbox Live не вернул XSTS-токен.", "XBOX_ERROR"))?;
    let uhs = xsts
        .pointer("/DisplayClaims/xui/0/uhs")
        .and_then(Value::as_str)
        .ok_or_else(|| auth_error("Xbox Live не вернул идентификатор пользователя.", "XBOX_ERROR"))?;
    let mc = post_json(
        client,
        MC_LOGIN_URL,
        json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }),
        &[],
    )
    .await?;
    let token = mc
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| auth_error("Minecraft не вернул токен.", "MC_ERROR"))?;
    let expires_in = mc.get("expires_in").and_then(Value::as_i64).unwrap_or(86400);
    Ok((token.to_string(), expires_in))
}

async fn fetch_profile(client: &reqwest::Client, mc_token: &str) -> Result<Value, ApiError> {
    let response = client
        .get(MC_PROFILE_URL)
        .bearer_auth(mc_token)
        .send()
        .await?;
    if response.status().as_u16() == 404 {
        return Err(auth_error(
            "На этом аккаунте Microsoft нет лицензии Minecraft: Java Edition. Купите игру или используйте офлайн-аккаунт.",
            "NOT_OWNED",
        ));
    }
    if response.status().as_u16() == 401 {
        return Err(auth_error(
            "Токен Minecraft истёк. Войдите в аккаунт Microsoft заново.",
            "TOKEN_EXPIRED",
        ));
    }
    if !response.status().is_success() {
        return Err(auth_error(
            format!("Не удалось получить профиль Minecraft (HTTP {}).", response.status()),
            "PROFILE_ERROR",
        ));
    }
    Ok(response.json().await?)
}

fn build_account(profile: &Value, mc_token: &str, expires_in: i64, live: &Value, refresh_token: &str) -> Account {
    let skin = profile
        .get("skins")
        .and_then(Value::as_array)
        .and_then(|skins| {
            skins
                .iter()
                .find(|skin| skin.get("state").and_then(Value::as_str) == Some("ACTIVE"))
                .or_else(|| skins.first())
        });
    let cape = profile
        .get("capes")
        .and_then(Value::as_array)
        .and_then(|capes| {
            capes
                .iter()
                .find(|cape| cape.get("state").and_then(Value::as_str) == Some("ACTIVE"))
                .or_else(|| capes.first())
        });
    let now = chrono::Utc::now();
    Account {
        id: profile.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
        account_type: "microsoft".into(),
        username: profile.get("name").and_then(Value::as_str).unwrap_or("Player").to_string(),
        uuid: profile.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
        license_label: "Microsoft · лицензия".into(),
        skin_url: skin.and_then(|value| value.get("url")).and_then(Value::as_str).unwrap_or("").to_string(),
        cape_url: cape.and_then(|value| value.get("url")).and_then(Value::as_str).unwrap_or("").to_string(),
        slim_arms: skin.and_then(|value| value.get("variant")).and_then(Value::as_str) == Some("slim"),
        skin_data_url: String::new(),
        added_at: Some(now.to_rfc3339()),
        last_login_at: Some(now.to_rfc3339()),
        mc_access_token: Some(mc_token.to_string()),
        mc_expires_at: Some(now.timestamp_millis() + expires_in * 1000),
        ms_access_token: live.get("access_token").and_then(Value::as_str).map(str::to_string),
        ms_expires_at: Some(
            now.timestamp_millis()
                + live.get("expires_in").and_then(Value::as_i64).unwrap_or(3600) * 1000,
        ),
        refresh_token: Some(refresh_token.to_string()),
        xuid: profile.get("id").and_then(Value::as_str).map(str::to_string),
    }
}

async fn complete_login(client: &reqwest::Client, tokens: &Value) -> Result<Account, ApiError> {
    let access_token = tokens
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| auth_error("Microsoft не вернул токен.", "OAUTH_ERROR"))?;
    let (mc_token, expires_in) = authenticate_xbox(client, access_token).await?;
    let profile = fetch_profile(client, &mc_token).await?;
    let refresh = tokens
        .get("refresh_token")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Ok(build_account(&profile, &mc_token, expires_in, tokens, &refresh))
}

fn oauth_url() -> String {
    format!(
        "https://login.live.com/oauth20_authorize.srf?client_id={}&response_type=code&scope={}&redirect_uri={}&prompt=select_account",
        CLIENT_ID,
        encode(SCOPE),
        encode(REDIRECT_URI)
    )
}

fn encode(value: &str) -> String {
    let mut output = String::new();
    for byte in value.as_bytes() {
        let ch = *byte as char;
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
            output.push(ch);
        } else {
            output.push_str(&format!("%{byte:02X}"));
        }
    }
    output
}

fn parse_redirect(url: &str) -> Result<String, ApiError> {
    let parsed = url::Url::parse(url).map_err(|error| auth_error(error.to_string(), "OAUTH_ERROR"))?;
    let mut code = None;
    let mut error_message = None;
    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.to_string()),
            "error_description" | "error" => error_message = Some(value.to_string()),
            _ => {}
        }
    }
    if let Some(code) = code {
        return Ok(code);
    }
    Err(auth_error(
        error_message.unwrap_or_else(|| "Вход через Microsoft отменён.".into()),
        "CANCELLED",
    ))
}

async fn oauth_code(app: &AppHandle) -> Result<String, ApiError> {
    let (tx, mut rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let slot = std::sync::Arc::new(Mutex::new(Some(tx)));
    let app_main = app.clone();
    let slot_main = slot.clone();
    app.run_on_main_thread(move || {
        let url = oauth_url();
        let Ok(parsed) = url::Url::parse(&url) else {
            if let Some(sender) = slot_main.lock().unwrap().take() {
                let _ = sender.send(Err("Неверный URL авторизации.".into()));
            }
            return;
        };
        let nav_app = app_main.clone();
        let nav_slot = slot_main.clone();
        let result = WebviewWindowBuilder::new(&app_main, "ms-auth", WebviewUrl::External(parsed))
            .title("Вход в Microsoft — Minecraft")
            .inner_size(540.0, 720.0)
            .center()
            .resizable(true)
            .on_navigation(move |target| {
                if target.as_str().starts_with(REDIRECT_URI) {
                    if let Some(sender) = nav_slot.lock().unwrap().take() {
                        let _ = sender.send(Ok(target.to_string()));
                    }
                    if let Some(window) = nav_app.get_webview_window("ms-auth") {
                        let _ = window.close();
                    }
                    false
                } else {
                    true
                }
            })
            .build();
        if let Err(error) = result {
            if let Some(sender) = slot_main.lock().unwrap().take() {
                let _ = sender.send(Err(format!("Не удалось открыть окно входа: {error}")));
            }
        }
    })
    .map_err(|error| auth_error(error.to_string(), "OAUTH_WINDOW"))?;

    loop {
        tokio::select! {
            result = &mut rx => {
                let redirect = result
                    .map_err(|_| auth_error("Вход через Microsoft отменён.", "CANCELLED"))?
                    .map_err(|message| auth_error(message, "OAUTH_WINDOW"))?;
                if let Some(window) = app.get_webview_window("ms-auth") {
                    let _ = window.close();
                }
                return parse_redirect(&redirect);
            }
            _ = tokio::time::sleep(Duration::from_millis(350)) => {
                if app.get_webview_window("ms-auth").is_none() {
                    return Err(auth_error("Вход через Microsoft отменён.", "CANCELLED"));
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(300)) => {
                if let Some(window) = app.get_webview_window("ms-auth") {
                    let _ = window.close();
                }
                return Err(auth_error("Время входа истекло. Попробуйте снова.", "TIMEOUT"));
            }
        }
    }
}

pub async fn login_microsoft(app: &AppHandle, store: &Store) -> Result<AccountPublic, ApiError> {
    let code = oauth_code(app).await?;
    let client = client()?;
    let tokens = exchange_code(&client, &code).await?;
    let mut account = complete_login(&client, &tokens).await?;
    if let Some(existing) = store.account(&account.id) {
        account.added_at = existing.added_at;
    }
    store.upsert_account(account.clone());
    store.set_active_account(&account.id);
    Ok(account.public())
}

pub fn offline_uuid(username: &str) -> String {
    let digest = Md5::digest(format!("OfflinePlayer:{username}").as_bytes());
    let mut bytes = digest.to_vec();
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex = hex::encode(bytes);
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

pub fn add_offline_account(store: &Store, username: &str) -> Result<AccountPublic, ApiError> {
    let name = username.trim();
    let valid = (3..=16).contains(&name.len())
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_');
    if !valid {
        return Err(auth_error(
            "Ник должен содержать 3–16 символов: латинские буквы, цифры или «_».",
            "INVALID_USERNAME",
        ));
    }
    let uuid = offline_uuid(name);
    if let Some(existing) = store
        .accounts()
        .into_iter()
        .find(|account| {
            account.account_type == "offline" && account.username.eq_ignore_ascii_case(name)
        })
    {
        store.set_active_account(&existing.id);
        return Ok(existing.public());
    }
    let now = chrono::Utc::now().to_rfc3339();
    let account = Account {
        id: format!("offline-{uuid}"),
        account_type: "offline".into(),
        username: name.to_string(),
        uuid,
        license_label: "Офлайн · без лицензии".into(),
        added_at: Some(now.clone()),
        last_login_at: Some(now),
        ..Account::default()
    };
    store.upsert_account(account.clone());
    store.set_active_account(&account.id);
    Ok(account.public())
}

pub async fn refresh_account(store: &Store, account: &Account) -> Result<Account, ApiError> {
    if account.account_type != "microsoft" {
        return Ok(account.clone());
    }
    let refresh_token = account
        .refresh_token
        .clone()
        .ok_or_else(|| auth_error("Нет токена обновления. Войдите через Microsoft заново.", "NO_REFRESH_TOKEN"))?;
    let client = client()?;
    let tokens = refresh_live_token(&client, &refresh_token)
        .await
        .map_err(|_| auth_error("Сессия Microsoft истекла. Войдите в аккаунт заново.", "REFRESH_FAILED"))?;
    let mut updated = complete_login(&client, &tokens).await?;
    updated.id = account.id.clone();
    updated.uuid = account.uuid.clone();
    updated.added_at = account.added_at.clone();
    if updated.refresh_token.as_deref().unwrap_or("").is_empty() {
        updated.refresh_token = Some(refresh_token);
    }
    store.upsert_account(updated.clone());
    Ok(updated)
}

pub async fn get_valid_account(store: &Store, account_id: &str) -> Result<Account, ApiError> {
    let account = store
        .account(account_id)
        .ok_or_else(|| auth_error("Аккаунт не найден.", "ACCOUNT_NOT_FOUND"))?;
    if account.account_type == "offline" || account.mc_token_valid() {
        return Ok(account);
    }
    refresh_account(store, &account).await
}

async fn fetch_image_data_url(client: &reqwest::Client, url: &str) -> Result<String, ApiError> {
    if let Some(cached) = image_cache().lock().unwrap().get(url) {
        return Ok(cached.clone());
    }
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(auth_error(
            format!("Не удалось загрузить изображение (HTTP {}).", response.status()),
            "IMAGE_ERROR",
        ));
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .to_string();
    if !content_type.starts_with("image/") {
        return Err(auth_error("Сервер вернул не изображение.", "IMAGE_ERROR"));
    }
    let bytes = response.bytes().await?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let data_url = format!("data:{content_type};base64,{encoded}");
    image_cache()
        .lock()
        .unwrap()
        .insert(url.to_string(), data_url.clone());
    Ok(data_url)
}

pub async fn fetch_image_data_url_public(url: &str) -> Result<String, ApiError> {
    let client = client()?;
    fetch_image_data_url(&client, url).await
}

pub async fn skin_data(store: &Store, account_id: &str) -> Result<Option<SkinData>, ApiError> {
    let Some(account) = store.account(account_id) else {
        return Ok(None);
    };
    let client = client()?;
    let skin = if !account.skin_data_url.is_empty() {
        Some(account.skin_data_url.clone())
    } else if !account.skin_url.is_empty() {
        fetch_image_data_url(&client, &account.skin_url).await.ok()
    } else {
        fetch_image_data_url(
            &client,
            &format!("https://mc-heads.net/skin/{}", encode(&account.username)),
        )
        .await
        .ok()
    };
    let cape = if account.cape_url.is_empty() {
        None
    } else {
        fetch_image_data_url(&client, &account.cape_url).await.ok()
    };
    Ok(Some(SkinData {
        skin_data_url: skin,
        cape_data_url: cape,
        slim_arms: account.slim_arms,
    }))
}

fn validate_png(bytes: &[u8], max_size: usize) -> Result<(), ApiError> {
    if bytes.len() > max_size {
        return Err(auth_error("Файл скина слишком большой.", "SKIN_TOO_LARGE"));
    }
    if bytes.len() < 24 || &bytes[0..4] != b"\x89PNG" {
        return Err(auth_error("Скин должен быть PNG-файлом.", "SKIN_FORMAT"));
    }
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    if width != 64 || !(height == 64 || height == 32) {
        return Err(auth_error(
            "Размер скина должен быть 64×64 или 64×32 пикселя.",
            "SKIN_SIZE",
        ));
    }
    Ok(())
}

async fn upload_microsoft_skin(
    store: &Store,
    account: &Account,
    bytes: Vec<u8>,
    variant: &str,
) -> Result<Account, ApiError> {
    let client = client()?;
    let form = reqwest::multipart::Form::new()
        .text("variant", if variant == "slim" { "slim" } else { "classic" })
        .part(
            "file",
            reqwest::multipart::Part::bytes(bytes)
                .file_name("skin.png")
                .mime_str("image/png")
                .map_err(|error| auth_error(error.to_string(), "SKIN_UPLOAD"))?,
        );
    let response = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .bearer_auth(account.mc_access_token.clone().unwrap_or_default())
        .multipart(form)
        .send()
        .await?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(auth_error(
            format!(
                "Mojang отклонил скин (HTTP {status}) {}",
                &text.chars().take(160).collect::<String>()
            ),
            "SKIN_UPLOAD",
        ));
    }
    image_cache().lock().unwrap().clear();
    let refreshed = refresh_account(store, account).await?;
    Ok(refreshed)
}

pub async fn upload_skin(
    app: &AppHandle,
    store: &Store,
    account_id: &str,
    variant: &str,
) -> Result<Option<AccountPublic>, ApiError> {
    use tauri_plugin_dialog::DialogExt;
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("PNG skin", &["png"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|error| auth_error(error.to_string(), "DIALOG_ERROR"))?;
    let bytes = fs::read(&path)?;
    validate_png(&bytes, 1024 * 1024)?;
    let account = get_valid_account(store, account_id).await?;
    if account.account_type == "microsoft" {
        let updated = upload_microsoft_skin(store, &account, bytes, variant).await?;
        return Ok(Some(updated.public()));
    }
    let data_url = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    );
    let mut updated = account;
    updated.skin_data_url = data_url;
    updated.slim_arms = variant == "slim";
    store.upsert_account(updated.clone());
    image_cache().lock().unwrap().clear();
    Ok(Some(updated.public()))
}
