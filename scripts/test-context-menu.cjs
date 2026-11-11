'use strict';
const fs = require('fs');
const http = require('http');
const PORT = Number(process.env.CDP_PORT || 9230);

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

(async () => {
  const targets = await getJson('/json/list');
  const target = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(String(event.data));
    if (!m.id || !pending.has(m.id)) return;
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await send('Runtime.enable');
  await send('Page.enable');
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result?.value;
  };

  const result = await evaluate(`(async () => {
    const card = document.querySelector('[data-instance-id]');
    if (!card) return { error: 'no instance card' };
    const rect = card.getBoundingClientRect();
    card.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: rect.left + Math.min(60, rect.width / 2),
      clientY: rect.top + Math.min(30, rect.height / 2)
    }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      card: card.getAttribute('data-instance-id'),
      menu: document.querySelector('.context-menu')?.innerText || null,
      items: [...document.querySelectorAll('.context-menu-item')].map((el) => ({
        text: el.textContent?.trim(),
        danger: el.classList.contains('is-danger'),
        disabled: el.disabled
      })),
      head: document.querySelector('.context-menu-head')?.innerText || null
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('captures', { recursive: true });
  fs.writeFileSync('captures/context-menu.png', Buffer.from(shot.data, 'base64'));
  console.log('saved captures/context-menu.png');
  ws.close();
})().catch((error) => {
  console.error('context menu test failed:', error.message);
  process.exit(1);
});
