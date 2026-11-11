'use strict';

/**
 * Starts the built Sunspire launcher in Electron.
 * Use `npm run build` first (or let Start-Sunspire.bat do it).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'electron', 'main.cjs');
const indexFile = path.join(root, 'dist', 'index.html');

if (!fs.existsSync(indexFile)) {
  console.error('[sunspire] dist/index.html не найден. Сначала выполните: npm run build');
  process.exit(1);
}

let electronPath;
try {
  electronPath = require('electron');
} catch (error) {
  console.error('[sunspire] Electron не установлен. Выполните: npm install');
  console.error(error.message);
  process.exit(1);
}

if (!electronPath || !fs.existsSync(electronPath)) {
  console.error('[sunspire] Бинарник Electron отсутствует. Выполните: node node_modules/electron/install.js');
  process.exit(1);
}

const child = spawn(electronPath, [entry], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
  }
});

child.on('error', (error) => {
  console.error('[sunspire] Не удалось запустить Electron:', error.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill();
  });
}
