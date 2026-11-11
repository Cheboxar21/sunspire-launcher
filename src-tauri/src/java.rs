use std::collections::HashSet;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::error::ApiError;
use crate::models::JavaInfo;
use crate::store::Store;

struct Cache {
    at: Instant,
    list: Vec<JavaInfo>,
}

static CACHE: OnceLock<Mutex<Option<Cache>>> = OnceLock::new();

fn cache() -> &'static Mutex<Option<Cache>> {
    CACHE.get_or_init(|| Mutex::new(None))
}

pub fn parse_java_version(text: &str) -> Option<(String, u32, String)> {
    let mut version = String::new();
    let mut vendor = String::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("java.version =") {
            version = value.trim().to_string();
        } else if let Some(value) = line.strip_prefix("java.runtime.version =") {
            if version.is_empty() {
                version = value.trim().to_string();
            }
        } else if let Some(value) = line.strip_prefix("java.vendor =") {
            vendor = value.trim().to_string();
        }
    }
    if version.is_empty() {
        return None;
    }
    let major = if let Some(rest) = version.strip_prefix("1.") {
        rest.split('.').next()?.parse().ok()?
    } else {
        version
            .split(['.', '_', '-'])
            .next()?
            .parse()
            .ok()?
    };
    Some((version, major, vendor))
}

pub fn inspect_java(java_exe: &Path) -> Option<JavaInfo> {
    if !java_exe.is_file() {
        return None;
    }
    let output = Command::new(java_exe)
        .args(["-XshowSettings:properties", "-version"])
        .creation_flags(0x08000000)
        .output()
        .ok()?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let (version, major, vendor) = parse_java_version(&text)?;
    let real = fs::canonicalize(java_exe).unwrap_or_else(|_| java_exe.to_path_buf());
    let path = real.to_string_lossy();
    let path = path.strip_prefix(r"\\?\").unwrap_or(&path).to_string();
    Some(JavaInfo {
        path,
        version,
        major,
        vendor,
        source: "detected".into(),
    })
}

fn which_java() -> Vec<PathBuf> {
    let mut found = Vec::new();
    for name in ["java.exe", "javaw.exe"] {
        if let Ok(output) = Command::new("where.exe")
            .arg(name)
            .creation_flags(0x08000000)
            .output()
        {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let line = line.trim();
                if !line.is_empty() {
                    found.push(PathBuf::from(line));
                }
            }
        }
    }
    found
}

fn walk_for_java(dir: &Path, depth: u32, results: &mut Vec<PathBuf>) {
    if depth == 0 {
        return;
    }
    let java = dir.join("bin").join("java.exe");
    if java.is_file() {
        results.push(java);
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if matches!(
            name.as_str(),
            "node_modules" | ".git" | "Windows" | "WinSxS" | "System32" | "SysWOW64"
        ) {
            continue;
        }
        walk_for_java(&path, depth - 1, results);
    }
}

fn default_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
    let program_files_x86 =
        std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let app_data = std::env::var("APPDATA").unwrap_or_default();
    let vendors = [
        "Java",
        "Eclipse Adoptium",
        "Eclipse Foundation",
        "Microsoft",
        "Zulu",
        "BellSoft",
        "Amazon Corretto",
        "OpenJDK",
        "AdoptOpenJDK",
        "Semeru",
        "Temurin",
        "JetBrains",
    ];
    for vendor in vendors {
        roots.push(Path::new(&program_files).join(vendor));
        roots.push(Path::new(&program_files_x86).join(vendor));
        if !local_app_data.is_empty() {
            roots.push(Path::new(&local_app_data).join("Programs").join(vendor));
            roots.push(Path::new(&local_app_data).join(vendor));
        }
    }
    if !app_data.is_empty() {
        roots.push(Path::new(&app_data).join(".minecraft").join("runtime"));
        roots.push(Path::new(&app_data).join(".minecraft").join("java"));
    }
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        roots.push(PathBuf::from(java_home));
    }
    roots
}

pub fn detect_java(extra_roots: &[PathBuf]) -> Vec<JavaInfo> {
    {
        let guard = cache().lock().unwrap();
        if let Some(cached) = guard.as_ref() {
            if cached.at.elapsed() < Duration::from_secs(45) {
                return cached.list.clone();
            }
        }
    }

    let mut candidates = which_java();
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        candidates.push(Path::new(&java_home).join("bin").join("java.exe"));
    }
    for root in default_roots().into_iter().chain(extra_roots.iter().cloned()) {
        walk_for_java(&root, 3, &mut candidates);
    }

    let mut seen = HashSet::new();
    let mut list = Vec::new();
    for candidate in candidates {
        if !candidate.is_file() {
            continue;
        }
        let key = candidate.to_string_lossy().to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        if let Some(info) = inspect_java(&candidate) {
            let path_key = info.path.to_lowercase();
            if list.iter().any(|item: &JavaInfo| item.path.to_lowercase() == path_key) {
                continue;
            }
            list.push(info);
        }
    }
    list.sort_by(|a, b| b.major.cmp(&a.major).then_with(|| b.version.cmp(&a.version)));
    *cache().lock().unwrap() = Some(Cache {
        at: Instant::now(),
        list: list.clone(),
    });
    list
}

pub fn choose_java(list: &[JavaInfo], required_major: u32) -> Option<JavaInfo> {
    if list.is_empty() {
        return None;
    }
    if let Some(exact) = list.iter().find(|item| item.major == required_major) {
        return Some(exact.clone());
    }
    let mut newer: Vec<&JavaInfo> = list.iter().filter(|item| item.major >= required_major).collect();
    newer.sort_by(|a, b| a.major.cmp(&b.major).then_with(|| b.version.cmp(&a.version)));
    if let Some(first) = newer.first() {
        return Some((*first).clone());
    }
    let mut all: Vec<&JavaInfo> = list.iter().collect();
    all.sort_by(|a, b| b.major.cmp(&a.major));
    all.first().map(|item| (*item).clone())
}

pub fn required_java_major(mc_version: &str) -> u32 {
    let parts: Vec<u32> = mc_version
        .split(['.', '-'])
        .filter_map(|part| part.parse::<u32>().ok())
        .collect();
    let (major, minor, patch) = if parts.first() == Some(&1) {
        (1, parts.get(1).copied().unwrap_or(0), parts.get(2).copied().unwrap_or(0))
    } else {
        (parts.first().copied().unwrap_or(0), parts.get(1).copied().unwrap_or(0), parts.get(2).copied().unwrap_or(0))
    };
    if major >= 26 {
        25
    } else if major > 1 || (major == 1 && (minor > 20 || (minor == 20 && patch >= 5))) {
        21
    } else if major == 1 && minor >= 18 {
        17
    } else if major == 1 && minor == 17 {
        16
    } else {
        8
    }
}

fn find_java_in_runtime(runtime_dir: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(runtime_dir).ok()?;
    for entry in entries.flatten() {
        let java = entry.path().join("bin").join("java.exe");
        if java.is_file() {
            return Some(java);
        }
    }
    None
}

fn copy_dir(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let destination = target.join(entry.file_name());
        if path.is_dir() {
            copy_dir(&path, &destination)?;
        } else {
            fs::copy(&path, &destination)?;
        }
    }
    Ok(())
}

fn clear_dir(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // remove_dir succeeds on junctions/reparse points without
                // following them into the target installation.
                let _ = fs::remove_dir(&path).or_else(|_| fs::remove_dir_all(&path));
            } else {
                let _ = fs::remove_file(&path);
            }
        }
    }
}

fn link_or_copy_java(home: &Path, runtime_dir: &Path) -> Result<(), ApiError> {
    clear_dir(runtime_dir);
    fs::create_dir_all(runtime_dir)?;
    let name = home
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("jdk");
    let link = runtime_dir.join(name);
    #[cfg(windows)]
    {
        let status = Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(home)
            .creation_flags(0x08000000)
            .status();
        if status.map(|value| value.success()).unwrap_or(false) {
            return Ok(());
        }
    }
    copy_dir(home, &link).map_err(ApiError::from)
}

async fn download_temurin(major: u32, java_root: &Path) -> Result<PathBuf, ApiError> {
    let runtime_dir = java_root.join(format!("temurin_{major}"));
    if let Some(java) = find_java_in_runtime(&runtime_dir) {
        return Ok(java);
    }
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{major}/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk"
    );
    let client = reqwest::Client::builder()
        .user_agent("SunspireLauncher/1.0.0")
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(ApiError::from)?;
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(ApiError::new(
            format!("Не удалось скачать Java {major} (HTTP {}).", response.status()),
            "JAVA_DOWNLOAD",
        ));
    }
    let bytes = response.bytes().await?;
    fs::create_dir_all(&runtime_dir)?;
    clear_dir(&runtime_dir);
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes.to_vec()))
        .map_err(|error| ApiError::new(error.to_string(), "JAVA_ARCHIVE"))?;
    archive
        .extract(&runtime_dir)
        .map_err(|error| ApiError::new(error.to_string(), "JAVA_ARCHIVE"))?;
    find_java_in_runtime(&runtime_dir).ok_or_else(|| {
        ApiError::new(
            "В архиве Java не найден bin/java.exe.",
            "JAVA_ARCHIVE",
        )
    })
}

pub async fn ensure_local_java(store: &Store, required_major: u32) -> Result<PathBuf, ApiError> {
    let java_root = store.data_dir().join("java");
    fs::create_dir_all(&java_root)?;
    let runtime_dir = java_root.join(format!("temurin_{required_major}"));
    if let Some(java) = find_java_in_runtime(&runtime_dir) {
        return Ok(java);
    }

    let configured = store.settings().java_path;
    let chosen = if !configured.is_empty() {
        inspect_java(Path::new(&configured))
    } else {
        None
    }
    .or_else(|| {
        let list = detect_java(&[java_root.clone()]);
        choose_java(&list, required_major)
    });

    if let Some(info) = chosen {
        let home = Path::new(&info.path)
            .parent()
            .and_then(Path::parent)
            .map(Path::to_path_buf);
        if let Some(home) = home {
            if link_or_copy_java(&home, &runtime_dir).is_ok() {
                if let Some(java) = find_java_in_runtime(&runtime_dir) {
                    return Ok(java);
                }
            }
        }
    }

    download_temurin(required_major, &java_root).await
}

trait CommandExt {
    fn creation_flags(&mut self, flags: u32) -> &mut Self;
}

impl CommandExt for Command {
    fn creation_flags(&mut self, flags: u32) -> &mut Self {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt as WindowsCommandExt;
            WindowsCommandExt::creation_flags(self, flags);
        }
        #[cfg(not(windows))]
        {
            let _ = flags;
        }
        self
    }
}
