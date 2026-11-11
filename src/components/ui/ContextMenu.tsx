import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/format';

export interface ContextMenuItem {
  id: string;
  label?: string;
  icon?: React.ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  title?: string;
  subtitle?: string;
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ state, onClose }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: state.x, y: state.y });
  const [activeIndex, setActiveIndex] = useState(-1);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const padding = 8;
    setPosition({
      x: Math.max(padding, Math.min(state.x, window.innerWidth - rect.width - padding)),
      y: Math.max(padding, Math.min(state.y, window.innerHeight - rect.height - padding))
    });
  }, [state]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      const actionable = state.items.filter((item) => !item.separator && !item.disabled);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!actionable.length) return;
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((current) => {
          const next = (current + direction + actionable.length) % actionable.length;
          return next;
        });
      }
      if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault();
        const item = actionable[activeIndex];
        if (item?.onSelect) {
          close();
          item.onSelect();
        }
      }
    };
    const onScroll = () => close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', close);
    };
  }, [activeIndex, onClose, state.items]);

  const actionableIndex = (item: ContextMenuItem) =>
    state.items.filter((entry) => !entry.separator && !entry.disabled).findIndex((entry) => entry.id === item.id);

  return createPortal(
    <>
      <div
        className="context-menu-backdrop"
        onMouseDown={(event) => {
          event.preventDefault();
          onClose();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        className="context-menu"
        style={{ left: position.x, top: position.y }}
        role="menu"
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {(state.title || state.subtitle) && (
          <div className="context-menu-head">
            {state.title && <strong>{state.title}</strong>}
            {state.subtitle && <span>{state.subtitle}</span>}
          </div>
        )}
        {state.items.map((item) =>
          item.separator ? (
            <div key={item.id} className="context-menu-separator" role="separator" />
          ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cx(
                'context-menu-item',
                item.danger && 'is-danger',
                actionableIndex(item) === activeIndex && 'is-active'
              )}
              onMouseEnter={() => setActiveIndex(actionableIndex(item))}
              onClick={() => {
                if (item.disabled) return;
                onClose();
                item.onSelect?.();
              }}
            >
              {item.icon && <span className="context-menu-icon">{item.icon}</span>}
              <span className="context-menu-label">{item.label}</span>
              {item.hint && <span className="context-menu-hint">{item.hint}</span>}
            </button>
          )
        )}
      </div>
    </>,
    document.body
  );
};
