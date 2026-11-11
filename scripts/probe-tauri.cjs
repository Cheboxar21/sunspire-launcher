'use strict';

const fs = require('fs');
const http = require('http');

const PORT = Number(process.env.CDP_PORT || 9230);
const OUT = process.argv[2] || 'captures/tauri-home.png';

function getJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(JSON.parse(body)));
      })
      .on('error', reject);
  });
}

async function main() {
  const targets = await getJson('/json/list');
  const target = targets.find((item) => item.type === 'page');
  if (!target) throw new Error('no webview target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, { resolve, reject });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await send('Runtime.enable');
  await send('Page.enable');

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed');
    }
    return result.result?.value;
  };

  const info = await evaluate(`(async () => ({
    title: document.title,
    text: document.body.innerText.slice(0, 500),
    retro: Boolean(window.retro),
    titlebar: document.querySelector('.titlebar-name')?.textContent,
    images: [...document.querySelectorAll('img')].slice(0, 8).map((img) => ({
      src: img.src,
      complete: img.complete,
      width: img.naturalWidth
    })),
    theme: document.documentElement.dataset.theme || '',
    state: window.retro ? await window.retro.state.get().then((r) => r.ok ? {
      accounts: r.data.accounts.length,
      instances: r.data.instances.length,
      active: r.data.activeInstanceId,
      gameRoot: r.data.gameRoot,
      theme: r.data.settings.theme
    } : { error: r.error }) : null
  }))()`);
  console.log(JSON.stringify(info, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(require('path').dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('saved', OUT);
  ws.close();
}

main().catch((error) => {
  console.error('probe failed:', error.message);
  process.exit(1);
});
