'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const store = require('./store.cjs');
const { formatBytes } = require('./http.cjs');

const folders = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  datapack: 'datapacks'
};

function folderFor(category) {
  return folders[category] || 'mods';
}

function categoryForFolder(folder) {
  if (folder === 'resourcepacks') return 'resourcepack';
  if (folder === 'shaderpacks') return 'shader';
  if (folder === 'datapacks') return 'datapack';
  return 'mod';
}

async function toggleMod(instanceId, modId) {
  const instance = store.getInstance(instanceId);
  if (!instance) throw new Error('Сборка не найдена.');
  const record = (instance.mods || []).find((m) => m.id === modId);
  if (!record) throw new Error('Мод не найден.');
  const folder = path.join(store.ensureGameDirs(instanceId), folderFor(record.category));
  const current = path.join(folder, record.fileName);
  let fileName = record.fileName;
  let enabled = !record.enabled;
  if (record.enabled) {
    const target = `${current}.disabled`;
    if (fs.existsSync(current)) {
      await fsp.rename(current, target);
      fileName = path.basename(target);
    } else if (fs.existsSync(target)) {
      fileName = path.basename(target);
    } else {
      throw new Error('Файл мода не найден на диске.');
    }
  } else {
    const cleanName = record.fileName.replace(/\.disabled$/i, '');
    const target = path.join(folder, cleanName);
    if (fs.existsSync(current)) {
      await fsp.rename(current, target);
    } else if (!fs.existsSync(target)) {
      throw new Error('Файл мода не найден на диске.');
    }
    fileName = cleanName;
  }
  record.fileName = fileName;
  record.enabled = enabled;
  store.updateInstance(instanceId, { mods: instance.mods });
  return store.publicState();
}

async function removeMod(instanceId, modId) {
  const instance = store.getInstance(instanceId);
  if (!instance) throw new Error('Сборка не найдена.');
  const record = (instance.mods || []).find((m) => m.id === modId);
  if (!record) throw new Error('Мод не найден.');
  const folder = path.join(store.ensureGameDirs(instanceId), folderFor(record.category));
  const candidates = [
    path.join(folder, record.fileName),
    path.join(folder, record.fileName.replace(/\.disabled$/i, '')),
    path.join(folder, `${record.fileName}.disabled`)
  ];
  for (const file of new Set(candidates)) {
    await fsp.rm(file, { force: true }).catch(() => {});
  }
  store.updateInstance(instanceId, {
    mods: (instance.mods || []).filter((m) => m.id !== modId)
  });
  return store.publicState();
}

function titleFromFile(fileName) {
  return fileName
    .replace(/\.(jar|zip)(\.disabled)?$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function addLocalFiles(instanceId, filePaths, kind = 'mod') {
  const instance = store.getInstance(instanceId);
  if (!instance) throw new Error('Сборка не найдена.');
  const category = kind === 'resourcepack' ? 'resourcepack' : kind === 'shader' ? 'shader' : 'mod';
  const dir = path.join(store.ensureGameDirs(instanceId), folderFor(category));
  const mods = [...(instance.mods || [])];
  const added = [];
  for (const filePath of filePaths) {
    const base = path.basename(filePath);
    if (!/\.(jar|zip)$/i.test(base)) continue;
    let fileName = base;
    let counter = 1;
    while (fs.existsSync(path.join(dir, fileName))) {
      fileName = base.replace(/(\.(jar|zip))$/i, `-${counter}$1`);
      counter += 1;
    }
    await fsp.copyFile(filePath, path.join(dir, fileName));
    const stat = await fsp.stat(filePath);
    const record = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      projectId: null,
      versionId: null,
      slug: fileName.replace(/\.(jar|zip)$/i, '').toLowerCase(),
      title: titleFromFile(fileName),
      author: 'Локальный файл',
      version: 'local',
      fileName,
      size: formatBytes(stat.size),
      enabled: true,
      category,
      iconUrl: '',
      description: 'Добавлено вручную с компьютера.'
    };
    mods.push(record);
    added.push(record);
  }
  store.updateInstance(instanceId, { mods });
  return { state: store.publicState(), added };
}

async function scanMods(instanceId) {
  const instance = store.getInstance(instanceId);
  if (!instance) throw new Error('Сборка не найдена.');
  const rootDir = store.ensureGameDirs(instanceId);
  const existing = [...(instance.mods || [])];
  const byFile = new Map(existing.map((m) => [m.fileName, m]));
  const result = [];

  for (const [category, folderName] of Object.entries(folders)) {
    let entries = [];
    try {
      entries = await fsp.readdir(path.join(rootDir, folderName), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      if (!/\.(jar|zip)(\.disabled)?$/i.test(entry.name)) continue;
      let record = byFile.get(entry.name);
      if (!record) {
        const baseName = entry.name.replace(/\.disabled$/i, '');
        record = existing.find((m) => m.fileName === baseName);
        if (record) {
          record.fileName = entry.name;
          record.enabled = !entry.name.endsWith('.disabled');
        }
      }
      if (!record) {
        const base = entry.name.replace(/\.disabled$/i, '');
        record = {
          id: `scan-${folderName}-${base}`,
          projectId: null,
          versionId: null,
          slug: base.replace(/\.(jar|zip)$/i, '').toLowerCase(),
          title: titleFromFile(base),
          author: 'Найдено в сборке',
          version: 'local',
          fileName: entry.name,
          size: '',
          enabled: !entry.name.endsWith('.disabled'),
          category: categoryForFolder(folderName),
          iconUrl: '',
          description: 'Файл найден в папке сборки.'
        };
      }
      if (!result.some((m) => m.fileName === record.fileName)) result.push(record);
      byFile.delete(entry.name);
    }
  }
  store.updateInstance(instanceId, { mods: result });
  return store.publicState();
}

module.exports = { toggleMod, removeMod, addLocalFiles, scanMods, folderFor };
