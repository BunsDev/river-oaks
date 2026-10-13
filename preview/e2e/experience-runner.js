import { startBrowserFixture } from './fixture-server.js';
import { chromium } from 'playwright';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suite = ['player-lifecycle', 'multiplayer-lifecycle', 'contextual-first-visit', 'store-intro', 'photo-mode', 'connection-required', 'birds-visible', 'bird-cams', 'debug-tools', 'movement-review', 'sable', 'experience', 'sidebar', 'game-hud', 'town-chat', 'game-chat-shared', 'rail-navigation', 'places', 'places-guide', 'destination-minimap', 'world-studio', 'ui-polish', 'hud-and-quality', 'hardware-acceleration', 'player-forms', 'beast-movement', 'carriage', 'unicorn-carriage', 'carriage-driver', 'carriage-companion', 'carriage-mobile', 'reference-facades', 'street-level', 'plaza-salon', 'plaza-stage', 'plaza-chess', 'plaza-checkers', 'plaza-connect-four', 'plaza-dominoes', 'cycling-rack', 'plaza-hearts', 'plaza-backgammon', 'ui-improvements', 'nearby-encounters'];
const names = process.argv.slice(2);
// Linux CI renders through Mesa under Xvfb, like the shared and security journeys;
// Chromium's headless SwiftShader path stalls on the district scene.
const software = process.env.RIVER_OAKS_EXPERIENCE_SOFTWARE === '1';
if (software && process.platform !== 'linux') throw new Error('Software experience acceptance requires Linux with Xvfb and Mesa.');
if (software) process.env.VITE_SHARED_SOFTWARE_RENDERING = '1';
const selectable = [];
for (const file of await readdir(join(root, 'preview/e2e'))) {
  if (!file.endsWith('.js')) continue;
  const source = await readFile(join(root, 'preview/e2e', file), 'utf8');
  if (/^\s*(?:\/\/[^\n]*\n\s*)*async\b/.test(source)) selectable.push(file.slice(0, -3));
}
if (names.some(name => !selectable.includes(name))) throw new Error(`Choose page harnesses from: ${selectable.join(', ')}`);
const results = [];
let browser, fixture;
// Local runs take turns with other sessions' browser runs (scripts/browser-lock.mjs).
const releaseBrowserLock = await holdBrowserLock('experience journeys');
try {
  await mkdir(join(root, 'output/playwright'), { recursive: true });
  // Fake media lets the voice journey grant a microphone without a device or a prompt; other journeys never ask.
  const media = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
  browser = await chromium.launch({ headless: !software,
    args: [...media, ...(software ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] : process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  for (const name of names.length ? names : suite) {
    // The voice journey runs the real voice routes and reconciler over a fake LiveKit.
    fixture = await startBrowserFixture(name === 'voice-shared' ? { env: { RIVER_OAKS_VOICE_FIXTURE: '1' } } : {});
    const { origin } = fixture;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: 'fixture_session', value: 'owner', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    // Kept for failure reports: page errors and console errors from every tab.
    const pageErrors = [], consoleErrors = [];
    const watch = tab => { tab.on('pageerror', error => pageErrors.push(error.message)); tab.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); }); };
    watch(page); context.on('page', watch);
    const started = Date.now();
    try {
      console.log(`Running ${name}`);
      // These repository harnesses are page functions, also used by the browser CLI.
      const source = (await readFile(join(root, `preview/e2e/${name}.js`), 'utf8')).replace(/http:\/\/127\.0\.0\.1:(?:5173|5180|5181)/g, origin);
      const result = await eval(`(${source})\n//# sourceURL=preview/e2e/${name}.js`)(page, { worldMapEnabled: process.env.VITE_WORLD_MAP === 'true' });
      if (result?.passed === false) throw new Error(result.failure ?? 'Harness reported failure');
      results.push({ name, status: 'passed', seconds: (Date.now() - started) / 1000, result });
      console.log(`Passed ${name}`);
    } catch (error) {
      // What the page was rendering when it failed: a blank scene and a slow one
      // look alike in a screenshot, so record draw work, quality and sizes.
      const diagnostics = await Promise.all(context.pages().map(active => active.evaluate(() => {
        const host = document.querySelector('#canvas-host'), canvas = document.querySelector('#viewport canvas');
        const probe = document.createElement('canvas').getContext('webgl2'), info = probe?.getExtension('WEBGL_debug_renderer_info');
        const gl = probe ? (info ? probe.getParameter(info.UNMASKED_RENDERER_WEBGL) : probe.getParameter(probe.RENDERER)) : null;
        probe?.getExtension('WEBGL_lose_context')?.loseContext();
        return { url: location.href, ready: host?.dataset.playerReady, assets: document.querySelector('#viewport')?.dataset.assetProgress,
          renderStats: host?.dataset.renderStats, quality: host?.dataset.quality, pipeline: host?.dataset.pipeline, renderer: gl,
          window: [innerWidth, innerHeight, devicePixelRatio], screen: [screen.width, screen.height, screen.colorDepth],
          canvas: canvas && [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight] };
      }).catch(failure => ({ unavailable: failure.message }))));
      results.push({ name, status: 'failed', seconds: (Date.now() - started) / 1000, error: error.stack, pageErrors, consoleErrors: consoleErrors.slice(-20), diagnostics });
      console.error(`Failed ${name}: ${error.message}`);
      await page.screenshot({ path: join(root, `output/playwright/experience-${name}-failure.png`) }).catch(() => {});
      process.exitCode = 1;
    } finally {
      for (const active of browser.contexts()) await active.close();
      await fixture.close(); fixture = null;
      await writeFile(join(root, 'data/reports', process.env.RIVER_OAKS_E2E_REPORT ?? 'experience.json'), JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2) + '\n');
    }
  }
} finally {
  await browser?.close();
  await fixture?.close();
  releaseBrowserLock();
}
