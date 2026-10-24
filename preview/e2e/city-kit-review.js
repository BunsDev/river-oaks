// Pedestrian-scale review of kit-assembled neighborhoods (#584/#585): renders every
// named view of each recipe (and a second seed) in the real material/lighting
// stack, records draw calls and triangles, fails on page errors or missing assets,
// and writes screenshots plus report.json to .runtime/city-kit/review-<time>/.
// Run under the shared lock: node scripts/browser-lock.mjs city-kit-review -- node preview/e2e/city-kit-review.js
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL(`../../.runtime/city-kit/review-${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url));
await mkdir(output, { recursive: true });
const vite = await createServer({ configFile: false, root, cacheDir: `${root}../.runtime/city-kit-vite`, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
const cases = [['bayou-market-commons', null], ['nineteenth-and-yale', null], ['nineteenth-and-yale', 78], ['bayou-market-commons', 7]];
let browser;
const report = { startedAt: new Date().toISOString(), cases: [] };
try {
  await vite.listen(); browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  for (const [recipe, seed] of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/e2e/fixtures/city-kit.html?recipe=${recipe}${seed === null ? '' : `&seed=${seed}`}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => ({ plan: window.cityKit.plan, views: window.cityKit.views, environment: window.cityKit.environment, scene: window.cityKit.stats() }));
    const views = [];
    for (const view of seed === null ? info.views : ['overview', 'street', 'frontage']) {
      const stats = await page.evaluate(view => window.cityKit.render(view), view);
      const file = `${recipe}-${info.plan.seed}-${view}.png`;
      await page.screenshot({ path: `${output}${file}` });
      views.push({ ...stats, file });
    }
    report.cases.push({ recipe, ...info, views, errors, failed });
    await page.close();
    assert.deepEqual(errors, [], `${recipe}: page errors`);
    assert.deepEqual(failed, [], `${recipe}: failed requests`);
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`city kit review: ${output}`);
} finally {
  await browser?.close(); await vite.close();
}
