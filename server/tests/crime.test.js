import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { CRIME_RULES, CRIME_TARGETS } from '../crime.js';

// The first criminal action (#597) inside the authoritative town: one melee attack on an
// authored rival, decided by the world rule (#596), with health, recovery and wanted stars.
const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const OWNER = 'owner', ALICE = 'alice', BOB = 'bob';
const RIVAL = CRIME_TARGETS['river-oaks'][0];
const [RX, RN] = RIVAL.position;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function town({ data = district, restore } = {}) {
  const clock = { time: 5_000_000 };
  const world = createSharedWorld(data, { now: () => clock.time, isAdmin: id => id === OWNER });
  if (restore) assert.deepEqual(world.restore(restore), { ok: true });
  for (const id of [OWNER, ALICE, BOB]) if (!world.players.has(id)) world.join({ userId: id, name: id });
  const place = (id, [east, north], lift = 0) => { const player = world.players.get(id);player.position = [east, north, world.snapshot().crime.targets[0].position[2] + lift]; };
  const later = ms => { clock.time += ms; };
  const rules = (violence, clockChange) => {
    later(1000);
    const reply = world.command(OWNER, { type: 'worldPolicy', action: 'update', expectedRevision: world.worldPolicy().revision, changes: { violence, ...(clockChange ? { clock: clockChange } : {}) } });
    assert.equal(reply.ok, true, JSON.stringify(reply));
  };
  const attack = (id, extra = {}) => world.command(id, { type: 'attack', targetId: RIVAL.id, attackKind: 'melee', ...extra });
  const rival = () => world.snapshot().crime.targets.find(item => item.id === RIVAL.id);
  const stars = id => world.snapshot().crime.wanted.find(([userId]) => userId === id)?.[1] ?? 0;
  // Everything an attack could change, so refusals can prove they changed nothing.
  const state = () => { const snap = world.snapshot();return JSON.stringify({ crime: snap.crime, players: snap.players.map(({ id, gesture, position }) => ({ id, gesture, position })), revision: snap.revision }); };
  // #640: a strike lands at contact. Step through it, then step back out of the rival's
  // counter range so these resolver checks see only the strike (crime-phases.test.js covers the
  // counter). Returns the resolved public action.
  const land = (extra = {}) => {
    place(ALICE, [RX + 1.2, RN]);
    const reply = attack(ALICE, extra);assert.equal(reply.ok, true, JSON.stringify(reply));
    later(CRIME_RULES.strikeWindupMs);world.step(0.05);
    place(ALICE, [RX, RN + 5]);later(CRIME_RULES.hitReactionMs);world.step(0.05);
    return world.snapshot().crime.actions.find(item => item.id === reply.action.id) ?? reply.action;
  };
  return { world, clock, place, later, rules, attack, land, rival, stars, state };
}
const open = f => { f.rules({ mode: 'forced', zones: ['westcreek-lane'] });f.place(ALICE, [RX + 1.2, RN]); };

test('the town starts peaceful: rivals stand whole and nobody can attack them', () => {
  const f = town();
  assert.deepEqual(f.world.snapshot().crime.targets.map(item => [item.id, item.health, item.incapacitated]),
    CRIME_TARGETS['river-oaks'].map(item => [item.id, CRIME_RULES.maxHealth, false]));
  assert.deepEqual(f.world.snapshot().crime.wanted, []);
  f.place(ALICE, [RX + 1.2, RN]);
  const before = f.state();
  assert.equal(f.attack(ALICE).error, 'violence_off');
  assert.equal(f.state(), before, 'a refusal changes nothing');
});

test('a permitted hit is one authoritative transition at contact: damage, a star, a strike, all public', () => {
  // #640 changed this from an instant hit in the reply to a timed action resolved at contact.
  const f = town();open(f);
  const reply = f.attack(ALICE, { attackId: 'alice-hit-0001' });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  assert.deepEqual([reply.action.phase, reply.action.outcome, reply.hit], ['windup', null, undefined]);
  assert.equal(f.world.snapshot().players.find(player => player.id === ALICE).gesture, 'shove');
  f.later(CRIME_RULES.strikeWindupMs);f.world.step(0.05);
  const resolved = f.world.snapshot().crime.actions.find(item => item.id === reply.action.id);
  assert.deepEqual(resolved.effect, { damage: 25, health: 75, incapacitated: false, stars: 1 });
  assert.deepEqual([f.rival().health, f.rival().staggered, f.stars(ALICE)], [75, true, 1]);
  // The same attack ID again is the same result, and nothing moves.
  const before = f.state();
  f.later(CRIME_RULES.cooldownMs);
  const again = f.attack(ALICE, { attackId: 'alice-hit-0001' });
  assert.deepEqual([again.ok, again.replayed, again.action.id, again.action.outcome, again.action.effect.health, again.action.effect.stars], [true, true, reply.action.id, 'hit', 75, 1]);
  const lasting = text => JSON.parse(text).crime.targets.map(({ id, health, incapacitated }) => [id, health, incapacitated]).concat(JSON.parse(text).crime.wanted);
  assert.deepEqual(lasting(f.state()), lasting(before), 'a duplicate never lands twice');
  // Private details stay out of the snapshot.
  const text = JSON.stringify(f.world.snapshot().crime);
  for (const secret of ['alice-hit-0001', 'cooldown', 'quietSince', 'receipt', 'hitAt']) assert.equal(text.includes(secret), false, secret);
});

test('forged commands that claim damage, health, stars or another kind of attack are refused', () => {
  const f = town();open(f);
  const before = JSON.parse(f.state()).crime;
  for (const extra of [{ damage: 100 }, { health: 0 }, { stars: 5 }, { severity: 'high' }, { userId: OWNER }, { attackKind: 'ranged' }, { attackKind: undefined },
    { targetId: 42 }, { targetId: '' }, { attackId: 'short' }, { attackId: 'x'.repeat(65) }, { attackId: 'has spaces!' }, { position: [RX, RN] }]) {
    f.later(600);
    assert.equal(f.attack(ALICE, extra).error, 'invalid_attack', JSON.stringify(extra));
  }
  assert.equal(f.world.command(ALICE, { type: 'attack', targetId: RIVAL.id }).error, 'invalid_attack');
  assert.deepEqual(JSON.parse(f.state()).crime, before);
});

test('wrong time, wrong zone, protected or unknown targets, disabled PvP and safe ground change nothing', () => {
  const f = town();
  f.place(ALICE, [RX + 1.2, RN]);f.place(BOB, [RX + 0.6, RN + 0.6]);
  const before = f.state();
  f.rules({ mode: 'scheduled', zones: ['westcreek-lane'] }, { minute: 12 * 60, rate: 0 });
  assert.equal(f.attack(ALICE).error, 'outside_hours');
  f.rules({ mode: 'forced', zones: ['south-service-lane'] });
  assert.equal(f.attack(ALICE).error, 'zone_disabled');
  f.rules({ mode: 'forced', zones: ['westcreek-lane'] });
  const resident = f.world.state.locals[0].id;
  assert.equal(f.world.command(ALICE, { type: 'attack', targetId: resident, attackKind: 'melee' }).error, 'protected_target');
  assert.equal(f.world.command(ALICE, { type: 'attack', targetId: 'nobody-at-all', attackKind: 'melee' }).error, 'unknown_target');
  assert.equal(f.world.command(ALICE, { type: 'attack', targetId: BOB, attackKind: 'melee' }).error, 'pvp_off');
  f.rules({ pvp: true });
  assert.equal(f.world.command(ALICE, { type: 'attack', targetId: BOB, attackKind: 'melee' }).error, 'pvp_consent_required', 'PvP also needs consent nobody can give yet');
  f.place(ALICE, [-2790, -1300]);
  assert.equal(f.attack(ALICE).error, 'safe_zone');
  f.place(ALICE, [-2901.5, RN]);
  assert.equal(f.attack(ALICE).error, 'not_danger_zone', 'from just outside the lane');
  f.world.command(OWNER, { type: 'worldPolicy', action: 'emergencyOff' });
  f.place(ALICE, [RX + 1.2, RN]);
  assert.equal(f.attack(ALICE).error, 'violence_off', 'emergency off stops the next attack');
  const after = JSON.parse(f.state()), was = JSON.parse(before);
  assert.deepEqual(after.crime, was.crime, 'no damage, no stars');
});

test('reach, height, walls, seats and flight are checked from the town\'s own positions', () => {
  const f = town();open(f);
  f.place(ALICE, [RX + CRIME_RULES.meleeReach + 0.05, RN]);
  assert.equal(f.attack(ALICE).error, 'attack_out_of_reach');
  f.place(ALICE, [RX + 1.2, RN], CRIME_RULES.meleeHeight + 0.1);
  assert.equal(f.attack(ALICE).error, 'attack_out_of_reach', 'not from above');
  f.place(ALICE, [RX + 1.2, RN]);
  f.world.players.get(ALICE).altitude = 2;
  assert.equal(f.attack(ALICE).error, 'attack_on_foot');
  f.world.players.get(ALICE).altitude = 0;f.world.players.get(ALICE).vehicle = 'bicycle';
  assert.equal(f.attack(ALICE).error, 'attack_on_foot');
  f.world.players.get(ALICE).vehicle = null;
  // A passenger on a landed Ribbonwing has no vehicle and stands at ground height, but is aboard:
  // a swing begun on foot misses if the attacker boards before contact (review of #710).
  const PILOT = 'user_01M40Y914S1H4EJCEHH91DKTAY'; // entitled to the Ribbonwing
  f.world.join({ userId: PILOT, name: 'Pilot' });f.place(PILOT, [RX + 1.88, RN]);
  const parked = f.world.snapshot().players.find(player => player.id === PILOT);
  assert.equal(f.world.command(PILOT, { type: 'pose', position: parked.position, yaw: Math.PI / 2, altitude: 0, vehicle: 'hover' }).ok, true, 'the pilot sits in the landed craft');
  // Nose south: the passenger seat, 0.68 m to the pilot's right, is where alice stands, in reach.
  const swing = f.attack(ALICE, { attackId: 'alice-board-0001' });
  assert.equal(swing.ok, true, JSON.stringify(swing));
  assert.equal(f.world.command(PILOT, { type: 'ribbonwing', action: 'invite', peerId: ALICE }).ok, true);
  const boarding = f.world.command(ALICE, { type: 'ribbonwing', action: 'board', pilotId: PILOT });
  assert.equal(boarding.ok, true, JSON.stringify(boarding));
  f.later(CRIME_RULES.strikeWindupMs);f.world.step(0.05);
  const seat = f.world.players.get(ALICE), boarded = f.world.snapshot().crime.actions.find(item => item.id === swing.action.id);
  assert.equal(seat.passengerOf, PILOT, 'still aboard at contact');
  assert.deepEqual([boarded.outcome, boarded.reason, f.rival().health], ['miss', 'attack_on_foot', 100], 'no hit lands from a passenger seat');
  assert.equal(f.world.command(ALICE, { type: 'ribbonwing', action: 'leave' }).ok, true, 'steps out on the ground');
  f.world.leave(PILOT);f.place(ALICE, [RX + 1.2, RN]);f.later(CRIME_RULES.cooldownMs);
  // A wall between them, in an otherwise identical district.
  const walled = { ...district, collisionPolygons: [...district.collisionPolygons, [[RX + 0.5, RN - 2], [RX + 0.7, RN - 2], [RX + 0.7, RN + 2], [RX + 0.5, RN + 2], [RX + 0.5, RN - 2]]] };
  const w = town({ data: walled });open(w);
  assert.equal(w.attack(ALICE).error, 'attack_out_of_reach', 'a wall blocks the swing');
  w.place(ALICE, [RX, RN + 1.2]);
  const around = w.attack(ALICE);assert.equal(around.ok, true, 'around the wall it is admitted');
  w.later(CRIME_RULES.strikeWindupMs);w.world.step(0.05);
  assert.equal(w.rival().health, 75, 'and lands');
});

test('cooldown, incapacitation and recovery are deterministic; stars clamp at five and cool off with quiet time', () => {
  // #640: hits resolve at contact (land() steps through it); timings count from contact.
  const f = town();open(f);
  assert.equal(f.attack(ALICE).ok, true);
  const before = f.state();
  assert.equal(f.attack(ALICE).error, 'attack_cooldown');
  assert.equal(f.state(), before);
  f.later(CRIME_RULES.strikeWindupMs);f.world.step(0.05);f.place(ALICE, [RX, RN + 5]);f.later(CRIME_RULES.hitReactionMs);f.world.step(0.05);
  assert.equal(f.rival().health, 75);
  for (const health of [50, 25, 0]) assert.equal(f.land().effect.health, health);
  const lastHit = f.clock.time - CRIME_RULES.hitReactionMs;
  assert.deepEqual([f.rival().incapacitated, f.stars(ALICE)], [true, 4]);
  f.later(CRIME_RULES.cooldownMs);f.place(ALICE, [RX + 1.2, RN]);
  assert.equal(f.attack(ALICE).error, 'target_incapacitated', 'nobody is hit while down');
  assert.equal(f.stars(ALICE), 4);
  // Recovery: whole again exactly when the clock runs out, not before.
  f.clock.time = lastHit + CRIME_RULES.recoveryMs - 1;f.world.step(0.05);
  assert.equal(f.rival().incapacitated, true);
  f.later(1);f.world.step(0.05);
  assert.deepEqual([f.rival().health, f.rival().incapacitated], [100, false]);
  // Two more hits: stars stop at five.
  assert.equal(f.land().effect.stars, 5);
  assert.equal(f.land().effect.stars, 5);
  // Quiet time: one star per period, whatever the step sizes. Police watching her pause the
  // cooldown (#640), so she steps out of the danger zone; officers stand down at once and the
  // quiet period runs from that last step.
  f.place(ALICE, [-2790, -1300]);
  const quietFrom = f.clock.time;
  f.clock.time = quietFrom + CRIME_RULES.starDecayMs - 1;f.world.step(0.05);
  assert.equal(f.stars(ALICE), 5);
  f.clock.time = quietFrom + 2 * CRIME_RULES.starDecayMs + 10;f.world.step(0.05);
  assert.equal(f.stars(ALICE), 3);
  f.clock.time = quietFrom + 10 * CRIME_RULES.starDecayMs;f.world.step(0.05);
  assert.equal(f.stars(ALICE), 0);
  assert.deepEqual(f.world.snapshot().crime.wanted, []);
});

test('departed sessions and upper floors cannot attack; others still play', () => {
  const f = town();open(f);
  f.world.leave(ALICE);
  assert.equal(f.attack(ALICE).error, 'not_joined', 'a departed session has no hands');
  f.world.join({ userId: ALICE, name: ALICE });f.place(ALICE, [RX + 1.2, RN]);
  f.world.players.get(ALICE).levelId = 'garage/l2';
  assert.ok(['return_to_ground_level', 'attack_on_foot'].includes(f.attack(ALICE).error));
  f.world.players.get(ALICE).levelId = null;
  assert.equal(f.attack(ALICE).ok, true, 'admitted; it lands at contact (#640)');
  // Social life keeps working beside it.
  f.later(2000);
  assert.equal(f.world.command(BOB, { type: 'chat', text: 'what was that?' }).ok, true);
  assert.equal(f.world.command(BOB, { type: 'gesture', kind: 'wave' }).ok, true);
});

test('checkpoints keep health, stars and receipts; older towns restore with none; garbled crime state is refused', () => {
  const f = town();open(f);
  f.land({ attackId: 'alice-hit-0002' });f.land();
  const saved = f.world.checkpoint();
  assert.equal(saved.version, 18);
  const back = town({ restore: saved });back.clock.time = f.clock.time;
  assert.deepEqual(back.world.snapshot().crime, f.world.snapshot().crime);
  back.place(ALICE, [RX + 1.2, RN]);back.later(CRIME_RULES.cooldownMs);
  assert.equal(back.attack(ALICE, { attackId: 'alice-hit-0002' }).replayed, true, 'a retry after restore still lands once');
  assert.equal(back.rival().health, 50);
  // Recovery and decay continue from the saved times.
  back.clock.time = f.clock.time + CRIME_RULES.recoveryMs;back.world.step(0.05);
  // (#640: the last hit landed a hit-reaction before the checkpoint, so recovery is due by now.)
  assert.equal(back.rival().health, 100);
  // An older (v14) town: no crime at all, everything else kept.
  // (#640: land() steps the town, so police now exist; a v14 town has neither crime nor police.)
  const { crime, police: _police, ...payload } = structuredClone(f.world.checkpoint().payload);
  const envelope = { version: 14, worldId: saved.worldId, worldFingerprint: saved.worldFingerprint, payload };
  const old = town({ restore: { ...envelope, checksum: digest(envelope) } });
  assert.deepEqual(old.world.snapshot().crime.wanted, []);
  assert.ok(old.world.snapshot().crime.targets.every(item => item.health === 100));
  assert.equal(old.world.worldPolicy().violence.mode, 'forced', 'v14 world rules survive');
  const seal = value => ({ ...value, checksum: digest({ version: value.version, worldId: value.worldId, worldFingerprint: value.worldFingerprint, payload: value.payload }) });
  const live = town(), was = live.world.checkpoint();
  for (const bad of [
    seal({ ...envelope, payload: { ...payload, crime } }),
    seal({ ...envelope, version: 15 }),
    seal({ ...envelope, version: 15, payload: { ...payload, crime: { ...crime, wanted: [[ALICE, { stars: 6, quietSince: 0 }]] } } }),
    seal({ ...envelope, version: 15, payload: { ...payload, crime: { ...crime, wanted: [[ALICE, { stars: 0, quietSince: 0 }]] } } }),
    seal({ ...envelope, version: 15, payload: { ...payload, crime: { ...crime, rivals: [{ id: RIVAL.id, health: 101, hitAt: null }] } } }),
    seal({ ...envelope, version: 15, payload: { ...payload, crime: { ...crime, rivals: [{ id: RIVAL.id, health: 50, hitAt: null }] } } }),
    seal({ ...envelope, version: 15, payload: { ...payload, crime: { ...crime, extra: true } } }),
  ]) {
    assert.equal(live.world.restore(bad).ok, false);
    assert.deepEqual(live.world.checkpoint(), was);
  }
});

test('fuzzed attack messages never mutate the town unless they are exactly a valid melee attack', () => {
  const f = town();open(f);
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const values = [null, undefined, 0, -1, 1e309, 'melee', RIVAL.id, '', [], {}, { toString: 1 }, true, 'x'.repeat(200)];
  const keys = ['targetId', 'attackKind', 'attackId', 'damage', 'stars', 'health', '__proto__', 'constructor'];
  const before = f.state();
  for (let i = 0; i < 400; i++) {
    const message = { type: 'attack' };
    for (const key of keys) if (random() < 0.5) message[key] = values[Math.floor(random() * values.length)];
    const valid = message.attackKind === 'melee' && message.targetId === RIVAL.id && Object.keys(message).every(key => ['type', 'targetId', 'attackKind'].includes(key));
    if (valid) continue;
    f.clock.time += 600;
    const reply = f.world.command(ALICE, JSON.parse(JSON.stringify(message)));
    assert.equal(reply.ok, false, JSON.stringify(message));
    assert.notEqual(reply.error, 'rate_limited', 'every case reaches validation');
  }
  const lasting = text => JSON.parse(text).crime.targets.map(({ id, health }) => [id, health]).concat(JSON.parse(text).crime.wanted);
  assert.deepEqual(lasting(f.state()), lasting(before));
});
