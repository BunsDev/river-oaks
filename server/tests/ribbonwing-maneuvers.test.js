import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedWorld as createWorld } from '../world.js';
import { RIBBONWING_MANEUVERS, RIBBONWING_MANEUVER_KINDS, maneuverMinimumAltitude, maneuverPose, maneuverSample } from '../../preview/src/ribbonwing-maneuvers.js';

// The Ribbonwing's maneuvers are server-owned (#777): admitted for the entitled
// owner in the craft, high and clear enough to recover, then published with a
// server start time that every client replays.
const OWNER = 'user_01M40Y914S1H4EJCEHH91DKTAY';
const data = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, -14, 0], collisionPolygons: [], stores: [], buildings: [], communityLocations: [] };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function setup() {
  let time = 1000;
  const world = createWorld(data, { now: () => time, isAdmin: () => false });
  world.join({ userId: OWNER, name: 'Jevica' });world.join({ userId: 'guest', name: 'Guest' });
  const self = (id = OWNER) => world.snapshot().players.find(player => player.id === id);
  // Climb in the Ribbonwing at the 3.2 m/s lift budget, facing north (heading pi/2 = yaw -pi/2).
  const climb = (altitude, yaw = -Math.PI / 2) => {
    let { position, altitude: at } = self();
    while (at < altitude) { time += 1000;at = Math.min(altitude, at + 3.2);const reply = world.command(OWNER, { type: 'pose', position, yaw, altitude: at, vehicle: 'hover' });assert.equal(reply.ok, true, JSON.stringify(reply));position = reply.player.position; }
    time += 1000;assert.equal(world.command(OWNER, { type: 'pose', position, yaw, altitude, vehicle: 'hover' }).ok, true);
  };
  let seq = 0;
  const fly = (kind, extra = {}) => world.command(OWNER, { type: 'maneuver', kind, id: `m${++seq}`, seq, ...extra });
  return { world, self, climb, fly, advance: ms => { time += ms; }, get time() { return time; }, get seq() { return seq; } };
}

test('every authored maneuver ends level on its heading, needs recovery altitude and sweeps no faster than the craft can fly', () => {
  for (const kind of RIBBONWING_MANEUVER_KINDS) {
    const { duration } = RIBBONWING_MANEUVERS[kind], start = maneuverSample(kind, 0), end = maneuverSample(kind, 1);
    for (const value of [start.roll, start.pitch, start.left, start.up, start.tuck]) assert.ok(close(value, 0, 1e-2), `${kind} starts level`);
    assert.ok(close(Math.sin(end.roll), 0, 1e-6) && close(Math.cos(end.roll), 1, 1e-6) && close(Math.cos(end.pitch), 1, 1e-3) && close(end.tuck, 0, 1e-6) && close(end.left, 0, 1e-6), `${kind} ends level`);
    assert.ok(maneuverMinimumAltitude(kind) >= 3 && duration >= 2000 && duration <= 5000, kind);
    // Centre speed stays under 14 m/s at every instant.
    for (let i = 1; i <= 400; i++) { const a = maneuverSample(kind, (i - 1) / 400), b = maneuverSample(kind, i / 400);assert.ok(Math.hypot(b.forward - a.forward, b.left - a.left, b.up - a.up) / (duration / 400 / 1000) < 14, `${kind} speed at ${i}`); }
  }
});

test('only the entitled owner in the Ribbonwing, high enough and clear to recover, is admitted', () => {
  const t = setup();
  assert.equal(t.world.command('guest', { type: 'maneuver', kind: 'roll', id: 'g1', seq: 1 }).error, 'exclusive_vehicle');
  assert.equal(t.fly('roll').error, 'maneuver_requires_ribbonwing', 'on foot');
  for (const bad of [{ kind: 'barrel' }, { id: 'has space' }, { seq: 0 }, { seq: 1.5 }, { heading: 0 }, { extra: true }]) assert.equal(t.world.command(OWNER, { type: 'maneuver', kind: 'roll', id: 'x1', seq: 99, ...bad }).error, 'invalid_maneuver', JSON.stringify(bad));
  t.climb(2);
  assert.equal(t.fly('roll').error, 'maneuver_too_low', 'the wingtips would strike the ground');
  t.climb(5);
  assert.equal(t.fly('tuck_dive').error, 'maneuver_too_low', 'the dive needs room to pull out');
  // Facing west from 12 m inside the west edge, a 22 m roll leaves the world.
  t.climb(5, 0);
  assert.equal(t.fly('roll').error, 'maneuver_blocked');
  t.climb(25);
  assert.equal(t.fly('loop').error, 'maneuver_ceiling');
  assert.deepEqual([t.self().altitude, t.self().maneuver], [25, undefined], 'refusals change nothing');
});

test('an admitted maneuver owns the pose on every client, refuses stale, duplicate and fighting input, and settles at its end', () => {
  const t = setup();t.climb(6);
  const before = t.self(), reply = t.fly('roll');
  assert.equal(reply.ok, true, JSON.stringify(reply));assert.equal(reply.serverTimeMs, t.time);
  const published = reply.player.maneuver;
  assert.deepEqual([published.kind, published.startedAt, published.duration, published.origin], ['roll', t.time, 2600, before.position.slice(0, 2)]);
  assert.ok(close(published.heading, Math.PI / 2), 'flies the way the craft faces (north)');
  // Observers read the same path from the snapshot.
  t.advance(1300);
  const halfway = t.self('guest') && t.world.snapshot().players.find(p => p.id === OWNER), expected = maneuverPose(published, t.time);
  assert.ok(close(halfway.position[1], expected.north) && close(halfway.altitude, expected.altitude), 'the snapshot carries the server path');
  assert.ok(halfway.position[1] > before.position[1] + 9);
  // A client pose cannot fight the path; a retry replays; older and concurrent requests are refused.
  const fighting = t.world.command(OWNER, { type: 'pose', position: before.position, yaw: -Math.PI / 2, altitude: 6, vehicle: 'hover' });
  assert.deepEqual([fighting.error, fighting.correction], ['maneuver_active', undefined], 'refused without a correction that would unseat the pilot');
  const retry = t.world.command(OWNER, { type: 'maneuver', kind: 'roll', id: 'm1', seq: 1 });
  assert.equal(retry.replayed, true);assert.equal(retry.player.maneuver.startedAt, published.startedAt, 'a duplicate does not restart');
  assert.equal(t.world.command(OWNER, { type: 'maneuver', kind: 'loop', id: 'old', seq: 1 }).error, 'stale_maneuver');
  assert.equal(t.fly('loop').error, 'maneuver_active');
  // At its end the craft is level where the path ends and poses resume from there.
  t.advance(1400);
  const after = t.self(), end = maneuverPose(published, published.startedAt + 2600);
  assert.equal(after.maneuver, undefined);
  assert.ok(close(after.position[1], end.north) && close(after.position[0], end.east) && close(after.altitude, 6));
  // The pilot's first pose arrives a frame after the end with the hover's small drift, and is accepted
  // (a refusal would carry a correction that unseats them).
  t.advance(20);
  const first = t.world.command(OWNER, { type: 'pose', position: [after.position[0] + .12, after.position[1] + .12, after.position[2]], yaw: -Math.PI / 2, altitude: 6.1, vehicle: 'hover' });
  assert.equal(first.ok, true, JSON.stringify(first.error));
  t.advance(1000);
  assert.equal(t.world.command(OWNER, { type: 'pose', position: after.position, yaw: -Math.PI / 2, altitude: 6, vehicle: 'hover' }).ok, true);
  assert.equal(t.world.command(OWNER, { type: 'maneuver', kind: 'roll', id: 'm1', seq: 1 }).replayed, true, 'the finished id still replays');
});

test('a checkpoint keeps the admitted maneuver, so a restored instance replays the same path; forged ones fail closed', () => {
  const t = setup();t.climb(10);
  const reply = t.fly('tuck_dive');assert.equal(reply.ok, true, JSON.stringify(reply));
  t.advance(1000);
  const saved = JSON.parse(JSON.stringify(t.world.checkpoint()));
  const record = saved.payload.players.find(p => p.id === OWNER);
  const { duration, ...admitted } = reply.player.maneuver;
  assert.deepEqual([record.maneuver, record.maneuverSeq, duration], [admitted, 1, 3400]);
  assert.ok(t.self().maneuver, 'the checkpoint does not end the live maneuver');
  // Another instance restores it mid-dive and publishes the same pose at the same time.
  const restored = createWorld(data, { now: () => t.time, isAdmin: () => false });
  assert.deepEqual(restored.restore(saved), { ok: true });
  const live = t.self(), back = restored.snapshot().players.find(p => p.id === OWNER);
  assert.deepEqual([back.position, back.altitude, back.maneuver], [live.position, live.altitude, live.maneuver]);
  assert.equal(restored.command(OWNER, { type: 'maneuver', kind: 'roll', id: 'again', seq: 1 }).error, 'stale_maneuver', 'seq survives a restore');
  assert.equal(restored.command(OWNER, { type: 'maneuver', kind: 'roll', id: 'm1', seq: 2 }).replayed, true, 'and so does the id');
  // A forged or inconsistent maneuver fails the whole checkpoint.
  const forge = change => { const copy = JSON.parse(JSON.stringify(saved));change(copy.payload.players.find(p => p.id === OWNER));return createWorld(data, { now: () => t.time, isAdmin: () => false }).restore(copy).ok; };
  for (const [name, change] of [
    ['moved origin', p => { p.maneuver.origin[0] += 5; }], ['other heading', p => { p.maneuver.heading += .5; }], ['raised', p => { p.maneuver.altitude += 3; }],
    ['unknown kind', p => { p.maneuver.kind = 'barrel'; }], ['seq mismatch', p => { p.maneuver.seq = 7; }], ['future start', p => { p.maneuver.startedAt = t.time + 60000; }],
    ['extra field', p => { p.maneuver.speed = 40; }], ['out of the craft', p => { p.vehicle = null;p.altitude = 0;p.maneuver.altitude = 0; }],
  ]) assert.equal(forge(change), false, name);
  // A restore long after the path ended settles at its end, level.
  const late = createWorld(data, { now: () => t.time + 60000, isAdmin: () => false });
  assert.deepEqual(late.restore(saved), { ok: true });
  const done = late.snapshot().players.find(p => p.id === OWNER), end = maneuverPose(reply.player.maneuver, reply.player.maneuver.startedAt + 3400);
  assert.equal(done.maneuver, undefined);assert.ok(close(done.position[1], end.north) && close(done.altitude, end.altitude));
});

test('revocation mid-maneuver recovers to a level hover at the current path point on the next tick', () => {
  const t = setup();t.climb(10);
  const reply = t.fly('tuck_dive');assert.equal(reply.ok, true);
  t.advance(1200);
  t.world.players.get(OWNER).vehicle = null;
  t.world.step(.05);
  const recovered = t.world.snapshot().players.find(p => p.id === OWNER), now = maneuverPose(reply.player.maneuver, t.time);
  assert.equal(recovered.maneuver, undefined);
  assert.ok(close(recovered.position[1], now.north) && close(recovered.altitude, now.altitude) && recovered.altitude >= 3, JSON.stringify(recovered));
  assert.equal(t.world.command(OWNER, { type: 'maneuver', kind: 'roll', id: 'm1', seq: 1 }).replayed, true, 'the ended id still replays');
});

test('a silent pilot (focus lost, no commands) still ends level on the world tick', () => {
  const t = setup();t.climb(6);
  const { player } = t.fly('loop');
  t.advance(RIBBONWING_MANEUVERS.loop.duration + 50);
  t.world.step(.05);
  const record = t.world.players.get(OWNER), end = maneuverPose(player.maneuver, player.maneuver.startedAt + RIBBONWING_MANEUVERS.loop.duration);
  assert.equal(record.maneuver, undefined);
  assert.ok(close(record.position[1], end.north) && close(record.altitude, 6));
});

test('leaving mid-maneuver drops it with the player, and a rejoin starts from a recovered hover', () => {
  const t = setup();t.climb(6);
  assert.equal(t.fly('petal_roll').ok, true);
  t.advance(900);
  assert.equal(t.world.leave(OWNER), true);
  assert.equal(t.world.snapshot().players.some(p => p.id === OWNER), false);
  const joined = t.world.join({ userId: OWNER, name: 'Jevica' });
  assert.equal(joined.ok, true);assert.equal(joined.player.maneuver, undefined);
});
