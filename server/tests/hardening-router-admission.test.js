// Hardening: on the hosted gateway the per-address limit runs before anything
// else, so routes handled ahead of a world (the chauffeur) and lookups of
// unknown worlds cannot be flooded past it. An admitted request is counted once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { createWorldRouter } from '../world-router.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';

test('the router refuses over-budget requests before the chauffeur handler or a world lookup', async t => {
  let budget = 2, handled = 0, looked = 0;
  const router = createWorldRouter({admit: async () => budget-- > 0,
    handleRequest: async (req, res) => { handled++;res.writeHead(204).end();return true; },
    worldFor: async () => { looked++;return null; }});
  await new Promise(resolve => router.server.listen(0, '127.0.0.1', resolve));t.after(() => router.close());
  const base = `http://127.0.0.1:${router.server.address().port}`;
  assert.equal((await fetch(`${base}/api/chauffeur`)).status, 204);
  assert.equal((await fetch(`${base}/api/chauffeur`)).status, 204);
  assert.equal((await fetch(`${base}/api/chauffeur`)).status, 429);
  assert.equal((await fetch(`${base}/api/social/list?world=no-such-world`)).status, 429);
  assert.equal(handled, 2);assert.equal(looked, 0, 'no world lookup for a refused request');
  // Upgrades are admitted the same way.
  const status = await new Promise(resolve => {
    import('node:http').then(({request}) => {
      const req = request(`${base}/multiplayer?world=river-oaks`, {headers: {Connection: 'Upgrade', Upgrade: 'websocket'}});
      req.on('response', response => resolve(response.statusCode));req.on('upgrade', () => resolve(101));req.on('error', () => resolve(0));req.end();
    });
  });
  assert.equal(status, 429);assert.equal(looked, 0);
});

test('on the Redis gateway an admitted request spends the per-address budget once', {skip: !process.env.REDIS_URL, timeout: 60_000}, async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const namespace = `river-oaks:hardening-router:${randomUUID()}`, origin = 'https://sim.jev.works';
  const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const auth = {handle: async () => false, authenticate: async () => null, isSessionActive: async () => true, close() {}};
  const security = createRedisSecurity({redis, prefix: `{${namespace}}`});
  const gateway = createWorldGateway({redis, namespace, worldData, auth, security, waitlist: approvedWaitlist, origin});
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await gateway.close();security.close();const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  await fetch(`http://127.0.0.1:${gateway.server.address().port}/api/worlds`);
  const counters = await redis.keys(`{${namespace}}:limit:access:*`);
  assert.equal(counters.length, 1);
  assert.equal(await redis.get(counters[0]), '1', 'counted once, not once by the router and again by the world');
});

// Moderation is one per deployment, so its routes go to the configured world whatever
// the request names, as the ban route always has (#292).
test('moderation routes go to the configured world', async t => {
  const asked = [];
  const router = createWorldRouter({configuredWorldId: 'moon-garden', worldFor: async id => { asked.push(id);return null; }});
  await new Promise(resolve => router.server.listen(0, '127.0.0.1', resolve));t.after(() => router.close());
  const base = `http://127.0.0.1:${router.server.address().port}`;
  for (const path of ['/api/moderation/ban', '/api/moderation/reports', '/api/moderation/reports?world=river-oaks', '/api/moderation/reports/close']) assert.equal((await fetch(`${base}${path}`)).status, 404);
  assert.deepEqual(asked, ['moon-garden', 'moon-garden', 'moon-garden', 'moon-garden']);
});
