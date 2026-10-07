import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createSocket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'river-photo-desktop-'));
let vite, app;
const report = { createdAt: new Date().toISOString(), scope: 'Development Electron, loopback shared identities; save dialog path supplied by test. No live auth or OS sharing.', status: 'running', checks: [] };
try {
  const socket = createSocket();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  Object.assign(process.env, { RIVER_OAKS_ACCEPTANCE_FIXTURE: '1', RIVER_OAKS_DEV_AUTH: 'local', RIVER_OAKS_DEV_TOWN: 'on',
    RIVER_OAKS_DEV_TOWN_PORT: String(port), VITE_MULTIPLAYER: 'auto', MODERATION_FILE: join(profile, 'moderation.json'), WAITLIST_FILE: join(profile, 'waitlist.json') });
  const { createServer } = await import('vite');
  vite = await createServer({ configFile: join(root, 'preview/vite.config.js'), server: { port: 0 } });
  await vite.listen();
  const env = { ...process.env, RIVER_OAKS_DEV_URL: `http://127.0.0.1:${vite.httpServer.address().port}/` };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`], env, timeout: 30000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(120000);
  // This acceptance run never invokes local/paid provider services.
  await page.route('**/v1/**', route => route.fulfill({ status: 503, json: { error: 'Offline photo fixture' } }));
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.multiplayer === 'joined');
  await page.locator('.commands-toggle').click();
  await page.locator('.rail-commands').getByRole('button', { name: /Photo mode/ }).click();
  await page.locator('.photo-mode [name=format]').selectOption('1');
  await page.locator('.photo-capture').click();
  await page.locator('.photo-result').waitFor({ state: 'visible' });
  const destination = join(profile, 'photo.png');
  await app.evaluate(({ session }, destination) => {
    session.defaultSession.on('will-download', (event, item) => {
      globalThis.photoDownloadResult = { blocked: event.defaultPrevented };
      if (event.defaultPrevented) return;
      item.setSavePath(destination);
      item.once('done', (_event, state) => { globalThis.photoDownloadResult.state = state; });
    });
  }, destination);
  const waitDownload = async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const state = await app.evaluate(() => globalThis.photoDownloadResult);
      if (state?.blocked || state?.state) return state;
      await delay(100);
    }
    throw new Error('Desktop photo download did not finish.');
  };
  await page.locator('.photo-download').click();
  assert.deepEqual(await waitDownload(), { blocked: false, state: 'completed' });
  const png = await readFile(destination);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), png.readUInt32BE(20));
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(16) <= 2048);
  report.checks.push('actual shared-world photo passes desktop policy and downloads a bounded square PNG');
  await app.evaluate(() => { globalThis.photoDownloadResult = null; });
  await page.evaluate(() => {
    const link = document.createElement('a'); link.textContent = 'Blocked fixture download'; link.id = 'rejected-photo-fixture';
    link.download = 'not-a-photo.html'; link.href = URL.createObjectURL(new Blob(['fixture'], { type: 'text/html' }));
    document.querySelector('.photo-result').append(link);
  });
  await page.locator('#rejected-photo-fixture').click();
  assert.equal((await waitDownload()).blocked, true);
  report.checks.push('a non-photo blob download remains blocked');
  await mkdir(join(root, 'output/playwright'), { recursive: true });
  await page.screenshot({ path: join(root, 'output/playwright/photo-mode-desktop.png') });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack; process.exitCode = 1;
} finally {
  await app?.close(); await vite?.close(); await rm(profile, { recursive: true, force: true });
  await writeFile(join(root, 'data/reports/photo-mode-desktop.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
