import test from 'node:test';
import assert from 'node:assert/strict';
import { validTownSnapshot } from '../src/town-snapshot.js';
const snapshot = () => ({ type: 'snapshot', selfId: 'resident', players: [{ id: 'resident', position: [1, 2, 0], yaw: 0, altitude: 0 }], locals: [], community: { scenarioKey: "heatwave", status: "ready", running: false, elapsed: 0, target: 6, supported: 0, unmet: 0, supplies: 12, helpBudget: 4, jobs: [], events: [] }, wishes: { events: [] } });
test('town admission requires a complete self pose and shared snapshot', () => {
  assert.equal(validTownSnapshot(snapshot()), true);
  for (const change of [{ players: [] }, { players: null }, { locals: null }, { community: null }, { wishes: null }, { selfId: 'absent' }, { players: [{ id: 'resident', position: [NaN, 0, 0], yaw: 0 }] }]) {
    assert.equal(validTownSnapshot({ ...snapshot(), ...change }), false, JSON.stringify(change));
  }
});
test('subsequent snapshots can retain the admitted identity but cannot admit an unknown one', () => {
  const update = snapshot();delete update.selfId;
  assert.equal(validTownSnapshot(update), false);
  assert.equal(validTownSnapshot(update, 'resident'), true);
});

test('missing altitude or community data cannot unlock gameplay', () => {
  const missingAltitude = snapshot();delete missingAltitude.players[0].altitude;
  assert.equal(validTownSnapshot(missingAltitude), false);
  for (const community of [{}, { ...snapshot().community, scenarioKey: 'unknown' }, { ...snapshot().community, jobs: null }, { ...snapshot().community, events: null }]) {
    assert.equal(validTownSnapshot({ ...snapshot(), community }), false);
  }
});
