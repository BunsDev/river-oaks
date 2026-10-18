// Penthouse lighting review: node preview/e2e/office-penthouse-lighting.mjs [label]
// The owner enters the penthouse on the loopback fixture with the live district outlook,
// then captures each of the six fixed views (V) at noon and at dusk from the time-of-day
// clock. The office chrome is hidden for each capture and restored afterwards. Sharpest
// quality holds full resolution and ambient occlusion, so two runs are pixel-matched:
// run once on the base as `before` and once on the change as `after`, then compare.
// Hardware (Metal) rendering on this Mac; not real-device or human visual acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const label = process.argv[2] ?? 'capture';
const output = `output/playwright/penthouse-lighting/${label}`;
const HOURS = { noon: 12, dusk: 18.5 };
const sourceNames = ['office-penthouse-graybox.js', 'office-world-scene.js', 'office-world-presentation.js', 'office-skyline.js', 'office-layouts.js', 'storefront-materials.js', 'atmosphere.js', 'main.js'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceNames.map(async name => [name, createHash('sha256').update(await readFile(`preview/src/${name}`)).digest('hex')])));
const sources = await sourceHashes();
await mkdir(output, { recursive: true });
const release = await holdBrowserLock('Penthouse lighting review');
let fixture, browser;
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_OFFICE_LAYOUT: 'office-penthouse-1', VITE_SHARED_SOFTWARE_RENDERING: '0' } });
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : [] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
  await context.addInitScript(() => localStorage.setItem('river-oaks-graphics', 'sharp'));
  const page = await context.newPage(); page.setDefaultTimeout(180000);
  // The penthouse smoke's own setup and arrival, up to its first seat step.
  const source = await readFile('preview/e2e/office-penthouse.js', 'utf8');
  const prefix = source.slice(0, source.indexOf('  // #363: sit at creative desk'))
    .replaceAll('http://127.0.0.1:5173', fixture.origin)
    .replace("await page.locator('#office-lobby').evaluate", "await page.waitForFunction(() => window.__riverMultiplayer?.().connected && window.__riverMultiplayer().snapshot?.players.some(p => p.id === window.__riverMultiplayer().selfId), null, { timeout: 180000 });\n  await page.locator('#office-lobby').evaluate")
    .replaceAll('output/playwright/office-penthouse-arrival.png', `${output}/arrival.png`);
  assert.ok(prefix.includes('const walkTo'), 'the smoke setup still ends before its seat step');
  const journey = prefix + `
    const settle = (frames = 30) => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame); }, frames);
    await page.waitForFunction(() => window.__riverOffice()?.skyline?.state === 'live', null, { timeout: 300000 });
    const views = await page.locator('#office-view option').evaluateAll(options => options.map(o => o.value).filter(Boolean));
    check(views.length === 6, 'six fixed views: ' + views.join());
    const shots = [];
    for (const [time, hour] of Object.entries(${JSON.stringify(HOURS)})) {
      await page.locator('#sun-hour').evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, hour);
      for (const id of views) {
        await page.locator('#office-view').selectOption(id);
        check(await page.locator('#office-view').inputValue() === id, 'selected the ' + id + ' view');
        await page.addStyleTag({ content: '#office-visit > * { visibility: hidden !important; }' }).then(tag => tag.evaluate(node => node.id = 'lighting-capture-chrome'));
        await settle();
        const file = '${output}/' + time + '-' + id + '.png';
        await page.screenshot({ path: file });
        await page.evaluate(() => document.querySelector('#lighting-capture-chrome')?.remove());
        const office = await page.evaluate(() => window.__riverOffice());
        shots.push({ time, hour, view: id, file, camera: office.camera, skyline: { state: office.skyline?.state, frames: office.skyline?.frames } });
      }
    }
    await dialog.focus(); await page.keyboard.press('Escape');
    check(await page.locator('#office-view').inputValue() === '', 'Escape returns to walking');
    check(!errors.length, errors.join('; '));
    return { checks, errors, reloads, shots };
  }`;
  const result = await eval(`(${journey})`)(page);
  assert.deepEqual(await sourceHashes(), sources, 'scene sources stayed fixed during the run');
  const receipt = { status: 'passed', label, browser: await browser.version(), loadAverage: loadavg().map(n => Number(n.toFixed(1))), settings: { viewport: [1280, 800], deviceScaleFactor: 1, graphics: 'sharp', hours: HOURS, weather: 'default' }, sources, ...result };
  await writeFile(`${output}/result.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ label, checks: result.checks.length, shots: result.shots.length, loadAverage: receipt.loadAverage }));
} catch (error) {
  await writeFile(`${output}/result.json`, JSON.stringify({ status: 'failed', label, loadAverage: loadavg(), error: error.stack }, null, 2));
  throw error;
} finally { await browser?.close(); await fixture?.close(); release(); }
