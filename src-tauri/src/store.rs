use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;
use uuid::Uuid;

use crate::error::ApiError;
use crate::models::{
    Account, Instance, LauncherState, ModLoader, PersistedState, Settings, SettingsPatch,
    STATE_VERSION,
};

pub struct Store {
    state: Mutex<PersistedState>,
    data_dir: PathBuf,
    state_file: PathBuf,
}

impl Store {
    pub fn load(data_dir: PathBuf) -> Self {
        let state_file = data_dir.join("launcher-state.json");
        let mut state = fs::read_to_string(&state_file)
            .ok()
            .and_then(|raw| serde_json::from_str::<PersistedState>(&raw).ok())
            .unwrap_or_default();
        if state.accounts.is_empty() && state.instances.is_empty() {
            if let Some(legacy) = load_legacy(&data_dir, &state_file) {
                if !legacy.accounts.is_empty() || !legacy.instances.is_empty() {
                    state = legacy;
                }
            }
        }
        state.version = STATE_VERSION;
        repair(&mut state);
        let store = Self {
            state: Mutex::new(state),
            data_dir,
            state_file,
        };
        store.save();
        store
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn state_file(&self) -> &Path {
        &self.state_file
    }

    pub fn game_root(&self) -> PathBuf {
        let guard = self.state.lock().unwrap();
        if guard.settings.data_dir.trim().is_empty() {
            self.data_dir.clone()
        } else {
            PathBuf::from(guard.settings.data_dir.trim())
        }
    }

    pub fn instance_dir(&self, instance_id: &str) -> PathBuf {
        self.game_root().join("instances").join(instance_id)
    }

    pub fn ensure_game_dirs(&self, instance_id: &str) -> PathBuf {
        let dir = self.instance_dir(instance_id);
        for sub in [
            "mods",
            "resourcepacks",
            "shaderpacks",
            "saves",
            "logs",
            "config",
            "datapacks",
        ] {
            let _ = fs::create_dir_all(dir.join(sub));
        }
        let _ = fs::create_dir_all(self.game_root().join("assets"));
        let _ = fs::create_dir_all(self.game_root().join("libraries"));
        let _ = fs::create_dir_all(self.game_root().join("versions"));
        let _ = fs::create_dir_all(self.game_root().join("meta"));
        let _ = fs::create_dir_all(self.game_root().join("java"));
        dir
    }

    pub fn public_state(&self) -> LauncherState {
        let guard = self.state.lock().unwrap();
        LauncherState {
            settings: guard.settings.clone(),
            accounts: guard.accounts.iter().map(Account::public).collect(),
            instances: guard.instances.clone(),
            active_account_id: guard.active_account_id.clone(),
            active_instance_id: guard.active_instance_id.clone(),
            game_root: self.game_root_locked(&guard).to_string_lossy().to_string(),
            state_file: self.state_file.to_string_lossy().to_string(),
            version: guard.version,
        }
    }

    fn game_root_locked(&self, state: &PersistedState) -> PathBuf {
        if state.settings.data_dir.trim().is_empty() {
            self.data_dir.clone()
        } else {
            PathBuf::from(state.settings.data_dir.trim())
        }
    }

    pub fn update_settings(&self, patch: SettingsPatch) -> LauncherState {
        {
            let mut guard = self.state.lock().unwrap();
            let settings = &mut guard.settings;
            if let Some(value) = patch.java_path {
                settings.java_path = value;
            }
            if let Some(value) = patch.default_ram_mb {
                settings.default_ram_mb = value.clamp(1024, 65536);
            }
            if let Some(value) = patch.auto_download_java {
                settings.auto_download_java = value;
            }
            if let Some(value) = patch.crt_effect {
                settings.crt_effect = value;
            }
            if let Some(value) = patch.show_console_on_launch {
                settings.show_console_on_launch = value;
            }
            if let Some(value) = patch.close_launcher_on_game_start {
                settings.close_launcher_on_game_start = value;
            }
            if let Some(value) = patch.close_to_tray {
                settings.close_to_tray = value;
            }
            if let Some(value) = patch.discord_rpc {
                settings.discord_rpc = value;
            }
            if let Some(value) = patch.discord_client_id {
                settings.discord_client_id = value;
            }
            if let Some(value) = patch.auto_update {
                settings.auto_update = value;
            }
            if let Some(value) = patch.theme {
                settings.theme = value;
            }
            if let Some(value) = patch.data_dir {
                settings.data_dir = value;
            }
            if let Some(value) = patch.offline_skin_data_url {
                settings.offline_skin_data_url = value;
            }
        }
        self.save();
        self.public_state()
    }

    pub fn settings(&self) -> Settings {
        self.state.lock().unwrap().settings.clone()
    }

    pub fn accounts(&self) -> Vec<Account> {
        self.state.lock().unwrap().accounts.clone()
    }

    pub fn account(&self, id: &str) -> Option<Account> {
        self.state
            .lock()
            .unwrap()
            .accounts
            .iter()
            .find(|account| account.id == id)
            .cloned()
    }

    pub fn active_account(&self) -> Option<Account> {
        let guard = self.state.lock().unwrap();
        guard
            .active_account_id
            .as_ref()
            .and_then(|id| guard.accounts.iter().find(|account| &account.id == id))
            .cloned()
    }

    pub fn upsert_account(&self, account: Account) -> Account {
        {
            let mut guard = self.state.lock().unwrap();
            if let Some(existing) = guard.accounts.iter_mut().find(|item| item.id == account.id) {
                *existing = account.clone();
            } else {
                guard.accounts.push(account.clone());
            }
        }
        self.save();
        account
    }

    pub fn remove_account(&self, id: &str) -> LauncherState {
        {
            let mut guard = self.state.lock().unwrap();
            guard.accounts.retain(|account| account.id != id);
            if guard.active_account_id.as_deref() == Some(id) {
                guard.active_account_id = guard.accounts.first().map(|account| account.id.clone());
            }
        }
        self.save();
        self.public_state()
    }

    pub fn set_active_account(&self, id: &str) -> bool {
        let changed = {
            let mut guard = self.state.lock().unwrap();
            if guard.accounts.iter().any(|account| account.id == id) {
                guard.active_account_id = Some(id.to_string());
                true
            } else {
                false
            }
        };
        if changed {
            self.save();
        }
        changed
    }

    pub fn instances(&self) -> Vec<Instance> {
        self.state.lock().unwrap().instances.clone()
    }

    pub fn instance(&self, id: &str) -> Option<Instance> {
        self.state
            .lock()
            .unwrap()
            .instances
            .iter()
            .find(|instance| instance.id == id)
            .cloned()
    }

    pub fn active_instance(&self) -> Option<Instance> {
        let guard = self.state.lock().unwrap();
        guard
            .active_instance_id
            .as_ref()
            .and_then(|id| guard.instances.iter().find(|instance| &instance.id == id))
            .cloned()
    }

    pub fn upsert_instance(&self, instance: Instance) -> Instance {
        {
            let mut guard = self.state.lock().unwrap();
            if let Some(existing) = guard
                .instances
                .iter_mut()
                .find(|item| item.id == instance.id)
            {
                *existing = instance.clone();
            } else {
                guard.instances.insert(0, instance.clone());
            }
            if guard.active_instance_id.is_none() {
                guard.active_instance_id = Some(instance.id.clone());
            }
        }
        self.save();
        instance
    }

    pub fn remove_instance(&self, id: &str) -> LauncherState {
        {
            let mut guard = self.state.lock().unwrap();
            guard.instances.retain(|instance| instance.id != id);
            if guard.active_instance_id.as_deref() == Some(id) {
                guard.active_instance_id = guard.instances.first().map(|instance| instance.id.clone());
            }
        }
        self.save();
        self.public_state()
    }

    pub fn set_active_instance(&self, id: &str) -> bool {
        let changed = {
            let mut guard = self.state.lock().unwrap();
            if guard.instances.iter().any(|instance| instance.id == id) {
                guard.active_instance_id = Some(id.to_string());
                true
            } else {
                false
            }
        };
        if changed {
            self.save();
        }
        changed
    }

    pub fn update_instance(&self, id: &str, patch: Value) -> Result<Instance, ApiError> {
        let updated = {
            let mut guard = self.state.lock().unwrap();
            let Some(instance) = guard.instances.iter_mut().find(|item| item.id == id) else {
                return Err(ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"));
            };
            if let Some(value) = patch.get("name").and_then(Value::as_str) {
                let name = value.trim().chars().take(60).collect::<String>();
                if !name.is_empty() {
                    instance.name = name;
                }
            }
            if let Some(value) = patch.get("ramMb").and_then(Value::as_u64) {
                instance.ram_mb = (value as u32).clamp(1024, 32768);
            }
            if let Some(value) = patch.get("javaArgs").and_then(Value::as_str) {
                instance.java_args = value.chars().take(1000).collect();
            }
            if let Some(value) = patch.get("javaPath").and_then(Value::as_str) {
                instance.java_path = value.to_string();
            }
            if let Some(value) = patch.get("server").and_then(Value::as_str) {
                instance.server = value.chars().take(200).collect();
            }
            if let Some(value) = patch.get("icon").and_then(Value::as_str) {
                if ["grass", "diamond", "gold", "redstone", "ender", "amethyst", "stone"]
                    .contains(&value)
                {
                    instance.icon = value.to_string();
                }
            }
            instance.clone()
        };
        self.save();
        Ok(updated)
    }

    pub fn touch_launch(&self, id: &str, elapsed_ms: u64) {
        {
            let mut guard = self.state.lock().unwrap();
            if let Some(instance) = guard.instances.iter_mut().find(|item| item.id == id) {
                instance.last_played_at = Some(chrono::Utc::now().to_rfc3339());
                instance.total_play_ms = instance.total_play_ms.saturating_add(elapsed_ms);
            }
        }
        self.save();
    }

    pub fn save(&self) {
        let guard = self.state.lock().unwrap();
        let _ = fs::create_dir_all(&self.data_dir);
        let Ok(json) = serde_json::to_string_pretty(&*guard) else {
            return;
        };
        let tmp = self.state_file.with_extension("json.tmp");
        if fs::write(&tmp, json).is_ok() {
            let _ = fs::rename(&tmp, &self.state_file);
        }
    }

    pub fn new_id(prefix: &str) -> String {
        format!("{}-{}", prefix, Uuid::new_v4().simple())
    }
}

fn load_legacy(data_dir: &Path, current: &Path) -> Option<PersistedState> {
    let parent = data_dir.parent()?;
    let candidates = [
        parent.join("Electron").join("launcher-state.json"),
        parent.join("RetroCraft").join("launcher-state.json"),
        parent.join("sunspire-launcher").join("launcher-state.json"),
        parent.join("Sunspire").join("launcher-state.json"),
        current.to_path_buf(),
    ];
    for candidate in candidates {
        if candidate == current {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&candidate) else {
            continue;
        };
        if let Ok(parsed) = serde_json::from_str::<PersistedState>(&raw) {
            return Some(parsed);
        }
    }
    None
}

pub fn default_instance_name(loader: &ModLoader, mc_version: &str) -> String {
    let version = mc_version.trim();
    let version = if version.is_empty() { "Minecraft" } else { version };
    match loader {
        ModLoader::Vanilla => format!("Minecraft {version}"),
        ModLoader::Fabric => format!("Fabric {version}"),
        ModLoader::Quilt => format!("Quilt {version}"),
        ModLoader::Forge => format!("Forge {version}"),
        ModLoader::Neoforge => format!("NeoForge {version}"),
    }
}

fn is_technical_instance_name(name: &str, mc_version: &str) -> bool {
    let trimmed = name.trim();
    trimmed.is_empty()
        || trimmed.to_ascii_lowercase().starts_with("instance-")
        || (!mc_version.trim().is_empty() && trimmed.eq_ignore_ascii_case(mc_version.trim()))
}

fn repair(state: &mut PersistedState) {
    state.accounts.retain(|account| !account.id.trim().is_empty());
    state.instances.retain(|instance| !instance.id.trim().is_empty());
    for instance in &mut state.instances {
        if is_technical_instance_name(&instance.name, &instance.mc_version) {
            instance.name = default_instance_name(&instance.loader, &instance.mc_version);
        }
    }
    if let Some(id) = state.active_account_id.clone() {
        if !state.accounts.iter().any(|account| account.id == id) {
            state.active_account_id = state.accounts.first().map(|account| account.id.clone());
        }
    }
    if let Some(id) = state.active_instance_id.clone() {
        if !state.instances.iter().any(|instance| instance.id == id) {
            state.active_instance_id = state.instances.first().map(|instance| instance.id.clone());
        }
    }
    state.settings.default_ram_mb = state.settings.default_ram_mb.clamp(1024, 65536);
}
