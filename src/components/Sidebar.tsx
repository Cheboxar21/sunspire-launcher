import React from 'react';
import {
  Boxes,
  Compass,
  Home,
  Layers3,
  Package,
  Palette,
  Settings,
  Sparkles,
  Users,
  Zap
} from 'lucide-react';
import { PageId, ProjectType } from '../types';
import { useLauncher } from '../state/LauncherContext';
import { cx, instanceDisplayName, loaderLabel } from '../lib/format';
import { BlockIcon, PixelLogoTiles } from './ui/BlockIcon';
import { SkinHead } from './ui/SkinHead';
import { Tag } from './ui/Common';

interface SidebarProps {
  page: PageId;
  catalogType: ProjectType;
  onNavigate: (page: PageId) => void;
  onOpenCatalog: (type: ProjectType) => void;
}

const navigation: { id: PageId; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'ГЛАВНАЯ', hint: 'F1', icon: <Home size={16} /> },
  { id: 'catalog', label: 'КАТАЛОГ', hint: 'F2', icon: <Compass size={16} /> },
  { id: 'instances', label: 'СБОРКИ', hint: 'F3', icon: <Layers3 size={16} /> },
  { id: 'accounts', label: 'АККАУНТЫ', hint: 'F4', icon: <Users size={16} /> },
  { id: 'settings', label: 'НАСТРОЙКИ', hint: 'F5', icon: <Settings size={16} /> }
];

const catalogShortcuts: { type: ProjectType; label: string; icon: React.ReactNode }[] = [
  { type: 'mod', label: 'МОДЫ', icon: <Package size={13} /> },
  { type: 'modpack', label: 'МОДПАКИ', icon: <Boxes size={13} /> },
  { type: 'resourcepack', label: 'РЕСУРСПАКИ', icon: <Palette size={13} /> },
  { type: 'shader', label: 'ШЕЙДЕРЫ', icon: <Sparkles size={13} /> }
];

export const Sidebar: React.FC<SidebarProps> = ({
  page,
  catalogType,
  onNavigate,
  onOpenCatalog
}) => {
  const { activeInstance, activeAccount, state, launch } = useLauncher();
  const enabledMods = activeInstance ? activeInstance.mods.filter((mod) => mod.enabled).length : 0;

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-brand-block">
          <span className="sidebar-logo">
            <PixelLogoTiles size={26} />
          </span>
          <div>
            <strong>SUNSPIRE</strong>
            <span>DECK / OS 1.0</span>
          </div>
        </div>
        <div className="sidebar-head-meta">
          <span className="led led-acid" />
          <span>READY</span>
          <span className="sidebar-head-clock">{launch.running ? 'IN GAME' : 'STANDBY'}</span>
        </div>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section-label">
          <span>ОСНОВНОЕ МЕНЮ</span>
          <span className="rule" />
        </div>
        <nav className="sidebar-nav" aria-label="Основная навигация">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx('nav-item', page === item.id && 'is-active')}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-item-arrow" aria-hidden="true">
                ▸
              </span>
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-label">{item.label}</span>
              <span className="nav-item-hint">{item.hint}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-section-label">
          <span>КАТАЛОГ MODRINTH</span>
          <span className="rule" />
        </div>
        <div className="sidebar-shortcuts">
          {catalogShortcuts.map((shortcut) => (
            <button
              key={shortcut.type}
              type="button"
              className={cx(
                'shortcut-item',
                page === 'catalog' && catalogType === shortcut.type && 'is-active'
              )}
              onClick={() => onOpenCatalog(shortcut.type)}
            >
              <span className="shortcut-icon">{shortcut.icon}</span>
              <span>{shortcut.label}</span>
              <span className="shortcut-arrow">→</span>
            </button>
          ))}
        </div>

        <div className="sidebar-section-label">
          <span>АКТИВНАЯ СБОРКА</span>
          <span className="rule" />
        </div>
        {activeInstance ? (
          <button
            type="button"
            className="sidebar-instance"
            data-instance-id={activeInstance.id}
            onClick={() => onNavigate('instances')}
          >
            <span className="sidebar-instance-icon">
              <BlockIcon type={activeInstance.icon} size={34} />
            </span>
            <span className="sidebar-instance-info">
              <strong>{instanceDisplayName(activeInstance)}</strong>
              <span>
                {activeInstance.mcVersion} · {loaderLabel(activeInstance.loader)}
              </span>
              <span className="sidebar-instance-meta">
                {enabledMods} мод{enabledMods === 1 ? '' : 'ов'} · {Math.round(activeInstance.ramMb / 1024)}G
              </span>
            </span>
            <span className="sidebar-instance-arrow">›</span>
          </button>
        ) : (
          <button type="button" className="sidebar-instance is-empty" onClick={() => onNavigate('instances')}>
            <span className="sidebar-instance-icon">
              <Zap size={22} />
            </span>
            <span className="sidebar-instance-info">
              <strong>НЕТ СБОРКИ</strong>
              <span>Создайте первую сборку</span>
            </span>
            <span className="sidebar-instance-arrow">+</span>
          </button>
        )}

        {state && state.instances.length > 1 && (
          <div className="sidebar-instance-count">
            <span>ВСЕГО СБОРОК</span>
            <strong>{String(state.instances.length).padStart(2, '0')}</strong>
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <button type="button" className="sidebar-account" onClick={() => onNavigate('accounts')}>
          <SkinHead account={activeAccount} size={30} className="sidebar-account-head" />
          <span className="sidebar-account-text">
            <strong>{activeAccount ? activeAccount.username : 'АККАУНТ НЕ ВЫБРАН'}</strong>
            <span>
              {activeAccount
                ? activeAccount.type === 'microsoft'
                  ? 'ЛИЦЕНЗИЯ MICROSOFT'
                  : 'ОФЛАЙН-ПРОФИЛЬ'
                : 'НАЖМИТЕ, ЧТОБЫ ВОЙТИ'}
            </span>
          </span>
          <span className="sidebar-account-arrow">→</span>
        </button>
        <div className="sidebar-build">
          <span className="barcode" aria-hidden="true" />
          <span>BUILD 2026.11</span>
          <span className="led led-acid" />
        </div>
      </div>
    </aside>
  );
};

export const SidebarTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Tag tone="muted">{children}</Tag>
);
