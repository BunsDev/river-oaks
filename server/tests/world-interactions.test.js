import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { WATER_MS, benchSeats, boutiquePlanters, headingTo } from '../../preview/src/world-interactions.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

// Storefront benches join the shared seating model (seating.test.js covers
// Jevica's garden seats and lounge chairs); townspeople rest on them too.
// Watering a planter is an animation the server starts and checks.
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
data.vegetation = JSON.parse(await readFile(new URL('../../preview/public/data/district-vegetation.json', import.meta.url)));
const environment = createWalkingEnvironment(data);
const ADMIN = JEVICA_ADMIN_USER_IDS[1];
const benches = benchSeats(data);
// A bench whose standing spots are open pavement.
const free = ([x, north]) => environment.isFree(x, -north) && !environment.roomAt(x, -north);
const bench = benches.find(seat => seat.slot === 0 && free(seat.approach) && free(benches.find(other => other.buildId === seat.buildId && other.slot === 1).approach));
const besideBench = benches.find(seat => seat.buildId === bench.buildId && seat.slot === 1);
const planter = boutiquePlanters(data)[0];
const identity = userId => ({ userId, name: userId, sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });
const sitOn = seat => ({ type: 'sit', buildId: seat.buildId, slot: seat.slot });

function setup() {
  let time = 1_000_000;
  const world = createSharedWorld(data, { now: () => time, isAdmin: id => id === ADMIN });
  for (const id of ['alice', 'bob', ADMIN]) assert.equal(world.join(identity(id)).ok, true);
  const put = (id, [x, north]) => { Object.assign(world.players.get(id), { position: [x, north, environment.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 }); };
  const me = id => world.snapshot().players.find(player => player.id === id);
  const act = (id, message) => world.command(id, message);
  // Keep everyone else away from the bench being tested.
  const away = benches.find(seat => seat.buildId !== bench.buildId && free(seat.approach)).approach;
  for (const id of ['bob', ADMIN]) put(id, away);
  return { world, put, me, act, advance: ms => { time += ms; } };
}

test('a storefront bench seats two, through the shared seating commands, facing the street', () => {
  const { put, me, act } = setup();
  put('alice', bench.approach);
  const result = act('alice', sitOn(bench));
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(me('alice').sitting, { buildId: bench.buildId, slot: bench.slot, height: bench.height, yaw: bench.heading });
  assert.ok(Math.hypot(me('alice').position[0] - bench.x, me('alice').position[1] - bench.north) < 1e-9, 'on the place');
  put('bob', besideBench.approach);
  assert.equal(act('bob', sitOn(bench)).error, 'seat_occupied');
  assert.equal(act('bob', sitOn(besideBench)).ok, true, 'the place beside is free');
  assert.equal(act('bob', { type: 'sit', buildId: bench.buildId, slot: 2 }).error, 'invalid_seat');
  assert.equal(act('bob', { type: 'sit', buildId: 'bench:nowhere', slot: 0 }).error, 'invalid_seat');
});

test('standing up from a bench steps onto open pavement in front of it', () => {
  const { put, me, act } = setup();
  put('alice', bench.approach);
  act('alice', sitOn(bench));
  const stood = act('alice', { type: 'stand' });
  assert.equal(stood.ok, true, stood.error);
  const alice = me('alice');
  assert.equal(alice.sitting, null);
  assert.ok(free([alice.position[0], alice.position[1]]), 'on open pavement');
  const ahead = (alice.position[0] - bench.x) * Math.sin(bench.heading) - (alice.position[1] - bench.north) * Math.cos(bench.heading);
  assert.ok(ahead > 1, 'in front of the bench, not behind it');
});

test('a resident resting on a bench place keeps it from players', () => {
  const { world, put, act } = setup();
  world.state.locals[0].life.seat = { id: bench.id, heading: bench.heading, height: bench.height };
  put('alice', bench.approach);
  assert.equal(act('alice', sitOn(bench)).error, 'seat_occupied');
});

test('townspeople rest on storefront benches in the shared town and never take a held place', () => {
  const { world, put, act, advance } = setup();
  let seated = null;
  for (let second = 0; second < 90 && !seated; second++) {
    advance(1000); world.step(1);
    seated = world.snapshot().locals.find(local => local.life?.seat);
  }
  assert.ok(seated, 'a resident sat on a bench within a minute and a half');
  const place = benches.find(seat => seat.id === seated.life.seat.id);
  assert.deepEqual(seated.life.seat, { id: place.id, heading: place.heading, height: place.height });
  assert.ok(Math.hypot(seated.position[0] - place.x, seated.position[1] - place.north) < 1e-9);
  // While a player holds a place, no resident sits on it.
  const held = benches.find(seat => seat.id !== place.id && free(seat.approach) && !world.state.locals.some(local => local.life?.seat?.id === seat.id));
  put('alice', held.approach);
  assert.equal(act('alice', sitOn(held)).ok, true);
  for (let second = 0; second < 120; second++) {
    advance(1000); world.step(1);
    assert.ok(!world.snapshot().locals.some(local => local.life?.seat?.id === held.id), 'the held place stays free of residents');
  }
});

test('a seated player survives a checkpoint on a bench', () => {
  const { world, put, act } = setup();
  put('alice', bench.approach);
  act('alice', sitOn(bench));
  const restored = createSharedWorld(data, { now: () => 1_000_000, isAdmin: id => id === ADMIN });
  assert.equal(restored.restore(world.checkpoint()).ok, true);
  assert.deepEqual(restored.snapshot().players.find(player => player.id === 'alice').sitting,
    { buildId: bench.buildId, slot: bench.slot, height: bench.height, yaw: bench.heading });
});

test('watering a planter in reach turns the player toward it for a few seconds', () => {
  const { put, me, act, advance } = setup();
  put('alice', [planter.x + 1.2, planter.north]);
  assert.equal(act('alice', { type: 'gesture', kind: 'water' }).error, 'invalid_gesture', 'watering needs a planter');
  const result = act('alice', { type: 'water', planterId: planter.id });
  assert.equal(result.ok, true, result.error);
  const alice = me('alice');
  assert.equal(alice.gesture, 'water');
  const heading = alice.yaw + Math.PI, toward = headingTo(alice.position, [planter.x, planter.north]);
  assert.ok(Math.abs(Math.atan2(Math.sin(heading - toward), Math.cos(heading - toward))) < 1e-9, 'facing the planter');
  assert.equal(act('alice', { type: 'water', planterId: planter.id }).error, 'gesture_cooldown');
  advance(WATER_MS + 1);
  assert.equal(me('alice').gesture, null, 'the animation ends');
  assert.equal(act('alice', { type: 'water', planterId: planter.id }).ok, true, 'and can be repeated');
  put('bob', [planter.x + 6, planter.north]);
  assert.equal(act('bob', { type: 'water', planterId: planter.id }).error, 'planter_out_of_reach');
  assert.equal(act('bob', { type: 'water', planterId: 'planter:nowhere:0' }).error, 'unknown_planter');
  for (const message of [{ type: 'water' }, { type: 'water', planterId: planter.id, position: [0, 0] }])
    assert.equal(act('bob', message).error, 'invalid_planter');
});

test('a watering player keeps facing the planter while their camera moves, and walking off ends it', () => {
  const { put, me, act } = setup();
  put('alice', [planter.x + 1.2, planter.north]);
  act('alice', { type: 'water', planterId: planter.id });
  const facing = me('alice').yaw, still = me('alice').position;
  assert.equal(act('alice', { type: 'pose', position: still, yaw: facing + 1.4, altitude: 0 }).ok, true);
  assert.equal(me('alice').yaw, facing, 'a camera turn does not turn the body');
  const step = [still[0] + 0.32, still[1]];
  act('alice', { type: 'pose', position: [...step, environment.groundAt(step[0], -step[1])], yaw: facing, altitude: 0 });
  assert.equal(me('alice').gesture, null, 'walking off stops watering');
});

test('nobody waters while sitting, and never through a wall or a shop window', () => {
  const { put, act } = setup();
  put('alice', bench.approach);
  act('alice', sitOn(bench));
  assert.equal(act('alice', { type: 'water', planterId: planter.id }).error, 'seated');
  act('alice', { type: 'stand' });
  // An indoor spot within reach of a door planter, just behind the shopfront.
  let behindGlass = null, spot = null;
  search: for (const item of boutiquePlanters(data)) for (const store of data.stores) {
    const [fx, fn] = store.facade, [nx, ny] = store.outward;
    for (let along = -9; along <= 9; along += 0.25) {
      const point = [fx - nx * 0.5 + ny * along, fn - ny * 0.5 - nx * along];
      if (environment.roomAt(point[0], -point[1]) && Math.hypot(point[0] - item.x, point[1] - item.north) <= 2.2) { behindGlass = item; spot = point; break search; }
    }
  }
  assert.ok(behindGlass, 'a door planter within reach of an indoor spot');
  put('alice', spot);
  assert.equal(act('alice', { type: 'water', planterId: behindGlass.id }).error, 'planter_out_of_reach');
});
