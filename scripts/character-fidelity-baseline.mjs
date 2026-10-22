import {captureProvenance, assertLifecycle, timingAgreement} from './character-fidelity-evidence.mjs';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {platform, release, arch, cpus, loadavg} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {startBrowserFixture} from '../preview/e2e/fixture-server.js';
import {holdBrowserLock} from './browser-lock.mjs';
import {HERO_IMAGE_LIMITS} from '../preview/audit/character-image-comparison.js';

// #517 baseline: census, cold load, frame timing, crowd scaling, load/dispose
// residue and native 4K full-body and close-up captures of shipped characters.
//
//   node scripts/character-fidelity-baseline.mjs [--out <dir>] [--against <earlier-run>]
//     [--appearances jevica,sable-human,...] [--realism off,high] [--crowd 1,8,24] [--repeats 2] [--samples 240]
//
// Each appearance runs once per realism tier; results and files are keyed by
// the appearance id, with ".<tier>" appended for tiers other than off.
//
// --against checks that this run reproduces an earlier one: census and pixels
// must match (exit 1 otherwise); timing ratios are reported with load averages.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const appearances = option('--appearances', 'jevica,sable-human,man-tailored,rowan-human').split(',');
const tiers = option('--realism', 'off').split(','), cases = appearances.flatMap(appearanceId => tiers.map(tier => ({appearanceId, tier, key: tier === 'off' ? appearanceId : `${appearanceId}.${tier}`})));
const crowd = option('--crowd', '1,8,24').split(',').map(Number), repeats = Number(option('--repeats', 2)), samples = Number(option('--samples', 240));
const output = resolve(option('--out', join(root, '.runtime/character-fidelity', new Date().toISOString().replaceAll(':', '-'))));
const expressions = args.includes('--expressions'), qualityCycles = args.includes('--quality-cycles');
const timingCycles = args.includes('--timing-cycles');
const against = option('--against', null) && resolve(option('--against'));
const TIMING_TOLERANCE = .2;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const load = () => loadavg().map(value => +value.toFixed(2));
const git = (...command) => execFileSync('git', command, {cwd: root, encoding: 'utf8'}).trim();

await mkdir(output, {recursive: true});
const report = {version: 1, kind: 'character-fidelity-baseline', status: 'running', startedAt: new Date().toISOString(),
  revision: git('rev-parse', 'HEAD'), provenance: await captureProvenance(root),
  options: {appearances, realism: tiers, crowd, repeats, samples, expressions, qualityCycles, timingCycles}, machine: {platform: platform(), osRelease: release(), architecture: arch(), cpus: cpus().length, cpuModel: cpus()[0]?.model},
  method: 'Chromium headless, --use-angle=metal --ignore-gpu-blocklist --disable-gpu-vsync --disable-frame-rate-limit, 1920x1080 at DPR 1. Captures: native 3840x2160 MSAA 4 through character-portrait.js with reduced motion. Timing: rAF intervals and update+render CPU per frame, GPU TIME_ELAPSED every 4th frame where exposed; cases alternate order between repeats.',
  results: {}, errors: []};
report.dirty = report.provenance.dirty;
let fixture, browser;
const unlock = await holdBrowserLock('Character fidelity baseline');
try {
  if ((await captureProvenance(root)).sha256 !== report.provenance.sha256) throw new Error('Source or asset inputs changed while queued');
  fixture = await startBrowserFixture();
  browser = await chromium.launch({headless: true, args: [...(platform() === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : []), '--disable-gpu-vsync', '--disable-frame-rate-limit']});
  report.browser = {version: browser.version()};
  const page = async reducedMotion => {
    const context = await browser.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion});
    await context.addCookies([{name: 'fixture_session', value: 'owner', url: fixture.origin}]);
    const tab = await context.newPage(); tab.setDefaultTimeout(180000);
    tab.on('pageerror', error => report.errors.push(error.message));
    tab.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    tab.on('response', response => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
    await tab.goto(fixture.origin + '/e2e/fixtures/character-fidelity.html');
    await tab.waitForFunction(() => document.body.dataset.ready === 'true');
    return {tab, close: async () => { await tab.evaluate(() => window.fidelityFixture.dispose()).catch(() => {}); await context.close(); }};
  };

  for (const {appearanceId, tier, key} of cases) {
    const {tab, close} = await page('reduce');
    try {
      report.environment ??= await tab.evaluate(() => window.fidelityFixture.environment);
      if (!(report.environment.realismTiers ?? ['off']).includes(tier)) throw new Error(`Fixture does not support realism tier ${tier}`);
      const capture = await tab.evaluate(([id, realism, expressions]) => window.fidelityFixture.capture(id, {realism, expressions}), [appearanceId, tier, expressions]);
      const views = {};
      for (const [view, value] of Object.entries(capture.views)) {
        const bytes = Buffer.from(value.png.slice(value.png.indexOf(',') + 1), 'base64'), file = `${key}-${view}.png`;
        if (bytes.readUInt32BE(16) !== 3840 || bytes.readUInt32BE(20) !== 2160) throw new Error(`Capture is not native 4K: ${file}`);
        await writeFile(join(output, file), bytes); views[view] = {file, sha256: sha(bytes), camera: value.camera};
      }
      const cycles = await tab.evaluate(([id, realism]) => window.fidelityFixture.cycles(id, 10, {realism}), [appearanceId, tier]);
      report.results[key] = {appearanceId, realism: tier, realismReport: capture.realism ?? null, supportedExpressions:capture.supportedExpressions, definition: capture.definition, census: capture.census, views, cycles, load: [], frames: []};
      assertLifecycle(cycles);
      const portraitCycles = await tab.evaluate(([id, realism]) => window.fidelityFixture.cycles(id, 10, {portrait: true, realism}), [appearanceId, tier]);
      report.results[key].portraitCycles = portraitCycles;
      assertLifecycle(portraitCycles);
      if (timingCycles) {
        const result = await tab.evaluate(([id, realism]) => window.fidelityFixture.timingCycles(id, 3, {realism}), [appearanceId, tier]);
        report.results[key].timingCycles = result;
        assertLifecycle(result);
      }
      if (qualityCycles && tier === tiers[0]) {
        const result = await tab.evaluate(id => window.fidelityFixture.qualityCycles(id), appearanceId);
        report.results[key].qualityCycles = result;
        assertLifecycle(result);
        if (!result.checks.every(check => check.passed)) throw new Error('Quality changed character identity');
      }
      console.log(`${key}: census ${capture.census.triangles} tris, ${capture.census.drawCalls} draws, ${(capture.census.textureBytes / 2 ** 20).toFixed(1)} MiB textures; residue ${JSON.stringify(cycles.delta)}`);
    } finally { await close(); }
  }

  // Timing: fresh pages, cold load first; case order alternates between repeats.
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const {appearanceId, tier, key} of repeat % 2 ? [...cases].reverse() : cases) {
      const {tab, close} = await page('no-preference');
      try {
        const before = load(), cold = await tab.evaluate(([id, realism]) => window.fidelityFixture.load(id, {realism}), [appearanceId, tier]);
        report.results[key].load.push({repeat, loadavg: before, ...cold});
        for (const count of crowd) {
          const start = load(), result = await tab.evaluate(([id, options]) => window.fidelityFixture.frames(id, options), [appearanceId, {count, samples, realism: tier}]);
          report.results[key].frames.push({repeat, loadavg: start, ...result});
          console.log(`${key} x${count} r${repeat}: frame p50 ${result.frameIntervalMs.p50} p95 ${result.frameIntervalMs.p95} ms, cpu p95 ${result.cpuMs.p95} ms, gpu p50 ${result.gpuMs?.p50 ?? 'n/a'} ms, load ${start[0]}`);
        }
      } finally { await close(); }
    }
  }

  if (against) {
    const earlier = JSON.parse(await readFile(join(against, 'report.json'), 'utf8')), checks = [];
    const {tab, close} = await page('reduce');
    try {
      for (const {key} of cases) {
        const then = earlier.results[key], now = report.results[key];
        if (!then) { checks.push({key, check: 'present', passed: false}); continue; }
        checks.push({key, check: 'census', passed: JSON.stringify(then.census) === JSON.stringify(now.census)});
        for (const view of Object.keys(now.views)) {
          const read = async dir => `data:image/png;base64,${(await readFile(join(dir, now.views[view].file))).toString('base64')}`;
          const result = then.views[view].sha256 === now.views[view].sha256 ? {passed: true, identicalBytes: true}
            : await tab.evaluate(input => window.fidelityFixture.compare(input), {reference: await read(against), current: await read(output), limits: HERO_IMAGE_LIMITS});
          checks.push({key, check: `pixels:${view}`, ...result});
        }
        for (const count of crowd) {
          const median = (runs, metric) => { const values = runs.filter(run => run.count === count).map(run => run[metric]?.p50).filter(Number.isFinite).sort((a, b) => a - b); return values.length ? values[Math.floor(values.length / 2)] : null; };
          for (const metric of ['frameIntervalMs', 'gpuMs']) {
            const a = median(then.frames, metric), b = median(now.frames, metric);
            if (a === null || b === null) continue;
            checks.push({key, check: `timing:${metric}:x${count}`, timing: true, earlier: a, current: b, ratio: +(b / a).toFixed(3), agrees: Math.abs(b / a - 1) <= TIMING_TOLERANCE});
          }
        }
      }
    } finally { await close(); }
    report.reproduction = {against: relative(root, against) || against, earlierRevision: earlier.revision, tolerance: {pixels: HERO_IMAGE_LIMITS, timingRatio: TIMING_TOLERANCE}, checks,
      deterministicPassed: checks.filter(check => !check.timing).every(check => check.passed),
      timingAgrees: timingAgreement(checks)};
    if (!report.reproduction.deterministicPassed) throw new Error('Run does not reproduce the earlier census or pixels');
  }
  if (report.errors.length) throw new Error(report.errors.join('; '));
  const finalProvenance = await captureProvenance(root);
  if (finalProvenance.sha256 !== report.provenance.sha256) throw new Error('Source or asset inputs changed during measurement');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.message; process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); report.loadavgEnd = load();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close(); await fixture?.close(); unlock();
}
console.log(`${report.status}${report.failure ? ` (${report.failure})` : ''}: ${output}`);
