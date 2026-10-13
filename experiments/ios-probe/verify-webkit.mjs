// Local WebKit support check, not iPhone acceptance. Existing loopback fixture
// owns auth and multiplayer; provider requests remain offline.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { webkit } from 'playwright';
import { startBrowserFixture } from '../../preview/e2e/fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const release = await holdBrowserLock('iOS probe WebKit support');
let fixture, browser;
const report = { scope: 'macOS Playwright WebKit, existing loopback fixture, ordinary Bob; no iPhone/live auth acceptance', status: 'running' };
try {
  fixture = await startBrowserFixture();
  browser = await webkit.launch();
  const context = await browser.newContext({ viewport: { width: 440, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'fixture_session', value: 'bob', url: fixture.origin }]);
  const source = await readFile(new URL('./Web/probe.js', import.meta.url), 'utf8');
  await context.addInitScript({ content: source + '\nIOSProbe.install();' });
  const page = await context.newPage();
  // Explicitly keep optional inference/speech local and unavailable.
  await page.route('**/v1/**', route => route.fulfill({ status: 503, json: { source: 'unavailable', reason: 'acceptance_fixture' } }));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture.origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 120000 });
  await page.waitForFunction(() => globalThis.__iosProbe && document.querySelector('#canvas-host')?.dataset.renderStats, null, { timeout: 30000 });
  // Poll the observable collector rather than sleeping a guessed render delay.
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.quality?.includes('fps'), null, { timeout: 30000 });
  await page.evaluate(() => new Promise(resolve => { let count=0; const tick=()=>{ if (++count >= 20) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
  report.sample = await page.evaluate(() => globalThis.__iosProbe.read());
  assert.equal(report.sample.ready, true);
  assert.ok(report.sample.intervalsMs.length > 1);
  assert.ok(report.sample.renderCounts.triangles > 0);
  assert.equal(report.sample.overflow, false);
  assert.equal(report.sample.invalid, 0);
  report.finalSample = await page.evaluate(() => globalThis.__iosProbe.stop());
  report.errors = errors;
  assert.deepEqual(errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
} finally {
  await browser?.close(); await fixture?.close(); release();
  await mkdir('.runtime/ios-probe', { recursive: true });
  await writeFile('.runtime/ios-probe/webkit.json', JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({status:report.status,error:report.error,frames:report.sample?.intervalsMs.length}));
}
