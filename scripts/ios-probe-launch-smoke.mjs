#!/usr/bin/env node
// Unsigned simulator launch regression for the existing diagnostic probe.
// A successful simctl launch request is not proof that the app stayed alive.
// Uses its own disposable simulator; no signing, identities or auth bypass.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (!['--app', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Use --app <unsigned simulator app> [--output <new evidence directory>]');
  const key = args[i].slice(2);
  if (options[key]) throw new Error(`Duplicate option ${args[i]}`);
  options[key] = args[++i];
}
if (!options.app) throw new Error('--app is required');
const app = resolve(options.app);
if (!existsSync(join(app, 'TypeSafeProbe'))) throw new Error('No TypeSafeProbe executable at --app');
const out = resolve(options.output ?? join(root, '.runtime', `probe-launch-${Date.now()}`));
if (existsSync(out)) throw new Error('Evidence directory already exists; preserve the prior run and choose another output');
mkdirSync(out, { recursive: true });
const sh = (bin, params) => execFileSync(bin, params, { encoding: 'utf8' }).trim();
const sim = (...params) => sh('xcrun', ['simctl', ...params]);
const type = JSON.parse(sim('list', 'devicetypes', '-j')).devicetypes.find(value => value.name === 'iPhone 17');
const runtime = JSON.parse(sim('list', 'runtimes', '-j')).runtimes
  .filter(value => value.platform === 'iOS' && value.isAvailable && (value.supportedDeviceTypes ?? []).some(candidate => candidate.identifier === type?.identifier))
  .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
if (!type || !runtime) throw new Error('No installed iPhone 17-compatible iOS simulator runtime');
const metadata = Object.fromEntries(['ProbeConfiguration', 'ProbeSourceSHA', 'ProbeSourceDirty', 'ProbeEntry'].map(key => [key, sh('plutil', ['-extract', key, 'raw', '-o', '-', join(app, 'Info.plist')])]));
writeFileSync(join(out, 'app-metadata.json'), JSON.stringify(metadata, null, 2));
const udid = sim('create', `river-oaks-probe-launch-${process.pid}`, type.identifier, runtime.identifier);
writeFileSync(join(out, 'device.json'), JSON.stringify({ udid, runtime: runtime.name, runtimeIdentifier: runtime.identifier, runtimeBuild: runtime.buildversion, device: type.name, deviceTypeIdentifier: type.identifier, app }, null, 2));
console.log(`Created owned simulator ${udid} (${runtime.name})`);
let primaryError;
const cleanupErrors = [];
try {
  sim('boot', udid);
  // Keep observing this process through the tool handle; do not infer boot
  // failure from an outer observation timeout or create a replacement device.
  sim('bootstatus', udid, '-b');
  sim('install', udid, app);
  const launch = spawnSync('xcrun', ['simctl', 'launch', udid, 'ai.typesafe.place.ios-probe', '--probe-native-only'], { encoding: 'utf8' });
  writeFileSync(join(out, 'launch.json'), JSON.stringify({ status: launch.status, signal: launch.signal, stdout: launch.stdout, stderr: launch.stderr }, null, 2));
  const pid = Number(launch.stdout?.match(/ios-probe: (\d+)/)?.[1]);
  await new Promise(resolve => setTimeout(resolve, 10000));
  const processState = Number.isInteger(pid) && pid > 0 ? spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' }) : null;
  const alive = processState?.status === 0 && processState.stdout.trim().endsWith('/TypeSafeProbe');
  sim('io', udid, 'screenshot', join(out, 'screen.png'));
  const logs = spawnSync('xcrun', ['simctl', 'spawn', udid, 'log', 'show', '--last', '2m', '--style', 'compact', '--predicate', 'process == "TypeSafeProbe" AND eventMessage CONTAINS "UIScene"'], { encoding: 'utf8' });
  writeFileSync(join(out, 'scene-lifecycle.log'), logs.stdout ?? '');
  const sceneFailure = (logs.stdout ?? '').includes('UIScene life cycle is required');
  const evidence = { scope: 'Simulator launch of diagnostic probe, native-only measurement mode; no physical or production-host acceptance', appMetadata: metadata, launchStatus: launch.status, aliveAfter10Seconds: alive, sceneFailure, sceneLogStatus: logs.status, runtime: runtime.name, runtimeIdentifier: runtime.identifier, runtimeBuild: runtime.buildversion, device: type.name, deviceTypeIdentifier: type.identifier };
  writeFileSync(join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  if (launch.status !== 0 || !alive || sceneFailure || logs.status !== 0) throw new Error('Probe launch regression: app did not remain alive without a scene-lifecycle failure');
  sim('launch', udid, 'com.apple.Preferences');
  await new Promise(resolve => setTimeout(resolve, 2000));
  const resumed = sim('launch', udid, 'ai.typesafe.place.ios-probe', '--probe-native-only');
  await new Promise(resolve => setTimeout(resolve, 2000));
  const container = sim('get_app_container', udid, 'ai.typesafe.place.ios-probe', 'data');
  const documents = join(container, 'Documents');
  const recordings = readdirSync(documents).filter(name => /^probe-.*\.jsonl$/.test(name));
  const raw = join(out, 'recordings');
  mkdirSync(raw);
  for (const name of recordings) writeFileSync(join(raw, name), readFileSync(join(documents, name)));
  const events = recordings.flatMap(name => readFileSync(join(documents, name), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line).event));
  const lifecycle = { sameProcessAfterForeground: resumed.endsWith(`: ${pid}`), recordingCount: recordings.length,
    backgroundRecorded: events.includes('UIApplicationDidEnterBackgroundNotification'), foregroundRecorded: events.includes('UIApplicationWillEnterForegroundNotification'),
    focusScope: 'Keyboard, VoiceOver and first-responder restoration were not measured', events };
  writeFileSync(join(out, 'lifecycle.json'), JSON.stringify(lifecycle, null, 2));
  sim('io', udid, 'screenshot', join(out, 'after-foreground.png'));
  console.log(JSON.stringify(lifecycle));
  if (!lifecycle.sameProcessAfterForeground || lifecycle.recordingCount !== 1 || !lifecycle.backgroundRecorded || !lifecycle.foregroundRecorded) throw new Error('Probe lifecycle regression: same-process background/foreground recording did not survive');
} catch (error) {
  primaryError = error;
} finally {
  for (const operation of ['shutdown', 'delete']) {
    try { sim(operation, udid); } catch (error) { cleanupErrors.push({ operation, message: String(error.message) }); }
  }
  writeFileSync(join(out, 'cleanup.json'), JSON.stringify({ udid, errors: cleanupErrors }, null, 2));
  if (!cleanupErrors.length) console.log(`Removed owned simulator ${udid}`);
}
if (primaryError) throw primaryError;
if (cleanupErrors.length) throw new Error('Simulator cleanup incomplete; inspect cleanup.json and the same simulator before further work');
