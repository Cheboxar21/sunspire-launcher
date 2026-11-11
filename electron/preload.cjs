'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('retro', {
  isDesktop: true,
  platform: process.platform,
  state: {
    get: () => ipcRenderer.invoke('state:get'),
    update: (patch) => ipcRenderer.invoke('state:update', patch),
    openGameRoot: () => ipcRenderer.invoke('state:openGameRoot'),
    openInstanceFolder: (instanceId) => ipcRenderer.invoke('state:openInstanceFolder', instanceId)
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    close: () => ipcRenderer.invoke('window:close')
  },
  auth: {
    microsoft: () => ipcRenderer.invoke('auth:microsoft'),
    offline: (username) => ipcRenderer.invoke('auth:offline', username),
    select: (accountId) => ipcRenderer.invoke('auth:select', accountId),
    remove: (accountId) => ipcRenderer.invoke('auth:remove', accountId),
    refresh: (accountId) => ipcRenderer.invoke('auth:refresh', accountId),
    uploadSkin: (accountId, variant) => ipcRenderer.invoke('auth:uploadSkin', accountId, variant),
    getSkin: (accountId) => ipcRenderer.invoke('auth:getSkin', accountId),
    fetchSkin: (url) => ipcRenderer.invoke('skin:fetchUrl', url)
  },
  java: {
    list: () => ipcRenderer.invoke('java:list'),
    choose: () => ipcRenderer.invoke('java:choose')
  },
  instances: {
    create: (input) => ipcRenderer.invoke('instances:create', input),
    update: (instanceId, patch) => ipcRenderer.invoke('instances:update', instanceId, patch),
    select: (instanceId) => ipcRenderer.invoke('instances:select', instanceId),
    delete: (instanceId) => ipcRenderer.invoke('instances:delete', instanceId)
  },
  mods: {
    toggle: (instanceId, modId) => ipcRenderer.invoke('mods:toggle', instanceId, modId),
    remove: (instanceId, modId) => ipcRenderer.invoke('mods:remove', instanceId, modId),
    scan: (instanceId) => ipcRenderer.invoke('mods:scan', instanceId),
    addLocal: (instanceId, kind) => ipcRenderer.invoke('mods:addLocal', instanceId, kind),
    readLog: (instanceId) => ipcRenderer.invoke('instance:readLog', instanceId)
  },
  mc: {
    versions: () => ipcRenderer.invoke('mc:versions'),
    latestRelease: () => ipcRenderer.invoke('mc:latestRelease'),
    loaders: (mcVersion) => ipcRenderer.invoke('mc:loaders', mcVersion)
  },
  launch: {
    start: (instanceId, accountId) => ipcRenderer.invoke('launch:start', instanceId, accountId),
    kill: (instanceId) => ipcRenderer.invoke('launch:kill', instanceId),
    running: () => ipcRenderer.invoke('launch:running')
  },
  modrinth: {
    search: (options) => ipcRenderer.invoke('modrinth:search', options),
    project: (projectId) => ipcRenderer.invoke('modrinth:project', projectId),
    versions: (projectId, filters) => ipcRenderer.invoke('modrinth:versions', projectId, filters),
    install: (options) => ipcRenderer.invoke('modrinth:install', options),
    installModpack: (options) => ipcRenderer.invoke('modrinth:installModpack', options),
    importMrpack: () => ipcRenderer.invoke('modrinth:importMrpack')
  },
  events: {
    onStateChanged: (callback) => subscribe('state:changed', callback),
    onTaskProgress: (callback) => subscribe('task:progress', callback),
    onLaunchProgress: (callback) => subscribe('launch:progress', callback),
    onLaunchLog: (callback) => subscribe('launch:log', callback),
    onLaunchState: (callback) => subscribe('launch:state', callback)
  }
});
