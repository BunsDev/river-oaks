import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const modes = process.argv.slice(2);
const selectedJourney = process.env.RIVER_OAKS_SHARED_JOURNEY;
const softwareRendering = process.env.RIVER_OAKS_SHARED_SOFTWARE === '1';
if (softwareRendering && process.platform !== 'linux') throw new Error('Software shared acceptance requires Linux with Xvfb and Mesa.');
const supportedModes=['development','development-world','development-solo','development-publish','required'];
if (modes.some(mode => !supportedModes.includes(mode))) throw new Error(`Choose ${supportedModes.join(', ')} shared play.`);
const report = { createdAt: new Date().toISOString(), status: 'running', modes: modes.length ? modes : supportedModes, rendering: softwareRendering ? 'Mesa CPU acceptance: quarter resolution, surface-normal shading, no HDR, MSAA, shadows, AO or reflection captures; not visual-quality acceptance.' : 'Full rendering', scope: 'Loopback development identities and authenticated fixtures; no live WorkOS or hosted service acceptance.', results: [] };
const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-shared-'));
let browser, child;
const interruption = new AbortController();
const signals = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => [signal, () => {
  if (interruption.signal.aborted) return;
  process.exitCode = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 129;
  interruption.abort(new Error(`Shared acceptance interrupted by ${signal}.`));
  // Closing the browser cancels active Playwright waits; finally owns cleanup.
  void browser?.close().catch(() => {});
}]));
for (const [signal, handler] of signals) process.on(signal, handler);

async function unused(port) {
  const socket = createServer();
  try {
    await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(port, '127.0.0.1', resolve); });
  } catch (error) { throw new Error(`Shared acceptance needs unused loopback port ${port}; existing services are left running.`, { cause: error }); }
  finally { if (socket.listening) await new Promise(resolve => socket.close(resolve)); }
}
async function freePort(excluded) {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return excluded.has(port) ? freePort(excluded) : port;
}
async function stop() {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) { child = null; return; }
  const owned = child, exited = once(owned, 'exit');
  const deadline = setTimeout(() => owned.kill('SIGKILL'), 5000);
  owned.kill('SIGTERM');
  try { await exited; } finally { clearTimeout(deadline); child = null; }
}
async function start(mode, ports) {
  const development = mode.startsWith('development');
  for (const port of Object.values(ports)) await unused(port);
  const args = development ? ['node_modules/vite/bin/vite.js', '--config', 'preview/vite.config.js', '--port', String(ports.web)] : ['server/tests/browser-fixture.js'];
  const ready = development ? 'Shared town: local development identities' : 'Multiplayer browser fixture:';
  const env = { ...process.env, NODE_ENV: 'development', VERCEL: '', VITE_SINGLE_PLAYER: 'false', VITE_SHARED_SOFTWARE_RENDERING: softwareRendering ? '1' : '', VITE_MULTIPLAYER: mode==='development'?'auto':mode==='development-solo'?'choice':'required', RIVER_OAKS_ACCEPTANCE_FIXTURE: '1', RIVER_OAKS_DEV_AUTH: 'local', RIVER_OAKS_DEV_TOWN: development ? 'on' : 'off', WORLD_ID: mode==='development-world'?'garden-2':'river-oaks', RIVER_OAKS_TEST_WEB_PORT: String(ports.web), RIVER_OAKS_DEV_TOWN_PORT: String(ports.town), MODERATION_FILE: join(temporary, 'moderation.json'), WAITLIST_FILE: join(temporary, 'waitlist.json') };
  interruption.signal.throwIfAborted();
  child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let output = '';
    const finish = error => {
      clearTimeout(deadline);
      interruption.signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(interruption.signal.reason);
    const deadline = setTimeout(() => finish(new Error(`${mode} startup timed out.\n${output}`)), 30000);
    interruption.signal.addEventListener('abort', abort, { once: true });
    child.once('error', finish);
    child.once('exit', code => finish(new Error(`${mode} server exited ${code}.\n${output}`)));
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      output = (output + chunk).slice(-4000);
      if (output.includes(ready)) finish();
    });
  });
}
try {
  await mkdir(join(root, 'output/playwright'), { recursive: true });
  await writeFile(join(root, 'data/reports/shared-experience.json'), JSON.stringify(report, null, 2) + '\n');
  browser = await chromium.launch({
    headless: !softwareRendering, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    args: softwareRendering ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] : process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  });
  const probe = await browser.newPage();
  report.renderer = await probe.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) throw new Error('Shared acceptance requires a working WebGL2 context.');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return renderer;
  });
  await probe.close();
  console.log(`Shared renderer: ${report.renderer}; ${report.rendering}`);
  for (const mode of modes.length ? modes : supportedModes) {
    interruption.signal.throwIfAborted();
    const used = new Set();
    const web = await freePort(used); used.add(web);
    const town = await freePort(used);
    const ports = { web, town };
    await start(mode, ports);
    const names=mode==='development'?['multiplayer-dev','groups','world-events']:mode==='development-world'?['world-boundary','world-map']:mode==='development-solo'?['solo-admin']:mode==='development-publish'?['world-publish']:['access-gate','multiplayer','multiplayer-exclusivity','multiplayer-gate','resident-names'];
    for (const name of names) {
      if (selectedJourney && name !== selectedJourney) continue;
      interruption.signal.throwIfAborted();
      const context = await browser.newContext(), page = await context.newPage(), started = Date.now();
      page.setDefaultTimeout(60000);
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      // These journeys exercise shared transport, never optional paid providers.
      await context.route('**/v1/**', route => route.fulfill({ status: 503, json: { source: 'unavailable', reason: 'acceptance_fixture' } }));
      let result;
      try {
        console.log(`Running ${name}`);
        const source = (await readFile(join(root, `preview/e2e/${name}.js`), 'utf8')).replaceAll(/http:\/\/127\.0\.0\.1:(?:5173|5180)/g, `http://127.0.0.1:${web}`);
        result = await eval(`(${source})\n//# sourceURL=preview/e2e/${name}.js`)(page);
        if (result?.passed === false) throw new Error(result.failure ?? 'Harness reported failure');
        report.results.push({ name, status: 'passed', seconds: (Date.now() - started) / 1000, result });
        console.log(`Passed ${name}`);
      } catch (error) {
        interruption.signal.throwIfAborted();
        const diagnostics = await Promise.all(browser.contexts().flatMap(context => context.pages()).map(async active =>
          active.evaluate(() => ({
            url: location.href,
            mode: document.querySelector('#canvas-host')?.dataset.multiplayer,
            ready: document.querySelector('#canvas-host')?.dataset.playerReady,
            appearance: document.querySelector('#canvas-host')?.dataset.playerAppearance,
            assets: document.querySelector('#viewport')?.dataset.assetProgress,
            town: document.querySelector('#multiplayer-status')?.textContent,
            player: document.querySelector('#player-status')?.textContent,
            places: document.querySelector('#places-status')?.textContent,
            landmarkCount: document.querySelectorAll('#landmarks-list li').length,
            connected: window.__riverMultiplayer?.().connected,
          })).catch(() => null)));
        report.results.push({ name, status: 'failed', seconds: (Date.now() - started) / 1000, error: error.stack, pageErrors, diagnostics, result });
        await page.screenshot({ path: join(root, `output/playwright/shared-${name}-failure.png`) }).catch(() => {});
        console.error(`Failed ${name}: ${error.stack}`);
        if (pageErrors.length) console.error('Browser errors:', pageErrors);
        process.exitCode = 1;
      } finally {
        // Some older page-function harnesses create extra contexts. Close every
        // context before the next journey so a failed run cannot retain a peer.
        for (const active of browser.contexts()) await active.close().catch(error => { if (!interruption.signal.aborted) throw error; });
        await writeFile(join(root, 'data/reports/shared-experience.json'), JSON.stringify(report, null, 2) + '\n');
      }
    }
    await stop();
  }
} catch (error) {
  report.error = error.stack; process.exitCode ||= 1; console.error(error.message);
} finally {
  try { await browser?.close(); } finally { await stop(); await rm(temporary, { recursive: true, force: true }); }
  report.status = interruption.signal.aborted ? 'interrupted' : process.exitCode ? 'failed' : 'passed';
  for (const [signal, handler] of signals) process.removeListener(signal, handler);
  await writeFile(join(root, 'data/reports/shared-experience.json'), JSON.stringify(report, null, 2) + '\n');
}
