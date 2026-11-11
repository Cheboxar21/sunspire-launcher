'use strict';
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
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result?.value;
  };

  const result = await evaluate(`(async () => {
    const danger = [...document.querySelectorAll('.context-menu-item')].find((el) => el.textContent.includes('Удалить сборку'));
    if (!danger) return { error: 'delete item not found' };
    danger.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const modal = document.querySelector('.modal-window');
    const text = modal?.innerText || '';
    const cancel = [...document.querySelectorAll('.modal-window button')].find((el) => el.textContent.trim() === 'ОТМЕНА');
    cancel?.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      confirmShown: Boolean(modal),
      hasTitle: text.includes('УДАЛИТЬ СБОРКУ'),
      hasName: text.includes('Fabric 26.3'),
      closedAfterCancel: !document.querySelector('.modal-window')
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
  ws.close();
})().catch((error) => { console.error(error); process.exit(1); });
