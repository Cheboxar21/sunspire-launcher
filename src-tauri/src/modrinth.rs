use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use tokio::io::AsyncWriteExt;
use zip::ZipArchive;

use crate::error::ApiError;
use crate::mods::{folder_for_category, format_bytes};
use crate::models::{Instance, InstalledMod, InstanceModCategory, ModLoader, ModpackInfo, ModpackInstallOptions};
use crate::store::Store;

const API: &str = "https://api.modrinth.com/v2";

fn client() -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .user_agent("SunspireLauncher/1.0.0 (local desktop launcher)")
        .build()
        .map_err(ApiError::from)
}

fn project_type_to_category(value: &str) -> InstanceModCategory {
    match value {
        "resourcepack" => InstanceModCategory::Resourcepack,
        "shader" => InstanceModCategory::Shader,
        "datapack" => InstanceModCategory::Datapack,
        _ => InstanceModCategory::Mod,
    }
}

async fn get_json(client: &reqwest::Client, url: &str) -> Result<Value, ApiError> {
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(ApiError::new(
            format!("Modrinth вернул HTTP {}", response.status()),
            "MODRINTH_ERROR",
        ));
    }
    Ok(response.json().await?)
}

async fn get_versions(
    client: &reqwest::Client,
    project_id: &str,
    game_version: Option<&str>,
    loader: Option<&str>,
    project_type: Option<&str>,
) -> Result<Vec<Value>, ApiError> {
    let mut params: Vec<(&str, String)> = Vec::new();
    if let Some(version) = game_version {
        params.push(("game_versions", serde_json::to_string(&[version])?));
    }
    if let Some(loader) = loader {
        if matches!(project_type, Some("mod") | Some("modpack")) {
            params.push(("loaders", serde_json::to_string(&[loader.to_ascii_lowercase()])?));
        }
    }
    let url = format!(
        "{API}/project/{}/version{}",
        urlencoding(project_id),
        if params.is_empty() {
            String::new()
        } else {
            format!(
                "?{}",
                params
                    .iter()
                    .map(|(key, value)| format!("{key}={}", urlencoding(value)))
                    .collect::<Vec<_>>()
                    .join("&")
            )
        }
    );
    let data = get_json(client, &url).await?;
    Ok(data.as_array().cloned().unwrap_or_default())
}

async fn get_project(client: &reqwest::Client, project_id: &str) -> Result<Value, ApiError> {
    get_json(client, &format!("{API}/project/{}", urlencoding(project_id))).await
}

async fn project_author(client: &reqwest::Client, project: &Value) -> String {
    let Some(team) = project.get("team").and_then(Value::as_str) else {
        return "Modrinth".into();
    };
    let Ok(members) = get_json(client, &format!("{API}/team/{}/members", urlencoding(team))).await else {
        return "Modrinth".into();
    };
    members
        .as_array()
        .and_then(|list| {
            list.iter()
                .find(|member| {
                    member
                        .get("role")
                        .and_then(Value::as_str)
                        .map(|role| role.eq_ignore_ascii_case("owner"))
                        .unwrap_or(false)
                })
                .or_else(|| list.first())
        })
        .and_then(|member| member.pointer("/user/username"))
        .and_then(Value::as_str)
        .unwrap_or("Modrinth")
        .to_string()
}

pub async fn search(options: &crate::models::SearchOptions) -> Result<Value, ApiError> {
    let type_name = options.project_type.as_deref().unwrap_or("mod");
    let limit = options.limit.unwrap_or(20).clamp(1, 40);
    let offset = options.offset.unwrap_or(0);
    let mut facets = vec![vec![format!("project_type:{type_name}")]];
    if let Some(version) = options.game_version.as_deref().filter(|value| !value.is_empty()) {
        facets.push(vec![format!("versions:{version}")]);
    }
    if let Some(loader) = options.loader.as_deref().filter(|value| !value.is_empty()) {
        if matches!(type_name, "mod" | "modpack") {
            facets.push(vec![format!("categories:{}", loader.to_ascii_lowercase())]);
        }
    }
    if let Some(category) = options.category.as_deref().filter(|value| !value.is_empty()) {
        facets.push(vec![format!("categories:{}", category.to_ascii_lowercase())]);
    }
    let url = format!(
        "{API}/search?query={}&limit={limit}&offset={offset}&index={}&facets={}",
        urlencoding(options.query.as_deref().unwrap_or("")),
        options.sort.as_deref().unwrap_or("relevance"),
        urlencoding(&serde_json::to_string(&facets)?)
    );
    let client = client()?;
    let data = get_json(&client, &url).await?;
    Ok(json!({
        "hits": data.get("hits").cloned().unwrap_or_else(|| json!([])),
        "total": data.get("total_hits").cloned().unwrap_or_else(|| json!(0)),
        "offset": data.get("offset").cloned().unwrap_or_else(|| json!(offset)),
        "limit": data.get("limit").cloned().unwrap_or_else(|| json!(limit)),
    }))
}

pub async fn project(project_id: &str) -> Result<Value, ApiError> {
    let client = client()?;
    let mut data = get_project(&client, project_id).await?;
    let versions = get_versions(&client, project_id, None, None, None)
        .await
        .unwrap_or_default();
    let author = project_author(&client, &data).await;
    if let Some(object) = data.as_object_mut() {
        object.insert("author".into(), Value::String(author));
        object.insert("versions".into(), Value::Array(versions));
    }
    Ok(data)
}

pub async fn versions(
    project_id: &str,
    filters: &crate::models::VersionFilters,
) -> Result<Value, ApiError> {
    let client = client()?;
    let list = get_versions(
        &client,
        project_id,
        filters.game_version.as_deref(),
        filters.loader.as_deref(),
        filters.project_type.as_deref(),
    )
    .await?;
    Ok(Value::Array(list))
}

fn primary_file(version: &Value) -> Option<&Value> {
    let files = version.get("files")?.as_array()?;
    files
        .iter()
        .find(|file| file.get("primary").and_then(Value::as_bool).unwrap_or(false))
        .or_else(|| files.first())
}

async fn pick_version(
    client: &reqwest::Client,
    project: &Value,
    instance: &Instance,
    explicit: Option<&str>,
) -> Result<Value, ApiError> {
    if let Some(version_id) = explicit {
        return get_json(client, &format!("{API}/version/{}", urlencoding(version_id))).await;
    }
    let project_type = project
        .get("project_type")
        .and_then(Value::as_str)
        .unwrap_or("mod");
    let mut list = get_versions(
        client,
        project.get("id").and_then(Value::as_str).unwrap_or(""),
        Some(&instance.mc_version),
        Some(instance.loader.as_str()),
        Some(project_type),
    )
    .await?;
    if list.is_empty() && matches!(project_type, "resourcepack" | "shader" | "datapack") {
        list = get_versions(
            client,
            project.get("id").and_then(Value::as_str).unwrap_or(""),
            None,
            None,
            Some(project_type),
        )
        .await?;
    }
    list.into_iter().next().ok_or_else(|| {
        ApiError::new(
            format!(
                "Нет версии «{}», совместимой с Minecraft {} ({}).",
                project.get("title").and_then(Value::as_str).unwrap_or("проект"),
                instance.mc_version,
                instance.loader.as_str()
            ),
            "NO_COMPATIBLE_VERSION",
        )
    })
}

fn record_from_project(project: &Value, version: &Value, category: InstanceModCategory, file: &Value, file_name: &str) -> InstalledMod {
    InstalledMod {
        id: format!(
            "{}-{}",
            project.get("id").and_then(Value::as_str).unwrap_or("project"),
            version.get("id").and_then(Value::as_str).unwrap_or("version")
        ),
        project_id: project.get("id").and_then(Value::as_str).map(str::to_string),
        version_id: version.get("id").and_then(Value::as_str).map(str::to_string),
        slug: project
            .get("slug")
            .and_then(Value::as_str)
            .unwrap_or("project")
            .to_string(),
        title: project
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or(file_name)
            .to_string(),
        author: project
            .get("author")
            .and_then(Value::as_str)
            .unwrap_or("Modrinth")
            .to_string(),
        version: version
            .get("version_number")
            .or_else(|| version.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("latest")
            .to_string(),
        file_name: file_name.to_string(),
        size: format_bytes(file.get("size").and_then(Value::as_u64).unwrap_or(0)),
        enabled: true,
        category,
        icon_url: project
            .get("icon_url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        description: project
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
    }
}

async fn download_file(
    client: &reqwest::Client,
    url: &str,
    target: &Path,
    sha1: Option<&str>,
) -> Result<(), ApiError> {
    if target.exists() {
        if let Some(expected) = sha1 {
            if let Ok(existing) = sha1_file(target) {
                if existing.eq_ignore_ascii_case(expected) {
                    return Ok(());
                }
            }
        } else {
            return Ok(());
        }
    }
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let part = target.with_extension(format!(
        "{}part",
        target
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!("{value}."))
            .unwrap_or_default()
    ));
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(ApiError::new(
            format!("Не удалось скачать файл (HTTP {})", response.status()),
            "DOWNLOAD_ERROR",
        ));
    }
    let mut file = tokio::fs::File::create(&part).await?;
    let mut hasher = Sha1::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
    }
    file.flush().await?;
    drop(file);
    if let Some(expected) = sha1 {
        let actual = hex::encode(hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(ApiError::new(
                format!("Контрольная сумма файла не совпала: {}", target.display()),
                "CHECKSUM_ERROR",
            ));
        }
    }
    tokio::fs::rename(&part, target).await?;
    Ok(())
}

fn sha1_file(path: &Path) -> Result<String, std::io::Error> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha1::new();
    let mut buffer = [0u8; 8192];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub async fn install(store: &Store, options: &crate::models::InstallOptions) -> Result<Value, ApiError> {
    let instance = store
        .instance(&options.instance_id)
        .ok_or_else(|| ApiError::new("Сборка не найдена.", "INSTANCE_NOT_FOUND"))?;
    let client = client()?;
    let project = get_project(&client, &options.project_id).await?;
    if project.get("project_type").and_then(Value::as_str) == Some("modpack") {
        return install_modpack(
            store,
            &ModpackInstallOptions {
                project_id: Some(options.project_id.clone()),
                version_id: options.version_id.clone(),
                name: None,
            },
        )
        .await;
    }
    let project_type = project
        .get("project_type")
        .and_then(Value::as_str)
        .unwrap_or("mod");
    let category = project_type_to_category(project_type);
    if category == InstanceModCategory::Mod && instance.loader == ModLoader::Vanilla {
        return Err(ApiError::new(
            "Для установки модов нужна сборка с Fabric, Quilt, Forge или NeoForge.",
            "NO_LOADER",
        ));
    }
    let version = pick_version(&client, &project, &instance, options.version_id.as_deref()).await?;
    let file = primary_file(&version).ok_or_else(|| {
        ApiError::new("У выбранной версии проекта нет файла для скачивания.", "NO_FILE")
    })?;
    let file_url = file
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::new("У файла нет ссылки.", "NO_FILE"))?;
    let file_name = file
        .get("filename")
        .and_then(Value::as_str)
        .map(|name| name.to_string())
        .unwrap_or_else(|| {
            format!(
                "{}-{}.{}",
                project.get("slug").and_then(Value::as_str).unwrap_or("project"),
                version.get("version_number").and_then(Value::as_str).unwrap_or("latest"),
                if category == InstanceModCategory::Mod { "jar" } else { "zip" }
            )
        });
    let author = project_author(&client, &project).await;
    let mut project = project;
    if let Some(object) = project.as_object_mut() {
        object.insert("author".into(), Value::String(author));
    }
    let dir = store.ensure_game_dirs(&instance.id);
    let folder = folder_for_category(&category);
    let target = dir.join(folder).join(&file_name);
    download_file(
        &client,
        file_url,
        &target,
        file.pointer("/hashes/sha1").and_then(Value::as_str),
    )
    .await?;
    let record = record_from_project(&project, &version, category.clone(), file, &file_name);
    let mut mods = instance.mods.clone();
    mods.retain(|item| item.project_id.as_deref() != Some(&options.project_id));
    let mut installed = vec![record.clone()];
    mods.insert(0, record);

    let mut warnings = Vec::new();
    let mut handled: HashSet<String> = [options.project_id.clone()].into_iter().collect();
    let dependencies = version
        .get("dependencies")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for dependency in dependencies {
        if dependency.get("dependency_type").and_then(Value::as_str) != Some("required") {
            continue;
        }
        let Some(dep_project_id) = dependency.get("project_id").and_then(Value::as_str) else {
            continue;
        };
        if handled.contains(dep_project_id) {
            continue;
        }
        handled.insert(dep_project_id.to_string());
        let dep_result: Result<InstalledMod, ApiError> = async {
            let dep_project = get_project(&client, dep_project_id).await?;
            let dep_category = project_type_to_category(
                dep_project.get("project_type").and_then(Value::as_str).unwrap_or("mod"),
            );
            let dep_version = pick_version(
                &client,
                &dep_project,
                &instance,
                dependency.get("version_id").and_then(Value::as_str),
            )
            .await?;
            let dep_file = primary_file(&dep_version)
                .ok_or_else(|| ApiError::new("У зависимости нет файла.", "NO_FILE"))?;
            let dep_url = dep_file
                .get("url")
                .and_then(Value::as_str)
                .ok_or_else(|| ApiError::new("У зависимости нет ссылки.", "NO_FILE"))?;
            let dep_name = dep_file
                .get("filename")
                .and_then(Value::as_str)
                .map(|name| name.to_string())
                .unwrap_or_else(|| format!("{dep_project_id}.jar"));
            let dep_target = dir.join(folder_for_category(&dep_category)).join(&dep_name);
            download_file(
                &client,
                dep_url,
                &dep_target,
                dep_file.pointer("/hashes/sha1").and_then(Value::as_str),
            )
            .await?;
            Ok(record_from_project(
                &dep_project,
                &dep_version,
                dep_category,
                dep_file,
                &dep_name,
            ))
        }
        .await;
        match dep_result {
            Ok(record) => {
                mods.retain(|item| item.project_id.as_deref() != Some(dep_project_id));
                mods.insert(0, record.clone());
                installed.push(record);
            }
            Err(error) => warnings.push(format!("Зависимость {dep_project_id}: {}", error.message)),
        }
    }

    let mut instance = instance;
    instance.mods = mods;
    let instance = store.upsert_instance(instance);
    Ok(json!({
        "state": store.public_state(),
        "instance": instance,
        "installed": installed,
        "warnings": warnings,
        "project": {
            "id": project.get("id").cloned().unwrap_or(Value::Null),
            "title": project.get("title").cloned().unwrap_or(Value::Null),
            "icon_url": project.get("icon_url").cloned().unwrap_or(Value::Null),
            "description": project.get("description").cloned().unwrap_or(Value::Null),
        }
    }))
}

fn loader_from_dependencies(dependencies: &Value) -> (ModLoader, String) {
    if let Some(version) = dependencies.get("fabric-loader").and_then(Value::as_str) {
        return (ModLoader::Fabric, version.to_string());
    }
    if let Some(version) = dependencies.get("quilt-loader").and_then(Value::as_str) {
        return (ModLoader::Quilt, version.to_string());
    }
    if let Some(version) = dependencies.get("neoforge").and_then(Value::as_str) {
        return (ModLoader::Neoforge, version.to_string());
    }
    if let Some(version) = dependencies.get("forge").and_then(Value::as_str) {
        return (ModLoader::Forge, version.to_string());
    }
    (ModLoader::Vanilla, String::new())
}

fn icon_for_project(project: &Value) -> String {
    let palette = ["grass", "diamond", "gold", "redstone", "ender", "amethyst", "stone"];
    let source = project.get("id").and_then(Value::as_str).unwrap_or("project");
    let sum: u32 = source.chars().map(|ch| ch as u32).sum();
    palette[(sum as usize) % palette.len()].to_string()
}

fn safe_relative_path(value: &str) -> Result<PathBuf, ApiError> {
    let normalized = value.replace('\\', "/");
    let trimmed = normalized.trim_start_matches('/');
    if trimmed.is_empty()
        || trimmed
            .split('/')
            .any(|part| part.is_empty() || part == ".." || part == ".")
    {
        return Err(ApiError::new("Небезопасный путь в файле модпака.", "UNSAFE_PATH"));
    }
    Ok(PathBuf::from(trimmed.replace('/', std::path::MAIN_SEPARATOR.to_string().as_str())))
}

fn extract_zip_prefix(
    archive: &mut ZipArchive<fs::File>,
    prefix: &str,
    destination: &Path,
) -> Result<(), ApiError> {
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        if !name.starts_with(prefix) {
            continue;
        }
        let relative = safe_relative_path(&name[prefix.len()..])?;
        let target = destination.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut buffer = Vec::new();
        entry.read_to_end(&mut buffer)?;
        fs::write(&target, buffer)?;
    }
    Ok(())
}

async fn records_from_pack_files(
    client: &reqwest::Client,
    files: &[Value],
) -> Vec<InstalledMod> {
    let mut hashes = Vec::new();
    let mut metadata = Vec::new();
    for file in files {
        let path = file.get("path").and_then(Value::as_str).unwrap_or("");
        if !path.starts_with("mods/") || !path.ends_with(".jar") {
            continue;
        }
        if let Some(hash) = file.pointer("/hashes/sha1").and_then(Value::as_str) {
            hashes.push(hash.to_string());
            metadata.push((path.to_string(), hash.to_string(), file.clone()));
        }
    }
    if hashes.is_empty() {
        return Vec::new();
    }
    let body = json!({ "hashes": hashes, "algorithm": "sha1" });
    let lookup = match client
        .post(format!("{API}/version_files"))
        .json(&body)
        .send()
        .await
    {
        Ok(response) => response.json::<Value>().await.unwrap_or_else(|_| json!({})),
        Err(_) => json!({}),
    };
    let project_ids: Vec<String> = lookup
        .as_object()
        .map(|map| {
            map.values()
                .filter_map(|version| version.get("project_id").and_then(Value::as_str))
                .map(str::to_string)
                .collect::<HashSet<_>>()
                .into_iter()
                .collect()
        })
        .unwrap_or_default();
    let mut projects = HashMap::new();
    if !project_ids.is_empty() {
        let ids = serde_json::to_string(&project_ids).unwrap_or_else(|_| "[]".into());
        if let Ok(data) = get_json(
            client,
            &format!("{API}/projects?ids={}", urlencoding(&ids)),
        )
        .await
        {
            if let Some(list) = data.as_array() {
                for project in list {
                    if let Some(id) = project.get("id").and_then(Value::as_str) {
                        projects.insert(id.to_string(), project.clone());
                    }
                }
            }
        }
    }

    let mut mods = Vec::new();
    for (path, hash, file) in metadata {
        let file_name = Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(&path)
            .to_string();
        let version = lookup.get(&hash);
        let project_id = version
            .and_then(|item| item.get("project_id"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let project = projects.get(project_id);
        let fallback_title = file_name.trim_end_matches(".jar").replace(['-', '_'], " ");
        mods.push(InstalledMod {
            id: if project_id.is_empty() {
                format!("pack-{file_name}")
            } else {
                format!(
                    "{project_id}-{}",
                    version
                        .and_then(|item| item.get("id"))
                        .and_then(Value::as_str)
                        .unwrap_or("pack")
                )
            },
            project_id: if project_id.is_empty() {
                None
            } else {
                Some(project_id.to_string())
            },
            version_id: version
                .and_then(|item| item.get("id"))
                .and_then(Value::as_str)
                .map(str::to_string),
            slug: project
                .and_then(|value| value.get("slug"))
                .and_then(Value::as_str)
                .unwrap_or(&file_name)
                .to_string(),
            title: project
                .and_then(|value| value.get("title"))
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or(fallback_title),
            author: project
                .and_then(|value| value.get("author"))
                .and_then(Value::as_str)
                .unwrap_or("Modrinth")
                .to_string(),
            version: version
                .and_then(|item| item.get("version_number"))
                .and_then(Value::as_str)
                .unwrap_or("pack")
                .to_string(),
            file_name,
            size: format_bytes(file.get("fileSize").and_then(Value::as_u64).unwrap_or(0)),
            enabled: true,
            category: InstanceModCategory::Mod,
            icon_url: project
                .and_then(|value| value.get("icon_url"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            description: project
                .and_then(|value| value.get("description"))
                .and_then(Value::as_str)
                .unwrap_or("Мод из модпака Modrinth.")
                .to_string(),
        });
    }
    mods
}

async fn install_index_zip(
    store: &Store,
    archive: &mut ZipArchive<fs::File>,
    name: &str,
    project: Option<&Value>,
    version: Option<&Value>,
) -> Result<Value, ApiError> {
    let mut index_text = String::new();
    archive
        .by_name("modrinth.index.json")
        .map_err(|_| ApiError::new("В архиве нет modrinth.index.json — это не .mrpack.", "INVALID_MRPACK"))?
        .read_to_string(&mut index_text)?;
    let index: Value = serde_json::from_str(&index_text)?;
    let dependencies = index.get("dependencies").cloned().unwrap_or_else(|| json!({}));
    let mc_version = dependencies
        .get("minecraft")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::new("В модпаке не указана версия Minecraft.", "INVALID_MRPACK"))?
        .to_string();
    let (loader, loader_version) = loader_from_dependencies(&dependencies);
    let id = Store::new_id("instance");
    let settings = store.settings();
    let title = project
        .and_then(|value| value.get("title"))
        .and_then(Value::as_str)
        .unwrap_or(name)
        .to_string();
    let mut name = name.to_string();
    let technical = name.trim().is_empty()
        || name.to_ascii_lowercase().starts_with("instance-")
        || name.eq_ignore_ascii_case(&mc_version);
    if technical {
        name = if !title.trim().is_empty() && !title.eq_ignore_ascii_case(&mc_version) {
            title.clone()
        } else {
            crate::store::default_instance_name(&loader, &mc_version)
        };
    }
    let instance = Instance {
        id: id.clone(),
        name,
        mc_version: mc_version.clone(),
        loader,
        loader_version,
        ram_mb: settings.default_ram_mb,
        icon: icon_for_project(project.unwrap_or(&json!({}))),
        icon_url: project
            .and_then(|value| value.get("icon_url"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        modpack: Some(ModpackInfo {
            project_id: project
                .and_then(|value| value.get("id"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            title,
            icon_url: project
                .and_then(|value| value.get("icon_url"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            version_id: version
                .and_then(|value| value.get("id"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            version_number: version
                .and_then(|value| value.get("version_number"))
                .and_then(Value::as_str)
                .unwrap_or_else(|| index.get("versionId").and_then(Value::as_str).unwrap_or(""))
                .to_string(),
        }),
        created_at: chrono::Utc::now().to_rfc3339(),
        ..Instance::default()
    };
    let dir = store.ensure_game_dirs(&id);
    let client = client()?;
    let files = index
        .get("files")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for file in &files {
        if file.pointer("/env/client").and_then(Value::as_str) == Some("unsupported") {
            continue;
        }
        let Some(path) = file.get("path").and_then(Value::as_str) else {
            continue;
        };
        let Some(url) = file
            .pointer("/downloads/0")
            .and_then(Value::as_str)
        else {
            continue;
        };
        let relative = safe_relative_path(path)?;
        let target = dir.join(relative);
        download_file(
            &client,
            url,
            &target,
            file.pointer("/hashes/sha1").and_then(Value::as_str),
        )
        .await?;
    }
    extract_zip_prefix(archive, "overrides/", &dir)?;
    extract_zip_prefix(archive, "client-overrides/", &dir)?;
    let mut mods = records_from_pack_files(&client, &files).await;
    if let Ok(entries) = fs::read_dir(dir.join("mods")) {
        for entry in entries.flatten() {
            let Some(file_name) = entry.file_name().to_str().map(str::to_string) else {
                continue;
            };
            if !file_name.ends_with(".jar") || mods.iter().any(|item| item.file_name == file_name) {
                continue;
            }
            mods.push(InstalledMod {
                id: format!("override-{file_name}"),
                project_id: None,
                version_id: None,
                slug: file_name.trim_end_matches(".jar").to_ascii_lowercase(),
                title: file_name.trim_end_matches(".jar").replace(['-', '_'], " "),
                author: "Модпак".into(),
                version: "override".into(),
                file_name,
                size: String::new(),
                enabled: true,
                category: InstanceModCategory::Mod,
                icon_url: String::new(),
                description: "Мод из папки overrides.".into(),
            });
        }
    }
    let mut instance = instance;
    instance.mods = mods;
    let instance = store.upsert_instance(instance);
    store.set_active_instance(&id);
    Ok(json!({ "state": store.public_state(), "instance": instance }))
}

pub async fn install_modpack(
    store: &Store,
    options: &ModpackInstallOptions,
) -> Result<Value, ApiError> {
    let client = client()?;
    let project = match options.project_id.as_deref() {
        Some(project_id) => Some(get_project(&client, project_id).await?),
        None => None,
    };
    let version = if let Some(version_id) = options.version_id.as_deref() {
        Some(get_json(&client, &format!("{API}/version/{}", urlencoding(version_id))).await?)
    } else if let Some(project) = project.as_ref() {
        let list = get_versions(
            &client,
            project.get("id").and_then(Value::as_str).unwrap_or(""),
            None,
            None,
            Some("modpack"),
        )
        .await?;
        list.into_iter().next()
    } else {
        None
    };
    let version = version.ok_or_else(|| ApiError::new("Не найдена версия модпака.", "NO_VERSION"))?;
    let file = primary_file(&version)
        .ok_or_else(|| ApiError::new("У этой версии модпака нет файла.", "NO_FILE"))?;
    let url = file
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::new("У файла модпака нет ссылки.", "NO_FILE"))?;
    let slug = project
        .as_ref()
        .and_then(|value| value.get("slug"))
        .and_then(Value::as_str)
        .unwrap_or("modpack");
    let cache = store.game_root().join("downloads").join("modpacks");
    fs::create_dir_all(&cache)?;
    let zip_path = cache.join(format!(
        "{slug}-{}.mrpack",
        version.get("id").and_then(Value::as_str).unwrap_or("latest")
    ));
    download_file(
        &client,
        url,
        &zip_path,
        file.pointer("/hashes/sha1").and_then(Value::as_str),
    )
    .await?;
    let mut archive = ZipArchive::new(fs::File::open(&zip_path)?)?;
    let name = options
        .name
        .clone()
        .or_else(|| {
            project
                .as_ref()
                .and_then(|value| value.get("title"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| slug.to_string());
    install_index_zip(
        store,
        &mut archive,
        &name,
        project.as_ref(),
        Some(&version),
    )
    .await
}

pub async fn import_mrpack(store: &Store, path: &Path) -> Result<Value, ApiError> {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| !value.eq_ignore_ascii_case("mrpack"))
        .unwrap_or(true)
    {
        return Err(ApiError::new("Выберите файл .mrpack", "INVALID_FILE"));
    }
    let mut archive = ZipArchive::new(fs::File::open(path)?)?;
    let name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Imported Modpack")
        .to_string();
    install_index_zip(store, &mut archive, &name, None, None).await
}

fn urlencoding(value: &str) -> String {
    let mut output = String::new();
    for byte in value.as_bytes() {
        let ch = *byte as char;
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~' | '/' | ':' | '[' | ']' | '"' | ',') {
            output.push(ch);
        } else {
            output.push_str(&format!("%{byte:02X}"));
        }
    }
    output
}
