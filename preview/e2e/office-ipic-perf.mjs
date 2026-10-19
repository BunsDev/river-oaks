// Office + IPIC performance profile (#368): node preview/e2e/office-ipic-perf.mjs
// Read-only measurement on this machine's GPU (Metal ANGLE on macOS) with vsync and the frame
// cap off, through the DEV-only render audit. Each space is measured from its own cold browser
// context, so its street baseline and load cost are separate:
//   ipic       street -> IPIC reception, mural, lounge, bar and auditorium (IPIC_CAMERAS),
//              then the auditorium again with the venue's default film playing (the approved short since #365; drift sampled);
//   penthouse  street -> owner's penthouse visit (RIVER_OAKS_OFFICE_LAYOUT=office-penthouse-1);
//   legacy     street -> owner's legacy office visit (a second fixture, default layout).
// Each view records three windows of rAF interval and render CPU time, renderer.info for the
// whole frame, the JS heap and resource-timing bytes. Numbers describe one shared,
// loaded workstation; they are provisional evidence, not device budgets or limits.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { IPIC_CAMERAS } from '../src/ipic-plan.js';

const OUT = process.env.PERF_OUT ?? 'output/playwright/office-ipic-perf';
const OWNER = 'user_01M40Y914S1H4EJCEHH91DKTAY'; // server/tests/browser-fixture.js's synthetic Jevica account
const VIEWPORT = { width: 1440, height: 900 }, FOV = 67, WINDOWS = 3, FRAMES = 180;
const ARGS = process.platform === 'darwin'
  ? ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info']
  : ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info'];
const release = await holdBrowserLock('Office + IPIC performance profile');
const fixtures = [];
let browser;
await mkdir(OUT, { recursive: true });

const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(2) : null; };
const median = values => percentile(values, 0.5);

async function open(fixture, identity, errors) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  // The dev server's module requests overflow the default 250-entry buffer during boot; keep every entry.
  await context.addInitScript(() => performance.setResourceTimingBufferSize(100000));
  await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(`${identity}: ${error.message}`));
  await page.goto(`${fixture.origin}/?motion-debug=1&render-audit=1`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 180000 });
  await page.evaluate(() => document.querySelector('[data-quality="sharp"]').click());
  await page.waitForFunction(() => JSON.parse(document.querySelector('#canvas-host').dataset.quality || '{}').mode === 'sharp');
  const banner = page.locator('.hardware-acceleration-warning button');
  if (await banner.isVisible().catch(() => false)) await banner.click();
  return { context, page };
}

// Bytes fetched so far (resource timing; dev server, so modules are unbundled and uncompressed).
const transfer = page => page.evaluate(() => {
  const entries = performance.getEntriesByType('resource');
  const sum = key => entries.reduce((total, entry) => total + (entry[key] || 0), 0);
  return { requests: entries.length, transferBytes: sum('transferSize'), decodedBytes: sum('decodedBodySize') };
});
const delta = (after, before) => Object.fromEntries(Object.keys(after).map(key => [key, after[key] - before[key]]));

// Three windows of FRAMES frames (each capped at 10 s) through the DEV render audit.
async function measure(page, label, { drift = false } = {}) {
  await page.waitForTimeout(1500);
  const windows = [];
  for (let i = 0; i < WINDOWS; i++) {
    const sample = await page.evaluate(async ([frames, drift]) => {
      const audit = window.__riverRenderAudit, drifts = [];
      audit.start();
      const started = performance.now();
      let ticks = 0;
      await new Promise(resolve => {
        const tick = () => {
          if (drift && ticks % 10 === 0) { const s = window.__riverScreening?.(); if (s?.state === 'playing') drifts.push(s.driftMs); }
          if (++ticks > frames || performance.now() - started > 10000) resolve(); else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const { frames: collected, overflow } = audit.stop();
      if (overflow) throw new Error('render audit overflow');
      return { frames: collected, drifts, graphics: audit.graphics(), heapBytes: performance.memory?.usedJSHeapSize ?? null };
    }, [FRAMES, drift]);
    windows.push(sample);
  }
  const summary = windows.map(({ frames, drifts }) => ({
    frames: frames.length,
    intervalMs: { p50: percentile(frames.map(f => f.intervalMs), 0.5), p95: percentile(frames.map(f => f.intervalMs), 0.95), max: +Math.max(...frames.map(f => f.intervalMs)).toFixed(2) },
    cpuMs: { p50: percentile(frames.map(f => f.cpuMs), 0.5), p95: percentile(frames.map(f => f.cpuMs), 0.95) },
    ...(drift ? { driftMs: { samples: drifts.length, p50: percentile(drifts.map(Math.abs), 0.5), p95: percentile(drifts.map(Math.abs), 0.95), max: drifts.length ? Math.max(...drifts.map(Math.abs)) : null } } : {}),
  }));
  const last = windows.at(-1).graphics;
  const result = {
    label, windows: summary,
    intervalMs: { p50: median(summary.map(w => w.intervalMs.p50)), p95: median(summary.map(w => w.intervalMs.p95)) },
    cpuMs: { p50: median(summary.map(w => w.cpuMs.p50)), p95: median(summary.map(w => w.cpuMs.p95)) },
    render: { calls: last.render.calls, triangles: last.render.triangles, points: last.render.points, lines: last.render.lines },
    memory: { ...last.memory, heapBytes: windows.at(-1).heapBytes },
    pipeline: last.pipeline, quality: last.quality,
  };
  await page.screenshot({ path: `${OUT}/${label}.png` });
  console.log(`${label}: p50 ${result.intervalMs.p50} ms, p95 ${result.intervalMs.p95} ms, cpu p50 ${result.cpuMs.p50} ms, calls ${result.render.calls}, triangles ${result.render.triangles}`);
  return result;
}

// IPIC's room frame [a, h, d] (h above the street floor) to Three.js [east, up, -north].
async function ipicFrame(page) {
  const plan = await page.evaluate(async () => {
    const { storeRoomsFor } = await import('/src/store-rooms.js');
    const r = storeRoomsFor(await fetch('/data/district.json').then(x => x.json())).find(x => x.interior === 'ipic-photo-v1');
    return { facade: r.facade, right: r.right, inward: r.inward, floor: r.floor };
  });
  return ([a, h, d]) => [plan.facade[0] + plan.right[0] * a + plan.inward[0] * d, plan.floor + h, -(plan.facade[1] + plan.right[1] * a + plan.inward[1] * d)];
}

// One fixed street pose for every context: 14 m out from IPIC's entrance, facing it.
async function streetBaseline(page, label) {
  const three = await ipicFrame(page);
  await page.evaluate(([position, target, fov]) => window.__riverRenderAudit.view({ position, target, fov }), [three([0, 1.65, -14]), three([0, 4, 0]), FOV]);
  const result = await measure(page, label);
  await page.evaluate(() => window.__riverRenderAudit.release());
  return result;
}

async function visitOffice(page) {
  await page.locator('#office-lobby').evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector('#office-enter')?.disabled === false, null, { timeout: 60000 });
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyF');
  await page.waitForFunction(() => document.querySelector('#office-visit')?.open && document.querySelector('#office-visit').dataset.phase === 'office', null, { timeout: 180000 });
}

try {
  const load = [loadavg().map(value => +value.toFixed(1))];
  const errors = [], spaces = {};
  browser = await chromium.launch({ headless: true, args: ARGS });
  const penthouse = await startBrowserFixture({ env: { RIVER_OAKS_OFFICE_LAYOUT: 'office-penthouse-1', RIVER_OAKS_SCREENING_HOSTS: `ipic:${OWNER}` } });
  fixtures.push(penthouse);

  { // IPIC, from a cold context.
    const { context, page } = await open(penthouse, 'owner', errors);
    const street = await streetBaseline(page, 'ipic-street');
    const before = await transfer(page);
    const three = await ipicFrame(page);
    const { openHudSpace } = await import('./hud-navigation.js');
    const started = Date.now();
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
    await page.locator('#enter-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside === 'osm-node-8172494964');
    await page.locator('#panel-toggle').click();
    await page.waitForFunction(() => window.__riverScreening?.()?.active === true);
    const entered = { ms: Date.now() - started, ...delta(await transfer(page), before) };
    await page.evaluate(() => { document.body.classList.add('clear-view'); const style = document.createElement('style'); style.textContent = '#ipic-screening{visibility:hidden!important}'; document.head.append(style); });
    const views = [];
    for (const camera of IPIC_CAMERAS) {
      await page.evaluate(([position, target, fov]) => window.__riverRenderAudit.view({ position, target, fov }), [three(camera.eye), three(camera.target), FOV]);
      views.push(await measure(page, `ipic-${camera.name}`));
    }
    await page.evaluate(() => window.__riverRenderAudit.release());
    await page.waitForFunction(() => !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden);
    await page.locator('#ipic-screening [data-control="host-start"]').evaluate(button => button.click());
    await page.waitForFunction(() => window.__riverScreening().state === 'playing' && window.__riverScreening().currentTime > 1, null, { timeout: 30000 });
    const auditorium = IPIC_CAMERAS.find(camera => camera.name === 'auditorium');
    await page.evaluate(([position, target, fov]) => window.__riverRenderAudit.view({ position, target, fov }), [three(auditorium.eye), three(auditorium.target), FOV]);
    views.push(await measure(page, 'ipic-auditorium-film', { drift: true }));
    await page.evaluate(() => window.__riverRenderAudit.release());
    const film = { ...delta(await transfer(page), before) };
    spaces.ipic = { street, entered, views, cumulativeAfterFilm: film };
    await context.close();
  }

  { // Penthouse, from a cold context.
    const { context, page } = await open(penthouse, 'owner', errors);
    const street = await streetBaseline(page, 'penthouse-street');
    const before = await transfer(page), started = Date.now();
    await visitOffice(page);
    const entered = { ms: Date.now() - started, ...delta(await transfer(page), before) };
    const office = await measure(page, 'penthouse-arrival');
    spaces.penthouse = { street, entered, views: [office], layout: await page.evaluate(() => { const m = window.__riverMultiplayer(); return m.snapshot?.players?.find(player => player.id === m.selfId)?.office?.layout ?? null; }) };
    await context.close();
  }
  await penthouse.close(); fixtures.pop();

  const legacy = await startBrowserFixture();
  fixtures.push(legacy);
  { // Legacy office, from a cold context on a fixture with the default layout.
    const { context, page } = await open(legacy, 'owner', errors);
    const street = await streetBaseline(page, 'legacy-street');
    const before = await transfer(page), started = Date.now();
    await visitOffice(page);
    const entered = { ms: Date.now() - started, ...delta(await transfer(page), before) };
    const office = await measure(page, 'legacy-arrival');
    spaces.legacy = { street, entered, views: [office], layout: await page.evaluate(() => { const m = window.__riverMultiplayer(); return m.snapshot?.players?.find(player => player.id === m.selfId)?.office?.layout ?? null; }) };
    await context.close();
  }
  load.push(loadavg().map(value => +value.toFixed(1)));

  const graphicsPage = await (await browser.newContext()).newPage();
  const gpu = await graphicsPage.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'), info = gl?.getExtension('WEBGL_debug_renderer_info'); return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null; });
  const receipt = {
    runner: 'node preview/e2e/office-ipic-perf.mjs', capturedAt: new Date().toISOString(),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), dirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=no']).toString().trim() || null,
    browser: await browser.version(), renderer: gpu, args: ARGS, viewport: [VIEWPORT.width, VIEWPORT.height], pixelRatio: 1, quality: 'sharp', fov: FOV,
    windows: WINDOWS, framesPerWindow: FRAMES, loadAverage: { start: load[0], end: load[1] },
    profile: 'One shared macOS workstation under other sessions\' load; vsync and the frame cap off, so intervals are render cost, not display rate. renderer.info is the whole frame (main.js resets it once per frame), so draw calls and triangles include shadow, AO and composer passes. Transfer bytes are from the Vite dev server (unbundled, uncompressed modules); asset bytes are representative. One page, no other residents beyond fixture staff.',
    limits: 'Provisional local evidence for #368, not accepted device budgets: no phone, Safari, iOS, Windows or Linux GPU; the venue\'s default film (the approved short since #365, 9-13 MB per format, so transfer exceeds the 0.9 MB fixture); graybox penthouse; no final art.',
    errors, spaces,
  };
  await writeFile(`${OUT}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  if (errors.length) throw new Error(errors.join('; '));
} finally { await browser?.close(); for (const fixture of fixtures) await fixture.close(); release(); }
