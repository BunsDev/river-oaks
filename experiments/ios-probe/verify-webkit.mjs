// Local WebKit support check, not iPhone acceptance. Existing loopback fixture
// owns auth and multiplayer; provider requests remain offline.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { webkit } from 'playwright';
import { startBrowserFixture } from '../../preview/e2e/fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const serializedDecodes = process.argv.includes('--serialize-decodes');
const htmlImages = process.argv.includes('--html-images');
if (serializedDecodes && htmlImages) throw new Error('Choose one decoder experiment');
const release = await holdBrowserLock('iOS probe WebKit support');
let fixture, browser, page;
const errors=[];let consoleErrors=0;const consoleKinds={};
const fixtureRefusals = new Set(), consoleRecords = [];
const report = { scope: 'macOS Playwright WebKit, existing loopback fixture, ordinary Bob; no iPhone/live auth acceptance', status: 'running', serializedDecodes, htmlImages };
try {
  fixture = await startBrowserFixture();
  browser = await webkit.launch();
  const context = await browser.newContext({ viewport: { width: 440, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'fixture_session', value: 'bob', url: fixture.origin }]);
  const source = await readFile(new URL('./Web/probe.js', import.meta.url), 'utf8');
  await context.addInitScript({ content: source + '\nIOSProbe.install();' });
  if (serializedDecodes) await context.addInitScript({ content: await readFile(new URL('./Web/decode-queue.js', import.meta.url), 'utf8') + '\nIOSProbeDecodes.install();' });
  if (htmlImages) await context.addInitScript({ content: await readFile(new URL('./Web/decode-queue.js', import.meta.url), 'utf8') + '\nIOSProbeDecodes.useHTMLImages();' });
  page = await context.newPage();
  // Explicitly keep optional inference/speech local and unavailable.
  await page.route('**/v1/**', route => {
    fixtureRefusals.add(route.request().url());
    return route.fulfill({ status: 503, json: { source: 'unavailable', reason: 'acceptance_fixture' } });
  });
  page.on('pageerror',error=>{ if(errors.length<20) errors.push(error.message); });
  page.on('console',message=>{
    if (message.type() !== 'error') return;
    consoleErrors++;
    const text = message.text();
    const status = text.match(/status(?: code)?(?: of)?[: ]+(\d{3})/i)?.[1];
    const kind = /THREE|WebGL|texture|shader/i.test(text) ? 'graphics' : status ? 'http-' + status : /WebSocket/i.test(text) ? 'socket' : 'other';
    consoleKinds[kind] = (consoleKinds[kind] ?? 0) + 1;
    if (consoleRecords.length < 100) consoleRecords.push({ kind, url: message.location().url });
  });
  report.stage = 'navigation';
  await page.goto(fixture.origin, { waitUntil: 'domcontentloaded' });
  report.stage = 'player-ready';
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 120000 });
  report.stage = 'render-counters';
  await page.waitForFunction(() => globalThis.__iosProbe && document.querySelector('#canvas-host')?.dataset.renderStats, null, { timeout: 30000 });
  // Poll the observable collector rather than sleeping a guessed render delay.
  report.stage = 'quality-telemetry';
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.quality?.includes('fps'), null, { timeout: 30000 });
  await page.evaluate(() => new Promise(resolve => { let count=0; const tick=()=>{ if (++count >= 20) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
  if (serializedDecodes || htmlImages) {
    report.stage = 'resident-readiness';
    await page.waitForFunction(() => { const data = document.querySelector('#canvas-host')?.dataset; return Number(data?.storePeopleTotal) > 0 && data.storePeopleReady === data.storePeopleTotal; }, null, { timeout: 120000 });
    report.stage = 'asset-settled';
    await page.waitForFunction(() => JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress || '{}').done === true, null, { timeout: 120000 });
    report.scene = await page.evaluate(() => IOSProbe.sceneSnapshot());
    assert.equal(report.scene.assets.failed, 0);
    if (htmlImages) { assert.equal(report.scene.decoderMode, 'html-images'); assert.equal(report.scene.imageBitmapAvailable, false); }
    if (serializedDecodes) {
      assert.ok(report.scene.decodes?.completed > 0);
      assert.equal(report.scene.decodes.maxActive, 1);
      assert.equal(report.scene.decodes.failed, 0);
    }
    assert.equal(report.scene.storePeopleReady, report.scene.storePeopleTotal);
  }
  report.sample = await page.evaluate(() => globalThis.__iosProbe.read());
  assert.equal(report.sample.ready, true);
  assert.ok(report.sample.intervalsMs.length > 1);
  assert.ok(report.sample.renderCounts.triangles > 0);
  assert.equal(report.sample.overflow, false);
  assert.equal(report.sample.invalid, 0);
  report.finalSample = await page.evaluate(() => globalThis.__iosProbe.stop());
  report.errors = errors; report.consoleErrors = consoleErrors; report.consoleKinds = consoleKinds;
  // Match only responses this harness explicitly refused. A generic 503,
  // graphics error, or unknown console location remains a failure. URLs stay local.
  report.expectedFixtureConsoleErrors = consoleRecords.filter(record => record.kind === 'http-503' && fixtureRefusals.has(record.url)).length;
  report.unexpectedConsoleErrors = consoleErrors - report.expectedFixtureConsoleErrors;
  report.fixtureRefusalCount = fixtureRefusals.size;
  assert.equal(report.unexpectedConsoleErrors, 0, 'Unexpected console errors may include missing textures');
  assert.deepEqual(errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
  report.errors = errors; report.consoleErrors = consoleErrors; report.consoleKinds = consoleKinds;
  if (page && !page.isClosed()) {
    let timeout;
    try { report.failureScene = await Promise.race([page.evaluate(() => globalThis.IOSProbe?.sceneSnapshot() ?? null), new Promise(resolve => { timeout = setTimeout(() => resolve({unavailable:true}), 3000); })]); }
    catch { report.failureScene = {unavailable:true}; }
    finally { clearTimeout(timeout); }
  }
} finally {
  await browser?.close(); await fixture?.close(); release();
  await mkdir('.runtime/ios-probe', { recursive: true });
  await writeFile(serializedDecodes ? '.runtime/ios-probe/webkit-decodes.json' : htmlImages ? '.runtime/ios-probe/webkit-html-images.json' : '.runtime/ios-probe/webkit.json', JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({status:report.status,error:report.error,frames:report.sample?.intervalsMs.length}));
}
