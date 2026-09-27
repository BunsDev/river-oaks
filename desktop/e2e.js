import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'river-oaks-e2e-'));
const env = { ...process.env };
let vite;
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  vite = await createServer({ configFile: join(root, 'preview/vite.config.js'), server: { port: 0 } });
  await vite.listen();
  env.RIVER_OAKS_DEV_URL = `http://127.0.0.1:${vite.httpServer.address().port}/`;
}
delete env.ELECTRON_RUN_AS_NODE;
const started = performance.now();
const executablePath = process.env.RIVER_OAKS_DESKTOP_EXECUTABLE;
const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : [root]), `--user-data-dir=${profile}`], env, timeout: 30000 });
const errors = [], failedAssets = [], tempFiles = [];
const report = { mode: executablePath ? 'packaged' : env.RIVER_OAKS_DEV_URL ? 'development' : 'bundled', checks: [] };
function check(name) { report.checks.push(name); console.log(`✓ ${name}`); }
try {
  const page = await app.firstWindow();
  console.log(`Desktop test window: ${report.mode}`);
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()?.errorText));
  page.on('response', response => { if (response.status() >= 400 && /\/(assets|data)\//.test(response.url())) failedAssets.push(`${response.status()} ${response.url()}`); });
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#viewport').dataset.assetProgress || '{}').done === true);
  report.readyMs = Math.round(performance.now() - started);
  report.assets = await page.locator('#viewport').evaluate(el => JSON.parse(el.dataset.assetProgress));
  assert.equal(report.assets.failed, 0);
  assert.deepEqual(failedAssets, []);
  check('all bundled assets and playable character loaded');
  const security = await app.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
  });
  assert.deepEqual(security, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  check('sandbox and renderer isolation');
  const panel = page.locator('#panel-toggle');
  if (await panel.getAttribute('aria-expanded') === 'true') await panel.click();
  await page.locator('#canvas-host').focus();
  const position = () => page.locator('#walking-hud').evaluate(el => JSON.parse(el.dataset.position));
  const before = await position();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
  const after = await position();
  assert.ok(Math.hypot(after[0] - before[0], after[2] - before[2]) > 0.5, 'W moves the player');
  check('keyboard movement');
  const sharedTown = await page.locator('#canvas-host').getAttribute('data-multiplayer') === 'joined';
  report.sharedTown = sharedTown;
  await panel.click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('#destination').selectOption({ label: 'Hermès' });
  const beforeTravel = await position();
  await page.locator('#visit-destination').click();
  await page.waitForFunction(before => {
    const after = JSON.parse(document.querySelector('#walking-hud').dataset.position);
    return Math.hypot(after[0] - before[0], after[2] - before[2]) > 1;
  }, beforeTravel);
  // The shared server intentionally rate-limits travel to once per second.
  if (sharedTown) await page.waitForTimeout(1100);
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => document.body.classList.contains('inside-store'));
  await page.locator('#canvas-host').focus();
  if (sharedTown) await page.waitForTimeout(1100);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => !document.body.classList.contains('inside-store'));
  check('shop arrival, enter and exit');
  await page.locator('[data-section=community-section]').click();
  if (sharedTown) await page.waitForTimeout(1100);
  await page.locator('#community-meet').click();
  await page.locator('#community-about').click();
  await page.waitForFunction(() => document.querySelector('#community-speech').textContent.length > 40);
  await page.locator('#community-close').click();
  check('resident conversation');
  await page.locator('[data-section=settings-section]').click();
  await page.locator('[data-quality=smooth]').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('#canvas-host').dataset.quality || '{}').mode === 'smooth');
  await page.reload();
  await page.locator('#loading').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-quality=smooth]').getAttribute('aria-pressed'), 'true');
  check('graphics preference survives reload');
  if (await panel.getAttribute('aria-expanded') === 'false') await panel.click();
  await page.locator('[data-section=settings-section]').click();
  await page.locator('[data-quality=auto]').click();
  await panel.click();
  await page.waitForTimeout(5000);
  report.performance = await page.evaluate(async () => {
    const intervals = [];
    let last;
    const start = performance.now();
    await new Promise(resolve => {
      function frame(now) { if (last !== undefined) intervals.push(now - last); last = now; if (now - start < 10000) requestAnimationFrame(frame); else resolve(); }
      requestAnimationFrame(frame);
    });
    intervals.sort((a, b) => a - b);
    const host = document.querySelector('#canvas-host');
    const canvas = host.querySelector('canvas');
    return { samples: intervals.length, medianMs: intervals[Math.floor(intervals.length * 0.5)], p95Ms: intervals[Math.floor(intervals.length * 0.95)], meanFps: 1000 * intervals.length / intervals.reduce((a, b) => a + b, 0), canvas: [canvas.width, canvas.height], quality: JSON.parse(host.dataset.quality), renderer: JSON.parse(host.dataset.renderStats) };
  });
  assert.ok(report.performance.samples > 100, 'render loop keeps advancing');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
  await page.waitForTimeout(1200);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
  await page.waitForTimeout(1200);
  check('native fullscreen round trip');
  // Playwright forces renderer visibility; native window state and the
  // visibility binding's unit tests cover minimize without relying on that emulation.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await page.waitForTimeout(400);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), true);
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.focus(); });
  await page.waitForTimeout(400);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), false);
  check('native minimize and restore');
  if (vite) {
    const probe = `desktop-hmr-${process.pid}.css`;
    const file = join(root, 'preview', probe);
    tempFiles.push(file);
    await writeFile(file, ':root { --desktop-hmr-probe: before; }');
    await page.evaluate(path => import(path), `/${probe}`);
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--desktop-hmr-probe').trim() === 'before');
    await writeFile(file, ':root { --desktop-hmr-probe: after; }');
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--desktop-hmr-probe').trim() === 'after');
    check('live CSS edits hot reload in the desktop window');
  }
  const originalURL = page.url();
  await page.evaluate(() => { location.href = 'https://example.com/'; });
  await page.waitForTimeout(250);
  assert.equal(page.url(), originalURL);
  check('external navigation blocked');
  await mkdir(join(root, 'output/playwright'), { recursive: true });
  await page.screenshot({ path: join(root, `output/playwright/desktop-${report.mode}.png`) });
  // Playwright marks a deliberately crashed Page permanently crashed. Verify
  // automatic recovery through the surviving native webContents instead.
  const recovered = await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    await new Promise(resolve => {
      contents.once('did-finish-load', resolve);
      contents.forcefullyCrashRenderer();
    });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const ready = await contents.executeJavaScript("document.querySelector('#loading')?.hidden && document.querySelector('#canvas-host')?.dataset.playerReady === 'true'");
      if (ready) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  });
  assert.equal(recovered, true, 'crash recovery rebuilds a playable character');
  check('renderer crash recovers to playable game');
  report.gpu = await app.evaluate(({ app }) => app.getGPUFeatureStatus());
  assert.deepEqual(errors, []);
  report.errors = errors;
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack; report.errors = errors;
  throw error;
} finally {
  await mkdir(join(root, 'data/reports'), { recursive: true });
  await writeFile(join(root, `data/reports/desktop-${report.mode}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  await app.close();
  await vite?.close();
  for (const file of tempFiles) await rm(file, { force: true });
  await rm(profile, { recursive: true, force: true });
}
