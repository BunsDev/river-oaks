// Two-browser axe-and-darts venue journey: node preview/e2e/axe-venue-runner.mjs
// Starts the loopback browser fixture and runs preview/e2e/axe-venue.js with alice and bob.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const release = await holdBrowserLock('Axe and darts venue two-browser journey');
let fixture, browser;
await mkdir('output/playwright/axe-venue', { recursive: true });
try {
  fixture = await startBrowserFixture({ env: { VITE_SHARED_SOFTWARE_RENDERING: '1' } });
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async identity => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(60000); return page;
  };
  const [alice, bob] = [await open('alice'), await open('bob')];
  const source = (await readFile('preview/e2e/axe-venue.js', 'utf8')).replaceAll('http://127.0.0.1:5173', fixture.origin);
  try {
    const result = await eval(`(${source})`)(alice, bob);
    await writeFile('output/playwright/axe-venue/journey.json', JSON.stringify({ status: 'passed', browser: await browser.version(), ...result }, null, 2));
    console.log(JSON.stringify({ checks: result.checks }));
  } catch (error) {
    await Promise.all([alice.screenshot({ path: 'output/playwright/axe-venue/alice-failure.png' }), bob.screenshot({ path: 'output/playwright/axe-venue/bob-failure.png' })].map(p => p.catch(() => {})));
    await writeFile('output/playwright/axe-venue/journey.json', JSON.stringify({ status: 'failed', error: error.stack }, null, 2));
    throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
