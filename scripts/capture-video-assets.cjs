'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.CDP_PORT || 9230);
const OUT = path.join(__dirname, '..', 'video', 'assets');
fs.mkdirSync(OUT, { recursive: true });

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: pathname }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(JSON.parse(body)));
      })
      .on('error', reject);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const targets = await getJson('/json/list');
  const target = targets.find((item) => item.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
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
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 880,
    deviceScaleFactor: 1,
    mobile: false
  });

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

  const shoot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));
    console.log('[asset]', name);
  };

  const nav = async (index, wait = 750) => {
    await evaluate(`document.querySelectorAll('.nav-item')[${index}]?.click(); true`);
    await sleep(wait);
  };

  await nav(0, 900);
  await shoot('home');

  await nav(1, 2200);
  await shoot('catalog');

  await nav(2, 900);
  await shoot('instances');
  await evaluate(
    `[...document.querySelectorAll('.instance-tab')].find((el) => el.textContent.includes('ФАЙЛЫ'))?.click(); true`
  );
  await sleep(800);
  await shoot('instances-files');

  await nav(3, 900);
  await shoot('accounts');

  await nav(4, 900);
  await evaluate(`document.querySelector('.settings-themes')?.scrollIntoView({ block: 'center' }); true`);
  await sleep(500);
  await shoot('themes');
  await evaluate(`window.scrollTo(0, 0); true`);
  await sleep(300);
  await shoot('settings');

  await nav(0, 900);
  console.log('[assets] done');
  ws.close();
})().catch((error) => {
  console.error('[assets] failed:', error.message);
  process.exit(1);
});
