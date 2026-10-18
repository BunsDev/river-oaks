// Shared setup for the Gardens finish runners (#511): one loopback town per district
// revision (the garage default, or the campus through RIVER_OAKS_DISTRICT_REVISION), an
// authenticated owner page with the render audit, named campus cameras and GL counters.
// The page's own code is unchanged except one test exposure: the campus root is published
// as globalThis.__gardenCampusRoot so a runner can read the glow the time of day set.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusToScene } from '../../shared/garden-campus-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';

// The contract's five cameras (#506) and the finish pass's additional named views, all in
// campus metres [u, v, z]. Same cameras for both revisions.
export const FINISH_CAMERAS = [
  ...CAMPUS.cameras,
  { id: '11-east-long-side', name: 'East long side, high oblique across the promenade', position: [95, 62, 42], target: [15, 100, 13], fov: 50 },
  { id: '12-west-long-side', name: 'West long side over the IPIC roof, green walls and roof beds', position: [-48, 112, 34], target: [14, 104, 15], fov: 52 },
  { id: '13-south-office-approach', name: 'Street level from the south lane (E1), north along P1', position: [31.5, -12, 1.7], target: [19, 58, 9], fov: 62 },
  { id: '14-street-under-b23', name: 'Ground under the Commons-Atelier skywalk on P5', position: [27, 121.5, 1.7], target: [12, 124.5, 11], fov: 72 },
  { id: '15-floor4-t2-gallery', name: 'Floor 4 public gallery in The Commons, south to the B12 landing', position: [16, 113, 13 + 1.68], target: [16, 93, 13 + 1.5], fov: 70 },
  { id: '16-t1-roof-garden', name: 'T1 roof garden from its north end, along the bed back to the office', position: [11.5, 68.6, 25 + 1.68], target: [6.8, 53, 25.6], fov: 66 },
  { id: '17-t2-terrace-4', name: 'T2 Floor 4 terrace, west along its planted guard to B12', position: [24, 91.2, 13 + 1.68], target: [8, 92, 13.6], fov: 70 },
];
export const HOURS = { day: 15, dusk: 18.5 };
export const pose = view => ({ position: campusToScene(view.position), target: campusToScene(view.target), fov: view.fov });

// Live programs (created minus deleted), program links and buffer uploads, counted at the GL
// boundary so the product code needs no hook. Installed before any page script.
export const glCounters = () => {
  const counters = { programs: 0, links: 0, uploads: 0, uploadBytes: 0 };
  const size = (data, srcOffset = 0, length = 0) => !data ? 0 : typeof data === 'number' ? data
    : length ? length * (data.BYTES_PER_ELEMENT ?? 1) : data.byteLength - srcOffset * (data.BYTES_PER_ELEMENT ?? 1);
  for (const context of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext].filter(Boolean)) {
    const proto = context.prototype, wrap = (method, count) => { const original = proto[method]; proto[method] = function (...a) { count(...a); return original.apply(this, a); }; };
    wrap('createProgram', () => { counters.programs++; });
    wrap('deleteProgram', program => { if (program) counters.programs--; });
    wrap('linkProgram', () => { counters.links++; });
    wrap('bufferData', (target, data) => { if (typeof data !== 'number') { counters.uploads++; counters.uploadBytes += size(data); } });
    wrap('bufferSubData', (target, offset, data, srcOffset, length) => { counters.uploads++; counters.uploadBytes += size(data, srcOffset, length); });
  }
  globalThis.__glCost = counters;
};

// The fixture can miss its 30 s startup window under heavy host load; retry it. `root` serves
// another checkout (a baseline copy with its own node_modules) through its own fixture.
export async function startFixture(revision, { attempts = 3, root = null } = {}) {
  const env = { VITE_SHARED_SOFTWARE_RENDERING: '0', ...(revision === 'gardens' ? { RIVER_OAKS_DISTRICT_REVISION: DISTRICT_REVISION_GARDENS } : {}) };
  const { startBrowserFixture } = await import(root ? pathToFileURL(`${root}/preview/e2e/fixture-server.js`).href : './fixture-server.js');
  for (let attempt = 1; ; attempt++) {
    try { return await startBrowserFixture({ env }); } catch (error) {
      if (attempt >= attempts || !/timed out/.test(error.message)) throw error;
      console.warn(`fixture start attempt ${attempt} timed out; retrying`);
    }
  }
}

export async function launch({ vsync = true } = {}) {
  const args = process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : [];
  if (!vsync) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  return chromium.launch({ headless: true, args });
}

// One authenticated page on the district, ready for audit views. Returns { context, page,
// errors, manifest, firstEntry }.
export async function openDistrict(browser, fixture, revision, { viewport = { width: 1280, height: 800 }, graphics = 'smooth', hideInterface = false, exposeCampus = true } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
  await context.addInitScript(value => localStorage.setItem('river-oaks-graphics', value), graphics);
  await context.addInitScript(glCounters);
  const page = await context.newPage();page.setDefaultTimeout(240000);
  const errors = [];page.on('pageerror', error => errors.push(error.message));
  // Test exposure of the campus root (garden-campus.js), checked against the real module text.
  if (exposeCampus) await page.route('**/src/garden-campus.js*', async route => {
    const response = await route.fetch(), body = await response.text(), marker = '\n  return root;\n}';
    assert.ok(body.includes(marker), 'test exposure matches the actual campus module');
    await route.fulfill({ response, body: body.replace(marker, '\n  globalThis.__gardenCampusRoot = root;\n  return root;\n}') });
  });
  let manifest = null;
  page.on('response', async response => { if (response.url().includes('/api/world-data?world=river-oaks')) manifest = await response.json().catch(() => null); });
  const started = Date.now();
  await page.goto(`${fixture.origin}/?render-audit=1`, { waitUntil: 'commit' });
  for (let attempt = 0; ; attempt++) {
    const state = await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('error') ? 'error'
      : document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverRenderAudit && 'ready', null, { timeout: 300000 }).then(handle => handle.jsonValue());
    if (state === 'ready') break;
    if (attempt > 0) throw new Error(`${revision}: the district failed to load twice`);
    await page.locator('#reload').evaluate(button => button.click());
  }
  const firstEntry = { readyMs: Date.now() - started, ...(await page.evaluate(() => ({ gl: { ...window.__glCost }, memory: window.__riverRenderAudit.graphics().memory }))) };
  assert.equal(manifest?.districtRevision ?? null, revision === 'gardens' ? DISTRICT_REVISION_GARDENS : null, `${revision}: the town served the expected revision`);
  if (exposeCampus) assert.equal(await page.evaluate(() => Boolean(globalThis.__gardenCampusRoot)), revision === 'gardens', `${revision}: campus root present only on the campus revision`);
  if (hideInterface) await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #canvas-host, #canvas-host * { visibility: visible !important; }' });
  return { context, page, errors, manifest, firstEntry };
}

export async function setHour(page, hour) {
  await page.evaluate(value => { const slider = document.querySelector('#sun-hour');slider.value = String(value);slider.dispatchEvent(new Event('input', { bubbles: true })); }, hour);
}

// The campus glow the page applied, if the campus is drawn.
export const campusGlow = page => page.evaluate(() => globalThis.__gardenCampusRoot?.children.find(item => item.name === 'campus:luminaire')?.material.emissiveIntensity ?? null);

export const quantile = (values, q) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null; };
export const round1 = value => value === null || value === undefined ? null : Math.round(value * 10) / 10;

// Frames at a fixed pose: interval p50/p95, CPU p50, and the median draw calls and triangles.
export async function sample(page, frames = 60, settle = 20) {
  const result = await page.evaluate(async ({ frames, settle }) => {
    for (let i = 0; i < settle; i++) await new Promise(requestAnimationFrame);
    const audit = window.__riverRenderAudit, renders = [];audit.start();
    for (let i = 0; i < frames; i++) { await new Promise(requestAnimationFrame);renders.push(audit.graphics().render); }
    const stopped = audit.stop(), graphics = audit.graphics();
    return { frames: stopped.frames, overflow: stopped.overflow, renders, renderer: graphics.renderer, memory: graphics.memory, quality: graphics.quality, gl: { ...window.__glCost } };
  }, { frames, settle });
  const intervals = result.frames.map(frame => frame.intervalMs), cpu = result.frames.map(frame => frame.cpuMs);
  return { renderer: result.renderer, samples: intervals.length, overflow: result.overflow,
    frameP50: round1(quantile(intervals, 0.5)), frameP95: round1(quantile(intervals, 0.95)), cpuP50: round1(quantile(cpu, 0.5)),
    calls: quantile(result.renders.map(item => item.calls), 0.5), triangles: quantile(result.renders.map(item => item.triangles), 0.5),
    memory: result.memory, programs: result.gl.programs, links: result.gl.links, scale: result.quality?.scale ?? null };
}
