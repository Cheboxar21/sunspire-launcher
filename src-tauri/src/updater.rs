use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::error::ApiError;

const DEFAULT_UPDATE_URL: &str = "https://api.github.com/repos/sunspire-launcher/sunspire/releases/latest";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub version: String,
    pub notes: String,
    pub url: String,
}

fn update_url() -> String {
    std::env::var("SUNSPIRE_UPDATE_URL").unwrap_or_else(|_| DEFAULT_UPDATE_URL.to_string())
}

fn version_parts(value: &str) -> Vec<u64> {
    value
        .trim()
        .trim_start_matches('v')
        .split(['.', '-', '+'])
        .take(4)
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

fn version_gt(candidate: &str, current: &str) -> bool {
    let a = version_parts(candidate);
    let b = version_parts(current);
    for index in 0..a.len().max(b.len()) {
        let left = a.get(index).copied().unwrap_or(0);
        let right = b.get(index).copied().unwrap_or(0);
        if left != right {
            return left > right;
        }
    }
    false
}

fn local_manifest() -> Option<Value> {
    let exe = std::env::current_exe().ok()?;
    let file = exe.parent()?.join("latest.json");
    let text = std::fs::read_to_string(file).ok()?;
    serde_json::from_str(&text).ok()
}

pub async fn check(current: &str) -> Result<UpdateInfo, ApiError> {
    let data: Value = if let Some(local) = local_manifest() {
        local
    } else {
        let client = reqwest::Client::builder()
            .user_agent("SunspireLauncher/1.0.0")
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(ApiError::from)?;
        let response = client.get(update_url()).send().await?;
        if !response.status().is_success() {
            return Err(ApiError::new(
                format!("Сервер обновлений вернул HTTP {}.", response.status()),
                "UPDATE_HTTP",
            ));
        }
        response.json().await?
    };
    build_info(&data, current)
}

fn build_info(data: &Value, current: &str) -> Result<UpdateInfo, ApiError> {
    let version = data
        .get("tag_name")
        .or_else(|| data.get("version"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();
    if version.is_empty() {
        return Err(ApiError::new(
            "В ответе сервера обновлений нет версии.",
            "UPDATE_FORMAT",
        ));
    }
    let notes = data
        .get("body")
        .or_else(|| data.get("notes"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let url = data
        .get("assets")
        .and_then(Value::as_array)
        .and_then(|assets| {
            assets
                .iter()
                .find(|asset| {
                    asset
                        .get("name")
                        .and_then(Value::as_str)
                        .map(|name| name.ends_with("-setup.exe") || name.ends_with(".exe"))
                        .unwrap_or(false)
                })
                .and_then(|asset| asset.get("browser_download_url"))
                .and_then(Value::as_str)
        })
        .or_else(|| data.get("url").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    Ok(UpdateInfo {
        available: version_gt(&version, current),
        version,
        notes,
        url,
    })
}

pub async fn install(app: &AppHandle, url: &str) -> Result<(), ApiError> {
    if url.trim().is_empty() {
        return Err(ApiError::new("В ответе нет ссылки на установщик.", "UPDATE_URL"));
    }
    let bytes = if url.starts_with("http://") || url.starts_with("https://") {
        let client = reqwest::Client::builder()
            .user_agent("SunspireLauncher/1.0.0")
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(ApiError::from)?;
        let response = client.get(url).send().await?;
        if !response.status().is_success() {
            return Err(ApiError::new(
                format!("Не удалось скачать обновление (HTTP {}).", response.status()),
                "UPDATE_DOWNLOAD",
            ));
        }
        response.bytes().await?.to_vec()
    } else {
        let source = {
            let raw = std::path::Path::new(url);
            if raw.is_absolute() {
                raw.to_path_buf()
            } else {
                std::env::current_exe()
                    .ok()
                    .and_then(|exe| exe.parent().map(|dir| dir.join(raw)))
                    .unwrap_or_else(|| raw.to_path_buf())
            }
        };
        std::fs::read(source).map_err(|error| ApiError::new(error.to_string(), "UPDATE_DOWNLOAD"))?
    };
    let path: PathBuf = std::env::temp_dir().join(format!(
        "Sunspire-update-{}.exe",
        chrono::Utc::now().timestamp()
    ));
    tokio::fs::write(&path, bytes).await?;
    std::process::Command::new(&path)
        .arg("/S")
        .spawn()
        .map_err(|error| ApiError::new(error.to_string(), "UPDATE_LAUNCH"))?;
    app.exit(0);
    Ok(())
}
