'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const store = require('./lib/store.cjs');
const auth = require('./lib/auth.cjs');
const java = require('./lib/java.cjs');
const mc = require('./lib/minecraft.cjs');
const modrinth = require('./lib/modrinth.cjs');
const mods = require('./lib/mods.cjs');

const APP_VERSION = require('../package.json').version;
const ALLOWED_ICONS = ['grass', 'diamond', 'gold', 'redstone', 'ender', 'amethyst', 'stone'];
const ALLOWED_LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];

let mainWindow = null;
let lastProgressAt = 0;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function emit(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function notifyState() {
  emit('state:changed', store.publicState());
}

function taskProgress(kind, instanceId) {
  return (payload = {}) => {
    const now = Date.now();
    if (now - lastProgressAt < 60 && payload.progress !== 100) return;
    lastProgressAt = now;
    emit('task:progress', {
      kind,
      instanceId: instanceId || null,
      at: now,
      ...payload
    });
  };
}

function registerHandler(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const data = await fn(event, ...args);
      return { ok: true, data };
    } catch (err) {
      console.error(`[ipc:${channel}]`, err);
      return {
        ok: false,
        error: {
          message: err && err.message ? err.message : String(err),
          code: (err && err.code) || 'ERROR'
        }
      };
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#0b0d09',
    title: 'Sunspire Launcher',
    icon: path.join(__dirname, '..', 'public', 'assets', 'icon-sunspire.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current && !url.startsWith('file:')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const indexFile = path.join(__dirname, '..', 'dist', 'index.html');
    if (!fsSync.existsSync(indexFile)) {
      mainWindow.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            '<body style="background:#0b0d09;color:#c9f75b;font-family:monospace;padding:40px">' +
              '<h1>SUNSPIRE</h1><p>Сначала соберите интерфейс: <b>npm run build</b>, затем запустите Electron.</p></body>'
          )
      );
    } else {
      mainWindow.loadFile(indexFile);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc() {
  registerHandler('state:get', async () => store.publicState());
  registerHandler('state:update', async (_event, patch) => {
    const safe = {};
    if (patch && patch.settings && typeof patch.settings === 'object') {
      const input = patch.settings;
      const settings = {};
      if (input.defaultRamMb != null) {
        settings.defaultRamMb = Math.min(32768, Math.max(1024, Number(input.defaultRamMb) || 4096));
      }
      if (input.javaPath != null) settings.javaPath = String(input.javaPath || '');
      if (input.autoDownloadJava != null) settings.autoDownloadJava = Boolean(input.autoDownloadJava);
      if (input.crtEffect != null) settings.crtEffect = Boolean(input.crtEffect);
      if (input.showConsoleOnLaunch != null) settings.showConsoleOnLaunch = Boolean(input.showConsoleOnLaunch);
      if (input.closeLauncherOnGameStart != null) {
        settings.closeLauncherOnGameStart = Boolean(input.closeLauncherOnGameStart);
      }
      safe.settings = settings;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'activeAccountId')) {
      if (patch.activeAccountId === null || store.getAccount(patch.activeAccountId)) {
        safe.activeAccountId = patch.activeAccountId;
      }
    }
    const result = store.update(safe);
    notifyState();
    return result;
  });

  registerHandler('state:openGameRoot', async () => {
    const dir = store.gameRoot();
    await fs.mkdir(dir, { recursive: true });
    await shell.openPath(dir);
    return dir;
  });
  registerHandler('state:openInstanceFolder', async (_event, instanceId) => {
    const instance = store.getInstance(instanceId);
    if (!instance) throw new Error('Сборка не найдена.');
    const dir = store.ensureGameDirs(instanceId);
    await shell.openPath(dir);
    return dir;
  });

  registerHandler('app:info', async () => ({
    version: APP_VERSION,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
    cpus: os.cpus().length,
    gameRoot: store.gameRoot(),
    userData: app.getPath('userData')
  }));

  registerHandler('app:openExternal', async (_event, url) => {
    const value = String(url || '');
    if (!/^https?:\/\//i.test(value)) throw new Error('Недопустимая ссылка.');
    await shell.openExternal(value);
    return true;
  });

  // Window controls
  registerHandler('window:minimize', async () => {
    if (mainWindow) mainWindow.minimize();
  });
  registerHandler('window:toggleMaximize', async () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  registerHandler('window:isMaximized', async () => Boolean(mainWindow && mainWindow.isMaximized()));
  registerHandler('window:close', async () => {
    if (mainWindow) mainWindow.close();
  });

  // Auth
  registerHandler('auth:microsoft', async () => {
    const result = await auth.loginMicrosoft(mainWindow);
    notifyState();
    return result;
  });
  registerHandler('auth:offline', async (_event, username) => {
    const result = auth.addOfflineAccount(username);
    notifyState();
    return result;
  });
  registerHandler('auth:select', async (_event, accountId) => {
    if (!store.getAccount(accountId)) throw new Error('Аккаунт не найден.');
    store.setActiveAccount(accountId);
    notifyState();
    return store.publicState();
  });
  registerHandler('auth:remove', async (_event, accountId) => {
    store.removeAccount(accountId);
    notifyState();
    return store.publicState();
  });
  registerHandler('auth:refresh', async (_event, accountId) => {
    const account = await auth.getValidAccount(accountId);
    notifyState();
    return store.sanitizeAccount(account);
  });
  registerHandler('auth:uploadSkin', async (_event, accountId, variant) => {
    const account = store.getAccount(accountId);
    if (!account) throw new Error('Аккаунт не найден.');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите PNG-скин (64×64 или 64×32)',
      filters: [{ name: 'Minecraft skin', extensions: ['png'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const updated = account.type === 'offline'
      ? await auth.setOfflineSkin(accountId, result.filePaths[0], variant)
      : await auth.uploadSkin(accountId, result.filePaths[0], variant);
    notifyState();
    return updated;
  });
  registerHandler('auth:getSkin', async (_event, accountId) => {
    const account = store.getAccount(accountId);
    if (!account) return null;
    const [skinDataUrl, capeDataUrl] = await Promise.all([
      auth.getSkinData(accountId),
      auth.getCapeData(accountId)
    ]);
    return { skinDataUrl, capeDataUrl, slimArms: Boolean(account.slimArms) };
  });
  registerHandler('skin:fetchUrl', async (_event, url) => {
    const value = String(url || '');
    if (!/^https?:\/\//i.test(value)) throw new Error('Недопустимый адрес скина.');
    return auth.fetchImageDataUrl(value);
  });

  // Java
  registerHandler('java:list', async () => {
    const list = await java.detectJava([path.join(store.gameRoot(), 'java')]);
    return { java: list, selected: store.getState().settings.javaPath };
  });
  registerHandler('java:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите java.exe',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : []
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const info = await java.inspectJava(result.filePaths[0]);
    if (!info) throw new Error('Это не похоже на исполняемый файл Java.');
    return info;
  });

  // Instances
  registerHandler('instances:create', async (_event, input) => {
    const name = String((input && input.name) || '').trim().slice(0, 60);
    if (!name) throw new Error('Введите название сборки.');
    const mcVersion = String((input && input.mcVersion) || '').trim();
    if (!mcVersion) throw new Error('Выберите версию Minecraft.');
    const loader = ALLOWED_LOADERS.includes(input && input.loader) ? input.loader : 'fabric';
    const id = store.newId('inst');
    const instance = {
      id,
      name,
      mcVersion,
      loader,
      loaderVersion: String((input && input.loaderVersion) || '').trim(),
      ramMb: Math.min(32768, Math.max(1024, Number(input && input.ramMb) || store.getState().settings.defaultRamMb || 4096)),
      javaArgs: String((input && input.javaArgs) || '').slice(0, 1000),
      javaPath: '',
      icon: ALLOWED_ICONS.includes(input && input.icon) ? input.icon : 'grass',
      iconUrl: '',
      modpack: null,
      mods: [],
      server: String((input && input.server) || '').trim().slice(0, 200),
      createdAt: new Date().toISOString(),
      lastPlayedAt: null,
      totalPlayMs: 0
    };
    store.ensureGameDirs(id);
    store.upsertInstance(instance);
    store.update({ activeInstanceId: id });
    notifyState();
    return { state: store.publicState(), instance };
  });
  registerHandler('instances:update', async (_event, instanceId, patch) => {
    const instance = store.getInstance(instanceId);
    if (!instance) throw new Error('Сборка не найдена.');
    const updates = {};
    if (patch && patch.name != null) {
      const name = String(patch.name).trim().slice(0, 60);
      if (name) updates.name = name;
    }
    if (patch && patch.ramMb != null) {
      updates.ramMb = Math.min(32768, Math.max(1024, Number(patch.ramMb) || 4096));
    }
    if (patch && patch.javaArgs != null) updates.javaArgs = String(patch.javaArgs).slice(0, 1000);
    if (patch && patch.javaPath != null) updates.javaPath = String(patch.javaPath);
    if (patch && patch.server != null) updates.server = String(patch.server).slice(0, 200);
    if (patch && patch.icon != null && ALLOWED_ICONS.includes(patch.icon)) updates.icon = patch.icon;
    const updated = store.updateInstance(instanceId, updates);
    notifyState();
    return { state: store.publicState(), instance: updated };
  });
  registerHandler('instances:select', async (_event, instanceId) => {
    if (!store.getInstance(instanceId)) throw new Error('Сборка не найдена.');
    store.update({ activeInstanceId: instanceId });
    notifyState();
    return store.publicState();
  });
  registerHandler('instances:delete', async (_event, instanceId) => {
    if (!store.getInstance(instanceId)) throw new Error('Сборка не найдена.');
    await mc.killInstance(instanceId).catch(() => {});
    const dir = store.instanceDir(instanceId);
    const rootDir = path.resolve(store.gameRoot(), 'instances');
    if (path.resolve(dir).startsWith(rootDir)) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    store.removeInstance(instanceId);
    notifyState();
    return store.publicState();
  });

  // Installed mods
  registerHandler('mods:toggle', async (_event, instanceId, modId) => mods.toggleMod(instanceId, modId));
  registerHandler('mods:remove', async (_event, instanceId, modId) => mods.removeMod(instanceId, modId));
  registerHandler('mods:scan', async (_event, instanceId) => {
    const result = await mods.scanMods(instanceId);
    notifyState();
    return result;
  });
  registerHandler('mods:addLocal', async (_event, instanceId, kind) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Добавить файлы в сборку',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Minecraft файлы', extensions: ['jar', 'zip'] },
        { name: 'Все файлы', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const added = await mods.addLocalFiles(instanceId, result.filePaths, kind);
    notifyState();
    return added;
  });
  registerHandler('instance:readLog', async (_event, instanceId) => mc.readInstanceLog(instanceId));

  // Minecraft versions / loaders
  registerHandler('mc:versions', async () => mc.listVersions());
  registerHandler('mc:latestRelease', async () => mc.getLatestRelease());
  registerHandler('mc:loaders', async (_event, mcVersion) => mc.getLoaderVersions(mcVersion));

  // Launch
  registerHandler('launch:start', async (_event, instanceId, accountId) => {
    const result = await mc.launchInstance(instanceId, accountId || store.getState().activeAccountId, {
      onProgress: (payload) => emit('launch:progress', payload),
      onLog: (payload) => emit('launch:log', { instanceId, ...payload }),
      onState: (payload) => {
        emit('launch:state', payload);
        if (payload.state === 'exited' || payload.state === 'error') {
          notifyState();
        }
      }
    });
    notifyState();
    return result;
  });
  registerHandler('launch:kill', async (_event, instanceId) => mc.killInstance(instanceId));
  registerHandler('launch:running', async () => mc.getRunningInstances());

  // Modrinth
  registerHandler('modrinth:search', async (_event, options) => modrinth.search(options || {}));
  registerHandler('modrinth:project', async (_event, projectId) => modrinth.getProjectDetails(projectId));
  registerHandler('modrinth:versions', async (_event, projectId, filters) =>
    modrinth.getVersions(projectId, filters || {})
  );
  registerHandler('modrinth:install', async (_event, options) => {
    const { instanceId } = options || {};
    const result = await modrinth.installProject({
      ...options,
      instanceId,
      onProgress: taskProgress('mod', instanceId)
    });
    notifyState();
    return result;
  });
  registerHandler('modrinth:installModpack', async (_event, options) => {
    const result = await modrinth.installModpack({
      ...(options || {}),
      onProgress: taskProgress('modpack', null)
    });
    notifyState();
    return result;
  });
  registerHandler('modrinth:importMrpack', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Импорт модпака Modrinth',
      filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const installed = await modrinth.importModpack(result.filePaths[0]);
    notifyState();
    return installed;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  if (!gotLock) return;
  store.load();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
