import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ChevronDown,
  Loader2,
  Square,
  Terminal,
  Trash2,
  X
} from 'lucide-react';
import { useLauncher } from '../state/LauncherContext';
import { cx, instanceDisplayName } from '../lib/format';
import { ProgressBar, Tag } from './ui/Common';

const ANSI = /\u001b\[[0-9;]*m/g;

function logTime(at: number): string {
  const date = new Date(at);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const ConsoleDrawer: React.FC = () => {
  const { launch, activeInstance, state, closeConsole, clearLogs, killGame } = useLauncher();
  const [autoScroll, setAutoScroll] = useState(true);
  const [now, setNow] = useState(Date.now());
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!launch.consoleOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [launch.consoleOpen]);

  useEffect(() => {
    if (!launch.consoleOpen) return;
    setAutoScroll(true);
  }, [launch.instanceId, launch.consoleOpen]);

  useEffect(() => {
    if (!autoScroll) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [launch.logs.length, autoScroll, launch.consoleOpen]);

  if (!launch.consoleOpen) return null;

  const instance = state?.instances.find((item) => item.id === launch.instanceId) || activeInstance;
  const running = launch.running;
  const elapsed = launch.startedAt ? now - launch.startedAt : 0;

  const handleScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 48;
    setAutoScroll(nearBottom);
  };

  const scrollToBottom = () => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
    setAutoScroll(true);
  };

  return (
    <section className="console-drawer" aria-label="Терминал запуска">
      <div className="console-head">
        <div className="console-head-left">
          <span className="console-head-icon">
            <Terminal size={15} />
          </span>
          <div>
            <span className="console-title">ТЕРМИНАЛ СБОРКИ</span>
            <span className="console-subtitle">
              {instance ? `${instanceDisplayName(instance)} · ${instance.mcVersion}` : 'launch://idle'}
            </span>
          </div>
        </div>
        <div className="console-head-stats">
          <Tag
            tone={
              launch.phase === 'error'
                ? 'red'
                : running
                  ? 'acid'
                  : launch.phase === 'preparing'
                    ? 'amber'
                    : 'muted'
            }
          >
            {launch.phase === 'preparing' && <Loader2 size={10} className="spin" />}
            {launch.phase === 'running'
              ? 'RUNNING'
              : launch.phase === 'preparing'
                ? 'PREPARING'
                : launch.phase === 'exited'
                  ? 'EXITED'
                  : launch.phase === 'error'
                    ? 'ERROR'
                    : 'IDLE'}
          </Tag>
          <span className="console-elapsed">{formatElapsed(elapsed)}</span>
          <span className="console-log-count">{launch.logs.length} СТРОК</span>
        </div>
        <div className="console-head-actions">
          {running && (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => void killGame()}>
              <Square size={11} /> ОСТАНОВИТЬ
            </button>
          )}
          <button type="button" className="icon-button" title="Очистить" onClick={clearLogs}>
            <Trash2 size={13} />
          </button>
          <button type="button" className="icon-button" title="Свернуть" onClick={closeConsole}>
            <ChevronDown size={15} />
          </button>
          <button type="button" className="icon-button" title="Закрыть" onClick={closeConsole}>
            <X size={14} />
          </button>
        </div>
      </div>

      {(launch.phase === 'preparing' || launch.error) && (
        <div className={cx('console-progress', launch.error && 'is-error')}>
          <div className="console-progress-head">
            <span>{launch.error || launch.message || 'Подготовка запуска…'}</span>
            {!launch.error && <em>{Math.round(launch.progress)}%</em>}
          </div>
          <ProgressBar
            value={launch.error ? 100 : launch.progress}
            tone={launch.error ? 'red' : 'acid'}
            indeterminate={!launch.error && launch.progress <= 0}
          />
        </div>
      )}

      <div className="console-body" ref={bodyRef} onScroll={handleScroll}>
        {launch.logs.length === 0 ? (
          <div className="console-boot">
            <pre>{`SUNSPIRE LAUNCH TERMINAL v1.0.0
(c) 2026 SUNSPIRE SYSTEMS

[ OK ] graphics pipeline initialized
[ OK ] modrinth uplink ready
[ .. ] waiting for launch sequence
> нажмите «Запустить игру», чтобы начать`}</pre>
            <span className="console-cursor">█</span>
          </div>
        ) : (
          <div className="console-lines">
            {launch.logs.map((entry, index) => (
              <div className={cx('console-line', entry.level && `is-${entry.level}`)} key={`${entry.at}-${index}`}>
                <span className="console-line-time">{logTime(entry.at)}</span>
                <span className="console-line-mark">{entry.level === 'error' ? '!!' : entry.level === 'warn' ? '!' : '>'}</span>
                <span className="console-line-text">{entry.line.replace(ANSI, '')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="console-foot">
        <span className="console-prompt">&gt;</span>
        <span className="console-cursor">█</span>
        <span className="console-foot-hint">ВЫВОД ПРОЦЕССА MINECRAFT / JAVA</span>
        <button
          type="button"
          className={cx('console-autoscroll', autoScroll && 'is-on')}
          onClick={() => (autoScroll ? setAutoScroll(false) : scrollToBottom())}
        >
          <ArrowDownToLine size={12} /> AUTOSCROLL {autoScroll ? 'ON' : 'OFF'}
        </button>
      </div>
    </section>
  );
};
