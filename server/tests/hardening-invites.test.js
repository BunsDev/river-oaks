// Hardening: listing invites reads the whole invite table (up to 50k entries,
// about 20 MB) on every request, so each account may list only so often.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createWaitlistRoutes } from '../waitlist-routes.js';
import { createRedisSecurity } from '../redis-security.js';

test('the invite list answers 429 past its per-account budget without reading the table', async () => {
  let reads = 0, budget = 2;
  const routes = createWaitlistRoutes({origin: 'https://typesafe.place', allowInviteList: async () => budget-- > 0,
    auth: {authenticate: async () => ({userId: 'resident', name: 'Resident'})},
    waitlist: {listInvites: async () => { reads++;return []; }}});
  const call = async () => {
    let status = 0;
    await routes({method: 'GET', headers: {}}, {setHeader() {}, writeHead(code) { status = code; }, end() {}}, '/api/waitlist/invites');
    return status;
  };
  assert.deepEqual([await call(), await call(), await call()], [200, 200, 429]);
  assert.equal(reads, 2);
});

test('the Redis security store allows the invite-list scope', {skip: !process.env.REDIS_URL}, async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const prefix = `{river-oaks:hardening-invites:${randomUUID()}}`;
  const security = createRedisSecurity({redis, prefix});
  t.after(async () => { const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  assert.equal(await security.allow('invites', 'resident', 20, 60_000), true);
});
