// Exercise actual built bundles against the existing loopback fixture. Only
// generated entry/chunk files are substituted; auth/transport stay fixture-owned.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { webkit } from 'playwright';
import { startBrowserFixture } from '../../preview/e2e/fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const release = await holdBrowserLock('iOS built render audit');
let fixture, browser, deadline;
const report = { scope: 'local built bundles in macOS WebKit with offline Bob fixture; not physical iPhone performance or live auth acceptance', results: [], status: 'running' };
try {
  fixture = await startBrowserFixture(); browser = await webkit.launch();
  for (const [mode, directory, auditQuery, entryPath, pagePath] of [
    ['production', 'dist/preview', true, 'play/index.html', '/'],
    ['diagnostic', '.runtime/ios-probe/diagnostic-build', false, 'index.html', '/'],
    ['diagnostic', '.runtime/ios-probe/diagnostic-build', true, 'index.html', '/'],
    ['diagnostic', 'dist/preview', true, 'ios-probe/index.html', '/ios-probe/'],
  ]) {
    console.log(`Checking ${mode}, auditQuery=${auditQuery}, entry=${entryPath}`);
    const root = resolve(directory), chunks = new Set(await readdir(resolve(root, 'assets')));
    const context = await browser.newContext({ viewport: { width: 440, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: 'fixture_session', value: 'bob', url: fixture.origin }]);
    await context.addInitScript({ content: await readFile('experiments/ios-probe/Web/decode-queue.js', 'utf8') + '\nIOSProbeDecodes.useHTMLImages();' });
    await context.addInitScript({ content: await readFile('experiments/ios-probe/Web/phase-capture.js', 'utf8') + '\nIOSProbePhases.install();' });
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    let entryRequests = 0, chunkRequests = 0, externalRequests = 0;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== fixture.origin) { externalRequests++; return route.abort(); }
      if (url.pathname === pagePath) { entryRequests++; return route.fulfill({ path: resolve(root, entryPath), contentType: 'text/html' }); }
      const match = url.pathname.match(/^\/assets\/([^/]+\.(?:js|css))$/);
      if (match && chunks.has(match[1])) { chunkRequests++; return route.fulfill({ path: resolve(root, 'assets', match[1]), contentType: match[1].endsWith('.js') ? 'text/javascript' : 'text/css' }); }
      if (url.pathname.startsWith('/v1/')) return route.fulfill({ status: 503, json: { source: 'unavailable', reason: 'acceptance_fixture' } });
      return route.continue();
    });
    const source = (await readFile('preview/e2e/render-audit.js', 'utf8')).replaceAll('http://127.0.0.1:5181/', fixture.origin + pagePath);
    try {
      const result = await Promise.race([
        (async () => {
          const result = await new Function('return (' + source + ');')()(page, { renderAuditMode: mode, auditQuery });
          const phaseAdapter = await page.evaluate(async () => {
            const capture = globalThis.__iosProbePhaseCapture, started = capture.start('built-native-test');
            if (started.status !== 'started') return started;
            await new Promise(resolve => { let count = 0; const tick = () => ++count >= 30 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
            return capture.stop('built-native-test');
          });
          assert.equal(phaseAdapter.status, mode === 'diagnostic' && auditQuery ? 'captured' : 'unsupported');
          if (phaseAdapter.status === 'captured') assert.ok(phaseAdapter.frames.length > 10);
          return { ...result, phaseAdapter };
        })(),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Built audit exceeded 150 seconds')), 150000); }),
      ]);
      assert.equal(externalRequests, 0, 'Built fixture must stay on loopback');
      assert.ok(entryRequests > 0 && chunkRequests > 0, 'Actual built entry and chunks must be exercised');
      report.results.push({ mode, auditQuery, entryPath, entryRequests, chunkRequests, ...result });
    } finally { clearTimeout(deadline); await context.close(); }
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
finally {
  await browser?.close(); await fixture?.close(); release();
  await writeFile('.runtime/ios-probe/built-render-audit.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, error: report.error, cases: report.results.length }));
}
