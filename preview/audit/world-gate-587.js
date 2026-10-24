// Matched performance comparison for the #587 MVP gate: the Gardens revision
// against Bayou Market Commons on the same host, browser, quality and camera.
// Medians of three warmed samples per profile decide the provisional budgets in
// docs/world-expansion.md; a Commons plaza view is recorded but has no baseline.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, loadavg, platform, arch } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { startBrowserFixture } from '../e2e/fixture-server.js';
import { distribution } from './metrics.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, '.runtime/world-gate-587', `perf-${new Date().toISOString().replaceAll(':', '-')}`);
const sampleMs = Number(process.env.WORLD_GATE_SAMPLE_MS ?? 30000), repeats = 3;
const revisions = { gardens: 'river-oaks-gardens-3', commons: 'east-garden-commons-market-1' };
const report = {
  status: 'running', startedAt: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean).length,
  machine: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  scope: 'Local Chromium development build, one fixture player, in-memory loopback authority. Phone-sized viewport shares the desktop GPU and is not physical mobile hardware.',
  quality: 'sharp', reducedMotion: 'reduce', sampleMs, repeats, profiles: [],
};
const median = values => { const s = [...values].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
await mkdir(output, { recursive: true });
const flush = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let browser, fixture;
const release = await holdBrowserLock('world gate 587 performance');
try {
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  report.browser = browser.version();
  const district = JSON.parse(await readFile(join(root, 'preview/public/data/district.json')));
  const [x, north, height] = district.walkSpawn;
  const cameras = { arrival: { position: [x, height + 2.4, -north + 5], target: [x, height + 1.4, -north - 12], fov: 55 } };
  for (const profile of [
    { name: 'desktop', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
    { name: 'phone-viewport', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  ]) for (const [label, revision] of Object.entries(revisions)) {
    const row = { profile: profile.name, revision, status: 'running', samples: [], errors: [] };
    report.profiles.push(row); await flush();
    fixture = await startBrowserFixture({ env: { RIVER_OAKS_DISTRICT_REVISION: revision } });
    const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, reducedMotion: 'reduce' });
    try {
      await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
      await context.addInitScript(() => { localStorage.setItem('river-oaks-graphics', 'sharp'); performance.setResourceTimingBufferSize(10000); });
      const page = await context.newPage(); page.setDefaultTimeout(180000);
      page.on('pageerror', error => row.errors.push(error.message));
      const started = performance.now();
      await page.goto(`${fixture.origin}/?motion-debug=1&render-audit=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(revision => {
        const town = window.__riverMultiplayer?.();
        return town?.connected && town.snapshot?.districtRevision === revision
          && document.querySelector('#canvas-host')?.dataset.playerReady === 'true';
      }, revision);
      row.joinReadyMs = performance.now() - started;
      await page.waitForFunction(() => JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress ?? '{}').done);
      row.assetReadyMs = performance.now() - started;
      row.assets = JSON.parse(await page.locator('#viewport').getAttribute('data-asset-progress'));
      assert.equal(row.assets.failed, 0, 'Asset failures invalidate the comparison');
      row.resources = await page.evaluate(() => {
        const entries = performance.getEntriesByType('resource');
        return { count: entries.length, transferBytes: entries.reduce((n, e) => n + e.transferSize, 0) };
      });
      if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
      const views = { ...cameras };
      if (label === 'commons') {
        // Above the plaza's south-west corner, looking across it toward the pavilion.
        views.plaza = { position: [-2666.336078522973 + 50, 30.4, 1335 + 30], target: [-2666.336078522973 + 90, 18.4, 1335 - 10], fov: 55 };
      }
      for (const [view, camera] of Object.entries(views)) {
        await page.evaluate(camera => window.__riverRenderAudit.view(camera), camera);
        await page.waitForTimeout(3000);
        for (let repeat = 0; repeat < repeats; repeat++) {
          await page.evaluate(() => window.__riverRenderAudit.start());
          await page.waitForTimeout(sampleMs);
          const data = await page.evaluate(() => ({ timing: window.__riverRenderAudit.stop(), graphics: window.__riverRenderAudit.graphics(),
            heap: performance.memory?.usedJSHeapSize ?? null }));
          assert.equal(data.timing.overflow, false);
          assert.ok(!/SwiftShader|llvmpipe|Software/i.test(data.graphics.renderer), `Software renderer: ${data.graphics.renderer}`);
          row.samples.push({ view, repeat, loadAverage: loadavg(), heap: data.heap, render: data.graphics.render, memory: data.graphics.memory,
            frame: distribution(data.timing.frames.map(frame => frame.intervalMs)), cpu: distribution(data.timing.frames.map(frame => frame.cpuMs)) });
          await flush();
        }
        await page.screenshot({ path: join(output, `${profile.name}-${label}-${view}.png`) });
      }
      row.summary = Object.fromEntries(Object.keys(views).map(view => {
        const s = row.samples.filter(sample => sample.view === view);
        return [view, { frameP95: median(s.map(v => v.frame.p95Ms)), cpuP95: median(s.map(v => v.cpu.p95Ms)), calls: median(s.map(v => v.render.calls)),
          triangles: median(s.map(v => v.render.triangles)), geometries: median(s.map(v => v.memory.geometries)), textures: median(s.map(v => v.memory.textures)), heap: median(s.map(v => v.heap ?? 0)) }];
      }));
      assert.deepEqual(row.errors, []);
      row.status = 'passed';
    } catch (error) { row.status = 'failed'; row.error = error.stack; throw error; }
    finally { await context.close(); await fixture.close(); fixture = null; await flush(); }
  }
  report.comparison = Object.fromEntries(['desktop', 'phone-viewport'].map(name => {
    const [g, c] = ['gardens', 'commons'].map(label => report.profiles.find(row => row.profile === name && row.revision === revisions[label]).summary.arrival);
    const ratio = key => +(c[key] / g[key]).toFixed(4);
    return [name, { gardens: g, commons: c, frameP95Ratio: ratio('frameP95'), cpuP95Ratio: ratio('cpuP95'), callsRatio: ratio('calls'), trianglesRatio: ratio('triangles'),
      budget: { frameP95: ratio('frameP95') <= 1.1, cpuP95: ratio('cpuP95') <= 1.1 } }];
  }));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error ??= error.stack; process.exitCode = 1;
} finally {
  await browser?.close(); await fixture?.close(); release();
  report.finishedAt = new Date().toISOString(); await flush();
  console.log(JSON.stringify({ status: report.status, report: join(output, 'report.json'), comparison: report.comparison, error: report.error }, null, 1));
}
