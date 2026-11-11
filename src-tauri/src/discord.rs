use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use discord_rich_presence::activity::{Activity, ActivityType, Assets};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};

pub const DEFAULT_CLIENT_ID: &str = "1570081050732793906";

#[derive(Clone, Debug, Default)]
pub enum Presence {
    #[default]
    Idle,
    Launching {
        instance: String,
        version: String,
    },
    Playing {
        instance: String,
        version: String,
        location: String,
    },
}

#[derive(Clone)]
struct Config {
    enabled: bool,
    client_id: String,
}

pub struct DiscordManager {
    config: Arc<Mutex<Config>>,
    presence: Arc<Mutex<Presence>>,
}

impl DiscordManager {
    pub fn new() -> Self {
        let manager = Self {
            config: Arc::new(Mutex::new(Config {
                enabled: true,
                client_id: DEFAULT_CLIENT_ID.to_string(),
            })),
            presence: Arc::new(Mutex::new(Presence::Idle)),
        };

        let config = manager.config.clone();
        let presence = manager.presence.clone();
        thread::Builder::new()
            .name("sunspire-discord".into())
            .spawn(move || worker(config, presence))
            .ok();

        manager
    }

    pub fn configure(&self, enabled: bool, client_id: &str) {
        let mut config = self.config.lock().unwrap();
        config.enabled = enabled;
        let trimmed = client_id.trim();
        config.client_id = if trimmed.is_empty() {
            DEFAULT_CLIENT_ID.to_string()
        } else {
            trimmed.to_string()
        };
    }

    pub fn set(&self, presence: Presence) {
        *self.presence.lock().unwrap() = presence;
    }
}

fn worker(config: Arc<Mutex<Config>>, presence: Arc<Mutex<Presence>>) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut last: Option<String> = None;
    loop {
        let (enabled, client_id) = {
            let config = config.lock().unwrap();
            (config.enabled, config.client_id.clone())
        };
        if !enabled {
            if let Some(mut connected) = client.take() {
                let _ = connected.clear_activity();
                let _ = connected.close();
            }
            last = None;
            thread::sleep(Duration::from_secs(3));
            continue;
        }

        if client.is_none() {
            let mut fresh = DiscordIpcClient::new(&client_id);
            if fresh.connect().is_ok() {
                client = Some(fresh);
            } else {
                thread::sleep(Duration::from_secs(5));
                continue;
            }
        }

        let current = presence.lock().unwrap().clone();
        let activity = build_activity(&current);
        let key = format!("{current:?}");
        if last.as_deref() != Some(key.as_str()) {
            if let Some(connected) = client.as_mut() {
                if connected.set_activity(activity).is_err() {
                    client = None;
                } else {
                    last = Some(key);
                }
            }
        }
        thread::sleep(Duration::from_secs(2));
    }
}

fn build_activity(presence: &Presence) -> Activity<'static> {
    let mut activity = Activity::new()
        .name("Sunspire")
        .activity_type(ActivityType::Playing)
        .assets(
            Assets::new()
                .large_image("logo")
                .large_text("Sunspire Minecraft Launcher"),
        );
    match presence {
        Presence::Idle => {
            activity = activity.details("В лаунчере").state("Готов к запуску");
        }
        Presence::Launching { instance, version } => {
            activity = activity
                .details(format!("Запускает {instance}"))
                .state(format!("Minecraft {version}"));
        }
        Presence::Playing {
            instance,
            version,
            location,
        } => {
            let (details, state) = if let Some(server) = location.strip_prefix("server:") {
                (format!("Сервер: {server}"), format!("{instance} · Minecraft {version}"))
            } else if location == "singleplayer" {
                ("Одиночная игра".to_string(), format!("{instance} · Minecraft {version}"))
            } else {
                ("В игре".to_string(), format!("{instance} · Minecraft {version}"))
            };
            activity = activity.details(details).state(state);
        }
    }
    activity
}
