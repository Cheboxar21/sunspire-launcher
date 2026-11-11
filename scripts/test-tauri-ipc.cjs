'use strict';

const fs = require('fs');
const http = require('http');

const PORT = Number(process.env.CDP_PORT || 9230);

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
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await send('Runtime.enable');

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

  const script = `(async () => {
    const out = {};
    out.retro = Boolean(window.retro);
    out.offline = await window.retro.auth.offline('QA_Player');
    out.create = await window.retro.instances.create({
      name: 'QA FABRIC',
      mcVersion: '1.21.4',
      loader: 'fabric',
      loaderVersion: '0.16.9',
      ramMb: 4096,
      icon: 'diamond'
    });
    out.search = await window.retro.modrinth.search({
      query: 'sodium',
      projectType: 'mod',
      gameVersion: '1.21.4',
      loader: 'fabric',
      limit: 3
    });
    out.themeUpdate = await window.retro.state.update({ settings: { theme: 'amber' } });
    await new Promise((resolve) => setTimeout(resolve, 600));
    out.theme = document.documentElement.dataset.theme;
    out.state = await window.retro.state.get();
    return out;
  })()`;

  const result = await evaluate(script);
  const summarize = (value) => {
    if (!value) return value;
    if (value.ok === false) return { ok: false, error: value.error };
    return value;
  };
  console.log(
    JSON.stringify(
      {
        retro: result.retro,
        offline: summarize(result.offline),
        create: result.create?.ok
          ? { ok: true, instance: result.create.data.instance?.name, stateInstances: result.create.data.state?.instances?.length }
          : summarize(result.create),
        search: result.search?.ok
          ? { ok: true, total: result.search.data.total, hits: result.search.data.hits?.map((hit) => hit.slug) }
          : summarize(result.search),
        themeUpdate: result.themeUpdate?.ok ? { ok: true } : summarize(result.themeUpdate),
        theme: result.theme,
        state: result.state?.ok
          ? {
              accounts: result.state.data.accounts?.length,
              instances: result.state.data.instances?.map((item) => item.name),
              theme: result.state.data.settings?.theme
            }
          : summarize(result.state)
      },
      null,
      2
    )
  );
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('captures', { recursive: true });
  fs.writeFileSync('captures/tauri-ipc.png', Buffer.from(shot.data, 'base64'));
  console.log('saved captures/tauri-ipc.png');
  ws.close();
}

main().catch((error) => {
  console.error('ipc test failed:', error.message);
  process.exit(1);
});
