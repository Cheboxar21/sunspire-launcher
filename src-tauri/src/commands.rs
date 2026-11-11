use std::fs;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::auth;
use crate::discord::{DiscordManager, Presence};
use crate::error::ApiError;
use crate::java;
use crate::launch;
use crate::minecraft_meta;
use crate::models::{
    AccountPublic, CreateInstanceInput, Instance, LauncherState, SettingsPatch,
    StatePatch, SystemInfo,
};
use crate::mods;
use crate::modrinth;
use crate::store::Store;

fn emit_state(app: &AppHandle, state: &LauncherState) {
    let _ = app.emit("state:changed", state);
}

fn emit_task(
    app: &AppHandle,
    kind: &str,
    instance_id: Option<String>,
    message: &str,
    progress: Option<u8>,
) {
    let _ = app.emit(
        "task:progress",
        json!({
            "kind": kind,
            "instanceId": instance_id,
            "message": message,
            "progress": progress,
            "at": chrono::Utc::now().timestamp_millis(),
        }),
    );
}

#[tauri::command]
pub fn state_get(store: State<'_, Store>) -> Result<LauncherState, ApiError> {
    Ok(store.public_state())
}

#[tauri::command]
pub fn state_update(
    app: AppHandle,
    store: State<'_, Store>,
    discord: State<'_, DiscordManager>,
    patch: StatePatch,
) -> Result<LauncherState, ApiError> {
    let state = store.update_settings(patch.settings.unwrap_or_default());
    discord.configure(state.settings.discord_rpc, &state.settings.discord_client_id);
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn state_open_game_root(store: State<'_, Store>) -> Result<String, ApiError> {
    let path = store.game_root();
    fs::create_dir_all(&path)?;
    open_folder(&path)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn state_open_instance_folder(
    store: State<'_, Store>,
    instance_id: String,
) -> Result<String, ApiError> {
    let path = store.ensure_game_dirs(&instance_id);
    open_folder(&path)?;
    Ok(path.to_string_lossy().to_string())
}

fn open_folder(path: &std::path::Path) -> Result<(), ApiError> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|error| ApiError::new(error.to_string(), "OPEN_FAILED"))?;
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
    Ok(())
}

#[tauri::command]
pub fn app_info(store: State<'_, Store>) -> Result<SystemInfo, ApiError> {
    let mut system = sysinfo::System::new_all();
    system.refresh_all();
    Ok(SystemInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        electron: "Rust".into(),
        chrome: "WebView2".into(),
        node: "Tauri 2".into(),
        platform: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        total_mem_mb: system.total_memory() / 1024 / 1024,
        free_mem_mb: system.available_memory() / 1024 / 1024,
        cpus: system.cpus().len(),
        game_root: store.game_root().to_string_lossy().to_string(),
        user_data: store.data_dir().to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn app_open_logo(store: State<'_, Store>) -> Result<String, ApiError> {
    const LOGO: &[u8] = include_bytes!("../../src/assets/logo.png");
    let path = store.data_dir().join("logo.png");
    if !path.exists() {
        fs::write(&path, LOGO)?;
    }
    open_folder(store.data_dir())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn instances_create(
    app: AppHandle,
    store: State<'_, Store>,
    input: CreateInstanceInput,
) -> Result<Value, ApiError> {
    let mc_version = input.mc_version.trim().to_string();
    if mc_version.is_empty() {
        return Err(ApiError::new("Выберите версию Minecraft.", "INVALID_VERSION"));
    }
    let mut name = input.name.trim().chars().take(60).collect::<String>();
    let technical = name.is_empty()
        || name.to_ascii_lowercase().starts_with("instance-")
        || name.eq_ignore_ascii_case(&mc_version);
    if technical {
        name = crate::store::default_instance_name(&input.loader, &mc_version);
    }
    let id = Store::new_id("instance");
    let settings = store.settings();
    let ram = if input.ram_mb == 0 {
        settings.default_ram_mb
    } else {
        input.ram_mb
    }
    .clamp(1024, 32768);
    let instance = Instance {
        id: id.clone(),
        name,
        mc_version,
        loader: input.loader,
        loader_version: input.loader_version.trim().to_string(),
        ram_mb: ram,
        icon: if ["grass", "diamond", "gold", "redstone", "ender", "amethyst", "stone"]
            .contains(&input.icon.as_str())
        {
            input.icon
        } else {
            "grass".into()
        },
        server: input.server.trim().chars().take(200).collect(),
        created_at: chrono::Utc::now().to_rfc3339(),
        ..Instance::default()
    };
    store.ensure_game_dirs(&id);
    let instance = store.upsert_instance(instance);
    store.set_active_instance(&id);
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(json!({ "state": state, "instance": instance }))
}

#[tauri::command]
pub fn instances_update(
    app: AppHandle,
    store: State<'_, Store>,
    instance_id: String,
    patch: Value,
) -> Result<Value, ApiError> {
    let instance = store.update_instance(&instance_id, patch)?;
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(json!({ "state": state, "instance": instance }))
}

#[tauri::command]
pub fn instances_select(
    app: AppHandle,
    store: State<'_, Store>,
    instance_id: String,
) -> Result<LauncherState, ApiError> {
    if !store.set_active_instance(&instance_id) {
        return Err(ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"));
    }
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub async fn instances_delete(
    app: AppHandle,
    store: State<'_, Store>,
    instance_id: String,
) -> Result<LauncherState, ApiError> {
    if store.instance(&instance_id).is_none() {
        return Err(ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"));
    }
    let _ = launch::kill(&store, &instance_id).await;
    let dir = store.instance_dir(&instance_id);
    let root = store.game_root().join("instances");
    if dir.starts_with(&root) {
        let _ = tokio::fs::remove_dir_all(&dir).await;
    }
    let state = store.remove_instance(&instance_id);
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn mods_toggle(
    app: AppHandle,
    store: State<'_, Store>,
    instance_id: String,
    mod_id: String,
) -> Result<LauncherState, ApiError> {
    mods::toggle_mod(&store, &instance_id, &mod_id)?;
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn mods_remove(
    app: AppHandle,
    store: State<'_, Store>,
    instance_id: String,
    mod_id: String,
) -> Result<LauncherState, ApiError> {
    mods::remove_mod(&store, &instance_id, &mod_id)?;
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn mods_scan(
    app: AppHandle,
    store: State<'_, Store>,
    instance_id: String,
) -> Result<LauncherState, ApiError> {
    mods::scan_mods(&store, &instance_id)?;
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn mods_add_local(
    app: AppHandle,
    store: State<'_, Store>,
    instance_id: String,
    kind: String,
) -> Result<Value, ApiError> {
    use tauri_plugin_dialog::DialogExt;
    let Some(files) = app
        .dialog()
        .file()
        .add_filter("Minecraft files", &["jar", "zip"])
        .blocking_pick_files()
    else {
        return Ok(Value::Null);
    };
    let paths: Vec<String> = files
        .into_iter()
        .filter_map(|file| file.into_path().ok())
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    if paths.is_empty() {
        return Ok(Value::Null);
    }
    let added = mods::add_local_files(&store, &instance_id, &paths, &kind)?;
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(json!({ "state": state, "added": added }))
}

#[tauri::command]
pub fn instance_read_log(store: State<'_, Store>, instance_id: String) -> Result<String, ApiError> {
    let candidates = [
        store.game_root().join("logs"),
        store.instance_dir(&instance_id).join("logs"),
    ];
    for dir in candidates {
        for name in ["latest.log", "sunspire-launch.log"] {
            let path = dir.join(name);
            if let Ok(text) = fs::read_to_string(&path) {
                if !text.is_empty() {
                    return Ok(text);
                }
            }
        }
    }
    Ok(String::new())
}

#[tauri::command]
pub fn java_list(store: State<'_, Store>) -> Result<Value, ApiError> {
    let extra = vec![store.data_dir().join("java")];
    let list = java::detect_java(&extra);
    let selected = {
        let configured = store.settings().java_path;
        if !configured.is_empty() {
            configured
        } else {
            list.first().map(|item| item.path.clone()).unwrap_or_default()
        }
    };
    Ok(json!({ "java": list, "selected": selected }))
}

#[tauri::command]
pub async fn java_choose(
    app: AppHandle,
    store: State<'_, Store>,
) -> Result<Option<crate::models::JavaInfo>, ApiError> {
    use tauri_plugin_dialog::DialogExt;
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("Java executable", &["exe"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|error| ApiError::new(error.to_string(), "DIALOG_ERROR"))?;
    let Some(info) = java::inspect_java(&path) else {
        return Err(ApiError::new(
            "Это не похоже на Java: не удалось определить версию.",
            "INVALID_JAVA",
        ));
    };
    let mut patch = SettingsPatch::default();
    patch.java_path = Some(info.path.clone());
    let state = store.update_settings(patch);
    emit_state(&app, &state);
    Ok(Some(info))
}

#[tauri::command]
pub async fn mc_versions() -> Result<Value, ApiError> {
    minecraft_meta::list_versions().await
}

#[tauri::command]
pub async fn mc_latest_release() -> Result<String, ApiError> {
    minecraft_meta::latest_release().await
}

#[tauri::command]
pub async fn mc_loaders(mc_version: String) -> Result<Value, ApiError> {
    minecraft_meta::loader_versions(&mc_version).await
}

#[tauri::command]
pub async fn launch_start(
    app: AppHandle,
    store: State<'_, Store>,
    discord: State<'_, DiscordManager>,
    instance_id: String,
    account_id: Option<String>,
) -> Result<Value, ApiError> {
    let instance = store
        .instance(&instance_id)
        .ok_or_else(|| ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"))?;
    let active_account = match account_id.as_deref() {
        Some(id) => auth::get_valid_account(&store, id).await?,
        None => match store.active_account() {
            Some(account) => auth::get_valid_account(&store, &account.id).await?,
            None => return Err(ApiError::new("Сначала добавьте аккаунт Minecraft.", "NO_ACCOUNT")),
        },
    };
    discord.set(Presence::Launching {
        instance: instance.name.clone(),
        version: instance.mc_version.clone(),
    });
    let _ = app.emit(
        "launch:state",
        json!({ "state": "preparing", "instanceId": instance_id }),
    );
    let _ = app.emit(
        "launch:progress",
        json!({
            "instanceId": instance_id,
            "stage": "preparing",
            "message": "Подготовка файлов и Java…",
            "progress": 2,
        }),
    );
    let result = match launch::start(&store, &instance_id, Some(&active_account.id)).await {
        Ok(result) => result,
        Err(error) => {
            discord.set(Presence::Idle);
            let _ = app.emit(
                "launch:state",
                json!({ "state": "error", "instanceId": instance_id, "error": error.message }),
            );
            return Err(error);
        }
    };
    let pid = result.get("pid").and_then(Value::as_u64).unwrap_or(0);
    launch::start_log_tailer(app.clone(), instance_id.clone());
    let _ = app.emit(
        "launch:state",
        json!({ "state": "running", "instanceId": instance_id, "pid": pid }),
    );
    discord.set(Presence::Playing {
        instance: instance.name.clone(),
        version: instance.mc_version.clone(),
        location: "menu".into(),
    });
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(result)
}

#[tauri::command]
pub async fn launch_kill(
    app: AppHandle,
    store: State<'_, Store>,
    discord: State<'_, DiscordManager>,
    instance_id: String,
) -> Result<bool, ApiError> {
    let killed = launch::kill(&store, &instance_id).await?;
    discord.set(Presence::Idle);
    if killed {
        let _ = app.emit(
            "launch:state",
            json!({ "state": "exited", "instanceId": instance_id }),
        );
    }
    Ok(killed)
}

#[tauri::command]
pub fn launch_running(store: State<'_, Store>) -> Result<Value, ApiError> {
    Ok(launch::running(&store))
}

#[tauri::command]
pub async fn modrinth_search(options: crate::models::SearchOptions) -> Result<Value, ApiError> {
    modrinth::search(&options).await
}

#[tauri::command]
pub async fn modrinth_project(project_id: String) -> Result<Value, ApiError> {
    modrinth::project(&project_id).await
}

#[tauri::command]
pub async fn modrinth_versions(
    project_id: String,
    filters: crate::models::VersionFilters,
) -> Result<Value, ApiError> {
    modrinth::versions(&project_id, &filters).await
}

#[tauri::command]
pub async fn modrinth_install(
    app: AppHandle,
    store: State<'_, Store>,
    options: crate::models::InstallOptions,
) -> Result<Value, ApiError> {
    emit_task(
        &app,
        "mod",
        Some(options.instance_id.clone()),
        "Установка проекта Modrinth…",
        Some(20),
    );
    let result = modrinth::install(&store, &options).await?;
    let state = store.public_state();
    emit_state(&app, &state);
    emit_task(
        &app,
        "mod",
        Some(options.instance_id),
        "Установка завершена.",
        Some(100),
    );
    Ok(result)
}

#[tauri::command]
pub async fn modrinth_install_modpack(
    app: AppHandle,
    store: State<'_, Store>,
    options: crate::models::ModpackInstallOptions,
) -> Result<Value, ApiError> {
    emit_task(&app, "modpack", None, "Установка модпака…", Some(10));
    let result = modrinth::install_modpack(&store, &options).await?;
    let state = store.public_state();
    emit_state(&app, &state);
    emit_task(&app, "modpack", None, "Модпак установлен.", Some(100));
    Ok(result)
}

#[tauri::command]
pub async fn modrinth_import_mrpack(
    app: AppHandle,
    store: State<'_, Store>,
) -> Result<Value, ApiError> {
    use tauri_plugin_dialog::DialogExt;
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("Modrinth Modpack", &["mrpack"])
        .blocking_pick_file()
    else {
        return Ok(Value::Null);
    };
    let path = file
        .into_path()
        .map_err(|error| ApiError::new(error.to_string(), "DIALOG_ERROR"))?;
    emit_task(&app, "import", None, "Импорт .mrpack…", Some(10));
    let result = modrinth::import_mrpack(&store, &path).await?;
    let state = store.public_state();
    emit_state(&app, &state);
    emit_task(&app, "import", None, "Модпак импортирован.", Some(100));
    Ok(result)
}

#[tauri::command]
pub async fn auth_microsoft(
    app: AppHandle,
    store: State<'_, Store>,
) -> Result<Value, ApiError> {
    let account = auth::login_microsoft(&app, &store).await?;
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(json!({ "ok": true, "account": account }))
}

#[tauri::command]
pub fn auth_offline(
    app: AppHandle,
    store: State<'_, Store>,
    username: String,
) -> Result<Value, ApiError> {
    let account = auth::add_offline_account(&store, &username)?;
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(json!({ "ok": true, "account": account }))
}

#[tauri::command]
pub fn auth_select(
    app: AppHandle,
    store: State<'_, Store>,
    account_id: String,
) -> Result<LauncherState, ApiError> {
    if !store.set_active_account(&account_id) {
        return Err(ApiError::new("Аккаунт не найден.", "ACCOUNT_NOT_FOUND"));
    }
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn auth_remove(
    app: AppHandle,
    store: State<'_, Store>,
    account_id: String,
) -> Result<LauncherState, ApiError> {
    let state = store.remove_account(&account_id);
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub async fn auth_refresh(
    app: AppHandle,
    store: State<'_, Store>,
    account_id: String,
) -> Result<AccountPublic, ApiError> {
    let account = store
        .account(&account_id)
        .ok_or_else(|| ApiError::new("Аккаунт не найден.", "ACCOUNT_NOT_FOUND"))?;
    let updated = auth::refresh_account(&store, &account).await?;
    let state = store.public_state();
    emit_state(&app, &state);
    Ok(updated.public())
}

#[tauri::command]
pub async fn auth_upload_skin(
    app: AppHandle,
    store: State<'_, Store>,
    account_id: String,
    variant: String,
) -> Result<Option<AccountPublic>, ApiError> {
    let result = auth::upload_skin(&app, &store, &account_id, &variant).await?;
    if result.is_some() {
        let state = store.public_state();
        emit_state(&app, &state);
    }
    Ok(result)
}

#[tauri::command]
pub async fn auth_get_skin(
    store: State<'_, Store>,
    account_id: String,
) -> Result<Option<crate::models::SkinData>, ApiError> {
    auth::skin_data(&store, &account_id).await
}

#[tauri::command]
pub async fn skin_fetch_url(url: String) -> Result<String, ApiError> {
    auth::fetch_image_data_url_public(&url).await
}

#[tauri::command]
pub async fn update_check() -> Result<crate::updater::UpdateInfo, ApiError> {
    crate::updater::check(env!("CARGO_PKG_VERSION")).await
}

#[tauri::command]
pub async fn update_install(app: AppHandle, url: String) -> Result<(), ApiError> {
    crate::updater::install(&app, &url).await
}
