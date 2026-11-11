export type ModLoader = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge';
export type InstanceModCategory = 'mod' | 'resourcepack' | 'shader' | 'datapack';
export type ProjectType = 'mod' | 'modpack' | 'resourcepack' | 'shader' | 'datapack';
export type AccountType = 'microsoft' | 'offline';
export type PageId = 'home' | 'catalog' | 'instances' | 'accounts' | 'settings';
export type JsonIcon = 'grass' | 'diamond' | 'gold' | 'redstone' | 'ender' | 'amethyst' | 'stone';

export interface InstalledMod {
  id: string;
  projectId: string | null;
  versionId: string | null;
  slug: string;
  title: string;
  author: string;
  version: string;
  fileName: string;
  size: string;
  enabled: boolean;
  category: InstanceModCategory;
  iconUrl: string;
  description: string;
}

export interface ModpackInfo {
  projectId: string;
  title: string;
  iconUrl: string;
  versionId: string;
  versionNumber: string;
}

export interface ModpackInstance {
  id: string;
  name: string;
  mcVersion: string;
  loader: ModLoader;
  loaderVersion: string;
  ramMb: number;
  javaArgs: string;
  javaPath?: string;
  icon: JsonIcon;
  iconUrl?: string;
  modpack?: ModpackInfo | null;
  mods: InstalledMod[];
  server?: string;
  createdAt: string;
  lastPlayedAt?: string | null;
  totalPlayMs: number;
}

export interface Account {
  id: string;
  type: AccountType;
  username: string;
  uuid: string;
  licenseLabel: string;
  skinUrl: string;
  capeUrl: string;
  slimArms: boolean;
  skinDataUrl?: string;
  addedAt?: string | null;
  lastLoginAt?: string | null;
}

export type ThemeId = 'acid' | 'amber' | 'cyan' | 'magenta' | 'mono';

export interface LauncherSettings {
  javaPath: string;
  defaultRamMb: number;
  autoDownloadJava: boolean;
  crtEffect: boolean;
  showConsoleOnLaunch: boolean;
  closeLauncherOnGameStart: boolean;
  closeToTray: boolean;
  discordRpc: boolean;
  discordClientId: string;
  autoUpdate: boolean;
  theme: ThemeId;
  dataDir: string;
  offlineSkinDataUrl: string;
}

export interface LauncherState {
  settings: LauncherSettings;
  accounts: Account[];
  instances: ModpackInstance[];
  activeAccountId: string | null;
  activeInstanceId: string | null;
  gameRoot: string;
  stateFile: string;
  version: number;
}

export interface JavaInfo {
  path: string;
  version: string;
  major: number;
  vendor?: string;
  source?: string;
}

export interface SystemInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
  totalMemMb: number;
  freeMemMb: number;
  cpus: number;
  gameRoot: string;
  userData: string;
}

export interface MinecraftVersion {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  releaseTime: string;
  url: string;
}

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: MinecraftVersion[];
}

export interface LoaderVersion {
  version: string;
  stable: boolean;
}

export interface LoaderVersions {
  fabric: LoaderVersion[];
  quilt: LoaderVersion[];
  forge: LoaderVersion[];
  neoforge: LoaderVersion[];
}

export interface ModrinthHit {
  project_id: string;
  project_type: ProjectType;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  display_categories?: string[];
  versions: string[];
  downloads: number;
  follows: number;
  icon_url: string | null;
  date_created?: string;
  date_modified: string;
  latest_version?: string;
  license?: string;
  client_side?: string;
  server_side?: string;
  gallery?: string[];
}

export interface ModrinthSearchResult {
  hits: ModrinthHit[];
  total: number;
  offset: number;
  limit: number;
}

export interface ModrinthGalleryImage {
  url: string;
  featured: boolean;
  title?: string;
  description?: string;
  created?: string;
  ordering?: number;
}

export interface ModrinthVersionFile {
  hashes: { sha1?: string; sha512?: string };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  file_type?: string | null;
}

export interface ModrinthDependency {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: string;
  game_versions: string[];
  loaders: string[];
  featured: boolean;
  status: string;
  date_published: string;
  downloads: number;
  changelog?: string;
  dependencies: ModrinthDependency[];
  files: ModrinthVersionFile[];
}

export interface ModrinthProject {
  id: string;
  slug: string;
  project_type: ProjectType;
  team: string;
  title: string;
  description: string;
  body: string;
  published: string;
  updated: string;
  categories: string[];
  additional_categories?: string[];
  game_versions: string[];
  loaders: string[];
  downloads: number;
  followers: number;
  icon_url: string | null;
  gallery: ModrinthGalleryImage[];
  author: string;
  versions: ModrinthVersion[];
  license?: { id: string; name: string; url?: string };
  source_url?: string;
  issues_url?: string;
  wiki_url?: string;
  discord_url?: string;
  donation_urls?: { id: string; platform: string; url: string }[];
}

export interface SearchOptions {
  query?: string;
  projectType?: ProjectType;
  gameVersion?: string;
  loader?: string;
  category?: string;
  sort?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';
  offset?: number;
  limit?: number;
}

export interface InstallResult {
  state: LauncherState;
  instance: ModpackInstance;
  installed: InstalledMod[];
  warnings: string[];
  project: { id: string; title: string; icon_url: string | null; description: string };
}

export interface ModpackInstallResult {
  state: LauncherState;
  instance: ModpackInstance;
}

export interface TaskProgress {
  kind: 'mod' | 'modpack' | 'import';
  instanceId: string | null;
  stage?: string;
  message?: string;
  progress?: number;
  at: number;
}

export interface LaunchProgress {
  instanceId: string;
  stage?: string;
  message?: string;
  progress?: number;
  counts?: { current: number; total: number };
}

export type LaunchPhase =
  | 'preparing'
  | 'running'
  | 'exited'
  | 'error';

export interface LaunchEventState {
  state: LaunchPhase;
  instanceId: string;
  pid?: number;
  code?: number;
  error?: string;
  elapsedMs?: number;
}

export interface LogEntry {
  line: string;
  at: number;
  level?: 'info' | 'warn' | 'error';
}

export interface SkinData {
  skinDataUrl: string | null;
  capeDataUrl: string | null;
  slimArms: boolean;
}

export interface UpdateInfo {
  available: boolean;
  version: string;
  notes: string;
  url: string;
}

export interface ApiErrorShape {
  message: string;
  code: string;
}

export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorShape;
}

export interface RetroEvents {
  onStateChanged(callback: (state: LauncherState) => void): () => void;
  onTaskProgress(callback: (progress: TaskProgress) => void): () => void;
  onLaunchProgress(callback: (progress: LaunchProgress) => void): () => void;
  onLaunchLog(callback: (entry: LogEntry & { instanceId: string }) => void): () => void;
  onLaunchState(callback: (state: LaunchEventState) => void): () => void;
}

export interface RetroApi {
  isDesktop: true;
  platform: string;
  state: {
    get(): Promise<Envelope<LauncherState>>;
    update(patch: { settings?: Partial<LauncherSettings> }): Promise<Envelope<LauncherState>>;
    openGameRoot(): Promise<Envelope<string>>;
    openInstanceFolder(instanceId: string): Promise<Envelope<string>>;
  };
  app: {
    info(): Promise<Envelope<SystemInfo>>;
    openExternal(url: string): Promise<Envelope<boolean>>;
    openLogo(): Promise<Envelope<string>>;
    checkUpdates(): Promise<Envelope<UpdateInfo>>;
    installUpdate(url: string): Promise<Envelope<boolean>>;
  };
  window: {
    minimize(): Promise<Envelope<void>>;
    toggleMaximize(): Promise<Envelope<boolean>>;
    isMaximized(): Promise<Envelope<boolean>>;
    close(): Promise<Envelope<void>>;
  };
  auth: {
    microsoft(): Promise<Envelope<{ ok: boolean; account: Account }>>;
    offline(username: string): Promise<Envelope<{ ok: boolean; account: Account }>>;
    select(accountId: string): Promise<Envelope<LauncherState>>;
    remove(accountId: string): Promise<Envelope<LauncherState>>;
    refresh(accountId: string): Promise<Envelope<Account>>;
    uploadSkin(accountId: string, variant: 'classic' | 'slim'): Promise<Envelope<Account | null>>;
    getSkin(accountId: string): Promise<Envelope<SkinData | null>>;
    fetchSkin(url: string): Promise<Envelope<string>>;
  };
  java: {
    list(): Promise<Envelope<{ java: JavaInfo[]; selected: string }>>;
    choose(): Promise<Envelope<JavaInfo | null>>;
  };
  instances: {
    create(input: {
      name: string;
      mcVersion: string;
      loader: ModLoader;
      loaderVersion?: string;
      ramMb: number;
      icon: JsonIcon;
      server?: string;
    }): Promise<Envelope<{ state: LauncherState; instance: ModpackInstance }>>;
    update(
      instanceId: string,
      patch: Partial<Pick<ModpackInstance, 'name' | 'ramMb' | 'javaArgs' | 'javaPath' | 'server' | 'icon'>>
    ): Promise<Envelope<{ state: LauncherState; instance: ModpackInstance }>>;
    select(instanceId: string): Promise<Envelope<LauncherState>>;
    delete(instanceId: string): Promise<Envelope<LauncherState>>;
  };
  mods: {
    toggle(instanceId: string, modId: string): Promise<Envelope<LauncherState>>;
    remove(instanceId: string, modId: string): Promise<Envelope<LauncherState>>;
    scan(instanceId: string): Promise<Envelope<LauncherState>>;
    addLocal(instanceId: string, kind: 'mod' | 'resourcepack' | 'shader'): Promise<Envelope<{ state: LauncherState; added: InstalledMod[] } | null>>;
    readLog(instanceId: string): Promise<Envelope<string>>;
  };
  mc: {
    versions(): Promise<Envelope<VersionManifest>>;
    latestRelease(): Promise<Envelope<string>>;
    loaders(mcVersion: string): Promise<Envelope<LoaderVersions>>;
  };
  launch: {
    start(instanceId: string, accountId: string | null): Promise<Envelope<{ pid: number; prepared: { java: JavaInfo; profileId: string } }>>;
    kill(instanceId: string): Promise<Envelope<boolean>>;
    running(): Promise<Envelope<{ instanceId: string; pid: number; startedAt: number; accountId: string }[]>>;
  };
  modrinth: {
    search(options: SearchOptions): Promise<Envelope<ModrinthSearchResult>>;
    project(projectId: string): Promise<Envelope<ModrinthProject>>;
    versions(projectId: string, filters: { gameVersion?: string; loader?: string; projectType?: ProjectType }): Promise<Envelope<ModrinthVersion[]>>;
    install(options: { instanceId: string; projectId: string; versionId?: string }): Promise<Envelope<InstallResult>>;
    installModpack(options: { projectId?: string; versionId?: string; name?: string }): Promise<Envelope<ModpackInstallResult>>;
    importMrpack(): Promise<Envelope<ModpackInstallResult | null>>;
  };
  events: RetroEvents;
}

declare global {
  interface Window {
    retro?: RetroApi;
  }
}
