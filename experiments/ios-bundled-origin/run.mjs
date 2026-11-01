#!/usr/bin/env node
// Runs the #286 bundled-origin experiment on the iOS Simulator: the play client
// from the loopback fixture's origin (hosted), and the play-only build served
// on `capacitor://localhost` (bundled, with and without the archived CSP snapshot),
// against the same fixture town and header witness. Writes
// .runtime/ios-bundled-origin/report.json and prints the comparison.
//
//   pnpm run build:play
//   node experiments/ios-bundled-origin/run.mjs [--skip-build] [--keep] [--device-type "iPhone 17"] [--modes hosted,bundled,bundled-csp]
//
// Simulator only: no signing, no device, no production origin. It creates its
// own simulator device and deletes it afterwards (--keep retains it).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBrowserFixture } from '../../preview/e2e/fixture-server.js';
import { comparisonRows, startWitness } from './witness.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const runtimeDir = join(root, '.runtime', 'ios-bundled-origin');
const bundleId = 'ai.typesafe.place.bundled-origin';

const options = { skipBuild: false, keep: false, deviceType: 'iPhone 17', modes: ['hosted', 'bundled', 'bundled-csp'], playDir: join(root, 'dist', 'play') };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--skip-build') options.skipBuild = true;
  else if (arg === '--keep') options.keep = true;
  else if (arg === '--device-type') options.deviceType = process.argv[++i];
  else if (arg === '--modes') options.modes = (process.argv[++i] ?? '').split(',');
  else if (arg === '--play-dir') options.playDir = process.argv[++i];
  else throw new Error(`Unknown option ${arg}`);
}

if (!options.modes.length || new Set(options.modes).size !== options.modes.length || options.modes.some(mode => !['hosted', 'bundled', 'bundled-csp'].includes(mode))) throw new Error('Invalid modes: choose distinct hosted, bundled, bundled-csp modes.');
if (typeof options.playDir !== 'string' || resolve(options.playDir) !== resolve(root, 'dist', 'play')) throw new Error('play-dir must match dist/play and its fixed play-manifest.json; alternate bundles require a matching manifest contract.');

const sh = (file, args, extra = {}) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...extra }).trim();
const simctl = (...args) => sh('xcrun', ['simctl', ...args]);
const log = message => console.log(`[bundled-origin] ${message}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const manifestPath = join(root, 'dist', 'play-manifest.json');
if (!existsSync(manifestPath) || !existsSync(join(options.playDir, 'index.html'))) throw new Error('Run `pnpm run build:play` first: the experiment serves dist/play and reads dist/play-manifest.json.');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const bundledWorker = manifest.files.find(f => /^\/assets\/table-game-worker-[a-z0-9_-]+\.js$/i.test(f.path))?.path ?? '';
mkdirSync(runtimeDir, { recursive: true });

let app = join(runtimeDir, 'build', 'Build', 'Products', 'Debug-iphonesimulator', 'BundledOrigin.app');
if (!options.skipBuild) {
  log('generating and building the simulator app (no signing)');
  sh('xcodegen', ['generate', '--spec', join(here, 'project.yml'), '--quiet'], { cwd: here });
  const build = spawnSync('xcodebuild', ['-project', join(here, 'BundledOrigin.xcodeproj'), '-scheme', 'BundledOrigin', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', join(runtimeDir, 'build'), 'CODE_SIGNING_ALLOWED=NO', '-quiet', 'build'], { cwd: here, encoding: 'utf8' });
  writeFileSync(join(runtimeDir, 'xcodebuild.log'), `${build.stdout ?? ''}\n${build.stderr ?? ''}`);
  if (build.status !== 0) throw new Error(`xcodebuild failed (${build.status}); see .runtime/ios-bundled-origin/xcodebuild.log`);
}
if (!existsSync(app)) throw new Error(`No simulator app at ${app}`);

const deviceType = JSON.parse(simctl('list', 'devicetypes', '-j')).devicetypes.find(d => d.name === options.deviceType);
if (!deviceType) throw new Error(`No simulator device type named ${options.deviceType}`);
// The newest available iOS runtime that supports the device type (a runtime lists its device types).
const runtimes = JSON.parse(simctl('list', 'runtimes', '-j')).runtimes.filter(r => r.platform === 'iOS' && r.isAvailable).sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
const runtime = runtimes.reverse().find(r => (r.supportedDeviceTypes ?? []).some(d => d.identifier === deviceType.identifier));
if (!runtime) throw new Error(`No available iOS simulator runtime supports ${deviceType.name} (runtimes: ${runtimes.map(r => r.name).join(', ') || 'none'})`);

const fixture = await startBrowserFixture();
const witness = await startWitness();
log(`fixture ${fixture.origin}; witness ${witness.origin}; runtime ${runtime.name}; device ${deviceType.name}`);
const report = { scope: 'iOS Simulator, loopback fixture with the test identity bob, header witness; no device, signing or production origin', source: sh('git', ['rev-parse', 'HEAD'], { cwd: root }), dirty: sh('git', ['status', '--porcelain'], { cwd: root }) !== '', runtime: runtime.name, device: deviceType.name, fixtureOrigin: fixture.origin, witnessOrigin: witness.origin, playDir: options.playDir, playManifest: { files: manifest.totals.files, bytes: manifest.totals.bytes }, modes: {}, witness: {} };

let udid = null;
try {
  udid = simctl('create', `river-oaks-bundled-origin-${process.pid}`, deviceType.identifier, runtime.identifier);
  log(`booting simulator ${udid}`);
  simctl('boot', udid);
  simctl('bootstatus', udid, '-b');
  simctl('install', udid, app);
  const container = simctl('get_app_container', udid, bundleId, 'data');
  const resultsPath = join(container, 'Documents', 'results.json');
  for (const mode of options.modes) {
    rmSync(resultsPath, { force: true });
    const from = witness.records.length;
    const args = ['--mode', mode.startsWith('bundled') ? 'bundled' : 'hosted', '--api', fixture.origin, '--witness', witness.origin, '--worker', mode === 'hosted' ? '/src/table-game-worker.js' : bundledWorker];
    if (mode.startsWith('bundled')) args.push('--play-dir', options.playDir);
    if (mode === 'bundled-csp') args.push('--csp');
    log(`launching ${mode}`);
    try { simctl('terminate', udid, bundleId); } catch { /* not running */ }
    simctl('launch', udid, bundleId, ...args);
    const deadline = Date.now() + 120000;
    let results = null;
    while (Date.now() < deadline) {
      await sleep(1000);
      if (!existsSync(resultsPath)) continue;
      try { results = JSON.parse(readFileSync(resultsPath, 'utf8')); break; } catch { /* partial write */ }
    }
    try { simctl('terminate', udid, bundleId); } catch { /* already gone */ }
    if (!results) results = { error: 'no results within 120 s' };
    report.modes[mode] = results;
    report.witness[mode] = witness.records.slice(from);
    log(`${mode}: ${results.error ? `error: ${results.error}` : `${Object.keys(results.checks ?? {}).length} checks in ${results.elapsedMs} ms`}`);
  }
} finally {
  if (udid && !options.keep) { try { simctl('shutdown', udid); } catch { /* not booted */ } try { simctl('delete', udid); } catch { /* already deleted */ } }
  else if (udid) log(`kept simulator ${udid}`);
  await witness.close();
  await fixture.close();
}

report.comparison = comparisonRows(report.modes);
writeFileSync(join(runtimeDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\nSource ${report.source}${report.dirty ? ' (dirty)' : ''}; ${report.runtime}; ${report.device}\n`);
const modes = Object.keys(report.modes);
console.log(`| check | ${modes.join(' | ')} |\n| --- | ${modes.map(() => '---').join(' | ')} |`);
for (const row of report.comparison) console.log(`| ${row.check} | ${modes.map(mode => row[mode]).join(' | ')} |`);
for (const mode of modes) {
  const result = report.modes[mode];
  if (result.violations?.length) console.log(`\n${mode} CSP violations: ${result.violations.map(v => `${v.directive} ${v.blocked}`).join('; ')}`);
  if (result.schemeRequests?.length) console.log(`\n${mode} requests to the bundled origin: ${result.schemeRequests.length} (${result.schemeRequests.filter(r => r.result.startsWith('404')).map(r => `${r.path} ${r.result}`).join('; ') || 'all served'})`);
}
console.log(`\nReport: .runtime/ios-bundled-origin/report.json`);
