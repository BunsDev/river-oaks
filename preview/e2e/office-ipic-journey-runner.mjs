// Two-account office + IPIC journey (#359, #368): node preview/e2e/office-ipic-journey-runner.mjs
// Starts the loopback browser fixture with the penthouse layout and a synthetic IPIC host grant
// for the fixture's Jevica owner account, then runs preview/e2e/office-ipic-journey.js with the
// owner and bob. Graybox and fixture media; software rendering.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { loadavg } from 'node:os';
const OWNER = 'user_01M40Y914S1H4EJCEHH91DKTAY'; // server/tests/browser-fixture.js's synthetic Jevica account
const release = await holdBrowserLock('Office and IPIC two-account journey');
let fixture, browser;
await mkdir('output/playwright', { recursive: true });
try {
  fixture = await startBrowserFixture({ env: { VITE_SHARED_SOFTWARE_RENDERING: '1', RIVER_OAKS_OFFICE_LAYOUT: 'office-penthouse-1', RIVER_OAKS_SCREENING_HOSTS: `ipic:${OWNER}` } });
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async identity => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(60000); return page;
  };
  const [owner, resident] = [await open('owner'), await open('bob')];
  const source = (await readFile('preview/e2e/office-ipic-journey.js', 'utf8')).replaceAll('http://127.0.0.1:5173', fixture.origin);
  const started = Date.now();
  try {
    const result = await eval(`(${source})`)(owner, resident);
    await writeFile('output/playwright/office-ipic-journey.json', JSON.stringify({ status: 'passed', loadAverage: loadavg().map(n => Number(n.toFixed(1))), browser: await browser.version(), durationMs: Date.now() - started, ...result }, null, 2));
    console.log(JSON.stringify({ checks: result.checks, convergedAfterMs: result.convergedAfterMs }));
  } catch (error) {
    await Promise.all([owner.screenshot({ path: 'output/playwright/office-ipic-owner-failure.png' }), resident.screenshot({ path: 'output/playwright/office-ipic-resident-failure.png' })].map(p => p.catch(() => {})));
    await writeFile('output/playwright/office-ipic-journey.json', JSON.stringify({ status: 'failed', loadAverage: loadavg().map(n => Number(n.toFixed(1))), durationMs: Date.now() - started, error: error.stack }, null, 2));
    throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
