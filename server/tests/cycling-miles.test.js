import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryCyclingMiles, createRedisCyclingMiles, MAX_RIDERS } from '../cycling-miles.js';

// One lifetime total per account, in metres; the Memory and Redis twins share
// this contract. Names ride along so a board never joins the profile store.
async function contract(store) {
  assert.deepEqual(await store.top(5), []);
  assert.equal(await store.rank('alice'), null);
  assert.equal(await store.add('alice', 1200.5, 'Alice'), 1200.5);
  assert.equal(await store.add('bob', 300, 'Bob'), 300);
  assert.equal(await store.add('alice', 99.5, 'Alice A.'), 1300, 'adds accumulate and the name follows the latest flush');
  assert.deepEqual(await store.top(5), [{ userId: 'alice', name: 'Alice A.', total: 1300 }, { userId: 'bob', name: 'Bob', total: 300 }]);
  assert.deepEqual(await store.top(1), [{ userId: 'alice', name: 'Alice A.', total: 1300 }]);
  assert.deepEqual(await store.rank('bob'), { rank: 2, total: 300 });
  assert.deepEqual(await store.rank('alice'), { rank: 1, total: 1300 });
  assert.equal(await store.add('alice', 0, 'Alice'), 1300, 'zero adds nothing but reads the total');
  for (const bad of [-1, NaN, Infinity, '5', 1e6 + 1]) await assert.rejects(store.add('alice', bad, 'Alice'), /Invalid ride/);
  await assert.rejects(store.add('', 1, 'Nobody'), /Invalid account/);
  await assert.rejects(store.add('carol', 1, 'x'.repeat(81)), /Invalid rider name/);
}

// A store built with maxRiders 2: a third rider is refused, a known one is always credited.
async function capContract(store) {
  await store.add('a', 1, 'A'); await store.add('b', 1, 'B');
  assert.equal(await store.add('c', 1, 'C'), null, 'a new rider beyond the cap is not stored');
  assert.equal(await store.add('a', 1, 'A'), 2);
  assert.equal(await store.rank('c'), null);
  assert.equal((await store.top(10)).length, 2);
}

test('the memory store keeps one total per account and ranks by metres', async () => {
  await contract(createMemoryCyclingMiles());
});

test('the memory store caps the number of riders but always credits an existing rider', async () => {
  await capContract(createMemoryCyclingMiles({ maxRiders: 2 }));
  assert.equal(MAX_RIDERS, 10000);
});

test('one flush may carry a thousand kilometres but nothing beyond it', async () => {
  const store = createMemoryCyclingMiles();
  assert.equal(await store.add('far', 1e6, 'Far'), 1e6);
  assert.deepEqual(await store.rank('far'), { rank: 1, total: 1e6 });
  await assert.rejects(store.add('far', 1e6 + 0.001, 'Far'), /Invalid ride/);
});

test('the Redis store passes the same contract and survives a new instance', { skip: !process.env.REDIS_URL, timeout: 15000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL), prefix = `{river-oaks:cycling-test:${randomUUID()}}`;
  redis.on('error', () => {});
  t.after(async () => { const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(keys); await redis.quit(); });
  await contract(createRedisCyclingMiles({ redis, prefix }));
  const again = createRedisCyclingMiles({ redis, prefix });
  assert.deepEqual(await again.rank('alice'), { rank: 1, total: 1300 });
  assert.equal((await again.top(10)).length, 2);
  await redis.hdel(`${prefix}:cycling-riders:v1`, createHash('sha256').update('bob').digest('hex'));
  assert.deepEqual(await again.top(10), [{ userId: 'alice', name: 'Alice', total: 1300 }], 'a rider without a record is skipped, never shown as a hash');
});

test('the Redis store caps the number of riders but always credits an existing rider', { skip: !process.env.REDIS_URL, timeout: 15000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL), prefix = `{river-oaks:cycling-test:${randomUUID()}}`;
  redis.on('error', () => {});
  t.after(async () => { const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(keys); await redis.quit(); });
  await capContract(createRedisCyclingMiles({ redis, prefix, maxRiders: 2 }));
});

test('the Redis store refuses an unbraced prefix or a client without eval', () => {
  assert.throws(() => createRedisCyclingMiles({ redis: {}, prefix: '{x}' }), /Invalid cycling storage/);
  assert.throws(() => createRedisCyclingMiles({ redis: { eval() {} }, prefix: 'x' }), /Invalid cycling storage/);
});

test('the Redis store keeps cycling on its original keys, gives other boards their own, and erases every board', { skip: !process.env.REDIS_URL, timeout: 15000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL), prefix = `{river-oaks:cycling-test:${randomUUID()}}`;
  redis.on('error', () => {});
  t.after(async () => { const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(keys); await redis.quit(); });
  const store = createRedisCyclingMiles({ redis, prefix });
  await store.add('alice', 500, 'Alice');
  await store.add('alice', 3600, 'Alice', 'played');
  await store.add('bob', 200, 'Bob', 'walking');
  assert.equal(Number(await redis.zscore(`${prefix}:cycling-miles:v1`, createHash('sha256').update('alice').digest('hex'))), 500, 'banked cycling metres stay where they were');
  assert.deepEqual(await store.top(5, 'played'), [{ userId: 'alice', name: 'Alice', total: 3600 }]);
  assert.deepEqual(await store.rank('bob', 'walking'), { rank: 1, total: 200 });
  await assert.rejects(store.top(5, 'skydiving'), /Invalid board/);
  await store.eraseUser('alice');
  assert.equal(await store.rank('alice'), null);
  assert.equal(await store.rank('alice', 'played'), null);
  assert.deepEqual(await store.top(5, 'walking'), [{ userId: 'bob', name: 'Bob', total: 200 }]);
});
