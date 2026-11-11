'use strict';

/**
 * Headless screenshots of the web preview through the Chrome DevTools Protocol.
 * Usage: node scripts/shot.cjs <page> [outfile]
 * Pages: home, catalog, instances, accounts, settings, console, project, onboarding
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.CDP_PORT || 9229);
const page = process.argv[2] || 'home';
const out = process.argv[3] || path.join(__dirname, '..', 'captures', `${page}.png`);
const url = process.env.SHOT_URL || 'http://localhost:5173';

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: pathname }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await getJson('/json/list');
      const pages = targets.filter((item) => item.type === 'page');
      const target =
        pages.find((item) => /SUNSPIRE/i.test(item.title || '')) ||
        pages.filter((item) => item.url.startsWith('http://localhost:5173')).pop() ||
        pages[0];
      if (target) return target;
    } catch {
      // not ready
    }
    await sleep(250);
  }
  throw new Error('CDP target not available');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const target = await waitForTarget();
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

  await send('Page.enable');
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

  const navigate = async (targetUrl) => {
    await send('Page.navigate', { url: targetUrl });
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const ready = await evaluate('document.readyState').catch(() => 'loading');
      if (ready === 'complete') break;
      await sleep(150);
    }
    await sleep(650);
  };

  const resetDemoState = async () => {
    await evaluate(
      `(() => { localStorage.removeItem('sunspire-web-demo-state-v1'); localStorage.removeItem('sunspire-onboarded-v1'); return true; })()`
    );
    await send('Page.reload');
    await sleep(1600);
  };

  const setDemoState = async (mutator) => {
    await evaluate(`(() => {
      const key = 'sunspire-web-demo-state-v1';
      const state = JSON.parse(localStorage.getItem(key));
      if (!state) return false;
      (${mutator})(state);
      localStorage.setItem(key, JSON.stringify(state));
      localStorage.removeItem('sunspire-onboarded-v1');
      return true;
    })()`);
    await send('Page.reload');
    await sleep(1500);
  };

  const clickNext = async () => {
    await evaluate(`document.querySelector('.onboarding-next')?.click(); true`);
    await sleep(500);
  };

  if (page === 'onboarding') {
    await navigate(url);
    await resetDemoState();
    await setDemoState(`(state) => { state.accounts = []; state.instances = []; state.activeAccountId = null; state.activeInstanceId = null; }`);
  } else if (page === 'onboarding-account') {
    await navigate(url);
    await resetDemoState();
    await setDemoState(`(state) => { state.accounts = []; state.instances = []; state.activeAccountId = null; state.activeInstanceId = null; }`);
    await clickNext();
    await sleep(500);
  } else if (page === 'home-create') {
    await navigate(url);
    await resetDemoState();
    await evaluate(
      `(() => { const key = 'sunspire-web-demo-state-v1'; const state = JSON.parse(localStorage.getItem(key)); state.activeInstanceId = 'demo-create'; localStorage.setItem(key, JSON.stringify(state)); return true; })()`
    );
    await send('Page.reload');
    await sleep(1500);
  } else if (page === 'onboarding-build') {
    await navigate(url);
    await resetDemoState();
    await setDemoState(`(state) => { state.instances = []; state.activeInstanceId = null; }`);
    await clickNext();
    await evaluate(`document.querySelector('.onboarding-nav .btn-primary')?.click(); true`);
    await sleep(800);
  } else if (page === 'onboarding-ready') {
    await navigate(url);
    await resetDemoState();
    await setDemoState(`(state) => {}`);
    await clickNext();
    await sleep(400);
    await evaluate(`document.querySelector('.onboarding-nav .btn-primary')?.click(); true`);
    await sleep(400);
    await evaluate(`document.querySelector('.onboarding-nav .btn-primary')?.click(); true`);
    await sleep(700);
  } else {
    await navigate(url);
    await resetDemoState();
    if (page !== 'home') {
      const navIndex = { catalog: 1, instances: 2, accounts: 3, settings: 4 }[page];
      if (navIndex !== undefined) {
        await evaluate(`document.querySelectorAll('.nav-item')[${navIndex}]?.click(); true`);
        await sleep(page === 'catalog' ? 1600 : 650);
      }
      if (page === 'console') {
        await evaluate(`document.querySelector('.statusbar-console-link')?.click(); true`);
        await sleep(500);
      }
      if (page === 'project') {
        await evaluate(`document.querySelector('.trending-card')?.click(); true`);
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const open = await evaluate(`Boolean(document.querySelector('.project-modal'))`).catch(() => false);
          if (open) break;
          await sleep(200);
        }
        await sleep(1200);
      }
      if (page === 'create') {
        await evaluate(`document.querySelectorAll('.nav-item')[2]?.click(); true`);
        await sleep(500);
        await evaluate(
          `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('СОЗДАТЬ СБОРКУ'))?.click(); true`
        );
        await sleep(900);
      }
      if (page === 'mods') {
        await evaluate(`document.querySelectorAll('.nav-item')[2]?.click(); true`);
        await sleep(500);
        await evaluate(
          `[...document.querySelectorAll('.instance-tab')].find((b) => b.textContent.includes('ФАЙЛЫ'))?.click(); true`
        );
        await sleep(700);
      }
    }
  }

  const metrics = await evaluate(
    `({ page: document.querySelector('main')?.className || '', text: document.body.innerText.slice(0, 160), overlays: { modal: Boolean(document.querySelector('.modal-window')), onboarding: Boolean(document.querySelector('.onboarding')) } })`
  );
  console.log('[shot] state:', JSON.stringify(metrics));

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('[shot] saved', out);
  ws.close();
}

main().catch((error) => {
  console.error('[shot] failed:', error.message);
  process.exit(1);
});
