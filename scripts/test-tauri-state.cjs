'use strict';

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

  const result = await evaluate(`(async () => {
    const state = await window.retro.state.get();
    const account = state.data.accounts[0];
    const java = await window.retro.java.list();
    const loaders = await window.retro.mc.loaders('26.3');
    const refresh = account ? await window.retro.auth.refresh(account.id) : null;
    const after = await window.retro.state.get();
    return {
      account: account && { name: account.username, type: account.type },
      java: java.ok ? java.data.java.map((item) => ({ major: item.major, vendor: item.vendor, path: item.path })) : java,
      loaders: loaders.ok ? {
        fabric: loaders.data.fabric.slice(0, 2).map((item) => item.version),
        quilt: loaders.data.quilt.slice(0, 2).map((item) => item.version),
        forge: loaders.data.forge.map((item) => item.version),
        neoforge: loaders.data.neoforge.slice(0, 2).map((item) => item.version)
      } : loaders,
      refresh: refresh && (refresh.ok ? { ok: true, name: refresh.data.username } : refresh),
      after: after.ok ? after.data.accounts.map((item) => item.username) : after
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
  ws.close();
}

main().catch((error) => {
  console.error('state test failed:', error.message);
  process.exit(1);
});
