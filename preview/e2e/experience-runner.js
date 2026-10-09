import { startBrowserFixture } from './fixture-server.js';
import { chromium } from 'playwright';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suite = ['contextual-first-visit', 'store-intro', 'photo-mode', 'connection-required', 'birds-visible', 'bird-cams', 'debug-tools', 'movement-review', 'sable', 'experience', 'sidebar', 'rail-navigation', 'places', 'ui-polish', 'hud-and-quality', 'player-forms', 'beast-movement', 'carriage', 'unicorn-carriage', 'carriage-driver', 'carriage-companion', 'carriage-mobile', 'reference-facades', 'street-level', 'ui-improvements', 'nearby-encounters'];
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
try {
  await mkdir(join(root, 'output/playwright'), { recursive: true });
  browser = await chromium.launch({ headless: !software,
    args: software ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] : process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  for (const name of names.length ? names : suite) {
    fixture = await startBrowserFixture();
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
}
