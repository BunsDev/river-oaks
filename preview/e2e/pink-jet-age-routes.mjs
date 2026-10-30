// Pink Jet-Age R9 (#747, #738): a matched visual baseline of three routes, so each later
// pink-finish PR can be compared at the same cameras. One loopback town serving the Commons
// revision (it composes the Gardens campus too), one authenticated page with the interface
// hidden, a pinned graphics preset and the cameras and hours in pink-jet-age-routes-plan.mjs.
//   node preview/e2e/pink-jet-age-routes.mjs [--graphics=sharp|smooth] [--hours=day,dusk,night]
//     [--cameras=id,id] [--finish=classic|pink-jet-age] [--out=dir]
// Writes <out>/<camera>-<hour>.png, sheet-<route>.jpg per route (cameras by hour)
// and report.json: served revision, HEAD, graphics, finish, the glow the hour set, per-view
// draw calls, triangles, frame interval p50/p95, CPU p50 and a luma check that rejects a black
// or inside-a-wall frame. Default <out> is .runtime/pink-jet-age-r9/<timestamp>/ so a capture
// is never overwritten. Residents keep moving between views; frame times are this host under
// its recorded load, not a device budget. Changes nothing in the client.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { loadDistrictData } from '../../server/district-data.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { campusGlow, launch, openDistrict, sample, setHour, startFixture } from './garden-campus-render-common.mjs';
import { CLIENT_LATEST_HOUR, ROUTE_HOURS, ROUTE_PREFIX, commonsCameras, districtCameras, districtPath, gardensCameras, imageVerdict, routeOptions, scenePose, validateCameras, validateReport, viewName } from './pink-jet-age-routes-plan.mjs';

const options = routeOptions(process.argv.slice(2));
const revision = COMMONS_REVISION, world = await loadDistrictData({ districtRevision: revision });
const cameras = validateCameras([...gardensCameras(), ...commonsCameras(world.eastGardenCommons), ...districtCameras(world)]).filter(camera => !options.cameras || options.cameras.includes(camera.id));
if (!cameras.length) throw new Error(`No camera matches ${options.cameras}`);
// HEAD, the dirty flag and a relative --out belong to this checkout, whatever the shell's directory.
const root = fileURLToPath(new URL('../../', import.meta.url));
const hours = Object.fromEntries(options.hours.map(label => [label, ROUTE_HOURS[label]])), output = resolve(root, options.out);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim() !== '';
await mkdir(output, { recursive: true });

// Mean and spread (standard deviation) of luma over a 160 x 100 downsample of the capture.
async function measure(meter, png) {
  return meter.evaluate(async data => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(160, 100), context = canvas.getContext('2d');context.drawImage(bitmap, 0, 0, 160, 100);
    const pixels = context.getImageData(0, 0, 160, 100).data, luma = [];
    for (let i = 0; i < pixels.length; i += 4) luma.push(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]);
    const mean = luma.reduce((a, b) => a + b, 0) / luma.length, spread = Math.sqrt(luma.reduce((a, b) => a + (b - mean) ** 2, 0) / luma.length);
    return { mean: Math.round(mean * 10) / 10, spread: Math.round(spread * 10) / 10 };
  }, png.toString('base64'));
}

const release = await holdBrowserLock('Pink Jet-Age R9 route baseline');
const views = [];
let browser, fixture, session;
try {
  browser = await launch();
  const meter = await browser.newPage();
  fixture = await startFixture('commons', { districtRevision: revision });
  session = await openDistrict(browser, fixture, 'commons', { districtRevision: revision, graphics: options.graphics, hideInterface: true, path: districtPath(options.finish) });
  const { page, errors, firstEntry } = session;
  // The page must have drawn the requested finish, or the capture is mislabelled.
  const appliedFinish = await page.evaluate(() => globalThis.__gardenCampusRoot?.userData.kitFinish ?? null);
  if (appliedFinish !== options.finish) throw new Error(`asked for ${options.finish}, the campus drew ${appliedFinish}`);
  // The District facades (#740) report their finish through the development spatial probe.
  const districtFinish = await page.evaluate(() => globalThis.__riverSpatialStream?.().finish?.district ?? null);
  if (districtFinish !== options.finish) throw new Error(`asked for ${options.finish}, the District drew ${districtFinish}`);
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  for (const [label, hour] of Object.entries(hours)) {
    await setHour(page, hour);
    const applied = Number(await page.locator('#sun-hour').inputValue()), glow = await campusGlow(page);
    for (const camera of cameras) {
      const pose = scenePose(camera), name = viewName(camera, label), png = `${output}/${name}.png`;
      await page.evaluate(pose => window.__riverRenderAudit.view(pose), pose);
      const metrics = await sample(page, 30, 20);
      const shot = await page.screenshot({ path: png });
      const image = await measure(meter, shot);
      views.push({ name, route: camera.route, camera: camera.id, stop: camera.stop, label, hour, appliedHour: applied, glow, pose, png: `${name}.png`,
        image: { ...image, verdict: imageVerdict(image) }, ...metrics, hostLoad: loadavg().map(n => Number(n.toFixed(1))) });
      console.log(JSON.stringify({ name, calls: metrics.calls, triangles: metrics.triangles, frameP50: metrics.frameP50, image: views.at(-1).image }));
    }
  }
  await page.evaluate(() => window.__riverRenderAudit.release());
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  // Contact sheets: one per route, a row per camera and a column per hour.
  const labels = Object.keys(hours), sheet = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  for (const route of Object.keys(ROUTE_PREFIX)) {
    const rows = cameras.filter(camera => camera.route === route);
    if (!rows.length) continue;
    const cells = [];
    for (const camera of rows) for (const label of labels) {
      const data = (await readFile(`${output}/${viewName(camera, label)}.png`)).toString('base64');
      cells.push(`<figure><img src="data:image/png;base64,${data}"><figcaption>${camera.id} · ${label} ${hours[label]}h · ${camera.subject}</figcaption></figure>`);
    }
    await sheet.setContent(`<style>body{margin:0;background:#111;font:11px system-ui;color:#ddd;display:grid;grid-template-columns:repeat(${labels.length},1fr);gap:4px;padding:4px}figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 4px}</style>${cells.join('')}`);
    await sheet.screenshot({ path: `${output}/sheet-${route}.jpg`, type: 'jpeg', quality: 75, fullPage: true });
  }
  const report = { status: 'passed', head, dirty, revision, graphics: options.graphics, finish: options.finish, campusFinish: appliedFinish, districtFinish, hours, viewport: [1280, 800], deviceScaleFactor: 1,
    nightNote: `The client's #sun-hour stops at ${CLIENT_LATEST_HOUR}:00 (twilight 1); there is no later night, so night is pinned there.`,
    firstEntry, cameras, views, finishedAt: new Date().toISOString(),
    limits: 'Local loopback fixture, interface hidden, 1280x800 at DPR 1; residents move between views; frame times are this host under its recorded load (vsync on), not a device budget. Not a human visual review.' };
  validateReport(report);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`report: ${output}/report.json (${views.length} views)`);
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ status: 'failed', head, error: error.stack, views }, null, 2)).catch(() => {});throw error;
} finally { await session?.context.close();await fixture?.close();await browser?.close();release(); }
