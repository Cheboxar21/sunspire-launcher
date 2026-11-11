mod auth;
mod commands;
mod discord;
mod error;
mod java;
mod launch;
mod minecraft_meta;
mod models;
mod modrinth;
mod mods;
mod store;
mod updater;

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use lighty_launcher::event::{ConsoleOutputEvent, Event, InstanceExitedEvent, InstanceLaunchedEvent, JavaEvent, LaunchEvent, LoaderEvent, EVENT_BUS};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, WindowEvent};

use crate::discord::{DiscordManager, Presence};
use crate::store::Store;

fn launch_times() -> &'static Mutex<HashMap<String, Instant>> {
    static TIMES: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    TIMES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Открыть Sunspire", true, None::<&str>)?;
    let launch = MenuItem::with_id(app, "launch", "Запустить игру", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &launch, &quit])?;
    if let Some(icon) = app.default_window_icon() {
        TrayIconBuilder::new()
            .icon(icon.clone())
            .tooltip("Sunspire Minecraft Launcher")
            .menu(&menu)
            .show_menu_on_left_click(true)
            .on_menu_event(|app, event| match event.id.as_ref() {
                "open" => show_main(app),
                "launch" => {
                    show_main(app);
                    let _ = app.emit("tray:launch", ());
                }
                "quit" => app.exit(0),
                _ => {}
            })
            .build(app)?;
    }
    Ok(())
}

fn handle_event(app: &tauri::AppHandle, event: Event) {
    let store = app.state::<Store>();
    let discord = app.state::<DiscordManager>();
    match event {
        Event::ConsoleOutput(ConsoleOutputEvent {
            instance_name,
            line,
            ..
        }) => {
            let instance = store.instance(&instance_name);
            let display = instance
                .as_ref()
                .map(|item| item.name.clone())
                .unwrap_or_else(|| instance_name.clone());
            let version = instance
                .as_ref()
                .map(|item| item.mc_version.clone())
                .unwrap_or_default();
            if let Some(location) = launch::parse_location(&line) {
                discord.set(Presence::Playing {
                    instance: display,
                    version,
                    location,
                });
            }
        }
        Event::InstanceLaunched(InstanceLaunchedEvent {
            pid,
            instance_name,
            ..
        }) => {
            launch_times()
                .lock()
                .unwrap()
                .insert(instance_name.clone(), Instant::now());
            let instance = store.instance(&instance_name);
            let display = instance
                .as_ref()
                .map(|item| item.name.clone())
                .unwrap_or_else(|| instance_name.clone());
            let version = instance
                .as_ref()
                .map(|item| item.mc_version.clone())
                .unwrap_or_default();
            discord.set(Presence::Playing {
                instance: display,
                version,
                location: "menu".into(),
            });
            let _ = app.emit(
                "launch:state",
                serde_json::json!({ "state": "running", "instanceId": instance_name, "pid": pid }),
            );
        }
        Event::InstanceExited(InstanceExitedEvent {
            instance_name,
            exit_code,
            ..
        }) => {
            let elapsed = launch_times()
                .lock()
                .unwrap()
                .remove(&instance_name)
                .map(|start| start.elapsed().as_millis() as u64)
                .unwrap_or(0);
            store.touch_launch(&instance_name, elapsed);
            discord.set(Presence::Idle);
            let _ = app.emit(
                "launch:state",
                serde_json::json!({
                    "state": "exited",
                    "instanceId": instance_name,
                    "code": exit_code,
                    "elapsedMs": elapsed,
                }),
            );
            let _ = app.emit("state:changed", store.public_state());
        }
        Event::Launch(launch_event) => match launch_event {
            LaunchEvent::InstallStarted { version, total_bytes } => {
                let _ = app.emit(
                    "launch:progress",
                    serde_json::json!({
                        "instanceId": "",
                        "stage": "install",
                        "message": format!("Установка Minecraft {version} ({} MB)…", total_bytes / 1024 / 1024),
                        "progress": 8,
                    }),
                );
            }
            LaunchEvent::InstallProgress { bytes } => {
                let _ = app.emit(
                    "launch:progress",
                    serde_json::json!({
                        "instanceId": "",
                        "stage": "download",
                        "message": format!("Скачано {} MB", bytes / 1024 / 1024),
                        "progress": 30,
                    }),
                );
            }
            LaunchEvent::InstallCompleted { version, .. } => {
                let _ = app.emit(
                    "launch:progress",
                    serde_json::json!({
                        "instanceId": "",
                        "stage": "install",
                        "message": format!("Minecraft {version} готов."),
                        "progress": 75,
                    }),
                );
            }
            LaunchEvent::Launching { version } => {
                let _ = app.emit(
                    "launch:progress",
                    serde_json::json!({
                        "instanceId": "",
                        "stage": "launch",
                        "message": format!("Запуск Minecraft {version}…"),
                        "progress": 90,
                    }),
                );
            }
            LaunchEvent::Launched { pid, .. } => {
                let _ = app.emit(
                    "launch:progress",
                    serde_json::json!({
                        "instanceId": "",
                        "stage": "launch",
                        "message": "Игра запущена.",
                        "progress": 100,
                    }),
                );
                let _ = pid;
            }
            LaunchEvent::NotLaunched { error, .. } => {
                let _ = app.emit(
                    "launch:progress",
                    serde_json::json!({
                        "instanceId": "",
                        "stage": "error",
                        "message": error,
                        "progress": 100,
                    }),
                );
            }
            _ => {}
        },
        Event::Java(java_event) => {
            let message = match java_event {
                JavaEvent::JavaNotFound { version, .. } => format!("Java {version} не найдена, скачиваем…"),
                JavaEvent::JavaDownloadStarted { version, .. } => format!("Загрузка Java {version}…"),
                JavaEvent::JavaDownloadProgress { bytes } => format!("Java: {} MB", bytes / 1024 / 1024),
                JavaEvent::JavaExtractionStarted { version, .. } => format!("Распаковка Java {version}…"),
                JavaEvent::JavaExtractionCompleted { version, .. } => format!("Java {version} готова."),
                _ => "Подготовка Java…".into(),
            };
            let _ = app.emit(
                "launch:progress",
                serde_json::json!({
                    "instanceId": "",
                    "stage": "java",
                    "message": message,
                    "progress": 12,
                }),
            );
        }
        Event::Loader(loader_event) => {
            let message = match loader_event {
                LoaderEvent::FetchingData { loader, minecraft_version, .. } => {
                    format!("Загрузка {loader} для {minecraft_version}…")
                }
                LoaderEvent::DataFetched { loader, .. } => format!("{loader} готов."),
                LoaderEvent::MergingLoaderData { base_loader, .. } => format!("Сборка {base_loader}…"),
                _ => return,
            };
            let _ = app.emit(
                "launch:progress",
                serde_json::json!({
                    "instanceId": "",
                    "stage": "loader",
                    "message": message,
                    "progress": 18,
                }),
            );
        }
        _ => {}
    }
}

pub fn run() {
    let _ = lighty_launcher::core::AppState::init("Sunspire");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .data_dir()
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?
                .join("Sunspire");
            let store = Store::load(data_dir);
            let _ = std::fs::write(
                store.data_dir().join("logo.png"),
                include_bytes!("../../src/assets/logo.png"),
            );
            let settings = store.settings();
            let discord = DiscordManager::new();
            discord.configure(settings.discord_rpc, &settings.discord_client_id);
            app.manage(store);
            app.manage(discord);
            setup_tray(app.handle())?;

            let app_handle = app.handle().clone();
            let auto_update = app.state::<Store>().settings().auto_update;
            tauri::async_runtime::spawn(async move {
                let mut receiver = EVENT_BUS.subscribe();
                loop {
                    match receiver.next().await {
                        Ok(event) => handle_event(&app_handle, event),
                        Err(_) => continue,
                    }
                }
            });
            if auto_update {
                let updater_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(6)).await;
                    if let Ok(info) = updater::check(env!("CARGO_PKG_VERSION")).await {
                        if info.available {
                            let _ = updater_handle.emit("update:available", info);
                        }
                    }
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let store = window.app_handle().state::<Store>();
                    if store.settings().close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::state_get,
            commands::state_update,
            commands::state_open_game_root,
            commands::state_open_instance_folder,
            commands::app_info,
            commands::app_open_logo,
            commands::instances_create,
            commands::instances_update,
            commands::instances_select,
            commands::instances_delete,
            commands::mods_toggle,
            commands::mods_remove,
            commands::mods_scan,
            commands::mods_add_local,
            commands::instance_read_log,
            commands::java_list,
            commands::java_choose,
            commands::mc_versions,
            commands::mc_latest_release,
            commands::mc_loaders,
            commands::launch_start,
            commands::launch_kill,
            commands::launch_running,
            commands::modrinth_search,
            commands::modrinth_project,
            commands::modrinth_versions,
            commands::modrinth_install,
            commands::modrinth_install_modpack,
            commands::modrinth_import_mrpack,
            commands::auth_microsoft,
            commands::auth_offline,
            commands::auth_select,
            commands::auth_remove,
            commands::auth_refresh,
            commands::auth_upload_skin,
            commands::auth_get_skin,
            commands::skin_fetch_url,
            commands::update_check,
            commands::update_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Sunspire launcher");
}
