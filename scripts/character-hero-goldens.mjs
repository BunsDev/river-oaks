import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {platform, release, version, arch} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {startBrowserFixture} from '../preview/e2e/fixture-server.js';
import {holdBrowserLock} from './browser-lock.mjs';
import {compareHeroEnvironment, HERO_IMAGE_LIMITS} from '../preview/audit/character-image-comparison.js';

// Recording creates an unreviewed candidate. Checking never writes into the
// reference directory, changes tolerances, or accepts a different environment.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), mode = args[0];
if (!['--record', '--check'].includes(mode) || args.length !== 2) throw new Error('Usage: node scripts/character-hero-goldens.mjs --record <new-candidate-directory> | --check <reviewed-reference-directory>');
const baseline = resolve(args[1]), record = mode === '--record';
const output = record ? baseline : join(root, '.runtime/character-studio/hero-goldens', new Date().toISOString().replaceAll(':', '-'));
if (!record && (output === baseline || output.startsWith(baseline + '/'))) throw new Error('Check output must be outside the reference directory');
const cases = ['sable-human'], sha = bytes => createHash('sha256').update(bytes).digest('hex');
let reference;
if (!record) {
  reference = JSON.parse(await readFile(join(baseline, 'manifest.json'), 'utf8'));
  if (reference.version !== 1 || reference.status !== 'passed' || reference.kind !== 'reviewed-render-reference' || !reference.review?.scope || !reference.review?.limitations) throw new Error('Reference needs explicit recorded visual review; an unreviewed candidate cannot pass');
  if (JSON.stringify(reference.limits) !== JSON.stringify(HERO_IMAGE_LIMITS)) throw new Error('Reference limits differ from the pinned comparator');
  if (JSON.stringify(reference.cases?.map(value => value.appearanceId)) !== JSON.stringify(cases)) throw new Error('Reference must contain both supported human and fox cases');
}
await mkdir(dirname(output), {recursive: true}); await mkdir(output);
const report = {version: 1, startedAt: new Date().toISOString(), status: 'running', mode, baseline: record ? null : baseline,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), limits: HERO_IMAGE_LIMITS, cases: [], errors: []};
// Record the actual transitive local render sources, plus locked dependencies and
// shipped rig bytes. Source changes are review evidence, not a pixel-test bypass.
const sources = {};
async function source(path) {
  if (Object.hasOwn(sources, path)) return;
  const bytes = await readFile(join(root, path)); sources[path] = sha(bytes);
  if (!path.endsWith('.js') && !path.endsWith('.mjs')) return;
  for (const match of bytes.toString().matchAll(/(?:from|import)\s*(?:\(\s*)?['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const next = resolve(root, dirname(path), match[1]);
    if (!next.startsWith(root)) throw new Error('Render dependency left the repository');
    await source(next.slice(root.length));
  }
}
await source('preview/e2e/fixtures/character-hero-golden.js');
for (const name of ['pnpm-lock.yaml', 'preview/e2e/fixtures/character-hero-golden.html', 'preview/public/assets/characters/jevica.glb', 'preview/public/assets/characters/jevica.sources.json', 'scripts/character-hero-goldens.mjs']) sources[name] = sha(await readFile(join(root, name)));
report.sources = sources;
let fixture, browser, page;
const unlock = await holdBrowserLock('Pinned character hero references');
try {
  fixture = await startBrowserFixture();
  browser = await chromium.launch({headless: true, executablePath: chromium.executablePath(), args: platform() === 'darwin' ? ['--use-angle=metal'] : []});
  const context = await browser.newContext({viewport: {width: 960, height: 540}, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce'});
  await context.addCookies([{name: 'fixture_session', value: 'owner', url: fixture.origin}]);
  page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
  await page.goto(fixture.origin + '/e2e/fixtures/character-hero-golden.html');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  report.environment = {platform: platform(), osRelease: release(), osVersion: version(), architecture: arch(),
    browserVersion: browser.version(), browserSha256: sha(await readFile(chromium.executablePath())),
    ...await page.evaluate(() => window.heroGoldenFixture.environment)};
  const available = compareHeroEnvironment(report.environment, report.environment);
  if (!available.compatible) {
    report.status = 'incompatible'; throw new Error(`Renderer cannot be pinned: ${available.mismatches.join(', ')}`);
  }
  if (!record) {
    report.environmentComparison = compareHeroEnvironment(reference.environment, report.environment);
    if (!report.environmentComparison.compatible) {
      report.status = 'incompatible'; throw new Error(`Reference environment mismatch: ${report.environmentComparison.mismatches.join(', ')}`);
    }
  }
  for (const appearanceId of cases) {
    const captures = [];
    for (let repeat = 0; repeat < (record ? 3 : 1); repeat++) {
      const capture = await page.evaluate(id => window.heroGoldenFixture.capture(id), appearanceId);
      const bytes = Buffer.from(capture.png.slice(capture.png.indexOf(',') + 1), 'base64');
      if (bytes.readUInt32BE(16) !== 3840 || bytes.readUInt32BE(20) !== 2160) throw new Error('Capture is not native 4K');
      const file = `${appearanceId}${repeat ? `-repeat-${repeat}` : ''}.png`;
      await writeFile(join(output, file), bytes); captures.push({...capture, file, sha256: sha(bytes)});
    }
    const first = captures[0], comparisons = [];
    const item = {appearanceId, file: first.file, sha256: first.sha256, definition: first.definition, comparisons}; report.cases.push(item);
    if (record) {
      for (const capture of captures.slice(1)) comparisons.push(await page.evaluate(input => window.heroGoldenFixture.compare(input), {reference: first.png, current: capture.png, limits: HERO_IMAGE_LIMITS}));
    } else {
      const expected = reference.cases.find(value => value.appearanceId === appearanceId);
      // The filenames are fixed; a manifest cannot select another local file.
      const bytes = await readFile(join(baseline, `${appearanceId}.png`));
      if (sha(bytes) !== expected.sha256) throw new Error(`Reference image integrity mismatch: ${appearanceId}`);
      if (JSON.stringify(expected.definition) !== JSON.stringify(first.definition)) throw new Error(`Canonical definition differs: ${appearanceId}`);
      comparisons.push(await page.evaluate(input => window.heroGoldenFixture.compare(input), {reference: `data:image/png;base64,${bytes.toString('base64')}`, current: first.png, limits: HERO_IMAGE_LIMITS}));
    }
    if (comparisons.some(value => !value.passed)) throw new Error(`Hero image comparison failed: ${appearanceId}`);
    console.log(`${appearanceId}: ${comparisons.length} native 4K comparisons passed`);
  }
  if (report.errors.length) throw new Error(report.errors.join('; '));
  // A running dev server must not turn source edits into mixed-revision proof.
  for (const [path, expected] of Object.entries(sources)) if (sha(await readFile(join(root, path))) !== expected) throw new Error(`Source changed during capture: ${path}`);
  report.status = 'passed';
  if (record) await writeFile(join(output, 'manifest.json'), JSON.stringify({...report, kind: 'candidate',
    scope: 'Two authored neutral human/fox portraits on this exact renderer. Review images before promoting. Not wardrobe, animation, approved-device or human acceptance.'}, null, 2) + '\n');
} catch (error) {
  if (report.status !== 'incompatible') report.status = 'failed'; report.failure = error.message;
  process.exitCode = report.status === 'incompatible' ? 2 : 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await page?.evaluate(() => window.heroGoldenFixture?.dispose()).catch(() => {});
  await browser?.close(); await fixture?.close(); unlock();
}
console.log(`${report.status}: ${output}`);
