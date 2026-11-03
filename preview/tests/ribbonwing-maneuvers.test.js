import test from 'node:test';
import assert from 'node:assert/strict';
import { observeServerTime, serverNow, resetServerClock } from '../src/server-clock.js';
import { maneuverPose, validManeuver } from '../src/ribbonwing-maneuvers.js';

// Observers replay a maneuver from the town's start time (#777), so the page's
// estimate of the town clock decides whether everyone sees the same moment.
test('the town clock estimate takes the least-delayed snapshot and ignores junk', () => {
  resetServerClock();
  // Server ahead by 5 s; snapshots arrive 40 ms, 300 ms and 15 ms late.
  observeServerTime(10_000, 5_040);observeServerTime(20_000, 15_300);observeServerTime(30_000, 25_015);
  for (const junk of [NaN, Infinity, '30000', null, undefined]) observeServerTime(junk, 0);
  assert.equal(serverNow(40_000), 44_985);
  resetServerClock();assert.equal(serverNow(1), 1);
});

test('clients act only on well-formed published maneuvers', () => {
  const m = { id: 'm1', seq: 1, kind: 'loop', heading: 0, origin: [0, 0], altitude: 6, startedAt: 1000, duration: 4400 };
  assert.equal(validManeuver(m), true);
  for (const bad of [null, 'loop', { ...m, kind: 'barrel' }, { ...m, origin: [0] }, { ...m, origin: [0, NaN] }, { ...m, altitude: -1 }, { ...m, startedAt: Infinity }, { ...m, id: 3 }])
    assert.equal(validManeuver(bad), false, JSON.stringify(bad));
  // Replaying before the start holds the entry pose; after the end holds the exit, level.
  assert.deepEqual([maneuverPose(m, 0).t, maneuverPose(m, 0).east], [0, 0]);
  const end = maneuverPose(m, 99_999);
  assert.equal(end.done, true);assert.ok(Math.abs(end.east - 6) < 1e-9 && Math.abs(end.altitude - 6) < 1e-9 && Math.abs(Math.cos(end.pitch) - 1) < 1e-3);
});
