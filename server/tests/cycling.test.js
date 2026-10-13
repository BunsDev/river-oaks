import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonRack } from '../../preview/src/plaza-salon-plan.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

// The plaza bike rack: slots are arbitrated like seats, a bicycle pose needs a
// slot, and only accepted bicycle poses add to a rider's metres.
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(data);
const slots = plazaSalonRack(data);
const OWNER = JEVICA_ADMIN_USER_IDS[0];
const identity = userId => ({ userId, name: userId, sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });
// A tampered checkpoint re-signed so only the validator, not the checksum, refuses it.
const resign = value => { const { checksum, ...envelope } = value; return { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') }; };

function setup(users = ['alice', 'bob']) {
  let time = 1_000_000;
  const world = createSharedWorld(data, { now: () => time });
  for (const id of users) assert.equal(world.join(identity(id)).ok, true);
  const put = (id, [x, north]) => { Object.assign(world.players.get(id), { position: [x, north, environment.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 }); };
  const me = id => world.snapshot().players.find(player => player.id === id);
  const act = (id, message) => world.command(id, message);
  const ride = (id, [x, north]) => act(id, { type: 'pose', position: [x, north, environment.groundAt(x, -north)], yaw: 0, altitude: 0, vehicle: 'bicycle' });
  return { world, put, me, act, ride, advance: ms => { time += ms; } };
}

test('a rider takes a free slot from its approach, a second rider is refused it, and stepping out frees it', () => {
  const f = setup();
  f.put('alice', slots[0].approach);
  // Bob queues beside the rack, within reach of slot 0 but off its approach.
  f.put('bob', slots[1].approach);
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).ok, true);
  const alice = f.me('alice');
  assert.equal(alice.vehicle, 'bicycle');
  assert.deepEqual(alice.position.slice(0, 2), [slots[0].x, slots[0].north]);
  assert.deepEqual(f.world.snapshot().cycling, { taken: ['plaza-salon-rack:0'] });
  assert.equal(f.act('bob', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).error, 'slot_taken');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 }).error, 'already_cycling');
  assert.equal(f.act('alice', { type: 'uncycle' }).ok, true);
  assert.equal(f.me('alice').vehicle, null);
  assert.deepEqual(f.me('alice').position.slice(0, 2), slots[0].approach);
  assert.deepEqual(f.world.snapshot().cycling, { taken: [] });
  assert.equal(f.act('bob', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).ok, true);
  assert.equal(f.act('bob', { type: 'uncycle' }).ok, true);
  assert.equal(f.act('bob', { type: 'uncycle' }).error, 'not_cycling');
});

test('the rack refuses from far away, from a seat, in the air, with a bad slot, and when all four are out', () => {
  const f = setup(['alice', 'bob', 'carol', 'dave', 'erin']);
  f.put('alice', [slots[0].approach[0], slots[0].approach[1] - 6]);
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).error, 'rack_out_of_reach');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 9 }).error, 'invalid_slot');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'elsewhere', slot: 0 }).error, 'invalid_slot');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0, extra: 1 }).error, 'invalid_slot');
  f.put('alice', slots[0].approach);
  f.world.players.get('alice').altitude = 2;
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).error, 'rack_out_of_reach');
  f.world.players.get('alice').altitude = 0;
  for (const [i, id] of ['alice', 'bob', 'carol', 'dave'].entries()) {
    f.put(id, slots[i].approach);
    assert.equal(f.act(id, { type: 'cycle', rackId: 'plaza-salon-rack', slot: i }).ok, true, `${id} takes slot ${i}`);
  }
  f.put('erin', slots[0].approach);
  assert.equal(f.act('erin', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).error, 'slot_taken');
  assert.equal(f.world.snapshot().cycling.taken.length, 4);
});

test('a bicycle pose needs a slot, obeys the 18 mph budget, and only accepted distance counts', () => {
  const f = setup();
  f.put('alice', slots[0].approach);
  const start = [slots[0].x, slots[0].north];
  assert.equal(f.ride('alice', [start[0], start[1] - 1]).error, 'bike_required', 'no slot, no bike');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).ok, true);
  f.advance(1000);
  // West along the rack line: the plaza bench sits 8 m south of the rack.
  // 7 m in one second is under the 8.05 m/s cap; 9 m is over it.
  assert.equal(f.ride('alice', [start[0] - 7, start[1]]).ok, true);
  f.advance(1000);
  assert.equal(f.ride('alice', [start[0] - 16, start[1]]).error, 'movement_too_fast');
  f.advance(1000);
  assert.equal(f.ride('alice', [start[0] - 12, start[1]]).ok, true);
  const rides = f.world.drainRides();
  assert.deepEqual(rides, [{ userId: 'alice', name: 'alice', meters: 12 }]);
  assert.deepEqual(f.world.drainRides(), [], 'draining resets the counters');
  // Walking poses add nothing, and a pose without the bike releases the slot.
  f.advance(1000);
  assert.equal(f.act('alice', { type: 'pose', position: [start[0] - 13, start[1], environment.groundAt(start[0] - 13, -start[1])], yaw: 0, altitude: 0 }).ok, true);
  assert.deepEqual(f.world.snapshot().cycling, { taken: [] });
  assert.deepEqual(f.world.drainRides(), []);
  f.advance(1000);
  assert.equal(f.ride('alice', [start[0] - 14, start[1]]).error, 'bike_required', 'the slot was released');
});

test('leaving the town releases the slot and keeps the metres for the flush; a checkpoint restores a rider', () => {
  const f = setup(['alice', OWNER]);
  f.put('alice', slots[2].approach);
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 2 }).ok, true);
  f.advance(1000);
  assert.equal(f.ride('alice', [slots[2].x, slots[2].north - 3]).ok, true);
  const restored = createSharedWorld(data, { now: () => 2_000_000 });
  const checkpoint = f.world.checkpoint();
  assert.deepEqual(restored.restore(checkpoint), { ok: true });
  assert.deepEqual(restored.snapshot().cycling, { taken: ['plaza-salon-rack:2'] });
  assert.equal(restored.snapshot().players[0].vehicle, 'bicycle');
  // A slot is only ever held with the bicycle, a bicycle never flies, and a
  // slot is held once; each refusal reports one of the fixed diagnostic reasons.
  const before = restored.snapshot();
  let reason = null;
  const refuse = tampered => { reason = null; const result = restored.restore(resign(tampered), { onFailure: r => { reason = r; } }); assert.equal(result.error, 'invalid_checkpoint'); return reason; };
  const motorcycle = structuredClone(checkpoint);
  Object.assign(motorcycle.payload.players.find(player => player.id === OWNER), { vehicle: 'motorcycle', cycling: 'plaza-salon-rack:0' });
  assert.equal(refuse(motorcycle), 'invalid_entry', 'a slot needs the bicycle');
  const airborne = structuredClone(checkpoint);
  airborne.payload.players.find(player => player.id === 'alice').altitude = 2;
  assert.equal(refuse(airborne), 'invalid_entry', 'a bicycle stays on the ground');
  const duplicate = structuredClone(checkpoint);
  Object.assign(duplicate.payload.players.find(player => player.id === OWNER), { vehicle: 'bicycle', cycling: 'plaza-salon-rack:2' });
  assert.equal(refuse(duplicate), 'invalid_cycling_slot', 'a slot is held by one rider');
  assert.deepEqual(restored.snapshot(), before, 'a refused restore changes nothing');
  assert.equal(f.world.leave('alice'), true);
  assert.deepEqual(f.world.snapshot().cycling, { taken: [] });
  assert.deepEqual(f.world.drainRides(), [{ userId: 'alice', name: 'alice', meters: 3 }]);
});

test('the car and motorcycle stay exclusive to the owner while anyone may cycle', () => {
  const f = setup(['bob', OWNER]);
  f.put('bob', slots[0].approach);
  assert.equal(f.act('bob', { type: 'pose', position: [slots[0].x, slots[0].north, environment.groundAt(slots[0].x, -slots[0].north)], yaw: 0, altitude: 0, vehicle: 'motorcycle' }).error, 'exclusive_vehicle');
  assert.equal(f.act('bob', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).ok, true);
  f.put(OWNER, slots[1].approach);
  assert.equal(f.act(OWNER, { type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 }).ok, true);
});

test('stepping off with the approach blocked leaves the rider at the slot, so the next taker must wait', () => {
  const f = setup();
  f.put('alice', slots[0].approach);
  f.put('bob', slots[1].approach);
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).ok, true);
  f.put('bob', slots[0].approach);
  assert.equal(f.act('alice', { type: 'uncycle' }).ok, true, 'an uncycle is never refused');
  assert.deepEqual(f.me('alice').position.slice(0, 2), [slots[0].x, slots[0].north]);
  assert.equal(f.me('alice').vehicle, null);
  assert.deepEqual(f.world.snapshot().cycling, { taken: [] });
  assert.equal(f.act('bob', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).error, 'rack_blocked');
});

test('travelling while cycling releases the slot and banks the metres', () => {
  const f = setup();
  f.put('alice', slots[2].approach);
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 2 }).ok, true);
  f.advance(1000);
  assert.equal(f.ride('alice', [slots[2].x, slots[2].north - 3]).ok, true);
  f.advance(1000);
  assert.equal(f.act('alice', { type: 'travel', position: [slots[2].x - 10, slots[2].north] }).ok, true);
  assert.equal(f.me('alice').vehicle, null);
  assert.deepEqual(f.world.snapshot().cycling, { taken: [] });
  assert.deepEqual(f.world.drainRides(), [{ userId: 'alice', name: 'alice', meters: 3 }]);
  f.advance(1000);
  assert.equal(f.ride('alice', [slots[2].x - 11, slots[2].north]).error, 'bike_required', 'the slot was released');
});
