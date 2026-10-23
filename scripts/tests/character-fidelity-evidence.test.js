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
