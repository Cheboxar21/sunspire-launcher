import {
  Account,
  Envelope,
  InstallResult,
  InstalledMod,
  JavaInfo,
  JsonIcon,
  LauncherSettings,
  LauncherState,
  LoaderVersions,
  ModpackInstallResult,
  ModpackInstance,
  ModrinthProject,
  ModrinthSearchResult,
  ModrinthVersion,
  ProjectType,
  SearchOptions,
  SkinData,
  SystemInfo,
  TaskProgress,
  UpdateInfo,
  VersionManifest
} from '../types';

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = 'ERROR') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function unwrap<T>(promise: Promise<Envelope<T>>): Promise<T> {
  const result = await promise;
  if (!result) throw new ApiError('Нет ответа от лаунчера.', 'NO_RESPONSE');
  if (!result.ok) {
    throw new ApiError(
      (result.error && result.error.message) || 'Неизвестная ошибка.',
      (result.error && result.error.code) || 'ERROR'
    );
  }
  return result.data as T;
}

const desktop = typeof window !== 'undefined' && Boolean(window.retro);

/* -------------------------------------------------------------------------- */
/*                            Browser preview fallback                        */
/* -------------------------------------------------------------------------- */

const DEMO_KEY = 'sunspire-web-demo-state-v1';

const demoInstances: ModpackInstance[] = [
  {
    id: 'demo-retro-smp',
    name: 'RETRO SMP',
    mcVersion: '26.3',
    loader: 'fabric',
    loaderVersion: '0.20.1',
    ramMb: 6144,
    javaArgs: '',
    icon: 'grass',
    iconUrl: '',
    mods: [
      {
        id: 'demo-sodium',
        projectId: 'AANobbMI',
        versionId: null,
        slug: 'sodium',
        title: 'Sodium',
        author: 'CaffeineMC',
        version: '0.6.13',
        fileName: 'sodium-fabric-0.6.13+mc26.3.jar',
        size: '1.2 MB',
        enabled: true,
        category: 'mod',
        iconUrl: 'https://cdn.modrinth.com/data/AANobbMI/icon.png',
        description: 'Современный движок рендеринга: больше FPS, меньше фризов.'
      },
      {
        id: 'demo-lithium',
        projectId: 'gvQqBUqZ',
        versionId: null,
        slug: 'lithium',
        title: 'Lithium',
        author: 'CaffeineMC',
        version: '0.15.3',
        fileName: 'lithium-fabric-0.15.3+mc26.3.jar',
        size: '702 KB',
        enabled: true,
        category: 'mod',
        iconUrl: 'https://cdn.modrinth.com/data/gvQqBUqZ/icon.png',
        description: 'Оптимизация игровой логики без изменения механик.'
      },
      {
        id: 'demo-iris',
        projectId: 'YL57xq9U',
        versionId: null,
        slug: 'iris',
        title: 'Iris Shaders',
        author: 'IrisShaders',
        version: '1.9.4',
        fileName: 'iris-fabric-1.9.4+mc26.3.jar',
        size: '3.4 MB',
        enabled: true,
        category: 'mod',
        iconUrl: 'https://cdn.modrinth.com/data/YL57xq9U/icon.png',
        description: 'Шейдеры нового поколения с полной поддержкой Sodium.'
      },
      {
        id: 'demo-modmenu',
        projectId: 'mOgUt4GM',
        versionId: null,
        slug: 'mod-menu',
        title: 'Mod Menu',
        author: 'Prospector',
        version: '17.0.0',
        fileName: 'modmenu-17.0.0.jar',
        size: '1.1 MB',
        enabled: false,
        category: 'mod',
        iconUrl: 'https://cdn.modrinth.com/data/mOgUt4GM/icon.png',
        description: 'Удобное меню со списком установленных модов.'
      }
    ],
    createdAt: '2026-09-20T12:00:00.000Z',
    lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    totalPlayMs: 1000 * 60 * 60 * 42 + 1000 * 60 * 18
  },
  {
    id: 'demo-skyblock',
    name: 'SKYBLOCK ONE',
    mcVersion: '26.3',
    loader: 'vanilla',
    loaderVersion: '',
    ramMb: 4096,
    javaArgs: '-XX:+UseG1GC',
    icon: 'diamond',
    mods: [],
    createdAt: '2026-10-01T12:00:00.000Z',
    lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 54).toISOString(),
    totalPlayMs: 1000 * 60 * 60 * 12 + 1000 * 60 * 42
  },
  {
    id: 'demo-create',
    name: 'CREATE: STEAMPUNK',
    mcVersion: '1.21.4',
    loader: 'neoforge',
    loaderVersion: '21.4.109',
    ramMb: 8192,
    javaArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled',
    icon: 'gold',
    mods: [
      {
        id: 'demo-create-mod',
        projectId: 'LNytGWDc',
        versionId: null,
        slug: 'create',
        title: 'Create',
        author: 'simibubi',
        version: '6.0.9',
        fileName: 'create-1.21.4-6.0.9.jar',
        size: '16.8 MB',
        enabled: true,
        category: 'mod',
        iconUrl: 'https://cdn.modrinth.com/data/LNytGWDc/icon.png',
        description: 'Механизмы, поезда и автоматика в стиле стимпанк.'
      },
      {
        id: 'demo-jei',
        projectId: 'u6dRKJwZ',
        versionId: null,
        slug: 'jei',
        title: 'Just Enough Items',
        author: 'mezz',
        version: '21.4.1',
        fileName: 'jei-1.21.4-neoforge-21.4.1.jar',
        size: '2.6 MB',
        enabled: true,
        category: 'mod',
        iconUrl: 'https://cdn.modrinth.com/data/u6dRKJwZ/icon.png',
        description: 'Просмотр всех предметов и рецептов игры.'
      }
    ],
    createdAt: '2026-08-12T12:00:00.000Z',
    lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
    totalPlayMs: 1000 * 60 * 60 * 87 + 1000 * 60 * 43
  }
];

function demoState(): LauncherState {
  return {
    settings: {
      javaPath: '',
      defaultRamMb: 6144,
      autoDownloadJava: true,
      crtEffect: true,
      showConsoleOnLaunch: false,
      closeLauncherOnGameStart: false,
      closeToTray: true,
      discordRpc: true,
      discordClientId: '',
      autoUpdate: true,
      theme: 'acid',
      dataDir: '',
      offlineSkinDataUrl: ''
    },
    accounts: [
      {
        id: 'demo-account',
        type: 'offline',
        username: 'RetroSteve',
        uuid: 'f84c6a79-0a4e-45e0-879b-cd49ebd4c4e2',
        licenseLabel: 'Офлайн · без лицензии',
        skinUrl: '',
        capeUrl: '',
        slimArms: false,
        addedAt: '2026-09-20T12:00:00.000Z'
      }
    ],
    instances: demoInstances,
    activeAccountId: 'demo-account',
    activeInstanceId: 'demo-retro-smp',
    gameRoot: 'C:\\Users\\you\\AppData\\Roaming\\Sunspire',
    stateFile: 'C:\\Users\\you\\AppData\\Roaming\\sunspire\\launcher-state.json',
    version: 1
  };
}

function loadDemoState(): LauncherState {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LauncherState;
      if (parsed && parsed.accounts && parsed.instances) return parsed;
    }
  } catch {
    // ignore
  }
  const state = demoState();
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  return state;
}

function saveDemoState(state: LauncherState) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function mergeState(previous: LauncherState, patch: Partial<LauncherState>): LauncherState {
  const next = {
    ...previous,
    ...patch,
    settings: { ...previous.settings, ...(patch.settings || {}) }
  };
  saveDemoState(next);
  return next;
}

async function webFetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': 'SunspireLauncher/1.0.0 (web preview)' } });
  if (!res.ok) throw new ApiError(`HTTP ${res.status} от ${new URL(url).host}.`, 'HTTP_ERROR');
  return res.json() as Promise<T>;
}

function staticVersions(): VersionManifest {
  return {
    latest: { release: '26.3', snapshot: '26.4-snapshot-8' },
    versions: [
      { id: '26.3', type: 'release', releaseTime: '2026-09-15T11:23:02+00:00', url: '' },
      { id: '1.21.8', type: 'release', releaseTime: '2025-07-17T11:00:00+00:00', url: '' },
      { id: '1.21.4', type: 'release', releaseTime: '2024-12-03T10:00:00+00:00', url: '' },
      { id: '1.21.1', type: 'release', releaseTime: '2024-08-08T10:00:00+00:00', url: '' },
      { id: '1.20.6', type: 'release', releaseTime: '2024-04-29T10:00:00+00:00', url: '' },
      { id: '1.20.4', type: 'release', releaseTime: '2023-12-07T10:00:00+00:00', url: '' },
      { id: '1.20.1', type: 'release', releaseTime: '2023-06-12T10:00:00+00:00', url: '' },
      { id: '1.19.4', type: 'release', releaseTime: '2023-03-14T10:00:00+00:00', url: '' },
      { id: '1.18.2', type: 'release', releaseTime: '2022-02-28T10:00:00+00:00', url: '' },
      { id: '1.16.5', type: 'release', releaseTime: '2021-01-14T10:00:00+00:00', url: '' },
      { id: '1.12.2', type: 'release', releaseTime: '2017-09-18T10:00:00+00:00', url: '' },
      { id: '1.8.9', type: 'release', releaseTime: '2015-12-09T10:00:00+00:00', url: '' }
    ]
  };
}

const desktopOnly = () =>
  new ApiError(
    'Это действие доступно в десктопном приложении. Запустите лаунчер через Start-Sunspire.bat.',
    'DESKTOP_ONLY'
  );

/* -------------------------------------------------------------------------- */
/*                                    API                                     */
/* -------------------------------------------------------------------------- */

export const isDesktop = desktop;

export const api = {
  state: {
    get: async (): Promise<LauncherState> => {
      if (desktop && window.retro) return unwrap(window.retro.state.get());
      return loadDemoState();
    },
    update: async (patch: { settings?: Partial<LauncherSettings> }): Promise<LauncherState> => {
      if (desktop && window.retro) return unwrap(window.retro.state.update(patch));
      return mergeState(loadDemoState(), { settings: patch.settings as LauncherSettings });
    },
    openGameRoot: async (): Promise<string> => {
      if (desktop && window.retro) return unwrap(window.retro.state.openGameRoot());
      throw desktopOnly();
    },
    openInstanceFolder: async (instanceId: string): Promise<string> => {
      if (desktop && window.retro) return unwrap(window.retro.state.openInstanceFolder(instanceId));
      throw desktopOnly();
    }
  },

  app: {
    info: async (): Promise<SystemInfo> => {
      if (desktop && window.retro) return unwrap(window.retro.app.info());
      return {
        version: '1.0.0-web',
        electron: '—',
        chrome: '—',
        node: '—',
        platform: 'browser',
        arch: '—',
        totalMemMb: 32768,
        freeMemMb: 16384,
        cpus: 12,
        gameRoot: 'C:\\Users\\you\\AppData\\Roaming\\Sunspire',
        userData: 'localStorage'
      };
    },
    openExternal: async (url: string): Promise<boolean> => {
      if (desktop && window.retro) return unwrap(window.retro.app.openExternal(url));
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },
    openLogo: async (): Promise<string> => {
      if (desktop && window.retro) return unwrap(window.retro.app.openLogo());
      throw desktopOnly();
    },
    checkUpdates: async (): Promise<UpdateInfo> => {
      if (desktop && window.retro) return unwrap(window.retro.app.checkUpdates());
      return { available: false, version: '1.0.0-web', notes: '', url: '' };
    },
    installUpdate: async (url: string): Promise<boolean> => {
      if (desktop && window.retro) return unwrap(window.retro.app.installUpdate(url));
      throw desktopOnly();
    }
  },

  window: {
    minimize: () => (desktop && window.retro ? unwrap(window.retro.window.minimize()) : Promise.resolve()),
    toggleMaximize: () =>
      desktop && window.retro ? unwrap(window.retro.window.toggleMaximize()) : Promise.resolve(false),
    isMaximized: () =>
      desktop && window.retro ? unwrap(window.retro.window.isMaximized()) : Promise.resolve(false),
    close: () => (desktop && window.retro ? unwrap(window.retro.window.close()) : Promise.resolve())
  },

  auth: {
    microsoft: async (): Promise<{ ok: boolean; account: Account }> => {
      if (desktop && window.retro) return unwrap(window.retro.auth.microsoft());
      throw new ApiError('Вход Microsoft работает в десктопном приложении.', 'DESKTOP_ONLY');
    },
    offline: async (username: string): Promise<{ ok: boolean; account: Account }> => {
      if (desktop && window.retro) return unwrap(window.retro.auth.offline(username));
      const name = username.trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
        throw new ApiError('Ник должен содержать 3–16 символов: латинские буквы, цифры или «_».', 'INVALID_NAME');
      }
      const state = loadDemoState();
      const existing = state.accounts.find(
        (a) => a.type === 'offline' && a.username.toLowerCase() === name.toLowerCase()
      );
      const account: Account =
        existing ||
        ({
          id: `offline-${name.toLowerCase()}`,
          type: 'offline',
          username: name,
          uuid: '00000000-0000-3000-8000-000000000000',
          licenseLabel: 'Офлайн · без лицензии',
          skinUrl: '',
          capeUrl: '',
          slimArms: false
        } as Account);
      if (!existing) {
        state.accounts.push(account);
      }
      state.activeAccountId = account.id;
      saveDemoState(state);
      return { ok: true, account };
    },
    select: async (accountId: string): Promise<LauncherState> => {
      if (desktop && window.retro) return unwrap(window.retro.auth.select(accountId));
      return mergeState(loadDemoState(), { activeAccountId: accountId });
    },
    remove: async (accountId: string): Promise<LauncherState> => {
      if (desktop && window.retro) return unwrap(window.retro.auth.remove(accountId));
      const state = loadDemoState();
      state.accounts = state.accounts.filter((a) => a.id !== accountId);
      if (state.activeAccountId === accountId) {
        state.activeAccountId = state.accounts[0] ? state.accounts[0].id : null;
      }
      saveDemoState(state);
      return state;
    },
    refresh: async (accountId: string): Promise<Account> => {
      if (desktop && window.retro) return unwrap(window.retro.auth.refresh(accountId));
      const account = loadDemoState().accounts.find((a) => a.id === accountId);
      if (!account) throw new ApiError('Аккаунт не найден.');
      return account;
    },
    uploadSkin: async (accountId: string, variant: 'classic' | 'slim' = 'classic'): Promise<Account | null> => {
      if (desktop && window.retro) return unwrap(window.retro.auth.uploadSkin(accountId, variant));
      throw desktopOnly();
    },
    getSkin: async (accountId: string): Promise<SkinData | null> => {
      if (desktop && window.retro) return unwrap(window.retro.auth.getSkin(accountId));
      const account = loadDemoState().accounts.find((a) => a.id === accountId);
      if (!account) return null;
      return {
        skinDataUrl: account.slimArms ? '/assets/alex.png' : '/assets/steve.png',
        capeDataUrl: null,
        slimArms: account.slimArms
      };
    },
    fetchSkin: async (url: string): Promise<string> => {
      if (desktop && window.retro) return unwrap(window.retro.auth.fetchSkin(url));
      return url;
    }
  },

  java: {
    list: async (): Promise<{ java: JavaInfo[]; selected: string }> => {
      if (desktop && window.retro) return unwrap(window.retro.java.list());
      return {
        selected: '',
        java: [
          {
            path: 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.3.9-hotspot\\bin\\java.exe',
            version: '21.0.3',
            major: 21,
            vendor: 'Eclipse Adoptium'
          },
          {
            path: 'C:\\Program Files\\OpenJDK\\jdk-8.0.262.10-hotspot\\bin\\java.exe',
            version: '1.8.0_262',
            major: 8,
            vendor: 'OpenJDK'
          }
        ]
      };
    },
    choose: async (): Promise<JavaInfo | null> => {
      if (desktop && window.retro) return unwrap(window.retro.java.choose());
      throw desktopOnly();
    }
  },

  instances: {
    create: async (input: {
      name: string;
      mcVersion: string;
      loader: ModpackInstance['loader'];
      loaderVersion?: string;
      ramMb: number;
      icon: JsonIcon;
      server?: string;
    }): Promise<{ state: LauncherState; instance: ModpackInstance }> => {
      if (desktop && window.retro) return unwrap(window.retro.instances.create(input));
      const state = loadDemoState();
      const instance: ModpackInstance = {
        id: `demo-${Date.now().toString(36)}`,
        name: input.name,
        mcVersion: input.mcVersion,
        loader: input.loader,
        loaderVersion: input.loaderVersion || '',
        ramMb: input.ramMb,
        javaArgs: '',
        icon: input.icon,
        mods: [],
        server: input.server || '',
        createdAt: new Date().toISOString(),
        lastPlayedAt: null,
        totalPlayMs: 0
      };
      state.instances = [instance, ...state.instances];
      state.activeInstanceId = instance.id;
      saveDemoState(state);
      return { state, instance };
    },
    update: async (
      instanceId: string,
      patch: Partial<ModpackInstance>
    ): Promise<{ state: LauncherState; instance: ModpackInstance }> => {
      if (desktop && window.retro) return unwrap(window.retro.instances.update(instanceId, patch));
      const state = loadDemoState();
      const instance = state.instances.find((i) => i.id === instanceId);
      if (!instance) throw new ApiError('Сборка не найдена.');
      Object.assign(instance, patch);
      saveDemoState(state);
      return { state, instance };
    },
    select: async (instanceId: string): Promise<LauncherState> => {
      if (desktop && window.retro) return unwrap(window.retro.instances.select(instanceId));
      return mergeState(loadDemoState(), { activeInstanceId: instanceId });
    },
    delete: async (instanceId: string): Promise<LauncherState> => {
      if (desktop && window.retro) return unwrap(window.retro.instances.delete(instanceId));
      const state = loadDemoState();
      state.instances = state.instances.filter((i) => i.id !== instanceId);
      if (state.activeInstanceId === instanceId) {
        state.activeInstanceId = state.instances[0] ? state.instances[0].id : null;
      }
      saveDemoState(state);
      return state;
    }
  },

  mods: {
    toggle: async (instanceId: string, modId: string): Promise<LauncherState> => {
      if (desktop && window.retro) return unwrap(window.retro.mods.toggle(instanceId, modId));
      const state = loadDemoState();
      const instance = state.instances.find((i) => i.id === instanceId);
      const mod = instance?.mods.find((m) => m.id === modId);
      if (instance && mod) {
        mod.enabled = !mod.enabled;
        saveDemoState(state);
      }
      return state;
    },
    remove: async (instanceId: string, modId: string): Promise<LauncherState> => {
      if (desktop && window.retro) return unwrap(window.retro.mods.remove(instanceId, modId));
      const state = loadDemoState();
      const instance = state.instances.find((i) => i.id === instanceId);
      if (instance) {
        instance.mods = instance.mods.filter((m) => m.id !== modId);
        saveDemoState(state);
      }
      return state;
    },
    scan: async (instanceId: string): Promise<LauncherState> => {
      if (desktop && window.retro) return unwrap(window.retro.mods.scan(instanceId));
      return loadDemoState();
    },
    addLocal: async (
      instanceId: string,
      kind: 'mod' | 'resourcepack' | 'shader'
    ): Promise<{ state: LauncherState; added: InstalledMod[] } | null> => {
      if (desktop && window.retro) return unwrap(window.retro.mods.addLocal(instanceId, kind));
      throw desktopOnly();
    },
    readLog: async (instanceId: string): Promise<string> => {
      if (desktop && window.retro) return unwrap(window.retro.mods.readLog(instanceId));
      return [
        '[12:00:00] [main/INFO]: Loading Minecraft 26.3 with Fabric Loader 0.20.1',
        '[12:00:01] [main/INFO]: Loading 4 mods:',
        '[12:00:01] [main/INFO]:   - sodium@0.6.13',
        '[12:00:01] [main/INFO]:   - lithium@0.15.3',
        '[12:00:01] [main/INFO]:   - iris@1.9.4',
        '[12:00:03] [Render thread/INFO]: OpenGL Renderer: NVIDIA GeForce RTX 4070',
        '[12:00:05] [Render thread/INFO]: Backend library: LWJGL version 3.3.6',
        '[12:00:07] [Render thread/INFO]: Sound engine started',
        '[12:00:08] [Render thread/INFO]: Created: 1024x512x4 minecraft:textures/atlas/blocks.png',
        '[12:00:09] [Render thread/INFO]: Narrator library for x64 successfully loaded',
        '[12:00:11] [Render thread/INFO]: Connecting to mc.retrocity.net:25565'
      ].join('\n');
    }
  },

  mc: {
    versions: async (): Promise<VersionManifest> => {
      if (desktop && window.retro) return unwrap(window.retro.mc.versions());
      try {
        const manifest = await webFetchJson<VersionManifest>(
          'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
        );
        return manifest;
      } catch {
        return staticVersions();
      }
    },
    latestRelease: async (): Promise<string> => {
      if (desktop && window.retro) return unwrap(window.retro.mc.latestRelease());
      return '26.3';
    },
    loaders: async (mcVersion: string): Promise<LoaderVersions> => {
      if (desktop && window.retro) return unwrap(window.retro.mc.loaders(mcVersion));
      return {
        fabric: [{ version: '0.20.1', stable: true }],
        quilt: [{ version: '0.20.0-beta.9', stable: false }],
        forge: [],
        neoforge: [{ version: '26.3.0.102', stable: true }]
      };
    }
  },

  launch: {
    start: async (
      instanceId: string,
      accountId: string | null
    ): Promise<{ pid: number; prepared: { java: JavaInfo; profileId: string } }> => {
      if (desktop && window.retro) return unwrap(window.retro.launch.start(instanceId, accountId));
      throw desktopOnly();
    },
    kill: async (instanceId: string): Promise<boolean> => {
      if (desktop && window.retro) return unwrap(window.retro.launch.kill(instanceId));
      return false;
    },
    running: async (): Promise<{ instanceId: string; pid: number; startedAt: number; accountId: string }[]> => {
      if (desktop && window.retro) return unwrap(window.retro.launch.running());
      return [];
    }
  },

  modrinth: {
    search: async (options: SearchOptions): Promise<ModrinthSearchResult> => {
      if (desktop && window.retro) return unwrap(window.retro.modrinth.search(options));
      const facets: string[][] = [[`project_type:${options.projectType || 'mod'}`]];
      if (options.gameVersion) facets.push([`versions:${options.gameVersion}`]);
      if (options.loader && (options.projectType === 'mod' || options.projectType === 'modpack')) {
        facets.push([`categories:${options.loader.toLowerCase()}`]);
      }
      const params = new URLSearchParams({
        query: options.query || '',
        limit: String(options.limit || 20),
        offset: String(options.offset || 0),
        index: options.sort || 'relevance',
        facets: JSON.stringify(facets)
      });
      return webFetchJson<ModrinthSearchResult>(`https://api.modrinth.com/v2/search?${params.toString()}`);
    },
    project: async (projectId: string): Promise<ModrinthProject> => {
      if (desktop && window.retro) return unwrap(window.retro.modrinth.project(projectId));
      const project = await webFetchJson<ModrinthProject>(`https://api.modrinth.com/v2/project/${projectId}`);
      const versions = await webFetchJson<ModrinthVersion[]>(
        `https://api.modrinth.com/v2/project/${projectId}/version`
      );
      return { ...project, author: 'Modrinth', versions };
    },
    versions: async (
      projectId: string,
      filters: { gameVersion?: string; loader?: string; projectType?: ProjectType }
    ): Promise<ModrinthVersion[]> => {
      if (desktop && window.retro) return unwrap(window.retro.modrinth.versions(projectId, filters));
      const params = new URLSearchParams();
      if (filters.gameVersion) params.set('game_versions', JSON.stringify([filters.gameVersion]));
      if (filters.loader && (filters.projectType === 'mod' || filters.projectType === 'modpack')) {
        params.set('loaders', JSON.stringify([filters.loader.toLowerCase()]));
      }
      return webFetchJson<ModrinthVersion[]>(
        `https://api.modrinth.com/v2/project/${projectId}/version${params.size ? `?${params.toString()}` : ''}`
      );
    },
    install: async (options: {
      instanceId: string;
      projectId: string;
      versionId?: string;
    }): Promise<InstallResult> => {
      if (desktop && window.retro) {
        return unwrap(window.retro.modrinth.install(options));
      }
      throw desktopOnly();
    },
    installModpack: async (options: {
      projectId?: string;
      versionId?: string;
      name?: string;
    }): Promise<ModpackInstallResult> => {
      if (desktop && window.retro) {
        return unwrap(window.retro.modrinth.installModpack(options));
      }
      throw desktopOnly();
    },
    importMrpack: async (): Promise<ModpackInstallResult | null> => {
      if (desktop && window.retro) return unwrap(window.retro.modrinth.importMrpack());
      throw desktopOnly();
    }
  },

  events: {
    onStateChanged: (callback: (state: LauncherState) => void): (() => void) => {
      if (desktop && window.retro) return window.retro.events.onStateChanged(callback);
      return () => {};
    },
    onTaskProgress: (callback: (progress: TaskProgress) => void): (() => void) => {
      if (desktop && window.retro) return window.retro.events.onTaskProgress(callback);
      return () => {};
    },
    onLaunchProgress: (callback: (progress: import('../types').LaunchProgress) => void): (() => void) => {
      if (desktop && window.retro) return window.retro.events.onLaunchProgress(callback);
      return () => {};
    },
    onLaunchLog: (
      callback: (entry: import('../types').LogEntry & { instanceId: string }) => void
    ): (() => void) => {
      if (desktop && window.retro) return window.retro.events.onLaunchLog(callback);
      return () => {};
    },
    onLaunchState: (
      callback: (state: import('../types').LaunchEventState) => void
    ): (() => void) => {
      if (desktop && window.retro) return window.retro.events.onLaunchState(callback);
      return () => {};
    }
  }
};

export type Api = typeof api;
