import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Gamepad2,
  Layers3,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users
} from 'lucide-react';
import { Account } from '../types';
import { useLauncher } from '../state/LauncherContext';
import { api } from '../lib/api';
import { cx, formatDate, truncateMiddle } from '../lib/format';
import { BlockIcon, MicrosoftMark } from '../components/ui/BlockIcon';
import { SkinHead } from '../components/ui/SkinHead';
import { SkinViewer } from '../components/ui/SkinViewer';
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  ProgressBar,
  Tag
} from '../components/ui/Common';

const offlinePattern = /^[A-Za-z0-9_]{3,16}$/;

export const AccountsPage: React.FC = () => {
  const {
    state,
    activeAccount,
    loginMicrosoft,
    addOfflineAccount,
    selectAccount,
    removeAccount,
    uploadSkin,
    refresh,
    showToast
  } = useLauncher();

  const [msLoading, setMsLoading] = useState(false);
  const [offlineName, setOfflineName] = useState('');
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [skinBusy, setSkinBusy] = useState<'classic' | 'slim' | null>(null);
  const [refreshId, setRefreshId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Account | null>(null);

  const accounts = state?.accounts || [];
  const otherAccounts = useMemo(
    () => accounts.filter((account) => account.id !== activeAccount?.id),
    [accounts, activeAccount?.id]
  );

  const handleMicrosoft = async () => {
    if (msLoading) return;
    setMsLoading(true);
    try {
      await loginMicrosoft();
    } finally {
      setMsLoading(false);
    }
  };

  const handleOffline = async (event: React.FormEvent) => {
    event.preventDefault();
    setOfflineError(null);
    const name = offlineName.trim();
    if (!offlinePattern.test(name)) {
      setOfflineError('3–16 символов: латинские буквы, цифры и «_».');
      return;
    }
    setOfflineLoading(true);
    try {
      const account = await addOfflineAccount(name);
      if (account) {
        setOfflineName('');
      }
    } finally {
      setOfflineLoading(false);
    }
  };

  const handleUploadSkin = async (variant: 'classic' | 'slim') => {
    if (!activeAccount || skinBusy) return;
    setSkinBusy(variant);
    try {
      await uploadSkin(activeAccount.id, variant);
    } finally {
      setSkinBusy(null);
    }
  };

  const handleRefresh = async (account: Account) => {
    setRefreshId(account.id);
    try {
      await api.auth.refresh(account.id);
      await refresh();
      showToast(`Токен ${account.username} обновлён.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setRefreshId(null);
    }
  };

  const copyUuid = async (uuid: string) => {
    try {
      await navigator.clipboard.writeText(uuid);
      showToast('UUID скопирован.', 'success');
    } catch {
      showToast('Не удалось скопировать UUID.', 'error');
    }
  };

  return (
    <div className="page accounts-page">
      <PageHeader
        kicker="// IDENTITY MODULE"
        title="АККАУНТЫ"
        description="Лицензия Microsoft для официальных серверов или офлайн-профиль для локальной игры и разработки."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void handleMicrosoft()} disabled={msLoading}>
            {msLoading ? <Loader2 size={15} className="spin" /> : <MicrosoftMark size={15} />}
            {msLoading ? 'ОЖИДАНИЕ ВХОДА…' : 'ВОЙТИ ЧЕРЕЗ MICROSOFT'}
          </button>
        }
      />

      <div className="account-hero">
        <section className="account-showcase panel">
          <div className="account-showcase-top">
            <span className="page-kicker">// ACTIVE IDENTITY</span>
            <span className={cx('led', activeAccount ? 'led-acid' : 'led-dim')} />
          </div>
          {activeAccount ? (
            <>
              <div className="account-showcase-stage">
                <span className="account-stage-grid" aria-hidden="true" />
                <span className="account-stage-tag">SKIN / 3D</span>
                <BlockIcon type="ender" size={20} className="float-block float-block-a" />
                <BlockIcon type="gold" size={16} className="float-block float-block-c" />
                <SkinViewer account={activeAccount} className="account-skin-viewer" />
              </div>
              <div className="account-showcase-identity">
                <SkinHead account={activeAccount} size={44} />
                <div>
                  <h2>{activeAccount.username}</h2>
                  <div className="account-showcase-badges">
                    <Tag tone={activeAccount.type === 'microsoft' ? 'acid' : 'cyan'}>
                      {activeAccount.type === 'microsoft' ? 'MICROSOFT LICENSE' : 'OFFLINE PROFILE'}
                    </Tag>
                    <Tag tone={activeAccount.slimArms ? 'purple' : 'muted'}>
                      {activeAccount.slimArms ? 'SLIM' : 'CLASSIC'}
                    </Tag>
                  </div>
                </div>
              </div>
              <div className="account-showcase-data">
                <div>
                  <span>UUID</span>
                  <button type="button" onClick={() => void copyUuid(activeAccount.uuid)} title="Скопировать UUID">
                    {truncateMiddle(activeAccount.uuid, 24)} <Copy size={11} />
                  </button>
                </div>
                <div>
                  <span>ДОБАВЛЕН</span>
                  <strong>{formatDate(activeAccount.addedAt)}</strong>
                </div>
                <div>
                  <span>ПОСЛЕДНИЙ ВХОД</span>
                  <strong>{formatDate(activeAccount.lastLoginAt)}</strong>
                </div>
              </div>
              <div className="account-showcase-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={skinBusy !== null}
                  onClick={() => void handleUploadSkin('classic')}
                >
                  {skinBusy === 'classic' ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
                  СКИН 4PX
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={skinBusy !== null}
                  onClick={() => void handleUploadSkin('slim')}
                >
                  {skinBusy === 'slim' ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
                  СКИН SLIM
                </button>
                {activeAccount.type === 'microsoft' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={refreshId === activeAccount.id}
                    onClick={() => void handleRefresh(activeAccount)}
                  >
                    {refreshId === activeAccount.id ? (
                      <Loader2 size={12} className="spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    ОБНОВИТЬ ТОКЕН
                  </button>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              className="account-showcase-empty"
              icon={<User size={40} />}
              title="ПРОФИЛЬ НЕ ВЫБРАН"
              description="Подключите Microsoft-лицензию или создайте офлайн-аккаунт, чтобы начать играть."
            />
          )}
        </section>

        <div className="account-access">
          <section className="panel account-ms-panel">
            <div className="account-ms-head">
              <MicrosoftMark size={22} />
              <div>
                <span className="page-kicker">// MICROSOFT OAUTH</span>
                <h3>ОФИЦИАЛЬНАЯ ЛИЦЕНЗИЯ</h3>
              </div>
            </div>
            <p>
              Вход через Microsoft открывает доступ к официальным серверам, скинам и достижениям. Браузер
              откроется автоматически — лаунчер дождётся ответа.
            </p>
            <div className="oauth-steps">
              <div>
                <span>01</span>
                <em>Вход в браузере</em>
              </div>
              <div>
                <span>02</span>
                <em>Xbox Live</em>
              </div>
              <div>
                <span>03</span>
                <em>Minecraft API</em>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => void handleMicrosoft()}
              disabled={msLoading}
            >
              {msLoading ? <Loader2 size={15} className="spin" /> : <LogIn size={15} />}
              {msLoading ? 'ЗАВЕРШИТЕ ВХОД В БРАУЗЕРЕ…' : 'ПОДКЛЮЧИТЬ MICROSOFT'}
            </button>
            <div className="account-security">
              <ShieldCheck size={13} />
              Токены хранятся локально и никогда не передаются третьим лицам.
            </div>
          </section>

          <section className="panel account-offline-panel">
            <div className="account-offline-head">
              <Gamepad2 size={19} />
              <div>
                <span className="page-kicker">// LOCAL PROFILE</span>
                <h3>ОФЛАЙН-АККАУНТ</h3>
              </div>
            </div>
            <p>
              Профиль без лицензии для одиночной игры, тестов модов и локальных серверов. Ник можно изменить,
              создав новый профиль.
            </p>
            <form className="offline-form" onSubmit={(event) => void handleOffline(event)}>
              <label className="field">
                <span className="field-label">ИГРОВОЙ НИК</span>
                <div className="offline-input-row">
                  <span className="offline-prefix">@</span>
                  <input
                    value={offlineName}
                    maxLength={16}
                    onChange={(event) => {
                      setOfflineName(event.target.value);
                      setOfflineError(null);
                    }}
                    placeholder="RetroSteve"
                    spellCheck={false}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={offlineLoading}>
                    {offlineLoading ? <Loader2 size={12} className="spin" /> : <UserPlus size={12} />}
                    СОЗДАТЬ
                  </button>
                </div>
              </label>
              {offlineError && (
                <div className="form-error">
                  <AlertTriangle size={13} /> {offlineError}
                </div>
              )}
              <span className="field-hint">
                3–16 символов: A–Z, 0–9 и «_». Офлайн-профиль не подходит для серверов с проверкой лицензии.
              </span>
            </form>
          </section>
        </div>
      </div>

      <section className="accounts-section">
        <div className="section-heading">
          <div>
            <span className="page-kicker">// SAVED PROFILES</span>
            <h2>СОХРАНЁННЫЕ АККАУНТЫ</h2>
          </div>
          <span className="section-heading-count">{accounts.length} / 8</span>
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            className="accounts-empty"
            icon={<Users size={38} />}
            title="АККАУНТОВ ПОКА НЕТ"
            description="Подключите Microsoft-лицензию или создайте локальный профиль — это займёт несколько секунд."
          />
        ) : (
          <div className="accounts-grid">
            {accounts.map((account) => {
              const active = account.id === activeAccount?.id;
              return (
                <article key={account.id} className={cx('account-card', active && 'is-active')}>
                  <div className="account-card-top">
                    <SkinHead account={account} size={42} />
                    <div className="account-card-name">
                      <strong>{account.username}</strong>
                      <span>{truncateMiddle(account.uuid, 22)}</span>
                    </div>
                    {active && (
                      <span className="account-card-active">
                        <span className="led led-acid" /> АКТИВЕН
                      </span>
                    )}
                  </div>
                  <div className="account-card-meta">
                    <Tag tone={account.type === 'microsoft' ? 'acid' : 'cyan'}>
                      {account.type === 'microsoft' ? 'MICROSOFT' : 'OFFLINE'}
                    </Tag>
                    <span>добавлен {formatDate(account.addedAt)}</span>
                  </div>
                  <div className="account-card-actions">
                    {!active && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => void selectAccount(account.id)}
                      >
                        <Check size={11} /> ВЫБРАТЬ
                      </button>
                    )}
                    {account.type === 'microsoft' && (
                      <button
                        type="button"
                        className="icon-button"
                        title="Обновить токен"
                        disabled={refreshId === account.id}
                        onClick={() => void handleRefresh(account)}
                      >
                        {refreshId === account.id ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <RefreshCw size={13} />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button icon-button-danger"
                      title="Удалить аккаунт"
                      onClick={() => setRemoveTarget(account)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </article>
              );
            })}
            <button
              type="button"
              className="account-card account-card-add"
              onClick={() => void handleMicrosoft()}
              disabled={msLoading}
            >
              <span className="account-card-add-icon">
                <MicrosoftMark size={22} />
              </span>
              <strong>ДОБАВИТЬ MICROSOFT</strong>
              <span>Новый лицензионный профиль</span>
            </button>
          </div>
        )}
      </section>

      {otherAccounts.length > 0 && activeAccount && (
        <div className="accounts-note">
          <Layers3 size={14} />
          <span>
            Активная лицензия используется для всех сборок. Переключение аккаунта не влияет на файлы сборок и
            сохранения.
          </span>
          <button type="button" className="link-button" onClick={() => api.app.openExternal('https://www.minecraft.net')}>
            MINECRAFT.NET <ExternalLink size={11} />
          </button>
        </div>
      )}

      {removeTarget && (
        <ConfirmDialog
          title="УДАЛИТЬ АККАУНТ?"
          message={`Профиль «${removeTarget.username}» будет удалён из лаунчера. Файлы сборок и сохранения останутся на месте.`}
          confirmLabel="УДАЛИТЬ ПРОФИЛЬ"
          danger
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => {
            const target = removeTarget;
            setRemoveTarget(null);
            void removeAccount(target.id);
          }}
        />
      )}
    </div>
  );
};
