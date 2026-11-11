import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, MemoryStick, Wifi } from 'lucide-react';
import { useLauncher } from '../state/LauncherContext';
import { formatBytes } from '../lib/format';
import { ProgressBar } from './ui/Common';

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const StatusBar: React.FC = () => {
  const { state, activeInstance, javaList, launch, task, systemInfo, openConsole } = useLauncher();
  const clock = useClock();

  const selectedJava =
    javaList.find((entry) => entry.path === state?.settings.javaPath) ||
    javaList[0] ||
    null;
  const ram = activeInstance?.ramMb || state?.settings.defaultRamMb || 4096;
  const totalMem = systemInfo?.totalMemMb || 0;

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <span className="statusbar-cell">
          <span className={launch.running ? 'led led-amber' : 'led led-acid'} />
          {launch.running ? 'ИГРА ЗАПУЩЕНА' : task.status === 'active' ? 'ВЫПОЛНЯЕТСЯ ЗАДАЧА' : 'СИСТЕМА ГОТОВА'}
        </span>
        <span className="statusbar-cell statusbar-hide-sm">
          <Cpu size={12} />
          {selectedJava ? `JAVA ${selectedJava.major}` : 'JAVA ?'}
        </span>
        <span className="statusbar-cell statusbar-hide-sm">
          <MemoryStick size={12} />
          {Math.round(ram / 1024)} GB
        </span>
        <span className="statusbar-cell statusbar-hide-md">
          <HardDrive size={12} />
          {totalMem ? formatBytes(totalMem * 1024 * 1024) : '—'}
        </span>
      </div>

      <div className="statusbar-center">
        {task.status === 'active' || task.status === 'error' ? (
          <div className="statusbar-task">
            <span className="statusbar-task-label">{task.message}</span>
            <ProgressBar
              value={task.progress}
              tone={task.status === 'error' ? 'red' : 'acid'}
              className="statusbar-progress"
              indeterminate={task.progress <= 0}
            />
            <span className="statusbar-task-percent">{Math.round(task.progress)}%</span>
          </div>
        ) : (
          <button type="button" className="statusbar-console-link" onClick={openConsole}>
            <span className="statusbar-prompt">&gt;_</span>
            ТЕРМИНАЛ
            {launch.logs.length > 0 && <em>{launch.logs.length}</em>}
          </button>
        )}
      </div>

      <div className="statusbar-right">
        <span className="statusbar-cell statusbar-hide-md">
          <Wifi size={12} /> MODRINTH ONLINE
        </span>
        <span className="statusbar-cell">
          <span className="led led-acid" />
          {clock}
        </span>
        <span className="statusbar-cell statusbar-version">{state?.version ? `v1.0.0` : 'v1.0.0'}</span>
      </div>
    </footer>
  );
};
