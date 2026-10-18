import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const release = await holdBrowserLock('IPIC production visit');
let fixture, browser;
try {
  // A synthetic IPIC host grant for the owner fixture's user id (server/tests/browser-fixture.js), so
  // the seated step can start the film and measure its panel.
  // IPIC_GPU=1 runs the visit on this machine's GPU (Metal ANGLE on macOS) with the game's full pipeline, instead of
  // the software profile, whose slow frames can swallow the walk's short key taps under load (#500).
  const gpu = process.env.IPIC_GPU === '1';
  fixture = await startBrowserFixture({ env: { ...(gpu ? {} : { VITE_SHARED_SOFTWARE_RENDERING: '1' }), RIVER_OAKS_SCREENING_HOSTS: 'ipic:user_01M40Y914S1H4EJCEHH91DKTAY' } });
  browser = await chromium.launch({ headless: true, ...(process.env.IPIC_CHROMIUM ? { executablePath: process.env.IPIC_CHROMIUM } : {}), args: gpu ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  // IPIC_REDUCED_MOTION=1 runs the same visit with reduced motion (screen focus is then immediate, #500).
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: process.env.IPIC_REDUCED_MOTION === '1' ? 'reduce' : 'no-preference' });
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
  const page = await context.newPage();page.setDefaultTimeout(60000);
  const source = (await readFile('preview/e2e/ipic-visit.js', 'utf8')).replaceAll('http://127.0.0.1:5173', fixture.origin);
  try {
    const result = await eval(`(${source})`)(page);
    await writeFile('output/playwright/ipic/visit.json', JSON.stringify({ status: 'passed', browser: await browser.version(), ...result,
      ...(gpu ? { rendering: 'Metal ANGLE on this machine\'s GPU, full pipeline (IPIC_GPU=1)' } : {}), reducedMotion: process.env.IPIC_REDUCED_MOTION === '1' }, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    await page.screenshot({ path: 'output/playwright/ipic/visit-failure.png' }).catch(() => {});
    await writeFile('output/playwright/ipic/visit.json', JSON.stringify({ status: 'failed', error: error.stack }, null, 2));
    throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
