// The Gardens in the real district (#507): the contract's named cameras (#506), captured in
// the full local app with the garage (default) and with RIVER_OAKS_DISTRICT_REVISION set to
// the campus, through the authenticated loopback fixture.
//   node preview/e2e/garden-campus-views.mjs [garage|gardens|both]
// Writes output/playwright/garden-campus-views/<revision>-<camera>.png and result.json with
// the served revision, draw calls, triangles and frame times for each view. Matched views
// share camera, viewport, graphics preset and sun hour; residents keep moving between them.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusToScene } from '../../shared/garden-campus-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';

const which = process.argv[2] ?? 'both', output = 'output/playwright/garden-campus-views';
const revisions = which === 'both' ? ['garage', 'gardens'] : [which];
const release = await holdBrowserLock('Garden campus matched views');
const reports = [];
await mkdir(output, { recursive: true });
try {
  for (const revision of revisions) {
    let fixture, browser;
    try {
      fixture = await startBrowserFixture({ env: { VITE_SHARED_SOFTWARE_RENDERING: '0', ...(revision === 'gardens' ? { RIVER_OAKS_DISTRICT_REVISION: DISTRICT_REVISION_GARDENS } : {}) } });
      browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
      await context.addInitScript(() => localStorage.setItem('river-oaks-graphics', 'smooth'));
      const page = await context.newPage();page.setDefaultTimeout(180000);
      const errors = [];page.on('pageerror', error => errors.push(error.message));
      let manifest = null;
      page.on('response', async response => { if (response.url().includes('/api/world-data?world=river-oaks')) manifest = await response.json().catch(() => null); });
      await page.goto(`${fixture.origin}/?render-audit=1`, { waitUntil: 'commit' });
      await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverRenderAudit, null, { timeout: 300000 });
      assert.equal(manifest?.districtRevision ?? null, revision === 'gardens' ? DISTRICT_REVISION_GARDENS : null, `${revision}: the town served the expected revision`);
      await page.evaluate(() => { const slider = document.querySelector('#sun-hour');slider.value = '15';slider.dispatchEvent(new Event('input', { bubbles: true })); });
      for (const view of CAMPUS.cameras) {
        const pose = { position: campusToScene(view.position), target: campusToScene(view.target), fov: view.fov };
        await page.evaluate(pose => window.__riverRenderAudit.view(pose), pose);
        const metrics = await page.evaluate(async () => {
          for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
          const audit = window.__riverRenderAudit;audit.start();
          for (let i = 0; i < 16; i++) await new Promise(requestAnimationFrame);
          const frames = audit.stop(), graphics = audit.graphics();
          return { frames: frames.frames, overflow: frames.overflow, renderer: graphics.renderer, render: graphics.render, memory: graphics.memory };
        });
        const name = `${revision}-${view.id}`;
        await page.screenshot({ path: `${output}/${name}.png` });
        const sorted = [...metrics.frames].sort((a, b) => a - b), p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
        reports.push({ name, revision, camera: view.id, pose, renderer: metrics.renderer, calls: metrics.render.calls, triangles: metrics.render.triangles,
          memory: metrics.memory, frameP50: p(0.5), frameP95: p(0.95), samples: sorted.length, hostLoad: loadavg().map(n => Number(n.toFixed(1))) });
        console.log(JSON.stringify(reports.at(-1)));
      }
      assert.deepEqual(errors, [], `${revision}: no page errors`);
    } finally { await browser?.close();await fixture?.close(); }
  }
  await writeFile(`${output}/result.json`, JSON.stringify({ status: 'passed', reports,
    limits: 'Local loopback fixture on this machine; residents move between views; frame times are the host under its recorded load, not a device budget.' }, null, 2));
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ status: 'failed', error: error.stack, reports }, null, 2)).catch(() => {});throw error;
} finally { release(); }
