import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createSocket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(join(root, '.runtime'), { recursive: true });
const profile = await mkdtemp(join(root, '.runtime/studio-desktop-'));
let vite, app;
const report = { scope: 'Development Electron with loopback acceptance identity; save destination supplied by test. No live auth, packaged build, or native dialog interaction.', checks: [] };
const check = name => { report.checks.push(name); console.log(`✓ ${name}`); };
try {
  const socket = createSocket();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  Object.assign(process.env, { RIVER_OAKS_ACCEPTANCE_FIXTURE: '1', RIVER_OAKS_DEV_AUTH: 'local', RIVER_OAKS_DEV_TOWN: 'on',
    RIVER_OAKS_DEV_TOWN_PORT: String(port), MODERATION_FILE: join(profile, 'moderation.json'), WAITLIST_FILE: join(profile, 'waitlist.json') });
  const { createServer } = await import('vite');
  vite = await createServer({ configFile: join(root, 'preview/vite.config.js'), server: { port: 0 } });
  await vite.listen();
  const entry = `http://127.0.0.1:${vite.httpServer.address().port}/`;
  const env = { ...process.env, RIVER_OAKS_DEV_URL: entry };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`], env, timeout: 30000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(30000);
  // Electron owns beforeunload decisions; prevent Playwright auto-handling a
  // Chromium dialog that Electron already consumed in will-prevent-unload.
  page.on('dialog', dialog => { if (dialog.type() !== 'beforeunload') void dialog.dismiss(); });
  await page.route('**/v1/**', route => route.fulfill({ status: 503, json: { error: 'Offline studio fixture' } }));
  await page.waitForURL(entry);
  const menu = async label => app.evaluate(({ Menu }, label) => {
    const item = Menu.getApplicationMenu().items.find(item => item.label === 'Game').submenu.items.find(item => item.label === label);
    if (!item) throw new Error(`Missing native Game menu item: ${label}`);
    item.click();
  }, label);
  await menu('World Studio');
  await page.waitForURL(new URL('/studio.html', entry).href);
  await page.waitForFunction(() => document.body.dataset.studioReady === 'true');
  assert.equal(await page.locator('#studio-viewport canvas').count(), 1);
  check('native World Studio menu opens the ready editor on the game origin');
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
  });
  assert.deepEqual(prefs, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.getByRole('button', { name: 'Add building', exact: true }).click();
  await page.getByLabel('East (m)', { exact: true }).fill('24');
  await page.getByLabel('East (m)', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Save on device', exact: true }).click();
  const savedDraft = await page.evaluate(() => localStorage.getItem('river-oaks-world-studio-v1'));
  assert.equal(JSON.parse(savedDraft).region.buildings[0].center[0], 24);
  const destination = join(profile, 'region.json');
  await app.evaluate(({ session }, destination) => {
    session.defaultSession.on('will-download', (event, item) => {
      globalThis.studioDownloadResult = { blocked: event.defaultPrevented };
      if (event.defaultPrevented) return;
      globalThis.studioDownloadResult.options = item.getSaveDialogOptions();
      item.setSavePath(destination);
      item.once('done', (_event, state) => { globalThis.studioDownloadResult.state = state; });
    });
  }, destination);
  const waitDownload = async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const result = await app.evaluate(() => globalThis.studioDownloadResult);
      if (result?.blocked || result?.state) return result;
      await delay(100);
    }
    throw new Error('Studio download did not finish.');
  };
  await page.locator('#studio-export').click();
  const download = await waitDownload();
  assert.equal(download.blocked, false);
  assert.equal(download.state, 'completed');
  assert.deepEqual(download.options.filters, [{ name: 'Region JSON', extensions: ['json'] }]);
  const region = JSON.parse(await readFile(destination, 'utf8'));
  assert.equal(region.schema_version, 1);
  assert.equal(region.buildings[0].center[0], 24);
  check('actual Studio export passes native policy, uses a JSON save filter and writes region-v1');
  await app.evaluate(() => { globalThis.studioDownloadResult = null; });
  await page.evaluate(() => {
    const link = document.createElement('a'); link.id = 'rejected-studio-download'; link.textContent = 'Download fixture';
    link.download = 'world-studio-region.json'; link.href = URL.createObjectURL(new Blob(['x'.repeat(128 * 1024 + 1)], { type: 'application/json' }));
    document.body.append(link);
  });
  await page.locator('#rejected-studio-download').click();
  assert.equal((await waitDownload()).blocked, true);
  check('oversized JSON remains blocked in the real Electron download handler');
  const studioURL = page.url();
  await page.getByRole('button', { name: 'Add tree', exact: true }).click();
  await app.evaluate(({ dialog }) => {
    globalThis.studioUnloadPrompts = [];
    globalThis.studioLoadErrors = [];
    globalThis.studioUnloadChoice = 0;
    globalThis.studioOriginalMessageBox = dialog.showMessageBox;
    globalThis.studioOriginalMessageBoxSync = dialog.showMessageBoxSync;
    dialog.showMessageBoxSync = (_window, options) => {
      globalThis.studioUnloadPrompts.push(options);
      return globalThis.studioUnloadChoice;
    };
    // A canceled unload must not create a second load-error prompt.
    dialog.showMessageBox = (_window, options) => {
      globalThis.studioLoadErrors.push(options ?? _window);
      return new Promise(() => {});
    };
  });
  await menu('Return to world');
  const promptDeadline = Date.now() + 3000;
  while (Date.now() < promptDeadline && await app.evaluate(() => globalThis.studioUnloadPrompts.length) === 0) await delay(50);
  const prompts = await app.evaluate(() => globalThis.studioUnloadPrompts);
  assert.equal(prompts.length, 1, 'native navigation presents an unsaved-changes choice');
  assert.deepEqual(prompts[0].buttons, ['Keep editing', 'Discard changes']);
  assert.equal(prompts[0].defaultId, 0);
  assert.equal(prompts[0].cancelId, 0);
  await delay(250);
  assert.equal(page.url(), studioURL);
  assert.equal(await page.locator('[data-item=tree-1]').count(), 1);
  assert.deepEqual(await app.evaluate(() => globalThis.studioLoadErrors), []);
  check('Keep editing preserves unsaved work without a load-error prompt');
  await app.evaluate(() => { globalThis.studioUnloadChoice = 1; });
  await menu('Return to world');
  await page.waitForURL(entry);
  assert.equal(await app.evaluate(() => globalThis.studioUnloadPrompts.length), 2);
  assert.deepEqual(await app.evaluate(() => globalThis.studioLoadErrors), []);
  check('Discard changes explicitly permits native navigation');
  await menu('World Studio');
  await page.waitForFunction(() => document.body.dataset.studioReady === 'true');
  assert.equal(await page.locator('[data-item=tree-1]').count(), 0);
  check('Return to world and World Studio native menu round trip preserves only the saved draft');
  await page.locator('#studio-templates').click();
  await page.getByRole('button', { name:'Use Garden Office', exact:true }).click();
  await page.locator('#studio-assessment-status').filter({hasText:'Required routes passed'}).waitFor();
  await page.locator('#studio-save').click();
  const spaceDraft = await page.evaluate(() => localStorage.getItem('river-oaks-world-studio-v1'));
  assert.deepEqual(JSON.parse(spaceDraft).assessmentContext, {templateId:'office',profileVersion:1});
  await page.reload();await page.waitForFunction(() => document.body.dataset.studioReady === 'true');
  assert.equal(await page.locator('#studio-profile').inputValue(), 'office');
  await page.locator('#studio-assessment-status').filter({hasText:'Required routes passed'}).waitFor();
  check('native Studio save/reopen retains the template assessment sidecar');
  await app.evaluate(() => { globalThis.studioDownloadResult = null; });
  await page.locator('#studio-export').click();
  assert.equal((await waitDownload()).state, 'completed');
  const space = JSON.parse(await readFile(destination, 'utf8'));
  assert.equal(space.document_type, 'studio-space');
  assert.equal(space.schema_version, 1);
  assert.equal(space.assessmentContext, undefined);
  await page.locator('#studio-import').setInputFiles({name:'space.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(space))});
  await page.locator('#studio-assessment-status').filter({hasText:'Not assessed.'}).waitFor();
  check('native space export/import stays bare v1 and does not fabricate an assessment');
  // Restore the existing region fixture before its independent crash-recovery checks.
  await page.evaluate(saved => localStorage.setItem('river-oaks-world-studio-v1', saved), savedDraft);
  await app.evaluate(() => { globalThis.studioUnloadChoice = 1; });
  await page.reload();await page.waitForFunction(() => document.body.dataset.studioReady === 'true');
  await page.evaluate(() => { location.href = 'https://example.com/'; });
  await delay(250);
  assert.equal(page.url(), studioURL);
  check('studio preserves renderer isolation and blocks external navigation');
  // Navigate through the hosted clean-URL form from the world, so recovery
  // cannot accidentally inherit the previous native Studio menu selection.
  await menu('Return to world');
  await page.waitForURL(entry);
  await page.goto(new URL('/studio', entry).href);
  await page.waitForFunction(() => document.body.dataset.studioReady === 'true');
  await page.getByRole('button', { name: 'Add tree', exact: true }).click();
  await app.evaluate(() => { globalThis.studioUnloadChoice = 0; });
  const promptsBeforeCancel=await app.evaluate(() => globalThis.studioUnloadPrompts.length);
  await menu('Return to world');
  const cancelDeadline = Date.now() + 3000;
  while (Date.now() < cancelDeadline && await app.evaluate(() => globalThis.studioUnloadPrompts.length) < promptsBeforeCancel+1) await delay(50);
  assert.equal(await app.evaluate(() => globalThis.studioUnloadPrompts.length), promptsBeforeCancel+1);
  assert.equal(new URL(page.url()).pathname, '/studio');
  assert.deepEqual(await app.evaluate(() => globalThis.studioLoadErrors), []);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  const closeDeadline = Date.now() + 3000;
  while (Date.now() < closeDeadline && await app.evaluate(() => globalThis.studioUnloadPrompts.length) < promptsBeforeCancel+2) await delay(50);
  assert.equal(await app.evaluate(() => globalThis.studioUnloadPrompts.length), promptsBeforeCancel+2);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  check('Keep editing cancels closing the native window');
  // Release renderer interception before deliberate crash: Playwright retains
  // the old target while Electron creates its replacement. Studio uses no providers.
  await page.unrouteAll({ behavior: 'wait' });
  const recovered = await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Studio crash reload timed out')), 30000);
      contents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
      contents.forcefullyCrashRenderer();
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await contents.executeJavaScript("document.body.dataset.studioReady === 'true'")) return contents.getURL();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return contents.getURL();
  });
  assert.equal(recovered, new URL('/studio.html', entry).href);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript("document.body.dataset.studioReady === 'true'")), true);
  const restored = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript("({ saved: localStorage.getItem('river-oaks-world-studio-v1'), building: Boolean(document.querySelector('[data-item=building-1]')) })"));
  assert.equal(restored.saved, savedDraft);
  assert.equal(restored.building, true);
  check('crash after canceled clean-URL navigation and window close recovers Studio and its saved draft');
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = globalThis.studioOriginalMessageBox;
    dialog.showMessageBoxSync = globalThis.studioOriginalMessageBoxSync;
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack; process.exitCode = 1;
  console.error(error.stack);
} finally {
  if (report.status === 'failed') await app?.evaluate(({ app }) => app.exit(1)).catch(() => {});
  await app?.close().catch(() => {}); await vite?.close(); await rm(profile, { recursive: true, force: true });
  await mkdir(join(root, '.runtime/agent'), { recursive: true });
  await writeFile(join(root, '.runtime/agent/studio-desktop.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
