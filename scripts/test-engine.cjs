'use strict';

/**
 * Engine smoke test: Java detection, Mojang metadata, loaders and offline auth.
 * Electron's `app` is stubbed so cache/state go to a temp folder.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(process.env.TEMP || process.cwd(), 'sunspire-engine-test');
if (process.argv.includes('--clean')) {
  fs.rmSync(root, { recursive: true, force: true });
}
fs.mkdirSync(path.join(root, 'userData'), { recursive: true });
fs.mkdirSync(path.join(root, 'appData'), { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getPath(name) {
          if (name === 'userData') return path.join(root, 'userData');
          if (name === 'appData') return path.join(root, 'appData');
          return root;
        }
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const store = require('../electron/lib/store.cjs');
const auth = require('../electron/lib/auth.cjs');
const java = require('../electron/lib/java.cjs');
const minecraft = require('../electron/lib/minecraft.cjs');

async function main() {
  const jdks = await java.detectJava();
  console.log('[test] java:', jdks.map((jdk) => `${jdk.major}@${jdk.path}`).join(' | '));
  const chosen = java.chooseJava(jdks, 25);
  console.log('[test] chosen for 1.26:', chosen ? `${chosen.major}@${chosen.path}` : 'none');

  const versions = await minecraft.listVersions();
  console.log('[test] latest:', versions.latest.release, 'versions:', versions.versions.length);
  const meta = await minecraft.getVersionMeta('1.21.4');
  console.log('[test] meta 1.21.4:', meta.id, 'java:', meta.javaVersion?.majorVersion, 'libraries:', meta.libraries.length);
  const loaders = await minecraft.getLoaderVersions('1.21.4');
  console.log(
    '[test] loaders:',
    `fabric=${loaders.fabric.slice(0, 2).map((v) => v.version).join(',')}`,
    `quilt=${loaders.quilt.slice(0, 2).map((v) => v.version).join(',')}`,
    `forge=${loaders.forge.map((v) => v.version).join(',')}`,
    `neoforge=${loaders.neoforge.slice(0, 2).map((v) => v.version).join(',')}`
  );

  const launched = minecraft.buildLaunchArgs(
    {
      version: { id: '1.21.4', mainClass: 'net.minecraft.client.main.Main', minecraftArguments: '' },
      classpath: 'C:/libs/a.jar;C:/libs/b.jar',
      assetsIndex: '17',
      natives: 'C:/natives'
    },
    {
      name: 'TEST',
      mcVersion: '1.21.4',
      ramMb: 4096,
      javaArgs: ''
    },
    { username: 'RetroSteve', uuid: '00000000000000000000000000000000', type: 'offline' },
    { javaPath: 'C:/java/bin/java.exe', dataDir: path.join(root, 'appData', 'Sunspire') }
  );
  console.log('[test] launch args include username:', launched.args.includes('RetroSteve'));

  store.load();
  const offline = auth.addOfflineAccount('RetroSteve');
  console.log('[test] offline:', offline.account.username, offline.account.uuid, offline.account.licenseLabel);
  const again = auth.addOfflineAccount('retrosteve');
  console.log('[test] offline dedupe:', again.account.id === offline.account.id);
  try {
    auth.addOfflineAccount('bad name!');
    console.log('[test] offline validation: FAILED');
  } catch (error) {
    console.log('[test] offline validation rejects invalid name:', error.code);
  }
  console.log('[test] ok');
}

main().catch((error) => {
  console.error('[test] failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});
