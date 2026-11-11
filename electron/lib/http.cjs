'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const USER_AGENT = 'SunspireLauncher/1.0.0 (local desktop launcher)';

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': USER_AGENT,
          ...(options.headers || {})
        }
      });
      if (!res.ok) {
        const error = new Error(`HTTP ${res.status} :: ${url}`);
        error.status = res.status;
        if (res.status === 404) throw error;
        if (res.status >= 500 || res.status === 429) {
          lastError = error;
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw error;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      await sleep(400 * (attempt + 1));
    }
  }
  throw lastError || new Error(`Request failed: ${url}`);
}

async function fetchJson(url, options = {}, retries = 3) {
  const res = await fetchWithRetry(url, options, retries);
  return res.json();
}

async function fetchText(url, options = {}, retries = 3) {
  const res = await fetchWithRetry(url, options, retries);
  return res.text();
}

async function downloadFile(url, destination, options = {}) {
  const { sha1, size, onProgress, retries = 3 } = options;
  const dir = path.dirname(destination);
  await fsp.mkdir(dir, { recursive: true });

  if (await fileMatches(destination, { sha1, size })) return destination;

  const part = `${destination}.part`;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} :: ${url}`);
      const total = Number(res.headers.get('content-length')) || size || 0;
      let received = 0;
      const nodeStream = Readable.fromWeb(res.body);
      nodeStream.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress) onProgress(received, total);
      });
      await pipeline(nodeStream, fs.createWriteStream(part));
      if (sha1) {
        const actual = await sha1File(part);
        if (actual.toLowerCase() !== sha1.toLowerCase()) {
          await fsp.unlink(part).catch(() => {});
          throw new Error(`Checksum mismatch for ${path.basename(destination)}`);
        }
      }
      await fsp.rename(part, destination);
      return destination;
    } catch (err) {
      lastError = err;
      await fsp.unlink(part).catch(() => {});
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw lastError || new Error(`Download failed: ${url}`);
}

async function fileMatches(file, { sha1, size }) {
  try {
    const stat = await fsp.stat(file);
    if (size && Number(size) > 0 && Number(size) !== stat.size) return false;
    if (sha1) {
      const actual = await sha1File(file);
      return actual.toLowerCase() === sha1.toLowerCase();
    }
    return stat.size > 0;
  } catch {
    return false;
  }
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest();
}

function offlineUuid(username) {
  const hash = md5(`OfflinePlayer:${username}`);
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length || 1)).fill(0).map(async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function parseMavenName(name) {
  if (!name) return null;
  const [coords, extension] = name.split('@');
  const parts = coords.split(':');
  if (parts.length < 3) return null;
  return {
    group: parts[0],
    artifact: parts[1],
    version: parts[2],
    classifier: parts[3] || '',
    extension: extension || 'jar'
  };
}

function mavenPath(name) {
  const parsed = parseMavenName(name);
  if (!parsed) return null;
  const file = `${parsed.artifact}-${parsed.version}${parsed.classifier ? `-${parsed.classifier}` : ''}.${parsed.extension}`;
  return `${parsed.group.replace(/\./g, '/')}/${parsed.artifact}/${parsed.version}/${file}`;
}

function mavenUrl(name, baseUrl) {
  const rel = mavenPath(name);
  if (!rel) return null;
  if (baseUrl) return baseUrl.replace(/\/?$/, '/') + rel;
  const parsed = parseMavenName(name);
  if (!parsed) return null;
  const group = parsed.group;
  if (group.startsWith('net.minecraftforge') || group.startsWith('org.minecraftforge')) {
    return `https://maven.minecraftforge.net/${rel}`;
  }
  if (group.startsWith('net.neoforged')) {
    return `https://maven.neoforged.net/releases/${rel}`;
  }
  if (group.startsWith('net.fabricmc') || group.startsWith('org.quiltmc')) {
    return `https://maven.fabricmc.net/${rel}`;
  }
  if (group.startsWith('org.ow2.asm') || group.startsWith('com.google') || group.startsWith('org.apache')) {
    return `https://repo1.maven.org/maven2/${rel}`;
  }
  return `https://libraries.minecraft.net/${rel}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

module.exports = {
  USER_AGENT,
  fetchWithRetry,
  fetchJson,
  fetchText,
  downloadFile,
  fileMatches,
  sha1File,
  offlineUuid,
  mapLimit,
  parseMavenName,
  mavenPath,
  mavenUrl,
  sleep,
  formatBytes
};
