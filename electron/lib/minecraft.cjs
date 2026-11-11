'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn, execFile } = require('child_process');
const AdmZip = require('adm-zip');
const store = require('./store.cjs');
const java = require('./java.cjs');
const {
  fetchJson,
  fetchText,
  downloadFile,
  mapLimit,
  mavenPath,
  mavenUrl,
  formatBytes,
  sleep
} = require('./http.cjs');

const APP_VERSION = '1.0.0';
const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const running = new Map();
let manifestCache = null;
let manifestFetchedAt = 0;

const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
const archName = process.arch === 'x64' ? 'x86_64' : process.arch === 'ia32' ? 'x86' : process.arch;

function root() {
  return store.gameRoot();
}

function versionDir(id) {
  return path.join(root(), 'versions', id);
}

function librariesDir() {
  return path.join(root(), 'libraries');
}

function assetsDir() {
  return path.join(root(), 'assets');
}

function nativesDir(id) {
  return path.join(root(), 'libraries', 'natives', id);
}

function splitArgs(input) {
  const args = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === '\\' && quote === '"' && input[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

async function getManifest(force = false) {
  const now = Date.now();
  if (!force && manifestCache && now - manifestFetchedAt < 10 * 60 * 1000) return manifestCache;
  const cacheFile = path.join(root(), 'meta', 'version_manifest_v2.json');
  try {
    if (!force) {
      const stat = await fsp.stat(cacheFile);
      if (now - stat.mtimeMs < 60 * 60 * 1000) {
        manifestCache = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
        manifestFetchedAt = now;
        return manifestCache;
      }
    }
  } catch {
    // no cache
  }
  const manifest = await fetchJson(MANIFEST_URL);
  await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
  await fsp.writeFile(cacheFile, JSON.stringify(manifest), 'utf8');
  manifestCache = manifest;
  manifestFetchedAt = now;
  return manifest;
}

async function listVersions() {
  const manifest = await getManifest();
  return {
    latest: manifest.latest,
    versions: manifest.versions.map((v) => ({
      id: v.id,
      type: v.type,
      releaseTime: v.releaseTime,
      url: v.url
    }))
  };
}

async function getVersionMeta(mcVersion, onProgress) {
  const manifest = await getManifest();
  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) {
    const err = new Error(`Версия Minecraft «${mcVersion}» не найдена в манифесте Mojang.`);
    err.code = 'VERSION_NOT_FOUND';
    throw err;
  }
  const jsonPath = path.join(versionDir(entry.id), `${entry.id}.json`);
  try {
    const stat = await fsp.stat(jsonPath);
    if (stat.size > 100) {
      return JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
    }
  } catch {
    // download below
  }
  if (onProgress) onProgress({ message: `Получение манифеста Minecraft ${entry.id}…` });
  await fsp.mkdir(versionDir(entry.id), { recursive: true });
  const json = await fetchJson(entry.url);
  await fsp.writeFile(jsonPath, JSON.stringify(json, null, 2), 'utf8');
  return json;
}

async function ensureBaseFiles(mcVersion, onProgress) {
  const meta = await getVersionMeta(mcVersion, onProgress);
  const client = meta.downloads && meta.downloads.client;
  if (client && client.url) {
    const jarPath = path.join(versionDir(mcVersion), `${mcVersion}.jar`);
    if (onProgress) onProgress({ message: `Проверка клиента Minecraft ${mcVersion}…` });
    await downloadFile(client.url, jarPath, {
      sha1: client.sha1,
      size: client.size,
      onProgress: (received, total) => {
        if (onProgress) {
          onProgress({
            message: `Загрузка клиента Minecraft ${mcVersion}… ${formatBytes(received)}`,
            bytes: { received, total }
          });
        }
      }
    });
  }
  return meta;
}

async function ensureFabricProfile(mcVersion, loaderVersion, flavor, log) {
  const metaBase = flavor === 'quilt' ? 'https://meta.quiltmc.org/v3' : 'https://meta.fabricmc.net/v2';
  let loader = String(loaderVersion || '').trim();
  if (!loader) {
    const versions = await fetchJson(`${metaBase}/versions/loader/${encodeURIComponent(mcVersion)}`);
    if (!Array.isArray(versions) || !versions.length) {
      throw new Error(`${flavor === 'quilt' ? 'Quilt' : 'Fabric'} не поддерживает Minecraft ${mcVersion}.`);
    }
    const stable = versions.find((v) => v.loader && v.loader.stable);
    loader = (stable || versions[0]).loader.version;
  }
  if (log) log(`[loader] ${flavor === 'quilt' ? 'Quilt' : 'Fabric'} ${loader} для Minecraft ${mcVersion}`);
  const profileUrl = `${metaBase}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loader)}/profile/json`;
  const profile = await fetchJson(profileUrl);
  if (!profile || !profile.id) throw new Error('Не удалось получить профиль загрузчика.');
  const dir = versionDir(profile.id);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${profile.id}.json`), JSON.stringify(profile, null, 2), 'utf8');
  return { id: profile.id, loaderVersion: loader, json: profile };
}

async function resolveForgeVersion(mcVersion, loaderVersion) {
  if (loaderVersion) return String(loaderVersion).replace(`${mcVersion}-`, '');
  const data = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
  const promos = (data && data.promos) || {};
  const recommended = promos[`${mcVersion}-recommended`];
  const latest = promos[`${mcVersion}-latest`];
  const value = recommended || latest;
  if (!value) throw new Error(`Forge не поддерживает Minecraft ${mcVersion}. Выберите Fabric, Quilt или NeoForge.`);
  return value;
}

async function resolveNeoForgeVersion(mcVersion, loaderVersion) {
  if (loaderVersion) {
    return String(loaderVersion).replace(`${mcVersion}-`, '');
  }
  const xml = await fetchText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  const mapped = mcVersion.startsWith('1.') ? mcVersion.slice(2) : mcVersion;
  const prefix = `${mapped}.`;
  const compatible = versions.filter((v) => v.startsWith(prefix) && !/(alpha|beta)/i.test(v));
  if (!compatible.length) {
    throw new Error(`NeoForge не поддерживает Minecraft ${mcVersion}.`);
  }
  return compatible[compatible.length - 1];
}

function ensureLauncherProfiles() {
  const file = path.join(root(), 'launcher_profiles.json');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2),
      'utf8'
    );
  }
}

function runJavaInstaller(javaPath, installerPath, onLog, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', installerPath, '--installClient', root()], {
      cwd: root(),
      windowsHide: true,
      env: { ...process.env }
    });
    let settled = false;
    let output = '';
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill();
        } catch {
          // ignore
        }
        reject(new Error('Установщик загрузчика не завершился за 10 минут.'));
      }
    }, timeoutMs);
    const handle = (chunk) => {
      const text = chunk.toString();
      output += text;
      if (onLog) {
        text.split(/\r?\n/).filter(Boolean).forEach((line) => onLog(line.slice(0, 500)));
      }
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`Установщик загрузчика завершился с кодом ${code}.`));
    });
  });
}

async function findForgeProfileByVersion(mcVersion, flavor, version) {
  const dir = path.join(root(), 'versions');
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const needle = flavor === 'neoforge' ? 'neoforge' : 'forge';
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.toLowerCase().includes(needle)) continue;
    if (!entry.name.includes(String(version))) continue;
    const file = path.join(dir, entry.name, `${entry.name}.json`);
    try {
      const json = JSON.parse(await fsp.readFile(file, 'utf8'));
      if (json.inheritsFrom === mcVersion) return entry.name;
    } catch {
      // ignore
    }
  }
  return null;
}

async function findInstalledForgeProfile(mcVersion, flavor, sinceTime) {
  const dir = path.join(root(), 'versions');
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const needle = flavor === 'neoforge' ? 'neoforge' : 'forge';
  let best = null;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.toLowerCase().includes(needle)) continue;
    const file = path.join(dir, entry.name, `${entry.name}.json`);
    try {
      const stat = await fsp.stat(file);
      const json = JSON.parse(await fsp.readFile(file, 'utf8'));
      if (json.inheritsFrom !== mcVersion) continue;
      if (stat.mtimeMs < sinceTime - 5000) continue;
      if (!best || stat.mtimeMs > best.mtime) best = { id: entry.name, mtime: stat.mtimeMs };
    } catch {
      // ignore broken profile
    }
  }
  return best ? best.id : null;
}

async function ensureForgeProfile(mcVersion, loaderVersion, flavor, options, progress, log) {
  const version = flavor === 'neoforge'
    ? await resolveNeoForgeVersion(mcVersion, loaderVersion)
    : await resolveForgeVersion(mcVersion, loaderVersion);
  const existingProfile = await findForgeProfileByVersion(mcVersion, flavor, version);
  if (existingProfile) {
    return { id: existingProfile, loaderVersion: version, json: null };
  }
  const baseMeta = await getVersionMeta(mcVersion);
  const requiredJava = (baseMeta.javaVersion && baseMeta.javaVersion.majorVersion) || 17;
  const javaInfo = await java.ensureJava({
    requiredMajor: requiredJava,
    javaPath: options.settings.javaPath,
    autoDownload: options.settings.autoDownloadJava !== false,
    root: root(),
    onProgress: (p) => progress({ ...p, stage: 'java' })
  });
  const installerName = flavor === 'neoforge'
    ? `neoforge-${version}-installer.jar`
    : `forge-${mcVersion}-${version}-installer.jar`;
  const installerUrl = flavor === 'neoforge'
    ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`
    : `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${version}/forge-${mcVersion}-${version}-installer.jar`;
  const installerDir = path.join(root(), 'installers');
  const installerPath = path.join(installerDir, installerName);
  await fsp.mkdir(installerDir, { recursive: true });
  progress({ stage: 'loader', message: `Загрузка установщика ${flavor === 'neoforge' ? 'NeoForge' : 'Forge'} ${version}…`, progress: 20 });
  await downloadFile(installerUrl, installerPath);
  ensureLauncherProfiles();
  progress({ stage: 'loader', message: `Установка ${flavor === 'neoforge' ? 'NeoForge' : 'Forge'} ${version} (это может занять несколько минут)…`, progress: 30 });
  const started = Date.now();
  await runJavaInstaller(javaInfo.path, installerPath, log);
  const profileId = await findInstalledForgeProfile(mcVersion, flavor, started);
  if (!profileId) {
    throw new Error(`Установщик ${flavor} завершился, но профиль версии не найден.`);
  }
  return { id: profileId, loaderVersion: version, json: null };
}

async function loadVersionFile(id) {
  const file = path.join(versionDir(id), `${id}.json`);
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

function mergeLibraries(parent = [], child = []) {
  const result = [];
  const key = (lib) => {
    const parts = String(lib.name || '').split(':');
    return `${parts[0]}:${parts[1]}:${parts[3] || ''}`;
  };
  const positions = new Map();
  for (const lib of parent) {
    const k = key(lib);
    if (!positions.has(k)) {
      positions.set(k, result.length);
      result.push(lib);
    } else {
      result[positions.get(k)] = lib;
    }
  }
  for (const lib of child) {
    const k = key(lib);
    if (positions.has(k)) result[positions.get(k)] = lib;
    else {
      positions.set(k, result.length);
      result.push(lib);
    }
  }
  return result;
}

function mergeArgs(parentArgs, childArgs) {
  const normal = (args) => {
    if (!args) return { game: [], jvm: [] };
    return {
      game: Array.isArray(args.game) ? args.game : [],
      jvm: Array.isArray(args.jvm) ? args.jvm : []
    };
  };
  const p = normal(parentArgs);
  const c = normal(childArgs);
  return { game: [...p.game, ...c.game], jvm: [...p.jvm, ...c.jvm] };
}

function mergeVersion(parent, child) {
  const merged = { ...parent, ...child };
  merged.libraries = mergeLibraries(parent.libraries || [], child.libraries || []);
  if (child.arguments || parent.arguments) {
    merged.arguments = mergeArgs(parent.arguments, child.arguments);
  }
  if (!child.minecraftArguments && parent.minecraftArguments) {
    merged.minecraftArguments = parent.minecraftArguments;
  }
  merged.id = child.id;
  merged.inheritsFrom = child.inheritsFrom;
  merged.javaVersion = child.javaVersion || parent.javaVersion;
  merged.assetIndex = child.assetIndex || parent.assetIndex;
  merged.assets = child.assets || parent.assets;
  merged.downloads = child.downloads || parent.downloads;
  merged.logging = child.logging || parent.logging;
  merged.type = child.type || parent.type;
  return merged;
}

async function resolveVersion(profileId, trail = []) {
  if (trail.includes(profileId)) throw new Error('Циклическое наследование версии Minecraft.');
  const json = await loadVersionFile(profileId);
  if (json.inheritsFrom) {
    const parent = await resolveVersion(json.inheritsFrom, [...trail, profileId]);
    return { ...mergeVersion(parent, json), __baseId: parent.__baseId || parent.id };
  }
  return { ...json, __baseId: json.id };
}

function ruleMatches(rule) {
  if (!rule) return false;
  if (rule.os) {
    if (rule.os.name && rule.os.name !== osName) return false;
    if (rule.os.arch && rule.os.arch !== archName) return false;
    if (rule.os.version) {
      try {
        if (!new RegExp(rule.os.version).test(require('os').release())) return false;
      } catch {
        return false;
      }
    }
  }
  if (rule.features) {
    const features = {
      is_demo_user: false,
      has_custom_resolution: false,
      has_quick_plays_support: false,
      is_quick_play_singleplayer: false,
      is_quick_play_multiplayer: false,
      is_quick_play_realms: false
    };
    for (const [key, value] of Object.entries(rule.features)) {
      if (Boolean(features[key]) !== Boolean(value)) return false;
    }
  }
  return true;
}

function allowedByRules(rules) {
  if (!Array.isArray(rules) || !rules.length) return true;
  let allowed = false;
  for (const rule of rules) {
    if (ruleMatches(rule)) {
      allowed = rule.action === 'allow';
    }
  }
  return allowed;
}

function flattenArgList(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => flattenArgList(entry));
  if (typeof value === 'object' && value.value) {
    if (!allowedByRules(value.rules)) return [];
    return flattenArgList(value.value);
  }
  return [];
}

function libraryArtifact(lib) {
  const downloads = lib.downloads || {};
  if (downloads.artifact && downloads.artifact.url) {
    return {
      ...downloads.artifact,
      path: downloads.artifact.path || mavenPath(lib.name),
      url: downloads.artifact.url
    };
  }
  const rel = mavenPath(lib.name);
  if (!rel) return null;
  let url = null;
  if (lib.url) {
    url = `${String(lib.url).replace(/\/?$/, '/')}${rel}`;
  } else {
    url = mavenUrl(lib.name);
  }
  return { path: rel, url, sha1: lib.sha1 || null, size: lib.size || null };
}

function nativeArtifact(lib) {
  if (!lib.natives) return null;
  const classifierTemplate = lib.natives[osName];
  if (!classifierTemplate) return null;
  const classifier = String(classifierTemplate).replace('${arch}', process.arch === 'x64' ? '64' : '32');
  const artifact = lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers[classifier];
  if (artifact && artifact.url) return { ...artifact, classifier };
  const rel = mavenPath(`${lib.name}${classifier ? `:${classifier}` : ''}`);
  if (!rel) return null;
  return {
    path: rel,
    url: lib.url ? `${String(lib.url).replace(/\/?$/, '/')}${rel}` : mavenUrl(`${lib.name}:${classifier}`),
    classifier
  };
}

async function ensureLibraries(version, progress, log) {
  const libRoot = librariesDir();
  const classpath = [];
  const nativeExtracts = [];
  const downloads = [];

  for (const lib of version.libraries || []) {
    if (!allowedByRules(lib.rules)) continue;
    const artifact = libraryArtifact(lib);
    if (artifact && artifact.path && artifact.url) {
      downloads.push({
        url: artifact.url,
        path: path.join(libRoot, artifact.path),
        sha1: artifact.sha1 || null,
        size: artifact.size || null
      });
      classpath.push(path.join(libRoot, artifact.path));
    }
    const native = nativeArtifact(lib);
    if (native && native.path && native.url) {
      downloads.push({
        url: native.url,
        path: path.join(libRoot, native.path),
        sha1: native.sha1 || null,
        size: native.size || null,
        native: true,
        classifier: native.classifier
      });
    }
  }

  let completed = 0;
  const total = downloads.length || 1;
  let lastReport = 0;
  await mapLimit(downloads, 8, async (item) => {
    try {
      const exists = await fsp.stat(item.path).catch(() => null);
      const sizeOk = exists && (!item.size || Number(item.size) === exists.size);
      if (!sizeOk) {
        await downloadFile(item.url, item.path, { sha1: item.sha1, size: item.size });
        if (log) log(`[lib] ${path.basename(item.path)}`);
      }
    } catch (err) {
      if (log) log(`[lib:error] ${path.basename(item.path)} :: ${err.message}`);
      throw err;
    }
    if (item.native) {
      nativeExtracts.push(item);
    }
    completed += 1;
    if (Date.now() - lastReport > 200 || completed === total) {
      lastReport = Date.now();
      progress({
        message: `Библиотеки: ${completed}/${total}`,
        progress: 20 + Math.round((completed / total) * 20)
      });
    }
  });

  const natives = nativesDir(version.id);
  await fsp.rm(natives, { recursive: true, force: true }).catch(() => {});
  await fsp.mkdir(natives, { recursive: true });
  for (const native of nativeExtracts) {
    try {
      const zip = new AdmZip(native.path);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory || entry.entryName.startsWith('META-INF/')) continue;
        zip.extractEntryTo(entry, natives, false, true);
      }
    } catch (err) {
      if (log) log(`[natives:warn] ${path.basename(native.path)} :: ${err.message}`);
    }
  }

  return classpath;
}

function assetPath(hash) {
  return path.join(assetsDir(), 'objects', hash.slice(0, 2), hash);
}

async function ensureAssets(version, progress, log) {
  const indexInfo = version.assetIndex;
  if (!indexInfo || !indexInfo.url) {
    return { assetsRoot: assetsDir(), assetIndexName: version.assets || 'legacy' };
  }
  const indexPath = path.join(assetsDir(), 'indexes', `${indexInfo.id}.json`);
  // Index is small; verify via size/hash
  try {
    const stat = await fsp.stat(indexPath);
    if (!indexInfo.size || stat.size !== indexInfo.size) throw new Error('size');
  } catch {
    await downloadFile(indexInfo.url, indexPath, { sha1: indexInfo.sha1, size: indexInfo.size });
  }
  const index = JSON.parse(await fsp.readFile(indexPath, 'utf8'));
  const objects = Object.entries(index.objects || {});
  const total = objects.length;
  let completed = 0;
  let lastReport = 0;
  await mapLimit(objects, 16, async ([name, object]) => {
    const file = assetPath(object.hash);
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat || (object.size && stat.size !== object.size)) {
      await downloadFile(`https://resources.download.minecraft.net/${object.hash.slice(0, 2)}/${object.hash}`, file, {
        sha1: object.hash,
        size: object.size
      });
      if (log && completed % 400 === 0 && completed > 0) log(`[assets] ${completed}/${total}`);
    }
    completed += 1;
    if (Date.now() - lastReport > 250 || completed === total) {
      lastReport = Date.now();
      progress({
        message: `Ресурсы: ${completed}/${total}`,
        progress: 42 + Math.round((completed / Math.max(total, 1)) * 50),
        counts: { current: completed, total }
      });
    }
  });

  let gameAssetsRoot = assetsDir();
  if (index.virtual) {
    const virtual = path.join(assetsDir(), 'virtual', indexInfo.id);
    await fsp.mkdir(virtual, { recursive: true });
    // Copy virtual assets once. The object store is shared, so this is a cheap map.
    for (const [name, object] of objects) {
      const target = path.join(virtual, name);
      await fsp.mkdir(path.dirname(target), { recursive: true }).catch(() => {});
      try {
        await fsp.copyFile(assetPath(object.hash), target);
      } catch {
        // ignore individual failures
      }
    }
    gameAssetsRoot = virtual;
  }
  if (index.map_to_resources) {
    // Legacy resource layout is handled by the game via assetsDir.
    gameAssetsRoot = assetsDir();
  }
  return { assetsRoot: gameAssetsRoot, assetIndexName: indexInfo.id };
}

async function ensureLoggingConfig(version) {
  const logging = version.logging && version.logging.client;
  if (!logging || !logging.file || !logging.file.url) return null;
  const file = path.join(assetsDir(), 'log_configs', logging.file.id || path.basename(logging.file.url));
  try {
    const stat = await fsp.stat(file);
    if (!logging.file.size || stat.size !== logging.file.size) throw new Error('size');
  } catch {
    await downloadFile(logging.file.url, file, {
      sha1: logging.file.sha1,
      size: logging.file.size
    });
  }
  return { file, argument: logging.argument || '-Dlog4j.configurationFile=${path}' };
}

function javaMajor(version) {
  return (version.javaVersion && version.javaVersion.majorVersion) || 8;
}

async function prepareInstance(instance, settings, progress, log) {
  await store.ensureGameDirs(instance.id);
  const chainProgress = (p) => progress(p);
  progress({ stage: 'version', message: 'Проверка версии Minecraft…', progress: 2 });
  const baseMeta = await ensureBaseFiles(instance.mcVersion, chainProgress);
  let profileId;
  let loaderVersion = instance.loaderVersion || '';
  const loader = instance.loader || 'vanilla';

  if (loader === 'fabric' || loader === 'quilt') {
    progress({ stage: 'loader', message: `Подготовка ${loader === 'quilt' ? 'Quilt' : 'Fabric'}…`, progress: 8 });
    const profile = await ensureFabricProfile(instance.mcVersion, instance.loaderVersion, loader, log);
    profileId = profile.id;
    loaderVersion = profile.loaderVersion;
  } else if (loader === 'forge' || loader === 'neoforge') {
    progress({ stage: 'loader', message: `Подготовка ${loader === 'neoforge' ? 'NeoForge' : 'Forge'}…`, progress: 8 });
    const profile = await ensureForgeProfile(instance.mcVersion, instance.loaderVersion, loader, { settings }, progress, log);
    profileId = profile.id;
    loaderVersion = profile.loaderVersion;
    progress({ stage: 'loader', message: 'Загрузчик установлен.', progress: 20 });
  } else {
    profileId = instance.mcVersion;
  }

  const version = await resolveVersion(profileId);
  version.__baseId = version.__baseId || instance.mcVersion;
  const requiredMajor = javaMajor(version);
  progress({ stage: 'java', message: `Поиск Java ${requiredMajor}…`, progress: 12 });
  const javaInfo = await java.ensureJava({
    requiredMajor,
    javaPath: settings.javaPath,
    autoDownload: settings.autoDownloadJava !== false,
    root: root(),
    onProgress: (p) => progress({ ...p, stage: 'java' })
  });
  progress({
    stage: 'java',
    message: `Java ${javaInfo.version} · ${javaInfo.source === 'downloaded' ? 'загружена автоматически' : 'найдена'}`,
    progress: 16
  });

  progress({ stage: 'libraries', message: 'Проверка библиотек…', progress: 20 });
  const classpath = await ensureLibraries(version, progress, log);
  const clientJar = path.join(versionDir(version.__baseId), `${version.__baseId}.jar`);
  if (fs.existsSync(clientJar)) classpath.push(clientJar);
  else {
    // Some legacy versions store the jar under the profile id.
    const alternate = path.join(versionDir(profileId), `${profileId}.jar`);
    if (fs.existsSync(alternate)) classpath.push(alternate);
  }

  progress({ stage: 'assets', message: 'Проверка ресурсов…', progress: 42 });
  const assets = await ensureAssets(version, progress, log);
  const logging = await ensureLoggingConfig(version);

  return {
    profileId,
    baseId: version.__baseId,
    loaderVersion,
    version,
    java: javaInfo,
    classpath,
    assets,
    logging
  };
}

function substitute(value, vars) {
  return String(value).replace(/\$\{([^}]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key];
    return match;
  });
}

function buildLaunchArgs(prepared, instance, account, settings) {
  const { version, classpath, java: javaInfo, assets, logging, profileId } = prepared;
  const gameDir = store.ensureGameDirs(instance.id);
  const natives = nativesDir(version.id);
  fs.mkdirSync(natives, { recursive: true });
  const vars = {
    auth_player_name: account.username,
    version_name: profileId,
    game_directory: gameDir,
    assets_root: assets.assetsRoot,
    assets_index_name: assets.assetIndexName,
    auth_uuid: String(account.uuid || '').replace(/-/g, ''),
    auth_access_token: account.type === 'microsoft' ? account.mcAccessToken || '' : '0',
    clientid: account.type === 'microsoft' ? '00000000402b5328' : '',
    auth_xuid: account.xuid || '',
    user_type: account.type === 'microsoft' ? 'msa' : 'legacy',
    version_type: version.type || 'release',
    user_properties: '{}',
    resolution_width: '1280',
    resolution_height: '720',
    game_assets: assets.assetsRoot,
    library_directory: librariesDir(),
    classpath_separator: path.delimiter,
    launcher_name: 'Sunspire',
    launcher_version: APP_VERSION,
    natives_directory: natives,
    classpath: classpath.join(path.delimiter),
    path: logging ? logging.file : ''
  };

  const ram = Math.max(1024, Number(instance.ramMb) || Number(settings.defaultRamMb) || 4096);
  const userArgs = splitArgs(instance.javaArgs || '').filter((arg) => {
    return !/^-Xm[sx]/.test(arg) && !/^-Xmn/.test(arg);
  });
  const jvm = [
    `-Xms${Math.min(512, Math.floor(ram / 4))}M`,
    `-Xmx${ram}M`,
    '-Dfile.encoding=UTF-8',
    '-Dstdout.encoding=UTF-8',
    '-Dstderr.encoding=UTF-8'
  ];

  if (Array.isArray(version.arguments) && Array.isArray(version.arguments.jvm)) {
    for (const entry of version.arguments.jvm) {
      if (typeof entry === 'object' && entry.rules && !allowedByRules(entry.rules)) continue;
      const values = typeof entry === 'object' ? flattenArgList(entry.value) : [entry];
      for (const value of values) {
        if (/^-Xm[sx]/.test(value) || /^-Xmn/.test(value)) continue;
        jvm.push(substitute(value, vars));
      }
    }
  } else if (version.legacyJvmArgs) {
    jvm.push(...version.legacyJvmArgs);
  }

  if (logging) {
    const loggingArg = substitute(logging.argument, vars);
    if (!jvm.some((arg) => arg.startsWith('-Dlog4j.configurationFile'))) {
      jvm.push(loggingArg);
    }
  }
  if (!jvm.includes('-cp') && !jvm.includes('-classpath')) {
    jvm.push('-cp', classpath.join(path.delimiter));
  }
  jvm.push(...userArgs);

  let gameArgs;
  if (Array.isArray(version.arguments) && Array.isArray(version.arguments.game)) {
    gameArgs = [];
    for (const entry of version.arguments.game) {
      if (typeof entry === 'object' && entry.rules && !allowedByRules(entry.rules)) continue;
      const values = typeof entry === 'object' ? flattenArgList(entry.value) : [entry];
      for (const value of values) {
        gameArgs.push(substitute(value, vars));
      }
    }
  } else {
    gameArgs = [];
    for (const arg of String(version.minecraftArguments || '').match(/(?:[^\s"]+|"[^"]*")+/g) || []) {
      gameArgs.push(substitute(arg.replace(/^"|"$/g, ''), vars));
    }
    // Legacy versions need the classpath/main class but the standard arguments are enough.
    if (!gameArgs.includes('--username')) {
      gameArgs.push(
        '--username', vars.auth_player_name,
        '--gameDir', gameDir,
        '--assetsDir', assets.assetsRoot,
        '--assetIndex', assets.assetIndexName,
        '--uuid', vars.auth_uuid,
        '--accessToken', vars.auth_access_token,
        '--userType', vars.user_type,
        '--version', profileId
      );
    }
  }

  const args = [...jvm, version.mainClass, ...gameArgs];
  return { args, javaPath: javaInfo.path, gameDir };
}

function writeLaunchLog(instanceId, line) {
  try {
    const file = path.join(store.instanceDir(instanceId), 'logs', 'sunspire-launch.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${line}\n`, 'utf8');
  } catch {
    // logging must never crash the launcher
  }
}

async function launchInstance(instanceId, accountId, options = {}) {
  const instance = store.getInstance(instanceId);
  if (!instance) throw new Error('Сборка не найдена.');
  const account = accountId
    ? await require('./auth.cjs').getValidAccount(accountId)
    : require('./auth.cjs').getValidAccount(store.getState().activeAccountId);
  if (!account) throw new Error('Сначала добавьте аккаунт в разделе «Аккаунты».');

  const existing = running.get(instanceId);
  if (existing) throw new Error('Эта сборка уже запущена.');

  const state = store.getState();
  const settings = state.settings;
  const onProgress = options.onProgress || (() => {});
  const onLog = options.onLog || (() => {});
  const onState = options.onState || (() => {});
  const log = (line) => {
    writeLaunchLog(instanceId, line);
    onLog({ line: String(line), at: Date.now() });
  };

  onState({ state: 'preparing', instanceId });
  try {
    log(`[sunspire] Запуск «${instance.name}» · Minecraft ${instance.mcVersion} · ${instance.loader}`);
    const prepared = await prepareInstance(instance, settings, (p) => onProgress({ ...p, instanceId }), log);
    if (prepared.loaderVersion && prepared.loaderVersion !== instance.loaderVersion) {
      store.updateInstance(instanceId, { loaderVersion: prepared.loaderVersion });
    }
    // Refresh account again if preparation took long
    const active = await require('./auth.cjs').getValidAccount(account.id);
    const launch = buildLaunchArgs(prepared, instance, active, settings);
    onProgress({ stage: 'launch', message: 'Запуск Minecraft…', progress: 98, instanceId });
    log(`[java] ${launch.javaPath}`);
    log(`[args] ${launch.args.join(' ').replace(/(--accessToken\s+)\S+/g, '$1***')}`);

    const startedAt = Date.now();
    const child = spawn(launch.javaPath, launch.args, {
      cwd: launch.gameDir,
      windowsHide: true,
      env: { ...process.env }
    });
    running.set(instanceId, { child, startedAt, accountId: active.id });

    const pipe = (stream, level) => {
      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const isError = /\/ERROR\]|Exception|Caused by|Error:/i.test(line);
          log(line);
          onLog({ line, at: Date.now(), level: isError ? 'error' : level });
        }
      });
    };
    pipe(child.stdout, 'info');
    pipe(child.stderr, 'warn');

    child.on('error', (err) => {
      log(`[launcher:error] ${err.message}`);
      onState({ state: 'error', instanceId, error: err.message });
    });
    child.on('close', (code) => {
      const session = running.get(instanceId);
      const elapsed = Date.now() - (session ? session.startedAt : startedAt);
      running.delete(instanceId);
      const current = store.getInstance(instanceId);
      if (current) {
        store.updateInstance(instanceId, {
          totalPlayMs: Number(current.totalPlayMs || 0) + elapsed,
          lastPlayedAt: new Date().toISOString()
        });
      }
      log(`[sunspire] Игра завершена с кодом ${code}. Сессия: ${Math.round(elapsed / 60000)} мин.`);
      onState({ state: 'exited', instanceId, code, elapsedMs: elapsed });
      options.onDone && options.onDone({ code, elapsedMs: elapsed });
    });

    running.set(instanceId, { child, startedAt, accountId: active.id });
    onState({ state: 'running', instanceId, pid: child.pid });
    return { pid: child.pid, prepared: { java: prepared.java, profileId: prepared.profileId } };
  } catch (err) {
    running.delete(instanceId);
    log(`[launcher:error] ${err.message}`);
    onProgress({ stage: 'error', message: err.message, progress: 0, instanceId });
    onState({ state: 'error', instanceId, error: err.message, code: err.code });
    throw err;
  }
}

async function killInstance(instanceId) {
  const entry = running.get(instanceId);
  if (!entry) return false;
  const pid = entry.child.pid;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      execFile('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true }, () => resolve());
    });
  } else {
    try {
      entry.child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  return true;
}

function getRunningInstances() {
  return [...running.entries()].map(([instanceId, data]) => ({
    instanceId,
    pid: data.child.pid,
    startedAt: data.startedAt,
    accountId: data.accountId
  }));
}

async function readInstanceLog(instanceId) {
  const candidates = [
    path.join(store.instanceDir(instanceId), 'logs', 'latest.log'),
    path.join(store.instanceDir(instanceId), 'logs', 'sunspire-launch.log')
  ];
  for (const file of candidates) {
    try {
      const stat = await fsp.stat(file);
      if (stat.size === 0) continue;
      const text = await fsp.readFile(file, 'utf8');
      const lines = text.split(/\r?\n/);
      return lines.slice(-1200).join('\n');
    } catch {
      // try next
    }
  }
  return '';
}

async function getLoaderVersions(mcVersion) {
  const result = { fabric: [], quilt: [], forge: [], neoforge: [] };
  await Promise.allSettled([
    (async () => {
      const data = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`);
      result.fabric = (data || []).slice(0, 30).map((item) => ({
        version: item.loader.version,
        stable: Boolean(item.loader.stable)
      }));
    })(),
    (async () => {
      const data = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`);
      result.quilt = (data || []).slice(0, 30).map((item) => ({
        version: item.loader.version,
        stable: !/beta|alpha|pre/i.test(item.loader.version)
      }));
    })(),
    (async () => {
      const data = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      const promos = (data && data.promos) || {};
      const seen = new Set();
      for (const key of [`${mcVersion}-recommended`, `${mcVersion}-latest`]) {
        const version = promos[key];
        if (version && !seen.has(version)) {
          seen.add(version);
          result.forge.push({ version: `${mcVersion}-${version}`, stable: key.endsWith('recommended') });
        }
      }
    })(),
    (async () => {
      const xml = await fetchText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
      const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
      const mapped = mcVersion.startsWith('1.') ? mcVersion.slice(2) : mcVersion;
      const compatible = versions.filter((v) => v.startsWith(`${mapped}.`) && !/(alpha|beta)/i.test(v));
      result.neoforge = compatible.slice(-10).reverse().map((version) => ({ version, stable: true }));
    })()
  ]);
  return result;
}

async function getLatestRelease() {
  const manifest = await getManifest();
  return manifest.latest.release;
}

module.exports = {
  listVersions,
  getManifest,
  getVersionMeta,
  prepareInstance,
  buildLaunchArgs,
  launchInstance,
  killInstance,
  getRunningInstances,
  readInstanceLog,
  getLoaderVersions,
  getLatestRelease,
  splitArgs,
  __debug: { resolveVersion, ensureAssets, ensureLibraries, allowedByRules, substitute }
};
