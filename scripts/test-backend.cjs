'use strict';

/**
 * Backend smoke test for store + Modrinth without launching Electron.
 * Electron's `app` is stubbed so state and game files go to a temp folder.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(process.env.TEMP || process.cwd(), 'sunspire-backend-test');
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

const AdmZip = require('adm-zip');
const store = require('../electron/lib/store.cjs');
const modrinth = require('../electron/lib/modrinth.cjs');

async function main() {
  store.load();
  const instance = store.upsertInstance({
    id: 'test-instance',
    name: 'BACKEND TEST',
    mcVersion: '1.21.4',
    loader: 'fabric',
    loaderVersion: '0.16.9',
    ramMb: 4096,
    javaArgs: '',
    createdAt: new Date().toISOString(),
    lastPlayedAt: null,
    totalPlayMs: 0,
    icon: 'grass',
    iconUrl: '',
    modpack: null,
    mods: [],
    server: ''
  });
  console.log('[test] instance:', instance.id, instance.name, instance.mcVersion, instance.loader);

  const result = await modrinth.search({
    query: 'sodium',
    projectType: 'mod',
    gameVersion: '1.21.4',
    loader: 'fabric',
    limit: 3
  });
  console.log('[test] search total:', result.total, 'hits:', result.hits.map((hit) => hit.slug).join(', '));

  const details = await modrinth.getProjectDetails('fabric-api');
  console.log('[test] details:', details.title, 'versions:', details.versions.length, 'author:', details.author);

  const install = await modrinth.installProject({
    instanceId: instance.id,
    projectId: 'fabric-api'
  });
  console.log('[test] installed:', install.installed.map((mod) => `${mod.title}@${mod.version}`).join('; '));
  console.log('[test] warnings:', install.warnings.length ? install.warnings.join(' | ') : 'none');

  const dir = store.ensureGameDirs(instance.id);
  const files = fs.readdirSync(path.join(dir, 'mods'));
  console.log('[test] mods dir:', files.join(', '));
  const current = store.getInstance(instance.id);
  console.log('[test] state mods:', current.mods.length, 'active instance:', store.publicState().activeInstanceId);

  const packDir = path.join(root, 'fixture-pack');
  const overridesDir = path.join(packDir, 'overrides');
  fs.mkdirSync(path.join(overridesDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(overridesDir, 'mods'), { recursive: true });
  fs.writeFileSync(path.join(overridesDir, 'config', 'test.txt'), 'hello from overrides', 'utf8');
  fs.writeFileSync(path.join(overridesDir, 'mods', 'local-example.jar'), 'not a real jar', 'utf8');
  fs.writeFileSync(
    path.join(packDir, 'modrinth.index.json'),
    JSON.stringify(
      {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1.0.0',
        name: 'MRPACK TEST',
        summary: 'Fixture modpack',
        files: [],
        dependencies: { minecraft: '1.21.4', 'fabric-loader': '0.16.9' }
      },
      null,
      2
    ),
    'utf8'
  );
  const mrpackPath = path.join(root, 'fixture-pack.mrpack');
  const zip = new AdmZip();
  zip.addLocalFolder(packDir);
  zip.writeZip(mrpackPath);

  const imported = await modrinth.importModpack(mrpackPath);
  const importedInstance = imported.instance;
  console.log(
    '[test] imported pack:',
    importedInstance.name,
    importedInstance.mcVersion,
    importedInstance.loader,
    'mods:',
    importedInstance.mods.map((mod) => `${mod.title} (${mod.version})`).join('; ')
  );
  console.log('[test] active instance:', imported.state.activeInstanceId);
  const importedDir = store.instanceDir(importedInstance.id);
  console.log(
    '[test] overrides:',
    fs.readFileSync(path.join(importedDir, 'config', 'test.txt'), 'utf8')
  );
  console.log('[test] ok');
}

main().catch((error) => {
  console.error('[test] failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});
