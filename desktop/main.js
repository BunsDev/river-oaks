import { app, BrowserWindow, Menu, dialog, net, screen, session, shell, ipcMain } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorldDesignPack } from '../scripts/studio-skill-pack.js';
import { createStudioDesignerHost, designerSenderAllowed } from './studio-designer-host.js';
import { createStudioAgentHost } from './studio-agent-host.js';
import { navigationAllowed, windowBounds } from './runtime.js';
import { photoDownloadAllowed } from './photo-download.js';
import { studioDownloadAllowed } from './studio-download.js';
import { deviceSignIn, exchangeDesktopSession } from './auth.js';

app.setName('TypeSafe Place');
app.enableSandbox();
const dev = !app.isPackaged && Boolean(process.env.RIVER_OAKS_DEV_URL);
const profile = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', profile || join(app.getPath('appData'), dev ? 'River Oaks Development' : 'River Oaks'));
let window, designerHost, agentHost, loadedUrl = null, quitting = false, saved = {}, lastRecovery = 0;
const stateFile = join(app.getPath('userData'), 'window.json');
const entry = dev ? process.env.RIVER_OAKS_DEV_URL : 'https://typesafe.place/play';
const gameOrigin = new URL(entry).origin;
const studioEntry = new URL('/studio.html', gameOrigin).href;
let activeEntry = entry;
const clientId = dev ? process.env.WORKOS_CLIENT_ID : 'client_01M3ZHFZDKDSTJ2RNSMP5V9SKV';
if (dev) {
  const url = new URL(entry);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw new Error('Desktop development requires a loopback Vite URL.');
  if (!clientId && process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE !== '1') throw new Error('Desktop development requires WORKOS_CLIENT_ID for the current Staging application.');
}

const excerpt = (text, max) => text.length > max ? `${text.slice(0, max)}…` : text;
// Everything free-form the designer receives is shown before the user agrees.
function designerRequestDetail({ scope, brief, projectBrief, selected, objects }) {
  const shared = scope === 'region' ? `the whole region${objects === null ? '' : ` (${objects} objects)`}` : `${selected} selected object${selected === 1 ? '' : 's'}`;
  return `Shares ${shared}, the task and the project brief. Your configured provider may charge for this request. Codex runs in Coven's read-only mode: it cannot change files, but it can read files this account can read. Proposed edits come back for your review.\n\nTask:\n${excerpt(brief, 600)}\n\nProject brief:\n${projectBrief ? excerpt(projectBrief, 600) : '(none)'}`;
}

async function saveWindow() {
  if (!window || window.isDestroyed()) return;
  const state = { ...window.getNormalBounds(), maximized: window.isMaximized(), fullscreen: window.isFullScreen() };
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state));
}

async function loadGame(target = activeEntry) {
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
    await window.loadURL(target);
  }
  catch (error) {
    // A renderer may veto navigation to protect an unsaved Studio draft.
    if (error.code === 'ERR_ABORTED' || error.errno === -3) return;
    if (quitting || !window || window.isDestroyed()) return;
    const { response } = await dialog.showMessageBox({ type: 'error', message: 'TypeSafe Place could not open', detail: error.message, buttons: ['Try again', 'Quit'], defaultId: 0, cancelId: 1 });
    console.error('Game load failed:', error.message);
    if (response === 0) void loadGame(target); else app.quit();
  }
}

function createWindow() {
  const displays = [screen.getPrimaryDisplay(), ...screen.getAllDisplays().filter(d => d.id !== screen.getPrimaryDisplay().id)].map(d => d.workArea);
  window = new BrowserWindow({
    ...windowBounds(saved, displays), minWidth: 800, minHeight: 600,
    title: dev ? 'TypeSafe Place · Development' : 'TypeSafe Place', backgroundColor: '#18271f', show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: { preload: fileURLToPath(new URL('./studio-preload.cjs', import.meta.url)), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: true, spellcheck: false },
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
  // Keep recovery on the selected app when users follow an in-page app link.
  contents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => { if (isMainFrame) { if (!inPlace) loadedUrl = null; designerHost?.dispose(); agentHost?.dispose(); } });
  contents.on('did-navigate', (_event, url) => {
    // Committed main-frame loads only; in-page pushState never updates this.
    loadedUrl = url;
    if (!navigationAllowed(url, entry)) return;
    const pathname = new URL(url).pathname;
    if (pathname === '/studio.html' || pathname === '/studio') activeEntry = studioEntry;
    else if (pathname === '/play' || pathname === '/' || pathname === new URL(entry).pathname) activeEntry = entry;
  });
  contents.on('will-prevent-unload', event => {
    const response = dialog.showMessageBoxSync(window, {
      type: 'warning', message: 'Discard unsaved changes?',
      detail: 'Your changes have not been saved on this device. Keep editing to save them before leaving.',
      buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0,
    });
    // Electron requires a synchronous decision. Overriding this event allows
    // unload; leaving it alone preserves the renderer's cancellation.
    if (response === 1) event.preventDefault();
    else quitting = false; // A canceled app quit must restore normal recovery.
  });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('render-process-gone', async (_event, details) => {
    designerHost?.dispose(); agentHost?.dispose();
    if (quitting || details.reason === 'clean-exit') return;
    console.error(`Game renderer stopped: ${details.reason}`);
    // Recover once automatically; repeated crashes require a decision, never a reload loop.
    if (Date.now() - lastRecovery > 60_000) { lastRecovery = Date.now(); void loadGame(); return; }
    const { response } = await dialog.showMessageBox(window, { type: 'error', message: 'The game stopped unexpectedly', detail: 'Reload the current app. Saved Studio drafts and game preferences are preserved; unsaved edits may be lost.', buttons: ['Reload game', 'Quit'], cancelId: 1 });
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
  app.on('window-all-closed', () => { designerHost?.dispose(); agentHost?.dispose(); app.quit(); });
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (event, item, contents) => {
      const download = {
        url: item.getURL(), initiator: item.getInitiatorOrigin(), filename: item.getFilename(),
        mime: item.getMimeType(), bytes: item.getTotalBytes(), userGesture: item.hasUserGesture(),
      };
      const studio = studioDownloadAllowed(download, gameOrigin);
      if (contents !== window?.webContents || (!studio && !photoDownloadAllowed(download, gameOrigin))) { event.preventDefault(); return; }
      item.setSaveDialogOptions({ title: studio ? 'Export World Studio region' : 'Save your River Oaks photo', defaultPath: item.getFilename(),
        filters: studio ? [{ name: 'Region JSON', extensions: ['json'] }] : [{ name: 'PNG image', extensions: ['png'] }] });
    });
    try {
      const state = JSON.parse(await readFile(stateFile, 'utf8'));
      if (state && typeof state === 'object') saved = state;
    } catch { /* First run or invalid state uses safe defaults. */ }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'Game', submenu: [{ label: 'World Studio', click: () => void loadGame(studioEntry) }, { label: 'Return to world', click: () => void loadGame(entry) }, { type: 'separator' }, { label: 'Reload game', accelerator: 'CmdOrCtrl+R', click: () => window?.webContents.reload() }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      // Debug tools (colliders, walkable grid, polygon inspector) live in the game; F3 toggles them there too.
      { label: 'View', submenu: [{ role: 'togglefullscreen' }, { label: 'Debug tools', accelerator: 'F3', click: () => window?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('river-oaks:debug'))").catch(() => {}) }, ...(dev ? [{ role: 'toggleDevTools' }] : [])] },
      { role: 'windowMenu' },
      { label: 'Help', submenu: [{ label: 'Game controls', click: () => dialog.showMessageBox(window, { message: 'Explore TypeSafe Place', detail: 'WASD · Walk\nDrag · Look around\nShift · Walk faster\nE · Talk nearby\nF · Enter or leave a shop\nB · Fly or land\nSpace / C · Rise / descend\nV · Change camera\nH · Hide or show the HUD\n\nGraphics and appearance are in Settings. Auto adjusts scene resolution to the available frame budget.' }) }] },
    ]));
    const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
    const pack = app.isPackaged ? JSON.parse(await readFile(join(sourceRoot, 'desktop/world-design-pack.json'), 'utf8')) : await buildWorldDesignPack(sourceRoot);
    designerHost = createStudioDesignerHost({ root: join(app.getPath('userData'), 'designer'), pack,
      executable: process.env.RIVER_OAKS_DESIGNER_COVEN || 'coven', model: process.env.RIVER_OAKS_DESIGNER_MODEL || null,
      confirm: async request => {
        const { response } = await dialog.showMessageBox(window, { type: 'question', defaultId: 0, cancelId: 0, buttons: ['Cancel', request.kind === 'connect' ? 'Connect' : 'Send task'],
          message: request.kind === 'connect' ? `Set up ${request.name}?` : `Send this task to ${request.name}?`,
          detail: request.kind === 'connect'
            ? 'Studio installs its world-building skills in a private project workspace. A dedicated familiar gets its own local Coven instance and identity. Existing familiars are unchanged. Codex uses the sign-in on this device; provider authentication remains unverified until you send a task.'
            : designerRequestDetail(request) });
        return response === 1;
      },
    });
    for (const method of ['catalog','connect','request','cancel','disconnect']) ipcMain.handle(`studio-designer:${method}`, async (event, input) => {
      if (!designerSenderAllowed(event, window?.webContents, gameOrigin, loadedUrl)) throw Error('Designer access is limited to the main Studio window.');
      const frame = event.senderFrame;
      const result = await designerHost[method](input);
      if (frame.isDestroyed() || !designerSenderAllowed(event, window?.webContents, gameOrigin, loadedUrl)) { designerHost.dispose(); throw Error('Studio navigation canceled this operation.'); }
      return result;
    });
    agentHost = createStudioAgentHost({ root: join(app.getPath('userData'), 'studio-agent'),
      confirm: async ({ name }) => {
        const { response } = await dialog.showMessageBox(window, { type: 'question', defaultId: 0, cancelId: 0, buttons: ['Cancel', `Use ${name}`],
          message: `Chat with the World Studio agent through ${name}?`,
          detail: `Studio runs the ${name} CLI installed on this device with your existing sign-in. Your messages and this region's scene snapshot are sent to ${name}; usage may be billed. The agent has no tools and only proposes edits, which Studio validates before they change your draft. You will not be asked again until the app restarts.` });
        return response === 1;
      },
    });
    for (const method of ['catalog','send','cancel','reset']) ipcMain.handle(`studio-agent:${method}`, async (event, input) => {
      if (!designerSenderAllowed(event, window?.webContents, gameOrigin, loadedUrl)) throw Error('Agent chat is limited to the main Studio window.');
      const frame = event.senderFrame, sender = event.sender;
      const onDelta = text => { if (!frame.isDestroyed() && designerSenderAllowed(event, window?.webContents, gameOrigin, loadedUrl)) sender.send('studio-agent:delta', { requestId: input.requestId, text }); };
      const result = await agentHost[method](input, { onDelta });
      if (frame.isDestroyed() || !designerSenderAllowed(event, window?.webContents, gameOrigin, loadedUrl)) { agentHost.dispose(); throw Error('Studio navigation canceled this operation.'); }
      return result;
    });
    createWindow();
  }).catch(error => { console.error('Desktop startup failed:', error); app.exit(1); });
}
