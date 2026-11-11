import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { api, isDesktop } from '../lib/api';
import { PixelLogoTiles } from './ui/BlockIcon';

export const TitleBar: React.FC = () => {
  const maximize = () => {
    api.window.toggleMaximize().catch(() => {});
  };

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      onDoubleClick={() => {
        if (!('__TAURI_INTERNALS__' in window)) maximize();
      }}
    >
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-logo">
          <PixelLogoTiles size={22} />
        </span>
        <span className="titlebar-name" data-tauri-drag-region>SUNSPIRE</span>
        <span className="titlebar-divider" data-tauri-drag-region>//</span>
        <span className="titlebar-sub" data-tauri-drag-region>MINECRAFT LAUNCHER</span>
        <span className="titlebar-version" data-tauri-drag-region>V1.0.0</span>
      </div>

      <div className="titlebar-center" data-tauri-drag-region aria-hidden="true">
        <span className="titlebar-led" />
        <span>{isDesktop ? 'DESKTOP SESSION' : 'WEB PREVIEW MODE'}</span>
      </div>

      <div className="titlebar-controls">
        <button
          type="button"
          className="window-btn"
          title="Свернуть"
          aria-label="Свернуть"
          onClick={() => api.window.minimize().catch(() => {})}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="window-btn"
          title="Развернуть"
          aria-label="Развернуть"
          onClick={maximize}
        >
          <Square size={12} />
        </button>
        <button
          type="button"
          className="window-btn window-btn-close"
          title="Закрыть"
          aria-label="Закрыть"
          onClick={() => api.window.close().catch(() => {})}
        >
          <X size={15} />
        </button>
      </div>
    </header>
  );
};
