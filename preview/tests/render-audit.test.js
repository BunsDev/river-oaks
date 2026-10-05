import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderAudit } from '../src/render-audit.js';
import { distribution, auditOptions, gestureWait } from '../audit/metrics.js';

test('frame audit resets between tiers and signals overflow rather than omitting slow frames silently', () => {
  const audit = createRenderAudit({ limit: 2 });
  audit.frame(1, 99);
  audit.start(); audit.frame(100, 1); audit.frame(116, 3); audit.frame(500, 8); audit.frame(516, 2);
  assert.deepEqual(audit.stop(), { frames: [{ intervalMs: 16, cpuMs: 3 }, { intervalMs: 384, cpuMs: 8 }], overflow: true });
  audit.frame(999, 999);
  audit.start(); audit.frame(1000, 2); audit.frame(1017, 4);
  assert.deepEqual(audit.stop(), { frames: [{ intervalMs: 17, cpuMs: 4 }], overflow: false });
});

test('capacity timing rejects empty/invalid evidence and retains tail stalls', () => {
  assert.throws(() => distribution([])); assert.throws(() => distribution([1, NaN])); assert.throws(() => distribution([-1]));
  const samples = [...Array(99).fill(16), 800];
  assert.deepEqual(distribution(samples), { count: 100, p50Ms: 16, p95Ms: 16, p99Ms: 16, maxMs: 800 });
  assert.equal(samples.at(-1), 800);
});

test('capacity options refuse ambiguous runs, excessive duration and invalid player tiers', () => {
  assert.deepEqual(auditOptions([]).players, [1, 8, 16, 32]);
  assert.equal(auditOptions(['--seconds=600', '--quality=auto']).quality, 'auto');
  for (const args of [['--seconds=601'], ['--seconds=4'], ['--warmup=0'], ['--players=32,8'], ['--players=33'], ['--players=8,8'], ['--quality=fast'], ['--seconds=5', '--seconds=6'], ['--unknown=x']])
    assert.throws(() => auditOptions(args));
});

test('sample deadline cannot trigger a final gesture before its cooldown, even if a fractional timer wakes early', () => {
  assert.deepEqual(gestureWait(1800), { delayMs: 1700, finish: false });
  assert.deepEqual(gestureWait(1699.6), { delayMs: 1700, finish: true });
  assert.deepEqual(gestureWait(20.2), { delayMs: 21, finish: true });
  assert.deepEqual(gestureWait(-4), { delayMs: 1, finish: true });
});
