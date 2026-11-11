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
  const box = await evaluate(`(async () => {
    document.querySelector('.context-menu-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const el = document.querySelector('[data-instance-id]');
    const r = el.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + 20 };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', buttons: 2, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', buttons: 0, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const result = await evaluate(`({
    menu: document.querySelector('.context-menu')?.innerText || null,
    menuRect: (() => { const el = document.querySelector('.context-menu'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()
  })`);
  console.log(JSON.stringify({ box, result }, null, 2));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('captures/context-native.png', Buffer.from(shot.data, 'base64'));
  console.log('saved captures/context-native.png');
  ws.close();
})().catch((error) => { console.error(error); process.exit(1); });
