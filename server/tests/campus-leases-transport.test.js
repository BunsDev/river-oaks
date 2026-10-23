import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { CAMPUS_LEASE_CONTRACT } from '../../shared/garden-campus-lease-contract.js';
import { GARDEN_CAMPUS_ID, GARDEN_CAMPUS_VERSIONS } from '../../shared/garden-campus-layout.js';

// Garden campus leases (#509) through the real ticket/WebSocket gates, two Redis gateways,
// coordinator replacement and durable recovery. Redis cases skip without REDIS_URL.
const HOUR = 3_600_000, DAY = 24 * HOUR, U1 = 'T1-F2-W-S', U2 = 'T3-F4-E';
const OP = 'campus-operator', A = 'tenant-a', B = 'tenant-b';
// A stand-in for #507's attachGardenCampus marker: the district serves the campus.
const served = world => ({ ...world, gardenCampus: { id: GARDEN_CAMPUS_ID, revision: 'river-oaks-gardens-3', versions: { ...GARDEN_CAMPUS_VERSIONS } } });
const data = served(JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url))));
const op = () => `op-${randomUUID()}`;
const base = () => ({ operationId: op(), worldId: 'river-oaks', contract: { ...CAMPUS_LEASE_CONTRACT } });
const campusKeys = frame => Object.keys(frame.campus ?? {}).sort();

// One memory server, or Redis gateways sharing a namespace, behind the real ticket and
// WebSocket gates. Each client numbers its own replies with a top-level requestId.
async function harness(t, mode) {
  const origin = 'http://127.0.0.1', ids = { operator: OP, alice: A, bob: B };
  const sessions = {};
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true, authenticate: async req => {
    const id = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];
    return ids[id] ? { userId: ids[id], name: id, sessionId: `${id}-session-${sessions[id] ?? 0}`, csrfToken: 'test-csrf', expiresAt: Date.now() + 60000 } : null;
  } };
  const namespace = `river-oaks:campus-test:${randomUUID()}`, clients = [], apps = [];
  const redisFor = () => { const redis = new Redis(process.env.REDIS_URL);clients.push(redis);return redis; };
  let security;
  if (mode === 'redis') security = createRedisSecurity({ redis: redisFor(), prefix: `{${namespace}}` });
  const memory = mode === 'memory' ? createGameServer({ world: createSharedWorld(data, { campusOperators: [OP] }), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent' }) : null;
  const gateway = async () => {
    const app = memory ?? createWorldGateway({ redis: redisFor(), namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin, campusOperators: [OP] });
    if (!app.server.listening) await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    if (!apps.includes(app)) apps.push(app);
    return { app, base: `http://127.0.0.1:${app.server.address().port}` };
  };
  const sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    for (const app of apps) await app.close().catch(() => {});
    security?.close();
    if (clients.length) { const keys = await clients[0].keys(`*${namespace}*`);if (keys.length) await clients[0].del(...keys); }
    for (const redis of clients) await redis.quit();
  });
  const ticket = (target, id, csrf = 'test-csrf') => fetch(target.base + '/api/multiplayer/ticket', { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': csrf } });
  const join = async (target, id) => {
    const response = await ticket(target, id);assert.equal(response.status, 200);
    const { ticket: token } = await response.json();
    const ws = new WebSocket(`${target.base.replace('http:', 'ws:')}/multiplayer?ticket=${token}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: `fixture=${id}` } });
    sockets.push(ws);
    const pending = new Map();let last = null, seq = 0;
    // A socket that closes or stays silent before its first snapshot fails the test instead
    // of leaving it waiting forever (seen once under a load average near 55).
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${id}: no first snapshot within 15 s`)), 15000);
      ws.once('error', error => { clearTimeout(timeout);reject(error); });
      ws.once('close', code => { clearTimeout(timeout);if (!last) reject(new Error(`${id}: socket closed (${code}) before its first snapshot`)); });
      ws.on('message', raw => {
        const value = JSON.parse(raw);
        if (value.type === 'snapshot') { last = value;clearTimeout(timeout);resolve(); }
        if (value.type === 'result' && pending.has(value.requestId)) { pending.get(value.requestId)(value);pending.delete(value.requestId); }
      });
    });
    return {
      ws, get snapshot() { return last; },
      send: message => new Promise((resolve, reject) => {
        const requestId = String(++seq), timeout = setTimeout(() => { pending.delete(requestId);reject(new Error('Campus command timed out')); }, 8000);
        pending.set(requestId, value => { clearTimeout(timeout);resolve(value); });
        ws.send(JSON.stringify({ ...message, requestId }));
      }),
      until: check => new Promise((resolve, reject) => {
        if (last && check(last)) return resolve(last);
        const timeout = setTimeout(() => reject(new Error('No matching snapshot')), 6000);
        ws.on('message', function seen(raw) { const value = JSON.parse(raw);if (value.type === 'snapshot' && check(value)) { clearTimeout(timeout);ws.off('message', seen);resolve(value); } });
      }),
    };
  };
  const campus = (client, message) => client.send({ type: 'campus', ...message });
  return { ids, sessions, gateway, ticket, join, campus, sockets, apps };
}

for (const mode of ['memory', 'redis']) test(`${mode}: two accounts racing for one suite through ${mode === 'redis' ? 'two gateways' : 'one server'} get one lease; retries, reconnects and forged commands cannot add another`, { skip: mode === 'redis' && !process.env.REDIS_URL, timeout: 120_000 }, async t => {
  const { ids, sessions, gateway, ticket, join, campus, sockets, apps } = await harness(t, mode);
  const first = await gateway(), second = await gateway();
  assert.equal((await ticket(first, 'alice', 'wrong')).status, 403, 'CSRF still guards the ticket');
  assert.equal((await ticket(first, 'nobody')).status, 401);
  const operator = await join(first, 'operator'), alice = await join(first, 'alice'), bob = await join(second, 'bob');
  assert.deepEqual(campusKeys(bob.snapshot), ['contract', 'leased', 'leasing']);
  const startsAt = Date.now() - 1000, endsAt = startsAt + 30 * DAY;
  const offer = async tenantId => {
    const reply = await campus(operator, { action: 'issue', ...base(), unitId: U1, tenantId, startsAt, endsAt });
    assert.equal(reply.ok, true, JSON.stringify(reply));return reply.lease;
  };
  const toAlice = await offer(A), toBob = await offer(B);
  const acceptAlice = { action: 'accept', ...base(), leaseId: toAlice.id, expectedVersion: 1 };
  const acceptBob = { action: 'accept', ...base(), leaseId: toBob.id, expectedVersion: 1 };
  const race = await Promise.all([campus(alice, acceptAlice), campus(bob, acceptBob)]);
  assert.equal(race.filter(reply => reply.ok).length, 1, JSON.stringify(race));
  const winnerIndex = race.findIndex(reply => reply.ok), loserIndex = 1 - winnerIndex;
  assert.equal(race[loserIndex].error, 'campus_lease_ended', 'the losing offer was superseded');
  const [winnerName, loserName] = winnerIndex === 0 ? ['alice', 'bob'] : ['bob', 'alice'], winnerId = ids[winnerName];
  const winnerAccept = winnerIndex === 0 ? acceptAlice : acceptBob;
  const frame = await bob.until(value => value.campus?.leased?.length === 1);
  assert.deepEqual(frame.campus, { contract: { ...CAMPUS_LEASE_CONTRACT }, leasing: 'owner-managed', leased: [U1] });
  assert.equal(JSON.stringify(frame.campus).includes(toAlice.id), false, 'no lease detail in the public frame');
  const managed = (await campus(operator, { action: 'list' })).campus.manage.leases;
  assert.deepEqual(managed.filter(lease => lease.status === 'active').map(lease => lease.tenantId), [winnerId]);
  // Forged and misdirected commands are refused with the same gates on every gateway.
  const loser = loserIndex === 0 ? alice : bob;
  assert.equal((await campus(loser, { action: 'request', ...base(), unitId: U2, startsAt, endsAt, price: 0 })).error, 'invalid_campus_command');
  assert.equal((await campus(loser, { action: 'issue', ...base(), unitId: U2, tenantId: ids[loserName], startsAt, endsAt })).error, 'campus_operator_required');
  assert.equal((await campus(loser, { action: 'request', ...base(), worldId: 'another-world', unitId: U2, startsAt, endsAt })).error, 'campus_world_mismatch');
  assert.equal((await campus(loser, { action: 'request', ...base(), unitId: U1, startsAt, endsAt })).error, 'campus_unit_unavailable');
  // The winner's socket drops; they come back through the other gateway with a new session.
  const winnerSocket = winnerIndex === 0 ? alice : bob;
  winnerSocket.ws.terminate();sessions[winnerName] = 1;
  const back = await join(winnerIndex === 0 ? second : first, winnerName);
  const retried = await campus(back, winnerAccept);
  assert.deepEqual([retried.ok, retried.replayed, retried.lease.status, retried.lease.version], [true, true, 'active', 2], 'the lost reply is recovered, not reapplied');
  const mine = (await campus(back, { action: 'list' })).campus;
  assert.deepEqual(mine.access.map(item => [item.unitId, item.role]), [[U1, 'tenant']]);
  if (mode === 'memory') return;
  // Coordinator replacement: every gateway goes away, a new one serves the same town.
  for (const ws of sockets) ws.terminate();
  for (const app of apps.splice(0)) await app.close();
  const third = await gateway();
  const operatorAgain = await join(third, 'operator'), winnerAgain = await join(third, winnerName);
  const kept = (await campus(operatorAgain, { action: 'list' })).campus.manage.leases.find(lease => lease.status === 'active');
  assert.deepEqual([kept.tenantId, kept.unitId, kept.version], [winnerId, U1, 2]);
  assert.deepEqual((await campus(winnerAgain, winnerAccept)).replayed, true, 'receipts survive replacement');
  assert.equal((await campus(operatorAgain, { action: 'revoke', ...base(), leaseId: kept.id, expectedVersion: kept.version })).ok, true);
  assert.equal((await campus(winnerAgain, { ...winnerAccept, operationId: op(), expectedVersion: 3 })).error, 'campus_lease_ended', 'a revoked lease cannot be revived');
  assert.equal((await campus(winnerAgain, { action: 'list' })).campus.access.length, 0);
  await winnerAgain.until(value => value.campus?.leased?.length === 0);
});

// The transports keep a top-level requestId for reply routing and strip it before the world
// sees the command, so a lease request travels as leaseRequestId (found by #510's journey).
for (const mode of ['memory', 'redis']) test(`${mode}: requests are offered, cancelled and declined by leaseRequestId through the real socket, and replies keep the transport's requestId`, { skip: mode === 'redis' && !process.env.REDIS_URL, timeout: 120_000 }, async t => {
  const { gateway, join, campus } = await harness(t, mode);
  const first = await gateway(), second = await gateway();
  const operator = await join(first, 'operator'), alice = await join(second, 'alice');
  const startsAt = Date.now() + HOUR, endsAt = startsAt + 30 * DAY;
  const routed = reply => { assert.match(String(reply.requestId), /^\d+$/, 'the reply carries the transport requestId');return reply; };
  const ask = async unitId => { const reply = routed(await campus(alice, { action: 'request', ...base(), unitId, startsAt, endsAt }));assert.equal(reply.ok, true, JSON.stringify(reply));return reply.request; };
  const offered = await ask(U1), withdrawn = await ask(U2);
  const issued = routed(await campus(operator, { action: 'issue', ...base(), unitId: U1, tenantId: A, startsAt, endsAt, leaseRequestId: offered.id }));
  assert.deepEqual([issued.ok, issued.lease.requestId], [true, offered.id], JSON.stringify(issued));
  const cancelled = routed(await campus(alice, { action: 'cancel', ...base(), leaseRequestId: withdrawn.id }));
  assert.deepEqual([cancelled.ok, cancelled.request.status], [true, 'cancelled'], JSON.stringify(cancelled));
  const refused = await ask('T2-F3-W-S');
  const declined = routed(await campus(operator, { action: 'decline', ...base(), leaseRequestId: refused.id }));
  assert.deepEqual([declined.ok, declined.request.status], [true, 'declined'], JSON.stringify(declined));
  const mine = (await campus(alice, { action: 'list' })).campus;
  assert.deepEqual(mine.requests.map(item => [item.id, item.status, item.leaseId]),
    [[offered.id, 'offered', issued.lease.id], [withdrawn.id, 'cancelled', null], [refused.id, 'declined', null]]);
  assert.deepEqual(mine.leases.map(lease => [lease.id, lease.status]), [[issued.lease.id, 'offered']]);
});

const testRedis = (name, fn) => test(name, { skip: !process.env.REDIS_URL, timeout: 120_000 }, fn);
const small = served({ scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, 0, 0], collisionPolygons: [], stores: [], buildings: [],
  communityLocations: [{ id: 'a', name: 'Garden', position: [-12, 0, 0] }] });
async function coordinators(t) {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: null });
  redis.on('error', () => {});await redis.connect();
  const prefix = `{river-oaks:campus-room-test:${randomUUID()}}`, rooms = [];
  const clock = { time: Date.UTC(2026, 9, 18, 16) };
  const create = () => { const room = createRedisRoom({ redis, prefix, worldData: small, authorize: async () => true, now: () => clock.time, campusOperators: [OP] });rooms.push(room);return room; };
  t.after(async () => {
    await Promise.all(rooms.map(room => room.close()));
    const keys = await redis.keys(`${prefix}:*`);if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  const join = (room, userId) => room.request({ type: 'join', identity: { userId, name: userId, sessionId: `${userId}-session`, expiresAt: clock.time + 120000 }, connectionId: `${userId}-socket` });
  const send = (room, userId, message) => { clock.time += 500;return room.request({ type: 'command', userId, connectionId: `${userId}-socket`, message: { type: 'campus', ...message } }); };
  return { redis, prefix, clock, create, join, send };
}

testRedis('coordinators: one acceptance wins, leases outlive presence and replacement, expiry is durable, garbled campus state is refused', async t => {
  const f = await coordinators(t), a = f.create(), b = f.create();
  for (const [room, id] of [[a, OP], [a, A], [b, B]]) assert.equal((await f.join(room, id)).ok, true);
  const startsAt = f.clock.time + 5000, endsAt = startsAt + 2 * DAY;
  const toA = await f.send(a, OP, { action: 'issue', ...base(), unitId: U1, tenantId: A, startsAt, endsAt });
  const toB = await f.send(a, OP, { action: 'issue', ...base(), unitId: U1, tenantId: B, startsAt, endsAt });
  const race = await Promise.all([
    f.send(a, A, { action: 'accept', ...base(), leaseId: toA.lease.id, expectedVersion: 1 }),
    f.send(b, B, { action: 'accept', ...base(), leaseId: toB.lease.id, expectedVersion: 1 }),
  ]);
  assert.equal(race.filter(reply => reply.ok).length, 1, JSON.stringify(race));
  const winner = race[0].ok ? A : B, winnerLease = race.find(reply => reply.ok).lease;
  assert.deepEqual((await b.read()).snapshot.campus.leased, [U1]);
  assert.match(await f.redis.get(`${f.prefix}:lease`), /^v15:/);
  const state = async () => JSON.parse(inflateSync(await f.redis.getBuffer(`${f.prefix}:state`)).toString());
  assert.equal((await state()).checkpoint.version, 14);
  assert.deepEqual((await state()).checkpoint.payload.campus.leases.filter(lease => lease.status === 'active').map(lease => lease.tenantId), [winner]);
  // Everyone leaves past the presence timeouts; the lease is not presence.
  await a.close();await b.close();
  f.clock.time += 60_000;
  const c = f.create();await c.tick();
  assert.equal((await c.read()).snapshot.players.length, 0);
  assert.equal((await f.join(c, winner)).ok, true);
  const listed = await f.send(c, winner, { action: 'list' });
  assert.deepEqual(listed.campus.access.map(item => [item.unitId, item.role, item.leaseId]), [[U1, 'tenant', winnerLease.id]]);
  // Expiry while nobody watched ends access at its due time and is committed.
  f.clock.time = endsAt + HOUR;
  assert.equal((await f.join(c, winner)).ok, true);
  const later = await f.send(c, winner, { action: 'list' });
  assert.equal(later.campus.access.length, 0);
  assert.deepEqual(later.campus.leases.map(lease => [lease.status, lease.endedReason, lease.endedAt]), [['ended', 'expired', endsAt]]);
  await c.tick();
  assert.equal((await state()).checkpoint.payload.campus.leases.find(lease => lease.id === winnerLease.id).endedReason, 'expired');
  await c.close();
  // A garbled durable campus section is refused by the next coordinator, untouched.
  const saved = await state();
  saved.checkpoint.payload.campus.leases[0].charge = 'usd';
  const { checksum: _checksum, ...envelope } = saved.checkpoint;
  saved.checkpoint.checksum = createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  const corrupt = deflateSync(JSON.stringify(saved));
  await f.redis.set(`${f.prefix}:state`, corrupt);await f.redis.del(`${f.prefix}:lease`);
  const d = f.create();
  await assert.rejects(d.tick(), /Invalid durable town checkpoint/);
  assert.deepEqual(await f.redis.getBuffer(`${f.prefix}:state`), corrupt, 'recovery writes nothing');
});
