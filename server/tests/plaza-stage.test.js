import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonPlan } from '../../preview/src/plaza-salon-plan.js';
import { seatYaw } from '../../preview/src/shared-seating.js';

// The plaza's music stage: one performer at a time, held by the town, standing
// at the microphone; everyone sees them perform until they step down or leave.
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(data);
const { stage } = plazaSalonPlan(data);
const ground = (x, north) => environment.groundAt(x, -north);
// Pavement around the stage: angle 0 faces the salon.
const around = (angle, distance) => [stage.x + Math.sin(stage.heading + angle) * (stage.radius + distance), stage.north - Math.cos(stage.heading + angle) * (stage.radius + distance)];
const front = distance => around(0, distance);
const identity = userId => ({ userId, name: userId === 'alice' ? 'Alice' : 'Bob', sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });

function setup() {
  let time = 1_000_000;
  const world = createSharedWorld(data, { now: () => time });
  for (const id of ['alice', 'bob']) assert.equal(world.join(identity(id)).ok, true);
  const put = (id, [x, north]) => { Object.assign(world.players.get(id), { position: [x, north, ground(x, north)], moveBudget: 1, liftBudget: 1 }); };
  const me = id => world.snapshot().players.find(player => player.id === id);
  put('alice', front(0.8)); put('bob', around(1, 0.8));
  return { world, put, me, act: (id, message) => world.command(id, message), advance: ms => { time += ms; } };
}

test('the open pavement in front of the stage is where a performer steps up from', () => {
  for (const spot of [front(0.8), around(1, 0.8), front(5), front(6)]) assert.equal(environment.isFree(spot[0], -spot[1]), true);
  assert.equal(environment.isFree(stage.x, -stage.north), false, 'the stage itself blocks walking');
});

test('taking the stage stands the performer at the microphone, facing the salon, seen by everyone', () => {
  const { me, act } = setup();
  const before = me('alice').position;
  assert.equal(act('alice', { type: 'stage', action: 'take' }).ok, true);
  const alice = me('alice');
  assert.deepEqual(alice.position, [stage.x, stage.north, ground(stage.x, stage.north) + 0.22]);
  assert.equal(alice.yaw, seatYaw(stage.heading - Math.PI));
  assert.equal(alice.performing, true);
  assert.equal(alice.gesture, 'perform');
  assert.equal(me('bob').performing, false);
  // One performer at a time, and the refusal names who has the stage.
  const busy = act('bob', { type: 'stage', action: 'take' });
  assert.equal(busy.error, 'stage_busy');
  assert.match(busy.message, /Alice is performing/);
  // Stepping down returns the performer to where they stood.
  assert.equal(act('alice', { type: 'stage', action: 'leave' }).ok, true);
  assert.deepEqual(me('alice').position, before);
  assert.equal(me('alice').performing, false);
  assert.equal(me('alice').gesture, null);
  assert.equal(act('bob', { type: 'stage', action: 'take' }).ok, true, 'the stage is free again');
});

test('the performer stays at the microphone but may turn, wave and bow', () => {
  const { me, act, advance } = setup();
  act('alice', { type: 'stage', action: 'take' });
  const { position } = me('alice');
  const moved = act('alice', { type: 'pose', position: [position[0] + 1, position[1], position[2]], yaw: 0, altitude: 0 });
  assert.equal(moved.error, 'leave_stage_before_moving');
  assert.deepEqual(moved.correction.position, position);
  assert.equal(act('alice', { type: 'pose', position, yaw: 0.5, altitude: 0 }).ok, true);
  assert.equal(me('alice').yaw, 0.5);
  assert.deepEqual(me('alice').position, position);
  assert.equal(act('alice', { type: 'gesture', kind: 'wave' }).ok, true);
  assert.equal(me('alice').gesture, 'wave');
  advance(4000);
  assert.equal(me('alice').gesture, 'perform', 'the wave ends and the performance carries on');
  assert.equal(act('alice', { type: 'sit', buildId: 'bench:x', slot: 0 }).error, 'invalid_seat');
  assert.equal(act('alice', { type: 'interaction', action: 'request', kind: 'dance', targetId: 'bob' }).error, 'performing');
});

test('only someone standing at the stage can take it, on foot and not seated', () => {
  const { put, act, world } = setup();
  put('alice', front(5));
  assert.equal(act('alice', { type: 'stage', action: 'take' }).error, 'stage_out_of_reach');
  put('alice', front(0.8));
  world.players.get('alice').altitude = 2;
  assert.equal(act('alice', { type: 'stage', action: 'take' }).error, 'stage_on_foot');
  world.players.get('alice').altitude = 0;
  assert.equal(act('alice', { type: 'stage', action: 'leave' }).error, 'not_performing');
  assert.equal(act('alice', { type: 'stage', action: 'dance' }).error, 'invalid_stage');
  assert.equal(act('alice', { type: 'stage', action: 'take', extra: 1 }).error, 'invalid_stage');
});

test('travelling away or leaving town frees the stage', () => {
  const { me, act, world, advance } = setup();
  act('alice', { type: 'stage', action: 'take' });
  advance(2000);
  const travelled = act('alice', { type: 'travel', position: front(6) });
  assert.equal(travelled.ok, true);
  assert.equal(me('alice').performing, false);
  assert.equal(act('bob', { type: 'stage', action: 'take' }).ok, true);
  world.leave('bob');
  assert.equal(act('alice', { type: 'stage', action: 'take' }).error, 'stage_out_of_reach');
  world.players.get('alice').position = [...front(0.8), ground(...front(0.8))];
  assert.equal(act('alice', { type: 'stage', action: 'take' }).ok, true, 'a departed performer releases the stage');
});

test('a checkpoint taken mid-performance restores the performer standing beside the stage', () => {
  const { act, world } = setup();
  const before = world.players.get('alice').position;
  act('alice', { type: 'stage', action: 'take' });
  const checkpoint = world.checkpoint();
  assert.equal(world.players.get('alice').performing != null, true, 'checkpointing does not end the live performance');
  const restored = createSharedWorld(data);
  assert.deepEqual(restored.restore(checkpoint), { ok: true });
  const alice = restored.snapshot().players.find(player => player.id === 'alice');
  assert.equal(alice.performing, false);
  assert.deepEqual(alice.position, before);
});
