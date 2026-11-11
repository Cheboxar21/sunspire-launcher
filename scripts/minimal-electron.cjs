const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '..', 'captures', 'minimal-electron.log');
function log(line) {
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
}
log('script start');
process.on('uncaughtException', (error) => {
  log('uncaught: ' + (error && error.stack ? error.stack : error));
});
try {
  const { app, BrowserWindow } = require('electron');
  log('electron required');
  app.whenReady().then(() => {
    log('app ready');
    const win = new BrowserWindow({ width: 600, height: 400, show: false });
    win.loadURL('data:text/html,<h1>ok</h1>');
    win.webContents.once('did-finish-load', () => {
      log('page loaded');
      app.quit();
    });
  }).catch((error) => log('whenReady error: ' + error.stack));
} catch (error) {
  log('require error: ' + (error && error.stack ? error.stack : error));
}
