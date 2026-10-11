// Hardening: one failing queued operation must not freeze a world. Before,
// apply() threw out of the tick before the commit trimmed the queue, so every
// later tick re-threw on the same entry and nobody behind it could join.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createRedisRoom } from '../redis-room.js';

const worldData = {scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, 0, 0], collisionPolygons: [], stores: [], buildings: [],
  communityLocations: [{id: 'a', name: 'Garden', position: [-12, 0, 0]}, {id: 'b', name: 'Gallery', position: [12, 0, 0]}]};

test('a throwing operation and a malformed queue entry are isolated; the world keeps committing', {skip: !process.env.REDIS_URL, timeout: 60_000}, async t => {
  const redis = new Redis(process.env.REDIS_URL, {lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: null});
  redis.on('error', () => {});await redis.connect();
  const prefix = `{river-oaks:hardening-room:${randomUUID()}}`;
  let time = 100_000;
  // The avatar store fails for one account (full store, a removed look, a newer checkpoint...).
  const avatarPreferences = {
    get: async () => null,
    initialize: async (userId, appearance) => { if (userId === 'dave') throw new Error('avatar store full');return appearance; },
    save: async () => {},
  };
  // The session check throws for one account (a store error), which nothing inside apply() catches.
  const authorize = async identity => { if (identity.userId === 'mallory') throw new Error('session store unavailable');return true; };
  const room = createRedisRoom({redis, prefix, worldData, authorize, now: () => time, isAdmin: () => false, avatarPreferences});
  t.after(async () => { await room.close();const keys = await redis.keys(`${prefix}:*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const identity = userId => ({userId, name: userId, sessionId: `${userId}-session`, expiresAt: time + 120_000});
  const join = userId => room.request({type: 'join', identity: identity(userId), connectionId: `${userId}-socket`});

  assert.equal((await join('alice')).ok, true);
  const failed = await join('mallory');
  assert.equal(failed.ok, false, 'the failing join is rejected, not left pending');
  assert.equal(failed.error, 'operation_failed');
  assert.equal((await join('bob')).ok, true, 'the next join behind it still runs');
  assert.equal((await join('dave')).ok, true, 'a broken avatar store keeps the default look instead of keeping someone out');
  let view = await room.read();
  assert.deepEqual(view.snapshot.players.map(player => player.id).sort(), ['alice', 'bob', 'dave'], 'the failed join left no half-joined player');
  assert.equal(view.connections.some(connection => connection.userId === 'mallory'), false);

  // A malformed entry on the durable queue is dropped instead of wedging every tick.
  // Redis deletes an empty list, so name the key the way the room does.
  const queue = `${prefix}:queue`;
  await redis.rpush(queue, '{"not":"an operation"}');
  time += 1000;
  assert.equal((await join('carol')).ok, true, 'a valid operation behind the malformed entry completes');
  view = await room.read();
  assert.equal(view.snapshot.players.length, 4);
  assert.equal(await redis.llen(queue), 0, 'nothing is stuck on the queue');
});
