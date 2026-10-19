// The Gardens in the real district (#507): the contract's named cameras (#506), captured in
// the full local app with the garage (default) and with RIVER_OAKS_DISTRICT_REVISION set to
// the campus, through the authenticated loopback fixture.
//   node preview/e2e/garden-campus-views.mjs [garage|gardens|both] [contract|circulation]
// Writes output/playwright/garden-campus-views/<revision>-<camera>.png and result.json with
// the served revision, draw calls, triangles and frame times for each view. Matched views
// share camera, viewport, graphics preset and sun hour; residents keep moving between them.
// The circulation set (#508 slice b, campus only) is every Floor 4 gallery, skywalk, terrace
// and roof at eye height without the interface, plus sheet.jpg pairing each render with its
// place on the design plan (garden-campus-circulation-views.mjs).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusToScene } from '../../shared/garden-campus-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';
import { PLANS, circulationCameras, planPoint } from './garden-campus-circulation-views.mjs';

const which = process.argv[2] ?? 'both', set = process.argv[3] ?? 'contract', circulation = set === 'circulation';
assert.ok(['contract', 'circulation'].includes(set) && !(circulation && which !== 'gardens'), 'usage: [garage|gardens|both] [contract|circulation]; circulation is campus only');
const output = circulation ? 'output/playwright/garden-campus-views/circulation' : 'output/playwright/garden-campus-views';
const revisions = which === 'both' ? ['garage', 'gardens'] : [which], cameras = circulation ? circulationCameras() : CAMPUS.cameras;
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
      if (circulation) await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #canvas-host, #canvas-host * { visibility: visible !important; }' });
      for (const view of cameras) {
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
        // Frame intervals (ms) from the render audit's {intervalMs, cpuMs} records.
        const sorted = metrics.frames.map(frame => frame.intervalMs).sort((a, b) => a - b), p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
        reports.push({ name, revision, camera: view.id, ...(circulation ? { levelId: view.levelId, surfaceId: view.surfaceId } : {}), pose, renderer: metrics.renderer, calls: metrics.render.calls, triangles: metrics.render.triangles,
          memory: metrics.memory, frameP50: p(0.5), frameP95: p(0.95), samples: sorted.length, hostLoad: loadavg().map(n => Number(n.toFixed(1))) });
        console.log(JSON.stringify(reports.at(-1)));
      }
      assert.deepEqual(errors, [], `${revision}: no page errors`);
      if (circulation) await matchedSheet(browser);
    } finally { await browser?.close();await fixture?.close(); }
  }
  await writeFile(`${output}/result.json`, JSON.stringify({ status: 'passed', reports,
    limits: 'Local loopback fixture on this machine; residents move between views; frame times are the host under its recorded load, not a device budget.' }, null, 2));
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ status: 'failed', error: error.stack, reports }, null, 2)).catch(() => {});throw error;
} finally { release(); }

// Each render beside a 44 m crop of its design plan, the camera and its 70° view cone marked
// in the plan's own frame, so the build reads against the drawing it was made from.
async function matchedSheet(browser) {
  const page = await (await browser.newContext({ viewport: { width: 812, height: 400 }, deviceScaleFactor: 1 })).newPage();
  const plans = Object.fromEntries(await Promise.all(Object.entries(PLANS).map(async ([id, { file }]) => [id, await readFile(file, 'utf8')])));
  const rows = await Promise.all(cameras.map(async view => {
    const [x, y] = planPoint(view.plan, view.position), [tx, ty] = planPoint(view.plan, view.target), { s } = PLANS[view.plan], half = 22 * s;
    const angle = Math.atan2(ty - y, tx - x), cone = [-1, 1].map(side => [x + Math.cos(angle + side * 0.61) * 10 * s, y + Math.sin(angle + side * 0.61) * 10 * s]);
    const plan = plans[view.plan].replace(/width="\d+" height="\d+" viewBox="[^"]*"/, `width="300" height="300" viewBox="${x - half} ${y - half} ${2 * half} ${2 * half}"`)
      .replace('</svg>', `<polygon points="${[[x, y], ...cone].map(point => point.join(',')).join(' ')}" fill="#2f5d8e" fill-opacity="0.25" stroke="#2f5d8e"/><circle cx="${x}" cy="${y}" r="${0.6 * s}" fill="#2f5d8e"/></svg>`);
    const render = (await readFile(`${output}/gardens-${view.id}.png`)).toString('base64');
    return `<figure>${plan}<img src="data:image/png;base64,${render}"><figcaption>${view.id} · ${view.levelId} · ${view.name}</figcaption></figure>`;
  }));
  await page.setContent(`<style>body{margin:0;font:13px Helvetica,Arial,sans-serif;background:#fbfaf7}figure{display:grid;grid-template-columns:300px 480px;gap:8px;margin:0;padding:8px 12px;border-bottom:1px solid #ddd}img{width:480px;height:300px}figcaption{grid-column:1/3}</style>${rows.join('')}`);
  await page.screenshot({ path: `${output}/sheet.jpg`, type: 'jpeg', quality: 82, fullPage: true });
  await page.context().close();
}
