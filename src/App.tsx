import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Square,
  Terminal,
  Trash2
} from 'lucide-react';
import { ModpackInstance, PageId, ProjectType, UpdateInfo } from './types';
import { LauncherProvider, useLauncher } from './state/LauncherContext';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { ToastTray } from './components/ToastTray';
import { ConsoleDrawer } from './components/ConsoleDrawer';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { InstancesPage } from './pages/InstancesPage';
import { AccountsPage } from './pages/AccountsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProjectModal } from './pages/ProjectModal';
import { Onboarding } from './pages/Onboarding';
import { PixelLogoTiles } from './components/ui/BlockIcon';
import { ConfirmDialog, ProgressBar } from './components/ui/Common';
import { ContextMenu, ContextMenuItem, ContextMenuState } from './components/ui/ContextMenu';
import { api } from './lib/api';
import { cx, instanceDisplayName, loaderLabel } from './lib/format';

const ONBOARDING_KEY = 'sunspire-onboarded-v1';

const BootScreen: React.FC = () => (
  <div className="boot-screen">
    <div className="boot-scan" aria-hidden="true" />
    <div className="boot-card">
      <div className="boot-logo">
        <PixelLogoTiles size={58} />
      </div>
      <h1>SUNSPIRE</h1>
      <span className="boot-sub">MINECRAFT LAUNCHER / SS-OS 1.0.0</span>
      <div className="boot-progress">
        <ProgressBar value={38} indeterminate />
      </div>
      <div className="boot-lines">
        <span>[ OK ] CRT SUBSYSTEM</span>
        <span>[ OK ] LOCAL STORE</span>
        <span>[ OK ] MODRINTH UPLINK</span>
        <span className="boot-line-active">[ .. ] LOADING LAUNCHER STATE</span>
      </div>
      <span className="boot-hint">НЕ ВЫКЛЮЧАЙТЕ ПИТАНИЕ</span>
    </div>
  </div>
);

const ErrorScreen: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="boot-screen">
    <div className="boot-card boot-card-error">
      <div className="boot-error-icon">
        <AlertTriangle size={42} />
      </div>
      <h1>ОШИБКА ЗАГРУЗКИ</h1>
      <span className="boot-sub">НЕ УДАЛОСЬ ИНИЦИАЛИЗИРОВАТЬ СОСТОЯНИЕ ЛАУНЧЕРА</span>
      <p className="boot-error-message">{message}</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        <RefreshCw size={14} /> ПОВТОРИТЬ
      </button>
    </div>
  </div>
);

const AppShell: React.FC = () => {
  const {
    state,
    loading,
    loadError,
    launch,
    refresh,
    openConsole,
    closeConsole,
    launchGame,
    showToast,
    selectInstance,
    deleteInstance,
    killGame
  } = useLauncher();
  const [page, setPage] = useState<PageId>('home');
  const [catalogType, setCatalogType] = useState<ProjectType>('mod');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [createSignal, setCreateSignal] = useState(0);
  const [onboarding, setOnboarding] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModpackInstance | null>(null);

  useEffect(() => {
    if (loading || !state) return;
    let done = false;
    try {
      done = window.localStorage.getItem(ONBOARDING_KEY) === '1';
    } catch {
      done = false;
    }
    if (!done && (state.accounts.length === 0 || state.instances.length === 0)) {
      setOnboarding(true);
    }
  }, [loading, state]);

  useEffect(() => {
    if (!state?.settings?.theme) return;
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state?.settings?.theme]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen('tray:launch', () => {
        void launchGame();
      }).then((off) => {
        if (disposed) off();
        else unlisten = off;
      })
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [launchGame]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<UpdateInfo>('update:available', (event) => {
        showToast(`Доступно обновление Sunspire ${event.payload.version}. Откройте «Настройки» → «Обновления».`, 'info');
      }).then((off) => {
        if (disposed) off();
        else unlisten = off;
      })
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [showToast]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.context-menu, .context-menu-backdrop')) {
        event.preventDefault();
        return;
      }
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();

      const instanceEl = target?.closest<HTMLElement>('[data-instance-id]');
      const instance = instanceEl?.dataset.instanceId
        ? state?.instances.find((item) => item.id === instanceEl.dataset.instanceId)
        : undefined;

      if (instance) {
        const running = launch.running && launch.instanceId === instance.id;
        const items: ContextMenuItem[] = [
          {
            id: 'launch',
            label: running ? 'Игра уже запущена' : 'Запустить игру',
            icon: <Play size={14} fill="currentColor" />,
            disabled: running,
            onSelect: () => {
              void selectInstance(instance.id).then(() => launchGame(instance.id));
            }
          },
          ...(running
            ? [
                {
                  id: 'stop',
                  label: 'Остановить игру',
                  icon: <Square size={13} />,
                  danger: true,
                  onSelect: () => {
                    void killGame();
                  }
                } satisfies ContextMenuItem
              ]
            : []),
          {
            id: 'settings',
            label: 'Настройки сборки',
            icon: <Settings size={14} />,
            hint: 'F3',
            onSelect: () => {
              void selectInstance(instance.id).then(() => {
                window.dispatchEvent(new Event('sunspire:instance-overview'));
                setPage('instances');
              });
            }
          },
          {
            id: 'rename',
            label: 'Переименовать',
            icon: <Pencil size={14} />,
            onSelect: () => {
              void selectInstance(instance.id).then(() => {
                window.dispatchEvent(new Event('sunspire:instance-overview'));
                setPage('instances');
                window.setTimeout(() => {
                  const input = document.getElementById('instance-name-input') as HTMLInputElement | null;
                  input?.focus();
                  input?.select();
                }, 260);
              });
            }
          },
          {
            id: 'folder',
            label: 'Открыть папку сборки',
            icon: <FolderOpen size={14} />,
            onSelect: () => {
              void api.state.openInstanceFolder(instance.id).catch(() => {});
            }
          },
          { id: 'sep', separator: true },
          {
            id: 'delete',
            label: 'Удалить сборку',
            icon: <Trash2 size={14} />,
            danger: true,
            onSelect: () => setDeleteTarget(instance)
          }
        ];
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          title: instanceDisplayName(instance),
          subtitle: `${instance.mcVersion} · ${loaderLabel(instance.loader)}`,
          items
        });
        return;
      }

      const active = state?.instances.find((item) => item.id === state.activeInstanceId);
      const items: ContextMenuItem[] = [
        {
          id: 'create',
          label: 'Создать сборку',
          icon: <Plus size={14} />,
          onSelect: () => {
            setPage('instances');
            setCreateSignal((value) => value + 1);
          }
        },
        ...(active
          ? [
              {
                id: 'launch-active',
                label: `Запустить ${instanceDisplayName(active)}`,
                icon: <Play size={14} fill="currentColor" />,
                onSelect: () => {
                  void selectInstance(active.id).then(() => launchGame(active.id));
                }
              } satisfies ContextMenuItem
            ]
          : []),
        {
          id: 'catalog',
          label: 'Каталог Modrinth',
          icon: <Compass size={14} />,
          onSelect: () => setPage('catalog')
        },
        {
          id: 'settings',
          label: 'Настройки',
          icon: <Settings size={14} />,
          onSelect: () => setPage('settings')
        },
        { id: 'sep', separator: true },
        {
          id: 'folder',
          label: 'Открыть папку игры',
          icon: <FolderOpen size={14} />,
          onSelect: () => {
            void api.state.openGameRoot().catch(() => {});
          }
        },
        {
          id: 'terminal',
          label: 'Терминал',
          icon: <Terminal size={14} />,
          onSelect: () => openConsole()
        },
        {
          id: 'refresh',
          label: 'Обновить состояние',
          icon: <RefreshCw size={14} />,
          onSelect: () => {
            void refresh();
          }
        }
      ];
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        title: 'SUNSPIRE',
        subtitle: 'Быстрые действия',
        items
      });
    };

    window.addEventListener('contextmenu', handler);
    return () => window.removeEventListener('contextmenu', handler);
  }, [
    state,
    launch.running,
    launch.instanceId,
    selectInstance,
    launchGame,
    killGame,
    openConsole,
    refresh
  ]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (event.key === '`' && event.ctrlKey) {
        event.preventDefault();
        if (launch.consoleOpen) closeConsole();
        else openConsole();
        return;
      }
      if (typing) return;
      const map: Record<string, PageId> = {
        F1: 'home',
        F2: 'catalog',
        F3: 'instances',
        F4: 'accounts',
        F5: 'settings'
      };
      if (map[event.key]) {
        event.preventDefault();
        setPage(map[event.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [launch.consoleOpen, openConsole, closeConsole]);

  const completeOnboarding = () => {
    try {
      window.localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // ignore
    }
    setOnboarding(false);
  };

  if (loading) return <BootScreen />;
  if (!state) return <ErrorScreen message={loadError || 'Неизвестная ошибка.'} onRetry={() => void refresh()} />;

  const navigate = (next: PageId) => {
    if (next === 'instances') {
      // keep direct navigation, creation is explicit
    }
    setPage(next);
  };

  const openCatalog = (type: ProjectType) => {
    setCatalogType(type);
    setPage('catalog');
  };

  const openProject = (id: string) => setProjectId(id);

  return (
    <div className={cx('app', state.settings.crtEffect && 'crt-on', launch.consoleOpen && 'console-open')}>
      <TitleBar />
      <div className="app-body">
        <Sidebar
          page={page}
          catalogType={catalogType}
          onNavigate={navigate}
          onOpenCatalog={openCatalog}
        />
        <main className="app-main" key={page}>
          {page === 'home' && <HomePage onNavigate={navigate} onOpenProject={openProject} />}
          {page === 'catalog' && (
            <CatalogPage
              projectType={catalogType}
              onProjectTypeChange={setCatalogType}
              onOpenProject={openProject}
            />
          )}
          {page === 'instances' && <InstancesPage openCreateSignal={createSignal} />}
          {page === 'accounts' && <AccountsPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
      <StatusBar />
      <ToastTray />
      <ConsoleDrawer />

      {projectId && (
        <ProjectModal
          projectId={projectId}
          onClose={() => setProjectId(null)}
          onGoToInstances={() => {
            setProjectId(null);
            setPage('instances');
          }}
          onCreateInstance={() => {
            setProjectId(null);
            setPage('instances');
            setCreateSignal((value) => value + 1);
          }}
        />
      )}

      {onboarding && (
        <Onboarding
          onDone={completeOnboarding}
          onNavigateHome={() => setPage('home')}
        />
      )}

      {contextMenu && (
        <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="УДАЛИТЬ СБОРКУ?"
          message={`Сборка «${instanceDisplayName(deleteTarget)}» и все её файлы будут удалены без возможности восстановления.`}
          confirmLabel="УДАЛИТЬ НАВСЕГДА"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            void deleteInstance(target.id);
          }}
        />
      )}

      <div className="crt-overlay" aria-hidden="true" />
      <div className="crt-vignette" aria-hidden="true" />
      <div className="screen-glare" aria-hidden="true" />
    </div>
  );
};

export const App: React.FC = () => (
  <LauncherProvider>
    <AppShell />
  </LauncherProvider>
);
