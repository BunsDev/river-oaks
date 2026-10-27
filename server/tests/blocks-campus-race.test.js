import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
import { createDistributedServer } from '../distributed-app.js';
import { createSharedWorld } from '../world.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createMemoryBlocks, createRedisBlocks } from '../blocks.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { CAMPUS_LEASE_CONTRACT } from '../../shared/garden-campus-lease-contract.js';
import { GARDEN_CAMPUS_ID, GARDEN_CAMPUS_VERSIONS } from '../../shared/garden-campus-layout.js';

// A campus guest grant checked just before a block was stored (#292) reaches the world
// after the block's separation ended access between the two. On either server it is
// ended again once it lands, so the guest keeps no access to the blocked tenant's suite.
const origin = 'http://127.0.0.1', OP = 'carol';
const data = { ...JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url))),
  gardenCampus: { id: GARDEN_CAMPUS_ID, revision: 'river-oaks-gardens-3', versions: { ...GARDEN_CAMPUS_VERSIONS } } };
const auth = { handle: async () => false, close() {}, isSessionActive: async () => true, authenticate: async req => {
  const userId = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];
  return userId ? { userId, name: userId, sessionId: `${userId}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 120_000 } : null;
} };

// The store answers the next `stale` checks as they were before the block was stored.
const lagging = store => { const blocks = { ...store, stale: 0, between: async (a, b) => blocks.stale-- > 0 ? false : store.between(a, b) };return blocks; };

async function connect(t, base, userId) {
  const response = await fetch(`${base}/api/multiplayer/ticket?world=river-oaks`, { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${userId}`, 'X-CSRF-Token': 'test-csrf' } });
  assert.equal(response.status, 200);
  const { ticket } = await response.json();
  const ws = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: `fixture=${userId}` } });
  ws.on('error', () => {});t.after(() => ws.terminate());
  const closed = new Promise(resolve => ws.once('close', code => resolve(code)));
  const results = new Map();
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${userId}: no first snapshot`)), 15_000);
    ws.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.type === 'result') results.get(message.requestId)?.(message);
      if (Array.isArray(message.players)) { clearTimeout(timeout);resolve(); }
    });
  });
  const command = message => new Promise(resolve => { const requestId = randomUUID();results.set(requestId, resolve);ws.send(JSON.stringify({ ...message, requestId })); });
  const campus = message => command({ type: 'campus', operationId: `op-${randomUUID().slice(0, 12)}`, worldId: 'river-oaks', contract: { ...CAMPUS_LEASE_CONTRACT }, ...message });
  return { command, campus, closed };
}

async function raceGrant(t, base, blocks, { expected = [], answered = true, stale = 1, failed = false } = {}) {
  const carol = await connect(t, base, OP), bob = await connect(t, base, 'bob');await connect(t, base, 'dana');
  const offered = await carol.campus({ action: 'issue', unitId: 'T1-F2-W-S', tenantId: 'bob', startsAt: Date.now(), endsAt: Date.now() + 30 * 86_400_000 });
  assert.equal(offered.ok, true, JSON.stringify(offered));
  const accepted = await bob.campus({ action: 'accept', leaseId: offered.lease.id, expectedVersion: offered.lease.version });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  // Dana's block is stored, and its separation has run, while Bob's grant is on its way.
  assert.equal((await blocks.add('dana', { userId: 'bob', name: 'bob' })).ok, true);
  blocks.stale = stale;
  const granting = bob.campus({ action: 'grant', leaseId: accepted.lease.id, expectedVersion: accepted.lease.version, peerId: 'dana' });
  if (failed) assert.equal(await bob.closed, 1013, 'the request failed and the socket closed');
  else assert.equal((await granting).ok, answered, 'the grant was checked before the block');
  const listed = await (failed ? await connect(t, base, 'bob') : bob).command({ type: 'campus', action: 'list' });
  assert.deepEqual(listed.campus.leases.find(item => item.id === offered.lease.id).guests.map(item => item.userId), expected, 'and is ended once it lands');
}

test('standalone town: a campus grant that passed the block check before the block was stored is ended once it lands', { timeout: 30_000 }, async t => {
  const blocks = lagging(createMemoryBlocks());
  const app = createGameServer({ world: createSharedWorld(data, { campusOperators: [OP] }), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent', blocks });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));t.after(() => app.close());
  await raceGrant(t, `http://127.0.0.1:${app.server.address().port}`, blocks);
});

test('standalone town: when the second check fails, the grant stands and the failure is logged, with no account', { timeout: 30_000 }, async t => {
  const warnings = [];t.mock.method(console, 'warn', line => warnings.push(line));
  const store = createMemoryBlocks(), blocks = lagging(store);let checks = 0;
  blocks.between = async (a, b) => { if (++checks === 2) throw new Error('blocks store down');return checks === 1 ? false : store.between(a, b); };
  const app = createGameServer({ world: createSharedWorld(data, { campusOperators: [OP] }), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent', blocks });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));t.after(() => app.close());
  await raceGrant(t, `http://127.0.0.1:${app.server.address().port}`, blocks, { expected: ['dana'] });
  assert.deepEqual(warnings, [JSON.stringify({ event: 'block_recheck_failed' })]);
});

test('hosted: a campus grant that passed the block check before the block was stored is ended once it lands', { skip: !process.env.REDIS_URL, timeout: 30_000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test-blocks-race:${randomUUID()}}`, security = createRedisSecurity({ redis, prefix });
  const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, campusOperators: [OP], authorize: async () => true });
  const blocks = lagging(createRedisBlocks({ redis, prefix }));
  const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, blocks, origin, moderators: [] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close();await room.close();security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  await raceGrant(t, `http://127.0.0.1:${app.server.address().port}`, blocks);
});

// The room's answer can time out, or its request fail, while the grant stays in its
// durable queue. This room answers every grant that way at once, while the grant is still
// queued, and records the separations the server asks for.
async function timingOut(t, { fail = false } = {}) {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test-blocks-race:${randomUUID()}}`, security = createRedisSecurity({ redis, prefix });
  const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, campusOperators: [OP], authorize: async () => true });
  const separations = [], landing = [];
  const slow = { ...room, request: operation => {
    if (operation.type === 'separate') separations.push(operation);
    if (operation.type !== 'command' || operation.message?.action !== 'grant') return room.request(operation);
    landing.push(room.request(operation));
    return fail ? Promise.reject(new Error('room unavailable'))
      : Promise.resolve({ ok: false, error: 'request_timeout', message: 'Request outcome is pending. Refresh the town before retrying.' });
  } };
  const blocks = lagging(createRedisBlocks({ redis, prefix }));
  const app = createDistributedServer({ auth, security, room: slow, waitlist: approvedWaitlist, blocks, origin, moderators: [] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await Promise.allSettled(landing);await app.close();await room.close();security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  return { base: `http://127.0.0.1:${app.server.address().port}`, blocks, separations };
}

test('hosted: a campus grant whose answer timed out is still ended once it lands', { skip: !process.env.REDIS_URL, timeout: 30_000 }, async t => {
  const f = await timingOut(t);
  await raceGrant(t, f.base, f.blocks, { answered: false });
  assert.equal(f.separations.length, 1, 'the separation was queued after the grant');
});

test('hosted: a campus grant whose request failed once it was queued is still ended once it lands', { skip: !process.env.REDIS_URL, timeout: 30_000 }, async t => {
  const f = await timingOut(t, { fail: true });
  await raceGrant(t, f.base, f.blocks, { failed: true });
  assert.equal(f.separations.length, 1);
});

test('hosted: a grant the screen already refused is not checked again, so its answer takes no longer toward a blocker', { skip: !process.env.REDIS_URL, timeout: 30_000 }, async t => {
  const f = await timingOut(t);
  await raceGrant(t, f.base, f.blocks, { answered: false, stale: 0 });
  assert.deepEqual(f.separations, []);
});
