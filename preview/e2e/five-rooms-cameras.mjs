// Five Rooms matched cameras (#842, #825 M1): the same cameras under classic and pink-jet-age at
// noon and night, so Val can compare the five shells, their entrances, insides, seated views and
// aerials, and the Ribbon route, side by side. The cameras come from the Spatial contract
// (config/ribbon/five-rooms.json, #838) via five-rooms-plan.mjs; the page draws the real integrated
// source, nothing is generated. Each night view is reviewed against the #825 pink rule: lit pink
// clusters are picked through the render audit, and any that is neither a usable thing nor one of
// the three landmarks is a finding with screen and site coordinates for the owning sub-issue.
//   node preview/e2e/five-rooms-cameras.mjs [--finishes=classic,pink-jet-age] [--hours=noon,night]
//     [--cameras=id,id] [--graphics=sharp|smooth] [--revision=<district revision>] [--out=dir]
//     [--pin=baseline|integrated]
// Writes <out>/<camera>-<hour>-<finish>.png, sheet-<venue>.jpg and sheet-route.jpg (rows: views,
// columns: noon/night x classic/pink), report.json (served head, graphics, per-view draw calls,
// triangles, frame p50/p95, luma verdict, pink review) and findings.json. --pin=baseline writes
// preview/e2e/five-rooms-budget.json from the arrival frame on this head (run it on main);
// --pin=integrated records the integrated head's frame against that pin. Default <out> is
// .runtime/five-rooms/<timestamp>/ so a capture is never overwritten. Changes nothing in the client.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { loadDistrictData } from '../../server/district-data.js';
import { groundSurfaceHeight } from '../src/world-surface.js';
import { launch, openDistrict, sample, setHour, startFixture } from './garden-campus-render-common.mjs';
import { BUDGET_HEADROOM, BUDGET_PATH, CLIENT_LATEST_HOUR, HOURS, VENUE_IDS, assertCompact, cameraOptions, classifyPinkHit, districtPath, drawCallBudget, fiveRoomsCameras, imageVerdict, spawnCamera, judgeBudget, pinkClusters, readContract, scenePose, validateBudgetPin, validateCameraReport, viewName } from './five-rooms-plan.mjs';

const options = cameraOptions(process.argv.slice(2));
// HEAD, the dirty flag, the contract and a relative --out belong to this checkout, whatever the shell's directory.
const root = fileURLToPath(new URL('../../', import.meta.url));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim() !== '';
const { contract, reason } = await readContract(pathToFileURL(`${root}/`));
// Main has no contract: only the spawn frame can be measured there, which is all a baseline pin needs.
if (!contract && options.pin !== 'baseline') throw new Error(`Spatial contract (#838) is not readable on ${head.slice(0, 8)}: ${reason}`);
const world = await loadDistrictData({ districtRevision: options.revision ?? undefined });
const ground = (east, north) => groundSurfaceHeight(world, east, -north);
const cameras = (contract ? fiveRoomsCameras(contract, { ground, world }) : [spawnCamera(world, ground)]).filter(item => !options.cameras || options.cameras.includes(item.id));
if (!cameras.length) throw new Error(`No camera matches ${options.cameras}`);
const hours = Object.fromEntries(options.hours.map(label => [label, HOURS[label]])), output = resolve(root, options.out);
const SAMPLE = 320, SAMPLE_H = 200, VIEWPORT = [1280, 800];
await mkdir(output, { recursive: true });

// Mean and spread of luma over a downsample; at night the downsampled RGBA too, for the pink review.
async function measure(meter, png, { pixels = false } = {}) {
  return meter.evaluate(async ({ data, w, h, pixels }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(w, h), context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0, w, h);
    const rgba = context.getImageData(0, 0, w, h).data, luma = [];
    for (let i = 0; i < rgba.length; i += 4) luma.push(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]);
    const mean = luma.reduce((a, b) => a + b, 0) / luma.length, spread = Math.sqrt(luma.reduce((a, b) => a + (b - mean) ** 2, 0) / luma.length);
    return { mean: Math.round(mean * 10) / 10, spread: Math.round(spread * 10) / 10, rgba: pixels ? Array.from(rgba) : null };
  }, { data: png.toString('base64'), w: SAMPLE, h: SAMPLE_H, pixels });
}

// The pink rule at one night view: clusters of lit pink, each picked through the audit camera.
async function reviewPink(page, rgba, view) {
  const clusters = pinkClusters(Uint8ClampedArray.from(rgba), SAMPLE, SAMPLE_H).slice(0, 16), scale = [VIEWPORT[0] / SAMPLE, VIEWPORT[1] / SAMPLE_H], reviewed = [];
  for (const cluster of clusters) {
    const screen = [Math.round(cluster.centroid[0] * scale[0]), Math.round(cluster.centroid[1] * scale[1])];
    const hit = await page.evaluate(([x, y]) => window.__riverRenderAudit.pick(x, y, 1)[0] ?? null, screen);
    const verdict = classifyPinkHit(hit);
    reviewed.push({ pixels: cluster.pixels, sampleBox: cluster.bbox, screen, ...verdict, object: hit?.object ?? null, path: hit?.path ?? null, material: hit?.material ?? null, at: hit?.at ?? null });
  }
  return { clusters: reviewed, violations: reviewed.filter(item => item.verdict === 'violation').length, unresolved: reviewed.filter(item => item.verdict === 'unresolved').length, view };
}

const release = await holdBrowserLock('Five Rooms matched cameras');
const views = [], findings = [];
let browser, fixture, session;
try {
  browser = await launch();
  const meter = await browser.newPage();
  fixture = await startFixture('five-rooms', { districtRevision: options.revision });
  for (const finish of options.finishes) {
    session = await openDistrict(browser, fixture, 'five-rooms', { viewport: { width: VIEWPORT[0], height: VIEWPORT[1] }, districtRevision: options.revision, graphics: options.graphics, hideInterface: true, exposeCampus: false, path: districtPath(finish) });
    const { page, errors } = session;
    // The page must have drawn the requested finish, or the capture is mislabelled.
    const drawn = await page.evaluate(() => window.__riverSpatialStream().finish);
    if (drawn.preference !== finish) throw new Error(`asked for ${finish}, the page drew ${drawn.preference}`);
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    for (const [label, hour] of Object.entries(hours)) {
      await setHour(page, hour);
      const applied = Number(await page.locator('#sun-hour').inputValue());
      for (const item of cameras) {
        const pose = scenePose(item), name = viewName(item, label, finish), png = `${output}/${name}.png`;
        await page.evaluate(pose => window.__riverRenderAudit.view(pose), pose);
        const metrics = await sample(page, 30, 20);
        const shot = await page.screenshot({ path: png });
        const { rgba, ...image } = await measure(meter, shot, { pixels: label === 'night' });
        const pink = label === 'night' ? await reviewPink(page, rgba, name) : null;
        if (pink) for (const cluster of pink.clusters) if (cluster.verdict !== 'usable' && cluster.verdict !== 'landmark') findings.push({ view: name, camera: item.id, venue: item.venue ?? null, finish, hour, verdict: cluster.verdict, reason: cluster.reason, screenPx: cluster.screen, site: cluster.at, object: cluster.object, path: cluster.path, material: cluster.material, pixels: cluster.pixels, png: `${name}.png` });
        views.push({ name, camera: item.id, group: item.group, venue: item.venue ?? null, stop: item.stop, label, hour, appliedHour: applied, finish, pose, png: `${name}.png`,
          image: { ...image, verdict: imageVerdict(image) }, calls: metrics.calls, triangles: metrics.triangles, frameP50: metrics.frameP50, frameP95: metrics.frameP95, cpuP50: metrics.cpuP50, finishDrawn: { ribbon: drawn.ribbon?.id ?? null, fiveRooms: drawn.fiveRooms ? Object.keys(drawn.fiveRooms).length : null },
          pink: pink && { clusters: pink.clusters, violations: pink.violations, unresolved: pink.unresolved }, hostLoad: loadavg().map(n => Number(n.toFixed(1))) });
        console.log(JSON.stringify({ name, calls: metrics.calls, triangles: metrics.triangles, frameP50: metrics.frameP50, image: views.at(-1).image, pink: pink && { clusters: pink.clusters.length, violations: pink.violations } }));
      }
    }
    await page.evaluate(() => window.__riverRenderAudit.release());
    if (errors.length) throw new Error(`${finish} page errors: ${errors.join(' | ')}`);
    await session.context.close(); session = null;
  }
  // Contact sheets: one per venue and one for the route; a row per view, a column per hour x finish.
  const columns = Object.keys(hours).flatMap(label => options.finishes.map(finish => [label, finish]));
  const sheet = await browser.newPage({ viewport: { width: 400 * columns.length, height: 400 } });
  const groups = [...VENUE_IDS.map(venue => [venue.replace('venue:', ''), cameras.filter(item => item.venue === venue)]), ['route', cameras.filter(item => item.group === 'route')]];
  for (const [groupName, rows] of groups) {
    if (!rows.length) continue;
    const cells = [];
    for (const item of rows) for (const [label, finish] of columns) {
      const data = (await readFile(`${output}/${viewName(item, label, finish)}.png`)).toString('base64');
      cells.push(`<figure><img src="data:image/png;base64,${data}"><figcaption>${item.id} · ${label} ${hours[label]}h · ${finish}</figcaption></figure>`);
    }
    await sheet.setContent(`<style>body{margin:0;background:#111;font:11px system-ui;color:#ddd;display:grid;grid-template-columns:repeat(${columns.length},1fr);gap:4px;padding:4px}figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 4px}</style>${cells.join('')}`);
    await sheet.screenshot({ path: `${output}/sheet-${groupName}.jpg`, type: 'jpeg', quality: 75, fullPage: true });
  }
  // The arrival frame at noon under each finish is the budget frame (five-rooms.js measures the same pose).
  const budgetView = finish => views.find(view => view.camera === 'r01-arrival' && view.label === 'noon' && view.finish === finish);
  const budget = { camera: 'r01-arrival', hour: 'noon', graphics: options.graphics, viewport: VIEWPORT, classicCalls: budgetView('classic')?.calls ?? null, pinkCalls: budgetView('pink-jet-age')?.calls ?? null };
  budget.delta = budget.classicCalls !== null && budget.pinkCalls !== null ? budget.pinkCalls - budget.classicCalls : null;
  let pin = null;
  if (options.pin) {
    if (budget.delta === null) throw new Error('--pin needs the arrival camera at noon under both finishes');
    const existing = await readFile(resolve(root, BUDGET_PATH), 'utf8').then(JSON.parse).catch(() => null);
    const measured = { measuredAt: new Date().toISOString(), head, dirty, revision: options.revision, classicCalls: budget.classicCalls, pinkCalls: budget.pinkCalls };
    if (options.pin === 'baseline') pin = { note: 'Measured on main by preview/e2e/five-rooms-cameras.mjs --pin=baseline; the budget is the headroom over the classic spawn frame (#842). Re-pin only from a fresh measurement.', ...measured, camera: budget.camera, hour: budget.hour, graphics: options.graphics, viewport: VIEWPORT, headroom: BUDGET_HEADROOM, baseline: { classicCalls: budget.classicCalls, pinkCalls: budget.pinkCalls }, budgetCalls: drawCallBudget(budget.classicCalls), integrated: existing?.integrated ?? null };
    else { if (!existing) throw new Error(`--pin=integrated needs a baseline pin at ${BUDGET_PATH} first`); pin = { ...validateBudgetPin(existing), integrated: { ...measured, judged: judgeBudget(existing, budget.pinkCalls) } }; }
    validateBudgetPin(pin);
    await writeFile(resolve(root, BUDGET_PATH), `${JSON.stringify(pin, null, 2)}\n`);
    console.log(`budget pin (${options.pin}): ${BUDGET_PATH}`);
  }
  const report = assertCompact({ status: 'passed', head, dirty, revision: options.revision, contractVersion: contract?.version ?? 'none (baseline on a head without the contract)', graphics: options.graphics, finishes: options.finishes, hours, viewport: VIEWPORT, deviceScaleFactor: 1,
    nightNote: `The client's #sun-hour stops at ${CLIENT_LATEST_HOUR}:00 (twilight 1); there is no later night, so night is pinned there.`,
    cameras, views, budget, pin, findings: { count: findings.length, violations: findings.filter(item => item.verdict === 'violation').length, unresolved: findings.filter(item => item.verdict === 'unresolved').length, file: 'findings.json' },
    hostLoad: loadavg().map(n => Number(n.toFixed(1))), finishedAt: new Date().toISOString(),
    limits: 'Local loopback fixture, interface hidden, 1280x800 at DPR 1; residents move between views; frame times are this host under its recorded load (vsync on), not a device budget. The pink review is an agent heuristic (lit pink hue, picked object name against the #825 rule), not a human visual review.' });
  validateCameraReport(report);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await writeFile(`${output}/findings.json`, JSON.stringify(assertCompact({ head, contractVersion: contract?.version ?? null, rule: 'At night, pink light only on usable things (seats, doors that open, display frames, lift controls) and three landmarks (IPIC marquee, clock face, Overlook lantern). By day pink is a material. Pink is never the only signal.', findings }), null, 2));
  console.log(`report: ${output}/report.json (${views.length} views, ${findings.length} pink findings)`);
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ status: 'failed', head, error: error.stack, views: views.length, findings }, null, 2)).catch(() => {}); throw error;
} finally { await session?.context.close(); await fixture?.close(); await browser?.close(); release(); }
