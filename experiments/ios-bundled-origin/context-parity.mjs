#!/usr/bin/env node
// Controlled simulator comparison. A policy file is generated from current
// source; no production endpoints, cookies, signing or native message transport.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_SECURITY_POLICY } from '../../server/security-headers.js';
import { startWitness } from './witness.mjs';
import { validateContextTrial } from './context-parity-report.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 0, 'This comparison always builds its current source inputs; no skip-build option');
const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const out = join(root, '.runtime', `context-parity-${Date.now()}`);
const bundle = join(out, 'bundle');
mkdirSync(bundle, { recursive: true });
const bytes = Buffer.from(`${CONTENT_SECURITY_POLICY}\n`);
const policyHash = createHash('sha256').update(bytes).digest('hex');
writeFileSync(join(bundle, '__context-parity-csp.txt'), bytes);
writeFileSync(join(bundle, 'index.html'), '<!doctype html><meta name="viewport" content="width=device-width"><title>Controlled context fixture</title><p>Controlled CSP comparison. No native message handler.</p>');
writeFileSync(join(bundle, 'parity-worker.js'), "self.onmessage = event => self.postMessage({kind:'context-worker-ready',nonce:event.data.nonce});\n");
const sh = (bin, values, extra = {}) => execFileSync(bin, values, { encoding: 'utf8', ...extra }).trim();
const sim = (...values) => sh('xcrun', ['simctl', ...values]);
const app = join(root, '.runtime/ios-bundled-origin/build/Build/Products/Debug-iphonesimulator/BundledOrigin.app');
const sourcePaths = ['App/BundledOriginApp.swift', 'App/Info.plist', 'project.yml', 'Sources/ExperimentPolicy/ExperimentPolicy.swift', 'Web/context-parity.js', 'Web/harness.js', 'context-parity.mjs', 'context-parity-report.mjs', '../../server/security-headers.js'];
const hashSources = () => sourcePaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(join(here, path))).digest('hex') }));
const sourceBeforeBuild = hashSources();
{
  sh('xcodegen', ['generate', '--spec', join(here, 'project.yml'), '--quiet']);
  const build = spawnSync('xcodebuild', ['-project', join(here, 'BundledOrigin.xcodeproj'), '-scheme', 'BundledOrigin', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', join(root, '.runtime/ios-bundled-origin/build'), 'CODE_SIGNING_ALLOWED=NO', '-quiet', 'build'], { encoding: 'utf8' });
  writeFileSync(join(out, 'build.log'), `${build.stdout ?? ''}\n${build.stderr ?? ''}`);
  assert.equal(build.status, 0, 'Unsigned simulator build failed; retain build.log');
}
assert.ok(existsSync(app), 'No built app');
const type = JSON.parse(sim('list', 'devicetypes', '-j')).devicetypes.find(value => value.name === 'iPhone 17');
const runtime = JSON.parse(sim('list', 'runtimes', '-j')).runtimes.filter(value => value.platform === 'iOS' && value.isAvailable && (value.supportedDeviceTypes ?? []).some(candidate => candidate.identifier === type?.identifier)).sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
assert.ok(type && runtime, 'No compatible installed simulator runtime');
assert.deepEqual(hashSources(), sourceBeforeBuild, 'Inputs changed during build');
for (const script of ['context-parity.js', 'harness.js']) assert.ok(readFileSync(join(app, script)).equals(readFileSync(join(here, 'Web', script))), 'App script differs from current source');
const report = { scope: 'Unsigned Debug iOS simulator; synthetic bundle, loopback witness and native main-frame polling; not actual Capacitor, client, production or device qualification', source: sh('git', ['rev-parse', 'HEAD'], { cwd: root }), dirty: sh('git', ['status', '--porcelain'], { cwd: root }) !== '', runtime: runtime.name, device: type.name, policyHash, sourceFiles: sourceBeforeBuild, appFiles: readdirSync(app).filter(path => !path.endsWith('.dSYM')).map(path => { const file = join(app, path); try { return { path, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }; } catch { return null; } }).filter(Boolean), trials: {} };
const save = () => writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
save(); console.log(`Evidence ${out}`);
const witness = await startWitness();
let udid, primaryError, interrupted;
const onInterrupt = signal => { interrupted = signal; };
const onSIGINT = () => onInterrupt('SIGINT');
const onSIGTERM = () => onInterrupt('SIGTERM');
process.on('SIGINT', onSIGINT); process.on('SIGTERM', onSIGTERM);
const checkInterrupt = () => { if (interrupted) throw new Error(`Interrupted by ${interrupted}`); };
const cleanupErrors = [];
try {
  udid = sim('create', `river-oaks-context-parity-${process.pid}`, type.identifier, runtime.identifier);
  report.simulator = udid; save(); console.log(`Owned simulator ${udid}`);
  checkInterrupt(); sim('boot', udid); checkInterrupt(); sim('bootstatus', udid, '-b'); checkInterrupt(); sim('install', udid, app);
  const id = 'ai.typesafe.place.bundled-origin';
  const container = sim('get_app_container', udid, id, 'data');
  const resultPath = join(container, 'Documents/results.json');
  for (const enabled of [false, true]) {
    checkInterrupt();
    const name = enabled ? 'source-csp' : 'no-csp';
    rmSync(resultPath, { force: true });
    const offset = witness.records.length;
    const launchArgs = ['launch', udid, id, '--mode', 'bundled', '--context-parity', '--api', witness.origin, '--witness', witness.origin, '--play-dir', bundle];
    if (enabled) launchArgs.push('--csp');
    const launched = sim(...launchArgs);
    const pid = Number(launched.match(/: (\d+)$/)?.[1]); assert.ok(pid > 0);
    let record, lastObservation = Date.now();
    while (!record) {
      if (existsSync(resultPath)) record = JSON.parse(readFileSync(resultPath, 'utf8'));
      else {
        checkInterrupt();
        const alive = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
        assert.ok(alive.status === 0 && alive.stdout.trim().endsWith('/BundledOrigin'), 'Native process exited before producing a terminal result');
        if (Date.now() - lastObservation >= 30000) { console.log(`${name}: still observing the same live native process ${pid}`); lastObservation = Date.now(); }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    const seen = witness.records.slice(offset);
    report.trials[name] = { native: record, witness: seen }; save();
    sim('io', udid, 'screenshot', join(out, `${name}.png`));
    // A complete atomic native result is a terminal trial, not an observation timeout.
    sim('terminate', udid, id);
    const measured = validateContextTrial(record, seen, { enabled, policyHash });
    report.trials[name].measured = measured; save();
    console.log(`${name}: ${JSON.stringify(measured)}`);
  }
  assert.equal(report.trials['source-csp'].measured.page.cspRejectionQualified, true, 'Page rejection requires matching CSP evidence, not just a failed fetch');
  report.workerComparisonQualified = ['page', 'isolated'].every(role => report.trials['no-csp'].measured[role].worker === 'reply');
  report.workerComparisonScope = report.workerComparisonQualified ? 'Nonce-matched simple module-worker controls only' : 'Inconclusive: baseline worker startup was not verified';
  report.fetchResultsMatch = report.trials['source-csp'].measured.page.fetch === report.trials['source-csp'].measured.isolated.fetch;
} catch (error) { primaryError = error; report.failure = String(error.message); }
finally {
  if (udid) for (const operation of ['shutdown', 'delete']) {
    try { sim(operation, udid); } catch (error) { cleanupErrors.push({ operation, message: String(error.message) }); }
  }
  try { await witness.close(); } catch (error) { cleanupErrors.push({ operation: 'witness-close', message: String(error.message) }); }
  report.cleanupErrors = cleanupErrors;
  if (interrupted) { report.interrupted = interrupted; primaryError ??= new Error(`Interrupted by ${interrupted}`); }
  save();
  process.off('SIGINT', onSIGINT); process.off('SIGTERM', onSIGTERM);
}
console.log(`Final evidence ${join(out, 'report.json')}`);
if (primaryError) throw primaryError;
assert.equal(cleanupErrors.length, 0, 'Cleanup incomplete; inspect same simulator');
