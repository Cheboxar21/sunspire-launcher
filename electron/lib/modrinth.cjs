'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const store = require('./store.cjs');
const { fetchJson, downloadFile, mapLimit, formatBytes } = require('./http.cjs');

const API = 'https://api.modrinth.com/v2';
const authorCache = new Map();
const projectCache = new Map();

function apiError(message, code = 'MODRINTH_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function projectTypeToCategory(type) {
  switch (type) {
    case 'resourcepack':
      return 'resourcepack';
    case 'shader':
      return 'shader';
    case 'datapack':
      return 'datapack';
    case 'modpack':
      return 'modpack';
    default:
      return 'mod';
  }
}

function folderForCategory(category) {
  switch (category) {
    case 'resourcepack':
      return 'resourcepacks';
    case 'shader':
      return 'shaderpacks';
    case 'datapack':
      return 'datapacks';
    default:
      return 'mods';
  }
}

function safeRelativePath(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => part === '..' || part === '')) {
    throw new Error('Небезопасный путь в файле модпака.');
  }
  return normalized;
}

async function search(options = {}) {
  const query = String(options.query || '').trim();
  const type = options.projectType || 'mod';
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 40);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const facets = [[`project_type:${type}`]];
  if (options.gameVersion) facets.push([`versions:${options.gameVersion}`]);
  if (options.loader && (type === 'mod' || type === 'modpack')) {
    facets.push([`categories:${String(options.loader).toLowerCase()}`]);
  }
  if (options.category) facets.push([`categories:${String(options.category).toLowerCase()}`]);
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    offset: String(offset),
    index: options.sort || 'relevance',
    facets: JSON.stringify(facets)
  });
  const data = await fetchJson(`${API}/search?${params.toString()}`);
  return {
    hits: data.hits || [],
    total: data.total_hits || 0,
    offset: data.offset || offset,
    limit: data.limit || limit
  };
}

async function getProject(id) {
  const key = String(id);
  if (projectCache.has(key)) return projectCache.get(key);
  const project = await fetchJson(`${API}/project/${encodeURIComponent(key)}`);
  projectCache.set(key, project);
  return project;
}

async function getProjects(ids) {
  if (!ids.length) return [];
  const unique = [...new Set(ids)].slice(0, 100);
  const params = new URLSearchParams({ ids: JSON.stringify(unique) });
  return fetchJson(`${API}/projects?${params.toString()}`);
}

async function getVersion(id) {
  return fetchJson(`${API}/version/${encodeURIComponent(id)}`);
}

async function getVersions(projectId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.gameVersion) params.set('game_versions', JSON.stringify([filters.gameVersion]));
  if (filters.loader && filters.projectType && (filters.projectType === 'mod' || filters.projectType === 'modpack')) {
    params.set('loaders', JSON.stringify([String(filters.loader).toLowerCase()]));
  }
  const url = `${API}/project/${encodeURIComponent(projectId)}/version${params.size ? `?${params.toString()}` : ''}`;
  return fetchJson(url);
}

async function getProjectAuthor(project) {
  if (!project || !project.team) return 'Modrinth';
  if (authorCache.has(project.team)) return authorCache.get(project.team);
  try {
    const members = await fetchJson(`${API}/team/${encodeURIComponent(project.team)}/members`);
    const owner = members.find((m) => String(m.role || '').toLowerCase() === 'owner') || members[0];
    const name = owner && owner.user ? owner.user.username : 'Modrinth';
    authorCache.set(project.team, name);
    return name;
  } catch {
    authorCache.set(project.team, 'Modrinth');
    return 'Modrinth';
  }
}

function primaryFile(version) {
  if (!version || !Array.isArray(version.files) || !version.files.length) return null;
  return version.files.find((file) => file.primary) || version.files[0];
}

function extensionForCategory(category) {
  return category === 'mod' ? 'jar' : 'zip';
}

async function pickVersion(project, instance, explicitVersionId) {
  if (explicitVersionId) {
    const version = await getVersion(explicitVersionId);
    return version;
  }
  const type = project.project_type || 'mod';
  let versions = await getVersions(project.id, {
    gameVersion: instance.mcVersion,
    loader: instance.loader,
    projectType: type
  });
  if (!versions.length && (type === 'resourcepack' || type === 'shader')) {
    versions = await getVersions(project.id);
  }
  if (!versions.length) {
    const loaderName = instance.loader === 'vanilla' ? 'Vanilla' : instance.loader;
    throw apiError(
      `Нет версии «${project.title}», совместимой с Minecraft ${instance.mcVersion} (${loaderName}).`,
      'NO_COMPATIBLE_VERSION'
    );
  }
  return versions[0];
}

function recordFromProject(project, version, category, fileName, fileSize) {
  return {
    id: `${project.id}-${version.id}`,
    projectId: project.id,
    versionId: version.id,
    slug: project.slug || project.id,
    title: project.title,
    author: project.author || 'Modrinth',
    version: version.version_number || version.name || 'latest',
    fileName,
    size: formatBytes(fileSize || 0),
    enabled: true,
    category,
    iconUrl: project.icon_url || '',
    description: project.description || ''
  };
}

async function installProject(options) {
  const { instanceId, projectId, versionId } = options;
  const instance = store.getInstance(instanceId);
  if (!instance) throw apiError('Сборка не найдена.', 'INSTANCE_NOT_FOUND');
  const project = await getProject(projectId);
  if (!project) throw apiError('Проект Modrinth не найден.');
  if (project.project_type === 'modpack') {
    return installModpack({ projectId, versionId, instanceId });
  }
  const category = projectTypeToCategory(project.project_type);
  if (category === 'mod' && (!instance.loader || instance.loader === 'vanilla')) {
    throw apiError('Для установки модов нужна сборка с Fabric, Quilt, Forge или NeoForge.', 'NO_LOADER');
  }
  const version = await pickVersion(project, instance, versionId);
  const file = primaryFile(version);
  if (!file || !file.url) throw apiError('У выбранной версии проекта нет файла для скачивания.');
  const author = await getProjectAuthor(project);
  project.author = author;

  const dir = store.ensureGameDirs(instance.id);
  const targetFolder = folderForCategory(category);
  const fileName = path.basename(file.filename || `${project.slug}-${version.version_number}.${extensionForCategory(category)}`);
  const target = path.join(dir, targetFolder, fileName);
  await fsp.mkdir(path.dirname(target), { recursive: true });

  const installed = [];
  const warnings = [];
  const mods = [...(instance.mods || [])];

  // Replace any previous file for this project.
  for (const existing of mods.filter((m) => m.projectId === project.id)) {
    const existingPath = path.join(dir, folderForCategory(existing.category), existing.fileName || '');
    await fsp.rm(existingPath, { force: true }).catch(() => {});
    await fsp.rm(`${existingPath}.disabled`, { force: true }).catch(() => {});
  }
  const withoutProject = mods.filter((m) => m.projectId !== project.id);

  const onProgress = options.onProgress || (() => {});
  onProgress({
    stage: 'mod',
    message: `Загрузка «${project.title}» ${version.version_number}…`,
    progress: 30
  });
  await downloadFile(file.url, target, {
    sha1: file.hashes && file.hashes.sha1,
    size: file.size,
    onProgress: (received, total) => {
      onProgress({
        stage: 'mod',
        message: `«${project.title}»: ${formatBytes(received)}${total ? ` / ${formatBytes(total)}` : ''}`,
        progress: total ? Math.min(90, 30 + Math.round((received / total) * 60)) : 50
      });
    }
  });
  const record = recordFromProject(project, version, category, fileName, file.size);
  installed.push(record);
  withoutProject.unshift(record);

  // Required dependencies
  const handled = new Set([project.id]);
  const deps = (version.dependencies || []).filter((d) => d.dependency_type === 'required' && d.project_id);
  for (const dep of deps) {
    if (!dep.project_id || handled.has(dep.project_id)) continue;
    handled.add(dep.project_id);
    try {
      const depProject = await getProject(dep.project_id);
      const depCategory = projectTypeToCategory(depProject.project_type);
      const depVersion = await pickVersion(depProject, instance, dep.version_id || null);
      const depFile = primaryFile(depVersion);
      if (!depFile || !depFile.url) continue;
      const depAuthor = await getProjectAuthor(depProject);
      depProject.author = depAuthor;
      const depName = path.basename(
        depFile.filename || `${depProject.slug}-${depVersion.version_number}.${extensionForCategory(depCategory)}`
      );
      const depTarget = path.join(dir, folderForCategory(depCategory), depName);
      const already = withoutProject.find((m) => m.projectId === depProject.id);
      if (already) {
        await fsp.rm(path.join(dir, folderForCategory(already.category), already.fileName), { force: true }).catch(() => {});
        const idx = withoutProject.indexOf(already);
        withoutProject.splice(idx, 1);
      }
      onProgress({ stage: 'mod', message: `Зависимость «${depProject.title}»…`, progress: 60 });
      await downloadFile(depFile.url, depTarget, {
        sha1: depFile.hashes && depFile.hashes.sha1,
        size: depFile.size
      });
      const depRecord = recordFromProject(depProject, depVersion, depCategory, depName, depFile.size);
      installed.push(depRecord);
      withoutProject.unshift(depRecord);
    } catch (err) {
      warnings.push(`Зависимость ${dep.project_id}: ${err.message}`);
    }
  }

  const updated = store.updateInstance(instance.id, { mods: withoutProject });
  onProgress({ stage: 'mod', message: 'Готово.', progress: 100 });
  return {
    state: store.publicState(),
    instance: updated,
    installed,
    warnings,
    project: {
      id: project.id,
      title: project.title,
      icon_url: project.icon_url,
      description: project.description
    }
  };
}

function loaderFromDependencies(deps = {}) {
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: String(deps['fabric-loader']) };
  if (deps['quilt-loader']) return { loader: 'quilt', loaderVersion: String(deps['quilt-loader']) };
  if (deps.neoforge) return { loader: 'neoforge', loaderVersion: String(deps.neoforge) };
  if (deps.forge) return { loader: 'forge', loaderVersion: String(deps.forge) };
  return { loader: 'vanilla', loaderVersion: '' };
}

function iconForProject(project) {
  const palette = ['grass', 'diamond', 'gold', 'redstone', 'ender', 'amethyst', 'stone'];
  const source = String((project && project.id) || '');
  let sum = 0;
  for (let i = 0; i < source.length; i += 1) sum += source.charCodeAt(i);
  return palette[sum % palette.length];
}

async function extractZipTo(zip, folderPrefix, destination) {
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/\\/g, '/');
    if (!name.startsWith(folderPrefix)) continue;
    const relative = name.slice(folderPrefix.length);
    const safe = safeRelativePath(relative);
    const target = path.join(destination, safe);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, entry.getData());
  }
}

async function recordsFromPackFiles(instanceDir, files) {
  const mods = [];
  const modHashes = [];
  const modFileMeta = [];
  for (const file of files) {
    if (!file.path || !file.path.startsWith('mods/') || !file.path.endsWith('.jar')) continue;
    const hash = file.hashes && file.hashes.sha1;
    if (!hash) continue;
    modHashes.push(hash);
    modFileMeta.push(file);
  }
  if (!modHashes.length) return mods;
  let hashData = {};
  try {
    hashData = await fetchJson(`${API}/version_files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: modHashes, algorithm: 'sha1' })
    });
  } catch {
    hashData = {};
  }
  const versions = Object.values(hashData);
  const projectIds = [...new Set(versions.map((v) => v.project_id).filter(Boolean))];
  let projects = [];
  if (projectIds.length) {
    try {
      projects = await getProjects(projectIds);
    } catch {
      projects = [];
    }
  }
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const versionsByProject = new Map(versions.map((v) => [v.project_id, v]));
  for (const file of modFileMeta) {
    const sha1 = file.hashes && file.hashes.sha1;
    const version = sha1 ? hashData[sha1] : null;
    const project = version ? projectsById.get(version.project_id) : null;
    const fileName = path.basename(file.path);
    if (project) {
      mods.push({
        id: `${project.id}-${version.id}`,
        projectId: project.id,
        versionId: version.id,
        slug: project.slug || project.id,
        title: project.title,
        author: 'Modrinth',
        version: version.version_number || 'pack',
        fileName,
        size: formatBytes(file.fileSize || 0),
        enabled: true,
        category: 'mod',
        iconUrl: project.icon_url || '',
        description: project.description || 'Мод из модпака Modrinth.'
      });
    } else {
      mods.push({
        id: `pack-${fileName}`,
        projectId: null,
        versionId: null,
        slug: fileName.replace(/\.jar$/i, '').toLowerCase(),
        title: fileName.replace(/\.jar$/i, ''),
        author: 'Модпак',
        version: 'pack',
        fileName,
        size: formatBytes(file.fileSize || 0),
        enabled: true,
        category: 'mod',
        iconUrl: '',
        description: 'Файл из модпака Modrinth.'
      });
    }
  }
  return mods;
}

async function installIndexZip(zip, options) {
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw apiError('В архиве нет modrinth.index.json — это не .mrpack.');
  let index;
  try {
    index = JSON.parse(indexEntry.getData().toString('utf8'));
  } catch {
    throw apiError('Не удалось прочитать modrinth.index.json.');
  }
  const deps = index.dependencies || {};
  const mcVersion = String(deps.minecraft || '');
  if (!mcVersion) throw apiError('В модпаке не указана версия Minecraft.');
  const loaderInfo = loaderFromDependencies(deps);
  const name = options.name || index.name || 'Modrinth Modpack';
  const id = store.newId('instance');
  const settings = store.getState().settings;
  const instance = {
    id,
    name,
    mcVersion,
    loader: loaderInfo.loader,
    loaderVersion: loaderInfo.loaderVersion,
    ramMb: settings.defaultRamMb || 4096,
    javaArgs: '',
    createdAt: new Date().toISOString(),
    lastPlayedAt: null,
    totalPlayMs: 0,
    icon: iconForProject(options.project || { id }),
    iconUrl: (options.project && options.project.icon_url) || '',
    modpack: options.project
      ? {
          projectId: options.project.id,
          title: options.project.title,
          iconUrl: options.project.icon_url || '',
          versionId: options.version ? options.version.id : '',
          versionNumber: options.version ? options.version.version_number : index.versionId
        }
      : {
          projectId: '',
          title: name,
          iconUrl: '',
          versionId: index.versionId || '',
          versionNumber: index.versionId || ''
        },
    mods: [],
    server: ''
  };
  const dir = store.ensureGameDirs(id);
  const files = Array.isArray(index.files) ? index.files : [];
  const onProgress = options.onProgress || (() => {});
  let completed = 0;
  const total = Math.max(files.length, 1);
  await mapLimit(files, 6, async (file) => {
    const env = file.env || {};
    if (env.client === 'unsupported') {
      completed += 1;
      return;
    }
    const rel = safeRelativePath(file.path);
    if (!Array.isArray(file.downloads) || !file.downloads[0]) {
      completed += 1;
      return;
    }
    const target = path.join(dir, rel);
    await downloadFile(file.downloads[0], target, {
      sha1: file.hashes && file.hashes.sha1,
      size: file.fileSize
    });
    completed += 1;
    onProgress({
      stage: 'modpack',
      message: `Файлы модпака: ${completed}/${total} · ${formatBytes((file.fileSize || 0) * completed)}`,
      progress: 20 + Math.round((completed / total) * 65)
    });
  });

  onProgress({ stage: 'modpack', message: 'Распаковка overrides…', progress: 90 });
  await extractZipTo(zip, 'overrides/', dir);
  await extractZipTo(zip, 'client-overrides/', dir);
  await fsp.writeFile(path.join(dir, 'modrinth.index.json'), JSON.stringify(index, null, 2), 'utf8');

  onProgress({ stage: 'modpack', message: 'Каталогизация модов…', progress: 94 });
  const mods = await recordsFromPackFiles(dir, files);
  // Include local (override) jars as well.
  try {
    const localMods = await fsp.readdir(path.join(dir, 'mods'), { withFileTypes: true });
    for (const entry of localMods) {
      if (!entry.isFile() || !entry.name.endsWith('.jar')) continue;
      if (mods.some((m) => m.fileName === entry.name)) continue;
      mods.push({
        id: `override-${entry.name}`,
        projectId: null,
        versionId: null,
        slug: entry.name.replace(/\.jar$/i, '').toLowerCase(),
        title: entry.name.replace(/\.jar$/i, ''),
        author: 'Модпак',
        version: 'override',
        fileName: entry.name,
        size: '',
        enabled: true,
        category: 'mod',
        iconUrl: '',
        description: 'Мод из папки overrides.'
      });
    }
  } catch {
    // no mods folder
  }
  instance.mods = mods;
  store.upsertInstance(instance);
  store.update({ activeInstanceId: id });
  onProgress({ stage: 'modpack', message: 'Модпак установлен.', progress: 100 });
  return { state: store.publicState(), instance: store.getInstance(id) };
}

async function installModpack(options) {
  const { projectId, versionId, name } = options;
  const project = options.project || (projectId ? await getProject(projectId) : null);
  let version = null;
  if (versionId) {
    version = await getVersion(versionId);
  } else if (project) {
    const versions = await getVersions(project.id, { gameVersion: options.gameVersion || undefined, projectType: 'modpack' });
    version = versions[0];
  }
  if (!version) throw apiError('Не найдена версия модпака.');
  const file = primaryFile(version);
  if (!file || !file.url) throw apiError('У этой версии модпака нет файла.');
  const slug = (project && project.slug) || 'modpack';
  const cacheDir = path.join(store.gameRoot(), 'downloads', 'modpacks');
  await fsp.mkdir(cacheDir, { recursive: true });
  const zipPath = path.join(cacheDir, `${slug}-${version.id}.mrpack`);
  const onProgress = options.onProgress || (() => {});
  onProgress({ stage: 'modpack', message: `Загрузка модпака «${(project && project.title) || name || slug}»…`, progress: 2 });
  await downloadFile(file.url, zipPath, {
    sha1: file.hashes && file.hashes.sha1,
    size: file.size,
    onProgress: (received, totalBytes) => {
      onProgress({
        stage: 'modpack',
        message: `Модпак: ${formatBytes(received)} / ${formatBytes(totalBytes)}`,
        progress: totalBytes ? Math.min(18, 2 + Math.round((received / totalBytes) * 16)) : 8
      });
    }
  });
  const zip = new AdmZip(zipPath);
  return installIndexZip(zip, {
    project,
    version,
    name: name || (project && project.title),
    onProgress
  });
}

async function importModpack(filePath) {
  if (!/\.mrpack$/i.test(filePath)) throw apiError('Выберите файл .mrpack');
  const zip = new AdmZip(filePath);
  return installIndexZip(zip, {
    name: path.basename(filePath, '.mrpack'),
    onProgress: () => {}
  });
}

async function getProjectDetails(projectId) {
  const project = await getProject(projectId);
  const [versions, author] = await Promise.all([
    getVersions(projectId).catch(() => []),
    getProjectAuthor(project)
  ]);
  return { ...project, author, versions };
}

module.exports = {
  search,
  getProject,
  getProjectDetails,
  getProjects,
  getVersions,
  getVersion,
  installProject,
  installModpack,
  importModpack,
  folderForCategory,
  projectTypeToCategory
};
