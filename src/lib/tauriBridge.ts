import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import type {
  Account,
  Envelope,
  InstallResult,
  InstalledMod,
  JavaInfo,
  JsonIcon,
  LauncherSettings,
  LauncherState,
  LoaderVersions,
  LogEntry,
  ModLoader,
  ModpackInstallResult,
  ModpackInstance,
  ModrinthProject,
  ModrinthSearchResult,
  ModrinthVersion,
  ProjectType,
  RetroApi,
  SearchOptions,
  SkinData,
  SystemInfo,
  TaskProgress,
  UpdateInfo,
  VersionManifest
} from '../types';

/**
 * Tauri compatibility bridge.
 *
 * The whole React UI was originally written against the Electron preload API
 * (`window.retro`). Tauri exposes commands and events instead, so this module
 * recreates the exact same contract on top of `invoke`/`listen`. Keeping the
 * bridge means every page and action works unchanged in both runtimes.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface InvokeError {
  message?: string;
  code?: string;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<Envelope<T>> {
  try {
    const data = await invoke<T>(command, args);
    return { ok: true, data };
  } catch (error) {
    if (typeof error === 'string') {
      return { ok: false, error: { message: error, code: 'ERROR' } };
    }
    const payload = error as InvokeError;
    return {
      ok: false,
      error: {
        message: payload?.message || 'Команда завершилась с ошибкой.',
        code: payload?.code || 'ERROR'
      }
    };
  }
}

function subscribe<T>(event: string, callback: (payload: T) => void): () => void {
  let stopped = false;
  let unlisten: UnlistenFn | null = null;
  void listen<T>(event, (payload) => callback(payload.payload)).then((dispose) => {
    if (stopped) dispose();
    else unlisten = dispose;
  });
  return () => {
    stopped = true;
    if (unlisten) unlisten();
  };
}

const tauriWindow = isTauri ? getCurrentWindow() : null;

const bridge: RetroApi = {
  isDesktop: true,
  platform: 'win32',
  state: {
    get: () => call<LauncherState>('state_get'),
    update: (patch) => call<LauncherState>('state_update', { patch }),
    openGameRoot: () => call<string>('state_open_game_root'),
    openInstanceFolder: (instanceId) => call<string>('state_open_instance_folder', { instanceId })
  },
  app: {
    info: () => call<SystemInfo>('app_info'),
    openExternal: async (url) => {
      try {
        await openUrl(url);
        return { ok: true, data: true };
      } catch (error) {
        return {
          ok: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
            code: 'OPEN_FAILED'
          }
        };
      }
    },
    checkUpdates: () => call<UpdateInfo>('update_check'),
    openLogo: () => call<string>('app_open_logo'),
    installUpdate: async (url) => {
      const result = await call<void>('update_install', { url });
      return result.ok ? { ok: true, data: true } : { ok: false, error: result.error };
    }
  },
  window: {
    minimize: async () => {
      try {
        await tauriWindow?.minimize();
        return { ok: true, data: undefined };
      } catch (error) {
        return { ok: false, error: { message: String(error), code: 'WINDOW_ERROR' } };
      }
    },
    toggleMaximize: async () => {
      try {
        const maximized = (await tauriWindow?.isMaximized()) ?? false;
        if (maximized) await tauriWindow?.unmaximize();
        else await tauriWindow?.maximize();
        return { ok: true, data: !maximized };
      } catch (error) {
        return { ok: false, error: { message: String(error), code: 'WINDOW_ERROR' } };
      }
    },
    isMaximized: async () => {
      try {
        return { ok: true, data: (await tauriWindow?.isMaximized()) ?? false };
      } catch (error) {
        return { ok: false, error: { message: String(error), code: 'WINDOW_ERROR' } };
      }
    },
    close: async () => {
      try {
        await tauriWindow?.close();
        return { ok: true, data: undefined };
      } catch (error) {
        return { ok: false, error: { message: String(error), code: 'WINDOW_ERROR' } };
      }
    }
  },
  auth: {
    microsoft: () => call<{ ok: boolean; account: Account }>('auth_microsoft'),
    offline: (username) => call<{ ok: boolean; account: Account }>('auth_offline', { username }),
    select: (accountId) => call<LauncherState>('auth_select', { accountId }),
    remove: (accountId) => call<LauncherState>('auth_remove', { accountId }),
    refresh: (accountId) => call<Account>('auth_refresh', { accountId }),
    uploadSkin: (accountId, variant) => call<Account | null>('auth_upload_skin', { accountId, variant }),
    getSkin: (accountId) => call<SkinData | null>('auth_get_skin', { accountId }),
    fetchSkin: (url) => call<string>('skin_fetch_url', { url })
  },
  java: {
    list: () => call<{ java: JavaInfo[]; selected: string }>('java_list'),
    choose: () => call<JavaInfo | null>('java_choose')
  },
  instances: {
    create: (input) =>
      call<{ state: LauncherState; instance: ModpackInstance }>('instances_create', {
        input: {
          name: input.name,
          mcVersion: input.mcVersion,
          loader: input.loader,
          loaderVersion: input.loaderVersion,
          ramMb: input.ramMb,
          icon: input.icon,
          server: input.server
        }
      }),
    update: (instanceId, patch) =>
      call<{ state: LauncherState; instance: ModpackInstance }>('instances_update', {
        instanceId,
        patch
      }),
    select: (instanceId) => call<LauncherState>('instances_select', { instanceId }),
    delete: (instanceId) => call<LauncherState>('instances_delete', { instanceId })
  },
  mods: {
    toggle: (instanceId, modId) => call<LauncherState>('mods_toggle', { instanceId, modId }),
    remove: (instanceId, modId) => call<LauncherState>('mods_remove', { instanceId, modId }),
    scan: (instanceId) => call<LauncherState>('mods_scan', { instanceId }),
    addLocal: (instanceId, kind) =>
      call<{ state: LauncherState; added: InstalledMod[] } | null>('mods_add_local', {
        instanceId,
        kind
      }),
    readLog: (instanceId) => call<string>('instance_read_log', { instanceId })
  },
  mc: {
    versions: () => call<VersionManifest>('mc_versions'),
    latestRelease: () => call<string>('mc_latest_release'),
    loaders: (mcVersion) => call<LoaderVersions>('mc_loaders', { mcVersion })
  },
  launch: {
    start: (instanceId, accountId) =>
      call<{ pid: number; prepared: { java: JavaInfo; profileId: string } }>('launch_start', {
        instanceId,
        accountId
      }),
    kill: (instanceId) => call<boolean>('launch_kill', { instanceId }),
    running: () =>
      call<{ instanceId: string; pid: number; startedAt: number; accountId: string }[]>('launch_running')
  },
  modrinth: {
    search: (options: SearchOptions) => call<ModrinthSearchResult>('modrinth_search', { options }),
    project: (projectId) => call<ModrinthProject>('modrinth_project', { projectId }),
    versions: (projectId, filters) =>
      call<ModrinthVersion[]>('modrinth_versions', { projectId, filters }),
    install: (options) => call<InstallResult>('modrinth_install', { options }),
    installModpack: (options) => call<ModpackInstallResult>('modrinth_install_modpack', { options }),
    importMrpack: () => call<ModpackInstallResult | null>('modrinth_import_mrpack')
  },
  events: {
    onStateChanged: (callback) => subscribe<LauncherState>('state:changed', callback),
    onTaskProgress: (callback) => subscribe<TaskProgress>('task:progress', callback),
    onLaunchProgress: (callback) => subscribe('launch:progress', callback),
    onLaunchLog: (callback) => subscribe<LogEntry & { instanceId: string }>('launch:log', callback),
    onLaunchState: (callback) => subscribe('launch:state', callback)
  }
};

if (isTauri) {
  window.retro = bridge;
}

export { isTauri };
