import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileArchive,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Info,
  Layers3,
  Loader2,
  MemoryStick,
  Package,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Save,
  Scan,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Upload,
  Zap
} from 'lucide-react';
import {
  InstanceModCategory,
  JsonIcon,
  LoaderVersion,
  ModLoader,
  ModpackInstance,
  MinecraftVersion
} from '../types';
import { useLauncher } from '../state/LauncherContext';
import { api } from '../lib/api';
import {
  cx,
  formatDate,
  formatPlaytime,
  formatPlaytimeShort,
  instanceDisplayName,
  loaderLabel,
  relativeTime
} from '../lib/format';
import { BlockIcon } from '../components/ui/BlockIcon';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  PixelSwitch,
  ProgressBar,
  Tag
} from '../components/ui/Common';

interface InstancesPageProps {
  openCreateSignal?: number;
}

type DetailTab = 'overview' | 'mods' | 'settings';

const iconChoices: { id: JsonIcon; label: string }[] = [
  { id: 'grass', label: 'ТРАВА' },
  { id: 'diamond', label: 'АЛМАЗ' },
  { id: 'gold', label: 'ЗОЛОТО' },
  { id: 'redstone', label: 'РЕДСТОУН' },
  { id: 'ender', label: 'ЭНДЕР' },
  { id: 'amethyst', label: 'АМЕТИСТ' },
  { id: 'stone', label: 'КАМЕНЬ' }
];

const loaderChoices: { id: ModLoader; label: string }[] = [
  { id: 'vanilla', label: 'VANILLA' },
  { id: 'fabric', label: 'FABRIC' },
  { id: 'quilt', label: 'QUILT' },
  { id: 'forge', label: 'FORGE' },
  { id: 'neoforge', label: 'NEOFORGE' }
];

const categoryOptions: { value: InstanceModCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'ВСЕ ФАЙЛЫ' },
  { value: 'mod', label: 'МОДЫ' },
  { value: 'resourcepack', label: 'РЕСУРСПАКИ' },
  { value: 'shader', label: 'ШЕЙДЕРЫ' },
  { value: 'datapack', label: 'ДАТАПАКИ' }
];

export const InstancesPage: React.FC<InstancesPageProps> = ({ openCreateSignal = 0 }) => {
  const {
    state,
    activeInstance,
    activeAccount,
    launch,
    task,
    loading,
    systemInfo,
    createInstance,
    updateInstance,
    deleteInstance,
    selectInstance,
    toggleMod,
    removeMod,
    scanMods,
    addLocalMods,
    launchGame,
    killGame,
    importMrpack,
    openConsole,
    showToast
  } = useLauncher();

  const activeName = instanceDisplayName(activeInstance);

  const [tab, setTab] = useState<DetailTab>('overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [modQuery, setModQuery] = useState('');
  const [modCategory, setModCategory] = useState<InstanceModCategory | 'all'>('all');
  const [modStateFilter, setModStateFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [busyMod, setBusyMod] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    ramMb: 4096,
    javaArgs: '',
    javaPath: '',
    server: '',
    icon: 'grass' as JsonIcon
  });

  useEffect(() => {
    if (openCreateSignal > 0) setCreateOpen(true);
  }, [openCreateSignal]);

  useEffect(() => {
    setTab('overview');
    setModQuery('');
    setModCategory('all');
    setModStateFilter('all');
  }, [activeInstance?.id]);

  useEffect(() => {
    if (!activeInstance) return;
    setForm({
      name: activeName,
      ramMb: activeInstance.ramMb,
      javaArgs: activeInstance.javaArgs || '',
      javaPath: activeInstance.javaPath || '',
      server: activeInstance.server || '',
      icon: activeInstance.icon
    });
  }, [
    activeInstance?.id,
    activeInstance?.name,
    activeInstance?.ramMb,
    activeInstance?.javaArgs,
    activeInstance?.javaPath,
    activeInstance?.server,
    activeInstance?.icon
  ]);

  useEffect(() => {
    const showOverview = () => setTab('overview');
    window.addEventListener('sunspire:instance-overview', showOverview);
    return () => window.removeEventListener('sunspire:instance-overview', showOverview);
  }, []);

  const mods = activeInstance?.mods || [];
  const filteredMods = useMemo(() => {
    const needle = modQuery.trim().toLowerCase();
    return mods.filter((mod) => {
      if (modCategory !== 'all' && mod.category !== modCategory) return false;
      if (modStateFilter === 'enabled' && !mod.enabled) return false;
      if (modStateFilter === 'disabled' && mod.enabled) return false;
      if (!needle) return true;
      return (
        mod.title.toLowerCase().includes(needle) ||
        mod.fileName.toLowerCase().includes(needle) ||
        mod.author.toLowerCase().includes(needle)
      );
    });
  }, [mods, modQuery, modCategory, modStateFilter]);

  const counts = useMemo(() => {
    return {
      all: mods.length,
      mod: mods.filter((mod) => mod.category === 'mod').length,
      resourcepack: mods.filter((mod) => mod.category === 'resourcepack').length,
      shader: mods.filter((mod) => mod.category === 'shader').length,
      datapack: mods.filter((mod) => mod.category === 'datapack').length,
      enabled: mods.filter((mod) => mod.enabled).length
    };
  }, [mods]);

  const dirty =
    activeInstance &&
    (form.name !== activeName ||
      form.ramMb !== activeInstance.ramMb ||
      form.javaArgs !== (activeInstance.javaArgs || '') ||
      form.javaPath !== (activeInstance.javaPath || '') ||
      form.server !== (activeInstance.server || '') ||
      form.icon !== activeInstance.icon);

  const launchHere = launch.instanceId === activeInstance?.id;
  const runningHere = launchHere && launch.running;
  const preparingHere = launchHere && !launch.running && (launch.phase === 'preparing' || launch.phase === 'idle');

  const handleSave = async () => {
    if (!activeInstance) return;
    if (!form.name.trim()) {
      showToast('Название сборки не может быть пустым.', 'error');
      return;
    }
    await updateInstance(activeInstance.id, {
      name: form.name.trim(),
      ramMb: form.ramMb,
      javaArgs: form.javaArgs,
      javaPath: form.javaPath,
      server: form.server,
      icon: form.icon
    });
    showToast('Настройки сборки сохранены.', 'success');
  };

  const handleChooseJava = async () => {
    try {
      const info = await api.java.choose();
      if (!info) return;
      setForm((current) => ({ ...current, javaPath: info.path }));
      showToast(`Java ${info.version} выбрана для этой сборки.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleScan = async () => {
    if (!activeInstance) return;
    setScanning(true);
    try {
      await scanMods(activeInstance.id);
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      await importMrpack();
    } finally {
      setImporting(false);
    }
  };

  const handleToggle = async (modId: string) => {
    if (!activeInstance) return;
    setBusyMod(modId);
    try {
      await toggleMod(activeInstance.id, modId);
    } finally {
      setBusyMod(null);
    }
  };

  const handleRemove = async (modId: string) => {
    if (!activeInstance) return;
    setBusyMod(modId);
    try {
      await removeMod(activeInstance.id, modId);
    } finally {
      setBusyMod(null);
    }
  };

  const openFolder = () => {
    if (!activeInstance) return;
    api.state.openInstanceFolder(activeInstance.id).catch((error) => {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    });
  };

  const overviewMods = mods.slice(0, 5);
  const pack = activeInstance?.modpack;

  return (
    <div className="page instances-page">
      <PageHeader
        kicker="// INSTANCE DECK"
        title="СБОРКИ"
        description="Управляйте профилями Minecraft: версии, загрузчики, память, моды и файлы ресурсов."
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void handleImport()}
              disabled={importing}
            >
              {importing ? <Loader2 size={14} className="spin" /> : <FileArchive size={14} />}
              ИМПОРТ .MRPACK
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> СОЗДАТЬ СБОРКУ
            </button>
          </>
        }
      />

      {!activeInstance ? (
        <EmptyState
          className="instances-empty"
          icon={<Layers3 size={48} />}
          title="БИБЛИОТЕКА ПУСТА"
          description="Создайте первый профиль: выберите версию Minecraft и загрузчик. Лаунчер сам скачает библиотеки и Java при первом запуске."
          action={
            <div className="empty-state-actions">
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <Plus size={15} /> НОВАЯ СБОРКА
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void handleImport()}>
                <FileArchive size={14} /> ИМПОРТ MODPACK
              </button>
            </div>
          }
        />
      ) : (
        <div className="instances-layout">
          <aside className="instance-rail">
            <div className="instance-rail-head">
              <span>ПРОФИЛИ / {String(state?.instances.length || 0).padStart(2, '0')}</span>
              <button type="button" className="icon-button" onClick={() => setCreateOpen(true)} title="Новая сборка">
                <Plus size={14} />
              </button>
            </div>
            <div className="instance-rail-list">
              {state?.instances.map((instance) => {
                const isActive = instance.id === activeInstance.id;
                const isRunning = launch.running && launch.instanceId === instance.id;
                return (
                  <button
                    key={instance.id}
                    type="button"
                    data-instance-id={instance.id}
                    className={cx('rail-card', isActive && 'is-active', isRunning && 'is-running')}
                    onClick={() => {
                      if (!isActive) void selectInstance(instance.id);
                    }}
                  >
                    <span className="rail-card-icon">
                      <BlockIcon type={instance.icon} size={34} />
                    </span>
                    <span className="rail-card-body">
                      <strong>{instanceDisplayName(instance)}</strong>
                      <span>
                        {instance.mcVersion} · {loaderLabel(instance.loader)}
                      </span>
                      <em>
                        {instance.mods.length} файлов · {formatPlaytimeShort(instance.totalPlayMs)}
                      </em>
                    </span>
                    {isRunning ? (
                      <span className="rail-card-live">
                        <span className="led led-amber" />
                        LIVE
                      </span>
                    ) : (
                      <ChevronRight size={14} className="rail-card-chevron" />
                    )}
                  </button>
                );
              })}
              <button type="button" className="rail-card rail-card-add" onClick={() => setCreateOpen(true)}>
                <span className="rail-card-add-icon">
                  <Plus size={18} />
                </span>
                <span>
                  <strong>НОВАЯ СБОРКА</strong>
                  <em>Vanilla, Fabric, Forge…</em>
                </span>
              </button>
            </div>
            <div className="instance-rail-foot">
              <span>
                <MemoryStick size={11} /> ВСЕГО RAM
              </span>
              <strong>
                {state
                  ? `${(state.instances.reduce((sum, item) => sum + item.ramMb, 0) / 1024).toFixed(0)} GB`
                  : '—'}
              </strong>
            </div>
          </aside>

          <section className="instance-detail" data-instance-id={activeInstance.id}>
            <header className="instance-detail-head">
              <div className="instance-detail-title">
                <span className="instance-detail-icon">
                  <BlockIcon type={activeInstance.icon} size={64} />
                </span>
                <div>
                  <div className="instance-detail-kicker">
                    <span className="page-kicker">// ПРОФИЛЬ</span>
                    {activeInstance.modpack && (
                      <Tag tone="purple">
                        <Boxes size={10} /> {activeInstance.modpack.title}
                      </Tag>
                    )}
                    {launch.running && launch.instanceId === activeInstance.id && (
                      <Tag tone="amber">
                        <span className="led led-amber" /> В ИГРЕ
                      </Tag>
                    )}
                  </div>
                  <h2>{activeName}</h2>
                  <div className="instance-detail-chips">
                    <Tag tone="acid">{activeInstance.mcVersion}</Tag>
                    <Tag tone="default">{loaderLabel(activeInstance.loader).toUpperCase()}</Tag>
                    {activeInstance.loaderVersion && <Tag tone="muted">{activeInstance.loaderVersion}</Tag>}
                    <Tag tone="amber">{Math.round(activeInstance.ramMb / 1024)} GB</Tag>
                    <Tag tone="muted">
                      {activeInstance.mods.filter((mod) => mod.enabled).length} / {activeInstance.mods.length} МОДОВ
                    </Tag>
                  </div>
                </div>
              </div>
              <div className="instance-detail-actions">
                {runningHere ? (
                  <>
                    <button type="button" className="btn btn-primary" onClick={openConsole}>
                      <Terminal size={15} /> КОНСОЛЬ
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => void killGame()}>
                      <Square size={13} /> СТОП
                    </button>
                  </>
                ) : preparingHere ? (
                  <button type="button" className="btn btn-primary" onClick={openConsole}>
                    <Loader2 size={15} className="spin" /> ЗАПУСК…
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void launchGame(activeInstance.id)}
                  >
                    <Play size={15} fill="currentColor" /> ЗАПУСТИТЬ
                  </button>
                )}
                <button type="button" className="icon-button" onClick={openFolder} title="Открыть папку сборки">
                  <FolderOpen size={15} />
                </button>
              </div>
            </header>

            <div className="instance-tabs">
              <button
                type="button"
                className={cx('instance-tab', tab === 'overview' && 'is-active')}
                onClick={() => setTab('overview')}
              >
                <Info size={14} /> ОБЗОР
              </button>
              <button
                type="button"
                className={cx('instance-tab', tab === 'mods' && 'is-active')}
                onClick={() => setTab('mods')}
              >
                <Package size={14} /> ФАЙЛЫ <em>{mods.length}</em>
              </button>
              <button
                type="button"
                className={cx('instance-tab', tab === 'settings' && 'is-active')}
                onClick={() => setTab('settings')}
              >
                <Settings2 size={14} /> НАСТРОЙКИ
              </button>
            </div>

            {tab === 'overview' && (
              <div className="instance-overview">
                <div className="instance-stat-grid">
                  <div className="instance-stat">
                    <span>
                      <Clock size={13} /> НАИГРАНО
                    </span>
                    <strong>{formatPlaytime(activeInstance.totalPlayMs)}</strong>
                    <em>за всё время</em>
                  </div>
                  <div className="instance-stat">
                    <span>
                      <Gamepad2 size={13} /> ПОСЛЕДНИЙ ЗАПУСК
                    </span>
                    <strong>{relativeTime(activeInstance.lastPlayedAt)}</strong>
                    <em>{formatDate(activeInstance.lastPlayedAt)}</em>
                  </div>
                  <div className="instance-stat">
                    <span>
                      <MemoryStick size={13} /> ПАМЯТЬ
                    </span>
                    <strong>{Math.round(activeInstance.ramMb / 1024)} GB</strong>
                    <em>
                      {systemInfo
                        ? `из ${Math.round(systemInfo.totalMemMb / 1024)} GB системной`
                        : 'выделено сборке'}
                    </em>
                  </div>
                  <div className="instance-stat">
                    <span>
                      <Package size={13} /> ФАЙЛЫ
                    </span>
                    <strong>{mods.length}</strong>
                    <em>{counts.enabled} включено</em>
                  </div>
                </div>

                <div className="instance-overview-grid">
                  <div className="panel instance-info-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="page-kicker">// DOSSIER</span>
                        <h3>О СБОРКЕ</h3>
                      </div>
                    </div>
                    <dl className="info-list">
                      <div>
                        <dt>Версия игры</dt>
                        <dd>{activeInstance.mcVersion}</dd>
                      </div>
                      <div>
                        <dt>Загрузчик</dt>
                        <dd>
                          {loaderLabel(activeInstance.loader)}
                          {activeInstance.loaderVersion ? ` ${activeInstance.loaderVersion}` : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Создана</dt>
                        <dd>{formatDate(activeInstance.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Сервер</dt>
                        <dd>{activeInstance.server || 'Не указан'}</dd>
                      </div>
                      <div>
                        <dt>Java</dt>
                        <dd>{activeInstance.javaPath || 'Автоматически / глобальная'}</dd>
                      </div>
                      <div>
                        <dt>Аргументы JVM</dt>
                        <dd className="mono">{activeInstance.javaArgs || 'Стандартные'}</dd>
                      </div>
                    </dl>
                    <div className="instance-info-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={openFolder}>
                        <FolderOpen size={12} /> ОТКРЫТЬ ПАПКУ
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTab('settings')}>
                        <Settings2 size={12} /> ИЗМЕНИТЬ
                      </button>
                    </div>
                  </div>

                  <div className="panel instance-quick-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="page-kicker">// QUICK LAUNCH</span>
                        <h3>К ЗАПУСКУ</h3>
                      </div>
                    </div>
                    <div className="quick-account">
                      <span className={cx('quick-account-led', activeAccount ? 'ok' : 'warn')} />
                      <div>
                        <span>АККАУНТ</span>
                        <strong>{activeAccount ? activeAccount.username : 'Не подключён'}</strong>
                      </div>
                      <Tag tone={activeAccount ? 'acid' : 'red'}>
                        {activeAccount ? (activeAccount.type === 'microsoft' ? 'LICENSE' : 'OFFLINE') : 'NONE'}
                      </Tag>
                    </div>
                    <div className="quick-account">
                      <span className={cx('quick-account-led', activeInstance.mods.length ? 'ok' : 'warn')} />
                      <div>
                        <span>МОДЫ</span>
                        <strong>
                          {counts.enabled} активных из {mods.length}
                        </strong>
                      </div>
                      <Tag tone="muted">{counts.mod} MOD</Tag>
                    </div>
                    <div className="quick-account">
                      <span className={cx('quick-account-led', activeInstance.server ? 'ok' : 'warn')} />
                      <div>
                        <span>СЕРВЕР</span>
                        <strong>{activeInstance.server || 'Одиночная игра'}</strong>
                      </div>
                      <Server size={14} />
                    </div>
                    {preparingHere && (
                      <div className="quick-progress">
                        <div>
                          <span>{launch.message || 'Подготовка…'}</span>
                          <em>{Math.round(launch.progress)}%</em>
                        </div>
                        <ProgressBar value={launch.progress} indeterminate={launch.progress <= 0} />
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary btn-block quick-launch-btn"
                      onClick={() =>
                        runningHere ? openConsole() : void launchGame(activeInstance.id)
                      }
                    >
                      {runningHere ? (
                        <>
                          <Terminal size={15} /> ОТКРЫТЬ КОНСОЛЬ
                        </>
                      ) : (
                        <>
                          <Play size={15} fill="currentColor" /> ЗАПУСТИТЬ {activeName}
                        </>
                      )}
                    </button>
                    <div className="quick-tip">
                      <ShieldCheck size={12} />
                      Файлы проверяются перед каждым запуском.
                    </div>
                  </div>
                </div>

                {pack && (
                  <div className="panel instance-pack-panel">
                    <div className="instance-pack-icon">
                      {pack.iconUrl ? <img src={pack.iconUrl} alt="" /> : <Boxes size={28} />}
                    </div>
                    <div className="instance-pack-info">
                      <span className="page-kicker">// MODRINTH MODPACK</span>
                      <strong>{pack.title}</strong>
                      <span>
                        Версия {pack.versionNumber} · установлена как отдельная сборка
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        api.app.openExternal(`https://modrinth.com/modpack/${pack.projectId}`)
                      }
                    >
                      <ExternalLink size={12} /> НА MODRINTH
                    </button>
                  </div>
                )}

                <div className="panel instance-mod-preview">
                  <div className="panel-heading">
                    <div>
                      <span className="page-kicker">// PAYLOAD</span>
                      <h3>УСТАНОВЛЕННЫЕ ФАЙЛЫ</h3>
                    </div>
                    <button type="button" className="link-button" onClick={() => setTab('mods')}>
                      УПРАВЛЯТЬ <ChevronRight size={13} />
                    </button>
                  </div>
                  {overviewMods.length === 0 ? (
                    <div className="mod-preview-empty">
                      <Package size={20} />
                      <span>Файлов пока нет. Откройте каталог и установите первый мод.</span>
                    </div>
                  ) : (
                    <div className="mod-preview-list">
                      {overviewMods.map((mod) => (
                        <div className={cx('mod-preview-row', !mod.enabled && 'is-off')} key={mod.id}>
                          <span className="mod-preview-icon">
                            {mod.iconUrl ? <img src={mod.iconUrl} alt="" loading="lazy" /> : <Package size={15} />}
                          </span>
                          <span className="mod-preview-name">
                            <strong>{mod.title}</strong>
                            <em>{mod.version}</em>
                          </span>
                          <span className="mod-preview-cat">{mod.category.toUpperCase()}</span>
                          <span className={cx('mod-preview-led', mod.enabled ? 'ok' : 'off')} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'mods' && (
              <div className="instance-mods">
                <div className="mods-toolbar">
                  <div className="mods-search">
                    <Search size={14} />
                    <input
                      value={modQuery}
                      onChange={(event) => setModQuery(event.target.value)}
                      placeholder="Поиск по названию или файлу…"
                    />
                    {modQuery && (
                      <button type="button" onClick={() => setModQuery('')} aria-label="Очистить">
                        ×
                      </button>
                    )}
                  </div>
                  <div className="mods-filter-group">
                    <select
                      value={modCategory}
                      onChange={(event) => setModCategory(event.target.value as InstanceModCategory | 'all')}
                    >
                      {categoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} {option.value === 'all' ? `(${counts.all})` : `(${counts[option.value]})`}
                        </option>
                      ))}
                    </select>
                    <select
                      value={modStateFilter}
                      onChange={(event) => setModStateFilter(event.target.value as typeof modStateFilter)}
                    >
                      <option value="all">ВСЕ СТАТУСЫ</option>
                      <option value="enabled">ВКЛЮЧЕНЫ</option>
                      <option value="disabled">ОТКЛЮЧЕНЫ</option>
                    </select>
                  </div>
                  <div className="mods-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleScan()} disabled={scanning}>
                      {scanning ? <Loader2 size={12} className="spin" /> : <Scan size={12} />}
                      СКАН
                    </button>
                    <button type="button" className="icon-button" onClick={openFolder} title="Папка модов">
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </div>

                <div className="mods-add-row">
                  <span>ДОБАВИТЬ ФАЙЛЫ:</span>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => void addLocalMods(activeInstance.id, 'mod')}>
                    <Upload size={11} /> МОД
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => void addLocalMods(activeInstance.id, 'resourcepack')}
                  >
                    <Palette size={11} /> РЕСУРСПАК
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => void addLocalMods(activeInstance.id, 'shader')}
                  >
                    <Sparkles size={11} /> ШЕЙДЕР
                  </button>
                  <em>или установите из каталога Modrinth</em>
                </div>

                {task.status === 'active' && task.instanceId === activeInstance.id && (
                  <div className="mods-task">
                    <Loader2 size={14} className="spin" />
                    <span>{task.message}</span>
                    <ProgressBar value={task.progress} indeterminate={task.progress <= 0} />
                  </div>
                )}

                {filteredMods.length === 0 ? (
                  <EmptyState
                    className="mods-empty"
                    icon={<Package size={34} />}
                    title={mods.length === 0 ? 'В СБОРКЕ НЕТ ФАЙЛОВ' : 'ПО ФИЛЬТРАМ НИЧЕГО НЕ НАЙДЕНО'}
                    description={
                      mods.length === 0
                        ? 'Откройте каталог Modrinth или добавьте JAR/ZIP-файлы с диска.'
                        : 'Измените поисковый запрос или сбросьте фильтры категорий.'
                    }
                  />
                ) : (
                  <div className="mods-table">
                    <div className="mods-table-head">
                      <span>ФАЙЛ</span>
                      <span>КАТЕГОРИЯ</span>
                      <span>ВЕРСИЯ</span>
                      <span>РАЗМЕР</span>
                      <span>СТАТУС</span>
                      <span />
                    </div>
                    {filteredMods.map((mod) => (
                      <div className={cx('mods-row', !mod.enabled && 'is-off')} key={mod.id}>
                        <div className="mods-file">
                          <span className="mods-icon">
                            {mod.iconUrl ? <img src={mod.iconUrl} alt="" loading="lazy" /> : <Package size={16} />}
                          </span>
                          <span className="mods-file-text">
                            <strong>{mod.title}</strong>
                            <em title={mod.fileName}>{mod.fileName}</em>
                            <span>by {mod.author}</span>
                          </span>
                        </div>
                        <span className="mods-category">{mod.category.toUpperCase()}</span>
                        <span className="mods-version">{mod.version}</span>
                        <span className="mods-size">{mod.size}</span>
                        <span className="mods-state">
                          <PixelSwitch
                            checked={mod.enabled}
                            onChange={() => void handleToggle(mod.id)}
                            label={mod.enabled ? 'Отключить мод' : 'Включить мод'}
                            disabled={busyMod === mod.id}
                          />
                        </span>
                        <span className="mods-remove">
                          <button
                            type="button"
                            className="icon-button icon-button-danger"
                            title="Удалить файл"
                            disabled={busyMod === mod.id}
                            onClick={() => void handleRemove(mod.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'settings' && (
              <div className="instance-settings">
                <div className="settings-block panel">
                  <div className="panel-heading">
                    <div>
                      <span className="page-kicker">// IDENTITY</span>
                      <h3>ПРОФИЛЬ</h3>
                    </div>
                  </div>
                  <label className="field">
                    <span className="field-label">НАЗВАНИЕ СБОРКИ</span>
                    <input
                      id="instance-name-input"
                      value={form.name}
                      maxLength={60}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <div className="field">
                    <span className="field-label">ИКОНКА</span>
                    <div className="icon-picker">
                      {iconChoices.map((choice) => (
                        <button
                          key={choice.id}
                          type="button"
                          className={cx('icon-choice', form.icon === choice.id && 'is-active')}
                          onClick={() => setForm((current) => ({ ...current, icon: choice.id }))}
                          title={choice.label}
                        >
                          <BlockIcon type={choice.id} size={30} />
                          <span>{choice.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="field">
                    <span className="field-label">СЕРВЕР ПО УМОЛЧАНИЮ</span>
                    <input
                      value={form.server}
                      maxLength={200}
                      placeholder="mc.example.net:25565"
                      onChange={(event) => setForm((current) => ({ ...current, server: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="settings-block panel">
                  <div className="panel-heading">
                    <div>
                      <span className="page-kicker">// PERFORMANCE</span>
                      <h3>ПАМЯТЬ И JAVA</h3>
                    </div>
                    <MemoryStick size={16} className="panel-heading-icon" />
                  </div>
                  <div className="ram-control">
                    <div className="ram-control-head">
                      <span className="field-label">ОПЕРАТИВНАЯ ПАМЯТЬ</span>
                      <strong>{form.ramMb >= 1024 ? `${(form.ramMb / 1024).toFixed(form.ramMb % 1024 ? 1 : 0)} GB` : `${form.ramMb} MB`}</strong>
                    </div>
                    <input
                      type="range"
                      min={1024}
                      max={Math.min(32768, systemInfo ? Math.max(4096, Math.floor(systemInfo.totalMemMb / 1024) * 1024) : 16384)}
                      step={512}
                      value={form.ramMb}
                      onChange={(event) => setForm((current) => ({ ...current, ramMb: Number(event.target.value) }))}
                      className="ram-slider"
                    />
                    <div className="ram-presets">
                      {[2048, 4096, 6144, 8192, 12288, 16384].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={cx('ram-preset', form.ramMb === preset && 'is-active')}
                          onClick={() => setForm((current) => ({ ...current, ramMb: preset }))}
                        >
                          {preset / 1024}G
                        </button>
                      ))}
                    </div>
                    <p className="field-hint">
                      Для Minecraft 26.3 рекомендуется 4–8 GB. Выделено этой сборке; остальным сборкам память
                      не резервируется.
                    </p>
                  </div>

                  <label className="field">
                    <span className="field-label">ПУТЬ К JAVA (ПЕРЕОПРЕДЕЛЕНИЕ)</span>
                    <div className="input-with-button">
                      <input
                        value={form.javaPath}
                        placeholder="Автоматически / глобальная Java"
                        onChange={(event) => setForm((current) => ({ ...current, javaPath: event.target.value }))}
                      />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleChooseJava()}>
                        <FolderOpen size={12} /> ОБЗОР
                      </button>
                      {form.javaPath && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setForm((current) => ({ ...current, javaPath: '' }))}
                        >
                          СБРОС
                        </button>
                      )}
                    </div>
                  </label>

                  <label className="field">
                    <span className="field-label">АРГУМЕНТЫ JVM</span>
                    <input
                      value={form.javaArgs}
                      placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
                      onChange={(event) => setForm((current) => ({ ...current, javaArgs: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="settings-block panel settings-danger">
                  <div className="panel-heading">
                    <div>
                      <span className="page-kicker">// DANGER ZONE</span>
                      <h3>УДАЛЕНИЕ СБОРКИ</h3>
                    </div>
                    <AlertTriangle size={16} className="panel-heading-icon" />
                  </div>
                  <p>
                    Будут удалены все файлы сборки: моды, конфиги, сохранения и библиотеки. Это действие
                    нельзя отменить.
                  </p>
                  <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
                    <Trash2 size={14} /> УДАЛИТЬ «{activeName}»
                  </button>
                </div>

                <div className="instance-settings-save">
                  <span>{dirty ? 'ЕСТЬ НЕСОХРАНЁННЫЕ ИЗМЕНЕНИЯ' : 'ВСЕ ИЗМЕНЕНИЯ СОХРАНЕНЫ'}</span>
                  <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={!dirty}>
                    <Save size={14} /> СОХРАНИТЬ
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <CreateInstanceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createInstance}
        defaultRam={state?.settings.defaultRamMb || 4096}
      />

      {activeInstance && deleteOpen && (
        <ConfirmDialog
          title="УДАЛИТЬ СБОРКУ?"
          message={`Сборка «${activeName}» и все её файлы будут удалены без возможности восстановления.`}
          confirmLabel="УДАЛИТЬ НАВСЕГДА"
          danger
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => {
            setDeleteOpen(false);
            void deleteInstance(activeInstance.id);
          }}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                            Create instance modal                           */
/* -------------------------------------------------------------------------- */

interface CreateInstanceModalProps {
  open: boolean;
  onClose: () => void;
  defaultRam: number;
  onCreate: (input: {
    name: string;
    mcVersion: string;
    loader: ModLoader;
    loaderVersion?: string;
    ramMb: number;
    icon: JsonIcon;
    server?: string;
  }) => Promise<ModpackInstance>;
}

const CreateInstanceModal: React.FC<CreateInstanceModalProps> = ({ open, onClose, defaultRam, onCreate }) => {
  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [name, setName] = useState('НОВАЯ СБОРКА');
  const [mcVersion, setMcVersion] = useState('');
  const [loader, setLoader] = useState<ModLoader>('fabric');
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [loaderVersion, setLoaderVersion] = useState('');
  const [loaderLoading, setLoaderLoading] = useState(false);
  const [loaderError, setLoaderError] = useState<string | null>(null);
  const [ramMb, setRamMb] = useState(defaultRam);
  const [icon, setIcon] = useState<JsonIcon>('grass');
  const [server, setServer] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('НОВАЯ СБОРКА');
    setServer('');
    setError(null);
    setRamMb(defaultRam);
    setIcon('grass');
    setCreating(false);
    setVersionsLoading(true);
    api.mc
      .versions()
      .then((manifest) => {
        setVersions(manifest.versions);
        const release = manifest.versions.find((version) => version.id === manifest.latest.release);
        setMcVersion((current) => current || release?.id || manifest.versions[0]?.id || '');
      })
      .catch(() => {
        setVersions([]);
        setError('Не удалось получить список версий Minecraft.');
      })
      .finally(() => setVersionsLoading(false));
  }, [open, defaultRam]);

  const visibleVersions = useMemo(() => {
    if (!versions.length) return [];
    return versions.filter(
      (version) =>
        version.type === 'release' ||
        (showSnapshots && (version.type === 'snapshot' || version.type === 'old_beta' || version.type === 'old_alpha'))
    );
  }, [versions, showSnapshots]);

  useEffect(() => {
    if (!open) return;
    if (loader === 'vanilla' || !mcVersion) {
      setLoaderVersions([]);
      setLoaderVersion('');
      setLoaderError(null);
      return;
    }
    let cancelled = false;
    setLoaderLoading(true);
    setLoaderError(null);
    api.mc
      .loaders(mcVersion)
      .then((result) => {
        if (cancelled) return;
        const list = result[loader] || [];
        setLoaderVersions(list);
        const first = list.find((entry) => entry.stable) || list[0];
        setLoaderVersion(first ? first.version : '');
        if (!list.length) setLoaderError(`Для ${loaderLabel(loader)} нет версий под Minecraft ${mcVersion}.`);
      })
      .catch((loaderFetchError) => {
        if (cancelled) return;
        setLoaderVersions([]);
        setLoaderVersion('');
        setLoaderError(loaderFetchError instanceof Error ? loaderFetchError.message : String(loaderFetchError));
      })
      .finally(() => {
        if (!cancelled) setLoaderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mcVersion, loader]);

  useEffect(() => {
    if (!open) return;
    if (loader === 'vanilla' && name === 'НОВАЯ СБОРКА') {
      setName(`VANILLA ${mcVersion}`.trim());
    } else if (loader !== 'vanilla' && name === 'НОВАЯ СБОРКА') {
      setName(`${loaderLabel(loader).toUpperCase()} ${mcVersion}`.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, mcVersion, open]);

  const handleCreate = async () => {    setError(null);
    if (!name.trim()) {
      setError('Введите название сборки.');
      return;
    }
    if (!mcVersion) {
      setError('Выберите версию Minecraft.');
      return;
    }
    if (loader !== 'vanilla' && !loaderVersion) {
      setError('Выберите версию загрузчика.');
      return;
    }
    setCreating(true);
    try {
      await onCreate({
        name: name.trim(),
        mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
        ramMb,
        icon,
        server: server.trim()
      });
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      title="НОВАЯ СБОРКА"
      kicker="INSTANCE DECK :: CREATE"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            ОТМЕНА
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleCreate()}
            disabled={creating || versionsLoading || (loader !== 'vanilla' && loaderLoading)}
          >
            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            {creating ? 'СОЗДАНИЕ…' : 'СОЗДАТЬ СБОРКУ'}
          </button>
        </>
      }
    >
      <div className="create-form">
        {error && (
          <div className="form-error">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <div className="create-form-grid">
          <label className="field create-name">
            <span className="field-label">НАЗВАНИЕ СБОРКИ</span>
            <input
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder="МОЯ СБОРКА"
              autoFocus
            />
          </label>

          <div className="field">
            <span className="field-label">ИКОНКА ПРОФИЛЯ</span>
            <div className="icon-picker icon-picker-compact">
              {iconChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={cx('icon-choice', icon === choice.id && 'is-active')}
                  onClick={() => setIcon(choice.id)}
                  title={choice.label}
                >
                  <BlockIcon type={choice.id} size={26} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="create-form-grid create-form-grid-2">
          <label className="field">
            <span className="field-label">ВЕРСИЯ MINECRAFT</span>
            <div className="select-with-toggle">
              <select
                value={mcVersion}
                onChange={(event) => setMcVersion(event.target.value)}
                disabled={versionsLoading}
              >
                {versionsLoading && <option>ЗАГРУЗКА…</option>}
                {visibleVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.id}
                    {version.type !== 'release' ? ` · ${version.type.toUpperCase()}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={cx('snapshot-toggle', showSnapshots && 'is-on')}
                onClick={() => setShowSnapshots((value) => !value)}
                title="Показать снапшоты"
              >
                SN
              </button>
            </div>
          </label>

          <div className="field">
            <span className="field-label">ЗАГРУЗЧИК МОДОВ</span>
            <div className="loader-picker">
              {loaderChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={cx('loader-choice', loader === choice.id && 'is-active')}
                  onClick={() => setLoader(choice.id)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loader !== 'vanilla' && (
          <div className="create-form-grid create-form-grid-2">
            <label className="field">
              <span className="field-label">ВЕРСИЯ {loaderLabel(loader).toUpperCase()}</span>
              <select
                value={loaderVersion}
                onChange={(event) => setLoaderVersion(event.target.value)}
                disabled={loaderLoading || !loaderVersions.length}
              >
                {loaderLoading && <option>ЗАГРУЗКА…</option>}
                {loaderVersions.map((entry) => (
                  <option key={entry.version} value={entry.version}>
                    {entry.version}
                    {entry.stable ? ' · STABLE' : ''}
                  </option>
                ))}
              </select>
              {loaderError && <span className="field-hint field-hint-error">{loaderError}</span>}
            </label>

            <label className="field">
              <span className="field-label">ОПЕРАТИВНАЯ ПАМЯТЬ</span>
              <div className="create-ram">
                <input
                  type="range"
                  min={1024}
                  max={16384}
                  step={512}
                  value={ramMb}
                  onChange={(event) => setRamMb(Number(event.target.value))}
                  className="ram-slider"
                />
                <strong>{(ramMb / 1024).toFixed(ramMb % 1024 ? 1 : 0)} GB</strong>
              </div>
              <span className="field-hint">Выделяется только при запуске этой сборки.</span>
            </label>
          </div>
        )}

        {loader === 'vanilla' && (
          <div className="create-form-grid">
            <label className="field">
              <span className="field-label">ОПЕРАТИВНАЯ ПАМЯТЬ</span>
              <div className="create-ram">
                <input
                  type="range"
                  min={1024}
                  max={16384}
                  step={512}
                  value={ramMb}
                  onChange={(event) => setRamMb(Number(event.target.value))}
                  className="ram-slider"
                />
                <strong>{(ramMb / 1024).toFixed(ramMb % 1024 ? 1 : 0)} GB</strong>
              </div>
            </label>
          </div>
        )}

        <label className="field">
          <span className="field-label">СЕРВЕР ПО УМОЛЧАНИЮ <em>НЕОБЯЗАТЕЛЬНО</em></span>
          <input
            value={server}
            maxLength={200}
            onChange={(event) => setServer(event.target.value)}
            placeholder="mc.example.net:25565"
          />
        </label>

        <div className="create-note">
          <Info size={14} />
          <p>
            Сборка создаётся мгновенно. Библиотеки, ассеты и Java скачаются при первом запуске — прогресс
            будет виден в терминале.
          </p>
        </div>
      </div>
    </Modal>
  );
};
