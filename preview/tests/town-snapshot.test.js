import test from 'node:test';
import assert from 'node:assert/strict';
import { validTownSnapshot } from '../src/town-snapshot.js';
const snapshot = () => ({ type: 'snapshot', selfId: 'resident', players: [{ id: 'resident', position: [1, 2, 0], yaw: 0, altitude: 0, buildingId: null, levelId: null }], locals: [], community: { scenarioKey: "heatwave", status: "ready", running: false, elapsed: 0, target: 6, supported: 0, unmet: 0, supplies: 12, helpBudget: 4, jobs: [], events: [] }, wishes: { events: [] } });
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

test('level occupancy is explicit and paired in protocol snapshots', () => {
  const valid = snapshot();
  valid.players[0].buildingId = 'gallery'; valid.players[0].levelId = 'gallery/l1';
  assert.equal(validTownSnapshot(valid), true);
  for (const changes of [{ levelId: null }, { buildingId: null }, { levelId: 'other/l1' }, { levelId: undefined }]) {
    const invalid = snapshot(); Object.assign(invalid.players[0], { buildingId: 'gallery', levelId: 'gallery/l1' }, changes);
    assert.equal(validTownSnapshot(invalid), false);
  }
});

test('world rules are optional for older towns but exact when present (#596)', async () => {
  const { defaultWorldPolicy } = await import('../src/world-policy.js');
  const rules = (change = {}) => ({ ...defaultWorldPolicy(), minute: 720, active: false, ...change });
  assert.equal(validTownSnapshot({ ...snapshot(), worldPolicy: rules() }), true);
  const forced = { ...defaultWorldPolicy(), violence: { ...defaultWorldPolicy().violence, mode: 'forced', zones: ['westcreek-lane'] } };
  assert.equal(validTownSnapshot({ ...snapshot(), worldPolicy: { ...forced, minute: 720, active: true } }), true);
  for (const worldPolicy of [null, [], rules({ minute: 721 }), rules({ active: true }), { ...forced, minute: 720, active: false },
    rules({ violence: { ...defaultWorldPolicy().violence, mode: 'riot' } }), rules({ extra: 1 }), rules({ violence: { ...defaultWorldPolicy().violence, zones: ['plaza'] } })])
    assert.equal(validTownSnapshot({ ...snapshot(), worldPolicy }), false, JSON.stringify(worldPolicy));
  assert.equal(validTownSnapshot({ ...snapshot(), worldId: 'garden-2', worldPolicy: { ...forced, minute: 720, active: true } }), false, 'zones are checked against the snapshot world');
});

test('crime state is optional for older towns but exact when present (#597)', () => {
  const rival = (change = {}) => ({ id: 'rival:westcreek', name: 'Westcreek rival', appearance: 'sable-human', position: [-2908, -1320, 17.8], yaw: 0, health: 75, maxHealth: 100, incapacitated: false, staggered: true, ...change });
  const crime = (change = {}) => ({ targets: [rival()], wanted: [['resident', 2]], ...change });
  assert.equal(validTownSnapshot({ ...snapshot(), crime: crime() }), true);
  assert.equal(validTownSnapshot({ ...snapshot(), crime: crime({ targets: [rival({ health: 0, incapacitated: true })], wanted: [] }) }), true);
  for (const bad of [null, [], {}, crime({ targets: null }), crime({ wanted: [['resident', 6]] }), crime({ wanted: [['resident', 0]] }), crime({ wanted: [['resident', 1.5]] }),
    crime({ targets: [rival({ health: 101 })] }), crime({ targets: [rival({ health: -1 })] }), crime({ targets: [rival({ incapacitated: true })] }),
    crime({ targets: [rival({ position: [0, 0] })] }), crime({ targets: [rival({ staggered: 'yes' })] })])
    assert.equal(validTownSnapshot({ ...snapshot(), crime: bad }), false, JSON.stringify(bad));
});

test('timed crime actions are optional for older towns but exact when present (#640)', () => {
  const rival = (change = {}) => ({ id: 'rival:westcreek', name: 'Westcreek rival', appearance: 'sable-human', position: [-2908, -1320, 17.8], yaw: 0, health: 75, maxHealth: 100, incapacitated: false, staggered: true, engagedId: 'resident', ...change });
  const action = (change = {}) => ({ id: 'strike:3', kind: 'strike', actorId: 'resident', targetId: 'rival:westcreek', phase: 'windup', remainingMs: 300, outcome: null, reason: null, direction: [-1, 0], ...change });
  const crime = actions => ({ targets: [rival()], wanted: [['resident', 2]], actions });
  const hit = action({ phase: 'contact', remainingMs: 120, outcome: 'hit', effect: { damage: 25, health: 75, incapacitated: false, stars: 2 } });
  const counter = action({ id: 'counter:4', kind: 'counter', actorId: 'rival:westcreek', targetId: 'resident', phase: 'recovery', remainingMs: 500, outcome: 'hit', direction: [1, 0], effect: { damage: 20, health: 80, down: false } });
  for (const good of [[], [action()], [hit], [counter], [action({ phase: 'done', remainingMs: 0, outcome: 'cancelled', reason: 'violence_off' })], [action({ phase: 'recovery', outcome: 'evaded', remainingMs: 10 })]])
    assert.equal(validTownSnapshot({ ...snapshot(), crime: crime(good) }), true, JSON.stringify(good));
  assert.equal(validTownSnapshot({ ...snapshot(), crime: { targets: [rival({ engagedId: null })], wanted: [] } }), true, 'actions may be absent');
  for (const bad of [null, {}, [action({ phase: 'lunge' })], [action({ kind: 'kick' })], [action({ outcome: 'exploded' })], [action({ direction: [3, 4] })], [action({ direction: [1] })],
    [action({ remainingMs: -1 })], [action({ remainingMs: 1.5 })], [action({ reason: 42 })], [action({ outcome: 'hit' })], [action({ effect: { damage: 25 } })],
    [action({ outcome: 'hit', effect: { damage: 25, health: 75, incapacitated: false, stars: 9 } })], [action({ id: '' })], [action({ actorId: 7 })], [action(), action()],
    [action({ phase: 'done', outcome: null })]])
    assert.equal(validTownSnapshot({ ...snapshot(), crime: crime(bad) }), false, JSON.stringify(bad));
  assert.equal(validTownSnapshot({ ...snapshot(), crime: { targets: [rival({ engagedId: 5 })], wanted: [] } }), false);
});

test('police snapshots reject malformed units, over-cap responses and inconsistent capture state', () => {
  const unit = { id: 'police:0', position: [1, 2, 0], yaw: 0, state: 'pursue', targetId: 'resident' };
  const police = { units: [unit], surrendered: ['resident'], eligible:['resident'] };
  assert.equal(validTownSnapshot({ ...snapshot(), police }), true);
  // #640: a telegraphed grab carries its remaining windup; subdued players are listed.
  assert.equal(validTownSnapshot({ ...snapshot(), police: { ...police, units: [{ ...unit, state: 'grab', remainingMs: 450 }], subdued: ['resident'] } }), true);
  for (const bad of [{ ...unit, state: 'grab' }, { ...unit, state: 'grab', remainingMs: -1 }, { ...unit, remainingMs: 10 }])
    assert.equal(validTownSnapshot({ ...snapshot(), police: { ...police, units: [bad] } }), false, JSON.stringify(bad));
  assert.equal(validTownSnapshot({ ...snapshot(), police: { ...police, subdued: ['nobody'] } }), false);
  for (const bad of [null, {}, { ...police, units: [...Array(7)].map((_, i) => ({ ...unit, id: `police:${i}` })) },
    { ...police, units: [unit, unit] }, { ...police, surrendered: ['unknown'] },
    ...[{ position: [1, 2, NaN] }, { state: 'teleport' }, { targetId: null }, { state: 'return' }].map(change => ({ ...police, units: [{ ...unit, ...change }] }))])
    assert.equal(validTownSnapshot({ ...snapshot(), police: bad }), false, JSON.stringify(bad));
});
