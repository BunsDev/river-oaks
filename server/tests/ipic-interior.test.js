import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { benchSeats } from '../../preview/src/world-interactions.js';
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

const route = [[-1.4, 4.8], [-1.4, 20.7], [-5.55, 20.7], [-5.55, 24.7], [-4.85, 24.7], [-4.85, 29]];

test('shared visitor walks both flights, sits, stands, restores checkpoint, and returns', () => {
  let f = fixture();
  route.forEach(p => walk(f, ...p));
  assert.equal(f.player().position[2], room.floor + 6);
  const seat = benchSeats(data).find(s => s.buildId === 'bench:ipic-recliner-0-0');
  assert.ok(seat, 'auditorium has a shared seat');
  const seated = f.command({ type: 'sit', buildId: seat.buildId, slot: 0 });
  assert.equal(seated.ok, true, seated.error);
  assert.equal(seated.player.position[2], room.floor + 6);
  assert.equal(f.command({ type: 'pose', position: [0, 0, 0], yaw: 0, altitude: 0 }).error, 'stand_before_moving');
  f.town.join({ userId: 'second-guest', name: 'Second visitor' });
  assert.equal(f.town.command('second-guest', { type: 'sit', buildId: seat.buildId, slot: 0 }).error, 'seat_occupied');
  f = fixture(f.town.checkpoint());
  assert.equal(f.player().sitting.buildId, seat.buildId);
  assert.equal(f.town.command('second-guest', { type: 'sit', buildId: seat.buildId, slot: 0 }).error, 'seat_occupied');
  const stood = f.command({ type: 'stand' }); assert.equal(stood.ok, true, stood.error);
  // Reach the left aisle using the clear space in front of the first row.
  walk(f, -4.85, 29.65); walk(f, -4.85, 24.7); walk(f, -5.55, 24.7);
  walk(f, -5.55, 20.7); walk(f, -1.4, 20.7); walk(f, -1.4, 4.8); walk(f, 0, 1);
  assert.equal(f.command({ type: 'travel', storeId: room.storeId, mode: 'leave' }).ok, true);
  assert.equal(env.roomAt(f.player().position[0], -f.player().position[1]), null);
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
