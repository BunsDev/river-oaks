import assert from 'node:assert/strict';
import test from 'node:test';
import { cpus } from 'node:os';
import { SOFTWARE_RENDERER, captureProvenance } from '../e2e/garden-campus-render-common.mjs';
import { EVIDENCE_CLASSES, MATCHED_CONDITIONS, comparisonMismatches, gardensCameras, validateProvenance, validateReport, viewName } from '../e2e/pink-jet-age-routes-plan.mjs';

// A browser and a ready page as the runner sees them: the version string and the render audit.
const fakeBrowser = { version: () => 'Chromium/151.0.7922.34' };
const fakePage = renderer => ({ evaluate: async () => ({ renderer, buffer: [1280, 800], quality: { mode: 'sharp', scale: 1 } }) });
const workload = { players: 1, clients: 1, movement: 'none: fixed cameras', interface: 'hidden', residents: 'moving' };

test('captureProvenance records the browser, the GPU the page drew with, this machine and the workload', async () => {
  const provenance = await captureProvenance(fakeBrowser, fakePage('ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)'), workload);
  assert.equal(validateProvenance(provenance), provenance);
  assert.equal(provenance.browser, 'Chromium/151.0.7922.34');
  assert.equal(provenance.gpu.software, false);
  assert.deepEqual(provenance.gpu.buffer, [1280, 800]);
  assert.equal(provenance.machine.cpu, cpus()[0]?.model ?? 'unknown');
  assert.ok(provenance.machine.logicalCpus >= 1 && provenance.machine.memoryGiB >= 1);
  assert.equal(provenance.quality.mode, 'sharp');
  assert.deepEqual(provenance.workload, workload);
  assert.equal(provenance.evidenceClass, 'local-fixture');
  // A software fallback is named, never silently compared against a GPU capture.
  const software = await captureProvenance(fakeBrowser, fakePage('Google SwiftShader'), workload);
  assert.equal(software.gpu.software, true);
  assert.ok(SOFTWARE_RENDERER.test('llvmpipe (LLVM 17.0.6, 256 bits)'));
});

test('validateProvenance refuses a capture missing its browser, GPU, machine, workload or evidence class', async () => {
  const good = await captureProvenance(fakeBrowser, fakePage('Apple M5 Max'), workload);
  assert.throws(() => validateProvenance({ ...good, browser: '' }), /browser/);
  assert.throws(() => validateProvenance({ ...good, gpu: {} }), /gpu\.renderer/);
  assert.throws(() => validateProvenance({ ...good, machine: { ...good.machine, cpu: null } }), /machine\.cpu/);
  assert.throws(() => validateProvenance({ ...good, workload: { players: 0 } }), /players/);
  assert.throws(() => validateProvenance({ ...good, evidenceClass: 'concept-image' }), /evidenceClass/);
  assert.deepEqual(EVIDENCE_CLASSES, ['source-implementation', 'local-fixture', 'hosted', 'packaged-native', 'physical-device', 'human-accessibility', 'visual-approval']);
});

const report = (overrides = {}) => {
  const cameras = gardensCameras().slice(0, 1), hours = { day: 15 };
  const views = cameras.map(camera => ({ name: viewName(camera, 'day'), route: camera.route, camera: camera.id, hour: 15, calls: 400, triangles: 1e6, frameP50: 16.7, frameP95: 18, png: `${viewName(camera, 'day')}.png`, image: { mean: 100, spread: 40, verdict: 'ok' } }));
  const provenance = { browser: 'Chromium/151.0.7922.34', gpu: { renderer: 'Apple M5 Max', software: false }, machine: { platform: 'darwin', arch: 'arm64', cpu: 'Apple M5 Max' }, workload: { players: 1 }, evidenceClass: 'local-fixture' };
  return { status: 'passed', head: 'abc', revision: 'east-garden-commons-market-1', graphics: 'sharp', finish: 'classic', viewport: [1280, 800], deviceScaleFactor: 1, hours, cameras, views, provenance, ...overrides };
};

test('a report carries its provenance through validation, and a malformed one is refused', () => {
  const good = report();
  assert.equal(validateReport(good), good);
  assert.throws(() => validateReport(report({ provenance: { ...good.provenance, browser: '' } })), /provenance\.browser/);
  // The 2026-10-28 baseline predates provenance; its report still validates.
  const { provenance, ...legacy } = good;
  assert.equal(validateReport(legacy), legacy);
});

test('two arms on one machine compare; a different device, browser, workload or missing provenance is named', () => {
  const classic = report(), pink = report({ finish: 'pink-jet-age', head: 'def' });
  assert.deepEqual(comparisonMismatches(classic, pink), [], 'finish and head are the arms, not conditions');
  assert.deepEqual(comparisonMismatches(classic, report({ graphics: 'smooth' })), ['graphics: "sharp" -> "smooth"']);
  const phone = report({ provenance: { ...classic.provenance, gpu: { renderer: 'Apple A19 GPU' }, machine: { platform: 'ios', arch: 'arm64', cpu: 'Apple A19' }, evidenceClass: 'physical-device' } });
  assert.deepEqual(comparisonMismatches(classic, phone), [
    'provenance.gpu.renderer: "Apple M5 Max" -> "Apple A19 GPU"', 'provenance.machine.platform: "darwin" -> "ios"', 'provenance.machine.cpu: "Apple M5 Max" -> "Apple A19"',
    'provenance.evidenceClass: "local-fixture" -> "physical-device"']);
  assert.deepEqual(comparisonMismatches(classic, report({ provenance: { ...classic.provenance, workload: { players: 2 } } })), ['provenance.workload.players: 1 -> 2']);
  const { provenance, ...legacy } = classic;
  const mismatches = comparisonMismatches(legacy, classic);
  assert.equal(mismatches.length, MATCHED_CONDITIONS.filter(key => key.startsWith('provenance.')).length);
  assert.ok(mismatches.every(line => line.includes(': null -> ')), mismatches.join('\n'));
  assert.deepEqual(comparisonMismatches(classic, report({ hours: { day: 15, dusk: 18.5 } })), ['hours: {"day":15} -> {"day":15,"dusk":18.5}']);
});
