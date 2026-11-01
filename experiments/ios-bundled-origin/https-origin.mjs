#!/usr/bin/env node
// Existing fixture identities over real TLS; never production/physical acceptance.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHTTPSFixture } from './https-fixture.mjs';
import { startWitness } from './witness.mjs';

assert.equal(process.argv.length, 2, 'This experiment always builds current inputs; no skip-build option');
const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const out = join(root, '.runtime', `https-origin-${Date.now()}`), privateDir = join(out, 'private'), bundle = join(out, 'bundle');
mkdirSync(privateDir, { recursive: true }); mkdirSync(bundle);
writeFileSync(join(bundle, 'index.html'), '<!doctype html><title>Bundled TLS fixture</title><p>Synthetic origin control.</p>');
const sh = (bin, args, options = {}) => (execFileSync(bin, args, { cwd: root, encoding: 'utf8', ...options }) ?? '').trim();
const sim = (...args) => sh('xcrun', ['simctl', ...args]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = ['experiments/ios-bundled-origin/App/BundledOriginApp.swift', 'experiments/ios-bundled-origin/App/FixtureCookieBootstrap.swift', 'experiments/ios-bundled-origin/App/Info.plist', 'experiments/ios-bundled-origin/Sources/ExperimentPolicy/ExperimentPolicy.swift', 'experiments/ios-bundled-origin/Web/harness.js', 'experiments/ios-bundled-origin/project.yml', 'experiments/ios-bundled-origin/https-fixture.mjs', 'experiments/ios-bundled-origin/https-origin.mjs', 'experiments/ios-bundled-origin/witness.mjs', 'server/tests/browser-fixture.js', 'server/tests/browser-fixture-origin.js', 'server/app.js'];
const hashInputs = () => inputs.map(path => ({ path, sha256: digest(readFileSync(join(root, path))) }));
const report = { scope: 'Unsigned iOS simulator; synthetic HTTPS/custom-scheme documents and existing fixture identities. Not actual Capacitor, real game package, production authentication or physical-device/focus acceptance.', source: sh('git', ['rev-parse', 'HEAD']), dirty: sh('git', ['status', '--porcelain']) !== '', sourceFiles: hashInputs(), trials: {} };
const save = () => writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
let fixture, witness, udid, interrupted, failure;
const cleanupErrors = [];
const onSIGINT = () => { interrupted = 'SIGINT'; }, onSIGTERM = () => { interrupted = 'SIGTERM'; };
process.on('SIGINT', onSIGINT); process.on('SIGTERM', onSIGTERM);
const checkInterrupt = () => { if (interrupted) throw new Error(`Interrupted by ${interrupted}`); };
save(); console.log(`Evidence ${out}`);
try {
  sh('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(privateDir, 'key.pem'), '-out', join(out, 'certificate.pem'), '-days', '1', '-subj', '/CN=River Oaks disposable simulator', '-addext', 'subjectAltName=IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:TRUE'], { stdio: 'ignore' });
  const key = readFileSync(join(privateDir, 'key.pem')), cert = readFileSync(join(out, 'certificate.pem'));
  report.certificateSHA256 = digest(cert); save();
  sh('xcodegen', ['generate', '--spec', join(here, 'project.yml'), '--quiet']);
  const build = spawnSync('nice', ['-n', '19', 'xcodebuild', '-jobs', '1', '-project', join(here, 'BundledOrigin.xcodeproj'), '-scheme', 'BundledOrigin', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', join(root, '.runtime/ios-bundled-origin/build'), 'CODE_SIGNING_ALLOWED=NO', '-quiet', 'build'], { cwd: root, encoding: 'utf8' });
  writeFileSync(join(out, 'build.log'), `${build.stdout ?? ''}\n${build.stderr ?? ''}`); assert.equal(build.status, 0, 'Unsigned build failed; inspect retained build.log');
  assert.deepEqual(hashInputs(), report.sourceFiles, 'Source changed during build');
  const app = join(root, '.runtime/ios-bundled-origin/build/Build/Products/Debug-iphonesimulator/BundledOrigin.app');
  const files = (dir, prefix = '') => readdirSync(dir).flatMap(name => { const path = join(dir, name), relative = join(prefix, name), stat = lstatSync(path); assert.equal(stat.isSymbolicLink(), false); return stat.isDirectory() ? files(path, relative) : [{ path: relative, sha256: digest(readFileSync(path)) }]; });
  report.appFiles = files(app);
  assert.ok(readFileSync(join(app, 'harness.js')).equals(readFileSync(join(here, 'Web/harness.js'))));
  const type = JSON.parse(sim('list', 'devicetypes', '-j')).devicetypes.find(value => value.name === 'iPhone 17');
  const runtime = JSON.parse(sim('list', 'runtimes', '-j')).runtimes.filter(value => value.platform === 'iOS' && value.isAvailable && (value.supportedDeviceTypes ?? []).some(candidate => candidate.identifier === type?.identifier)).sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
  assert.ok(type && runtime); report.device = type.name; report.runtime = runtime.name;
  fixture = await startHTTPSFixture({ key, cert }); witness = await startWitness({ tls: { key, cert }, allowedOrigins: [fixture.origin, 'capacitor://localhost'] });
  report.api = fixture.origin; report.witness = witness.origin;
  udid = sim('create', `river-oaks-https-origin-${process.pid}`, type.identifier, runtime.identifier); report.simulator = udid; save();
  checkInterrupt(); sim('boot', udid); checkInterrupt(); sim('bootstatus', udid, '-b'); checkInterrupt(); sim('install', udid, app);
  const id = 'ai.typesafe.place.bundled-origin', container = sim('get_app_container', udid, id, 'data'), resultPath = join(container, 'Documents/results.json');
  for (const name of ['untrusted-hosted', 'trusted-hosted', 'trusted-bundled']) {
    checkInterrupt();
    if (name === 'trusted-hosted') { sim('keychain', udid, 'add-root-cert', join(out, 'certificate.pem')); report.trustScope = 'Generated certificate added only to owned disposable simulator; normal WebKit TLS validation, no challenge override'; save(); }
    const mode = name.endsWith('bundled') ? 'bundled' : 'hosted';
    rmSync(resultPath, { force: true }); const offset = fixture.records.length, witnessOffset = witness.records.length;
    const args = ['launch', udid, id, '--mode', mode, '--api', fixture.origin, '--witness', witness.origin, '--https-cookie-bootstrap'];
    if (mode === 'bundled') args.push('--play-dir', bundle);
    const launch = sim(...args), pid = Number(launch.match(/: (\d+)$/)?.[1]); assert.ok(pid > 0);
    let native, lastObservation = Date.now();
    while (!native) {
      checkInterrupt();
      if (existsSync(resultPath)) native = JSON.parse(readFileSync(resultPath, 'utf8'));
      else {
        const alive = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
        assert.ok(alive.status === 0 && alive.stdout.trim().endsWith('/BundledOrigin'), 'App exited before terminal result');
        if (Date.now() - lastObservation > 30000) { console.log(`${name}: still observing native PID ${pid}`); lastObservation = Date.now(); }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    report.trials[name] = { native, requests: fixture.records.slice(offset), witness: witness.records.slice(witnessOffset) }; save();
    sim('io', udid, 'screenshot', join(out, `${name}.png`)); sim('terminate', udid, id);
    console.log(`${name}: ${native.error ?? 'native result retained'}`);
    if (name === 'untrusted-hosted') { assert.equal(native.error, 'https-cookie-bootstrap-failed'); assert.equal(report.trials[name].requests.length, 0, 'Untrusted TLS must fail before any HTTP request'); assert.equal(report.trials[name].witness.length, 0); continue; }
    assert.equal(native.error, undefined); assert.equal(native.cookieSetup, 'https-network-bootstrap');
    assert.equal(native.measurementWorld, 'page'); assert.equal(native.resultTransport, 'native-poll'); assert.equal(native.registeredMessageHandlers, 0); assert.equal(native.navigationCount, 1);
    assert.equal(native.mode, mode); assert.equal(native.checks.page.href, mode === 'hosted' ? `${fixture.origin}/` : 'capacitor://localhost/index.html');
    const bootstrapRequests = report.trials[name].requests.filter(req => req.path === '/__host-cookie-bootstrap');
    assert.equal(bootstrapRequests.length, 1); assert.deepEqual(bootstrapRequests[0].cookieNames, [], 'Each trial must start with a fresh cookie store');
    assert.ok(native.cookieJar.some(cookie => cookie.name === 'fixture_session' && cookie.secure && cookie.httpOnly && cookie.sameSite.toLowerCase() === 'lax'));
    if (name === 'trusted-hosted') {
      assert.equal(native.checks['town.session.include'].body?.authenticated, true); assert.equal(native.checks['town.ticket.include'].issued, true); assert.equal(native.checks['town.socket'].open, true);
      assert.ok(report.trials[name].requests.some(req => req.upgrade === 'websocket' && req.origin === fixture.origin));
    } else {
      for (const key of ['town.session.include', 'town.ticket.include', 'town.socket']) assert.ok(native.checks[key] && typeof native.checks[key] === 'object', `Missing bundled observation ${key}`);
      assert.notEqual(native.checks['town.ticket.include'].issued, true); assert.notEqual(native.checks['town.socket'].open, true);
    }
  }
  assert.deepEqual(hashInputs(), report.sourceFiles, 'Source changed during trial');
  report.hostedTLSControlQualified = true;
  const bundled = report.trials['trusted-bundled'];
  report.bundledObservation = {
    pageTicket: bundled.native.checks['town.ticket.include'].issued === false ? 'not-issued' : 'unreadable',
    pageSocket: bundled.native.checks['town.socket'].error === 'no ticket, so no socket attempt' ? 'not-attempted' : 'did-not-open',
    townRequests: bundled.requests.filter(req => req.path.startsWith('/auth/') || req.path.startsWith('/api/') || req.path === '/multiplayer'),
    scope: 'Observed page results and server metadata only; an unreadable response alone does not prove cookie isolation or server denial',
  };
  report.scopeLimits = ['No real game assets or decoders', 'No module worker trial here', 'No actual Capacitor SDK', 'No production authentication or physical-device/focus proof'];
} catch (error) { failure = error; report.failure = String(error.message); }
finally {
  try { rmSync(privateDir, { recursive: true, force: true }); } catch (error) { cleanupErrors.push({ operation: "private-key-remove", message: String(error.message) }); }
  report.privateKeyRemoved = !existsSync(privateDir);
  if (udid) for (const operation of ['shutdown', 'delete']) { try { sim(operation, udid); } catch (error) { cleanupErrors.push({ operation, message: String(error.message) }); } }
  for (const [name, service] of [['fixture', fixture], ['witness', witness]]) { try { await service?.close(); } catch (error) { cleanupErrors.push({ operation: `${name}-close`, message: String(error.message) }); } }
  report.cleanupErrors = cleanupErrors;
  if (udid) { try { report.simulatorAbsent = !Object.values(JSON.parse(sim('list', 'devices', '-j')).devices).flat().some(device => device.udid === udid); } catch { report.simulatorAbsent = false; } }
  if (interrupted) { report.interrupted = interrupted; failure ??= new Error(`Interrupted by ${interrupted}`); }
  save(); process.off('SIGINT', onSIGINT); process.off('SIGTERM', onSIGTERM);
}
console.log(`Final evidence ${join(out, 'report.json')}`);
if (failure) throw failure;
assert.equal(cleanupErrors.length, 0); assert.equal(report.simulatorAbsent, true); assert.equal(report.privateKeyRemoved, true);
