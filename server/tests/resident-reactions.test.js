import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { CRIME_RULES, CRIME_TARGETS } from '../crime.js';
import { REACTION_RULES } from '../../preview/src/resident-life.js';

// #640 increment 3: residents react to a fight. The town decides who perceives what (distance,
// height and a clear sight line), caps how many react, and runs the reaction through the resident
// simulation it already owns: a startle, a routed flight away from the trouble or a cower in
// place, then back to the routine. Residents stay protected targets and are never added or removed.
const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const OWNER = 'owner', ALICE = 'alice', BOB = 'bob';
const RIVAL = CRIME_TARGETS['river-oaks'][1];
assert.equal(RIVAL.id, 'rival:service-lane');
const [RX, RN] = RIVAL.position;
const R = CRIME_RULES, RR = REACTION_RULES;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const seal = value => ({ ...value, checksum: digest({ version: value.version, worldId: value.worldId, worldFingerprint: value.worldFingerprint, payload: value.payload }) });
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function town({ restore, time = 5_000_000 } = {}) {
  const clock = { time };
  const world = createSharedWorld(district, { now: () => clock.time, isAdmin: id => id === OWNER });
  if (restore) assert.deepEqual(world.restore(restore), { ok: true });
  for (const id of [OWNER, ALICE, BOB]) if (!world.players.has(id)) world.join({ userId: id, name: id });
  const ground = () => world.snapshot().crime.targets.find(item => item.id === RIVAL.id).position[2];
  const place = (id, [east, north]) => { world.players.get(id).position = [east, north, ground()]; };
  const later = ms => { while (ms > 0) { const step = Math.min(ms, 50);clock.time += step;ms -= step;world.step(step / 1000); } };
  const rules = violence => {
    clock.time += 1000;
    const reply = world.command(OWNER, { type: 'worldPolicy', action: 'update', expectedRevision: world.worldPolicy().revision, changes: { violence } });
    assert.equal(reply.ok, true, JSON.stringify(reply));
  };
  const attack = (id, extra = {}) => world.command(id, { type: 'attack', targetId: RIVAL.id, attackKind: 'melee', ...extra });
  const outdoor = world.state.locals.filter(local => !local.indoor && !local.stationary);
  // Park a resident on the street: no route, no plan until told otherwise, far from everyone else.
  const park = (index, [east, north]) => {
    const local = outdoor[index];
    local.position = [east, north, ground()];
    Object.assign(local.life, { route: [], destination: null, waitUntil: Infinity, seat: null, speed: 0, previousSpeed: 0 });
    return local;
  };
  // Every other outdoor resident waits far away, so only the parked ones can perceive the lane.
  const clearStreet = () => outdoor.forEach((local, index) => park(index, [-2700 + index % 6 * 3, -1200 - Math.floor(index / 6) * 3]));
  const snap = id => world.snapshot().locals.find(local => local.id === id);
  const reaction = id => snap(id).life.reaction;
  return { world, clock, place, later, rules, attack, outdoor, park, clearStreet, snap, reaction };
}
const open = f => { f.rules({ mode: 'forced', zones: ['south-service-lane'] });f.place(ALICE, [RX + 1.2, RN]); };
const strike = f => { const reply = f.attack(ALICE);assert.equal(reply.ok, true, JSON.stringify(reply));f.later(R.strikeWindupMs);return reply.action; };

test('a resident in sight of a landed strike startles toward it, flees away at a run and then returns to the routine', () => {
  const f = town();f.clearStreet();
  const count = f.world.snapshot().locals.length;
  const witness = f.park(0, [RX, RN + 8]);
  open(f);
  assert.equal(f.reaction(witness.id), null, 'nothing has happened yet');
  strike(f);
  assert.equal(f.snap(witness.id).life.reaction, 'startle', 'the contact is seen');
  assert.equal(f.snap(witness.id).life.status, 'startled');
  f.later(400);
  const facing = Math.atan2(RX + 1.2 - witness.position[0], -(RN - witness.position[1]));
  assert.ok(Math.abs(wrap(f.snap(witness.id).life.heading - facing)) < .35, `faces the fight: ${f.snap(witness.id).life.heading} vs ${facing}`);
  assert.equal(distance(f.snap(witness.id).position, [RX, RN + 8]), 0, 'stands still while startled');
  f.later(RR.startleMs);
  assert.equal(f.reaction(witness.id), 'flee');
  const start = f.snap(witness.id).position, from = distance(start, [RX + 1.2, RN]);
  f.later(2000);
  const moved = f.snap(witness.id).position;
  assert.ok(distance(moved, [RX + 1.2, RN]) > from + 2.5, `runs away from the fight: ${distance(moved, [RX + 1.2, RN]) - from} m in 2 s`);
  assert.ok(f.snap(witness.id).life.speed > 1.6, `at a run: ${f.snap(witness.id).life.speed} m/s`);
  assert.equal(f.snap(witness.id).life.status, 'fleeing');
  f.later(RR.fleeMs);
  assert.equal(f.reaction(witness.id), null, 'the reaction ends');
  assert.ok(distance(f.snap(witness.id).position, [RX + 1.2, RN]) >= RR.fleeMinM - 1, 'and ends well away from the trouble');
  assert.notEqual(f.snap(witness.id).life.status, 'fleeing');
  assert.equal(f.world.snapshot().locals.length, count, 'no resident was added or removed');
  assert.deepEqual(f.world.snapshot().crime.targets.map(item => item.id), CRIME_TARGETS['river-oaks'].map(item => item.id), 'residents are not targets');
});

test('only residents who can perceive the fight react: within range, at street level, and at most six, nearest first; a reaction is not repeated for ten seconds', () => {
  const f = town();f.clearStreet();
  // Eight residents in a line north of the rival, 3 to 17 m away, plus one well out of range.
  const near = Array.from({ length: 8 }, (_, i) => f.park(i, [RX + (i % 2 ? 1 : -1) * .8, RN + 3 + i * 2]));
  const far = f.park(8, [RX, RN + RR.radiusM + 12]);
  const indoor = f.world.state.locals.find(local => local.indoor);
  open(f);strike(f);
  const reacting = near.filter(local => f.reaction(local.id) === 'startle').map(local => local.id);
  assert.equal(reacting.length, RR.cap, `six of the eight react: ${reacting.length}`);
  assert.deepEqual(reacting, near.slice(0, RR.cap).map(local => local.id), 'the nearest six');
  assert.equal(f.reaction(far.id), null, 'out of range');
  assert.equal(Object.hasOwn(f.snap(indoor.id).life ?? {}, 'reaction') && f.snap(indoor.id).life.reaction !== null, false, 'an indoor resident has no street reaction');
  // While they recover, another landed strike does not restart them.
  f.later(RR.startleMs + RR.fleeMs + 500);
  for (const local of near.slice(0, RR.cap)) assert.equal(f.reaction(local.id), null);
  f.later(R.cooldownMs);
  f.place(ALICE, [RX + 1.2, RN]);strike(f);
  for (const local of near.slice(0, RR.cap)) assert.equal(f.reaction(local.id), null, `${local.id} is still in its cool-off`);
  // The two who were spared the first time react now (they are the nearest who can).
  for (const local of near.slice(RR.cap)) assert.equal(f.reaction(local.id), 'startle', `${local.id} reacts to the second strike`);
});

test('a wanted player coming close alarms a resident; a peaceful player and a held resident do not', () => {
  const f = town();f.clearStreet();
  const bystander = f.park(0, [RX - 30, RN + 6]), other = f.park(1, [RX - 40, RN + 6]), friend = f.park(2, [RX - 50, RN + 6]);
  open(f);strike(f);
  f.later(R.cooldownMs);
  assert.ok(f.world.snapshot().crime.wanted.some(([id]) => id === ALICE), 'alice is wanted');
  for (const local of [bystander, other, friend]) assert.equal(f.reaction(local.id), null, 'nobody near the fight');
  // A peaceful player walking up changes nothing.
  f.place(BOB, [RX - 40, RN + 2]);f.later(600);
  assert.equal(f.reaction(other.id), null, 'bob is nobody to fear');
  // A resident in a conversation keeps it.
  f.world.state.selectedId = friend.id;
  f.place(ALICE, [RX - 50, RN + 2]);f.later(600);
  assert.equal(f.reaction(friend.id), null, 'a held resident does not react');
  f.world.state.selectedId = null;
  // The wanted player walks up to the bystander.
  f.place(ALICE, [RX - 30, RN + 2]);f.later(600);
  assert.equal(f.reaction(bystander.id), 'startle', 'a wanted player at arm\'s length is alarming');
  assert.equal(f.reaction(other.id), null, 'ten metres away is not');
  f.later(RR.startleMs + 1000);
  assert.equal(f.reaction(bystander.id), 'flee');
  assert.ok(distance(f.snap(bystander.id).position, [RX - 30, RN + 2]) > 4, 'and they get away from them');
});

test('police taking hold of someone alarms the residents who see it', () => {
  const f = town();f.clearStreet();
  open(f);strike(f);f.later(50);
  // Alice steps out of the rival's reach, so no counter follows; she stays a wanted participant.
  // A resident who arrives now saw none of the fight. Alice refuses to surrender, so the officer
  // from the post takes hold of her: that grab, then the arrest, is what the resident sees.
  f.place(ALICE, [RX + 4.5, RN]);f.later(1000);
  assert.equal(f.world.snapshot().crime.targets.find(item => item.id === RIVAL.id).engagedId, null, 'the rival let her go');
  const witness = f.park(0, [RX, RN + 8]);
  assert.equal(f.reaction(witness.id), null);
  let noticed = null, arrested = false;
  for (let i = 0; i < 400 && !arrested; i++) {
    f.later(50);
    noticed ??= f.reaction(witness.id) && { reaction: f.reaction(witness.id), police: f.world.snapshot().police.units.map(unit => unit.state) };
    arrested = !f.world.snapshot().crime.wanted.some(([id]) => id === ALICE);
  }
  assert.equal(arrested, true, 'the arrest completes');
  assert.ok(noticed, 'the witness reacted');
  assert.equal(noticed.reaction, 'startle');
  assert.ok(noticed.police.some(state => ['grab', 'arrest'].includes(state)), `to the police taking hold: ${noticed.police}`);
});

test('reactions ride in the checkpoint, continue after a restore, and a forged one is refused', () => {
  const f = town();f.clearStreet();
  const witness = f.park(0, [RX, RN + 8]);
  open(f);strike(f);
  f.later(RR.startleMs + 500);
  assert.equal(f.reaction(witness.id), 'flee');
  const saved = f.world.checkpoint();
  const restored = town({ restore: saved, time: f.clock.time });
  assert.equal(restored.reaction(witness.id), 'flee', 'a restored resident is still fleeing');
  const before = restored.snap(witness.id).position;
  restored.later(1500);
  assert.ok(distance(restored.snap(witness.id).position, before) > 1, 'and keeps going');
  restored.later(RR.fleeMs);
  assert.equal(restored.reaction(witness.id), null, 'then settles');
  assert.equal(restored.world.snapshot().locals.length, f.world.snapshot().locals.length);
  // A reaction the town cannot have produced does not restore.
  const forged = structuredClone(saved);
  const local = forged.payload.state.locals.find(item => item.id === witness.id);
  local.life.reaction.kind = 'explode';
  assert.equal(createSharedWorld(district, { now: () => f.clock.time }).restore(seal(forged)).ok, false, 'an unknown reaction kind is refused');
  const forged2 = structuredClone(saved);
  forged2.payload.state.locals.find(item => item.id === witness.id).life.reaction.until = -1;
  assert.equal(createSharedWorld(district, { now: () => f.clock.time }).restore(seal(forged2)).ok, false, 'a negative reaction time is refused');
  // An indoor resident never reacts, so a reaction on one is forged; one that would pin a cap slot
  // forever (a timer far in the future) comes back to now and ends on schedule.
  const forged3 = structuredClone(saved);
  forged3.payload.state.locals.find(item => item.indoor).life.reaction = { kind: 'startle', from: [0, 0], until: 0 };
  assert.equal(createSharedWorld(district, { now: () => f.clock.time }).restore(seal(forged3)).ok, false, 'a reaction on an indoor resident is refused');
  const stale = structuredClone(saved), staleLocal = stale.payload.state.locals.find(item => item.id === witness.id);
  staleLocal.life.reaction.until = 1e300; staleLocal.life.reactionCooldownUntil = 1e300;
  const pinned = town({ restore: seal(stale), time: f.clock.time });
  assert.equal(pinned.reaction(witness.id), 'flee');
  pinned.later(RR.fleeMs + 200);
  assert.equal(pinned.reaction(witness.id), null, 'the flight ends within its phase, not in the year 1e300');
  pinned.later(RR.cooldownMs);
  pinned.park(0, [RX, RN + 8]);
  open(pinned);
  strike(pinned);
  assert.equal(pinned.reaction(witness.id), 'startle', 'and the cool-off ended on schedule');
});

test('the snapshot tells clients the reaction kind and nothing private', () => {
  const f = town();f.clearStreet();
  const witness = f.park(0, [RX, RN + 8]);
  open(f);strike(f);
  const life = f.snap(witness.id).life;
  assert.equal(life.reaction, 'startle');
  assert.deepEqual(Object.keys(life).sort(), ['action', 'blocked', 'distance', 'heading', 'helping', 'reaction', 'seat', 'source', 'speed', 'status', 'visitId'].sort());
});
