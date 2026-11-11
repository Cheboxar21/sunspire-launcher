import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  Gamepad2,
  Layers3,
  Loader2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
  Zap
} from 'lucide-react';
import { useLauncher } from '../state/LauncherContext';
import { api } from '../lib/api';
import { cx, instanceDisplayName, loaderLabel } from '../lib/format';
import { BlockIcon, MicrosoftMark, PixelLogoTiles } from '../components/ui/BlockIcon';
import { SkinHead } from '../components/ui/SkinHead';
import { ProgressBar, Tag } from '../components/ui/Common';

interface OnboardingProps {
  onDone: () => void;
  onNavigateHome: () => void;
}

const steps = [
  { id: 'welcome', index: '00', label: 'ПРИВЕТСТВИЕ' },
  { id: 'account', index: '01', label: 'АККАУНТ' },
  { id: 'build', index: '02', label: 'СБОРКА' },
  { id: 'ready', index: '03', label: 'ГОТОВО' }
];

export const Onboarding: React.FC<OnboardingProps> = ({ onDone, onNavigateHome }) => {
  const {
    state,
    activeAccount,
    activeInstance,
    loginMicrosoft,
    addOfflineAccount,
    createInstance,
    showToast
  } = useLauncher();

  const [step, setStep] = useState(0);
  const [msLoading, setMsLoading] = useState(false);
  const [offlineName, setOfflineName] = useState('');
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [release, setRelease] = useState('');
  const [fabricVersion, setFabricVersion] = useState('');
  const [preset, setPreset] = useState<'fabric' | 'vanilla'>('fabric');
  const [buildName, setBuildName] = useState('МОЯ СБОРКА');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const hasAccount = Boolean(state && state.accounts.length);
  const hasInstance = Boolean(state && state.instances.length);

  useEffect(() => {
    let cancelled = false;
    api.mc
      .latestRelease()
      .then((version) => {
        if (!cancelled) setRelease(version);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!release) return;
    let cancelled = false;
    api.mc
      .loaders(release)
      .then((loaders) => {
        if (cancelled) return;
        const list = loaders.fabric || [];
        const stable = list.find((entry) => entry.stable) || list[0];
        setFabricVersion(stable ? stable.version : '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [release]);

  const handleMicrosoft = async () => {
    if (msLoading) return;
    setMsLoading(true);
    try {
      const account = await loginMicrosoft();
      if (account) setStep(2);
    } finally {
      setMsLoading(false);
    }
  };

  const handleOffline = async (event: React.FormEvent) => {
    event.preventDefault();
    setOfflineError(null);
    const name = offlineName.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      setOfflineError('3–16 символов: латиница, цифры или «_».');
      return;
    }
    setOfflineLoading(true);
    try {
      const account = await addOfflineAccount(name);
      if (account) setStep(2);
    } finally {
      setOfflineLoading(false);
    }
  };

  const handleCreateBuild = async () => {
    if (!release || building) return;
    if (preset === 'fabric' && !fabricVersion) {
      setBuildError('Не удалось определить версию Fabric. Попробуйте Vanilla.');
      return;
    }
    setBuilding(true);
    setBuildError(null);
    try {
      await createInstance({
        name: buildName.trim() || `${preset === 'fabric' ? 'FABRIC' : 'VANILLA'} ${release}`,
        mcVersion: release,
        loader: preset,
        loaderVersion: preset === 'fabric' ? fabricVersion : '',
        ramMb: state?.settings.defaultRamMb || 4096,
        icon: preset === 'fabric' ? 'diamond' : 'grass'
      });
      setStep(3);
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : String(error));
    } finally {
      setBuilding(false);
    }
  };

  const finish = (goHome: boolean) => {
    onDone();
    if (goHome) onNavigateHome();
  };

  return (
    <div className="onboarding">
      <div className="onboarding-scan" aria-hidden="true" />
      <div className="onboarding-shell">
        <aside className="onboarding-brand">
          <div className="onboarding-brand-top">
            <PixelLogoTiles size={44} />
            <div>
              <strong>SUNSPIRE</strong>
              <span>MINECRAFT LAUNCHER</span>
            </div>
          </div>

          <div className="onboarding-brand-center">
            <span className="onboarding-brand-kicker">SYSTEM READY // FIRST BOOT</span>
            <h1>
              ВОЙДИ
              <br />В <em>БЛОКИ</em>
            </h1>
            <p>
              Настоящий лаунчер: лицензия Microsoft, офлайн-профили, Modrinth, Fabric, Forge и полный
              контроль над сборками.
            </p>
            <div className="onboarding-brand-tiles" aria-hidden="true">
              <BlockIcon type="grass" size={54} />
              <BlockIcon type="diamond" size={42} />
              <BlockIcon type="gold" size={34} />
              <BlockIcon type="redstone" size={27} />
            </div>
          </div>

          <div className="onboarding-brand-foot">
            <span>SS-OS 1.0.0</span>
            <span>© 2026 SUNSPIRE SYSTEMS</span>
            <span>BUILD 2026.11</span>
          </div>
        </aside>

        <section className="onboarding-wizard">
          <button type="button" className="onboarding-skip" onClick={() => finish(false)}>
            ПРОПУСТИТЬ <X size={13} />
          </button>

          <div className="onboarding-progress">
            {steps.map((item, index) => (
              <div
                key={item.id}
                className={cx(
                  'onboarding-progress-step',
                  index === step && 'is-active',
                  index < step && 'is-done'
                )}
              >
                <span className="onboarding-progress-index">
                  {index < step ? <Check size={10} /> : item.index}
                </span>
                <em>{item.label}</em>
              </div>
            ))}
            <ProgressBar value={(step / (steps.length - 1)) * 100} className="onboarding-bar" />
          </div>

          <div className="onboarding-content">
            {step === 0 && (
              <div className="onboarding-step">
                <span className="page-kicker">// WELCOME.CFG</span>
                <h2>ПРИВЕТ, ИГРОК.</h2>
                <p className="onboarding-lead">
                  Это Sunspire — лаунчер, который действительно запускает Minecraft. Без фейковых кнопок и
                  бутафории: настоящие файлы, настоящие аккаунты, настоящий Modrinth.
                </p>
                <div className="onboarding-features">
                  <div>
                    <span className="onboarding-feature-icon">
                      <ShieldCheck size={17} />
                    </span>
                    <strong>MICROSOFT LOGIN</strong>
                    <em>Официальная лицензия и скины</em>
                  </div>
                  <div>
                    <span className="onboarding-feature-icon">
                      <UserPlus size={17} />
                    </span>
                    <strong>OFFLINE</strong>
                    <em>Профиль по нику за секунду</em>
                  </div>
                  <div>
                    <span className="onboarding-feature-icon">
                      <Boxes size={17} />
                    </span>
                    <strong>MODRINTH</strong>
                    <em>Моды, шейдеры и модпаки</em>
                  </div>
                </div>

                <div className="onboarding-terminal">
                  <span className="onboarding-terminal-head">// BOOT DIAGNOSTICS</span>
                  <span>
                    <em>[ OK ]</em> Microsoft OAuth 2.0 / Xbox Live
                  </span>
                  <span>
                    <em>[ OK ]</em> Modrinth API v2 / моды, модпаки, шейдеры
                  </span>
                  <span>
                    <em>[ OK ]</em> Fabric / Quilt / Forge / NeoForge
                  </span>
                  <span>
                    <em>[ .. ]</em> Java 25 будет загружена при первом запуске
                    <i className="onboarding-terminal-cursor">█</i>
                  </span>
                </div>

                <button type="button" className="btn btn-primary onboarding-next" onClick={() => setStep(1)}>
                  НАЧАТЬ НАСТРОЙКУ <ArrowRight size={15} />
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="onboarding-step">
                <span className="page-kicker">// STEP 01 / IDENTITY</span>
                <h2>ПОДКЛЮЧИТЕ АККАУНТ</h2>
                <p className="onboarding-lead">
                  Для официальных серверов войдите через Microsoft. Для локальной игры достаточно офлайн-ника.
                </p>

                {hasAccount && activeAccount ? (
                  <div className="onboarding-connected">
                    <SkinHead account={activeAccount} size={52} />
                    <div>
                      <span>АККАУНТ УЖЕ ПОДКЛЮЧЁН</span>
                      <strong>{activeAccount.username}</strong>
                      <em>{activeAccount.type === 'microsoft' ? 'ЛИЦЕНЗИЯ MICROSOFT' : 'ОФЛАЙН-ПРОФИЛЬ'}</em>
                    </div>
                    <Tag tone="acid">OK</Tag>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="onboarding-ms-button"
                      onClick={() => void handleMicrosoft()}
                      disabled={msLoading}
                    >
                      <span className="onboarding-ms-mark">
                        <MicrosoftMark size={20} />
                      </span>
                      <span>
                        <strong>{msLoading ? 'ОЖИДАНИЕ БРАУЗЕРА…' : 'ВОЙТИ ЧЕРЕЗ MICROSOFT'}</strong>
                        <em>Лицензия, официальные серверы и скины</em>
                      </span>
                      {msLoading ? <Loader2 size={16} className="spin" /> : <ChevronRight size={16} />}
                    </button>

                    <div className="onboarding-or">
                      <span /> ИЛИ ОФЛАЙН <span />
                    </div>

                    <form className="onboarding-offline" onSubmit={(event) => void handleOffline(event)}>
                      <div className="offline-input-row onboarding-offline-row">
                        <span className="offline-prefix">@</span>
                        <input
                          value={offlineName}
                          onChange={(event) => {
                            setOfflineName(event.target.value);
                            setOfflineError(null);
                          }}
                          maxLength={16}
                          placeholder="Ваш ник"
                          spellCheck={false}
                        />
                        <button type="submit" className="btn btn-outline" disabled={offlineLoading}>
                          {offlineLoading ? <Loader2 size={13} className="spin" /> : <UserPlus size={13} />}
                          СОЗДАТЬ
                        </button>
                      </div>
                      {offlineError && <div className="form-error">{offlineError}</div>}
                      <span className="field-hint">3–16 символов: A–Z, 0–9, «_».</span>
                    </form>
                  </>
                )}

                <div className="onboarding-nav">
                  <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
                    <ArrowLeft size={14} /> НАЗАД
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setStep(2)}
                    disabled={!hasAccount}
                  >
                    ДАЛЕЕ <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="onboarding-step">
                <span className="page-kicker">// STEP 02 / INSTANCE</span>
                <h2>СОЗДАЙТЕ СБОРКУ</h2>
                <p className="onboarding-lead">
                  Выберите основу. Файлы скачаются при первом запуске, а прогресс будет виден в терминале.
                </p>

                {hasInstance && activeInstance ? (
                  <div className="onboarding-build-existing">
                    <BlockIcon type={activeInstance.icon} size={48} />
                    <div>
                      <span>СБОРКА УЖЕ СОЗДАНА</span>
                      <strong>{instanceDisplayName(activeInstance)}</strong>
                      <em>
                        {activeInstance.mcVersion} · {loaderLabel(activeInstance.loader)}
                        {activeInstance.loaderVersion ? ` ${activeInstance.loaderVersion}` : ''}
                      </em>
                    </div>
                    <Tag tone="acid">OK</Tag>
                  </div>
                ) : (
                  <>
                    <div className="onboarding-presets">
                      <button
                        type="button"
                        className={cx('onboarding-preset', preset === 'fabric' && 'is-active')}
                        onClick={() => setPreset('fabric')}
                      >
                        <span className="onboarding-preset-icon">
                          <Sparkles size={20} />
                        </span>
                        <strong>FABRIC</strong>
                        <em>Моды и оптимизация</em>
                        <span className="onboarding-preset-version">
                          {release ? `MC ${release}` : '…'}
                          {fabricVersion ? ` / ${fabricVersion}` : ''}
                        </span>
                        {preset === 'fabric' && <span className="onboarding-preset-check"><Check size={11} /></span>}
                      </button>
                      <button
                        type="button"
                        className={cx('onboarding-preset', preset === 'vanilla' && 'is-active')}
                        onClick={() => setPreset('vanilla')}
                      >
                        <span className="onboarding-preset-icon">
                          <BlockIcon type="grass" size={28} />
                        </span>
                        <strong>VANILLA</strong>
                        <em>Чистая игра без модов</em>
                        <span className="onboarding-preset-version">{release ? `MC ${release}` : '…'}</span>
                        {preset === 'vanilla' && <span className="onboarding-preset-check"><Check size={11} /></span>}
                      </button>
                    </div>

                    <label className="field">
                      <span className="field-label">НАЗВАНИЕ СБОРКИ</span>
                      <input
                        value={buildName}
                        maxLength={60}
                        onChange={(event) => setBuildName(event.target.value)}
                        placeholder="МОЯ СБОРКА"
                      />
                    </label>

                    {buildError && <div className="form-error">{buildError}</div>}

                    <button
                      type="button"
                      className="btn btn-primary onboarding-build-button"
                      onClick={() => void handleCreateBuild()}
                      disabled={building || !release}
                    >
                      {building ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                      {building ? 'СОЗДАНИЕ…' : 'СОЗДАТЬ СБОРКУ'}
                    </button>
                  </>
                )}

                <div className="onboarding-nav">
                  <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
                    <ArrowLeft size={14} /> НАЗАД
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setStep(3)}
                    disabled={!hasInstance}
                  >
                    ДАЛЕЕ <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="onboarding-step onboarding-ready">
                <span className="page-kicker">// ALL SYSTEMS GO</span>
                <h2>ВСЁ ГОТОВО.</h2>
                <p className="onboarding-lead">
                  Осталось нажать «Запустить». Первый старт может занять несколько минут — лаунчер скачает
                  библиотеки, ассеты и Java.
                </p>
                <div className="onboarding-summary">
                  <div>
                    <span className="onboarding-summary-icon">
                      <ShieldCheck size={16} />
                    </span>
                    <span>
                      <em>АККАУНТ</em>
                      <strong>{activeAccount?.username || 'Не подключён'}</strong>
                    </span>
                    {hasAccount ? <Check size={14} className="ok" /> : <X size={14} className="bad" />}
                  </div>
                  <div>
                    <span className="onboarding-summary-icon">
                      <Layers3 size={16} />
                    </span>
                    <span>
                      <em>СБОРКА</em>
                      <strong>{instanceDisplayName(activeInstance) || 'Не создана'}</strong>
                    </span>
                    {hasInstance ? <Check size={14} className="ok" /> : <X size={14} className="bad" />}
                  </div>
                  <div>
                    <span className="onboarding-summary-icon">
                      <Gamepad2 size={16} />
                    </span>
                    <span>
                      <em>ВЕРСИЯ</em>
                      <strong>
                        {activeInstance
                          ? `${activeInstance.mcVersion} · ${loaderLabel(activeInstance.loader)}`
                          : '—'}
                      </strong>
                    </span>
                    {hasInstance ? <Check size={14} className="ok" /> : <X size={14} className="bad" />}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary onboarding-next"
                  onClick={() => finish(true)}
                  disabled={!hasAccount || !hasInstance}
                >
                  ОТКРЫТЬ ЛАУНЧЕР <ArrowRight size={15} />
                </button>
                {(!hasAccount || !hasInstance) && (
                  <p className="onboarding-ready-note">
                    Можно пропустить и настроить всё позже в разделах «Аккаунты» и «Сборки».
                  </p>
                )}
                <button type="button" className="link-button onboarding-skip-link" onClick={() => finish(false)}>
                  ПРОПУСТИТЬ И ОТКРЫТЬ ЛАУНЧЕР
                </button>
              </div>
            )}
          </div>

          <div className="onboarding-wizard-foot">
            <span className="led led-acid" />
            <span>SECURE LOCAL SESSION</span>
            <span>NO TELEMETRY</span>
            <span>MODRINTH READY</span>
          </div>
        </section>
      </div>
    </div>
  );
};
