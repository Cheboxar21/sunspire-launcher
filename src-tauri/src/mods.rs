use std::fs;
use std::path::{Path, PathBuf};

use crate::error::ApiError;
use crate::models::{InstalledMod, InstanceModCategory};
use crate::store::Store;

pub fn folder_for_category(category: &InstanceModCategory) -> &'static str {
    match category {
        InstanceModCategory::Resourcepack => "resourcepacks",
        InstanceModCategory::Shader => "shaderpacks",
        InstanceModCategory::Datapack => "datapacks",
        InstanceModCategory::Mod => "mods",
    }
}

pub fn format_bytes(bytes: u64) -> String {
    let mut value = bytes as f64;
    let units = ["B", "KB", "MB", "GB"];
    let mut index = 0usize;
    while value >= 1024.0 && index < units.len() - 1 {
        value /= 1024.0;
        index += 1;
    }
    if index == 0 {
        format!("{} {}", value as u64, units[index])
    } else {
        format!("{:.1} {}", value, units[index])
    }
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
}

pub fn toggle_mod(store: &Store, instance_id: &str, mod_id: &str) -> Result<(), ApiError> {
    let mut instance = store
        .instance(instance_id)
        .ok_or_else(|| ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"))?;
    let dir = store.instance_dir(instance_id);
    let Some(record) = instance.mods.iter_mut().find(|item| item.id == mod_id) else {
        return Err(ApiError::new("Файл не найден в списке сборки.", "MOD_NOT_FOUND"));
    };
    let folder = folder_for_category(&record.category);
    let path = dir.join(folder).join(&record.file_name);
    let disabled = PathBuf::from(format!("{}.disabled", path.to_string_lossy()));
    if record.enabled {
        if path.exists() {
            fs::rename(&path, &disabled)?;
        }
        record.enabled = false;
    } else {
        if disabled.exists() {
            fs::rename(&disabled, &path)?;
        }
        record.enabled = true;
    }
    store.upsert_instance(instance);
    Ok(())
}

pub fn remove_mod(store: &Store, instance_id: &str, mod_id: &str) -> Result<(), ApiError> {
    let mut instance = store
        .instance(instance_id)
        .ok_or_else(|| ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"))?;
    let dir = store.instance_dir(instance_id);
    let Some(index) = instance.mods.iter().position(|item| item.id == mod_id) else {
        return Err(ApiError::new("Файл не найден в списке сборки.", "MOD_NOT_FOUND"));
    };
    let record = instance.mods.remove(index);
    let folder = folder_for_category(&record.category);
    let path = dir.join(folder).join(&record.file_name);
    let _ = fs::remove_file(&path);
    let _ = fs::remove_file(format!("{}.disabled", path.to_string_lossy()));
    store.upsert_instance(instance);
    Ok(())
}

pub fn scan_mods(store: &Store, instance_id: &str) -> Result<(), ApiError> {
    let mut instance = store
        .instance(instance_id)
        .ok_or_else(|| ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"))?;
    let dir = store.ensure_game_dirs(instance_id);
    let mut records = instance.mods.clone();

    for category in [
        InstanceModCategory::Mod,
        InstanceModCategory::Resourcepack,
        InstanceModCategory::Shader,
        InstanceModCategory::Datapack,
    ] {
        let folder = folder_for_category(&category);
        let path = dir.join(folder);
        let Ok(entries) = fs::read_dir(&path) else {
            continue;
        };
        for entry in entries.flatten() {
            let Some(name) = entry.file_name().to_str().map(str::to_string) else {
                continue;
            };
            if !(name.ends_with(".jar") || name.ends_with(".zip") || name.ends_with(".disabled")) {
                continue;
            }
            let enabled = !name.ends_with(".disabled");
            let file_name = name.trim_end_matches(".disabled").to_string();
            if records.iter().any(|record| record.file_name == file_name) {
                continue;
            }
            let title = file_name
                .trim_end_matches(".jar")
                .trim_end_matches(".zip")
                .replace(['-', '_'], " ")
                .to_uppercase();
            records.push(InstalledMod {
                id: format!("local-{}", file_name),
                project_id: None,
                version_id: None,
                slug: file_name.to_lowercase(),
                title,
                author: "Локальный файл".into(),
                version: "local".into(),
                file_name,
                size: format_bytes(file_size(&entry.path())),
                enabled,
                category: category.clone(),
                icon_url: String::new(),
                description: "Файл, добавленный вручную.".into(),
            });
        }
    }

    instance.mods = records;
    store.upsert_instance(instance);
    Ok(())
}

pub fn add_local_files(
    store: &Store,
    instance_id: &str,
    paths: &[String],
    kind: &str,
) -> Result<Vec<InstalledMod>, ApiError> {
    let mut instance = store
        .instance(instance_id)
        .ok_or_else(|| ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"))?;
    let dir = store.ensure_game_dirs(instance_id);
    let category = match kind {
        "resourcepack" => InstanceModCategory::Resourcepack,
        "shader" => InstanceModCategory::Shader,
        _ => InstanceModCategory::Mod,
    };
    let folder = folder_for_category(&category);
    let target_dir = dir.join(folder);
    fs::create_dir_all(&target_dir)?;
    let mut added = Vec::new();

    for source in paths {
        let source_path = PathBuf::from(source);
        let Some(file_name) = source_path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let target = target_dir.join(file_name);
        fs::copy(&source_path, &target)?;
        let title = file_name
            .trim_end_matches(".jar")
            .trim_end_matches(".zip")
            .replace(['-', '_'], " ")
            .to_uppercase();
        let record = InstalledMod {
            id: format!("local-{}", file_name),
            project_id: None,
            version_id: None,
            slug: file_name.to_lowercase(),
            title,
            author: "Локальный файл".into(),
            version: "local".into(),
            file_name: file_name.to_string(),
            size: format_bytes(file_size(&target)),
            enabled: true,
            category: category.clone(),
            icon_url: String::new(),
            description: "Файл, добавленный вручную.".into(),
        };
        instance.mods.retain(|item| item.file_name != record.file_name);
        instance.mods.insert(0, record.clone());
        added.push(record);
    }

    store.upsert_instance(instance);
    Ok(added)
}
