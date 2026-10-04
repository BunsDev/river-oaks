import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryPresence, createRedisPresence } from '../presence.js';
import { createMemorySocial } from '../social.js';
import { socialAction } from '../social-api.js';

const river = { id: 'river-oaks', title: 'River Oaks District' };
const garden = { id: 'moon-garden', title: 'Moon Garden' };

test('presence follows the latest room and expires without a heartbeat', async () => {
  let time = 0;
  const presence = createMemoryPresence({ now: () => time });
  await presence.join('alice', river, 'first');
  assert.deepEqual((await presence.getMany(['alice'])).get('alice'), { worldId: 'river-oaks', title: river.title });
  await presence.join('alice', garden, 'second');
  assert.equal(await presence.touch('alice', 'first'), false);
  assert.equal(await presence.leave('alice', 'first'), false);
  assert.deepEqual((await presence.getMany(['alice'])).get('alice'), { worldId: 'moon-garden', title: garden.title });
  time += 89_000;
  assert.equal(await presence.touch('alice', 'second'), true);
  time += 89_000;
  assert.equal((await presence.getMany(['alice'])).has('alice'), true);
  time += 2_000;
  assert.equal((await presence.getMany(['alice'])).has('alice'), false);
  assert.equal(await presence.touch('alice', 'second'), false);
  await presence.join('alice', river, 'third');
  assert.equal(await presence.leave('alice', 'third'), true);
  assert.equal((await presence.getMany(['alice'])).has('alice'), false);
  await assert.rejects(() => presence.join('alice', { id: '../bad', title: 'Bad' }, 'fourth'));
  await assert.rejects(() => presence.getMany(Array(51).fill('alice')));
});

test('only accepted contacts receive an online world', async () => {
  const social = createMemorySocial();
  const presence = createMemoryPresence();
  const alice = { userId: 'alice', name: 'Alice' };
  const bob = { userId: 'bob', name: 'Bob' };
  const eve = { userId: 'eve', name: 'Eve' };
  await social.request(alice, bob);
  await social.request(alice, eve);
  await social.accept('bob', 'alice');
  await presence.join('bob', garden, 'bob-connection');
  await presence.join('eve', river, 'eve-connection');
  const list = userId => socialAction({ action: 'list', identity: { userId }, social, presence });
  const result = await list('alice');
  assert.equal(result.status, 200);
  assert.deepEqual(result.value.contacts.find(item => item.peer.id === 'bob').presence,
    { worldId: 'moon-garden', title: garden.title });
  assert.equal(Object.hasOwn(result.value.contacts.find(item => item.peer.id === 'eve'), 'presence'), false);
  assert.deepEqual((await list('stranger')).value.contacts, []);
  await social.remove('alice', 'bob');
  assert.equal((await list('alice')).value.contacts.some(item => item.peer.id === 'bob'), false);
  assert.equal((await list('bob')).value.contacts.some(item => item.peer.id === 'alice'), false);
});

test('Redis presence is shared, short lived, and fenced against an old socket', { skip: !process.env.REDIS_URL }, async t => {
  const redis = new Redis(process.env.REDIS_URL);
  redis.on('error', () => {});
  const prefix = `{river-oaks:presence-test:${randomUUID()}}`;
  const first = createRedisPresence({ redis, prefix });
  const second = createRedisPresence({ redis, prefix });
  t.after(async () => {
    const keys = await redis.keys(`${prefix}:presence:*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  await first.join('alice', river, 'old');
  assert.deepEqual((await second.getMany(['alice'])).get('alice'), { worldId: 'river-oaks', title: river.title });
  await second.join('alice', garden, 'new');
  assert.equal(await first.touch('alice', 'old'), false);
  assert.equal(await first.leave('alice', 'old'), false);
  assert.deepEqual((await first.getMany(['alice'])).get('alice'), { worldId: 'moon-garden', title: garden.title });
  assert.equal(await second.touch('alice', 'new'), true);
  assert.equal(await second.leave('alice', 'new'), true);
  assert.deepEqual(await first.getMany(['alice']), new Map());
});
