import React from 'react';
import { AlertTriangle, CheckCircle2, Download, Info, Package, X } from 'lucide-react';
import { useLauncher } from '../state/LauncherContext';
import { cx } from '../lib/format';
import { ProgressBar } from './ui/Common';

const toastIcon = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  error: <AlertTriangle size={16} />
};

const taskLabel: Record<string, string> = {
  mod: 'УСТАНОВКА МОДА',
  modpack: 'УСТАНОВКА МОДПАКА',
  import: 'ИМПОРТ СБОРКИ'
};

export const ToastTray: React.FC = () => {
  const { toasts, dismissToast, task } = useLauncher();
  const taskVisible = task.status !== 'idle';

  return (
    <div className="toast-tray" aria-live="polite">
      {taskVisible && (
        <div className={cx('task-tray', `is-${task.status}`)}>
          <div className="task-tray-head">
            <span className="task-tray-icon">
              <Download size={15} />
            </span>
            <span className="task-tray-title">{taskLabel[task.kind || 'mod']}</span>
            <span className="task-tray-status">
              {task.status === 'done'
                ? 'ГОТОВО'
                : task.status === 'error'
                  ? 'ОШИБКА'
                  : `${Math.round(task.progress)}%`}
            </span>
          </div>
          <div className="task-tray-message">{task.message}</div>
          <ProgressBar
            value={task.progress}
            tone={task.status === 'error' ? 'red' : task.status === 'done' ? 'cyan' : 'acid'}
            indeterminate={task.status === 'active' && task.progress <= 0}
          />
          {task.instanceId && (
            <div className="task-tray-foot">
              <Package size={11} /> В активную сборку
            </div>
          )}
        </div>
      )}

      {toasts.map((toast) => (
        <div key={toast.id} className={cx('toast', `toast-${toast.kind}`)}>
          <span className="toast-icon">{toastIcon[toast.kind]}</span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => dismissToast(toast.id)}
            aria-label="Закрыть уведомление"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};
