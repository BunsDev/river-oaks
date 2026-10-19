// Shared darts in the IPIC Tuck Room through the authoritative world: players walk to
// the throwing line, play, are seen in the snapshot, survive a checkpoint, and lose the
// match by walking away or sitting down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { IPIC_DARTS } from '../../preview/src/ipic-plan.js';
import { ipicRoute } from '../../preview/src/ipic-circulation.js';
import { accelFor } from '../../preview/src/darts-rules.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const env = createWalkingEnvironment(data), room = env.rooms.find(r => r.interior === 'ipic-photo-v1');
const serverFree = ([a, d]) => { const [x, n] = room.toWorld(a, d); return env.isFree(x, -n); };
const LINE = IPIC_DARTS.id;

function town() {
  let time = 1000;
  const world = createSharedWorld(data, { now: () => time });
  const command = (userId, message) => { time += 150; return world.command(userId, message); };
  const player = userId => world.snapshot().players.find(p => p.id === userId);
  function walkTo(userId, to) {
    const [x0, n0] = player(userId).position, from = room.toLocal(x0, n0);
    let at = [x0, n0];
    for (const [a, d] of ipicRoute(room, from, to, { radius: .35, step: .1, free: serverFree })) {
      const [x, n] = room.toWorld(a, d);
      const count = Math.max(1, Math.ceil(Math.hypot(x - at[0], n - at[1]) / .12));
      for (let i = 1; i <= count; i++) {
        const e = at[0] + (x - at[0]) * i / count, m = at[1] + (n - at[1]) * i / count;
        const moved = command(userId, { type: 'pose', position: [e, m, env.groundAt(e, -m)], yaw: 0, altitude: 0 });
        assert.equal(moved.ok, true, moved.error);
      }
      at = [x, n];
    }
  }
  const enter = (userId, spot) => {
    world.join({ userId, name: userId });
    assert.equal(command(userId, { type: 'travel', storeId: room.storeId, mode: 'enter' }).ok, true);
    walkTo(userId, spot);
  };
  const darts = (userId, message) => command(userId, { type: 'darts', lineId: LINE, ...message });
  const line = () => world.snapshot().darts?.find(item => item.id === LINE) ?? null;
  return { world, command, player, walkTo, enter, darts, line, advance(ms) { time += ms; } };
}

test('two visitors at the Tuck Room line play a shared match everyone can see', () => {
  const t = town();
  t.enter('alice', [.1, 22.8]); t.enter('bob', [.9, 22.5]); t.enter('carol', [-1.4, 21]);
  assert.equal(t.darts('carol', { action: 'practice' }).error, 'not_at_line');
  assert.equal(t.darts('alice', { action: 'invite', peerId: 'bob' }).ok, true);
  assert.equal(t.darts('bob', { action: 'accept' }).ok, true);
  for (let i = 0; i < 3; i++) assert.equal(t.darts('alice', { action: 'throw', release: [0, accelFor(103)] }).ok, true);
  assert.equal(t.darts('bob', { action: 'throw', release: [0, accelFor(0)] }).ok, true);
  const seen = t.line();
  assert.deepEqual(seen.players, ['alice', 'bob']);
  assert.equal(seen.points.length, 4);
  assert.equal(seen.turn, 1);
  assert.ok(seen.scores[0] < 501 && seen.scores[1] <= 501);
  assert.equal(t.darts('alice', { action: 'throw', release: [0, accelFor(0)], point: [0, 0] }).error, 'invalid_darts', 'no client landing points');
});

test('a darts match survives a checkpoint and ends when a player walks off or goes to sit down', () => {
  const t = town();
  t.enter('alice', [.1, 22.8]); t.enter('bob', [.9, 22.5]);
  t.darts('alice', { action: 'invite', peerId: 'bob' }); t.darts('bob', { action: 'accept' });
  t.darts('alice', { action: 'throw', release: [0, accelFor(103)] });
  const saved = t.world.checkpoint(), before = t.line();
  const u = town();
  assert.deepEqual(u.world.restore(saved), { ok: true });
  assert.deepEqual(u.line(), before, 'the restored match is the same match');
  u.walkTo('bob', [1.4, 21]);
  u.world.step(.1);
  assert.deepEqual(u.line().result, { winner: 0, reason: 'left the line' });
  u.walkTo('alice', [-.5, 21.5]); u.world.step(.1);
  assert.equal(u.line(), null, 'the line clears when everyone has gone');
  // Going to sit on a lounge seat also leaves the line. Since the sofa moved to back onto the west
  // guardrail (2026-10-18) no seat is in sit reach of the line, so the player walks to the sofa first;
  // with nobody left at the line, the ended match clears at once, and a seated player cannot throw.
  u.walkTo('alice', [.1, 22.8]);
  assert.equal(u.darts('alice', { action: 'practice' }).ok, true);
  assert.deepEqual(u.line().players, ['alice', 'regular']);
  u.walkTo('alice', [-2.6, 21.6]); u.world.step(.1);
  assert.equal(u.line(), null);
  assert.equal(u.command('alice', { type: 'sit', buildId: 'bench:ipic-lounge-sofa', slot: 1 }).ok, true);
  u.world.step(.1);
  assert.equal(u.line(), null);
  assert.equal(u.darts('alice', { action: 'throw', release: [0, accelFor(0)] }).error, 'not_playing');
});

test('the house regular answers a lone player on the server, and its darts are in the snapshot', () => {
  const t = town();
  t.enter('alice', [.1, 22.8]);
  assert.equal(t.darts('alice', { action: 'practice' }).ok, true);
  for (let i = 0; i < 3; i++) t.darts('alice', { action: 'throw', release: [0, accelFor(103)] });
  const seen = t.line();
  assert.deepEqual(seen.players, ['alice', 'regular']);
  assert.equal(seen.points.length, 6);
  assert.equal(seen.turn, 0);
});

test('darts commands outside IPIC, unknown lines and malformed messages are refused', () => {
  const t = town();
  t.world.join({ userId: 'dave', name: 'dave' });
  assert.equal(t.command('dave', { type: 'darts', lineId: LINE, action: 'practice' }).error, 'not_at_line');
  assert.equal(t.command('dave', { type: 'darts', lineId: 'plaza', action: 'practice' }).error, 'invalid_darts');
  assert.equal(t.command('dave', { type: 'darts', action: 'practice' }).error, 'invalid_darts');
});
