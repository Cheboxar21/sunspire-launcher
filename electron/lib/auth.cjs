'use strict';

const { BrowserWindow, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const store = require('./store.cjs');
const { fetchJson } = require('./http.cjs');

const CLIENT_ID = '00000000402b5328';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';
const AUTHORIZE_URL =
  'https://login.live.com/oauth20_authorize.srf' +
  `?client_id=${CLIENT_ID}` +
  '&response_type=code' +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  '&prompt=select_account';

const XBL_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MC_LOGIN_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';

const imageCache = new Map();

function authError(message, code = 'AUTH_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function xstsMessage(xerr) {
  switch (String(xerr)) {
    case '2148916233':
      return 'У этого аккаунта Microsoft нет профиля Xbox. Создайте его на xbox.com и попробуйте снова.';
    case '2148916235':
      return 'Xbox Live недоступен в вашем регионе.';
    case '2148916236':
    case '2148916237':
      return 'Аккаунту нужно пройти проверку возраста на xbox.com.';
    case '2148916238':
      return 'Детский аккаунт должен быть добавлен в семейную группу Microsoft.';
    default:
      return `Xbox Live отклонил вход (код ${xerr || 'неизвестен'}).`;
  }
}

async function postForm(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SunspireLauncher/1.0.0'
    },
    body: new URLSearchParams(data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json.error_description || json.error || `HTTP ${res.status}`;
    throw authError(`Ошибка Microsoft OAuth: ${message}`, json.error || 'OAUTH_ERROR');
  }
  return json;
}

async function postJson(url, data, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'SunspireLauncher/1.0.0',
      ...headers
    },
    body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const xerr = json && json.XErr;
    const error = authError(xstsMessage(xerr) || `HTTP ${res.status}`, 'XBOX_ERROR');
    error.xerr = xerr;
    error.status = res.status;
    throw error;
  }
  return json;
}

async function exchangeCode(code) {
  return postForm('https://login.live.com/oauth20_token.srf', {
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE
  });
}

async function refreshLiveToken(refreshToken) {
  return postForm('https://login.live.com/oauth20_token.srf', {
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE
  });
}

async function authenticateXbox(liveAccessToken) {
  const xbl = await postJson(
    XBL_URL,
    {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${liveAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    },
    { 'x-xbl-contract-version': '1' }
  );

  const xsts = await postJson(
    XSTS_URL,
    {
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xbl.Token]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    },
    { 'x-xbl-contract-version': '1' }
  );

  const uhs = xsts.DisplayClaims && xsts.DisplayClaims.xui && xsts.DisplayClaims.xui[0]
    ? xsts.DisplayClaims.xui[0].uhs
    : null;
  if (!uhs) throw authError('Xbox Live не вернул идентификатор пользователя.');

  const mc = await postJson(MC_LOGIN_URL, {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
  });
  return { mcToken: mc.access_token, expiresIn: mc.expires_in, uhs };
}

async function fetchMinecraftProfile(mcToken) {
  const res = await fetch(MC_PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${mcToken}`,
      'User-Agent': 'SunspireLauncher/1.0.0'
    }
  });
  if (res.status === 404) {
    throw authError(
      'На этом аккаунте Microsoft нет лицензии Minecraft: Java Edition. Купите игру или используйте офлайн-аккаунт.',
      'NOT_OWNED'
    );
  }
  if (res.status === 401) {
    throw authError('Токен Minecraft истёк. Войдите в аккаунт Microsoft заново.', 'TOKEN_EXPIRED');
  }
  if (!res.ok) {
    throw authError(`Не удалось получить профиль Minecraft (HTTP ${res.status}).`, 'PROFILE_ERROR');
  }
  return res.json();
}

function buildAccount(profile, data) {
  const skin = Array.isArray(profile.skins) ? profile.skins.find((s) => s.state === 'ACTIVE') || profile.skins[0] : null;
  const cape = Array.isArray(profile.capes) ? profile.capes.find((c) => c.state === 'ACTIVE') || profile.capes[0] : null;
  return {
    id: profile.id,
    type: 'microsoft',
    username: profile.name,
    uuid: profile.id,
    licenseLabel: 'Microsoft · лицензия',
    skinUrl: skin ? skin.url : '',
    capeUrl: cape ? cape.url : '',
    slimArms: skin ? skin.variant === 'slim' : false,
    skinDataUrl: '',
    mcAccessToken: data.mcToken,
    mcExpiresAt: Date.now() + Number(data.expiresIn || 86400) * 1000,
    msAccessToken: data.msAccessToken || '',
    msExpiresAt: data.msExpiresAt || 0,
    refreshToken: data.refreshToken || '',
    xuid: data.xuid || '',
    addedAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };
}

async function completeLogin(tokens) {
  const xbox = await authenticateXbox(tokens.access_token);
  const profile = await fetchMinecraftProfile(xbox.mcToken);
  return buildAccount(profile, {
    mcToken: xbox.mcToken,
    expiresIn: xbox.expiresIn,
    msAccessToken: tokens.access_token,
    msExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    refreshToken: tokens.refresh_token || '',
    xuid: profile.id
  });
}

async function refreshAccount(account) {
  if (!account || account.type !== 'microsoft') return account;
  if (!account.refreshToken) {
    throw authError('Нет токена обновления. Войдите через Microsoft заново.', 'NO_REFRESH_TOKEN');
  }
  let tokens;
  try {
    tokens = await refreshLiveToken(account.refreshToken);
  } catch (err) {
    throw authError('Сессия Microsoft истекла. Войдите в аккаунт заново.', 'REFRESH_FAILED');
  }
  const xbox = await authenticateXbox(tokens.access_token);
  const profile = await fetchMinecraftProfile(xbox.mcToken);
  const updated = buildAccount(profile, {
    mcToken: xbox.mcToken,
    expiresIn: xbox.expiresIn,
    msAccessToken: tokens.access_token,
    msExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    refreshToken: tokens.refresh_token || account.refreshToken,
    xuid: profile.id
  });
  updated.addedAt = account.addedAt || updated.addedAt;
  store.upsertAccount(updated);
  return updated;
}

async function getValidAccount(accountId) {
  const account = store.getAccount(accountId);
  if (!account) throw authError('Аккаунт не найден.', 'ACCOUNT_NOT_FOUND');
  if (account.type === 'offline') return account;
  const expiresAt = Number(account.mcExpiresAt || 0);
  if (account.mcAccessToken && expiresAt > Date.now() + 5 * 60 * 1000) {
    return account;
  }
  return refreshAccount(account);
}

function loginMicrosoft(parentWindow) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let processing = false;
    const authWindow = new BrowserWindow({
      width: 540,
      height: 720,
      parent: parentWindow || undefined,
      modal: Boolean(parentWindow),
      title: 'Вход в Microsoft — Minecraft',
      backgroundColor: '#10120d',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (!authWindow.isDestroyed()) authWindow.close();
      fn(value);
    };

    const inspectUrl = async (rawUrl) => {
      if (!rawUrl || !rawUrl.startsWith(REDIRECT_URI)) return;
      if (processing || settled) return;
      processing = true;
      try {
        const parsed = new URL(rawUrl);
        const code = parsed.searchParams.get('code');
        const error = parsed.searchParams.get('error');
        const errorDescription = parsed.searchParams.get('error_description');
        if (code) {
          if (!authWindow.isDestroyed()) authWindow.close();
          try {
            const tokens = await exchangeCode(code);
            const account = await completeLogin(tokens);
            const existing = store.getAccount(account.id);
            if (existing) {
              account.addedAt = existing.addedAt;
            }
            store.upsertAccount(account);
            store.setActiveAccount(account.id);
            finish(resolve, { ok: true, account: store.sanitizeAccount(account) });
          } catch (err) {
            finish(reject, err);
          }
        } else if (error) {
          finish(reject, authError(errorDescription || 'Вход через Microsoft отменён.', error));
        } else {
          processing = false;
        }
      } catch (err) {
        finish(reject, err);
      }
    };

    authWindow.webContents.on('will-redirect', (_event, url) => inspectUrl(url));
    authWindow.webContents.on('will-navigate', (_event, url) => inspectUrl(url));
    authWindow.webContents.on('did-navigate', (_event, url) => inspectUrl(url));
    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });
    authWindow.on('closed', () => {
      if (!settled && !processing) {
        settled = true;
        reject(authError('Вход через Microsoft отменён.', 'CANCELLED'));
      }
    });

    authWindow.loadURL(AUTHORIZE_URL).catch((err) => finish(reject, err));
  });
}

async function uploadSkin(accountId, pngPath, variant = 'classic') {
  const account = await getValidAccount(accountId);
  if (account.type !== 'microsoft') {
    throw authError('Смена скина через Mojang доступна только для лицензионного аккаунта.', 'OFFLINE_SKIN');
  }
  const buffer = await fs.readFile(pngPath);
  if (buffer.length > 1024 * 1024) throw authError('Файл скина слишком большой (максимум 1 МБ).');
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) {
    throw authError('Скин должен быть PNG-файлом.');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw authError('Размер скина должен быть 64×64 или 64×32 пикселя.');
  }
  const form = new FormData();
  form.append('variant', variant === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([buffer], { type: 'image/png' }), 'skin.png');
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.mcAccessToken}`,
      'User-Agent': 'SunspireLauncher/1.0.0'
    },
    body: form
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw authError(`Mojang отклонил скин (HTTP ${res.status}) ${text.slice(0, 160)}`, 'SKIN_UPLOAD');
  }
  const refreshed = await refreshAccount(account);
  imageCache.clear();
  return store.sanitizeAccount(refreshed);
}

async function setOfflineSkin(accountId, pngPath, variant = 'classic') {
  const account = store.getAccount(accountId);
  if (!account) throw authError('Аккаунт не найден.', 'ACCOUNT_NOT_FOUND');
  const buffer = await fs.readFile(pngPath);
  if (buffer.length > 4 * 1024 * 1024) throw authError('Файл скина слишком большой.');
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) {
    throw authError('Скин должен быть PNG-файлом.');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw authError('Размер скина должен быть 64×64 или 64×32 пикселя.');
  }
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
  store.upsertAccount({ ...account, skinDataUrl: dataUrl, slimArms: variant === 'slim' });
  imageCache.delete(`account:${accountId}`);
  return store.sanitizeAccount(store.getAccount(accountId));
}

async function fetchImageDataUrl(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SunspireLauncher/1.0.0' }
  });
  if (!res.ok) throw new Error(`Не удалось загрузить изображение (HTTP ${res.status})`);
  const type = res.headers.get('content-type') || 'image/png';
  if (!type.startsWith('image/')) throw new Error('Сервер вернул не изображение.');
  const buffer = Buffer.from(await res.arrayBuffer());
  const dataUrl = `data:${type.split(';')[0]};base64,${buffer.toString('base64')}`;
  imageCache.set(url, dataUrl);
  return dataUrl;
}

async function getSkinData(accountId) {
  const account = store.getAccount(accountId);
  if (!account) return null;
  if (account.skinDataUrl) return account.skinDataUrl;
  if (account.skinUrl) {
    try {
      return await fetchImageDataUrl(account.skinUrl);
    } catch {
      // fall through to a friendly default
    }
  }
  try {
    return await fetchImageDataUrl(`https://mc-heads.net/skin/${encodeURIComponent(account.username || 'Steve')}`);
  } catch {
    return null;
  }
}

async function getCapeData(accountId) {
  const account = store.getAccount(accountId);
  if (!account || !account.capeUrl) return null;
  try {
    return await fetchImageDataUrl(account.capeUrl);
  } catch {
    return null;
  }
}

function addOfflineAccount(username) {
  const name = String(username || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw authError('Ник должен содержать 3–16 символов: латинские буквы, цифры или «_».');
  }
  const uuid = require('./http.cjs').offlineUuid(name);
  const existing = store.getState().accounts.find(
    (a) => a.type === 'offline' && a.username.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    store.setActiveAccount(existing.id);
    return { ok: true, account: store.sanitizeAccount(existing) };
  }
  const account = {
    id: `offline-${uuid}`,
    type: 'offline',
    username: name,
    uuid,
    licenseLabel: 'Офлайн · без лицензии',
    skinUrl: '',
    capeUrl: '',
    slimArms: false,
    skinDataUrl: '',
    addedAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };
  store.upsertAccount(account);
  store.setActiveAccount(account.id);
  return { ok: true, account: store.sanitizeAccount(account) };
}

module.exports = {
  loginMicrosoft,
  refreshAccount,
  getValidAccount,
  uploadSkin,
  setOfflineSkin,
  getSkinData,
  getCapeData,
  fetchImageDataUrl,
  addOfflineAccount,
  authError
};
