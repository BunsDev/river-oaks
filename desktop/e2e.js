import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createSocket } from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'river-oaks-e2e-'));
const env = { ...process.env };
let vite;
if (process.argv.includes('--dev')) {
  const socket=createSocket();
  await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve);});
  const townPort=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  const fixture={RIVER_OAKS_ACCEPTANCE_FIXTURE:'1',RIVER_OAKS_DEV_AUTH:'local',RIVER_OAKS_DEV_TOWN:'on',
    RIVER_OAKS_DEV_TOWN_PORT:String(townPort),MODERATION_FILE:join(profile,'moderation.json'),WAITLIST_FILE:join(profile,'waitlist.json')};
  Object.assign(process.env,fixture);Object.assign(env,fixture);
  const { createServer } = await import('vite');
  vite = await createServer({ configFile: join(root, 'preview/vite.config.js'), server: { port: 0 } });
  await vite.listen();
  env.RIVER_OAKS_DEV_URL = `http://127.0.0.1:${vite.httpServer.address().port}/`;
}
delete env.ELECTRON_RUN_AS_NODE;
const started = performance.now();
// A packaged build has the Node inspector fuse turned off (desktop/fuses.js),
// so Playwright cannot attach to it. This mode only works on an unfused build.
const executablePath = process.env.RIVER_OAKS_DESKTOP_EXECUTABLE;
const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : [root]), `--user-data-dir=${profile}`], env, timeout: 30000 });
const errors = [], failedAssets = [], tempFiles = [];
const report = { mode: executablePath ? 'packaged' : env.RIVER_OAKS_DEV_URL ? 'development' : 'hosted', checks: [] };
function check(name) { report.checks.push(name); console.log(`✓ ${name}`); }
try {
  const page = await app.firstWindow();
  console.log(`Desktop test window: ${report.mode}`);
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error(message.text());
    // Chromium reports failed GPU draws as warnings, not page errors.
    if (/\b(?:GL_)?(?:INVALID_[A-Z_]+|OUT_OF_MEMORY|FRAMEBUFFER_INCOMPLETE[A-Z_]*)\b/.test(message.text())) errors.push(message.text());
  });
  page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()?.errorText));
  page.on('response', response => { if (response.status() >= 400 && /\/(assets|data)\//.test(response.url())) failedAssets.push(`${response.status()} ${response.url()}`); });
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#viewport').dataset.assetProgress || '{}').done === true);
  report.readyMs = Math.round(performance.now() - started);
  report.assets = await page.locator('#viewport').evaluate(el => JSON.parse(el.dataset.assetProgress));
  assert.equal(report.assets.failed, 0);
  assert.deepEqual(failedAssets, []);
  check('game assets and playable character loaded');
  const voiceSettings=await page.evaluate(async()=>{try{const r=await fetch('/v1/settings/elevenlabs');return r.ok?await r.json():null;}catch{return null;}});
  if(voiceSettings?.configured) {
    report.voice=await page.evaluate(async()=>{
      const response=await fetch('/v1/voice/jev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:"My love, I'm right here beside you. Wherever you wish to go, I'll keep pace."}),signal:AbortSignal.timeout(22000)});
      if(!response.ok)throw new Error('Voice bridge failed');
      const blob=await response.blob(),url=URL.createObjectURL(blob),audio=new Audio(url);audio.muted=true;
      try {
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('Audio clock did not advance')),8000);
          audio.ontimeupdate=()=>{if(audio.currentTime>.1){clearTimeout(timer);resolve();}};
          audio.onerror=()=>{clearTimeout(timer);reject(new Error('Audio decode failed'));};
          audio.play().catch(error=>{clearTimeout(timer);reject(error);});
        });
        return {bytes:blob.size,type:blob.type,currentTime:audio.currentTime,duration:audio.duration};
      }finally{audio.pause();audio.src='';URL.revokeObjectURL(url);}
    });
    report.voice.voiceId=voiceSettings.voice_id;
    check('configured ElevenLabs voice decodes and advances the desktop audio clock');
  }

  report.streetProfile = await page.locator('#canvas-host').evaluate(el => JSON.parse(el.dataset.streetProfile));
  assert.equal(report.streetProfile.profile, 'palo-alto');
  assert.ok(report.streetProfile.warningPanels > 0);
  assert.ok(report.streetProfile.clearWidth >= 2.4384);
  check('Palo Alto street surfaces loaded with clear-path dimensions');
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
  await page.locator('#visit-destination').click();console.log('Checking shop arrival');
  await page.waitForFunction(before => {
    const after = JSON.parse(document.querySelector('#walking-hud').dataset.position);
    return Math.hypot(after[0] - before[0], after[2] - before[2]) > 1;
  }, beforeTravel);
  // The shared server intentionally rate-limits travel to once per second.
  if (sharedTown) await page.waitForTimeout(1100);
  await page.locator('#enter-destination').click();console.log('Checking shop entry');
  await page.waitForFunction(() => document.body.classList.contains('inside-store'));
  await page.locator('#canvas-host').focus();
  if (sharedTown) await page.waitForTimeout(1100);
  await page.keyboard.press('KeyF');console.log('Checking shop exit');
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
  for (const fullScreen of [true, false]) {
    const transition = await app.evaluate(async ({ BrowserWindow }, fullScreen) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isFullScreen() === fullScreen) return { retried: false };
      // macOS fullscreen transitions are asynchronous. Observe completion
      // before asserting state or starting the opposite transition.
      const event = fullScreen ? 'enter-full-screen' : 'leave-full-screen';
      const state = () => ({ focused: window.isFocused(), visible: window.isVisible(), minimized: window.isMinimized(), fullScreen: window.isFullScreen() });
      const attempt = timeout => new Promise(resolve => {
        const done = () => { clearTimeout(timer); resolve(true); };
        const timer = setTimeout(() => { window.removeListener(event, done); resolve(false); }, timeout);
        window.once(event, done);
        window.setFullScreen(fullScreen);
      });
      // macOS can drop a request made during a Space switch or another app's
      // transition (seen once in six runs; it normally completes in ~0.7 s). Ask
      // once more if nothing changed; a real fullscreen failure still fails twice.
      if (await attempt(10000)) return { retried: false };
      const first = state();
      if (first.fullScreen === fullScreen) return { retried: false, lateState: first };
      if (await attempt(20000)) return { retried: true, first };
      throw new Error(`Timed out waiting for ${event} after a retry ` + JSON.stringify({ first, now: state() }));
    }, fullScreen);
    if (transition.retried) (report.fullscreenRetries ??= []).push({ fullScreen, ...transition });
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), fullScreen);
  }
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
  const failedPage=await app.firstWindow();
  report.failureUI=await failedPage.evaluate(()=>({position:document.querySelector('#walking-hud')?.dataset.position,body:document.body.className,places:document.querySelector('#explore-section')?.textContent,walking:document.querySelector('#walking-hud')?.textContent})).catch(()=>null);
  await failedPage.screenshot({path:join(root,`output/playwright/desktop-${report.mode}-failure.png`)}).catch(()=>{});
  throw error;
} finally {
  await mkdir(join(root, 'data/reports'), { recursive: true });
  await writeFile(join(root, 'data/reports', process.env.RIVER_OAKS_DESKTOP_REPORT ?? `desktop-${report.mode}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  await app.close();
  await vite?.close();
  for (const file of tempFiles) await rm(file, { force: true });
  await rm(profile, { recursive: true, force: true });
}
