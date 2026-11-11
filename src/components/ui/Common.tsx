import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../../lib/format';

export const PageHeader: React.FC<{
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ kicker, title, description, actions }) => (
  <div className="page-header">
    <div className="page-header-text">
      {kicker && <span className="page-kicker">{kicker}</span>}
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </div>
);

export const Tag: React.FC<{
  children: React.ReactNode;
  tone?: 'default' | 'acid' | 'amber' | 'red' | 'cyan' | 'purple' | 'muted';
  className?: string;
}> = ({ children, tone = 'default', className }) => (
  <span className={cx('tag', `tag-${tone}`, className)}>{children}</span>
);

export const ProgressBar: React.FC<{
  value: number;
  className?: string;
  tone?: 'acid' | 'amber' | 'red' | 'cyan';
  indeterminate?: boolean;
}> = ({ value, className, tone = 'acid', indeterminate }) => (
  <div
    className={cx('progress-track', className, tone !== 'acid' && `progress-${tone}`, indeterminate && 'is-indeterminate')}
    role="progressbar"
    aria-valuenow={Math.round(value)}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

export const PixelSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    className={cx('pixel-switch', checked && 'is-on')}
    onClick={() => onChange(!checked)}
  >
    <span className="pixel-switch-knob" />
    <span className="pixel-switch-text">{checked ? 'ВКЛ' : 'ВЫКЛ'}</span>
  </button>
);

export const LoadingDots: React.FC<{ label?: string }> = ({ label }) => (
  <div className="loading-dots">
    <span className="dot-block d1" />
    <span className="dot-block d2" />
    <span className="dot-block d3" />
    {label && <span className="loading-label">{label}</span>}
  </div>
);

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className }) => (
  <div className={cx('empty-state', className)}>
    {icon && <div className="empty-state-icon">{icon}</div>}
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {action && <div className="empty-state-action">{action}</div>}
  </div>
);

export const Modal: React.FC<{
  title: string;
  kicker?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  accent?: string;
  className?: string;
  hideHeader?: boolean;
}> = ({ title, kicker, onClose, children, footer, size = 'md', accent, className, hideHeader }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={cx('modal-window', `modal-${size}`, className)}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-chrome" style={accent ? { borderTopColor: accent } : undefined}>
          <div className="modal-chrome-left">
            <span className="chrome-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="modal-chrome-title">{kicker || 'SUNSPIRE :: WINDOW'}</span>
          </div>
          <button className="chrome-close" onClick={onClose} title="Закрыть" aria-label="Закрыть">
            <X size={14} />
          </button>
        </div>
        {!hideHeader && (
          <div className="modal-header">
            <div>
              {kicker && <span className="page-kicker">{kicker}</span>}
              <h2>{title}</h2>
            </div>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

export const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, message, confirmLabel = 'ПОДТВЕРДИТЬ', cancelLabel = 'ОТМЕНА', danger, onConfirm, onCancel }) => (
  <Modal
    title={title}
    kicker="ПОДТВЕРЖДЕНИЕ ДЕЙСТВИЯ"
    size="sm"
    onClose={onCancel}
    footer={
      <>
        <button type="button" className={cx('btn', danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
      </>
    }
  >
    <p className="confirm-message">{message}</p>
  </Modal>
);

export const Divider: React.FC<{ label?: string }> = ({ label }) => (
  <div className="retro-divider">
    <span />
    {label && <em>{label}</em>}
    <span />
  </div>
);
