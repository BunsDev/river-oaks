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
  for (const [mode, directory, auditQuery] of [
    ['production', 'dist/preview', true],
    ['diagnostic', '.runtime/ios-probe/diagnostic-build', false],
    ['diagnostic', '.runtime/ios-probe/diagnostic-build', true],
  ]) {
    console.log(`Checking ${mode}, auditQuery=${auditQuery}`);
    const root = resolve(directory), chunks = new Set(await readdir(resolve(root, 'assets')));
    const context = await browser.newContext({ viewport: { width: 440, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: 'fixture_session', value: 'bob', url: fixture.origin }]);
    await context.addInitScript({ content: await readFile('experiments/ios-probe/Web/decode-queue.js', 'utf8') + '\nIOSProbeDecodes.useHTMLImages();' });
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    let entryRequests = 0, chunkRequests = 0, externalRequests = 0;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== fixture.origin) { externalRequests++; return route.abort(); }
      if (url.pathname === '/') { entryRequests++; return route.fulfill({ path: resolve(root, mode === 'production' ? 'play/index.html' : 'index.html'), contentType: 'text/html' }); }
      const match = url.pathname.match(/^\/assets\/([^/]+\.(?:js|css))$/);
      if (match && chunks.has(match[1])) { chunkRequests++; return route.fulfill({ path: resolve(root, 'assets', match[1]), contentType: match[1].endsWith('.js') ? 'text/javascript' : 'text/css' }); }
      if (url.pathname.startsWith('/v1/')) return route.fulfill({ status: 503, json: { source: 'unavailable', reason: 'acceptance_fixture' } });
      return route.continue();
    });
    const source = (await readFile('preview/e2e/render-audit.js', 'utf8')).replaceAll('http://127.0.0.1:5181', fixture.origin);
    try {
      const result = await Promise.race([
        new Function('return (' + source + ');')()(page, { renderAuditMode: mode, auditQuery }),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Built audit exceeded 150 seconds')), 150000); }),
      ]);
      assert.equal(externalRequests, 0, 'Built fixture must stay on loopback');
      assert.ok(entryRequests > 0 && chunkRequests > 0, 'Actual built entry and chunks must be exercised');
      report.results.push({ mode, auditQuery, entryRequests, chunkRequests, ...result });
    } finally { clearTimeout(deadline); await context.close(); }
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
finally {
  await browser?.close(); await fixture?.close(); release();
  await writeFile('.runtime/ios-probe/built-render-audit.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, error: report.error, cases: report.results.length }));
}
