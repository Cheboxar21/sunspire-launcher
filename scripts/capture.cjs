'use strict';

/**
 * Offscreen UI capture for visual verification.
 * Usage: node_modules\.bin\electron.cmd scripts/capture.cjs [url] [outfile] [script]
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const url = process.argv[2] || 'http://localhost:5173';
const out = process.argv[3] || path.join(__dirname, '..', 'capture.png');
const script = process.argv[4] || '';
const width = Number(process.env.CAPTURE_WIDTH || 1400);
const height = Number(process.env.CAPTURE_HEIGHT || 880);

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    backgroundColor: '#080a06',
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setFrameRate(30);
  await win.loadURL(url);
  await new Promise((resolve) => setTimeout(resolve, 2600));
  if (script) {
    try {
      const result = await win.webContents.executeJavaScript(script, true);
      if (result !== undefined) console.log('[capture] script:', JSON.stringify(result));
    } catch (error) {
      console.error('[capture] script error:', error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image.toPNG());
  console.log('[capture] saved', out, image.getSize());
  win.destroy();
  app.quit();
});
