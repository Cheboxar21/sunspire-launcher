'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const STATE_VERSION = 1;
let state = null;

function defaultSettings() {
  return {
    javaPath: '',
    defaultRamMb: 4096,
    autoDownloadJava: true,
    crtEffect: true,
    showConsoleOnLaunch: false,
    closeLauncherOnGameStart: false,
    dataDir: '',
    offlineSkinDataUrl: ''
  };
}

function defaultState() {
  return {
    version: STATE_VERSION,
    settings: defaultSettings(),
    accounts: [],
    instances: [],
    activeAccountId: null,
    activeInstanceId: null
  };
}

function stateFile() {
  return path.join(app.getPath('userData'), 'launcher-state.json');
}

function gameRoot() {
  if (state && state.settings && state.settings.dataDir) {
    return state.settings.dataDir;
  }
  return path.join(app.getPath('appData'), 'Sunspire');
}

function load() {
  if (state) return state;
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    parsed = null;
  }
  state = { ...defaultState(), ...(parsed || {}) };
  state.settings = { ...defaultSettings(), ...(state.settings || {}) };
  if (!Array.isArray(state.accounts)) state.accounts = [];
  if (!Array.isArray(state.instances)) state.instances = [];
  // Repair stale references
  if (state.activeAccountId && !state.accounts.some((a) => a.id === state.activeAccountId)) {
    state.activeAccountId = state.accounts[0] ? state.accounts[0].id : null;
  }
  if (state.activeInstanceId && !state.instances.some((i) => i.id === state.activeInstanceId)) {
    state.activeInstanceId = state.instances[0] ? state.instances[0].id : null;
  }
  return state;
}

function save() {
  if (!state) return;
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function sanitizeAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    type: account.type,
    username: account.username,
    uuid: account.uuid,
    licenseLabel: account.licenseLabel,
    skinUrl: account.skinUrl || '',
    capeUrl: account.capeUrl || '',
    slimArms: Boolean(account.slimArms),
    skinDataUrl: account.skinDataUrl || '',
    addedAt: account.addedAt || null,
    lastLoginAt: account.lastLoginAt || null
  };
}

function publicState() {
  const s = load();
  return {
    settings: { ...s.settings },
    accounts: s.accounts.map(sanitizeAccount),
    instances: s.instances,
    activeAccountId: s.activeAccountId,
    activeInstanceId: s.activeInstanceId,
    gameRoot: gameRoot(),
    stateFile: stateFile(),
    version: s.version
  };
}

function getState() {
  return load();
}

function getAccount(id) {
  const s = load();
  return s.accounts.find((a) => a.id === id) || null;
}

function getActiveAccount() {
  const s = load();
  return s.accounts.find((a) => a.id === s.activeAccountId) || null;
}

function getInstance(id) {
  const s = load();
  return s.instances.find((i) => i.id === id) || null;
}

function getActiveInstance() {
  const s = load();
  return s.instances.find((i) => i.id === s.activeInstanceId) || null;
}

function upsertAccount(account) {
  const s = load();
  const index = s.accounts.findIndex((a) => a.id === account.id);
  if (index >= 0) {
    s.accounts[index] = { ...s.accounts[index], ...account };
  } else {
    s.accounts.push(account);
  }
  save();
  return index >= 0 ? s.accounts[index] : account;
}

function removeAccount(id) {
  const s = load();
  s.accounts = s.accounts.filter((a) => a.id !== id);
  if (s.activeAccountId === id) {
    s.activeAccountId = s.accounts[0] ? s.accounts[0].id : null;
  }
  save();
}

function setActiveAccount(id) {
  const s = load();
  if (s.accounts.some((a) => a.id === id)) {
    s.activeAccountId = id;
    save();
  }
}

function upsertInstance(instance) {
  const s = load();
  const index = s.instances.findIndex((i) => i.id === instance.id);
  if (index >= 0) {
    s.instances[index] = { ...s.instances[index], ...instance };
  } else {
    s.instances.unshift(instance);
  }
  if (!s.activeInstanceId) s.activeInstanceId = instance.id;
  save();
  return index >= 0 ? s.instances[index] : instance;
}

function removeInstance(id) {
  const s = load();
  s.instances = s.instances.filter((i) => i.id !== id);
  if (s.activeInstanceId === id) {
    s.activeInstanceId = s.instances[0] ? s.instances[0].id : null;
  }
  save();
}

function updateInstance(id, patch) {
  const s = load();
  const instance = s.instances.find((i) => i.id === id);
  if (!instance) return null;
  Object.assign(instance, patch);
  save();
  return instance;
}

function update(patch) {
  const s = load();
  if (patch && typeof patch === 'object') {
    if (patch.settings && typeof patch.settings === 'object') {
      s.settings = { ...s.settings, ...patch.settings };
    }
    if (Array.isArray(patch.instances)) {
      s.instances = patch.instances;
      if (s.activeInstanceId && !s.instances.some((i) => i.id === s.activeInstanceId)) {
        s.activeInstanceId = s.instances[0] ? s.instances[0].id : null;
      }
    }
    if (typeof patch.activeInstanceId === 'string' || patch.activeInstanceId === null) {
      s.activeInstanceId = patch.activeInstanceId;
    }
    if (typeof patch.activeAccountId === 'string' || patch.activeAccountId === null) {
      s.activeAccountId = patch.activeAccountId;
    }
  }
  save();
  return publicState();
}

function instanceDir(id) {
  return path.join(gameRoot(), 'instances', id);
}

function ensureGameDirs(id) {
  const dir = instanceDir(id);
  for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'saves', 'logs', 'config', 'datapacks']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  fs.mkdirSync(path.join(gameRoot(), 'assets'), { recursive: true });
  fs.mkdirSync(path.join(gameRoot(), 'libraries'), { recursive: true });
  fs.mkdirSync(path.join(gameRoot(), 'versions'), { recursive: true });
  fs.mkdirSync(path.join(gameRoot(), 'meta'), { recursive: true });
  return dir;
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

module.exports = {
  load,
  save,
  getState,
  publicState,
  getAccount,
  getActiveAccount,
  getInstance,
  getActiveInstance,
  upsertAccount,
  removeAccount,
  setActiveAccount,
  upsertInstance,
  removeInstance,
  updateInstance,
  update,
  gameRoot,
  instanceDir,
  ensureGameDirs,
  newId,
  sanitizeAccount,
  defaultSettings
};
