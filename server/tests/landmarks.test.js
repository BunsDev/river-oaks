import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

test('account landmarks are private, normalized, bounded, and removable only by their owner', async () => {
  const { createMemoryLandmarks } = await import('../landmarks.js').catch(() => ({}));
  assert.equal(typeof createMemoryLandmarks, 'function');
  const store = createMemoryLandmarks({ now: () => 1234, createId: () => 'lm-one' });
  const added = await store.add('alice', { name: '  My   bench ', position: [1, 2], yaw: 0.5 });
  assert.equal(added.ok, true);
  assert.deepEqual(added.landmark, { id: 'lm-one', name: 'My bench', position: [1, 2], yaw: 0.5, createdAt: 1234 });
  assert.deepEqual(await store.list('bob'), []);
  assert.deepEqual(await store.list('alice'), [added.landmark]);
  assert.equal(await store.remove('bob', 'lm-one'), false);
  assert.equal(await store.remove('alice', 'lm-one'), true);
  assert.deepEqual(await store.list('alice'), []);
  assert.equal((await store.add('alice', { name: ' ', position: [1, 2] })).reason, 'name');
  assert.equal((await store.add('alice', { name: 'Bad', position: [Infinity, 2] })).reason, 'position');
});

test('an account cannot save more than 50 landmarks', async () => {
  const { createMemoryLandmarks } = await import('../landmarks.js').catch(() => ({}));
  assert.equal(typeof createMemoryLandmarks, 'function');
  let id = 0;
  const store = createMemoryLandmarks({ createId: () => `lm-${++id}` });
  for (let i = 0; i < 50; i++) assert.equal((await store.add('alice', { name: `Place ${i}`, position: [i, i], yaw: 0 })).ok, true);
  assert.equal((await store.add('alice', { name: 'Too many', position: [51, 51], yaw: 0 })).reason, 'limit');
  assert.equal((await store.add('bob', { name: 'My first', position: [0, 0], yaw: 0 })).ok, true);
});

test('Redis landmarks survive replacement and enforce the account limit across instances', { skip: !process.env.REDIS_URL }, async t => {
  const { createRedisLandmarks } = await import('../landmarks.js');
  assert.equal(typeof createRedisLandmarks, 'function');
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', () => {});
  const prefix = `{river-oaks:landmarks-test:${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  const first = createRedisLandmarks({ redis, prefix }), second = createRedisLandmarks({ redis, prefix });
  const saved = await first.add('alice', { name: 'Garden gate', position: [1, 2], yaw: 0.2 });
  assert.equal(saved.ok, true);
  assert.deepEqual(await second.list('alice'), [saved.landmark]);
  assert.deepEqual(await second.list('bob'), []);
  assert.equal(await second.remove('bob', saved.landmark.id), false);
  assert.equal(await second.remove('alice', saved.landmark.id), true);
  const results = await Promise.all(Array.from({ length: 51 }, (_, i) => (i % 2 ? first : second).add('alice', { name: `Spot ${i}`, position: [i, i], yaw: 0 })));
  assert.equal(results.filter(result => result.ok).length, 50);
  assert.equal((await createRedisLandmarks({ redis, prefix }).list('alice')).length, 50);
});
