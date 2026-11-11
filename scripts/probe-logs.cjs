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
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result?.value;
  };
  await ev(`(() => {
    window.__testLogs = [];
    window.retro.events.onLaunchLog((entry) => window.__testLogs.push(entry));
    return true;
  })()`);
  await ev(`(() => {
    document.querySelector('.statusbar-console-link')?.click();
    return true;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const out = await ev(`(async () => ({
    count: window.__testLogs.length,
    first: window.__testLogs.slice(0, 3),
    uiCount: document.querySelector('.console-log-count')?.textContent,
    uiLines: [...document.querySelectorAll('.console-line-text')].slice(-5).map((n) => n.textContent),
    presence: window.retro ? await window.retro.state.get().then((r) => r.ok ? r.data.settings.discordRpc : null) : null
  }))()`);
  console.log(JSON.stringify(out, null, 2));
  ws.close();
})().catch((e) => { console.error(e); process.exit(1); });
