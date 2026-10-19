// #364: IPIC routes, seats and false claims through the authoritative world,
// walking the routes the plan analysis finds for measured bodies
// (preview/src/ipic-circulation.js) with the other seats occupied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { LEAVE_GRACE_MS, createRedisRoom } from '../redis-room.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { AVATAR_ENVELOPE } from '../../preview/src/workplace-room.js';
import { IPIC_SEATED_REACH, ipicClearance, ipicReachable, seatApproach, seatedFootprint, widestRoute } from '../../preview/src/ipic-circulation.js';
import { ipicFloor } from '../../preview/src/ipic-plan.js';
import { SEAT_REACH } from '../../preview/src/shared-seating.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const env = createWalkingEnvironment(data), room = env.rooms.find(r => r.interior === 'ipic-photo-v1');
const seatId = seat => `bench:ipic-${seat.key}`;
const local = position => room.toLocal(position[0], position[1]);
const groundAt = ([a, d]) => { const [x, n] = room.toWorld(a, d); return env.groundAt(x, -n); };
const DOOR = [0, -.6];
// The back row's end recliner by the doorway, a lounge point behind the cinema wall near it, the
// cross-aisle behind the back row, and the wing's front aisle west of the main rectangle.
const BACK_END = room.ipicSeats.find(s => s.key === 'recliner-0-0');
const LOUNGE_CORNER = [-5.8, 24.8], CROSS_AISLE = [-8.25, 26.7], FRONT_AISLE = [-14.25, 29];

function town() {
  let time = 1000;
  const world = createSharedWorld(data, { now: () => time });
  const command = (userId, message) => { time += 150; return world.command(userId, message); };
  const player = userId => world.snapshot().players.find(p => p.id === userId);
  // Walk a room-frame path one short pose at a time, as a client would.
  function walk(userId, path) {
    let from = player(userId).position;
    for (const [a, d] of corners(path)) {
      const [x, north] = room.toWorld(a, d);
      const count = Math.max(1, Math.ceil(Math.hypot(x - from[0], north - from[1]) / .12));
      for (let i = 1; i <= count; i++) {
        const e = from[0] + (x - from[0]) * i / count, n = from[1] + (north - from[1]) * i / count;
        const moved = command(userId, { type: 'pose', position: [e, n, env.groundAt(e, -n)], yaw: 0, altitude: 0 });
        assert.equal(moved.ok, true, `${userId} at ${local([e, n]).map(v => v.toFixed(2))}: ${moved.error}`);
      }
      from = [x, north];
    }
  }
  const enter = userId => {
    const entered = command(userId, { type: 'travel', storeId: room.storeId, mode: 'enter' });
    assert.equal(entered.ok, true, entered.error);
    return local(entered.player.position);
  };
  return { world, command, player, walk, enter, advance(ms) { time += ms; } };
}

// A grid path's turning points: straight runs between them stay on the path.
function corners(path) {
  const kept = path.filter((p, i) => i === 0 || i === path.length - 1
    || Math.sign(p[0] - path[i - 1][0]) !== Math.sign(path[i + 1][0] - p[0]) || Math.sign(p[1] - path[i - 1][1]) !== Math.sign(path[i + 1][1] - p[1]));
  return kept.slice(1);
}

// The widest route between two room points, as waypoints the server walks.
// Its path also keeps to cells the server's own collision accepts.
const serverFree = ([a, d]) => { const [x, n] = room.toWorld(a, d); return env.isFree(x, -n); };
function route(from, to, blockers = []) {
  const found = widestRoute(room, from, to, { blockers, step: .1, free: serverFree });
  assert.ok(found?.path, `no route ${from} -> ${to}`);
  return found;
}

test('the server walks each escalator lane up and the other down, on routes wide enough for the widest body', () => {
  for (const [up, down] of [[-1.4, 1.4], [1.4, -1.4]]) {
    const t = town();
    t.world.join({ userId: 'visitor', name: 'Visitor' });
    const start = t.enter('visitor');
    const legs = [route(start, [up, 9]), route([up, 9], [up, 20.6]), route([up, 20.6], [down, 17]), route([down, 17], [down, 6.5]), route([down, 6.5], DOOR)];
    for (const leg of legs) t.walk('visitor', leg.path);
    // The lanes themselves are 1.71 m between glass rails: a straight widest body fits.
    for (const leg of legs.slice(0, 4)) assert.ok(leg.clearance >= AVATAR_ENVELOPE.bodyHalfWidth, `lane pinch ${leg.clearance.toFixed(3)} at ${leg.pinch}`);
    const top = Math.max(...legs[1].path.map(groundAt));
    assert.ok(Math.abs(top - (room.floor + 6)) < 1e-9, 'the up lane reaches the upper floor');
    assert.equal(t.command('visitor', { type: 'travel', storeId: room.storeId, mode: 'leave' }).ok, true);
    assert.equal(env.roomAt(t.player('visitor').position[0], -t.player('visitor').position[1]), null);
  }
});

// Where a sitter stands to take a seat: its approach if the server body fits
// there, otherwise the clearest point the server reaches within 1.6 m that
// sees the seat (the server seats anyone within 3.6 m with a sight line).
function sitSpot(seat, blockers, from) {
  const approach = seatApproach(seat);
  if (serverFree(approach)) return approach;
  const reachable = ipicReachable(room, from, { radius: 0, blockers, step: .1, free: serverFree }), candidates = [];
  for (let a = seat.a - 1.6; a <= seat.a + 1.6; a += .1) for (let d = seat.d - 1.6; d <= seat.d + 1.6; d += .1) {
    if (Math.hypot(a - seat.a, d - seat.d) <= 1.6 && reachable([a, d])) candidates.push({ point: [a, d], clearance: ipicClearance(room, [a, d], blockers) });
  }
  const eye = ([a, d]) => { const [x, n] = room.toWorld(a, d); return [x, n, env.groundAt(x, -n) + 1.68]; };
  const [sx, sn] = room.toWorld(seat.a, seat.d), cushion = [sx, sn, room.floor + ipicFloor(seat.d, seat.a) + seat.height + .6];
  const spot = candidates.sort((x, y) => y.clearance - x.clearance).find(c => env.hasSightLine(eye(c.point), cushion));
  assert.ok(spot, `nowhere to sit in ${seat.key}:${seat.slot} from`);
  return spot.point;
}

// Ten occupants hold every seat; checkpointed once and restored per case.
function seatedTown() {
  const t = town();
  const occupants = room.ipicSeats.map((seat, index) => ({ seat, id: `occupant-${index}` }));
  for (const { id } of occupants) t.world.join({ userId: id, name: id });
  t.world.join({ userId: 'walker', name: 'Walker' });
  t.world.join({ userId: 'contender', name: 'Contender' });
  for (const { seat, id } of occupants) {
    const start = t.enter(id);
    t.walk(id, route(start, sitSpot(seat, [], start)).path);
    const sat = t.command(id, { type: 'sit', buildId: seatId(seat), slot: seat.slot });
    assert.equal(sat.ok, true, `${id} sits in ${seatId(seat)}: ${sat.error}`);
  }
  return { occupants, checkpoint: t.world.checkpoint() };
}
let seated;
const occupiedTown = () => (seated ??= seatedTown());

// One seat's occupant disconnects; a walker comes in through the street door
// past the nine seated bodies, takes the seat, and keeps it from a contender.
function takeSeat(seat) {
  const { occupants, checkpoint } = occupiedTown(), t = town();
  assert.deepEqual(t.world.restore(checkpoint), { ok: true });
  for (const other of occupants) assert.equal(t.player(other.id).sitting?.buildId, seatId(other.seat), 'restored sessions keep their seats');
  const blockers = occupants.filter(o => o.seat !== seat).map(o => seatedFootprint(o.seat, IPIC_SEATED_REACH));
  // The occupant disconnects; the seat is free at once (the transport's grace is not modelled here).
  assert.equal(t.world.leave(occupants.find(o => o.seat === seat).id), true);
  const start = t.enter('walker'), spot = sitSpot(seat, blockers, start);
  t.walk('walker', route(start, spot, blockers).path);
  const sat = t.command('walker', { type: 'sit', buildId: seatId(seat), slot: seat.slot });
  assert.equal(sat.ok, true, `walker sits in ${seatId(seat)}: ${sat.error}`);
  assert.equal(t.command('contender', { type: 'sit', buildId: seatId(seat), slot: seat.slot }).error, 'seat_occupied');
  const held = t.player('walker').position;
  assert.equal(t.command('walker', { type: 'pose', position: [held[0] + .5, held[1], held[2]], yaw: 0, altitude: 0 }).error, 'stand_before_moving');
  return { t, blockers };
}

test('every recliner is reached, held exclusively, stood from and left with every other seat occupied', () => {
  for (const seat of room.ipicSeats.filter(s => s.key.startsWith('recliner'))) {
    const { t, blockers } = takeSeat(seat);
    const stood = t.command('walker', { type: 'stand' });
    assert.equal(stood.ok, true, `${seatId(seat)} stand: ${stood.error}`);
    assert.equal(stood.player.position[2], room.floor + ipicFloor(seat.stand[1], seat.stand[0]), 'stands on its row\'s floor');
    t.walk('walker', route(local(stood.player.position), DOOR, blockers).path);
    assert.equal(t.command('walker', { type: 'travel', storeId: room.storeId, mode: 'leave' }).ok, true);
  }
});

test('both lounge sofa places are reached, held exclusively, stood from and left with every other seat occupied', () => {
  for (const seat of room.ipicSeats.filter(s => s.key === 'lounge-sofa')) {
    const { t, blockers } = takeSeat(seat);
    const stood = t.command('walker', { type: 'stand' });
    assert.equal(stood.ok, true, `${seatId(seat)}:${seat.slot} stand: ${stood.error}`);
    assert.equal(stood.player.position[2], room.floor + 6, 'stands on the lounge floor');
    t.walk('walker', route(local(stood.player.position), DOOR, blockers).path);
    assert.equal(t.command('walker', { type: 'travel', storeId: room.storeId, mode: 'leave' }).ok, true);
  }
});

// The sofa's back, arms and coffee table leave no straight clear path for the server's radial
// stand search, so each place names where its sitter steps out (ipic-plan.js): the open floor
// at that place's front corner, beside the table, since the arms meet the wall and the escalator.
test('standing from either sofa place in an empty lounge steps out beside the sofa onto open floor', () => {
  for (const seat of room.ipicSeats.filter(s => s.key === 'lounge-sofa')) {
    const t = town();
    t.world.join({ userId: 'walker', name: 'Walker' });
    const start = t.enter('walker');
    t.walk('walker', route(start, sitSpot(seat, [], start)).path);
    assert.equal(t.command('walker', { type: 'sit', buildId: seatId(seat), slot: seat.slot }).ok, true);
    const stood = t.command('walker', { type: 'stand' });
    assert.equal(stood.ok, true, `${seat.slot}: ${stood.error}`);
    const [a, d] = local(stood.player.position);
    assert.ok(serverFree([a, d]) && d > seat.d && d < seat.d + 1.2 && Math.abs(a - seat.a) < 1.6, `slot ${seat.slot} stood at ${a.toFixed(2)},${d.toFixed(2)}`);
    t.walk('walker', route([a, d], DOOR).path);
  }
});

test('IPIC refuses false heights, solid shortcuts, teleports, a working lift and seats through walls', () => {
  const t = town();
  t.world.join({ userId: 'visitor', name: 'Visitor' });
  t.world.join({ userId: 'friend', name: 'Friend' });
  const start = t.enter('visitor');
  const pose = (a, d, z) => { const [x, n] = room.toWorld(a, d); return t.command('visitor', { type: 'pose', position: [x, n, z ?? env.groundAt(x, -n)], yaw: 0, altitude: 0 }); };
  t.walk('visitor', route(start, [-1.4, 9]).path);
  assert.equal(pose(-1.4, 9.1, room.floor + 6).error, 'invalid_ground', 'mid-escalator claim of the upper floor');
  assert.equal(pose(-1.4, 9.1, room.floor).error, 'invalid_ground', 'mid-escalator claim of the street floor');
  assert.equal(pose(-.6, 9).error, 'blocked', 'through the glass rail');
  assert.equal(pose(-4.85, 29).error, 'movement_too_fast', 'reception-to-auditorium teleport');
  assert.equal(t.command('visitor', { type: 'interiorLevel', portalId: 'ipic-lift' }).error, 'not_in_interior', 'the lift is decorative');
  t.walk('visitor', route([-1.4, 9], LOUNGE_CORNER).path);
  // The lounge side of the cinema wall is within reach of the back row's end recliner, but the wall hides it.
  assert.ok(Math.hypot(LOUNGE_CORNER[0] - BACK_END.a, LOUNGE_CORNER[1] - BACK_END.d) < SEAT_REACH);
  assert.equal(t.command('visitor', { type: 'sit', buildId: seatId(BACK_END), slot: 0 }).error, 'seat_out_of_reach', 'no seat through the wall');
  assert.equal(pose(LOUNGE_CORNER[0], 26.2).error, 'blocked', 'through the cinema wall beside the doorway');
  assert.equal(t.command('visitor', { type: 'sit', buildId: 'bench:ipic-recliner-3-0', slot: 0 }).error, 'invalid_seat');
  assert.equal(t.command('visitor', { type: 'sit', buildId: 'bench:ipic-recliner-0-0', slot: 1 }).error, 'invalid_seat');
  // In the legroom in front of the recliner, which faces the screen at the wing's north end.
  t.walk('visitor', route(LOUNGE_CORNER, BACK_END.approach).path);
  assert.equal(pose(BACK_END.a, BACK_END.d + .54).error, 'blocked', 'onto a recliner arm');
  assert.equal(pose(BACK_END.a - .65, BACK_END.d).error, 'blocked', 'onto a recliner footrest');
  assert.equal(pose(BACK_END.a + .5, BACK_END.d).error, 'blocked', 'onto the recliner back');
  // Beyond the main rectangle, in the wing's front aisle: still the room, so no travel lands there.
  const [ax, an] = room.toWorld(FRONT_AISLE[0], FRONT_AISLE[1]);
  assert.equal(t.command('friend', { type: 'travel', position: [ax, an] }).error, 'destination_blocked', 'no position travel into the auditorium');
  assert.equal(t.command('friend', { type: 'travel', peerId: 'visitor' }).error, 'destination_blocked', 'no peer travel into the auditorium');
  const entered = t.command('friend', { type: 'travel', storeId: room.storeId, mode: 'enter' });
  assert.ok(local(entered.player.position)[1] < 6 && entered.player.position[2] === room.floor, 'entering lands in reception');
});

test('leaving IPIC or disconnecting while seated releases the recliner', () => {
  const t = town();
  for (const id of ['first', 'second']) t.world.join({ userId: id, name: id });
  for (const id of ['first', 'second']) t.walk(id, route(t.enter(id), [-4.7, 26.6]).path);
  t.walk('first', route([-4.7, 26.6], BACK_END.approach).path);
  t.walk('second', route([-4.7, 26.6], CROSS_AISLE).path);
  const intent = { type: 'sit', buildId: 'bench:ipic-recliner-0-0', slot: 0 };
  assert.equal(t.command('first', intent).ok, true);
  assert.equal(t.command('second', intent).error, 'seat_occupied');
  const left = t.command('first', { type: 'travel', storeId: room.storeId, mode: 'leave' });
  assert.equal(left.ok, true, left.error);
  assert.equal(left.player.sitting, null);
  assert.equal(t.command('second', intent).ok, true, 'travel out released the seat');
  t.advance(1000);
  t.walk('first', route(t.enter('first'), CROSS_AISLE).path);
  assert.equal(t.command('first', intent).error, 'seat_occupied');
  assert.equal(t.world.leave('second'), true);
  assert.equal(t.command('first', intent).ok, true, 'a disconnect released the seat');
});

const testRedis = (name, fn) => test(name, { skip: !process.env.REDIS_URL }, fn);
testRedis('two coordinators give one IPIC recliner to exactly one visitor and release it after a disconnect', async t => {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: null });
  redis.on('error', () => {}); await redis.connect();
  const prefix = `{river-oaks:test:${randomUUID()}}`, rooms = [];
  let time = 100000;
  const create = () => { const r = createRedisRoom({ redis, prefix, worldData: data, authorize: async () => true, now: () => time }); rooms.push(r); return r; };
  t.after(async () => { await Promise.all(rooms.map(r => r.close())); const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  const identity = userId => ({ userId, name: userId, sessionId: `${userId}-session`, expiresAt: time + 600000 });
  // A second per command lets a pose cover up to 3.4 m; each full checkpoint restore is slow.
  const send = (coordinator, userId, message) => { time += 1000; return coordinator.request({ type: 'command', userId, connectionId: `${userId}-socket`, message }); };
  const first = create(), second = create();
  const walkers = [['bob', first], ['carol', second]];
  for (const [id, coordinator] of walkers) assert.equal((await coordinator.request({ type: 'join', identity: identity(id), connectionId: `${id}-socket` })).ok, true);
  // Both walk in through one coordinator, step for step, so neither connection
  // goes quiet; the two coordinators then race for the seat.
  const poses = [];
  for (const [id] of walkers) {
    const entered = await send(first, id, { type: 'travel', storeId: room.storeId, mode: 'enter' });
    assert.equal(entered.ok, true, entered.error);
    let position = entered.player.position; const steps = [];
    for (const [a, d] of corners(route(local(position), id === 'bob' ? BACK_END.approach : CROSS_AISLE).path)) {
      const [x, n] = room.toWorld(a, d), count = Math.max(1, Math.ceil(Math.hypot(x - position[0], n - position[1]) / 2.5));
      for (let i = 1; i <= count; i++) steps.push([position[0] + (x - position[0]) * i / count, position[1] + (n - position[1]) * i / count]);
      position = [x, n];
    }
    poses.push(steps);
  }
  for (let i = 0; i < Math.max(...poses.map(p => p.length)); i++) for (const [k, [id]] of walkers.entries()) {
    const step = poses[k][i]; if (!step) continue;
    const moved = await send(first, id, { type: 'pose', position: [...step, env.groundAt(step[0], -step[1])], yaw: 0, altitude: 0 });
    assert.equal(moved.ok, true, `${id}: ${moved.error}`);
  }
  const intent = { type: 'sit', buildId: 'bench:ipic-recliner-0-0', slot: 0 };
  const results = await Promise.all(walkers.map(([id, coordinator]) => send(coordinator, id, intent)));
  assert.equal(results.filter(r => r.ok).length, 1, JSON.stringify(results.map(r => r.error ?? 'ok')));
  assert.equal(results.find(r => !r.ok).error, 'seat_occupied');
  const view = (await first.read()).snapshot, winner = view.players.find(p => p.sitting)?.id, loser = winner === 'bob' ? 'carol' : 'bob';
  assert.equal(view.players.filter(p => p.sitting?.buildId === intent.buildId).length, 1);
  const winnerRoom = winner === 'bob' ? first : second, loserRoom = winner === 'bob' ? second : first;
  assert.equal((await winnerRoom.request({ type: 'leave', userId: winner, connectionId: `${winner}-socket` })).ok, true);
  assert.equal((await send(loserRoom, loser, intent)).error, 'seat_occupied', 'reconnect grace keeps the seat');
  time += LEAVE_GRACE_MS + 1000; await first.tick(); await second.tick();
  const taken = await send(loserRoom, loser, intent);
  assert.equal(taken.ok, true, JSON.stringify(taken));
});
