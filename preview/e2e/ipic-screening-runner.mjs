// Two-browser IPIC screening journey (#367): node preview/e2e/ipic-screening-runner.mjs
// Starts the loopback browser fixture with a synthetic host grant for alice and runs
// preview/e2e/ipic-screening.js with alice as host and bob as a late viewer.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { screeningLaunchOptions } from './ipic-screening-launch.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const release = await holdBrowserLock('IPIC screening two-browser journey');
let fixture, browser;
await mkdir('output/playwright/ipic', { recursive: true });
try {
  fixture = await startBrowserFixture({ env: { VITE_SHARED_SOFTWARE_RENDERING: '1', RIVER_OAKS_SCREENING_HOSTS: 'ipic:alice' } });
  browser = await chromium.launch(screeningLaunchOptions());
  const open = async identity => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(60000); return page;
  };
  const [host, viewer] = [await open('alice'), await open('bob')];
  const source = (await readFile('preview/e2e/ipic-screening.js', 'utf8')).replaceAll('http://127.0.0.1:5173', fixture.origin);
  try {
    const result = await eval(`(${source})`)(host, viewer);
    await writeFile('output/playwright/ipic/screening.json', JSON.stringify({ status: 'passed', browser: await browser.version(), ...result }, null, 2));
    console.log(JSON.stringify({ checks: result.checks, convergedAfterMs: result.convergedAfterMs, pausedSpreadMs: result.pausedSpreadMs }));
  } catch (error) {
    await Promise.all([host.screenshot({ path: 'output/playwright/ipic/screening-host-failure.png' }), viewer.screenshot({ path: 'output/playwright/ipic/screening-viewer-failure.png' })].map(p => p.catch(() => {})));
    await writeFile('output/playwright/ipic/screening.json', JSON.stringify({ status: 'failed', error: error.stack }, null, 2));
    throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
