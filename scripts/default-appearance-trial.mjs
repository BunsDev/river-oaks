import {captureProvenance, assertLifecycle} from './character-fidelity-evidence.mjs';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {platform, release, arch, cpus, loadavg} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {startBrowserFixture} from '../preview/e2e/fixture-server.js';
import {holdBrowserLock} from './browser-lock.mjs';
import {regionChange} from './lib/appearance-regions.mjs';
import {untrialedVariant} from './lib/default-appearance-variants.mjs';

// #517 default-appearance trial: matched native 4K captures of the named
// defaults with each realism component alone, the trial set at every tier and
// the full preset as evidence, under fixed daylight, dusk and interior light.
// Every case is compared with realism off under the same light and MSAA:
// whole-image error, and per region (hair, brows/lashes, skin) the covered
// area, its overlap with off and the shift of its mean colour (CIE76 ΔE).
//
//   node scripts/default-appearance-trial.mjs [--out <dir>] [--appearances jevica,sable-human]
//     [--lighting daylight,dusk,interior] [--variants off,roughness,...] [--cycles 10]
//
// Lifecycle: viewport and two-camera 4K load/dispose cycles for each variant
// must leave renderer resources at their warm level. This script does not time
// frames; use character-fidelity-baseline.mjs --repeats 3 --seconds 30 for timing.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
// realism undefined in `components` means the named-default policy decides.
const VARIANTS = {
  off: {realism: 'off'},
  roughness: {realism: 'high', components: ['roughness']},
  pores: {realism: 'high', components: ['pores']},
  'pores-standard': {realism: 'standard', components: ['pores']},
  coverage: {realism: 'high', components: ['coverage']},
  hairColor: {realism: 'high', components: ['hairColor']},
  'trial-high': {realism: 'high'},
  'trial-standard': {realism: 'standard'},
  'trial-low': {realism: 'low'},
  'full-high': {realism: 'high', components: ['roughness', 'pores', 'scatter', 'sheen', 'cornea', 'coverage', 'hairColor'], evidenceOnly: true},
  'off-nomsaa': {realism: 'off', samples: 0, baseline: 'off-nomsaa'},
  'trial-low-nomsaa': {realism: 'low', samples: 0, baseline: 'off-nomsaa'},
};
const appearances = option('--appearances', 'jevica,sable-human').split(',');
const lightings = option('--lighting', 'daylight,dusk,interior').split(',');
const variants = option('--variants', Object.keys(VARIANTS).join(',')).split(',');
const cycleCount = Number(option('--cycles', 10));
for (const name of variants) if (!VARIANTS[name]) throw new Error(`Unknown variant ${name}`);
for (const name of variants) { const base = VARIANTS[name].baseline ?? 'off'; if (!variants.includes(base)) throw new Error(`${name} needs its baseline ${base}`); }
const output = resolve(option('--out', join(root, '.runtime/default-appearance-trial', new Date().toISOString().replaceAll(':', '-'))));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const load = () => loadavg().map(value => +value.toFixed(2));
const git = (...command) => execFileSync('git', command, {cwd: root, encoding: 'utf8'}).trim();

await mkdir(output, {recursive: true});
const report = {version: 1, kind: 'default-appearance-trial', status: 'running', startedAt: new Date().toISOString(),
  revision: git('rev-parse', 'HEAD'), provenance: await captureProvenance(root),
  options: {appearances, lightings, variants, cycles: cycleCount, definitions: Object.fromEntries(variants.map(name => [name, VARIANTS[name]]))},
  machine: {platform: platform(), osRelease: release(), architecture: arch(), cpus: cpus().length, cpuModel: cpus()[0]?.model},
  method: 'Chromium headless (--use-angle=metal on macOS), the character-fidelity fixture and createCharacterHero, reduced motion. Native 3840x2160 through character-portrait.js at MSAA 4 unless a variant sets samples 0. Regions are found by re-rendering without their meshes; pixel means are sRGB 8-bit and ΔE is CIE76 of those means.',
  results: {}, skipped: [], errors: []};
report.dirty = report.provenance.dirty;
let fixture, browser;
const unlock = await holdBrowserLock('Default appearance trial');
try {
  if ((await captureProvenance(root)).sha256 !== report.provenance.sha256) throw new Error('Source or asset inputs changed while queued');
  fixture = await startBrowserFixture();
  browser = await chromium.launch({headless: true, args: [...(platform() === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : []), '--disable-gpu-vsync', '--disable-frame-rate-limit']});
  report.browser = {version: browser.version()};
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce'});
  await context.addCookies([{name: 'fixture_session', value: 'owner', url: fixture.origin}]);
  const tab = await context.newPage(); tab.setDefaultTimeout(300000);
  tab.on('pageerror', error => report.errors.push(error.message));
  tab.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  tab.on('response', response => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
  await tab.goto(fixture.origin + '/e2e/fixtures/character-fidelity.html');
  await tab.waitForFunction(() => document.body.dataset.ready === 'true');
  report.environment = await tab.evaluate(() => window.fidelityFixture.environment);
  for (const name of lightings) if (!report.environment.lighting?.includes(name)) throw new Error(`Fixture lacks lighting ${name}`);

  for (const appearanceId of appearances) for (const lighting of lightings) for (const name of variants) {
    const variant = VARIANTS[name], key = `${appearanceId}.${lighting}.${name}`;
    if (untrialedVariant(appearanceId, variant)) { report.skipped.push(key); console.log(`${key}: skipped, not in the trial policy`); continue; }
    const capture = await tab.evaluate(([id, options]) => window.fidelityFixture.capture(id, options),
      [appearanceId, {realism: variant.realism, components: variant.components, lighting, regions: true, samples: variant.samples ?? 4}]);
    const views = {};
    for (const [view, value] of Object.entries(capture.views)) {
      const bytes = Buffer.from(value.png.slice(value.png.indexOf(',') + 1), 'base64'), file = `${key}-${view}.png`;
      if (bytes.readUInt32BE(16) !== 3840 || bytes.readUInt32BE(20) !== 2160) throw new Error(`Capture is not native 4K: ${file}`);
      await writeFile(join(output, file), bytes);
      views[view] = {file, sha256: sha(bytes), camera: value.camera, regions: value.regions};
    }
    report.results[key] = {appearanceId, lighting, variant: name, evidenceOnly: Boolean(variant.evidenceOnly), samples: capture.samples,
      realismReport: capture.realism, census: capture.census, views, loadavg: load()};
    console.log(`${key}: ${capture.realism?.tier} [${capture.realism?.components?.join(',') ?? ''}] skin ${capture.realism?.skin ?? 0} hair ${capture.realism?.hair ?? 0} cornea ${capture.realism?.cornea ?? 0}`);
  }

  // Compare each case with off under the same light and MSAA.
  for (const result of Object.values(report.results)) {
    const baseName = VARIANTS[result.variant].baseline ?? 'off';
    if (result.variant === baseName) continue;
    const base = report.results[`${result.appearanceId}.${result.lighting}.${baseName}`];
    result.against = baseName; result.comparison = {};
    for (const view of Object.keys(result.views)) {
      const read = async file => `data:image/png;base64,${(await readFile(join(output, file))).toString('base64')}`;
      const image = await tab.evaluate(input => window.fidelityFixture.compare(input),
        {reference: await read(base.views[view].file), current: await read(result.views[view].file), limits: {maxChannel: 255, meanChannel: 255, changedPixelFraction: 1}});
      const regions = Object.fromEntries(Object.keys(result.views[view].regions ?? {}).map(region =>
        [region, regionChange(base.views[view].regions?.[region], result.views[view].regions[region])]));
      result.comparison[view] = {identicalBytes: base.views[view].sha256 === result.views[view].sha256,
        image: {maxChannel: image.maxChannel, meanChannel: +image.meanChannel.toFixed(4), changedPixelFraction: +image.changedPixelFraction.toFixed(5)}, regions};
    }
  }

  // Load/dispose residue per appearance and variant, viewport and 4K portrait.
  report.lifecycle = {};
  for (const appearanceId of appearances) for (const name of variants) {
    const variant = VARIANTS[name];
    if (variant.samples === 0 || untrialedVariant(appearanceId, variant)) continue;
    const viewport = await tab.evaluate(([id, count, options]) => window.fidelityFixture.cycles(id, count, options), [appearanceId, cycleCount, {realism: variant.realism, components: variant.components}]);
    const portrait = await tab.evaluate(([id, count, options]) => window.fidelityFixture.cycles(id, count, options), [appearanceId, cycleCount, {portrait: true, realism: variant.realism, components: variant.components}]);
    assertLifecycle(viewport); assertLifecycle(portrait);
    report.lifecycle[`${appearanceId}.${name}`] = {viewport, portrait};
  }
  await tab.evaluate(() => window.fidelityFixture.dispose()).catch(() => {});
  await context.close();
  if (report.errors.length) throw new Error(report.errors.join('; '));
  if ((await captureProvenance(root)).sha256 !== report.provenance.sha256) throw new Error('Source or asset inputs changed during the trial');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.message; process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); report.loadavgEnd = load();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close(); await fixture?.close(); unlock();
}
console.log(`${report.status}${report.failure ? ` (${report.failure})` : ''}: ${output}`);
