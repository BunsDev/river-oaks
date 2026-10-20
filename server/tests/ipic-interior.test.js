import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { benchSeats } from '../../preview/src/world-interactions.js';
import { IPIC_SCREEN, ipicFloor } from '../../preview/src/ipic-plan.js';
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const env = createWalkingEnvironment(data), room = env.rooms.find(r => r.interior);

function fixture(checkpoint) {
  let time = 1000;
  const town = createSharedWorld(data, { now: () => time });
  if (checkpoint) assert.deepEqual(town.restore(checkpoint), { ok: true });
  else town.join({ userId: 'ipic-guest', name: 'Cinema visitor' });
  const command = message => { time += 1200; return town.command('ipic-guest', message); };
  if (!checkpoint) assert.equal(command({ type: 'travel', storeId: room.storeId, mode: 'enter' }).ok, true);
  return { town, command, player: () => town.snapshot().players.find(p => p.id === 'ipic-guest') };
}

function walk(f, a, d) {
  const target = room.toWorld(a, d), start = f.player().position;
  const length = Math.hypot(target[0] - start[0], target[1] - start[1]), count = Math.ceil(length / .12);
  for (let i = 1; i <= count; i++) {
    const x = start[0] + (target[0] - start[0]) * i / count, n = start[1] + (target[1] - start[1]) * i / count;
    const moved = f.command({ type: 'pose', position: [x, n, env.groundAt(x, -n)], yaw: 0, altitude: 0 });
    assert.equal(moved.ok, true, `${a},${d}: ${moved.error}`);
  }
}

// Up the escalator, through the cinema doorway, along the cross-aisle behind the back row and down
// the side aisle over both risers to the legroom in front of the front row's first recliner.
const FRONT = room.ipicSeats.find(s => s.key === 'recliner-2-0'), BACK = room.ipicSeats.find(s => s.key === 'recliner-0-0');
const route = [[-1.4, 4.8], [-1.4, 20.7], [-1.4, 24.5], [-4.85, 24.5], [-4.7, 26.7], [FRONT.approach[0], 26.7], FRONT.approach];

test('shared visitor walks both flights, sits, stands, restores checkpoint, and returns', () => {
  let f = fixture();
  route.forEach(p => walk(f, ...p));
  // The route ends on the front row's floor, the lowest of the rake.
  assert.equal(f.player().position[2], room.floor + ipicFloor(route.at(-1)[1], route.at(-1)[0]));
  assert.ok(ipicFloor(FRONT.d, FRONT.a) < ipicFloor(BACK.d, BACK.a) - .5, 'below the back row');
  const seat = benchSeats(data).find(s => s.buildId === `bench:ipic-${FRONT.key}`);
  assert.ok(seat, 'auditorium has a shared seat');
  const seated = f.command({ type: 'sit', buildId: seat.buildId, slot: 0 });
  assert.equal(seated.ok, true, seated.error);
  assert.equal(seated.player.position[2], room.floor + ipicFloor(FRONT.d, FRONT.a));
  assert.equal(f.command({ type: 'pose', position: [0, 0, 0], yaw: 0, altitude: 0 }).error, 'stand_before_moving');
  f.town.join({ userId: 'second-guest', name: 'Second visitor' });
  assert.equal(f.town.command('second-guest', { type: 'sit', buildId: seat.buildId, slot: 0 }).error, 'seat_occupied');
  f = fixture(f.town.checkpoint());
  assert.equal(f.player().sitting.buildId, seat.buildId);
  assert.equal(f.town.command('second-guest', { type: 'sit', buildId: seat.buildId, slot: 0 }).error, 'seat_occupied');
  const stood = f.command({ type: 'stand' }); assert.equal(stood.ok, true, stood.error);
  // Back up the side aisle and along the cross-aisle to the doorway.
  walk(f, FRONT.approach[0], 26.7); walk(f, -4.7, 26.7); walk(f, -4.85, 24.5); walk(f, -1.4, 24.5);
  walk(f, -1.4, 20.7); walk(f, -1.4, 4.8); walk(f, 0, 1);
  assert.equal(f.command({ type: 'travel', storeId: room.storeId, mode: 'leave' }).ok, true);
  assert.equal(env.roomAt(f.player().position[0], -f.player().position[1]), null);
});

test('recliner sitters see the screen from the seated eye; every other seat keeps the walking camera', () => {
  // A recliner's back stands 1.55 m above the floor, above the seated eye, so a camera behind it
  // sees only leather (#368). The seat names the pitch that aims the seated eye (0.65 m above the
  // cushion, as walking-ui places it) at the screen centre.
  const sites = benchSeats(data), recliners = sites.filter(s => s.buildId.startsWith('bench:ipic-recliner-'));
  assert.equal(recliners.length, 9);
  for (const site of recliners) {
    const seat = room.ipicSeats.find(s => `bench:ipic-${s.key}` === site.buildId);
    const toScreen = (seat.a - IPIC_SCREEN.a) * IPIC_SCREEN.facing[0] + (seat.d - IPIC_SCREEN.d) * IPIC_SCREEN.facing[1];
    const aimed = ipicFloor(seat.d, seat.a) - 6 + seat.height + .65 + Math.tan(site.eyePitch) * toScreen;
    assert.ok(Math.abs(aimed - IPIC_SCREEN.y) < 1e-9, `${site.buildId} aims at the screen centre`);
  }
  const pitch = id => recliners.find(s => s.buildId === id).eyePitch;
  assert.ok(pitch(`bench:ipic-${FRONT.key}`) > pitch(`bench:ipic-${BACK.key}`), 'the front row looks up further');
  assert.ok(sites.filter(s => !s.buildId.startsWith('bench:ipic-recliner-')).every(s => !('eyePitch' in s)), 'benches, café chairs and the lounge sofa keep the boom');
  // The server publishes it with the seated pose; the checkpoint still holds only the claim.
  const f = fixture();
  route.forEach(p => walk(f, ...p));
  const buildId = `bench:ipic-${FRONT.key}`, seated = f.command({ type: 'sit', buildId, slot: 0 });
  assert.equal(seated.ok, true, seated.error);
  assert.equal(seated.player.sitting.eyePitch, pitch(buildId));
  assert.equal(f.player().sitting.eyePitch, pitch(buildId));
  assert.deepEqual(f.town.checkpoint().payload.players.find(p => p.id === 'ipic-guest').sitting, { buildId, slot: 0 });
});

test('shared IPIC traversal rejects false height, solid railings and remote seating', () => {
  const f = fixture();
  const p = f.player();
  assert.equal(f.command({ type: 'pose', position: [p.position[0], p.position[1], room.floor + 6], yaw: 0, altitude: 0 }).error, 'invalid_ground');
  assert.equal(f.command({ type: 'sit', buildId: 'bench:ipic-recliner-0-0', slot: 0 }).error, 'seat_out_of_reach');
  walk(f, -1.4, 4.8); walk(f, -1.4, 8);
  const [x, n] = room.toWorld(0, 8);
  assert.equal(f.command({ type: 'pose', position: [x, n, env.groundAt(x, -n)], yaw: 0, altitude: 0 }).error, 'blocked');
});
