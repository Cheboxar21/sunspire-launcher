use serde_json::{json, Value};

use crate::error::ApiError;

const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

fn client() -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .user_agent("SunspireLauncher/1.0.0")
        .build()
        .map_err(ApiError::from)
}

pub async fn list_versions() -> Result<Value, ApiError> {
    let manifest: Value = client()?
        .get(MANIFEST_URL)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let versions = manifest
        .get("versions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|entry| {
            json!({
                "id": entry.get("id").cloned().unwrap_or(Value::Null),
                "type": entry.get("type").cloned().unwrap_or(Value::Null),
                "releaseTime": entry.get("releaseTime").cloned().unwrap_or(Value::Null),
                "url": entry.get("url").cloned().unwrap_or(Value::Null),
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "latest": manifest.get("latest").cloned().unwrap_or_else(|| json!({ "release": "", "snapshot": "" })),
        "versions": versions,
    }))
}

pub async fn latest_release() -> Result<String, ApiError> {
    let manifest: Value = client()?
        .get(MANIFEST_URL)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(manifest
        .pointer("/latest/release")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string())
}

async fn get_json(client: &reqwest::Client, url: &str) -> Option<Value> {
    client
        .get(url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .await
        .ok()
}

async fn get_text(client: &reqwest::Client, url: &str) -> Option<String> {
    client
        .get(url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .await
        .ok()
}

pub async fn loader_versions(mc_version: &str) -> Result<Value, ApiError> {
    let client = client()?;
    let encoded = urlencoding(mc_version);

    let (fabric, quilt, forge, neoforge) = tokio::join!(
        async {
            let data = get_json(
                &client,
                &format!("https://meta.fabricmc.net/v2/versions/loader/{encoded}"),
            )
            .await?;
            let list = data.as_array()?.iter().take(30).map(|item| {
                json!({
                    "version": item.pointer("/loader/version").cloned().unwrap_or(Value::Null),
                    "stable": item.pointer("/loader/stable").and_then(Value::as_bool).unwrap_or(false),
                })
            }).collect::<Vec<_>>();
            Some(list)
        },
        async {
            let data = get_json(
                &client,
                &format!("https://meta.quiltmc.org/v3/versions/loader/{encoded}"),
            )
            .await?;
            let list = data.as_array()?.iter().take(30).map(|item| {
                let version = item.pointer("/loader/version").and_then(Value::as_str).unwrap_or("");
                json!({
                    "version": version,
                    "stable": !version.to_ascii_lowercase().contains("beta")
                        && !version.to_ascii_lowercase().contains("alpha")
                        && !version.to_ascii_lowercase().contains("pre"),
                })
            }).collect::<Vec<_>>();
            Some(list)
        },
        async {
            let data = get_json(
                &client,
                "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
            )
            .await?;
            let promos = data.get("promos")?.as_object()?;
            let mut list = Vec::new();
            let mut seen = std::collections::HashSet::new();
            for (key, stable) in [
                (format!("{mc_version}-recommended"), true),
                (format!("{mc_version}-latest"), false),
            ] {
                if let Some(version) = promos.get(&key).and_then(Value::as_str) {
                    if seen.insert(version.to_string()) {
                        list.push(json!({
                            "version": format!("{mc_version}-{version}"),
                            "stable": stable,
                        }));
                    }
                }
            }
            Some(list)
        },
        async {
            let xml = get_text(
                &client,
                "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml",
            )
            .await?;
            let mapped = mc_version.strip_prefix("1.").unwrap_or(mc_version);
            let prefix = format!("{mapped}.");
            let mut versions = Vec::new();
            for chunk in xml.split("<version>").skip(1) {
                if let Some((version, _)) = chunk.split_once("</version>") {
                    let lower = version.to_ascii_lowercase();
                    if version.starts_with(&prefix) && !lower.contains("alpha") && !lower.contains("beta") {
                        versions.push(version.to_string());
                    }
                }
            }
            versions.reverse();
            versions.truncate(10);
            Some(
                versions
                    .into_iter()
                    .map(|version| json!({ "version": version, "stable": true }))
                    .collect::<Vec<_>>(),
            )
        }
    );

    Ok(json!({
        "fabric": fabric.unwrap_or_default(),
        "quilt": quilt.unwrap_or_default(),
        "forge": forge.unwrap_or_default(),
        "neoforge": neoforge.unwrap_or_default(),
    }))
}

fn urlencoding(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
                ch.to_string()
            } else {
                format!("%{:02X}", ch as u8)
            }
        })
        .collect()
}
