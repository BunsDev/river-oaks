import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { WATER_MS, benchSeats, boutiquePlanters, headingTo } from '../../preview/src/world-interactions.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
data.vegetation = JSON.parse(await readFile(new URL('../../preview/public/data/district-vegetation.json', import.meta.url)));
const environment = createWalkingEnvironment(data);
const ADMIN = JEVICA_ADMIN_USER_IDS[1];
const [bench, besideBench] = benchSeats(data);
const planter = boutiquePlanters(data)[0];
const identity = userId => ({ userId, name: userId, sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });

function setup() {
  let time = 1_000_000;
  const world = createSharedWorld(data, { now: () => time, isAdmin: id => id === ADMIN });
  for (const id of ['alice', 'bob', ADMIN]) assert.equal(world.join(identity(id)).ok, true);
  const put = (id, [x, north]) => { Object.assign(world.players.get(id), { position: [x, north, environment.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 }); };
  const me = id => world.snapshot().players.find(player => player.id === id);
  const act = (id, message) => world.command(id, message);
  return { world, put, me, act, advance: ms => { time += ms; }, now: () => time };
}

test('a player in reach sits on a free bench place; everyone sees where and which way they sit', () => {
  const { put, me, act } = setup();
  put('alice', bench.approach);
  const result = act('alice', { type: 'interact', action: 'sit', targetId: bench.id });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(me('alice').seat, { id: bench.id, heading: bench.heading, height: bench.height });
  assert.ok(Math.hypot(me('alice').position[0] - bench.x, me('alice').position[1] - bench.north) < 1e-9, 'on the place');
  put('bob', bench.approach);
  assert.equal(act('bob', { type: 'interact', action: 'sit', targetId: bench.id }).error, 'seat_taken');
  assert.equal(act('bob', { type: 'interact', action: 'sit', targetId: besideBench.id }).ok, true, 'the place beside is free');
  assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: besideBench.id }).error, 'seated');
});

test('sitting needs reach, a real seat and both feet on the ground', () => {
  const { world, put, act } = setup();
  put('alice', [bench.x + 5, bench.north]);
  assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: bench.id }).error, 'seat_out_of_reach');
  put('alice', bench.approach);
  assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: 'bench:nowhere:0' }).error, 'unknown_seat');
  world.players.get('alice').altitude = 1;
  assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: bench.id }).error, 'interact_on_foot');
  world.players.get('alice').altitude = 0;
  for (const message of [{ type: 'interact', action: 'sit' }, { type: 'interact', action: 'dance', targetId: bench.id },
    { type: 'interact', action: 'stand', targetId: bench.id }, { type: 'interact', action: 'sit', targetId: bench.id, position: [0, 0] }])
    assert.equal(act('alice', message).error, 'invalid_interaction', JSON.stringify(message));
});

test('a resident on a place keeps it from players', () => {
  const { world, put, act } = setup();
  world.state.locals[0].life.seat = { id: bench.id, heading: bench.heading, height: bench.height };
  put('alice', bench.approach);
  assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: bench.id }).error, 'seat_taken');
});

test('standing returns a player to where they stood; a pose that walks off stands them up first', () => {
  const { put, me, act } = setup();
  put('alice', bench.approach);
  act('alice', { type: 'interact', action: 'sit', targetId: bench.id });
  // The seated client keeps reporting the seat: nothing changes.
  const seated = me('alice');
  assert.equal(act('alice', { type: 'pose', position: seated.position, yaw: 1, altitude: 0 }).ok, true);
  assert.equal(me('alice').seat.id, bench.id);
  const stood = act('alice', { type: 'interact', action: 'stand' });
  assert.equal(stood.ok, true);
  assert.equal(me('alice').seat, null);
  assert.ok(Math.hypot(me('alice').position[0] - bench.approach[0], me('alice').position[1] - bench.approach[1]) < 1e-9, 'back where they stood');
  assert.equal(act('alice', { type: 'interact', action: 'stand' }).error, 'not_seated');
  // Walking off without asking: the move is checked from the standing spot.
  act('alice', { type: 'interact', action: 'sit', targetId: bench.id });
  const [x, north] = bench.approach, step = [x + 0.4, north];
  const moved = act('alice', { type: 'pose', position: [...step, environment.groundAt(step[0], -step[1])], yaw: 0, altitude: 0 });
  assert.equal(me('alice').seat, null, JSON.stringify(moved));
});

test('travel and leaving the world free the seat', () => {
  const { world, put, me, act, advance } = setup();
  put('alice', bench.approach);
  act('alice', { type: 'interact', action: 'sit', targetId: bench.id });
  advance(2000);
  const travelled = act('alice', { type: 'travel', placeId: data.communityLocations.at(-1).id });
  assert.equal(travelled.ok, true, travelled.error);
  assert.equal(me('alice').seat, null);
  put('bob', bench.approach);
  act('bob', { type: 'interact', action: 'sit', targetId: bench.id });
  world.leave('bob');
  put('alice', bench.approach);
  assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: bench.id }).ok, true, 'free once bob left');
});

test('watering a planter in reach turns the player toward it for a few seconds', () => {
  const { put, me, act, advance } = setup();
  put('alice', [planter.x + 1.2, planter.north]);
  assert.equal(act('alice', { type: 'gesture', kind: 'water' }).error, 'invalid_gesture', 'watering needs a planter');
  const result = act('alice', { type: 'interact', action: 'water', targetId: planter.id });
  assert.equal(result.ok, true, result.error);
  const alice = me('alice');
  assert.equal(alice.gesture, 'water');
  const heading = alice.yaw + Math.PI, toward = headingTo(alice.position, [planter.x, planter.north]);
  assert.ok(Math.abs(Math.atan2(Math.sin(heading - toward), Math.cos(heading - toward))) < 1e-9, 'facing the planter');
  assert.equal(act('alice', { type: 'interact', action: 'water', targetId: planter.id }).error, 'gesture_cooldown');
  advance(WATER_MS + 1);
  assert.equal(me('alice').gesture, null, 'the animation ends');
  assert.equal(act('alice', { type: 'interact', action: 'water', targetId: planter.id }).ok, true, 'and can be repeated');
  put('bob', [planter.x + 6, planter.north]);
  assert.equal(act('bob', { type: 'interact', action: 'water', targetId: planter.id }).error, 'planter_out_of_reach');
  assert.equal(act('bob', { type: 'interact', action: 'water', targetId: 'planter:nowhere:0' }).error, 'unknown_planter');
});

test('nobody waters while sitting', () => {
  const { put, act } = setup();
  put('alice', bench.approach);
  act('alice', { type: 'interact', action: 'sit', targetId: bench.id });
  assert.equal(act('alice', { type: 'interact', action: 'water', targetId: planter.id }).error, 'seated');
});

test("Jevica's own seats can be sat on, and moving or removing one stands its sitter up", () => {
  const { world, put, me, act } = setup();
  // Open, level ground on a sidewalk, away from everyone else.
  for (const id of ['alice', 'bob']) put(id, benchSeats(data).at(-1).approach);
  let item = null;
  search: for (const seat of benchSeats(data)) for (const [dx, dn] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) {
    put(ADMIN, seat.approach);
    const position = [seat.approach[0] + dx, seat.approach[1] + dn];
    const placed = act(ADMIN, { type: 'build', action: 'place', kind: 'seat', finish: 'rose', position, yaw: 0 });
    if (placed.ok) { item = placed.item; break search; }
  }
  assert.ok(item, 'the admin placed a garden seat');
  const placeId = `build:${item.id}:0`;
  put('alice', [item.position[0], item.position[1] - 0.9]);
  assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: placeId }).ok, true);
  const standAt = world.players.get('alice').seat.standAt;
  assert.equal(act('alice', { type: 'build', action: 'remove', id: item.id }).error, 'admin_only', 'only Jevica builds');
  assert.equal(act(ADMIN, { type: 'build', action: 'remove', id: item.id }).ok, true);
  assert.equal(me('alice').seat, null);
  assert.ok(Math.hypot(me('alice').position[0] - standAt[0], me('alice').position[1] - standAt[1]) < 1e-9);
});

test('a seated player survives a checkpoint', () => {
  const { world, put, act } = setup();
  put('alice', bench.approach);
  act('alice', { type: 'interact', action: 'sit', targetId: bench.id });
  const restored = createSharedWorld(data, { now: () => 1_000_000, isAdmin: id => id === ADMIN });
  assert.equal(restored.restore(world.checkpoint()).ok, true);
  assert.deepEqual(restored.snapshot().players.find(player => player.id === 'alice').seat, { id: bench.id, heading: bench.heading, height: bench.height });
});

test('townspeople rest on storefront benches in the shared town, and a player cannot take their place', () => {
  const { world, put, act, advance } = setup();
  let seated = null;
  for (let second = 0; second < 90 && !seated; second++) {
    advance(1000); world.step(1);
    seated = world.snapshot().locals.find(local => local.life?.seat);
  }
  assert.ok(seated, 'a resident sat on a bench within a minute and a half');
  const place = benchSeats(data).find(seat => seat.id === seated.life.seat.id);
  assert.deepEqual(seated.life.seat, { id: place.id, heading: place.heading, height: place.height });
  assert.ok(Math.hypot(seated.position[0] - place.x, seated.position[1] - place.north) < 1e-9);
  put('alice', place.approach);
  assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: place.id }).error, 'seat_taken');
});

test('moving a seat Jevica built stands its sitter up', () => {
  const { world, put, me, act } = setup();
  for (const id of ['alice', 'bob']) put(id, benchSeats(data).at(-1).approach);
  let item = null;
  search: for (const seat of benchSeats(data)) for (const [dx, dn] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) {
    put(ADMIN, seat.approach);
    const placed = act(ADMIN, { type: 'build', action: 'place', kind: 'armchair', finish: 'teal', position: [seat.approach[0] + dx, seat.approach[1] + dn], yaw: 0 });
    if (placed.ok) { item = placed.item; break search; }
  }
  assert.ok(item);
  put('alice', [item.position[0], item.position[1] - 1]);
  assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: `build:${item.id}:0` }).ok, true);
  // Move the chair clear of its sitter; the sitter does not ride along.
  let moved = null;
  for (const [dx, dn] of [[2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2], [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]]) {
    const result = act(ADMIN, { type: 'build', action: 'edit', id: item.id, position: [item.position[0] + dx, item.position[1] + dn], yaw: 0 });
    if (result.ok) { moved = result; break; }
  }
  assert.ok(moved, 'the admin moved the chair');
  assert.equal(me('alice').seat, null, 'the sitter stood up');
});

test('a watering player keeps facing the planter while their camera moves, and walking off ends it', () => {
  const { put, me, act } = setup();
  put('alice', [planter.x + 1.2, planter.north]);
  act('alice', { type: 'interact', action: 'water', targetId: planter.id });
  const facing = me('alice').yaw, still = me('alice').position;
  assert.equal(act('alice', { type: 'pose', position: still, yaw: facing + 1.4, altitude: 0 }).ok, true);
  assert.equal(me('alice').yaw, facing, 'a camera turn does not turn the body');
  assert.equal(me('alice').gesture, 'water');
  const step = [still[0] + 0.32, still[1]];
  act('alice', { type: 'pose', position: [...step, environment.groundAt(step[0], -step[1])], yaw: facing, altitude: 0 });
  assert.equal(me('alice').gesture, null, 'walking off stops watering');
});

test('a pose sent from the standing spot before the town seated the player does not stand them up', () => {
  const { put, me, act } = setup();
  put('alice', bench.approach);
  const before = me('alice').position;
  act('alice', { type: 'interact', action: 'sit', targetId: bench.id });
  // Still in flight when the seat was granted.
  assert.equal(act('alice', { type: 'pose', position: before, yaw: 0, altitude: 0 }).ok, true);
  assert.equal(me('alice').seat?.id, bench.id, 'still seated');
  assert.ok(Math.hypot(me('alice').position[0] - bench.x, me('alice').position[1] - bench.north) < 1e-9, 'still on the seat');
});

test('a seat or planter is never used through a wall or a shop window', () => {
  const { put, act } = setup();
  // An indoor spot within reach of an outdoor site, just behind the shopfront.
  const indoorNear = (site, reach) => {
    for (const store of data.stores) {
      const [fx, fn] = store.facade, [nx, ny] = store.outward;
      for (let along = -9; along <= 9; along += 0.25) {
        const spot = [fx - nx * 0.5 + ny * along, fn - ny * 0.5 - nx * along];
        if (environment.roomAt(spot[0], -spot[1]) && !environment.roomAt(site.x, -site.north)
          && Math.hypot(spot[0] - site.x, spot[1] - site.north) <= reach) return spot;
      }
    }
    return null;
  };
  const seat = benchSeats(data).find(place => indoorNear(place, 2));
  const planterBehindGlass = boutiquePlanters(data).find(item => indoorNear(item, 2.2));
  assert.ok(planterBehindGlass, 'a door planter within reach of an indoor spot');
  put('alice', indoorNear(planterBehindGlass, 2.2));
  assert.equal(act('alice', { type: 'interact', action: 'water', targetId: planterBehindGlass.id }).error, 'planter_out_of_reach');
  if (seat) {
    put('alice', indoorNear(seat, 2));
    assert.equal(act('alice', { type: 'interact', action: 'sit', targetId: seat.id }).error, 'seat_out_of_reach');
  }
  // From the pavement, the same planter is fine.
  const store = data.stores.find(item => planterBehindGlass.id.startsWith(`planter:${item.id}:`));
  put('alice', [planterBehindGlass.x + store.outward[0] * 1.2, planterBehindGlass.north + store.outward[1] * 1.2]);
  assert.equal(act('alice', { type: 'interact', action: 'water', targetId: planterBehindGlass.id }).ok, true);
});
