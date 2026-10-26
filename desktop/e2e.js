import { openHudSpace } from '../preview/e2e/hud-navigation.js';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createSocket } from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'river-oaks-e2e-'));
const env = { ...process.env };
// CPU rendering for CI runners, with the browser journeys' scene budget
// (preview/e2e/shared-runner.js). Linux draws with Mesa under Xvfb and needs
// ANGLE's GL backend and the journeys' Chromium flags; Windows runners draw with
// ANGLE's default Direct3D 11 backend on Microsoft's software rasterizer.
const software = process.env.RIVER_OAKS_DESKTOP_SOFTWARE === '1';
const softwareFlags = software && process.platform === 'linux' ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] : [];
let vite, hmrProbe;
const tempFiles = [];
if (process.argv.includes('--dev')) {
  const socket=createSocket();
  await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve);});
  const townPort=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  const fixture={RIVER_OAKS_ACCEPTANCE_FIXTURE:'1',RIVER_OAKS_DEV_AUTH:'local',RIVER_OAKS_DEV_TOWN:'on',
    RIVER_OAKS_DEV_TOWN_PORT:String(townPort),MODERATION_FILE:join(profile,'moderation.json'),WAITLIST_FILE:join(profile,'waitlist.json'),
    ...(software?{VITE_SHARED_SOFTWARE_RENDERING:'1'}:{})};
  Object.assign(process.env,fixture);Object.assign(env,fixture);
  const { createServer } = await import('vite');
  // Keep provider fixtures in the server: Playwright page interception cannot
  // reliably service a replacement renderer after the deliberate crash below.
  const offlineBridge = { name: 'desktop-offline-bridge', enforce: 'pre', configureServer(server) {
    server.middlewares.use('/v1', (_request, response) => {
      response.statusCode = 503; response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ error: 'Offline desktop fixture' }));
    });
  } };
  // The hot-reload probe exists before Vite watches: a file created later is a
  // new file to Vite, which can reload the whole page before the check imports it.
  hmrProbe = `desktop-hmr-${process.pid}.css`;
  tempFiles.push(join(root, 'preview', hmrProbe));
  await writeFile(tempFiles.at(-1), ':root { --desktop-hmr-probe: before; }');
  vite = await createServer({ configFile: join(root, 'preview/vite.config.js'), plugins: [offlineBridge], server: { port: 0 } });
  await vite.listen();
  env.RIVER_OAKS_DEV_URL = `http://127.0.0.1:${vite.httpServer.address().port}/`;
}
delete env.ELECTRON_RUN_AS_NODE;
const started = performance.now();
// A packaged build has the Node inspector fuse turned off (desktop/fuses.js),
// so Playwright cannot attach to it. This mode only works on an unfused build.
const executablePath = process.env.RIVER_OAKS_DESKTOP_EXECUTABLE;
// A fake device lets the microphone check run without hardware. Electron shows
// no prompt of its own: the permission handler in main.js decides. Chromium's
// fake-UI flag must stay off, because it approves before that handler is asked.
// A cold CI runner can take longer than a developer machine to start Electron.
const launchTimeout = Number(process.env.RIVER_OAKS_DESKTOP_LAUNCH_TIMEOUT ?? 30000);
// On Windows Playwright starts Electron through cmd.exe with each argument in
// double quotes. A trailing backslash would escape the closing quote and merge
// the app path with the arguments after it, so pass the root without one.
const appPath = resolvePath(root);
const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : [appPath]), `--user-data-dir=${profile}`, '--use-fake-device-for-media-stream',
  ...softwareFlags], env, timeout: launchTimeout });
// The main process's own lines (renderer recovery, load failures) otherwise
// stay in Playwright's buffer and only surface on a launch failure.
for (const stream of ['stdout', 'stderr']) app.process()[stream]?.on('data', chunk => process.stderr.write(`[electron] ${chunk}`));
const errors = [], failedAssets = [];
const report = { mode: executablePath ? 'packaged' : env.RIVER_OAKS_DEV_URL ? 'development' : 'hosted', software, checks: [] };
function check(name) { report.checks.push(name); console.log(`✓ ${name}`); }
try {
  const page = await app.firstWindow();
  console.log(`Desktop test window: ${report.mode}`);
  // From the next load on (the reload below, crash recovery), a failure report
  // records what closed each dialog and every town state change since that load.
  await page.addInitScript(() => {
    if (window !== window.top) return; // Frames such as the office computer have no game.
    const trail = window.__desktopTrail = [];
    const note = (type, detail) => trail.push({ t: Math.round(performance.now()), type, ...detail });
    const close = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.close = function (...args) {
      note('dialog close', { id: this.id, from: new Error().stack.split('\n').slice(2, 6).map(line => line.trim()).join(' | ') });
      return close.apply(this, args);
    };
    const until = performance.now() + 120000;
    const watch = () => {
      const host = document.querySelector('#canvas-host');
      if (!host) { if (performance.now() < until) setTimeout(watch, 50); return; }
      let state;
      const changed = () => { if (host.dataset.multiplayer !== state) note('town', { state: state = host.dataset.multiplayer }); };
      changed(); new MutationObserver(changed).observe(host, { attributes: true, attributeFilter: ['data-multiplayer'] });
    };
    watch();
  });
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error(message.text());
    // Chromium reports failed GPU draws as warnings, not page errors.
    if (/\b(?:GL_)?(?:INVALID_[A-Z_]+|OUT_OF_MEMORY|FRAMEBUFFER_INCOMPLETE[A-Z_]*)\b/.test(message.text())) errors.push(message.text());
  });
  page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()?.errorText));
  page.on('response', response => { if (response.status() >= 400 && /\/(assets|data)\//.test(response.url())) failedAssets.push(`${response.status()} ${response.url()}`); });
  // The first window can still hold the document before the game's. An absent
  // #loading counts as hidden, and a predicate that throws ends its wait, so wait
  // for the game's own element and read the rest without assuming it exists.
  const gameReady = async () => {
    await page.locator('#canvas-host').waitFor({ state: 'attached' });
    await page.locator('#loading').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
    await page.waitForFunction(() => JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress || '{}').done === true);
  };
  await gameReady();
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
  // Shared voice: the microphone alone, from the game origin; nothing else.
  report.media = await page.evaluate(async () => {
    const attempt = async constraints => {
      try { const stream = await navigator.mediaDevices.getUserMedia(constraints); const kinds = stream.getTracks().map(track => track.kind); for (const track of stream.getTracks()) track.stop(); return { ok: true, kinds }; }
      catch (error) { return { ok: false, name: error.name }; }
    };
    return { audio: await attempt({ audio: true }), video: await attempt({ video: true }), both: await attempt({ audio: true, video: true }) };
  });
  assert.deepEqual(report.media.audio, { ok: true, kinds: ['audio'] });
  assert.equal(report.media.video.ok, false);
  assert.equal(report.media.both.ok, false);
  check('microphone permission is granted only for audio on the game origin');
  const panel = page.locator('#panel-toggle');
  if (await panel.getAttribute('aria-expanded') === 'true') await panel.click();
  await page.locator('#canvas-host').focus();
  const position = () => page.locator('#walking-hud').evaluate(el => JSON.parse(el.dataset.position));
  // Hold W for 1.2 s of the game's clock, not the wall clock. The game reads keys in
  // its frame loop and advances at most 0.08 s a frame (main.js), so a frame stall on
  // a slow runner (macOS CI compiling shader pipelines) could cover a wall-clock hold
  // and leave the player at the spawn: "0 m walked" in Desktop runs 38659435397 and
  // 38673593628. The distance threshold is unchanged.
  // The same runner can block the renderer for 20-28 s while it loads, so the town
  // socket misses the server's 30 s heartbeat and is dropped; the page sees the close
  // late, rejoins, and the rejoin restores the server's pose, undoing a hold that
  // overlaps it (0.00 m in diag runs 39173762547, 39173766491 and 39174839205, on main
  // and #507 alike). A hold that did not walk while the town was away, at its start or
  // during it, is repeated once the town is joined again; a hold with the town joined
  // throughout still has to walk.
  const holdW = async () => {
    await page.locator('#canvas-host').focus();
    const before = await position();
    // Watch the town from before the key goes down until the walked distance is read.
    await page.evaluate(() => {
      const host = document.querySelector('#canvas-host');let state = host.dataset.multiplayer;const town = [state];
      const watch = new MutationObserver(() => { if (host.dataset.multiplayer !== state) town.push(state = host.dataset.multiplayer); });
      watch.observe(host, { attributes: true, attributeFilter: ['data-multiplayer'] });
      window.__desktopHoldTown = { watch, town };
    });
    await page.keyboard.down('KeyW');
    const hold = await page.evaluate(() => new Promise(resolve => {
      const started = performance.now(); let last, game = 0, frames = 0, longest = 0;
      const frame = now => {
        if (last !== undefined) { const dt = (now - last) / 1000; game += Math.min(dt, 0.08); longest = Math.max(longest, dt); frames++; }
        last = now;
        if (game >= 1.2 || now - started > 30000) resolve({ game, frames, longest, wall: (now - started) / 1000 }); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }));
    await page.keyboard.up('KeyW');
    const after = await position();
    const town = await page.evaluate(() => { const { watch, town } = window.__desktopHoldTown;watch.disconnect();delete window.__desktopHoldTown;return town; });
    return { metres: Math.hypot(after[0] - before[0], after[2] - before[2]), ...hold, town };
  };
  let walk = await holdW();
  const repeated = [];
  while (walk.metres <= 0.5 && walk.town.some(state => state !== 'joined') && repeated.length < 2) {
    repeated.push(walk);
    const back = await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.multiplayer === 'joined', null, { timeout: 60000 }).then(() => true, () => false);
    if (!back) break;
    await page.waitForTimeout(1000);
    walk = await holdW();
  }
  report.walk = { ...walk, repeated };
  const hold = walk, walked = walk.metres;
  assert.ok(walked > 0.5, `W moves the player: ${walked.toFixed(2)} m over ${hold.game.toFixed(2)} s of game time (${hold.frames} frames in ${hold.wall.toFixed(2)} s, longest ${hold.longest.toFixed(2)} s; town ${JSON.stringify(hold.town)}, ${repeated.length} repeated holds)`);
  check('keyboard movement');
  const sharedTown = await page.locator('#canvas-host').getAttribute('data-multiplayer') === 'joined';
  report.sharedTown = sharedTown;
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'Hermès' });
  const beforeTravel = await position();
  await page.locator('#visit-destination').click();console.log('Checking shop arrival');
  await page.waitForFunction(before => {
    const after = JSON.parse(document.querySelector('#walking-hud').dataset.position);
    return Math.hypot(after[0] - before[0], after[2] - before[2]) > 1;
  }, beforeTravel);
  // The shared server intentionally rate-limits travel to once per second.
  if (sharedTown) await page.waitForTimeout(1100);
  const introClaim = sharedTown ? page.waitForResponse(response => response.url().includes('/api/profile/claim-intro')) : null;
  await page.locator('#enter-destination').click();console.log('Checking shop entry');
  if (introClaim && (await (await introClaim).json()).firstVisit) {
    await page.locator('.store-intro button').click();
    await page.locator('.store-intro').waitFor({ state: 'hidden' });
  }
  await page.waitForFunction(() => document.body.classList.contains('inside-store'));
  await page.locator('#canvas-host').focus();
  if (sharedTown) await page.waitForTimeout(1100);
  await page.keyboard.press('KeyF');console.log('Checking shop exit');
  await page.waitForFunction(() => !document.body.classList.contains('inside-store'));
  check('shop arrival, enter and exit');
  await openHudSpace(page, 'community-section');
  if (sharedTown) await page.waitForTimeout(1100);
  await page.locator('#community-meet').click();
  await page.locator('#community-about').click();
  await page.waitForFunction(() => document.querySelector('#community-speech').textContent.length > 40);
  await page.locator('#community-close').click();
  check('resident conversation');
  // Connecting to the town locks the access gate, and the gate closes an open
  // Settings dialog (multiplayer-client.js setStatus). So does a drop: this runner
  // can miss the town's 30 s heartbeat (holdW above), and in Desktop job 121709518224
  // it did with Settings open, 5 s after the town rejoined from the reload, leaving
  // the Auto button hidden for the click's whole timeout. Choose with the town
  // joined; if the gate took the dialog first, rejoin, reopen it and choose again.
  const settingsOpen = async () => await page.locator('#settings-dialog[open]').count() > 0;
  const qualityRetries = report.qualityRetries = [];
  const chooseQuality = async mode => {
    for (;;) {
      if (sharedTown) await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.multiplayer === 'joined');
      const chosen = await openHudSpace(page, 'settings-section', 'Graphics')
        .then(() => page.locator(`[data-quality=${mode}]`).click())
        .then(() => true, async error => {
          if (await settingsOpen() || qualityRetries.length >= 2) throw error;
          return false;
        });
      if (chosen) break;
      qualityRetries.push({ mode, town: await page.locator('#canvas-host').getAttribute('data-multiplayer') });
    }
    await page.waitForFunction(mode => JSON.parse(document.querySelector('#canvas-host').dataset.quality || '{}').mode === mode, mode);
  };
  await chooseQuality('smooth');
  await page.reload();
  await gameReady();
  assert.equal(await page.locator('[data-quality=smooth]').getAttribute('aria-pressed'), 'true');
  check('graphics preference survives reload');
  await chooseQuality('auto');
  // A drop after the choice has already closed the dialog.
  if (await settingsOpen()) await page.locator('#settings-dialog .settings-header button').click().catch(async error => { if (await settingsOpen()) throw error; });
  // Selecting Auto restarts it at full resolution with AO, and it decides once
  // per 45 frames: on a 10 fps runner it needs about 27 s to reach its floor and
  // drop AO. Measure the loop once Auto has stopped stepping down (two decision
  // windows without a change), not during that descent. Auto can still step up
  // later, but only on fast frames.
  const settling = performance.now();
  await page.waitForFunction(() => {
    const quality = JSON.parse(document.querySelector('#canvas-host').dataset.quality || '{}');
    return quality.mode === 'auto' && quality.steadyWindows >= 2;
  }).catch(async error => {
    // Below 4 fps every frame is discarded as a hitch, so Auto never decides.
    const quality = await page.locator('#canvas-host').getAttribute('data-quality').catch(() => null);
    throw new Error(`Auto did not settle within the timeout (quality ${quality}): ${error.message}`);
  });
  const settledMs = Math.round(performance.now() - settling);
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
  report.performance.autoSettledMs = settledMs;
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
    await page.evaluate(path => import(path), `/${hmrProbe}`);
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--desktop-hmr-probe').trim() === 'before');
    await writeFile(join(root, 'preview', hmrProbe), ':root { --desktop-hmr-probe: after; }');
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
    await new Promise((resolve, reject) => {
      const loaded = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        contents.removeListener('did-finish-load', loaded);
        reject(new Error(`Recovery navigation did not finish: loading=${contents.isLoading()}, crashed=${contents.isCrashed()}`));
      }, 60000);
      contents.once('did-finish-load', loaded);
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
  report.failureTrail = await failedPage.evaluate(() => ({ now: Math.round(performance.now()), events: window.__desktopTrail ?? null })).catch(() => null);
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
