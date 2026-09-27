import { app, BrowserWindow, Menu, dialog, net, protocol, screen, session, shell } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { navigationAllowed, resolveAsset, windowBounds } from './runtime.js';

app.setName('River Oaks');
app.enableSandbox();
const dev = !app.isPackaged && Boolean(process.env.RIVER_OAKS_DEV_URL);
const profile = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', profile || join(app.getPath('appData'), dev ? 'River Oaks Development' : 'River Oaks'));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
let window, quitting = false, saved = {}, lastRecovery = 0;
const stateFile = join(app.getPath('userData'), 'window.json');
const entry = dev ? process.env.RIVER_OAKS_DEV_URL : 'app://game/';
if (dev) {
  const url = new URL(entry);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw new Error('Desktop development requires a loopback Vite URL.');
}

async function saveWindow() {
  if (!window || window.isDestroyed()) return;
  const state = { ...window.getNormalBounds(), maximized: window.isMaximized(), fullscreen: window.isFullScreen() };
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state));
}

async function loadGame() {
  try { await window.loadURL(entry); }
  catch (error) {
    if (quitting || !window || window.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(window, { type: 'error', message: 'River Oaks could not open', detail: dev ? 'The development server may have stopped. Restart npm run desktop:dev to reconnect.' : 'The bundled game could not load. Try reopening the application.', buttons: ['Try again', 'Quit'], defaultId: 0, cancelId: 1 });
    console.error('Game load failed:', error.message);
    if (response === 0) void loadGame(); else app.quit();
  }
}

function createWindow() {
  const displays = [screen.getPrimaryDisplay(), ...screen.getAllDisplays().filter(d => d.id !== screen.getPrimaryDisplay().id)].map(d => d.workArea);
  window = new BrowserWindow({
    ...windowBounds(saved, displays), minWidth: 800, minHeight: 600,
    title: dev ? 'River Oaks · Development' : 'River Oaks', backgroundColor: '#18271f', show: false,
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
  for (const eventName of ['will-navigate', 'will-redirect']) contents.on(eventName, (event, url) => { if (!navigationAllowed(url, entry)) event.preventDefault(); });
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
    session.defaultSession.on('will-download', event => event.preventDefault());
    if (!dev) {
      const root = fileURLToPath(new URL('../dist/preview/', import.meta.url));
      protocol.handle('app', async request => {
        if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
        const file = await resolveAsset(root, request.url);
        if (!file) return new Response('Not found', { status: 404 });
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'");
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
      });
    }
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
      { label: 'Help', submenu: [{ label: 'Game controls', click: () => dialog.showMessageBox(window, { message: 'Explore River Oaks', detail: 'WASD · Walk\nDrag · Look around\nShift · Walk faster\nE · Talk nearby\nF · Enter or leave a shop\nB · Fly or land\nSpace / C · Rise / descend\nV · Change camera\nH · Hide or show the HUD\n\nGraphics and appearance are in Settings. Auto adjusts scene resolution to the available frame budget.' }) }] },
    ]));
    createWindow();
  }).catch(error => { console.error('Desktop startup failed:', error); app.exit(1); });
}
