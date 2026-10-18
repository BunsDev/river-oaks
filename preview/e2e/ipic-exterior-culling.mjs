// IPIC auditorium exterior culling (#428): node preview/e2e/ipic-exterior-culling.mjs
// Dropping the district from a frame must never change it. On this machine's GPU (Metal ANGLE
// on macOS), alice enters IPIC; at each auditorium pose the frame is captured with culling on
// and off (the DEV render-audit switch), and the two must match pixel for pixel wherever the
// culling test fired, with fewer draw calls. Poses that can see the partition must not cull.
// Then alice walks to a front-row recliner and sits, and her own camera is checked the same way.
// Reduced motion keeps consecutive frames identical; the film is not started.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const OUT = 'output/playwright/ipic-exterior-culling', FOV = 67, SEAT = 'bench:ipic-recliner-1-1';
// [eye, target] in the IPIC room frame [a, h, d], h above the street floor.
const POSES = [
  { name: 'review-auditorium', eye: [-4.7, 7.65, 27.3], target: [.5, 8.2, 33.7], cull: true },
  { name: 'front-row-screen', eye: [-.6, 7.22, 31], target: [.3, 8.5, 33.79], cull: true },
  { name: 'back-centre-screen', eye: [0, 7.8, 27], target: [.3, 8.5, 33.79], cull: true },
  { name: 'front-row-left-wall', eye: [-2.6, 7.3, 31], target: [-6.2, 7.6, 32], cull: true },
  { name: 'front-row-right-wall', eye: [3.4, 7.3, 31], target: [6.7, 7.6, 32], cull: true },
  { name: 'ceiling', eye: [0, 7.6, 30], target: [.3, 10.4, 33] , cull: true },
  { name: 'back-to-doorway', eye: [-4.7, 7.65, 27.3], target: [-4.7, 7.5, 20], cull: false },
  { name: 'back-row-sideways', eye: [0, 7.6, 30], target: [-6, 7.6, 30], cull: false },
];
const release = await holdBrowserLock('IPIC auditorium exterior culling');
let fixture, browser;
await mkdir(OUT, { recursive: true });
try {
  fixture = await startBrowserFixture();
  // Vsync and the frame cap off, so the timing windows below show render cost, not the display rate.
  browser = await chromium.launch({ headless: true, args: [...(process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : []), '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await context.addCookies([{ name: 'fixture_session', value: 'alice', url: fixture.origin }]);
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${fixture.origin}/?motion-debug=1&render-audit=1`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 180000 });
  await page.evaluate(() => document.querySelector('[data-quality="sharp"]').click());
  const banner = page.locator('.hardware-acceleration-warning button');
  if (await banner.isVisible().catch(() => false)) await banner.click();
  const plan = await page.evaluate(async () => {
    const { storeRoomsFor } = await import('/src/store-rooms.js');
    const r = storeRoomsFor(await fetch('/data/district.json').then(x => x.json())).find(x => x.interior === 'ipic-photo-v1');
    return { facade: r.facade, right: r.right, inward: r.inward, floor: r.floor };
  });
  const world = (a, d) => [plan.facade[0] + plan.right[0] * a + plan.inward[0] * d, plan.facade[1] + plan.right[1] * a + plan.inward[1] * d];
  const three = ([a, h, d]) => { const [x, n] = world(a, d); return [x, plan.floor + h, -n]; };
  const { openHudSpace } = await import('./hud-navigation.js');
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside === 'osm-node-8172494964');
  await page.locator('#panel-toggle').click();
  // The first-visit welcome can open a moment after entry and close by itself; under load it
  // once covered the first pose's culled capture and was gone for the comparison. Dismiss it.
  if (await page.locator('.store-intro').waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) {
    await page.locator('.store-intro button').click();
    await page.locator('.store-intro').waitFor({ state: 'hidden' });
  }
  const hideUi = () => page.evaluate(() => { document.body.classList.add('clear-view'); if (!document.querySelector('#cull-hide')) { const style = document.createElement('style'); style.id = 'cull-hide'; style.textContent = '#ipic-screening,.nearby-greetings,.walking-console{visibility:hidden!important}'; document.head.append(style); } });
  await hideUi();

  const frames = n => page.evaluate(n => new Promise(done => { let i = 0; const step = () => (++i > n ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
  const shot = async () => (await page.screenshot()).toString('base64');
  const differ = await (await browser.newContext()).newPage();
  const diff = (a, b) => differ.evaluate(async ([a, b]) => {
    const load = src => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.src = `data:image/png;base64,${src}`; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const canvas = document.createElement('canvas'); canvas.width = ia.width; canvas.height = ia.height;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, canvas.width, canvas.height).data;
    g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let changed = 0, max = 0;
    for (let p = 0; p < da.length; p += 4) { const d = Math.max(Math.abs(da[p] - db[p]), Math.abs(da[p + 1] - db[p + 1]), Math.abs(da[p + 2] - db[p + 2])); if (d > max) max = d; if (d > 8) changed++; }
    return { changed, max };
  }, [a, b]);
  const stats = () => page.evaluate(() => ({ calls: window.__riverRenderAudit.graphics().render.calls, triangles: window.__riverRenderAudit.graphics().render.triangles, decision: window.__riverExteriorCull().ipic }));
  // One pose: decision and counts with culling on, then the same frame with culling off.
  async function compare(name) {
    await page.waitForTimeout(1200); await frames(10);
    const on = await stats(), a = await shot();
    await frames(6); const again = await shot();
    await page.evaluate(() => window.__riverRenderAudit.exteriorCulling(false)); await frames(10);
    const off = await stats(), b = await shot();
    await page.evaluate(() => window.__riverRenderAudit.exteriorCulling(true)); await frames(6);
    const noise = await diff(a, again), change = await diff(a, b);
    await writeFile(`${OUT}/${name}.png`, Buffer.from(a, 'base64'));
    return { name, decision: on.decision, on: { calls: on.calls, triangles: on.triangles }, off: { calls: off.calls, triangles: off.triangles }, noise, change };
  }

  const results = [];
  for (const pose of POSES) {
    await page.evaluate(([position, target, fov]) => window.__riverRenderAudit.view({ position, target, fov }), [three(pose.eye), three(pose.target), FOV]);
    results.push({ ...await compare(pose.name), expected: pose.cull });
  }
  await page.evaluate(() => window.__riverRenderAudit.release());

  // alice's own camera, seated in a front-row recliner (the walk of preview/e2e/ipic-visit.js).
  for (const [a, d] of [[-1.4, 4.8], [-1.4, 20.7], [-1.4, 24.5], [-4.85, 24.5], [-4.85, 29.65], [-1.6, 29.65]]) {
    const target = world(a, d), deadline = Date.now() + 120000;
    await page.locator('#canvas-host').focus();
    let distance = Infinity;
    while (Date.now() < deadline) {
      const p = await page.evaluate(() => window.__riverCarriage().pose);
      distance = Math.hypot(p.position[0] - target[0], -p.position[2] - target[1]);
      if (distance <= .16) break;
      await page.evaluate(([x, n]) => window.__riverSeatAndWater().face(x, n), target);
      await page.keyboard.down('KeyW'); await page.waitForTimeout(Math.min(120, Math.max(20, distance * 100))); await page.keyboard.up('KeyW');
    }
    if (distance > .16) throw new Error(`could not reach ${a}, ${d}`);
  }
  // The seat picker lives in the walking console, which the captures hide.
  await page.evaluate(() => { document.body.classList.remove('clear-view'); document.querySelector('#cull-hide')?.remove(); });
  await page.locator('#nearby-seat').selectOption(`${SEAT}:0`);
  await page.locator('#seat-sit').click();
  await page.waitForFunction(seat => window.__riverCarriage().pose.sitting?.buildId === seat, SEAT);
  await hideUi(); await page.waitForTimeout(2500);
  results.push({ ...await compare('seated-own-camera'), expected: true });

  // Interleaved timing at the seated view, culling on and off in turn (not a pass/fail check:
  // this machine is shared, so only the paired difference means anything).
  const timing = { on: [], off: [] };
  for (const enabled of [true, false, true, false, true, false]) {
    await page.evaluate(on => window.__riverRenderAudit.exteriorCulling(on), enabled); await frames(30);
    const sample = await page.evaluate(() => new Promise(resolve => {
      const audit = window.__riverRenderAudit; audit.start(); let ticks = 0;
      const tick = () => { if (++ticks > 180) { const { frames } = audit.stop(); const sorted = key => frames.map(f => f[key]).sort((a, b) => a - b);
        const at = (values, p) => +values[Math.min(values.length - 1, Math.floor(values.length * p))].toFixed(2);
        resolve({ intervalP50: at(sorted('intervalMs'), .5), intervalP95: at(sorted('intervalMs'), .95), cpuP50: at(sorted('cpuMs'), .5) }); } else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    timing[enabled ? 'on' : 'off'].push(sample);
  }
  await page.evaluate(() => window.__riverRenderAudit.exteriorCulling(true));
  const middle = values => [...values].sort((a, b) => a - b)[1];
  const seatedTiming = Object.fromEntries(Object.entries(timing).map(([key, windows]) => [key, { windows, intervalP50: middle(windows.map(w => w.intervalP50)), intervalP95: middle(windows.map(w => w.intervalP95)), cpuP50: middle(windows.map(w => w.cpuP50)) }]));

  const problems = [];
  for (const r of results) {
    if (r.decision !== r.expected) problems.push(`${r.name}: culling ${r.decision ? 'fired' : 'did not fire'}, expected ${r.expected ? 'to' : 'not to'}`);
    // The pixel comparison proves a culled frame; where nothing is culled (the doorway
    // shows the lounge and beyond), only the decision and the unchanged counts matter.
    if (r.decision && r.noise.changed > 0) problems.push(`${r.name}: consecutive frames differ (${r.noise.changed} px), so the comparison is not valid`);
    if (r.decision && r.change.changed > 0) problems.push(`${r.name}: culling changed ${r.change.changed} px (max channel ${r.change.max})`);
    if (r.decision && !(r.on.calls < r.off.calls)) problems.push(`${r.name}: culling saved no draw calls (${r.on.calls} vs ${r.off.calls})`);
    // Animation seen through the doorway moves the counts a little; culling removes about 60 %.
    if (!r.decision && Math.abs(r.on.calls - r.off.calls) > r.off.calls * .05) problems.push(`${r.name}: counts moved without culling (${r.on.calls} vs ${r.off.calls})`);
  }
  const receipt = { status: problems.length || errors.length ? 'failed' : 'passed', browser: await browser.version(), problems, errors, results, seatedTiming };
  await writeFile(`${OUT}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  for (const r of results) console.log(r.name.padEnd(22), 'cull', String(r.decision).padEnd(5), 'calls', r.off.calls, '->', r.on.calls, 'tri', r.off.triangles, '->', r.on.triangles, 'changed', r.change.changed, 'noise', r.noise.changed);
  console.log('seated timing (median of three windows), culling on vs off:', JSON.stringify({ on: seatedTiming.on.intervalP50, off: seatedTiming.off.intervalP50, onP95: seatedTiming.on.intervalP95, offP95: seatedTiming.off.intervalP95, cpuOn: seatedTiming.on.cpuP50, cpuOff: seatedTiming.off.cpuP50 }));
  console.log(JSON.stringify({ status: receipt.status, problems, errors }));
  if (receipt.status !== 'passed') process.exitCode = 1;
} finally { await browser?.close(); await fixture?.close(); release(); }
