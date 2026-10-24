import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as evidence from '../character-fidelity-evidence.mjs';

test('provenance includes untracked inputs and changes when their bytes change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fidelity-evidence-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    await writeFile(join(root, 'harness.js'), 'first');
    const first = await evidence.captureProvenance(root);
    assert.equal(first.dirty, true);
    assert.ok(first.files.some(file => file.path === 'harness.js'));
    await writeFile(join(root, 'harness.js'), 'second');
    const second = await evidence.captureProvenance(root);
    assert.notEqual(first.sha256, second.sha256);
    assert.notEqual(first.files[0].sha256, second.files[0].sha256);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('a retained texture or geometry fails lifecycle acceptance', () => {
  for (const resource of ['textures', 'geometries', 'programs']) {
    const before = {textures: 4, geometries: 2, programs: 1};
    const after = {...before, [resource]: before[resource] + 1};
    assert.throws(() => evidence.assertLifecycle({count: 10, before, after}), /Lifecycle growth/);
  }
  assert.doesNotThrow(() => evidence.assertLifecycle({count: 10, before: {textures: 4, geometries: 2, programs: 1}, after: {textures: 4, geometries: 2, programs: 1}}));
});

test('missing or invalid lifecycle measurements cannot pass', () => {
  for (const result of [{}, {count: 0}, {count: 10, before: {}, after: {}}]) assert.throws(() => evidence.assertLifecycle(result));
});

test('omitted timing is unmeasured, and failed timing comparisons are not hidden', () => {
  assert.equal(evidence.timingAgreement([]), null);
  assert.equal(evidence.timingAgreement([{check: 'census', passed: true}]), null);
  assert.equal(evidence.timingAgreement([{timing: true, agrees: true}]), true);
  assert.equal(evidence.timingAgreement([{timing: true, agrees: true}, {timing: true, agrees: false}]), false);
});

test('host conditions read GPU utilization and count only foreign automation browsers', () => {
  assert.equal(evidence.parseGpuUtilization('"PerformanceStatistics" = {"Tiler Utilization %"=25,"Device Utilization %"=50}'), 50);
  assert.equal(evidence.parseGpuUtilization('no accelerator'), null);
  const table = [
    '  100     1 /Users/x/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-mac/chrome-headless-shell',
    '  101   100 /Users/x/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-mac/chrome-headless-shell',
    '  102   101 /Users/x/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-mac/chrome-headless-shell',
    '  200     1 /Users/x/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-mac/chrome-headless-shell',
    '  300     1 /Applications/Dia.app/Contents/Frameworks/Browser Helper (Renderer).app/Contents/MacOS/Browser Helper (Renderer)',
  ].join('\n');
  assert.equal(evidence.foreignBrowserProcesses(table, 100), 1);
  assert.equal(evidence.foreignBrowserProcesses(table, undefined), 4);
});

test('a quiet host needs every limited reading present and within its limit', () => {
  const limits = evidence.parseQuietLimits('gpu=10,load=8,browsers=0');
  assert.deepEqual(limits, {gpu: 10, load: 8, browsers: 0});
  assert.throws(() => evidence.parseQuietLimits('gpu=ten'), /Invalid --quiet/);
  assert.throws(() => evidence.parseQuietLimits('thermal=1'), /Invalid --quiet/);
  const quiet = {loadavg: [4, 4, 4], gpuUtilization: 5, foreignBrowsers: 0};
  assert.equal(evidence.isQuiet(quiet, limits), true);
  assert.equal(evidence.isQuiet({...quiet, gpuUtilization: 38}, limits), false);
  assert.equal(evidence.isQuiet({...quiet, gpuUtilization: null}, limits), false);
  assert.equal(evidence.isQuiet({...quiet, loadavg: [11, 4, 4]}, limits), false);
  assert.equal(evidence.isQuiet({...quiet, foreignBrowsers: 9}, limits), false);
  assert.equal(evidence.isQuiet(quiet, null), false);
});

test('controlled agreement counts only quiet pairs and keeps every disagreement visible', () => {
  const checks = [{check: 'census', passed: true}, {timing: true, agrees: true, controlled: true},
    {timing: true, agrees: false, controlled: false}, {timing: true, agrees: false, controlled: true}];
  assert.deepEqual(evidence.controlledAgreement(checks), {pairs: 3, agree: 1, controlledPairs: 2, controlledAgree: 1, controlledAgrees: false});
  assert.equal(evidence.controlledAgreement([{timing: true, agrees: true}]).controlledAgrees, null);
  assert.equal(evidence.timingAgreement(checks), false);
});
