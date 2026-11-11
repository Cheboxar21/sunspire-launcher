'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile, execFileSync } = require('child_process');
const AdmZip = require('adm-zip');
const { fetchJson, downloadFile } = require('./http.cjs');

let cache = { at: 0, list: [] };

function parseJavaVersion(text) {
  const versionMatch = text.match(/java\.version\s*=\s*([^\s]+)/);
  const runtimeMatch = text.match(/java\.runtime\.version\s*=\s*([^\s]+)/);
  const raw = versionMatch ? versionMatch[1] : runtimeMatch ? runtimeMatch[1] : '';
  if (!raw) return null;
  let major;
  if (raw.startsWith('1.')) {
    major = Number(raw.split('.')[1]);
  } else {
    major = Number(raw.split(/[._-]/)[0]);
  }
  if (!Number.isFinite(major)) return null;
  return { raw, major };
}

function inspectJava(javaExe) {
  return new Promise((resolve) => {
    execFile(
      javaExe,
      ['-XshowSettings:properties', '-version'],
      { timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const text = `${stdout || ''}\n${stderr || ''}`;
        const parsed = parseJavaVersion(text);
        if (!parsed) {
          resolve(null);
          return;
        }
        resolve({
          path: javaExe,
          major: parsed.major,
          version: parsed.raw,
          vendor: (text.match(/java\.vendor\s*=\s*([^\n]+)/) || [])[1]?.trim() || ''
        });
      }
    );
  });
}

function existing(paths) {
  return [...new Set(paths.filter(Boolean))].filter((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

function whichJava() {
  const names = process.platform === 'win32' ? ['java.exe', 'javaw.exe'] : ['java'];
  const found = [];
  for (const name of names) {
    try {
      const result = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], {
        encoding: 'utf8',
        timeout: 4000,
        windowsHide: true
      });
      result
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => found.push(line));
    } catch {
      // not in PATH
    }
  }
  return found;
}

function walkForJava(dir, depth = 3, results = []) {
  if (depth < 0) return results;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  const binJava = path.join(dir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (fs.existsSync(binJava)) results.push(binJava);
  if (depth === 0) return results;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    walkForJava(path.join(dir, entry.name), depth - 1, results);
  }
  return results;
}

function defaultJavaRoots() {
  const roots = [];
  const add = (...parts) => roots.push(path.join(...parts.filter(Boolean)));
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || '';
    const appData = process.env['APPDATA'] || '';
    const vendors = [
      'Java',
      'Eclipse Adoptium',
      'Eclipse Foundation',
      'Microsoft',
      'Zulu',
      'BellSoft',
      'Amazon Corretto',
      'OpenJDK',
      'AdoptOpenJDK',
      'Semeru',
      'Temurin'
    ];
    for (const vendor of vendors) {
      add(programFiles, vendor);
      add(programFilesX86, vendor);
      if (localAppData) add(localAppData, 'Programs', vendor);
      if (localAppData) add(localAppData, vendor);
    }
    if (appData) {
      add(appData, '.minecraft', 'runtime');
      add(appData, '.minecraft', 'java');
    }
    if (process.env.JAVA_HOME) roots.push(process.env.JAVA_HOME);
  } else {
    roots.push('/usr/lib/jvm', '/usr/java', '/opt/java', '/Library/Java/JavaVirtualMachines');
    if (process.env.JAVA_HOME) roots.push(process.env.JAVA_HOME);
  }
  return roots;
}

async function detectJava(extraRoots = []) {
  if (Date.now() - cache.at < 45000) return cache.list;
  const candidates = [];
  candidates.push(...whichJava());
  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'));
  }
  for (const root of [...defaultJavaRoots(), ...extraRoots]) {
    walkForJava(root, 3, candidates);
  }
  const unique = existing(candidates);
  const list = [];
  for (const javaPath of unique) {
    const info = await inspectJava(javaPath);
    if (info) {
      const real = (() => {
        try {
          return fs.realpathSync(javaPath);
        } catch {
          return javaPath;
        }
      })();
      if (!list.some((j) => j.path.toLowerCase() === real.toLowerCase())) {
        list.push({ ...info, path: real });
      }
    }
  }
  list.sort((a, b) => b.major - a.major || b.version.localeCompare(a.version));
  cache = { at: Date.now(), list };
  return list;
}

function chooseJava(list, requiredMajor) {
  if (!list.length) return null;
  const exact = list.find((j) => j.major === requiredMajor);
  if (exact) return exact;
  const newer = list
    .filter((j) => j.major >= requiredMajor)
    .sort((a, b) => a.major - b.major || b.version.localeCompare(a.version));
  if (newer.length) return newer[0];
  return list.sort((a, b) => b.major - a.major)[0] || null;
}

async function downloadTemurinJre(major, destRoot, onProgress) {
  if (process.platform !== 'win32') {
    throw new Error('Автоматическая загрузка Java пока поддерживается только в Windows.');
  }
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const apiUrl =
    `https://api.adoptium.net/v3/assets/latest/${major}/hotspot` +
    `?architecture=${arch}&image_type=jre&os=windows&vendor=eclipse`;
  const data = await fetchJson(apiUrl);
  const pkg = Array.isArray(data) && data[0] && data[0].binary && data[0].binary.package;
  if (!pkg || !pkg.link) throw new Error(`Adoptium не предлагает JRE ${major} для этой системы.`);
  const destDir = path.join(destRoot, `jre-${major}`);
  const zipPath = path.join(destRoot, `temurin-${major}.zip`);
  await fsp.mkdir(destRoot, { recursive: true });
  await downloadFile(pkg.link, zipPath, { onProgress });
  const staging = path.join(destRoot, `jre-${major}-stage`);
  await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
  await fsp.mkdir(staging, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(staging, true);
  await fsp.rm(zipPath, { force: true }).catch(() => {});
  // The archive usually contains one top-level folder.
  let javaExe = null;
  const rootEntries = await fsp.readdir(staging, { withFileTypes: true });
  const dirs = rootEntries.filter((e) => e.isDirectory());
  const possibleRoot = dirs.length === 1 ? path.join(staging, dirs[0].name) : staging;
  const candidate = path.join(possibleRoot, 'bin', 'java.exe');
  if (fs.existsSync(candidate)) javaExe = candidate;
  if (!javaExe) {
    const found = walkForJava(staging, 3, []);
    javaExe = found[0] || null;
  }
  if (!javaExe) throw new Error('В скачанном архиве Java не найден java.exe.');
  // Normalize to a predictable location when possible.
  if (path.dirname(javaExe) !== path.join(destDir, 'bin')) {
    await fsp.rm(destDir, { recursive: true, force: true }).catch(() => {});
    await fsp.rename(possibleRoot, destDir).catch(async () => {
      await fsp.cp(possibleRoot, destDir, { recursive: true });
    });
    javaExe = path.join(destDir, 'bin', 'java.exe');
  }
  await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
  const info = await inspectJava(javaExe);
  if (!info) throw new Error('Не удалось запустить скачанную Java.');
  cache = { at: 0, list: [] };
  return info;
}

async function ensureJava({ requiredMajor = 21, javaPath = '', autoDownload = true, root, onProgress } = {}) {
  if (javaPath) {
    const info = await inspectJava(javaPath);
    if (info && info.major >= requiredMajor) return { ...info, source: 'settings' };
  }
  const all = await detectJava(root ? [path.join(root, 'java')] : []);
  const selected = chooseJava(all, requiredMajor);
  if (selected) {
    return { ...selected, source: 'detected', all };
  }
  if (autoDownload && root) {
    if (onProgress) onProgress({ stage: 'java', message: `Скачивание Java ${requiredMajor} (Temurin JRE)…`, progress: 5 });
    const info = await downloadTemurinJre(requiredMajor, path.join(root, 'java'), (received, total) => {
      if (onProgress) {
        onProgress({
          stage: 'java',
          message: `Скачивание Java ${requiredMajor}… ${total ? Math.round((received / total) * 100) : 0}%`,
          progress: total ? Math.min(80, Math.round((received / total) * 80)) : 10
        });
      }
    });
    return { ...info, source: 'downloaded' };
  }
  const error = new Error(
    `Не найдена Java ${requiredMajor}. Установите JRE/JDK ${requiredMajor} или укажите путь в настройках.`
  );
  error.code = 'JAVA_NOT_FOUND';
  throw error;
}

module.exports = { detectJava, ensureJava, inspectJava, chooseJava, downloadTemurinJre };
