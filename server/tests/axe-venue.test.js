// The code-only axe-and-darts venue through the authoritative world: travel in and out
// by its id, axes at its lanes and darts at its board, a checkpoint round trip, and no
// reaching through its walls as if it were outdoors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { AXE_LANES, AXE_ROOM_DARTS } from '../../preview/src/axe-room-plan.js';
import { isVenueRoom } from '../../preview/src/venue-rooms.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const env = createWalkingEnvironment(data), room = env.rooms.find(isVenueRoom);

function town() {
  let time = 1000;
  const world = createSharedWorld(data, { now: () => time });
  const command = (userId, message) => { time += 150; return world.command(userId, message); };
  const player = userId => world.snapshot().players.find(p => p.id === userId);
  // Straight short poses in the room frame; the venue is open floor between its fixtures.
  function walk(userId, path) {
    let at = player(userId).position;
    for (const [a, d] of path) {
      const [x, n] = room.toWorld(a, d), count = Math.max(1, Math.ceil(Math.hypot(x - at[0], n - at[1]) / .12));
      for (let i = 1; i <= count; i++) {
        const e = at[0] + (x - at[0]) * i / count, m = at[1] + (n - at[1]) * i / count;
        const moved = command(userId, { type: 'pose', position: [e, m, env.groundAt(e, -m)], yaw: 0, altitude: 0 });
        assert.equal(moved.ok, true, `${userId} at ${room.toLocal(e, m).map(v => v.toFixed(2))}: ${moved.error}`);
      }
      at = [x, n];
    }
  }
  const enter = userId => {
    world.join({ userId, name: userId });
    const entered = command(userId, { type: 'travel', storeId: room.storeId, mode: 'enter' });
    assert.equal(entered.ok, true, entered.error);
    return room.toLocal(entered.player.position[0], entered.player.position[1]);
  };
  const lane = id => world.snapshot().axes?.find(item => item.id === id) ?? null;
  return { world, command, player, walk, enter, lane, advance(ms) { time += ms; } };
}
const [laneOne, laneTwo] = AXE_LANES, boxOf = lane => [lane.a, lane.box.d[0] + .3];

test('travel brings a visitor into the venue by its id and back out to the street', () => {
  const t = town();
  const inside = t.enter('alice');
  assert.ok(inside[1] > 1 && inside[1] < 4 && Math.abs(inside[0]) < 1, `entered at ${inside}`);
  assert.equal(env.roomAt(t.player('alice').position[0], -t.player('alice').position[1])?.storeId, room.storeId);
  t.advance(1000);
  const left = t.command('alice', { type: 'travel', storeId: room.storeId, mode: 'leave' });
  assert.equal(left.ok, true, left.error);
  assert.equal(env.roomAt(left.player.position[0], -left.player.position[1]), null, 'out on the street');
});

test('a visitor throws axes against the house in a lane; two visitors share the other lane', () => {
  const t = town();
  t.enter('alice'); t.walk('alice', [[laneOne.a, 3.6], boxOf(laneOne)]);
  assert.equal(t.command('alice', { type: 'axes', laneId: laneOne.id, action: 'practice' }).ok, true);
  assert.equal(t.command('alice', { type: 'axes', laneId: laneOne.id, action: 'throw', release: [0, 8] }).ok, true);
  assert.deepEqual(t.lane(laneOne.id).players, ['alice', 'house']);
  assert.equal(t.lane(laneOne.id).throws.length, 2);
  t.enter('bob'); t.walk('bob', [[laneTwo.a - .2, 3.6], [laneTwo.a - .2, laneTwo.box.d[0] + .3]]);
  t.enter('carol'); t.walk('carol', [[laneTwo.a + .3, 3.6], [laneTwo.a + .3, laneTwo.box.d[0] + .5]]);
  assert.equal(t.command('bob', { type: 'axes', laneId: laneTwo.id, action: 'invite', peerId: 'carol' }).ok, true);
  assert.equal(t.command('carol', { type: 'axes', laneId: laneTwo.id, action: 'accept' }).ok, true);
  assert.equal(t.command('bob', { type: 'axes', laneId: laneTwo.id, action: 'throw', release: [0, 8] }).ok, true);
  assert.equal(t.command('carol', { type: 'axes', laneId: laneTwo.id, action: 'throw', release: [0, 8] }).ok, true);
  assert.equal(t.lane(laneTwo.id).throws.length, 2);
  assert.equal(t.command('alice', { type: 'axes', laneId: laneTwo.id, action: 'throw', release: [0, 8] }).error, 'not_playing');
  // The match survives a checkpoint.
  const saved = t.world.checkpoint(), u = town();
  assert.deepEqual(u.world.restore(saved), { ok: true });
  assert.deepEqual(u.lane(laneTwo.id), t.lane(laneTwo.id));
});

test('the venue dartboard is its own shared line', () => {
  const t = town();
  t.enter('dave'); t.walk('dave', [[-1.2, 4.5], [AXE_ROOM_DARTS.a, AXE_ROOM_DARTS.line - .4]]);
  assert.equal(t.command('dave', { type: 'darts', lineId: AXE_ROOM_DARTS.id, action: 'practice' }).ok, true);
  assert.equal(t.command('dave', { type: 'darts', lineId: 'ipic-tuck-room', action: 'practice' }).error, 'not_at_line');
  assert.deepEqual(t.world.snapshot().darts.find(line => line.id === AXE_ROOM_DARTS.id).players, ['dave', 'regular']);
});

test('the venue is a room of its own: nobody greets through its wall', () => {
  const t = town();
  t.enter('erin'); t.walk('erin', [[-1, .7], [-4.6, .7]]);
  t.world.join({ userId: 'finn', name: 'finn' });
  // Finn stands on the street just outside the venue's front wall, 1 m from Erin.
  const [x, n] = room.toWorld(-4.6, -0.6);
  const placed = t.command('finn', { type: 'travel', position: [x, n] });
  assert.equal(placed.ok, true, placed.error);
  const gap = Math.hypot(placed.player.position[0] - t.player('erin').position[0], placed.player.position[1] - t.player('erin').position[1]);
  assert.ok(gap < 3, `close by (${gap.toFixed(2)} m)`);
  assert.equal(t.command('erin', { type: 'interaction', action: 'invite', kind: 'handshake', peerId: 'finn' }).error, 'interaction_reach');
});
