// #417 Garden Office performance profile in World Studio, following office-ipic-perf.mjs:
// vsync and the frame-rate limit are off, so frame intervals measure render cost.
//   node preview/e2e/studio-pilot-perf.mjs   (writes .runtime/acceptance/perf/receipt.json)
// STUDIO_TEMPLATE=house (or boutique, cafe) profiles another stock template (#418).
// Measures cold page load, cold and warm template opens, transfer bytes, then three
// windows of 180 frames for the overhead whole-scene view and each player-height station.
// On macOS it also reads the GPU process's physical footprint at each phase (see gpuFootprint).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { createSpace, spaceAssessmentContext, spaceRouteProfile, spaceTemplates } from '../src/studio/space-templates.js';

const OUT = process.env.STUDIO_PERF_OUT ?? '.runtime/acceptance/perf';
const VIEWPORT = { width: 1440, height: 1000 }, FRAMES = 180, WINDOWS = 3;
// Stations as in studio-template-stations.js (for the office, the studio-office-stations
// views): the entry, each profile target facing its role object, and the exit.
const TEMPLATE = process.env.STUDIO_TEMPLATE ?? 'office', NAME = spaceTemplates.find(t => t.id === TEMPLATE).name;
const OTHER = spaceTemplates.find(t => t.id === (TEMPLATE === 'office' ? 'house' : 'office')).name;
const STATIONS = (() => {
  const stock = createSpace(TEMPLATE), profile = spaceRouteProfile(spaceAssessmentContext(TEMPLATE)), first = profile.targets[0];
  const role = id => { const item = stock.objects.find(o => o.id === id);return [item.east, item.north]; };
  return [{ id: 'CAM-01-entry', at: profile.exit, look: first.position },
    ...profile.targets.map((t, i) => ({ id: `CAM-${String(i + 2).padStart(2, '0')}-${t.label.replace(/\s+/g, '-')}`, at: t.position, look: role(t.objectId) })),
    { id: `CAM-${String(profile.targets.length + 2).padStart(2, '0')}-exit`, at: first.position, look: profile.exit }];
})();
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(2) : null; };
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();

const release = await holdBrowserLock(`Studio ${NAME} performance profile`);
let browser, fixture;
const errors = [], receipt = { createdAt: new Date().toISOString(), template: TEMPLATE, source: git(['rev-parse', 'HEAD']), dirty: git(['status', '--short']).split('\n').filter(Boolean),
  load: { start: loadavg().map(value => +value.toFixed(2)) }, method: 'Chromium headless, --use-angle=metal --disable-gpu-vsync --disable-frame-rate-limit, 1440×1000 at DPR 1; rAF intervals, three windows of 180 frames per view' };
try {
  await mkdir(OUT, { recursive: true });
  fixture = await startBrowserFixture();
  browser = await chromium.launch({ args: ['--use-angle=metal', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  receipt.browser = browser.version();
  // Apple silicon has unified memory: Metal allocations show in the GPU process's footprint,
  // mostly as IOAccelerator (textures, buffers, render targets). The totals include ANGLE and
  // driver staging and the canvas's own buffers, so compare phases rather than read one alone.
  const browserCdp = await browser.newBrowserCDPSession();
  const gpuFootprint = async label => {
    if (process.platform !== 'darwin') return null;
    const gpu = (await browserCdp.send('SystemInfo.getProcessInfo')).processInfo.find(info => info.type === 'GPU');
    if (!gpu) return null;
    const file = `${OUT}/gpu-footprint-${label}.json`;
    execFileSync('footprint', ['-p', String(gpu.id), '--json', file, '-f', 'bytes'], { stdio: 'ignore' });
    const [entry] = JSON.parse(await readFile(file, 'utf8')).processes, mib = bytes => +(bytes / 1048576).toFixed(1);
    const category = name => { const value = entry.categories?.[name];return value ? mib(value.dirty + value.swapped) : 0; };
    return { pid: gpu.id, footprintMiB: mib(entry.footprint), ioAcceleratorMiB: category('IOAccelerator (graphics)'),
      unmappedGraphicsMiB: category('Owned physical footprint (unmapped) (graphics)') };
  };
  receipt.gpuFootprint = {};
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(() => performance.setResourceTimingBufferSize(100000));
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
  const page = await context.newPage();page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));page.on('dialog', dialog => dialog.accept());
  const transfer = () => page.evaluate(() => {
    const entries = performance.getEntriesByType('resource'), sum = key => entries.reduce((total, entry) => total + (entry[key] || 0), 0);
    return { requests: entries.length, transferBytes: sum('transferSize'), decodedBytes: sum('decodedBodySize') };
  });
  const stats = () => page.evaluate(() => JSON.parse(document.querySelector('#studio-viewport').dataset.renderStats ?? 'null'));
  const settle = () => page.waitForFunction(() => document.body.dataset.studioBusy !== 'true');
  const property = async (name, value) => { const input = page.getByLabel(name, { exact: true });await input.fill(String(value));await input.press('Tab');await settle(); };
  // Studio refuses an arrival inside furniture; the corner between two stations can be inside it.
  const placeArrival = async ([east, north]) => {
    for (const order of [['East (m)', 'North (m)'], ['North (m)', 'East (m)']]) {
      await page.locator('[data-item="@arrival"]').click();
      for (const name of order) await property(name, name.startsWith('East') ? east : north);
      const placed = await Promise.all(['East (m)', 'North (m)'].map(name => page.getByLabel(name, { exact: true }).inputValue()));
      if (+placed[0] === east && +placed[1] === north) return;
    }
    throw Error(`Arrival could not be placed at ${east} E / ${north} N`);
  };
  const open = async name => {
    const started = Date.now();
    await page.locator('#studio-templates').click();
    await page.getByRole('button', { name: `Use ${name}`, exact: true }).click();
    await page.getByRole('status').filter({ hasText: `${name} opened` }).waitFor();
    const opened = Date.now();
    await page.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
    return { openedMs: opened - started, routesPassedMs: Date.now() - started };
  };
  const measure = async () => {
    await page.waitForTimeout(1500);
    const all = [], windows = [];
    for (let index = 0; index < WINDOWS; index++) {
      const deltas = await page.evaluate(frames => new Promise(resolve => {
        const list = [];let last;
        const tick = now => { if (last !== undefined) list.push(now - last);last = now;list.length >= frames ? resolve(list) : requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }), FRAMES);
      all.push(...deltas);windows.push({ p50: percentile(deltas, .5), p95: percentile(deltas, .95) });
    }
    const heap = await page.evaluate(() => performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null);
    return { p50: percentile(all, .5), p95: percentile(all, .95), p99: percentile(all, .99), windows, render: await stats(), heapMiB: heap };
  };

  const coldStart = Date.now();
  await page.goto(`${fixture.origin}/studio.html`);
  await page.waitForSelector('body[data-studio-ready="true"]');
  receipt.coldStudioReadyMs = Date.now() - coldStart;
  receipt.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'), info = gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(info.UNMASKED_RENDERER_WEBGL); });
  receipt.transferAtReady = await transfer();
  await page.waitForTimeout(1500);receipt.gpuFootprint.ready = await gpuFootprint('ready');
  receipt.coldOpen = await open(NAME);
  receipt.transferAfterOffice = await transfer();
  await page.waitForTimeout(1500);receipt.gpuFootprint.coldOpen = { ...await gpuFootprint('cold-open'), render: await stats() };
  await open(OTHER);
  await page.waitForTimeout(1500);receipt.gpuFootprint.other = { ...await gpuFootprint('other'), render: await stats() };
  receipt.warmOpen = await open(NAME);
  await page.waitForTimeout(1500);receipt.gpuFootprint.warmOpen = { ...await gpuFootprint('warm-open'), render: await stats() };
  receipt.views = {};
  await page.getByRole('button', { name: 'Frame region', exact: true }).click();
  receipt.views['whole-scene-overhead'] = await measure();
  for (const station of STATIONS) {
    await placeArrival(station.at);
    await page.getByRole('button', { name: 'Walk through', exact: true }).click();
    await page.waitForSelector('body[data-mode="walk"]');
    const readout = `${station.at[0].toFixed(1)} E / ${station.at[1].toFixed(1)} N`;
    await page.waitForFunction(text => document.querySelector('#studio-position').textContent.includes(text), readout);
    const yaw = Math.atan2(-(station.look[0] - station.at[0]), station.look[1] - station.at[1]);
    const box = await page.locator('#studio-viewport canvas').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);await page.mouse.down();await page.mouse.move(x + Math.round(-yaw / .004), y, { steps: 8 });await page.mouse.up();
    receipt.views[station.id] = await measure();
    await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
    await page.waitForSelector('body[data-mode="edit"]');
  }
  receipt.gpuFootprint.end = { ...await gpuFootprint('end'), render: await stats() };
  receipt.load.end = loadavg().map(value => +value.toFixed(2));
  receipt.errors = errors;
  await writeFile(`${OUT}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ cold: receipt.coldStudioReadyMs, coldOpen: receipt.coldOpen, warmOpen: receipt.warmOpen, load: receipt.load,
    gpuFootprint: Object.fromEntries(Object.entries(receipt.gpuFootprint).map(([key, value]) => [key, value && [value.footprintMiB, value.ioAcceleratorMiB, value.unmappedGraphicsMiB]])),
    views: Object.fromEntries(Object.entries(receipt.views).map(([key, view]) => [key, [view.p50, view.p95, view.p99, view.render?.calls, view.render?.triangles]])) }, null, 1));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser?.close();await fixture?.close();release();
}
