import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Layers3,
  MemoryStick,
  Package,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Terminal,
  Users,
  Zap
} from 'lucide-react';
import { ModrinthHit, PageId } from '../types';
import { useLauncher } from '../state/LauncherContext';
import { api } from '../lib/api';
import {
  cx,
  formatDate,
  formatDownloads,
  formatPlaytime,
  instanceDisplayName,
  loaderLabel,
  relativeTime
} from '../lib/format';
import { BlockIcon } from '../components/ui/BlockIcon';
import { SkinViewer } from '../components/ui/SkinViewer';
import { SkinHead } from '../components/ui/SkinHead';
import { EmptyState, ProgressBar, Tag } from '../components/ui/Common';

interface HomePageProps {
  onNavigate: (page: PageId) => void;
  onOpenProject: (projectId: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onOpenProject }) => {
  const {
    state,
    activeAccount,
    activeInstance,
    launch,
    javaList,
    systemInfo,
    launchGame,
    killGame,
    openConsole,
    selectInstance,
    showToast
  } = useLauncher();

  const activeName = instanceDisplayName(activeInstance);

  const [trending, setTrending] = useState<ModrinthHit[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState(false);

  const dateLabel = useMemo(() => {
    const formatted = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: '2-digit',
      month: 'long'
    }).format(new Date());
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    setTrendingError(false);
    const loader =
      activeInstance && activeInstance.loader !== 'vanilla' ? activeInstance.loader : undefined;
    api.modrinth
      .search({
        projectType: 'mod',
        gameVersion: activeInstance?.mcVersion,
        loader,
        sort: 'downloads',
        limit: 4
      })
      .then((result) => {
        if (cancelled) return;
        setTrending(result.hits);
        setTrendingLoading(false);
      })
      .catch(() => {
        api.modrinth
          .search({ projectType: 'mod', sort: 'downloads', limit: 4 })
          .then((result) => {
            if (cancelled) return;
            setTrending(result.hits);
            setTrendingLoading(false);
          })
          .catch(() => {
            if (cancelled) return;
            setTrendingError(true);
            setTrendingLoading(false);
          });
      });
    return () => {
      cancelled = true;
    };
  }, [activeInstance?.id, activeInstance?.mcVersion, activeInstance?.loader]);

  const launchForActive = launch.instanceId === activeInstance?.id;
  const preparing = launchForActive && (launch.phase === 'preparing' || launch.phase === 'idle') && !launch.running && launch.progress > 0;
  const running = launchForActive && launch.running;
  const launchError = launchForActive ? launch.error : null;

  const enabledMods = activeInstance
    ? activeInstance.mods.filter((mod) => mod.enabled).length
    : 0;

  const handleLaunch = () => {
    if (!activeInstance) {
      onNavigate('instances');
      return;
    }
    if (!activeAccount) {
      showToast('Сначала добавьте аккаунт Minecraft.', 'error');
      onNavigate('accounts');
      return;
    }
    if (running || preparing) {
      openConsole();
      return;
    }
    void launchGame(activeInstance.id);
  };

  const handleFolder = () => {
    api.state.openInstanceFolder(activeInstance!.id).catch((error) => {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    });
  };

  const usedMemory = activeInstance?.ramMb || state?.settings.defaultRamMb || 4096;
  const totalMemory = systemInfo?.totalMemMb || 0;
  const freeMemory = systemInfo?.freeMemMb || 0;
  const memoryPercent = totalMemory ? Math.min(100, (usedMemory / totalMemory) * 100) : 0;
  const freePercent = totalMemory ? Math.min(100, (freeMemory / totalMemory) * 100) : 0;
  const selectedJava = javaList.find((entry) => entry.path === state?.settings.javaPath) || javaList[0];

  return (
    <div className="page home-page">
      <div className="home-topline">
        <div className="home-topline-left">
          <span className="page-kicker">// ГЛАВНАЯ ПАНЕЛЬ</span>
          <span className="home-topline-sep">/</span>
          <span className="home-topline-date">{dateLabel}</span>
        </div>
        <div className="home-topline-right">
          <span className="led led-acid" />
          <span>ВСЕ СИСТЕМЫ В НОРМЕ</span>
          <span className="home-topline-build">RC-OS 1.0.0</span>
        </div>
      </div>

      <section className="home-hero" data-instance-id={activeInstance?.id}>
        <div className="hero-main panel">
          <span className="hero-watermark" aria-hidden="true">
            01
          </span>
          <div className="hero-main-top">
            <span className="hero-kicker">АКТИВНЫЙ ПРОФИЛЬ / LAUNCH BAY</span>
            <span className={cx('hero-status', running && 'is-running')}>
              <span className={cx('led', running ? 'led-amber' : 'led-acid')} />
              {running ? 'В ИГРЕ' : activeInstance ? 'ГОТОВ К ЗАПУСКУ' : 'ПРОФИЛЬ НЕ ВЫБРАН'}
            </span>
          </div>

          {activeInstance ? (
            <>
              <h1
                className={cx(
                  'hero-instance-name',
                  activeName.length > 14 && 'is-long',
                  activeName.length > 22 && 'is-xlong'
                )}
              >
                {activeName}
              </h1>
              <div className="hero-chips">
                <Tag tone="acid">MINECRAFT {activeInstance.mcVersion}</Tag>
                <Tag tone="default">{loaderLabel(activeInstance.loader).toUpperCase()}</Tag>
                {activeInstance.loaderVersion && (
                  <Tag tone="muted">{activeInstance.loaderVersion}</Tag>
                )}
                <Tag tone="amber">{Math.round(activeInstance.ramMb / 1024)} GB RAM</Tag>
                {activeInstance.modpack && <Tag tone="purple">MODPACK</Tag>}
              </div>
              <p className="hero-description">
                {activeInstance.modpack
                  ? `Сборка из Modrinth: ${activeInstance.modpack.title} · версия ${activeInstance.modpack.versionNumber}. Всё готово — осталось нажать «Запустить».`
                  : activeInstance.mods.length
                    ? `Ваша сборка с ${activeInstance.mods.length} установленными файлами. ${enabledMods} активно. Проверьте моды и отправляйтесь в игру.`
                    : 'Чистая сборка без модов. Идеально для ванильной игры, эксперимента или первого знакомства с миром.'}
              </p>

              <div className="hero-launch-row">
                <button
                  type="button"
                  className={cx('launch-button', (running || preparing) && 'is-engaged')}
                  onClick={handleLaunch}
                >
                  <span className="launch-button-icon">
                    {running ? <Terminal size={22} /> : <Play size={22} fill="currentColor" />}
                  </span>
                  <span className="launch-button-text">
                    <strong>
                      {running
                        ? 'ИГРА ЗАПУЩЕНА'
                        : preparing
                          ? 'ИДЁТ ЗАПУСК'
                          : launchError
                            ? 'ПОВТОРИТЬ ЗАПУСК'
                            : 'ЗАПУСТИТЬ ИГРУ'}
                    </strong>
                    <span>
                      {running
                        ? 'Открыть журнал сессии'
                        : preparing
                          ? launch.message || 'Подготовка файлов…'
                          : activeAccount
                            ? `Играть как ${activeAccount.username}`
                            : 'Аккаунт не подключён'}
                    </span>
                  </span>
                  <span className="launch-button-hotkey">⏎</span>
                </button>

                {running ? (
                  <button type="button" className="btn btn-danger btn-stop" onClick={() => void killGame()}>
                    <Square size={14} />
                    СТОП
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={openConsole}>
                    <Terminal size={15} />
                    ЛОГИ
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={handleFolder}>
                  <FolderOpen size={15} />
                  ПАПКА
                </button>
              </div>

              {(preparing || running || launchError) && (
                <div className={cx('hero-progress', launchError && 'is-error')}>
                  <div className="hero-progress-head">
                    <span>{launchError || launch.message || 'Запуск…'}</span>
                    {!launchError && <em>{Math.round(launch.progress)}%</em>}
                  </div>
                  <ProgressBar
                    value={launchError ? 100 : launch.progress}
                    tone={launchError ? 'red' : running ? 'cyan' : 'acid'}
                    indeterminate={preparing && launch.progress <= 0}
                  />
                </div>
              )}

              <div className="hero-stats">
                <div className="hero-stat">
                  <span className="hero-stat-label">НАИГРАНО</span>
                  <strong>{formatPlaytime(activeInstance.totalPlayMs)}</strong>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">ПОСЛЕДНИЙ ЗАПУСК</span>
                  <strong>{relativeTime(activeInstance.lastPlayedAt)}</strong>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">МОДЫ</span>
                  <strong>
                    {enabledMods}
                    <small> / {activeInstance.mods.length}</small>
                  </strong>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">СОЗДАНА</span>
                  <strong>{formatDate(activeInstance.createdAt)}</strong>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              className="hero-empty"
              icon={<Layers3 size={40} />}
              title="СОЗДАЙТЕ ПЕРВУЮ СБОРКУ"
              description="Выберите версию Minecraft и загрузчик модов — лаунчер скачает всё необходимое и подготовит запуск."
              action={
                <button type="button" className="btn btn-primary" onClick={() => onNavigate('instances')}>
                  <Zap size={15} /> СОЗДАТЬ СБОРКУ
                </button>
              }
            />
          )}
        </div>

        <aside className="hero-player panel">
          <div className="hero-player-top">
            <span className="hero-kicker">PLAYER / PREVIEW</span>
            <span className={cx('led', activeAccount ? 'led-acid' : 'led-dim')} />
          </div>
          <div className="hero-player-stage">
            <span className="hero-stage-grid" aria-hidden="true" />
            <span className="hero-stage-bracket bracket-tl" aria-hidden="true" />
            <span className="hero-stage-bracket bracket-tr" aria-hidden="true" />
            <span className="hero-stage-bracket bracket-bl" aria-hidden="true" />
            <span className="hero-stage-bracket bracket-br" aria-hidden="true" />
            <BlockIcon type="diamond" size={24} className="float-block float-block-a" />
            <BlockIcon type="gold" size={18} className="float-block float-block-b" />
            <BlockIcon type="redstone" size={15} className="float-block float-block-c" />
            <SkinViewer account={activeAccount} className="home-skin-viewer" />
            <span className="hero-stage-label">RENDER / 3D</span>
          </div>
          <div className="hero-player-info">
            <SkinHead account={activeAccount} size={38} />
            <div className="hero-player-name">
              <strong>{activeAccount ? activeAccount.username : 'ГОСТЬ'}</strong>
              <span>
                {activeAccount
                  ? activeAccount.type === 'microsoft'
                    ? 'MICROSOFT LICENSE'
                    : 'OFFLINE PROFILE'
                  : 'АККАУНТ НЕ ПОДКЛЮЧЁН'}
              </span>
            </div>
            <button
              type="button"
              className="hero-player-switch"
              onClick={() => onNavigate('accounts')}
              title="Управление аккаунтами"
            >
              <Users size={14} />
            </button>
          </div>
          <div className="hero-player-foot">
            <span>{state?.accounts.length || 0} АККАУНТ(ОВ)</span>
            <span>{activeAccount?.type === 'microsoft' ? <ShieldCheck size={12} /> : <Gamepad2 size={12} />}</span>
            <span>SKIN v2</span>
          </div>
        </aside>
      </section>

      {state && state.instances.length > 0 && (
        <section className="home-instances">
          <div className="section-heading">
            <div>
              <span className="page-kicker">// БИБЛИОТЕКА</span>
              <h2>ВАШИ СБОРКИ</h2>
            </div>
            <button type="button" className="link-button" onClick={() => onNavigate('instances')}>
              ВСЕ СБОРКИ <ArrowRight size={14} />
            </button>
          </div>
          <div className="instance-strip">
            {state.instances.slice(0, 4).map((instance) => {
              const active = instance.id === activeInstance?.id;
              const mods = instance.mods.filter((mod) => mod.enabled).length;
              return (
                <button
                  key={instance.id}
                  type="button"
                  data-instance-id={instance.id}
                  className={cx('instance-strip-card', active && 'is-active')}
                  onClick={() => {
                    void selectInstance(instance.id);
                  }}
                  onDoubleClick={() => {
                    void selectInstance(instance.id).then(() => launchGame(instance.id));
                  }}
                >
                  <span className="instance-strip-icon">
                    <BlockIcon type={instance.icon} size={42} />
                  </span>
                  <span className="instance-strip-body">
                    <strong>{instanceDisplayName(instance)}</strong>
                    <span>
                      {instance.mcVersion} · {loaderLabel(instance.loader)}
                    </span>
                    <span className="instance-strip-meta">
                      <Clock size={10} /> {formatPlaytime(instance.totalPlayMs)}
                      <em>·</em>
                      <Package size={10} /> {mods}
                    </span>
                  </span>
                  {active ? (
                    <span className="instance-strip-active">
                      <span className="led led-acid" /> ACTIVE
                    </span>
                  ) : (
                    <span className="instance-strip-pick">ВЫБРАТЬ</span>
                  )}
                </button>
              );
            })}
            <button type="button" className="instance-strip-add" onClick={() => onNavigate('instances')}>
              <span>+</span>
              <em>НОВАЯ СБОРКА</em>
            </button>
          </div>
        </section>
      )}

      <div className="home-lower">
        <section className="panel home-system">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">// SYSTEM MONITOR</span>
              <h2>РЕСУРСЫ</h2>
            </div>
            <Cpu size={16} className="panel-heading-icon" />
          </div>

          <div className="meter-row">
            <div className="meter-label">
              <span>
                <MemoryStick size={13} /> ВЫДЕЛЕНО СБОРКЕ
              </span>
              <strong>{(usedMemory / 1024).toFixed(1)} GB</strong>
            </div>
            <div className="meter-track">
              <span style={{ width: `${Math.max(8, memoryPercent)}%` }} />
            </div>
            <div className="meter-foot">
              <span>ИЗ {Math.round(totalMemory / 1024)} GB ВСЕГО</span>
              <span>{Math.round(memoryPercent)}%</span>
            </div>
          </div>

          <div className="meter-row">
            <div className="meter-label">
              <span>
                <HardDrive size={13} /> СВОБОДНАЯ ПАМЯТЬ
              </span>
              <strong>{(freeMemory / 1024).toFixed(1)} GB</strong>
            </div>
            <div className="meter-track meter-track-cyan">
              <span style={{ width: `${Math.max(4, freePercent)}%` }} />
            </div>
            <div className="meter-foot">
              <span>ФИЗИЧЕСКАЯ ПАМЯТЬ СИСТЕМЫ</span>
              <span>{Math.round(freePercent)}% FREE</span>
            </div>
          </div>

          <div className="system-grid">
            <div>
              <span>CPU</span>
              <strong>{systemInfo ? `${systemInfo.cpus} ПОТОКОВ` : '—'}</strong>
            </div>
            <div>
              <span>JAVA</span>
              <strong>{selectedJava ? `${selectedJava.major} · ${selectedJava.vendor || 'JAVA'}` : 'НЕ НАЙДЕНА'}</strong>
            </div>
            <div>
              <span>ПЛАТФОРМА</span>
              <strong>{systemInfo ? `${systemInfo.platform} / ${systemInfo.arch}` : '—'}</strong>
            </div>
          </div>
        </section>

        <section className="panel home-ready">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">// PRE-FLIGHT CHECK</span>
              <h2>ГОТОВНОСТЬ</h2>
            </div>
            <ShieldCheck size={16} className="panel-heading-icon" />
          </div>
          <div className="check-list">
            <button type="button" className="check-row" onClick={() => onNavigate('accounts')}>
              <span className={cx('check-led', activeAccount ? 'ok' : 'warn')} />
              <span>
                <strong>АККАУНТ MINECRAFT</strong>
                <em>{activeAccount ? activeAccount.username : 'Не подключён'}</em>
              </span>
              {activeAccount ? <span className="check-status">OK</span> : <span className="check-action">ВОЙТИ →</span>}
            </button>
            <button type="button" className="check-row" onClick={() => onNavigate('instances')}>
              <span className={cx('check-led', activeInstance ? 'ok' : 'warn')} />
              <span>
                <strong>СБОРКА</strong>
                <em>{activeInstance ? `${activeName} · ${activeInstance.mcVersion}` : 'Не создана'}</em>
              </span>
              {activeInstance ? <span className="check-status">OK</span> : <span className="check-action">СОЗДАТЬ →</span>}
            </button>
            <button type="button" className="check-row" onClick={() => onNavigate('settings')}>
              <span className={cx('check-led', selectedJava ? 'ok' : 'warn')} />
              <span>
                <strong>JAVA RUNTIME</strong>
                <em>{selectedJava ? `Java ${selectedJava.version}` : 'Будет скачана при запуске'}</em>
              </span>
              {selectedJava ? <span className="check-status">OK</span> : <span className="check-action">НАСТРОЙКИ →</span>}
            </button>
            <button type="button" className="check-row" onClick={() => onNavigate('catalog')}>
              <span className={cx('check-led', trendingError ? 'warn' : 'ok')} />
              <span>
                <strong>MODRINTH API</strong>
                <em>{trendingError ? 'Нет соединения' : 'Соединение установлено'}</em>
              </span>
              <span className="check-status">{trendingError ? 'ERR' : 'OK'}</span>
            </button>
          </div>
          <div className="ready-tip">
            <Zap size={14} />
            <p>
              <strong>СОВЕТ:</strong> дважды кликните по карточке сборки ниже, чтобы выбрать её и сразу
              запустить.
            </p>
          </div>
        </section>
      </div>

      <section className="panel home-trending">
        <div className="panel-heading">
          <div>
            <span className="page-kicker">// MODRINTH / TRENDING</span>
            <h2>ПОПУЛЯРНОЕ СЕЙЧАС</h2>
          </div>
          <div className="panel-heading-actions">
            <button type="button" className="link-button" onClick={() => onNavigate('catalog')}>
              КАТАЛОГ <ArrowRight size={14} />
            </button>
            <button type="button" className="icon-button" title="Обновить" onClick={() => onNavigate('catalog')}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {trendingLoading ? (
          <div className="trending-loading">
            {[0, 1, 2, 3].map((index) => (
              <div className="trending-skeleton" key={index}>
                <span />
                <div>
                  <em />
                  <em />
                </div>
              </div>
            ))}
          </div>
        ) : trendingError ? (
          <div className="trending-error">
            <ExternalLink size={16} />
            <span>Не удалось загрузить ленту Modrinth. Проверьте соединение и откройте каталог вручную.</span>
          </div>
        ) : (
          <div className="trending-grid">
            {trending.map((hit) => (
              <button
                key={hit.project_id}
                type="button"
                className="trending-card"
                onClick={() => onOpenProject(hit.project_id)}
              >
                <span className="trending-icon">
                  {hit.icon_url ? <img src={hit.icon_url} alt="" loading="lazy" /> : <Package size={22} />}
                </span>
                <span className="trending-info">
                  <strong>{hit.title}</strong>
                  <span>{hit.author}</span>
                  <span className="trending-meta">
                    <Download size={10} /> {formatDownloads(hit.downloads)}
                    <em>·</em>
                    <Gamepad2 size={10} /> {hit.versions[hit.versions.length - 1] || '—'}
                  </span>
                </span>
                <span className="trending-open">→</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
