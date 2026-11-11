import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Info,
  MemoryStick,
  Monitor,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Terminal
} from 'lucide-react';
import { ThemeId, UpdateInfo } from '../types';
import { useLauncher } from '../state/LauncherContext';
import { api } from '../lib/api';
import { cx, formatBytes } from '../lib/format';
import { PixelLogoTiles } from '../components/ui/BlockIcon';
import { PageHeader, PixelSwitch, Tag } from '../components/ui/Common';

const THEMES: { id: ThemeId; name: string; hint: string; accent: string; bg: string }[] = [
  { id: 'acid', name: 'ACID', hint: 'Кислотный зелёный', accent: '#c6f95e', bg: '#0b0e08' },
  { id: 'amber', name: 'AMBER', hint: 'Тёплый янтарь', accent: '#ffb454', bg: '#0d0905' },
  { id: 'cyan', name: 'CYAN', hint: 'Холодный неон', accent: '#62e6ff', bg: '#061014' },
  { id: 'magenta', name: 'MAGENTA', hint: 'Синтвейв', accent: '#ff6fd8', bg: '#100710' },
  { id: 'mono', name: 'MONO', hint: 'Монохром', accent: '#f2ead2', bg: '#0b0b0b' }
];

export const SettingsPage: React.FC = () => {
  const {
    state,
    javaList,
    systemInfo,
    updateSettings,
    refreshJava,
    chooseJava,
    showToast
  } = useLauncher();

  const settings = state?.settings;
  const [ramDraft, setRamDraft] = useState(settings?.defaultRamMb || 4096);
  const [refreshingJava, setRefreshingJava] = useState(false);
  const [choosingJava, setChoosingJava] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (settings?.defaultRamMb != null) setRamDraft(settings.defaultRamMb);
  }, [settings?.defaultRamMb]);

  useEffect(() => {
    if (!settings) return;
    if (ramDraft === settings.defaultRamMb) return;
    const timer = window.setTimeout(() => {
      void updateSettings({ defaultRamMb: ramDraft });
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ramDraft]);

  const maxRam = useMemo(() => {
    if (!systemInfo) return 16384;
    return Math.max(4096, Math.min(32768, Math.floor(systemInfo.totalMemMb / 1024) * 1024));
  }, [systemInfo]);

  const selectedJava = javaList.find((entry) => entry.path === settings?.javaPath);

  const handleRefreshJava = async () => {
    setRefreshingJava(true);
    try {
      await refreshJava();
      showToast('Список Java обновлён.', 'success');
    } finally {
      setRefreshingJava(false);
    }
  };

  const handleChooseJava = async () => {
    setChoosingJava(true);
    try {
      await chooseJava();
    } finally {
      setChoosingJava(false);
    }
  };

  const handleOpenRoot = async () => {
    try {
      await api.state.openGameRoot();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} скопирован.`, 'success');
    } catch {
      showToast('Не удалось скопировать.', 'error');
    }
  };

  const toggle = async (key: keyof NonNullable<typeof settings>, value: boolean) => {
    const ok = await updateSettings({ [key]: value } as never);
    if (!ok) return;
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const info = await api.app.checkUpdates();
      setUpdateInfo(info);
      if (info.available) {
        showToast(`Доступно обновление ${info.version}.`, 'info');
      } else {
        showToast('Установлена последняя версия.', 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo?.url || installingUpdate) return;
    setInstallingUpdate(true);
    try {
      await api.app.installUpdate(updateInfo.url);
    } catch (error) {
      setInstallingUpdate(false);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  return (
    <div className="page settings-page">
      <PageHeader
        kicker="// CONTROL PANEL"
        title="НАСТРОЙКИ"
        description="Java, память, интерфейс и пути к данным. Все изменения сохраняются автоматически."
        actions={
          <button type="button" className="btn btn-ghost" onClick={() => void handleOpenRoot()}>
            <FolderOpen size={14} /> ОТКРЫТЬ ПАПКУ ИГРЫ
          </button>
        }
      />

      <div className="settings-layout">
        <section className="panel settings-panel settings-java">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">// JAVA RUNTIME</span>
              <h2>JAVA</h2>
            </div>
            <Cpu size={17} className="panel-heading-icon" />
          </div>

          <div className="java-current">
            <div className="java-current-icon">
              <Terminal size={20} />
            </div>
            <div className="java-current-info">
              <span>АКТИВНЫЙ RUNTIME</span>
              <strong>
                {selectedJava
                  ? `Java ${selectedJava.version} · ${selectedJava.vendor || 'Unknown'}`
                  : settings?.javaPath
                    ? settings.javaPath
                    : 'Не выбрана — будет определена автоматически'}
              </strong>
              <em>{selectedJava?.path || settings?.javaPath || 'Auto-detect'}</em>
            </div>
            <Tag tone={selectedJava ? 'acid' : 'amber'}>{selectedJava ? 'OK' : 'AUTO'}</Tag>
          </div>

          <div className="java-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void handleChooseJava()} disabled={choosingJava}>
              {choosingJava ? <RefreshCw size={12} className="spin" /> : <FolderOpen size={12} />}
              ВЫБРАТЬ JAVA.EXE
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleRefreshJava()} disabled={refreshingJava}>
              <RefreshCw size={12} className={refreshingJava ? 'spin' : undefined} />
              ОБНОВИТЬ СПИСОК
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void updateSettings({ javaPath: '' })}
              disabled={!settings?.javaPath}
            >
              АВТО-ВЫБОР
            </button>
          </div>

          <div className="java-list">
            <div className="java-list-head">
              <span>ОБНАРУЖЕННЫЕ RUNTIME / {javaList.length}</span>
              <span>ВЕРСИЯ</span>
            </div>
            {javaList.length === 0 ? (
              <div className="java-empty">
                <Info size={14} />
                Java не найдена. Установите JDK 25 или включите автоматическую загрузку ниже.
              </div>
            ) : (
              javaList.map((entry) => {
                const active = entry.path === settings?.javaPath;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    className={cx('java-row', active && 'is-active')}
                    onClick={() => void updateSettings({ javaPath: entry.path })}
                  >
                    <span className={cx('java-radio', active && 'is-on')}>{active && <Check size={10} />}</span>
                    <span className="java-row-info">
                      <strong>
                        Java {entry.version} · {entry.vendor || 'Unknown'}
                      </strong>
                      <em>{entry.path}</em>
                    </span>
                    <Tag tone={entry.major >= 21 ? 'acid' : 'muted'}>JDK {entry.major}</Tag>
                  </button>
                );
              })
            )}
          </div>

          <div className="settings-switch-row">
            <div className="settings-switch-text">
              <strong>АВТОМАТИЧЕСКАЯ ЗАГРУЗКА JAVA</strong>
              <span>Скачивать Temurin JRE нужной версии при первом запуске сборки.</span>
            </div>
            <PixelSwitch
              checked={Boolean(settings?.autoDownloadJava)}
              onChange={(value) => void toggle('autoDownloadJava', value)}
              label="Автоматическая загрузка Java"
            />
          </div>

          <div className="java-note">
            <ShieldCheck size={13} />
            Minecraft 26.3 требует Java 25. Лаунчер проверит версию и предложит подходящий runtime.
          </div>
        </section>

        <section className="panel settings-panel settings-memory">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">// MEMORY</span>
              <h2>ПАМЯТЬ ПО УМОЛЧАНИЮ</h2>
            </div>
            <MemoryStick size={17} className="panel-heading-icon" />
          </div>
          <div className="settings-ram-value">
            <strong>{(ramDraft / 1024).toFixed(ramDraft % 1024 ? 1 : 0)}</strong>
            <span>GB</span>
          </div>
          <input
            type="range"
            className="ram-slider"
            min={1024}
            max={maxRam}
            step={512}
            value={ramDraft}
            onChange={(event) => setRamDraft(Number(event.target.value))}
          />
          <div className="ram-presets">
            {[2048, 4096, 6144, 8192, 12288, 16384].map((preset) => (
              <button
                key={preset}
                type="button"
                className={cx('ram-preset', ramDraft === preset && 'is-active')}
                onClick={() => setRamDraft(preset)}
              >
                {preset / 1024}G
              </button>
            ))}
          </div>
          <div className="settings-memory-stats">
            <div>
              <span>СИСТЕМА</span>
              <strong>{systemInfo ? formatBytes(systemInfo.totalMemMb * 1024 * 1024) : '—'}</strong>
            </div>
            <div>
              <span>СВОБОДНО</span>
              <strong>{systemInfo ? formatBytes(systemInfo.freeMemMb * 1024 * 1024) : '—'}</strong>
            </div>
            <div>
              <span>ВЫДЕЛЕНО</span>
              <strong>{formatBytes(ramDraft * 1024 * 1024)}</strong>
            </div>
          </div>
          <p className="field-hint">
            Значение применяется к новым сборкам. Для каждой сборки память можно переопределить отдельно.
          </p>
        </section>

        <section className="panel settings-panel settings-interface">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">// INTERFACE</span>
              <h2>ИНТЕРФЕЙС</h2>
            </div>
            <Monitor size={17} className="panel-heading-icon" />
          </div>

          <div className="settings-switch-row">
            <div className="settings-switch-text">
              <strong>CRT-ЭФФЕКТ</strong>
              <span>Сканлайны, свечение и лёгкая виньетка поверх интерфейса.</span>
            </div>
            <PixelSwitch
              checked={Boolean(settings?.crtEffect)}
              onChange={(value) => void toggle('crtEffect', value)}
              label="CRT-эффект"
            />
          </div>

          <div className="settings-switch-row">
            <div className="settings-switch-text">
              <strong>ОТКРЫВАТЬ КОНСОЛЬ ПРИ ЗАПУСКЕ</strong>
              <span>Показывать терминал с логами и прогрессом во время старта игры.</span>
            </div>
            <PixelSwitch
              checked={Boolean(settings?.showConsoleOnLaunch)}
              onChange={(value) => void toggle('showConsoleOnLaunch', value)}
              label="Консоль при запуске"
            />
          </div>

          <div className="settings-switch-row">
            <div className="settings-switch-text">
              <strong>ЗАКРЫВАТЬ ЛАУНЧЕР ПОСЛЕ СТАРТА</strong>
              <span>Свернуть лаунчер после успешного запуска игрового процесса.</span>
            </div>
            <PixelSwitch
              checked={Boolean(settings?.closeLauncherOnGameStart)}
              onChange={(value) => void toggle('closeLauncherOnGameStart', value)}
              label="Закрывать лаунчер при старте игры"
            />
          </div>

          <div className="settings-switch-row">
            <div className="settings-switch-text">
              <strong>СВОРАЧИВАТЬ В ТРЕЙ</strong>
              <span>Кнопка закрытия прячет лаунчер в системный трей, не завершая игру и загрузки.</span>
            </div>
            <PixelSwitch
              checked={Boolean(settings?.closeToTray)}
              onChange={(value) => void toggle('closeToTray', value)}
              label="Сворачивать в трей"
            />
          </div>

          <div className="settings-switch-row">
            <div className="settings-switch-text">
              <strong>DISCORD RICH PRESENCE</strong>
              <span>Показывать в Discord статус «в лаунчере» и текущий мир или сервер Minecraft.</span>
            </div>
            <PixelSwitch
              checked={Boolean(settings?.discordRpc)}
              onChange={(value) => void toggle('discordRpc', value)}
              label="Discord Rich Presence"
            />
          </div>

          {settings?.discordRpc && (
            <label className="field settings-discord-id">
              <span className="field-label">DISCORD APPLICATION ID (НЕОБЯЗАТЕЛЬНО)</span>
              <input
                value={settings?.discordClientId || ''}
                placeholder="1570081050732793906 — Sunspire"
                onChange={(event) => void updateSettings({ discordClientId: event.target.value })}
                spellCheck={false}
              />
              <span className="field-hint">
                Свой App ID из Discord Developer Portal даст собственное имя и иконку в статусе.
                Пустое поле использует стандартный Minecraft App ID.
              </span>
            </label>
          )}

          {settings?.discordRpc && (
            <div className="settings-discord-help">
              <p>
                Discord берёт иконку из приложения, к которому привязан App ID. Стандартный
                Minecraft ID показывает иконку Minecraft, а не Sunspire. Чтобы была ваша иконка,
                создайте своё приложение и загрузите в него logo.png.
              </p>
              <div className="settings-discord-help-actions">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void api.app.openLogo().catch(() => {})}
                >
                  ОТКРЫТЬ LOGO.PNG
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => api.app.openExternal('https://discord.com/developers/applications')}
                >
                  DISCORD DEVELOPER PORTAL <ExternalLink size={11} />
                </button>
              </div>
              <p className="settings-discord-steps">
                1. General Information → загрузите logo.png как App Icon.<br />
                2. Rich Presence → Assets → Add Image → logo.png, ключ ассета: <strong>logo</strong>.<br />
                3. Скопируйте Application ID и вставьте его в поле выше.
              </p>
            </div>
          )}

          <div className="settings-switch-row">
            <div className="settings-switch-text">
              <strong>АВТООБНОВЛЕНИЕ</strong>
              <span>Проверять наличие новой версии при запуске лаунчера.</span>
            </div>
            <PixelSwitch
              checked={Boolean(settings?.autoUpdate)}
              onChange={(value) => void toggle('autoUpdate', value)}
              label="Автообновление"
            />
          </div>
        </section>

        <section className="panel settings-panel settings-paths">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">// STORAGE</span>
              <h2>ФАЙЛЫ И ПУТИ</h2>
            </div>
            <Database size={17} className="panel-heading-icon" />
          </div>
          <div className="path-row">
            <div>
              <span>КОРНЕВАЯ ПАПКА ИГРЫ</span>
              <strong>{state?.gameRoot || '—'}</strong>
            </div>
            <button type="button" className="icon-button" onClick={() => copy(state?.gameRoot || '', 'Путь')} title="Скопировать">
              <Copy size={13} />
            </button>
            <button type="button" className="icon-button" onClick={() => void handleOpenRoot()} title="Открыть">
              <FolderOpen size={13} />
            </button>
          </div>
          <div className="path-row">
            <div>
              <span>ФАЙЛ СОСТОЯНИЯ</span>
              <strong>{state?.stateFile || '—'}</strong>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => copy(state?.stateFile || '', 'Путь')}
              title="Скопировать"
            >
              <Copy size={13} />
            </button>
          </div>
          <div className="path-row">
            <div>
              <span>ПАПКА СБОРОК</span>
              <strong>{state ? `${state.gameRoot}\\instances` : '—'}</strong>
            </div>
            <button type="button" className="icon-button" onClick={() => void handleOpenRoot()} title="Открыть">
              <FolderOpen size={13} />
            </button>
          </div>
          <p className="field-hint">
            Не удаляйте папку вручную во время игры. Лаунчер хранит там библиотеки, ассеты и профили.
          </p>
        </section>

        <section className="panel settings-panel settings-system">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">// SYSTEM</span>
              <h2>СИСТЕМА</h2>
            </div>
            <SlidersHorizontal size={17} className="panel-heading-icon" />
          </div>
          <div className="system-info-grid">
            <div>
              <span>SUNSPIRE</span>
              <strong>v1.0.0</strong>
            </div>
            <div>
              <span>RUST</span>
              <strong>{systemInfo?.electron || '—'}</strong>
            </div>
            <div>
              <span>WEBVIEW2</span>
              <strong>{systemInfo?.chrome || '—'}</strong>
            </div>
            <div>
              <span>TAURI</span>
              <strong>{systemInfo?.node || '—'}</strong>
            </div>
            <div>
              <span>ПЛАТФОРМА</span>
              <strong>
                {systemInfo ? `${systemInfo.platform} / ${systemInfo.arch}` : '—'}
              </strong>
            </div>
            <div>
              <span>CPU</span>
              <strong>{systemInfo ? `${systemInfo.cpus} потоков` : '—'}</strong>
            </div>
            <div>
              <span>RAM</span>
              <strong>{systemInfo ? formatBytes(systemInfo.totalMemMb * 1024 * 1024) : '—'}</strong>
            </div>
            <div>
              <span>USERDATA</span>
              <strong title={systemInfo?.userData}>{systemInfo?.userData ? 'LOCAL' : '—'}</strong>
            </div>
          </div>
          <div className="system-info-note">
            <Info size={13} />
            {systemInfo?.platform === 'browser'
              ? 'Веб-предпросмотр: системные данные демонстрационные, запуск игры недоступен.'
              : 'Полные системные данные доступны только в desktop-версии.'}
          </div>
        </section>

        <section className="panel settings-panel settings-themes">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">// COLOR SYSTEM</span>
              <h2>ТЕМЫ</h2>
            </div>
            <Palette size={17} className="panel-heading-icon" />
          </div>

          <div className="theme-grid">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={cx('theme-card', settings?.theme === theme.id && 'is-active')}
                onClick={() => void updateSettings({ theme: theme.id })}
              >
                <span
                  className="theme-card-swatch"
                  style={{ background: theme.bg, borderColor: theme.accent }}
                  aria-hidden="true"
                >
                  <span style={{ background: theme.accent }} />
                  <span style={{ background: theme.accent, opacity: 0.55 }} />
                  <span style={{ background: theme.accent, opacity: 0.25 }} />
                </span>
                <span className="theme-card-text">
                  <strong>{theme.name}</strong>
                  <em>{theme.hint}</em>
                </span>
                {settings?.theme === theme.id && <Check size={14} className="theme-card-check" />}
              </button>
            ))}
          </div>
          <p className="field-hint">
            Тема применяется мгновенно и сохраняется в профиле. Все экраны используют единую палитру.
          </p>
        </section>

        <section className="panel settings-panel settings-about">
          <div className="settings-about-head">
            <span className="settings-about-logo">
              <PixelLogoTiles size={40} />
            </span>
            <div>
              <span className="page-kicker">// ABOUT</span>
              <h2>SUNSPIRE</h2>
              <p>Лаунчер Minecraft с ретро-душой и настоящими технологиями.</p>
            </div>
          </div>
          <div className="settings-about-links">
            <button type="button" className="link-button" onClick={() => api.app.openExternal('https://modrinth.com')}>
              MODRINTH <ExternalLink size={11} />
            </button>
            <button type="button" className="link-button" onClick={() => api.app.openExternal('https://www.minecraft.net')}>
              MINECRAFT <ExternalLink size={11} />
            </button>
            <button type="button" className="link-button" onClick={() => api.app.openExternal('https://github.com')}>
              GITHUB <ExternalLink size={11} />
            </button>
          </div>

          <div className="settings-update-row">
            <div>
              <span className="page-kicker">// UPDATES</span>
              <strong>
                {updateInfo
                  ? updateInfo.available
                    ? `Доступна версия ${updateInfo.version}`
                    : `Версия ${updateInfo.version} актуальна`
                  : 'Проверить обновления вручную'}
              </strong>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void handleCheckUpdates()}
              disabled={checkingUpdate}
            >
              <RefreshCw size={13} className={checkingUpdate ? 'spin' : undefined} />
              {checkingUpdate ? 'ПРОВЕРКА…' : 'ПРОВЕРИТЬ'}
            </button>
            {updateInfo?.available && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleInstallUpdate()}
                disabled={installingUpdate}
              >
                <Download size={13} />
                {installingUpdate ? 'ЗАГРУЗКА…' : `УСТАНОВИТЬ ${updateInfo.version}`}
              </button>
            )}
          </div>
          <p className="settings-about-disclaimer">
            Sunspire — независимый проект. Не связан с Mojang, Microsoft или Modrinth. Minecraft является
            торговой маркой Mojang Studios. Все моды и ресурсы принадлежат их авторам.
          </p>
          <div className="settings-about-build">
            <span>BUILD 2026.11 / SS-OS 1.0.0</span>
            <span className="led led-acid" />
            <span>MADE FOR BLOCKS</span>
          </div>
        </section>
      </div>
    </div>
  );
};
