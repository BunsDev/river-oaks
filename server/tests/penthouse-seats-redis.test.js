import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import Redis from 'ioredis';
import { LEAVE_GRACE_MS, createRedisRoom } from '../redis-room.js';
import { OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeSeat } from '../../preview/src/office-layouts.js';

// #363: a seat claim is coordinator state. Two coordinators racing for one seat produce one
// winner, and a replacement coordinator restores the claim from the checkpoint it commits.
const enabled = Boolean(process.env.REDIS_URL);
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const layout = OFFICE_LAYOUT_PENTHOUSE, officeId = 'jevica-office', penthouse = officeLayout(layout);
const chair = officeSeat(penthouse, 'desk-a1-chair');

test('two coordinators racing for one office seat produce one winner, and the claim survives coordinator replacement', { skip: !enabled }, async t => {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: null });
  redis.on('error', () => {}); await redis.connect();
  const prefix = `{river-oaks:test:${randomUUID()}}`, rooms = [];
  let time = 100000;
  const create = () => { const room = createRedisRoom({ redis, prefix, worldData: data, authorize: async () => true, now: () => time, isAdmin: id => id === 'owner', officeLayout: layout }); rooms.push(room); return room; };
  t.after(async () => {
    await Promise.all(rooms.map(room => room.close()));
    const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  const identity = userId => ({ userId, name: userId, sessionId: `${userId}-session`, expiresAt: time + 600000 });
  const command = (room, userId, message) => { time += 1000; return room.request({ type: 'command', userId, connectionId: `${userId}-socket`, message }); };
  const office = (room, userId, action, more = {}) => command(room, userId, { type: 'office', action, officeId, ...more });
  const seen = async (room, userId) => (await room.read()).snapshot.players.find(player => player.id === userId)?.office ?? null;
  const walk = async (room, userId, ...points) => {
    for (const to of points) {
      let at = (await seen(room, userId)).position;
      while (Math.hypot(to[0] - at[0], to[1] - at[1]) > 1e-9) {
        const length = Math.hypot(to[0] - at[0], to[1] - at[1]), f = Math.min(1, 2.4 / length);
        const next = [at[0] + (to[0] - at[0]) * f, at[1] + (to[1] - at[1]) * f];
        const moved = await office(room, userId, 'move', { position: next, yaw: 0, layout });
        assert.equal(moved.ok, true, `${userId} to ${next}: ${moved.error}`);
        at = next;
      }
    }
  };

  const a = create(), b = create();
  for (const userId of ['owner', 'guest']) assert.equal((await a.request({ type: 'join', identity: identity(userId), connectionId: `${userId}-socket` })).ok, true);
  assert.equal((await office(a, 'owner', 'invite', { peerId: 'guest' })).ok, true);
  const entrance = (await office(a, 'owner', 'list')).offices[0].entrance;
  for (const userId of ['owner', 'guest']) {
    assert.equal((await command(a, userId, { type: 'travel', position: entrance })).ok, true);
    const entered = await office(a, userId, 'enter');
    assert.equal(entered.ok, true, entered.error);
  }
  // Both stand within reach of the chair's stand point and clear of its seated envelope.
  await walk(a, 'owner', [chair.stand[0] - 1, chair.stand[1] - 0.5]);
  await walk(b, 'guest', [chair.stand[0] + 1, chair.stand[1] - 0.5]);
  const claims = await Promise.all([
    office(a, 'owner', 'sit', { seatId: chair.id, layout }),
    office(b, 'guest', 'sit', { seatId: chair.id, layout }),
  ]);
  assert.equal(claims.filter(result => result.ok).length, 1, JSON.stringify(claims));
  assert.deepEqual(claims.filter(result => !result.ok).map(result => result.error), ['office_seat_occupied']);
  const winner = claims[0].ok ? 'owner' : 'guest', loser = winner === 'owner' ? 'guest' : 'owner';

  const state = JSON.parse(inflateSync(await redis.getBuffer(`${prefix}:state`)).toString());
  assert.equal(state.checkpoint.version, 16);
  assert.match(await redis.get(`${prefix}:lease`), /^v19:/);
  await a.close(); await b.close();
  const replacement = create();
  const restored = await seen(replacement, winner);
  assert.deepEqual([restored.seat, restored.position, restored.yaw], [{ id: chair.id }, chair.position, chair.facing], 'the replacement coordinator keeps the claim');
  assert.equal((await office(replacement, loser, 'sit', { seatId: chair.id, layout })).error, 'office_seat_occupied');
  assert.equal((await office(replacement, winner, 'stand', { layout })).ok, true);
  assert.equal((await office(replacement, loser, 'sit', { seatId: chair.id, layout })).error, 'office_seat_blocked', 'the winner stands inside the envelope');
  await walk(replacement, winner, [chair.stand[0], chair.stand[1] - 1.5]);
  assert.equal((await office(replacement, loser, 'sit', { seatId: chair.id, layout })).ok, true);

  // Departure after the reconnect grace releases the claim with the visit.
  assert.equal((await replacement.request({ type: 'leave', userId: loser, connectionId: `${loser}-socket` })).ok, true);
  time += LEAVE_GRACE_MS + 1; await new Promise(resolve => setTimeout(resolve, 250)); await replacement.tick(); // ticks are throttled to 200 ms of real time
  assert.equal(await seen(replacement, loser), null);
  await walk(replacement, winner, chair.stand);
  assert.equal((await office(replacement, winner, 'sit', { seatId: chair.id, layout })).ok, true, 'the departed visitor\'s seat is free');
});
