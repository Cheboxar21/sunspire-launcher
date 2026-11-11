use serde::{Deserialize, Serialize};

pub const STATE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModLoader {
    Vanilla,
    Fabric,
    Quilt,
    Forge,
    Neoforge,
}

impl Default for ModLoader {
    fn default() -> Self {
        Self::Vanilla
    }
}

impl ModLoader {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Vanilla => "vanilla",
            Self::Fabric => "fabric",
            Self::Quilt => "quilt",
            Self::Forge => "forge",
            Self::Neoforge => "neoforge",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value.to_ascii_lowercase().as_str() {
            "fabric" => Self::Fabric,
            "quilt" => Self::Quilt,
            "forge" => Self::Forge,
            "neoforge" => Self::Neoforge,
            _ => Self::Vanilla,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InstanceModCategory {
    Mod,
    Resourcepack,
    Shader,
    Datapack,
}

impl Default for InstanceModCategory {
    fn default() -> Self {
        Self::Mod
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct InstalledMod {
    pub id: String,
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub slug: String,
    pub title: String,
    pub author: String,
    pub version: String,
    pub file_name: String,
    pub size: String,
    pub enabled: bool,
    pub category: InstanceModCategory,
    pub icon_url: String,
    pub description: String,
}

impl Default for InstalledMod {
    fn default() -> Self {
        Self {
            id: String::new(),
            project_id: None,
            version_id: None,
            slug: String::new(),
            title: String::new(),
            author: "Modrinth".into(),
            version: String::new(),
            file_name: String::new(),
            size: String::new(),
            enabled: true,
            category: InstanceModCategory::Mod,
            icon_url: String::new(),
            description: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ModpackInfo {
    pub project_id: String,
    pub title: String,
    pub icon_url: String,
    pub version_id: String,
    pub version_number: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: ModLoader,
    pub loader_version: String,
    pub ram_mb: u32,
    pub java_args: String,
    pub java_path: String,
    pub icon: String,
    pub icon_url: String,
    pub modpack: Option<ModpackInfo>,
    pub mods: Vec<InstalledMod>,
    pub server: String,
    pub created_at: String,
    pub last_played_at: Option<String>,
    pub total_play_ms: u64,
}

impl Default for Instance {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            mc_version: String::new(),
            loader: ModLoader::Vanilla,
            loader_version: String::new(),
            ram_mb: 4096,
            java_args: String::new(),
            java_path: String::new(),
            icon: "grass".into(),
            icon_url: String::new(),
            modpack: None,
            mods: Vec::new(),
            server: String::new(),
            created_at: String::new(),
            last_played_at: None,
            total_play_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Account {
    pub id: String,
    #[serde(rename = "type")]
    pub account_type: String,
    pub username: String,
    pub uuid: String,
    pub license_label: String,
    pub skin_url: String,
    pub cape_url: String,
    pub slim_arms: bool,
    pub skin_data_url: String,
    pub added_at: Option<String>,
    pub last_login_at: Option<String>,
    // Secrets stay in the local state file, never in public_state().
    pub mc_access_token: Option<String>,
    pub mc_expires_at: Option<i64>,
    pub ms_access_token: Option<String>,
    pub ms_expires_at: Option<i64>,
    pub refresh_token: Option<String>,
    pub xuid: Option<String>,
}

impl Default for Account {
    fn default() -> Self {
        Self {
            id: String::new(),
            account_type: "offline".into(),
            username: String::new(),
            uuid: String::new(),
            license_label: String::new(),
            skin_url: String::new(),
            cape_url: String::new(),
            slim_arms: false,
            skin_data_url: String::new(),
            added_at: None,
            last_login_at: None,
            mc_access_token: None,
            mc_expires_at: None,
            ms_access_token: None,
            ms_expires_at: None,
            refresh_token: None,
            xuid: None,
        }
    }
}

impl Account {
    pub fn public(&self) -> AccountPublic {
        AccountPublic {
            id: self.id.clone(),
            account_type: self.account_type.clone(),
            username: self.username.clone(),
            uuid: self.uuid.clone(),
            license_label: self.license_label.clone(),
            skin_url: self.skin_url.clone(),
            cape_url: self.cape_url.clone(),
            slim_arms: self.slim_arms,
            skin_data_url: self.skin_data_url.clone(),
            added_at: self.added_at.clone(),
            last_login_at: self.last_login_at.clone(),
        }
    }

    pub fn mc_token_valid(&self) -> bool {
        self.mc_access_token.is_some()
            && self.mc_expires_at.unwrap_or(0) > chrono::Utc::now().timestamp_millis() + 5 * 60 * 1000
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountPublic {
    pub id: String,
    #[serde(rename = "type")]
    pub account_type: String,
    pub username: String,
    pub uuid: String,
    pub license_label: String,
    pub skin_url: String,
    pub cape_url: String,
    pub slim_arms: bool,
    pub skin_data_url: String,
    pub added_at: Option<String>,
    pub last_login_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeId {
    Acid,
    Amber,
    Cyan,
    Magenta,
    Mono,
}

impl Default for ThemeId {
    fn default() -> Self {
        Self::Acid
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub java_path: String,
    pub default_ram_mb: u32,
    pub auto_download_java: bool,
    pub crt_effect: bool,
    pub show_console_on_launch: bool,
    pub close_launcher_on_game_start: bool,
    pub close_to_tray: bool,
    pub discord_rpc: bool,
    pub discord_client_id: String,
    pub auto_update: bool,
    pub theme: ThemeId,
    pub data_dir: String,
    pub offline_skin_data_url: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            java_path: String::new(),
            default_ram_mb: 4096,
            auto_download_java: true,
            crt_effect: true,
            show_console_on_launch: false,
            close_launcher_on_game_start: false,
            close_to_tray: true,
            discord_rpc: true,
            discord_client_id: String::new(),
            auto_update: true,
            theme: ThemeId::Acid,
            data_dir: String::new(),
            offline_skin_data_url: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedState {
    pub version: u32,
    pub settings: Settings,
    pub accounts: Vec<Account>,
    pub instances: Vec<Instance>,
    pub active_account_id: Option<String>,
    pub active_instance_id: Option<String>,
}

impl Default for PersistedState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            settings: Settings::default(),
            accounts: Vec::new(),
            instances: Vec::new(),
            active_account_id: None,
            active_instance_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherState {
    pub settings: Settings,
    pub accounts: Vec<AccountPublic>,
    pub instances: Vec<Instance>,
    pub active_account_id: Option<String>,
    pub active_instance_id: Option<String>,
    pub game_root: String,
    pub state_file: String,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct JavaInfo {
    pub path: String,
    pub version: String,
    pub major: u32,
    pub vendor: String,
    pub source: String,
}

impl Default for JavaInfo {
    fn default() -> Self {
        Self {
            path: String::new(),
            version: String::new(),
            major: 0,
            vendor: String::new(),
            source: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub version: String,
    pub electron: String,
    pub chrome: String,
    pub node: String,
    pub platform: String,
    pub arch: String,
    pub total_mem_mb: u64,
    pub free_mem_mb: u64,
    pub cpus: usize,
    pub game_root: String,
    pub user_data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgress {
    pub kind: String,
    pub instance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<u8>,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchProgress {
    pub instance_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counts: Option<Counts>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub current: u64,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchEventState {
    pub state: String,
    pub instance_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elapsed_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub line: String,
    pub at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinData {
    pub skin_data_url: Option<String>,
    pub cape_data_url: Option<String>,
    pub slim_arms: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstanceInput {
    pub name: String,
    pub mc_version: String,
    pub loader: ModLoader,
    #[serde(default)]
    pub loader_version: String,
    pub ram_mb: u32,
    pub icon: String,
    #[serde(default)]
    pub server: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstancePatch {
    pub name: Option<String>,
    pub ram_mb: Option<u32>,
    pub java_args: Option<String>,
    pub java_path: Option<String>,
    pub server: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub java_path: Option<String>,
    pub default_ram_mb: Option<u32>,
    pub auto_download_java: Option<bool>,
    pub crt_effect: Option<bool>,
    pub show_console_on_launch: Option<bool>,
    pub close_launcher_on_game_start: Option<bool>,
    pub close_to_tray: Option<bool>,
    pub discord_rpc: Option<bool>,
    pub discord_client_id: Option<String>,
    pub auto_update: Option<bool>,
    pub theme: Option<ThemeId>,
    pub data_dir: Option<String>,
    pub offline_skin_data_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatePatch {
    pub settings: Option<SettingsPatch>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub query: Option<String>,
    pub project_type: Option<String>,
    pub game_version: Option<String>,
    pub loader: Option<String>,
    pub category: Option<String>,
    pub sort: Option<String>,
    pub offset: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VersionFilters {
    pub game_version: Option<String>,
    pub loader: Option<String>,
    pub project_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstallOptions {
    pub instance_id: String,
    pub project_id: String,
    pub version_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModpackInstallOptions {
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub name: Option<String>,
}
