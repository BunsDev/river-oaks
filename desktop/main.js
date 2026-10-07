import { app, BrowserWindow, Menu, dialog, net, screen, session, shell } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { navigationAllowed, windowBounds } from './runtime.js';
import { photoDownloadAllowed } from './photo-download.js';
import { deviceSignIn, exchangeDesktopSession } from './auth.js';

app.setName('TypeSafe Place');
app.enableSandbox();
const dev = !app.isPackaged && Boolean(process.env.RIVER_OAKS_DEV_URL);
const profile = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', profile || join(app.getPath('appData'), dev ? 'River Oaks Development' : 'River Oaks'));
let window, quitting = false, saved = {}, lastRecovery = 0;
const stateFile = join(app.getPath('userData'), 'window.json');
const entry = dev ? process.env.RIVER_OAKS_DEV_URL : 'https://typesafe.place/play';
const gameOrigin = new URL(entry).origin;
const clientId = dev ? process.env.WORKOS_CLIENT_ID : 'client_01M3ZHFZDKDSTJ2RNSMP5V9SKV';
if (dev) {
  const url = new URL(entry);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw new Error('Desktop development requires a loopback Vite URL.');
  if (!clientId && process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE !== '1') throw new Error('Desktop development requires WORKOS_CLIENT_ID for the current Staging application.');
}

async function saveWindow() {
  if (!window || window.isDestroyed()) return;
  const state = { ...window.getNormalBounds(), maximized: window.isMaximized(), fullscreen: window.isFullScreen() };
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state));
}

async function loadGame() {
  try {
    const current = await net.fetch(`${gameOrigin}/auth/session`, { credentials: 'include' }).then(response => response.json()).catch(() => null);
    if (!current?.authenticated) {
      const refreshToken = await deviceSignIn({ clientId, openBrowser: async (url, code) => {
        const verification = new URL(url);
        verification.search = '';
        verification.hash = '';
        const { response } = await dialog.showMessageBox({ type: 'info', message: 'Sign in to TypeSafe Place',
          detail: `Choose GitHub and confirm code ${code}. To avoid an existing Google session, open ${verification} in a private window and enter the code there.`,
          buttons: ['Open browser', 'Use private window', 'Quit'], defaultId: 0, cancelId: 2 });
        if (response === 2) return false;
        if (response === 0) await shell.openExternal(url);
        return true;
      } });
      if (!refreshToken) { app.quit(); return; }
      const cookie = await exchangeDesktopSession({ origin: gameOrigin, refreshToken });
      await session.defaultSession.cookies.set({ url: gameOrigin, name: 'river_oaks_session', ...cookie,
        httpOnly: true, secure: !dev, sameSite: 'lax' });
    }
    await window.loadURL(entry);
  }
  catch (error) {
    if (quitting || !window || window.isDestroyed()) return;
    const { response } = await dialog.showMessageBox({ type: 'error', message: 'TypeSafe Place could not open', detail: error.message, buttons: ['Try again', 'Quit'], defaultId: 0, cancelId: 1 });
    console.error('Game load failed:', error.message);
    if (response === 0) void loadGame(); else app.quit();
  }
}

function createWindow() {
  const displays = [screen.getPrimaryDisplay(), ...screen.getAllDisplays().filter(d => d.id !== screen.getPrimaryDisplay().id)].map(d => d.workArea);
  window = new BrowserWindow({
    ...windowBounds(saved, displays), minWidth: 800, minHeight: 600,
    title: dev ? 'TypeSafe Place · Development' : 'TypeSafe Place', backgroundColor: '#18271f', show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: true, spellcheck: false },
  });
  window.on('page-title-updated', event => event.preventDefault());
  window.once('ready-to-show', () => {
    if (saved.maximized) window.maximize();
    if (saved.fullscreen) window.setFullScreen(true);
    window.show();
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    // External references need an explicit native confirmation before opening.
    if (/^https:\/\//.test(url)) void dialog.showMessageBox(window, { message: 'Open this link in your browser?', detail: url, buttons: ['Cancel', 'Open browser'], defaultId: 0, cancelId: 0 }).then(({ response }) => { if (response === 1) void shell.openExternal(url); });
    return { action: 'deny' };
  });
  for (const eventName of ['will-navigate', 'will-redirect']) contents.on(eventName, (event, url) => {
    let target;
    try { target = new URL(url); } catch { event.preventDefault(); return; }
    if (target.origin === gameOrigin && target.pathname === '/auth/login') {
      event.preventDefault(); void loadGame(); return;
    }
    if (target.hostname === 'api.workos.com' && target.pathname.includes('/logout')) {
      event.preventDefault(); void contents.loadURL(entry); return;
    }
    if (!navigationAllowed(url, entry)) event.preventDefault();
  });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('render-process-gone', async (_event, details) => {
    if (quitting || details.reason === 'clean-exit') return;
    console.error(`Game renderer stopped: ${details.reason}`);
    // Recover once automatically; repeated crashes require a decision, never a reload loop.
    if (Date.now() - lastRecovery > 60_000) { lastRecovery = Date.now(); void loadGame(); return; }
    const { response } = await dialog.showMessageBox(window, { type: 'error', message: 'The game stopped unexpectedly', detail: 'Reload to rebuild the district. Your appearance and graphics preferences are preserved.', buttons: ['Reload game', 'Quit'], cancelId: 1 });
    if (response === 0) void loadGame(); else app.quit();
  });
  window.on('unresponsive', async () => {
    const { response } = await dialog.showMessageBox(window, { type: 'warning', message: 'The game is taking longer than expected', buttons: ['Keep waiting', 'Reload game'], defaultId: 0, cancelId: 0 });
    if (response === 1 && !contents.isDestroyed()) contents.reload();
  });
  window.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    void saveWindow().catch(console.error).finally(() => { quitting = true; app.quit(); });
  });
  void loadGame();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.show(); window?.focus(); });
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    void saveWindow().catch(console.error).finally(() => { quitting = true; app.quit(); });
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (event, item, contents) => {
      const allowed = contents === window?.webContents && photoDownloadAllowed({
        url: item.getURL(), initiator: item.getInitiatorOrigin(), filename: item.getFilename(),
        mime: item.getMimeType(), bytes: item.getTotalBytes(), userGesture: item.hasUserGesture(),
      }, gameOrigin);
      if (!allowed) { event.preventDefault(); return; }
      item.setSaveDialogOptions({ title: 'Save your River Oaks photo', defaultPath: item.getFilename(),
        filters: [{ name: 'PNG image', extensions: ['png'] }] });
    });
    try {
      const state = JSON.parse(await readFile(stateFile, 'utf8'));
      if (state && typeof state === 'object') saved = state;
    } catch { /* First run or invalid state uses safe defaults. */ }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'Game', submenu: [{ label: 'Reload game', accelerator: 'CmdOrCtrl+R', click: () => window?.webContents.reload() }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      // Debug tools (colliders, walkable grid, polygon inspector) live in the game; F3 toggles them there too.
      { label: 'View', submenu: [{ role: 'togglefullscreen' }, { label: 'Debug tools', accelerator: 'F3', click: () => window?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('river-oaks:debug'))").catch(() => {}) }, ...(dev ? [{ role: 'toggleDevTools' }] : [])] },
      { role: 'windowMenu' },
      { label: 'Help', submenu: [{ label: 'Game controls', click: () => dialog.showMessageBox(window, { message: 'Explore TypeSafe Place', detail: 'WASD · Walk\nDrag · Look around\nShift · Walk faster\nE · Talk nearby\nF · Enter or leave a shop\nB · Fly or land\nSpace / C · Rise / descend\nV · Change camera\nH · Hide or show the HUD\n\nGraphics and appearance are in Settings. Auto adjusts scene resolution to the available frame budget.' }) }] },
    ]));
    createWindow();
  }).catch(error => { console.error('Desktop startup failed:', error); app.exit(1); });
}
