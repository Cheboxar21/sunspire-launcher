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

  const start = await evaluate(`(async () => {
    const state = await window.retro.state.get();
    if (!state.ok) return { stage: 'state', error: state.error };
    const instance = state.data.instances.find((item) => item.id === state.data.activeInstanceId) || state.data.instances[0];
    const account = state.data.accounts.find((item) => item.id === state.data.activeAccountId) || state.data.accounts[0];
    if (!instance) return { stage: 'instance', error: 'no instance' };
    if (!account) return { stage: 'account', error: 'no account' };
    const result = await window.retro.launch.start(instance.id, account.id);
    return { stage: 'start', instance: instance.name, account: account.username, result };
  })()`);
  console.log('start:', JSON.stringify(start, null, 2));

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const running = await evaluate(`window.retro.launch.running()`);
  console.log('running:', JSON.stringify(running, null, 2));

  const logs = await evaluate(`(async () => {
    const state = await window.retro.state.get();
    const instance = state.data.instances[0];
    const log = await window.retro.mods.readLog(instance.id);
    return log.ok ? log.data.slice(-4000) : log;
  })()`);
  console.log('log tail:', typeof logs === 'string' ? logs.slice(-4000) : JSON.stringify(logs));

  ws.close();
}

main().catch((error) => {
  console.error('launch test failed:', error.message);
  process.exit(1);
});
