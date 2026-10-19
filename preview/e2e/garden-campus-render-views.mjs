// The Gardens finish pass (#511): matched views of the real district, the garage default
// against the campus revision, from the same cameras, viewport, graphics preset and sun
// hours, with the interface hidden. The contract's five cameras (#506) plus the finish
// cameras in garden-campus-render-common.mjs: both long sides, the south office approach,
// under each skywalk, Floor 4, a roof garden and a terrace.
//   node preview/e2e/garden-campus-render-views.mjs [garage|gardens|both] [--hours day,dusk] [--cameras id,id]
// Writes output/playwright/garden-campus-render-views/<revision>-<hour>-<camera>.png, matched
// contact sheets (sheet-<hour>.jpg) and result.json with the served revision, the campus glow
// the time of day applied, draw calls, triangles and frame times per view. Residents keep
// moving between views; frame times are this host under its recorded load, not a budget.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { CAMPUS_GLOW } from '../src/garden-campus.js';
import { atmosphereFor } from '../src/atmosphere.js';
import { FINISH_CAMERAS, HOURS, campusGlow, launch, openDistrict, pose, sample, setHour, startFixture } from './garden-campus-render-common.mjs';

const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const hours = option('hours', 'day,dusk').split(',').map(key => [key, HOURS[key] ?? Number(key)]);
const only = option('cameras', null)?.split(','), which = args[0] ?? 'both';
const cameras = FINISH_CAMERAS.filter(view => !only || only.includes(view.id));
const revisions = which === 'both' ? ['garage', 'gardens'] : [which], output = 'output/playwright/garden-campus-render-views';
await mkdir(output, { recursive: true });
const release = await holdBrowserLock('Garden campus finish matched views');
const reports = [];
let browser;
try {
  browser = await launch();
  for (const revision of revisions) {
    let fixture, session;
    try {
      fixture = await startFixture(revision);
      session = await openDistrict(browser, fixture, revision, { hideInterface: true });
      const { page, errors } = session;
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
      for (const [label, hour] of hours) {
        await setHour(page, hour);
        // The glow follows the time of day through main.js updateAtmosphere (the relight hook).
        const glow = await campusGlow(page), twilight = atmosphereFor(hour, 'clear').twilight;
        if (revision === 'gardens') assert.ok(Math.abs(glow - (CAMPUS_GLOW.day + (CAMPUS_GLOW.dusk - CAMPUS_GLOW.day) * twilight)) < 1e-6, `glow ${glow} follows twilight ${twilight}`);
        for (const view of cameras) {
          const camera = pose(view);
          await page.evaluate(pose => window.__riverRenderAudit.view(pose), camera);
          const metrics = await sample(page, 24, 12), name = `${revision}-${label}-${view.id}`;
          await page.screenshot({ path: `${output}/${name}.png` });
          reports.push({ name, revision, hour, label, camera: view.id, pose: camera, glow, ...metrics, hostLoad: loadavg().map(n => Number(n.toFixed(1))) });
          console.log(JSON.stringify({ name, calls: metrics.calls, triangles: metrics.triangles, frameP50: metrics.frameP50, glow }));
        }
      }
      await page.evaluate(() => window.__riverRenderAudit.release());
      assert.deepEqual(errors, [], `${revision}: no page errors`);
    } finally { await session?.context.close();await fixture?.close(); }
  }
  // Matched contact sheets: one row per camera, garage beside gardens, per hour.
  if (revisions.length === 2) for (const [label] of hours) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 400 } }), cells = [];
    for (const view of cameras) for (const revision of revisions) {
      const data = (await readFile(`${output}/${revision}-${label}-${view.id}.png`)).toString('base64');
      cells.push(`<figure><img src="data:image/png;base64,${data}"><figcaption>${revision} · ${label} · ${view.id}</figcaption></figure>`);
    }
    await page.setContent(`<style>body{margin:0;background:#111;font:12px system-ui;color:#ddd;display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px}figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 4px}</style>${cells.join('')}`);
    await page.screenshot({ path: `${output}/sheet-${label}.jpg`, type: 'jpeg', quality: 72, fullPage: true });await page.close();
  }
  await writeFile(`${output}/result.json`, JSON.stringify({ status: 'passed', hours: Object.fromEntries(hours), cameras: cameras.map(view => ({ ...view, scene: pose(view) })), reports,
    limits: 'Local loopback fixture, Smoothest preset, 1280x800 at DPR 1, interface hidden; residents move between views; frame times are this host under its recorded load (vsync on), not a device budget.' }, null, 2));
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ status: 'failed', error: error.stack, reports }, null, 2)).catch(() => {});throw error;
} finally { await browser?.close();release(); }
