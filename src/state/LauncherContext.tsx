import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Account,
  InstalledMod,
  JavaInfo,
  JsonIcon,
  LaunchPhase,
  LauncherState,
  LogEntry,
  ModLoader,
  ModpackInstance,
  SystemInfo,
  TaskProgress
} from '../types';
import { ApiError, api } from '../lib/api';
import { instanceDisplayName } from '../lib/format';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

export interface LaunchRuntime {
  instanceId: string | null;
  phase: LaunchPhase | 'idle';
  message: string;
  progress: number;
  running: boolean;
  error: string | null;
  startedAt: number | null;
  logs: LogEntry[];
  consoleOpen: boolean;
}

export interface TaskRuntime {
  kind: TaskProgress['kind'] | null;
  instanceId: string | null;
  message: string;
  progress: number;
  status: 'idle' | 'active' | 'done' | 'error';
}

interface CreateInstanceInput {
  name: string;
  mcVersion: string;
  loader: ModLoader;
  loaderVersion?: string;
  ramMb: number;
  icon: JsonIcon;
  server?: string;
}

interface LauncherContextValue {
  state: LauncherState | null;
  loading: boolean;
  loadError: string | null;
  activeAccount: Account | null;
  activeInstance: ModpackInstance | null;
  launch: LaunchRuntime;
  task: TaskRuntime;
  toasts: Toast[];
  skinRevision: number;
  javaList: JavaInfo[];
  systemInfo: SystemInfo | null;
  showToast: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;
  refresh: () => Promise<void>;
  refreshJava: () => Promise<void>;
  chooseJava: () => Promise<JavaInfo | null>;
  updateSettings: (patch: Partial<LauncherState['settings']>) => Promise<boolean>;
  createInstance: (input: CreateInstanceInput) => Promise<ModpackInstance>;
  updateInstance: (instanceId: string, patch: Partial<ModpackInstance>) => Promise<void>;
  deleteInstance: (instanceId: string) => Promise<void>;
  selectInstance: (instanceId: string) => Promise<void>;
  toggleMod: (instanceId: string, modId: string) => Promise<void>;
  removeMod: (instanceId: string, modId: string) => Promise<void>;
  scanMods: (instanceId: string) => Promise<void>;
  addLocalMods: (instanceId: string, kind: 'mod' | 'resourcepack' | 'shader') => Promise<void>;
  installProject: (projectId: string, versionId?: string, instanceId?: string) => Promise<boolean>;
  installModpack: (projectId: string, versionId?: string) => Promise<boolean>;
  importMrpack: () => Promise<boolean>;
  loginMicrosoft: () => Promise<Account | null>;
  addOfflineAccount: (username: string) => Promise<Account | null>;
  selectAccount: (accountId: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  uploadSkin: (accountId: string, variant: 'classic' | 'slim') => Promise<void>;
  launchGame: (instanceId?: string) => Promise<void>;
  killGame: () => Promise<void>;
  openConsole: () => void;
  closeConsole: () => void;
  clearLogs: () => void;
}

const LauncherContext = createContext<LauncherContextValue | null>(null);

const initialLaunch: LaunchRuntime = {
  instanceId: null,
  phase: 'idle',
  message: '',
  progress: 0,
  running: false,
  error: null,
  startedAt: null,
  logs: [],
  consoleOpen: false
};

const initialTask: TaskRuntime = {
  kind: null,
  instanceId: null,
  message: '',
  progress: 0,
  status: 'idle'
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export const LauncherProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<LauncherState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [launch, setLaunch] = useState<LaunchRuntime>(initialLaunch);
  const [task, setTask] = useState<TaskRuntime>(initialTask);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [skinRevision, setSkinRevision] = useState(0);
  const [javaList, setJavaList] = useState<JavaInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const toastId = useRef(1);
  const taskHideTimer = useRef<number | null>(null);
  const launchRef = useRef(launch);
  launchRef.current = launch;

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = toastId.current++;
      setToasts((current) => [...current.slice(-3), { id, message, kind }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, kind === 'error' ? 6500 : 4200);
    },
    []
  );

  const refresh = useCallback(async () => {
    try {
      const next = await api.state.get();
      setState(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  const refreshJava = useCallback(async () => {
    try {
      const result = await api.java.list();
      setJavaList(result.java);
    } catch {
      setJavaList([]);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [next, info] = await Promise.all([api.state.get(), api.app.info().catch(() => null)]);
        if (!mounted) return;
        setState(next);
        setSystemInfo(info);
      } catch (error) {
        if (mounted) setLoadError(errorMessage(error));
      } finally {
        if (mounted) setLoading(false);
      }
      refreshJava();
      api.launch
        .running()
        .then((running) => {
          if (!mounted || !running.length) return;
          const active = running[0];
          setLaunch((current) => ({
            ...current,
            instanceId: active.instanceId,
            running: true,
            phase: 'running',
            message: 'Игра уже запущена',
            progress: 100,
            startedAt: active.startedAt
          }));
        })
        .catch(() => {});
    })();
    return () => {
      mounted = false;
    };
  }, [refreshJava]);

  // Live events from the main process
  useEffect(() => {
    const unsubscribers = [
      api.events.onStateChanged((next) => setState(next)),
      api.events.onTaskProgress((progress) => {
        if (taskHideTimer.current) window.clearTimeout(taskHideTimer.current);
        setTask({
          kind: progress.kind,
          instanceId: progress.instanceId,
          message: progress.message || 'Установка…',
          progress: progress.progress ?? 0,
          status: progress.progress != null && progress.progress >= 100 ? 'done' : 'active'
        });
        if (progress.progress != null && progress.progress >= 100) {
          taskHideTimer.current = window.setTimeout(() => {
            setTask((current) => (current.status === 'done' ? initialTask : current));
          }, 4000);
        }
      }),
      api.events.onLaunchProgress((progress) => {
        setLaunch((current) => {
          if (current.instanceId && progress.instanceId && current.instanceId !== progress.instanceId) {
            return current;
          }
          return {
            ...current,
            instanceId: progress.instanceId || current.instanceId,
            phase: current.running ? 'running' : 'preparing',
            message: progress.message || current.message,
            progress: progress.progress ?? current.progress
          };
        });
      }),
      api.events.onLaunchLog((entry) => {
        setLaunch((current) => {
          if (current.instanceId && current.instanceId !== entry.instanceId) return current;
          const logs = [...current.logs, entry];
          return {
            ...current,
            instanceId: entry.instanceId,
            logs: logs.length > 1400 ? logs.slice(-1400) : logs
          };
        });
      }),
      api.events.onLaunchState((event) => {
        setLaunch((current) => {
          if (current.instanceId && current.instanceId !== event.instanceId) return current;
          if (event.state === 'preparing') {
            return {
              ...current,
              instanceId: event.instanceId,
              phase: 'preparing',
              running: false,
              error: null,
              message: current.message || 'Подготовка…',
              startedAt: current.startedAt || Date.now()
            };
          }
          if (event.state === 'running') {
            return {
              ...current,
              instanceId: event.instanceId,
              phase: 'running',
              running: true,
              progress: 100,
              message: 'Игра запущена',
              error: null,
              startedAt: current.startedAt || Date.now()
            };
          }
          if (event.state === 'exited') {
            return {
              ...current,
              phase: 'exited',
              running: false,
              message:
                event.code === 0
                  ? 'Игра завершена'
                  : `Игра завершилась с кодом ${event.code ?? '?'}`,
              error: null
            };
          }
          if (event.state === 'error') {
            return {
              ...current,
              phase: 'error',
              running: false,
              error: event.error || 'Ошибка запуска',
              message: event.error || 'Ошибка запуска'
            };
          }
          return current;
        });
        if (event.state === 'exited') {
          refresh();
          const runtime = launchRef.current;
          if (!runtime.consoleOpen) {
            showToast(event.code === 0 ? 'Игра завершена.' : `Игра завершилась (код ${event.code}).`, event.code === 0 ? 'info' : 'error');
          }
        }
        if (event.state === 'error' && event.error) {
          showToast(event.error, 'error');
        }
      })
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [refresh, showToast]);

  const activeAccount = useMemo(() => {
    if (!state) return null;
    return state.accounts.find((account) => account.id === state.activeAccountId) || state.accounts[0] || null;
  }, [state]);

  const activeInstance = useMemo(() => {
    if (!state) return null;
    return state.instances.find((instance) => instance.id === state.activeInstanceId) || state.instances[0] || null;
  }, [state]);

  const updateSettings = useCallback(
    async (patch: Partial<LauncherState['settings']>) => {
      try {
        const next = await api.state.update({ settings: patch });
        setState(next);
        return true;
      } catch (error) {
        showToast(errorMessage(error), 'error');
        return false;
      }
    },
    [showToast]
  );

  const chooseJava = useCallback(async () => {
    try {
      const info = await api.java.choose();
      if (!info) return null;
      await api.state.update({ settings: { javaPath: info.path } });
      await refresh();
      await refreshJava();
      showToast(`Java ${info.version} выбрана.`, 'success');
      return info;
    } catch (error) {
      showToast(errorMessage(error), 'error');
      return null;
    }
  }, [refresh, refreshJava, showToast]);

  const createInstance = useCallback(
    async (input: CreateInstanceInput) => {
      const result = await api.instances.create(input);
      setState(result.state);
      showToast(`Сборка «${instanceDisplayName(result.instance)}» создана.`, 'success');
      return result.instance;
    },
    [showToast]
  );

  const updateInstance = useCallback(
    async (instanceId: string, patch: Partial<ModpackInstance>) => {
      try {
        const result = await api.instances.update(instanceId, patch);
        setState(result.state);
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [showToast]
  );

  const deleteInstance = useCallback(
    async (instanceId: string) => {
      try {
        const next = await api.instances.delete(instanceId);
        setState(next);
        showToast('Сборка удалена.', 'success');
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [showToast]
  );

  const selectInstance = useCallback(
    async (instanceId: string) => {
      try {
        const next = await api.instances.select(instanceId);
        setState(next);
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [showToast]
  );

  const toggleMod = useCallback(
    async (instanceId: string, modId: string) => {
      try {
        const next = await api.mods.toggle(instanceId, modId);
        setState(next);
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [showToast]
  );

  const removeMod = useCallback(
    async (instanceId: string, modId: string) => {
      try {
        const next = await api.mods.remove(instanceId, modId);
        setState(next);
        showToast('Мод удалён.', 'success');
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [showToast]
  );

  const scanMods = useCallback(
    async (instanceId: string) => {
      try {
        const next = await api.mods.scan(instanceId);
        setState(next);
        showToast('Список файлов обновлён.', 'success');
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [showToast]
  );

  const addLocalMods = useCallback(
    async (instanceId: string, kind: 'mod' | 'resourcepack' | 'shader') => {
      try {
        const result = await api.mods.addLocal(instanceId, kind);
        if (!result) return;
        setState(result.state);
        showToast(`Добавлено файлов: ${result.added.length}.`, 'success');
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [showToast]
  );

  const installProject = useCallback(
    async (projectId: string, versionId?: string, instanceId?: string) => {
      const targetId = instanceId || activeInstance?.id;
      if (!targetId) {
        showToast('Сначала создайте сборку.', 'error');
        return false;
      }
      setTask({
        kind: 'mod',
        instanceId: targetId,
        message: 'Подготовка установки…',
        progress: 0,
        status: 'active'
      });
      try {
        const result = await api.modrinth.install({ instanceId: targetId, projectId, versionId });
        setState(result.state);
        const extra = result.installed.length > 1 ? ` +${result.installed.length - 1} зависимостей` : '';
        showToast(`Установлено: ${result.installed[0]?.title || 'мод'}${extra}.`, 'success');
        if (result.warnings.length) {
          showToast(`Предупреждения: ${result.warnings.join('; ')}`, 'info');
        }
        setTask((current) => ({ ...current, message: 'Установлено', progress: 100, status: 'done' }));
        if (taskHideTimer.current) window.clearTimeout(taskHideTimer.current);
        taskHideTimer.current = window.setTimeout(() => setTask(initialTask), 3500);
        return true;
      } catch (error) {
        const message = errorMessage(error);
        setTask((current) => ({ ...current, message, status: 'error', progress: 100 }));
        showToast(message, 'error');
        return false;
      }
    },
    [activeInstance, showToast]
  );

  const installModpack = useCallback(
    async (projectId: string, versionId?: string) => {
      setTask({
        kind: 'modpack',
        instanceId: null,
        message: 'Подготовка модпака…',
        progress: 0,
        status: 'active'
      });
      try {
        const result = await api.modrinth.installModpack({ projectId, versionId });
        setState(result.state);
        showToast(`Модпак «${instanceDisplayName(result.instance)}» установлен и выбран.`, 'success');
        setTask((current) => ({ ...current, message: 'Модпак установлен', progress: 100, status: 'done' }));
        if (taskHideTimer.current) window.clearTimeout(taskHideTimer.current);
        taskHideTimer.current = window.setTimeout(() => setTask(initialTask), 4000);
        return true;
      } catch (error) {
        const message = errorMessage(error);
        setTask((current) => ({ ...current, message, status: 'error', progress: 100 }));
        showToast(message, 'error');
        return false;
      }
    },
    [showToast]
  );

  const importMrpack = useCallback(async () => {
    setTask({
      kind: 'import',
      instanceId: null,
      message: 'Импорт модпака…',
      progress: 5,
      status: 'active'
    });
    try {
      const result = await api.modrinth.importMrpack();
      if (!result) {
        setTask(initialTask);
        return false;
      }
      setState(result.state);
      showToast(`Модпак «${instanceDisplayName(result.instance)}» импортирован.`, 'success');
      setTask(initialTask);
      return true;
    } catch (error) {
      const message = errorMessage(error);
      setTask((current) => ({ ...current, message, status: 'error', progress: 100 }));
      showToast(message, 'error');
      return false;
    }
  }, [showToast]);

  const loginMicrosoft = useCallback(async () => {
    try {
      showToast('Откройте окно Microsoft и войдите в аккаунт…', 'info');
      const result = await api.auth.microsoft();
      await refresh();
      setSkinRevision((value) => value + 1);
      showToast(`Лицензия подключена: ${result.account.username}`, 'success');
      return result.account;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : '';
      if (code !== 'CANCELLED') {
        showToast(errorMessage(error), 'error');
      }
      return null;
    }
  }, [refresh, showToast]);

  const addOfflineAccount = useCallback(
    async (username: string) => {
      try {
        const result = await api.auth.offline(username);
        await refresh();
        setSkinRevision((value) => value + 1);
        showToast(`Офлайн-аккаунт «${result.account.username}» добавлен.`, 'success');
        return result.account;
      } catch (error) {
        showToast(errorMessage(error), 'error');
        return null;
      }
    },
    [refresh, showToast]
  );

  const selectAccount = useCallback(
    async (accountId: string) => {
      try {
        const next = await api.auth.select(accountId);
        setState(next);
        setSkinRevision((value) => value + 1);
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [showToast]
  );

  const removeAccount = useCallback(
    async (accountId: string) => {
      try {
        const next = await api.auth.remove(accountId);
        setState(next);
        setSkinRevision((value) => value + 1);
        showToast('Аккаунт удалён.', 'success');
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [showToast]
  );

  const uploadSkin = useCallback(
    async (accountId: string, variant: 'classic' | 'slim') => {
      try {
        const result = await api.auth.uploadSkin(accountId, variant);
        if (!result) return;
        await refresh();
        setSkinRevision((value) => value + 1);
        showToast('Скин обновлён.', 'success');
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    },
    [refresh, showToast]
  );

  const launchGame = useCallback(
    async (instanceId?: string) => {
      const target = instanceId || activeInstance?.id;
      if (!target) {
        showToast('Сначала создайте сборку.', 'error');
        return;
      }
      if (launch.running && launch.instanceId !== target) {
        showToast('Сначала закройте запущенную игру.', 'error');
        return;
      }
      if (!activeAccount) {
        showToast('Сначала добавьте аккаунт Minecraft.', 'error');
        return;
      }
      setLaunch({
        ...initialLaunch,
        instanceId: target,
        phase: 'preparing',
        message: 'Подготовка запуска…',
        progress: 1,
        startedAt: Date.now(),
        consoleOpen: state ? state.settings.showConsoleOnLaunch : true
      });
      try {
        await api.launch.start(target, activeAccount.id);
      } catch (error) {
        const message = errorMessage(error);
        setLaunch((current) => ({
          ...current,
          phase: 'error',
          running: false,
          error: message,
          message
        }));
        showToast(message, 'error');
      }
    },
    [activeAccount, activeInstance, launch.instanceId, launch.running, showToast, state]
  );

  const killGame = useCallback(async () => {
    if (!launch.instanceId) return;
    try {
      await api.launch.kill(launch.instanceId);
      showToast('Процесс остановлен.', 'info');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  }, [launch.instanceId, showToast]);

  const openConsole = useCallback(() => {
    setLaunch((current) => ({ ...current, consoleOpen: true }));
  }, []);
  const closeConsole = useCallback(() => {
    setLaunch((current) => ({ ...current, consoleOpen: false }));
  }, []);
  const clearLogs = useCallback(() => {
    setLaunch((current) => ({ ...current, logs: [] }));
  }, []);

  const value: LauncherContextValue = {
    state,
    loading,
    loadError,
    activeAccount,
    activeInstance,
    launch,
    task,
    toasts,
    skinRevision,
    javaList,
    systemInfo,
    showToast,
    dismissToast,
    refresh,
    refreshJava,
    chooseJava,
    updateSettings,
    createInstance,
    updateInstance,
    deleteInstance,
    selectInstance,
    toggleMod,
    removeMod,
    scanMods,
    addLocalMods,
    installProject,
    installModpack,
    importMrpack,
    loginMicrosoft,
    addOfflineAccount,
    selectAccount,
    removeAccount,
    uploadSkin,
    launchGame,
    killGame,
    openConsole,
    closeConsole,
    clearLogs
  };

  return <LauncherContext.Provider value={value}>{children}</LauncherContext.Provider>;
};

export function useLauncher(): LauncherContextValue {
  const value = useContext(LauncherContext);
  if (!value) throw new Error('useLauncher must be used inside LauncherProvider');
  return value;
}
