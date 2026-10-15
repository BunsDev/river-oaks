import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const release = await holdBrowserLock('IPIC production visit');
let fixture, browser;
try {
  // A synthetic IPIC host grant for the owner fixture's user id (server/tests/browser-fixture.js), so
  // the seated step can start the film and measure its panel.
  fixture = await startBrowserFixture({ env: { VITE_SHARED_SOFTWARE_RENDERING: '1', RIVER_OAKS_SCREENING_HOSTS: 'ipic:user_01M40Y914S1H4EJCEHH91DKTAY' } });
  browser = await chromium.launch({ headless: true, ...(process.env.IPIC_CHROMIUM ? { executablePath: process.env.IPIC_CHROMIUM } : {}), args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
  const page = await context.newPage();page.setDefaultTimeout(60000);
  const source = (await readFile('preview/e2e/ipic-visit.js', 'utf8')).replaceAll('http://127.0.0.1:5173', fixture.origin);
  try {
    const result = await eval(`(${source})`)(page);
    await writeFile('output/playwright/ipic/visit.json', JSON.stringify({ status: 'passed', browser: await browser.version(), ...result }, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    await page.screenshot({ path: 'output/playwright/ipic/visit-failure.png' }).catch(() => {});
    await writeFile('output/playwright/ipic/visit.json', JSON.stringify({ status: 'failed', error: error.stack }, null, 2));
    throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
