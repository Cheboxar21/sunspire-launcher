use std::collections::HashSet;
use std::io::SeekFrom;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

use lighty_launcher::auth::{AuthProvider, SecretString};
use lighty_launcher::event::EVENT_BUS;
use lighty_launcher::prelude::*;

use crate::discord::{DiscordManager, Presence};
use crate::error::ApiError;
use crate::java;
use crate::models::{Account, JavaInfo, ModLoader};
use crate::store::Store;

fn tailers() -> &'static Mutex<HashSet<String>> {
    static TAILERS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    TAILERS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub(crate) fn parse_location(line: &str) -> Option<String> {
    if let Some(index) = line.find("Connecting to ") {
        let rest = &line[index + "Connecting to ".len()..];
        let host = rest
            .split(|ch: char| ch == ',' || ch.is_whitespace())
            .next()
            .unwrap_or("")
            .trim();
        if !host.is_empty() {
            return Some(format!("server:{host}"));
        }
    }
    if line.contains("Started server on") || line.contains("Preparing level") {
        return Some("singleplayer".into());
    }
    if line.contains("Stopping server") || line.contains("Disconnected from") {
        return Some("menu".into());
    }
    None
}

pub fn start_log_tailer(app: AppHandle, instance_id: String) {
    if !tailers().lock().unwrap().insert(instance_id.clone()) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut offset = 0u64;
        loop {
            let (path, display, version) = {
                let store = app.state::<Store>();
                let root = store.game_root().join("logs").join("latest.log");
                let instance = store.instance_dir(&instance_id).join("logs").join("latest.log");
                let info = store.instance(&instance_id);
                (
                    if root.exists() { root } else { instance },
                    info.as_ref().map(|item| item.name.clone()).unwrap_or_else(|| instance_id.clone()),
                    info.as_ref().map(|item| item.mc_version.clone()).unwrap_or_default(),
                )
            };
            if let Ok(meta) = tokio::fs::metadata(&path).await {
                if meta.len() < offset {
                    offset = 0;
                }
                if meta.len() > offset {
                    if let Ok(mut file) = tokio::fs::File::open(&path).await {
                        if file.seek(SeekFrom::Start(offset)).await.is_ok() {
                            let mut buffer = Vec::new();
                            if file.read_to_end(&mut buffer).await.is_ok() {
                                offset += buffer.len() as u64;
                                let text = String::from_utf8_lossy(&buffer);
                                for line in text.lines() {
                                    let level = if line.contains("ERROR") || line.contains("Exception") {
                                        "error"
                                    } else if line.contains("WARN") {
                                        "warn"
                                    } else {
                                        "info"
                                    };
                                    let _ = app.emit(
                                        "launch:log",
                                        json!({
                                            "instanceId": instance_id.clone(),
                                            "line": line,
                                            "at": chrono::Utc::now().timestamp_millis(),
                                            "level": level,
                                        }),
                                    );
                                    if let Some(location) = parse_location(line) {
                                        let discord = app.state::<DiscordManager>();
                                        discord.set(Presence::Playing {
                                            instance: display.clone(),
                                            version: version.clone(),
                                            location,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(400)).await;
        }
    });
}

fn loader_for(loader: ModLoader) -> Loader {
    match loader {
        ModLoader::Fabric => Loader::Fabric,
        ModLoader::Quilt => Loader::Quilt,
        ModLoader::Forge => Loader::Forge,
        ModLoader::Neoforge => Loader::NeoForge,
        ModLoader::Vanilla => Loader::Vanilla,
    }
}

fn profile_for(account: &Account) -> UserProfile {
    let mut profile = UserProfile::offline(account.username.clone(), account.uuid.clone());
    if account.account_type == "microsoft" {
        profile.access_token = account
            .mc_access_token
            .clone()
            .map(SecretString::from);
        profile.xuid = account.xuid.clone();
        profile.provider = AuthProvider::Microsoft {
            client_id: "00000000402b5328".into(),
            refresh_token: account.refresh_token.clone().map(SecretString::from),
        };
    }
    profile
}

fn builder_for(store: &Store, instance: &crate::models::Instance) -> VersionBuilder<Loader> {
    let game_root = store.game_root();
    let instance_dir = store.ensure_game_dirs(&instance.id);
    let java_dir = store.data_dir().join("java");
    let mut builder = VersionBuilder::new(
        &instance.id,
        loader_for(instance.loader.clone()),
        &instance.loader_version,
        &instance.mc_version,
    );
    builder.game_dirs = game_root;
    builder.runtime_dir = instance_dir;
    builder.java_dirs = java_dir;
    builder
}

pub async fn start(
    store: &Store,
    instance_id: &str,
    account_id: Option<&str>,
) -> Result<Value, ApiError> {
    let instance = store
        .instance(instance_id)
        .ok_or_else(|| ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"))?;
    let account = match account_id {
        Some(id) => store
            .account(id)
            .ok_or_else(|| ApiError::new("Аккаунт не найден.", "ACCOUNT_NOT_FOUND"))?,
        None => store
            .active_account()
            .ok_or_else(|| ApiError::new("Сначала добавьте аккаунт Minecraft.", "NO_ACCOUNT"))?,
    };
    let profile = profile_for(&account);
    let required_java = java::required_java_major(&instance.mc_version);
    java::ensure_local_java(store, required_java).await?;
    let mut builder = builder_for(store, &instance);
    let ram = instance.ram_mb.clamp(1024, 32768);
    let result = builder
        .launch(&profile, JavaDistribution::Temurin)
        .with_event_bus(&EVENT_BUS)
        .with_jvm_options()
        .set("Xmx", format!("{ram}M"))
        .set("Xms", format!("{}M", (ram / 4).clamp(512, 2048)))
        .done()
        .with_arguments()
        .set(KEY_GAME_DIRECTORY, store.ensure_game_dirs(&instance.id).to_string_lossy().to_string())
        .done()
        .run()
        .await;
    match result {
        Ok(()) => {
            let pid = builder.get_pid().unwrap_or(0);
            Ok(json!({
                "pid": pid,
                "prepared": {
                    "java": JavaInfo {
                        path: String::new(),
                        version: "auto".into(),
                        major: 0,
                        vendor: "Temurin".into(),
                        source: "lighty".into(),
                    },
                    "profileId": format!("{}-{}", instance.mc_version, instance.loader_version),
                }
            }))
        }
        Err(error) => Err(ApiError::new(
            format!("Не удалось запустить Minecraft: {error}"),
            "LAUNCH_ERROR",
        )),
    }
}

pub fn running(store: &Store) -> Value {
    let mut list = Vec::new();
    for instance in store.instances() {
        let builder = builder_for(store, &instance);
        for pid in builder.get_pids() {
            list.push(json!({
                "instanceId": instance.id,
                "pid": pid,
                "startedAt": chrono::Utc::now().timestamp_millis(),
                "accountId": store.public_state().active_account_id,
            }));
        }
    }
    Value::Array(list)
}

pub async fn kill(store: &Store, instance_id: &str) -> Result<bool, ApiError> {
    let instance = store
        .instance(instance_id)
        .ok_or_else(|| ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"))?;
    let builder = builder_for(store, &instance);
    let pids = builder.get_pids();
    if pids.is_empty() {
        return Ok(false);
    }
    for pid in pids {
        let _ = builder.close_instance(pid).await;
    }
    Ok(true)
}
