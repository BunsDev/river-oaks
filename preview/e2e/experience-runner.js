import { startBrowserFixture } from './fixture-server.js';
import { chromium } from 'playwright';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suite = ['photo-mode', 'connection-required', 'birds-visible', 'bird-cams', 'debug-tools', 'movement-review', 'sable', 'experience', 'sidebar', 'rail-navigation', 'places', 'ui-polish', 'hud-and-quality', 'player-forms', 'beast-movement', 'carriage', 'unicorn-carriage', 'carriage-driver', 'carriage-companion', 'carriage-mobile', 'reference-facades'];
const names = process.argv.slice(2);
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
  browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {}) });
  for (const name of names.length ? names : suite) {
    fixture = await startBrowserFixture();
    const { origin } = fixture;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: 'fixture_session', value: 'owner', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
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
      results.push({ name, status: 'failed', seconds: (Date.now() - started) / 1000, error: error.stack });
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
