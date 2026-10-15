// Walking the penthouse stair: node preview/e2e/office-penthouse-stairs-runner.mjs
// Starts the loopback browser fixture with RIVER_OAKS_OFFICE_LAYOUT=office-penthouse-1 and
// runs preview/e2e/office-penthouse-stairs.js as the office owner.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { loadavg } from 'node:os';
const release = await holdBrowserLock('Penthouse stair walk');
let fixture, browser;
await mkdir('output/playwright', { recursive: true });
try {
  fixture = await startBrowserFixture({ env: { VITE_SHARED_SOFTWARE_RENDERING: '1', RIVER_OAKS_OFFICE_LAYOUT: 'office-penthouse-1' } });
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  const source = (await readFile('preview/e2e/office-penthouse-stairs.js', 'utf8')).replaceAll('http://127.0.0.1:5173', fixture.origin);
  try {
    const result = await eval(`(${source})`)(page);
    await writeFile('output/playwright/office-penthouse-stairs.json', JSON.stringify({ status: 'passed', browser: await browser.version(), loadAverage: loadavg().map(n => Number(n.toFixed(1))), ...result }, null, 2));
    console.log(JSON.stringify({ checks: result.checks, eyeRise: result.eyeRise, mid: result.mid?.elevation }));
  } catch (error) {
    await page.screenshot({ path: 'output/playwright/office-penthouse-stairs-failure.png' }).catch(() => {});
    await writeFile('output/playwright/office-penthouse-stairs.json', JSON.stringify({ status: 'failed', loadAverage: loadavg().map(n => Number(n.toFixed(1))), error: error.stack }, null, 2));
    throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
