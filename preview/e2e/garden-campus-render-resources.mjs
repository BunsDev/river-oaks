// The Gardens finish pass (#511): resource and frame cost of the campus against the garage, as an
// interleaved A/B on this machine.
//   node preview/e2e/garden-campus-render-resources.mjs [<label>=<revision>[@<checkout>] ...] [--rounds 2] [--rebuilds 3] [--frames 180]
// Default arms: garage=garage and gardens=gardens on this checkout. A baseline arm can serve
// another checkout (a `git archive` copy of origin/main with its own node_modules), e.g.
// main=garage@/path/to/copy. Every round opens a fresh page (fresh WebGL context and shader
// cache) per arm, alternating the arm order, and measures:
// - first entry: time to a ready player, live GL programs, program links and GPU geometries
//   and textures at that moment, and the first 120 frames at the arrival view;
// - steady state: a fixed street view on the campus (contract camera 02, under B12);
// - worst combined skyline and skywalk views: contract cameras 01 (southeast aerial) and 05
//   (from the office roof edge), the larger of the two reported;
// - repeated rebuild: the district rebuilt through Reload, resources read at the same view
//   after each rebuild, so any growth shows as a slope.
// Profile: 1280x800 at DPR 1, Smoothest graphics (three-quarter scale, no AO), afternoon
// light (15:00), vsync and the frame-rate limit off so a frame interval is the frame's cost.
// Metal on this shared Mac under its recorded load average: comparative, not device evidence.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS } from '../../shared/garden-campus-layout.js';
import { launch, openDistrict, pose, quantile, round1, sample, setHour, startFixture } from './garden-campus-render-common.mjs';

const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const rounds = Number(option('rounds', 2)), rebuilds = Number(option('rebuilds', 3)), frames = Number(option('frames', 180)), name = option('out', 'garden-campus-render-resources');
const arms = (args.length ? args : ['garage=garage', 'gardens=gardens']).map(arg => {
  const [label, spec] = arg.split('='), [revision, root] = spec.split('@');
  return { label, revision, root: root ? resolve(root) : null };
});
const output = `output/playwright/${name}`, camera = id => pose(CAMPUS.cameras.find(view => view.id === id));
const SOURCES = ['garden-campus.js', 'garden-campus-finish.js', 'garden-campus-planting.js', 'garden-campus-district.js', 'main.js', 'district.js'];

async function session(browser, arm, fixture) {
  const opened = await openDistrict(browser, fixture, arm.revision, { exposeCampus: !arm.root });
  const { context, page, errors, firstEntry } = opened;
  try {
    await setHour(page, 15);
    // The arrival view as the player spawns: the first frames after the district is ready.
    const arrival = await sample(page, 120, 0);
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    const at = async id => { await page.evaluate(view => window.__riverRenderAudit.view(view), camera(id));return { view: id, ...(await sample(page, frames, 30)) }; };
    const steady = await at('02-street-under-b12');
    const skyline = [await at('01-southeast-aerial'), await at('05-office-terrace-outlook')];
    const worst = skyline.reduce((a, b) => (b.frameP95 ?? 0) > (a.frameP95 ?? 0) ? b : a);
    // Rebuilds: Reload rebuilds and disposes the whole district; read resources at one view after each.
    const rebuild = [];
    for (let i = 0; i <= rebuilds; i++) {
      if (i > 0) {
        await page.locator('#reload').evaluate(button => button.click());
        await page.waitForFunction(() => !document.querySelector('#reload').disabled && document.querySelector('#loading').hidden, null, { timeout: 300000 });
        await setHour(page, 15);
      }
      const measured = await at('01-southeast-aerial');
      rebuild.push({ rebuild: i, programs: measured.programs, links: measured.links, geometries: measured.memory.geometries, textures: measured.memory.textures, calls: measured.calls, frameP50: measured.frameP50 });
    }
    await page.evaluate(() => window.__riverRenderAudit.release());
    return { firstEntry: { readyMs: firstEntry.readyMs, programs: firstEntry.gl.programs, links: firstEntry.gl.links, uploadMiB: round1(firstEntry.gl.uploadBytes / 1048576),
      geometries: firstEntry.memory.geometries, textures: firstEntry.memory.textures, arrivalP50: arrival.frameP50, arrivalP95: arrival.frameP95, arrivalCalls: arrival.calls },
    steady, skyline, worst: worst.view, rebuild, growth: { programs: rebuild.at(-1).programs - rebuild[0].programs, geometries: rebuild.at(-1).geometries - rebuild[0].geometries, textures: rebuild.at(-1).textures - rebuild[0].textures },
    renderer: steady.renderer, errors, hostLoad: loadavg().map(n => Number(n.toFixed(1))) };
  } finally { await context.close(); }
}

const sourcesOf = async root => Object.fromEntries(await Promise.all(SOURCES.map(async file => [file, await readFile(`${root}/preview/src/${file}`).then(data => createHash('sha256').update(data).digest('hex').slice(0, 16), () => null)])));
await mkdir(output, { recursive: true });
const release = await holdBrowserLock('Garden campus finish resources A/B');
const fixtures = new Map(), results = [];
let browser;
try {
  for (const arm of arms) fixtures.set(arm.label, await startFixture(arm.revision, { root: arm.root }));
  browser = await launch({ vsync: false });
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 ? [...arms].reverse() : arms;
    for (const arm of order) {
      const started = loadavg()[0], result = await session(browser, arm, fixtures.get(arm.label));
      results.push({ arm: arm.label, revision: arm.revision, round, loadBefore: Number(started.toFixed(1)), ...result });
      const r = results.at(-1);
      console.log(JSON.stringify({ arm: r.arm, round, ready: r.firstEntry.readyMs, programs: r.firstEntry.programs, steady: [r.steady.calls, r.steady.triangles, r.steady.frameP50, r.steady.frameP95],
        worst: [r.worst, ...['calls', 'triangles', 'frameP50', 'frameP95'].map(key => r.skyline.find(item => item.view === r.worst)[key])], growth: r.growth, load: r.hostLoad }));
    }
  }
  // Per arm: medians over rounds.
  const summary = Object.fromEntries(arms.map(arm => {
    const own = results.filter(item => item.arm === arm.label), med = pick => quantile(own.map(pick), 0.5);
    const view = id => ({ calls: med(r => r.skyline.concat([r.steady]).find(item => item.view === id).calls), triangles: med(r => r.skyline.concat([r.steady]).find(item => item.view === id).triangles),
      frameP50: round1(med(r => r.skyline.concat([r.steady]).find(item => item.view === id).frameP50)), frameP95: round1(med(r => r.skyline.concat([r.steady]).find(item => item.view === id).frameP95)) });
    return [arm.label, { firstEntry: { readyMs: med(r => r.firstEntry.readyMs), programs: med(r => r.firstEntry.programs), links: med(r => r.firstEntry.links), geometries: med(r => r.firstEntry.geometries), textures: med(r => r.firstEntry.textures), uploadMiB: med(r => r.firstEntry.uploadMiB), arrivalP50: med(r => r.firstEntry.arrivalP50), arrivalP95: med(r => r.firstEntry.arrivalP95) },
      steady: view('02-street-under-b12'), aerial: view('01-southeast-aerial'), officeOutlook: view('05-office-terrace-outlook'),
      rebuildGrowth: { programs: Math.max(...own.map(r => r.growth.programs)), geometries: Math.max(...own.map(r => r.growth.geometries)), textures: Math.max(...own.map(r => r.growth.textures)) } }];
  }));
  const receipt = { status: 'passed', browser: await browser.version(), renderer: results[0]?.renderer, profile: { viewport: [1280, 800], deviceScaleFactor: 1, graphics: 'smooth', vsync: 'off', hour: 15, rounds, rebuilds, frames },
    arms: await Promise.all(arms.map(async arm => ({ ...arm, sources: await sourcesOf(arm.root ?? process.cwd()) }))), summary, results,
    limits: 'One shared Mac under the recorded load average, Metal through ANGLE; frame intervals with vsync off are this host, not a device budget. Residents keep moving. Interleaved rounds limit drift but not other sessions.' };
  await writeFile(`${output}/result.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(summary, null, 1));
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ status: 'failed', error: error.stack, results }, null, 2)).catch(() => {});throw error;
} finally {
  await browser?.close();
  for (const fixture of fixtures.values()) await fixture.close().catch(() => {});
  release();
}
