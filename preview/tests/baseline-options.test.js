import assert from 'node:assert/strict';
import test from 'node:test';
import { baselineOptions, frameSummary, phaseSummary, reconnectSummary } from '../audit/baseline-options.js';

test('baseline options default to the expansion protocol', () => {
  assert.deepEqual(baselineOptions([]), { seconds: 30, samples: 3, vsync: 'on', profiles: ['desktop', 'phone-viewport'], cpuProfile: 'off', label: '', reconnects: 5, reconnectBackoff: 'keep' });
  assert.deepEqual(baselineOptions(['--vsync=off', '--profiles=desktop', '--samples=5', '--label=main-a1', '--cpu-profile=on']),
    { seconds: 30, samples: 5, vsync: 'off', profiles: ['desktop'], cpuProfile: 'on', label: 'main-a1', reconnects: 5, reconnectBackoff: 'keep' });
});

test('the reconnect count and the client backoff are options', () => {
  const options = baselineOptions(['--reconnects=1', '--reconnect-backoff=skip']);
  assert.deepEqual([options.reconnects, options.reconnectBackoff], [1, 'skip']);
  assert.deepEqual([baselineOptions(['--reconnects=9']).reconnectBackoff, baselineOptions(['--reconnect-backoff=keep']).reconnects], ['keep', 5]);
});

test('the profile environment variable sets the default and --profiles overrides it', () => {
  assert.deepEqual(baselineOptions([], { RIVER_OAKS_BASELINE_PROFILES: 'desktop' }).profiles, ['desktop']);
  assert.deepEqual(baselineOptions(['--profiles=phone-viewport'], { RIVER_OAKS_BASELINE_PROFILES: 'desktop' }).profiles, ['phone-viewport']);
  assert.throws(() => baselineOptions([], { RIVER_OAKS_BASELINE_PROFILES: 'tablet' }), /Use seconds/);
});

test('baseline options reject unknown, duplicate and out-of-range values', () => {
  for (const args of [['--vsync=maybe'], ['--samples=0'], ['--seconds=4'], ['--profiles=tablet'], ['--label=Bad Label'], ['--seconds=30', '--seconds=31'], ['--fps=60'],
    ['--reconnects=0'], ['--reconnects=10'], ['--reconnects=2.5'], ['--reconnect-backoff=fast'], ['--reconnects=3', '--reconnects=5']])
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

test('reconnect summary keeps one sample as recorded and takes a true median of several', () => {
  const still = n => Array(n).fill([10, 20, 0]);
  assert.equal(reconnectSummary([812.3456], still(1), still(1)).reconnectMs, 812.3456);
  assert.equal(reconnectSummary([900, 700, 1100, 650, 1000], still(5), still(5)).reconnectMs, 900);
  assert.equal(reconnectSummary([700, 900, 650, 1000], still(4), still(4)).reconnectMs, 800);
  assert.throws(() => reconnectSummary([], [], []), /reconnect samples/);
  assert.throws(() => reconnectSummary([700, 900], still(1), still(2)), /reconnect samples/);
});

test('reconnect summary checks drift per rejoin and across all of them', () => {
  // Each rejoin moves the player 0.2 m east; no single move reaches 0.5 m, the total does.
  const starts = [[0, 0, 0], [0.2, 0, 0], [0.4, 0, 0]], ends = [[0.2, 0, 0], [0.4, 0, 0], [0.6, 0, 0]];
  const summary = reconnectSummary([700, 800, 900], starts, ends);
  assert.equal(Math.round(summary.reconnectPositionDeltaM * 100) / 100, 0.2);
  assert.equal(Math.round(summary.reconnectTotalDeltaM * 100) / 100, 0.6);
});
