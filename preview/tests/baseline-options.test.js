import assert from 'node:assert/strict';
import test from 'node:test';
import { baselineOptions, frameSummary, phaseSummary } from '../audit/baseline-options.js';

test('baseline options default to the Phase 1 protocol', () => {
  assert.deepEqual(baselineOptions([]), { seconds: 30, samples: 3, vsync: 'on', profiles: ['desktop', 'phone-viewport'], cpuProfile: 'off', label: '' });
  assert.deepEqual(baselineOptions(['--vsync=off', '--profiles=desktop', '--samples=5', '--label=main-a1', '--cpu-profile=on']),
    { seconds: 30, samples: 5, vsync: 'off', profiles: ['desktop'], cpuProfile: 'on', label: 'main-a1' });
});

test('the profile environment variable sets the default and --profiles overrides it', () => {
  assert.deepEqual(baselineOptions([], { RIVER_OAKS_BASELINE_PROFILES: 'desktop' }).profiles, ['desktop']);
  assert.deepEqual(baselineOptions(['--profiles=phone-viewport'], { RIVER_OAKS_BASELINE_PROFILES: 'desktop' }).profiles, ['phone-viewport']);
  assert.throws(() => baselineOptions([], { RIVER_OAKS_BASELINE_PROFILES: 'tablet' }), /Use seconds/);
});

test('baseline options reject unknown, duplicate and out-of-range values', () => {
  for (const args of [['--vsync=maybe'], ['--samples=0'], ['--seconds=4'], ['--profiles=tablet'], ['--label=Bad Label'], ['--seconds=30', '--seconds=31'], ['--fps=60']])
    assert.throws(() => baselineOptions(args), /Invalid or duplicate option|Use seconds/, args.join(' '));
});

test('frame summary separates a vsync step from a continuous slowdown', () => {
  const refresh = 1000 / 60;
  // 94 frames at two refreshes and 6 at three: p95 reads 50 ms, the mean barely moves.
  const stepped = frameSummary([...Array(94).fill({ intervalMs: refresh * 2 }), ...Array(6).fill({ intervalMs: refresh * 3 })]);
  assert.equal(stepped.count, 100);
  assert.equal(stepped.meanMs, 34.33);
  assert.equal(stepped.missedOneRefresh, 1);
  assert.equal(stepped.missedTwoRefreshes, .06);
  const smooth = frameSummary(Array(60).fill({ intervalMs: refresh }));
  assert.equal(smooth.missedOneRefresh, 0);
  assert.equal(smooth.fps, 60);
  assert.throws(() => frameSummary([]), /Missing frame samples/);
});

test('phase summary treats a phase absent from a frame as zero time', () => {
  const phases = phaseSummary([{ phasesMs: { players: 2, trees: 1 } }, { phasesMs: { players: 4 } }, {}]);
  assert.deepEqual(Object.keys(phases), ['players', 'trees']);
  assert.equal(phases.players.meanMs, 2);
  assert.equal(phases.trees.p50Ms, 0);
  assert.equal(phases.trees.p95Ms, 1);
});
