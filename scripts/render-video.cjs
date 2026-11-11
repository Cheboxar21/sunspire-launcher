'use strict';

/**
 * Render the deterministic motion preview frame-by-frame through Edge CDP.
 * Usage: node scripts/render-video.cjs
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 9231;
const URL = 'http://127.0.0.1:5175/motion.html';
const FPS = 30;
const DURATION = 36;
const FRAMES = FPS * DURATION;
const OUT = path.join(__dirname, '..', 'video', 'frames');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = path.join(process.env.TEMP || process.cwd(), 'sunspire-motion-edge');
const PREVIEW = process.env.PREVIEW === '1';

fs.mkdirSync(OUT, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  for (let i = 0; i < 80; i += 1) {
    try {
      const targets = await getJson('/json/list');
      const target = targets.find((item) => item.type === 'page');
      if (target) return target;
    } catch {
      // not ready
    }
    await sleep(250);
  }
  throw new Error('Edge CDP target not available');
}

async function main() {
  const edge = spawn(
    EDGE,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      '--window-size=1080,1920',
      `--user-data-dir=${PROFILE}`,
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ],
    { stdio: 'ignore', windowsHide: true }
  );

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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1080,
    height: 1920,
    deviceScaleFactor: 1,
    mobile: false
  });
  await send('Page.navigate', { url: URL });
  for (let i = 0; i < 120; i += 1) {
    const ready = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (ready.result?.value === 'complete') break;
    await sleep(150);
  }
  await send('Runtime.evaluate', { expression: 'window.__ready', awaitPromise: true, returnByValue: true });
  await sleep(500);

  const evaluate = (expression, awaitPromise = false) =>
    send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });

  if (PREVIEW) {
    const times = [0.9, 3.2, 5.2, 7.2, 9.4, 11.4, 13.4, 15.4, 17.4, 19.4, 21.4, 23.4, 25.4, 27.4, 29.4, 31.4, 33.4, 35.2];
    for (let i = 0; i < times.length; i += 1) {
      const t = times[i];
      await evaluate(`window.renderAt(${t.toFixed(3)})`);
      await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))', true);
      const shot = await send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 95,
        fromSurface: true,
        captureBeyondViewport: false
      });
      const file = path.join(OUT, `preview-${String(i).padStart(2, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log('[preview]', t, file);
    }
    ws.close();
    edge.kill();
    return;
  }

  for (let frame = 0; frame < FRAMES; frame += 1) {
    const t = frame / FPS;
    await evaluate(`window.renderAt(${t.toFixed(4)})`);
    await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))', true);
    const shot = await send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 94,
      fromSurface: true,
      captureBeyondViewport: false
    });
    const file = path.join(OUT, `frame_${String(frame).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    if (frame % 60 === 0 || frame === FRAMES - 1) {
      console.log(`[render] ${frame + 1}/${FRAMES} (${t.toFixed(1)}s)`);
    }
  }

  ws.close();
  edge.kill();
  console.log('[render] done');
}

main().catch((error) => {
  console.error('[render] failed:', error.stack || error);
  process.exit(1);
});
