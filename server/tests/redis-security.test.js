import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createRedisSecurity } from '../redis-security.js';

test('Redis security primitives', { skip: !process.env.REDIS_URL }, async t => {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.on('error', () => {});
  await redis.connect();
  t.after(() => redis.quit());
  const run = async (name, exercise) => t.test(name, async sub => {
    const prefix = `{river-oaks:test:${randomUUID()}}`;
    sub.after(async () => {
      let cursor = '0';
      do {
        const result = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 1000);
        cursor = result[0];
        const keys = result[1].filter(key => key.startsWith(`${prefix}:`));
        if (keys.length) await redis.del(...keys);
      } while (cursor !== '0');
    });
    let time = Date.now();
    const store = createRedisSecurity({ redis, prefix, now: () => time });
    await exercise({ store, redis, prefix, advance: ms => { time += ms; } });
  });
  await run('chauffeur decisions share an owner rate budget across instances', async ({store,redis,prefix,advance}) => {
    const peer=createRedisSecurity({redis,prefix});
    assert.equal(await store.allow('chauffeur','owner',2,60000),true);
    assert.equal(await peer.allow('chauffeur','owner',2,60000),true);
    assert.equal(await store.allow('chauffeur','owner',2,60000),false);
    assert.equal(await store.allow('chauffeur','other',2,60000),true);
    advance(60000);
    assert.equal(await store.allow('chauffeur','owner',2,60000),true);
    peer.close();
  });
  await run('rate limits are atomic, expire, and reject invalid scopes and keys', async ({ store, advance }) => {
    const results = await Promise.all(Array.from({ length: 30 }, () => store.allow('access', 'client', 5, 1000)));
    assert.equal(results.filter(Boolean).length, 5);
    advance(1001);
    assert.equal(await store.allow('access', 'client', 5, 1000), true);
    assert.equal(await store.allow('arbitrary-new-scope', 'client', 5, 1000), false);
    assert.equal(await store.allow('access', 'x'.repeat(257), 5, 1000), false);
  });
  // A shared table capped at 4096 clients let a flood of distinct addresses
  // lock out every newcomer for the rest of the window.
  await run('each client has its own expiring counter, so a flood cannot lock out a newcomer', async ({ store, redis, prefix }) => {
    await Promise.all(Array.from({ length: 5000 }, (_, i) => store.allow('access', `flood-${i}`, 5, 60_000)));
    assert.equal(await store.allow('access', 'newcomer', 1, 60_000), true);
    assert.equal(await store.allow('access', 'newcomer', 1, 60_000), false);
    const keys = await redis.keys(`${prefix}:limit:access:*`);
    assert.equal(keys.length, 5001);
    assert.ok(keys.every(key => /^[A-Za-z0-9_-]{43}:\d+$/.test(key.slice(`${prefix}:limit:access:`.length))), 'client ids are hashed into key names');
    const ttls = await Promise.all(keys.slice(0, 20).map(key => redis.pttl(key)));
    assert.ok(ttls.every(ttl => ttl > 0 && ttl <= 60_000));
  });
  await run('sign-in starts are a separate limit scope', async ({ store }) => {
    for (let i = 0; i < 3; i++) assert.equal(await store.allow('login', 'client', 3, 60_000), true);
    assert.equal(await store.allow('login', 'client', 3, 60_000), false);
    assert.equal(await store.allow('access', 'client', 3, 60_000), true);
  });
  await run('tickets bind the session, survive wrong-user attempts, and consume once across clients', async ({ store, redis, prefix }) => {
    const user = { userId: 'user-a', sessionId: 'session-a' };
    const ticket = await store.issueTicket(user);
    assert.match(ticket, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await store.consumeTicket(ticket, { ...user, userId: 'other' }), false);
    assert.equal(await store.consumeTicket(ticket, { ...user, sessionId: 'other' }), false);
    const second = createRedisSecurity({ redis, prefix });
    const results = await Promise.all([store.consumeTicket(ticket, user), second.consumeTicket(ticket, user)]);
    assert.equal(results.filter(Boolean).length, 1);
  });
  await run('a ticket issued for one world cannot join another world', async ({ store }) => {
    const user = { userId: 'user-a', sessionId: 'session-a' };
    const ticket = await store.issueTicket(user, 'garden-2');
    assert.equal(await store.consumeTicket(ticket, user, 'river-oaks'), false);
    assert.equal(await store.consumeTicket(ticket, user, 'garden-2'), true);
  });
  await run('tickets expire after 15 seconds and account issuance is capped', async ({ store, advance }) => {
    const user = { userId: 'user-a', sessionId: 'session-a' };
    const tickets = await Promise.all(Array.from({ length: 15 }, () => store.issueTicket(user)));
    assert.equal(tickets.filter(Boolean).length, 10);
    advance(15001);
    assert.equal(await store.consumeTicket(tickets.find(Boolean), user), false);
    advance(45000);
    assert.ok(await store.issueTicket(user));
  });
  await run('global ticket capacity is bounded and expiry reclaims it', async ({ store, advance }) => {
    const tickets = await Promise.all(Array.from({ length: 520 }, (_, i) => store.issueTicket({ userId: `user-${i}`, sessionId: `session-${i}` })));
    assert.equal(tickets.filter(Boolean).length, 512);
    advance(15001);
    assert.ok(await store.issueTicket({ userId: 'new-user', sessionId: 'new-session' }));
  });
  await run('durable bans reject tickets and unban writes a bounded audit', async ({ store, redis, prefix }) => {
    const user = { userId: 'user-a', sessionId: 'session-a' };
    const ticket = await store.issueTicket(user);
    assert.equal(await store.ban({ userId: user.userId, actorId: 'moderator', reason: 'disruption' }), true);
    assert.equal(await store.isBanned(user.userId), true);
    assert.equal(await store.issueTicket(user), null);
    assert.equal(await store.consumeTicket(ticket, user), false);
    assert.equal(await redis.ttl(`${prefix}:bans`), -1);
    await store.close();
    const fresh = createRedisSecurity({ redis, prefix });
    assert.equal(await fresh.isBanned(user.userId), true);
    assert.equal(await fresh.unban({ userId: user.userId, actorId: 'moderator' }), true);
    assert.equal(await fresh.isBanned(user.userId), false);
    assert.equal(await fresh.consumeTicket(ticket, user), false, 'Unban must not revive a ticket issued before the ban');
    const audit = (await redis.lrange(`${prefix}:audit`, 0, -1)).map(JSON.parse);
    assert.deepEqual(audit.map(event => event.kind), ['unban', 'ban']);
  });
  await run('ban capacity allows existing records and rejects excess new identities', async ({ store, redis, prefix }) => {
    const pairs = [];
    for (let i = 0; i < 10000; i++) pairs.push(`user-${i}`, '{}');
    await redis.hset(`${prefix}:bans`, ...pairs);
    assert.equal(await store.ban({ userId: 'excess', actorId: 'mod', reason: 'disruption' }), false);
    assert.equal(await store.ban({ userId: 'user-1', actorId: 'mod', reason: 'disruption' }), true);
  });
  await run('reports are limited, audit is capped, and invalid inputs do not create keys', async ({ store, redis, prefix }) => {
    const input = { reporterId: 'reporter', targetId: 'target', reason: 'disruption' };
    const results = await Promise.all(Array.from({ length: 8 }, () => store.report(input)));
    assert.equal(results.filter(Boolean).length, 3);
    assert.equal(await store.report({ ...input, reason: 'x'.repeat(5000) }), false);
    assert.equal(await store.ban({ userId: 'x'.repeat(101), actorId: 'mod', reason: 'disruption' }), false);
    await redis.lpush(`${prefix}:audit`, ...Array(10000).fill('{}'));
    await store.audit('test', { detail: 'bounded' });
    assert.equal(await redis.llen(`${prefix}:audit`), 10000);
    assert.equal(await redis.ttl(`${prefix}:audit`), -1);
    assert.equal(JSON.parse(await redis.lindex(`${prefix}:audit`, 0)).kind, 'test');
  });
});
