// Authenticated local fixture only. Rebuilds the same scene used in production.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from '../preview/e2e/fixture-server.js';
import { holdBrowserLock } from './browser-lock.mjs';
const release = await holdBrowserLock('IPIC model review and export');
let fixture, browser;
try {
  fixture = await startBrowserFixture();
  browser = await chromium.launch({ headless: true, ...(process.env.IPIC_CHROMIUM ? { executablePath: process.env.IPIC_CHROMIUM } : {}), args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${fixture.origin}/e2e/fixtures/ipic.html`);
  await page.waitForFunction(() => window.ipicReview?.ready, null, { timeout: 90000 });
  await mkdir('output/playwright/ipic', { recursive: true });
  const views = [];
  for (const name of ['reception','mural','lounge','bar','auditorium']) {
    await page.evaluate(name => window.ipicReview.view(name), name);
    await page.screenshot({ path: `output/playwright/ipic/${name}.png` });
    views.push({ name, ...await page.evaluate(() => window.ipicReview.stats()) });
  }
  const encoded = await page.evaluate(() => window.ipicReview.exportGLB());
  const glb = Buffer.from(encoded, 'base64');
  if (glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(8) !== glb.length) throw new Error('Invalid GLB container');
  await writeFile('preview/public/assets/ipic/ipic-interior.glb', glb);
  await writeFile('output/playwright/ipic/review.json', JSON.stringify({ browser: await browser.version(), errors, views, glbBytes: glb.length }, null, 2));
  if (errors.length || views.some(v => v.error !== 0)) throw new Error(JSON.stringify({ errors, views }));
  console.log(JSON.stringify({ browser: await browser.version(), glbBytes: glb.length, views }, null, 2));
} finally { await browser?.close(); await fixture?.close(); release(); }
