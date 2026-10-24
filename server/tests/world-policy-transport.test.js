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
import { createRedisRoom, WRITER_GENERATION } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';

// World rules (#596) through the real ticket and WebSocket gates: one memory server, or two
// Redis gateways sharing a town, then coordinator replacement. Redis cases skip without REDIS_URL.
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const OWNER = 'jevica-owner', isOwner = id => id === OWNER;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function harness(t, mode) {
  const origin = 'http://127.0.0.1', ids = { owner: OWNER, alice: 'alice', bob: 'bob' }, sessions = {};
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true, authenticate: async req => {
    const id = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];
    return ids[id] ? { userId: ids[id], name: id, sessionId: `${id}-session-${sessions[id] ?? 0}`, csrfToken: 'test-csrf', expiresAt: Date.now() + 60000 } : null;
  } };
  const namespace = `river-oaks:world-policy-test:${randomUUID()}`, clients = [], apps = [], sockets = [];
  const redisFor = () => { const redis = new Redis(process.env.REDIS_URL);clients.push(redis);return redis; };
  const security = mode === 'redis' ? createRedisSecurity({ redis: redisFor(), prefix: `{${namespace}}` }) : null;
  const memory = mode === 'memory' ? createGameServer({ world: createSharedWorld(data, { isAdmin: isOwner }), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent', isAdmin: isOwner }) : null;
  const gateway = async () => {
    const app = memory ?? createWorldGateway({ redis: redisFor(), namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin, isAdmin: isOwner });
    if (!app.server.listening) await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    if (!apps.includes(app)) apps.push(app);
    return { app, base: `http://127.0.0.1:${app.server.address().port}` };
  };
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    for (const app of apps) await app.close().catch(() => {});
    security?.close();
    if (clients.length) { const keys = await clients[0].keys(`*${namespace}*`);if (keys.length) await clients[0].del(...keys); }
    for (const redis of clients) await redis.quit();
  });
  const join = async (target, id) => {
    const response = await fetch(target.base + '/api/multiplayer/ticket', { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'test-csrf' } });
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    const ws = new WebSocket(`${target.base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: `fixture=${id}` } });
    sockets.push(ws);
    const pending = new Map();let last = null, seq = 0;
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
        const requestId = String(++seq), timeout = setTimeout(() => { pending.delete(requestId);reject(new Error('World rules command timed out')); }, 8000);
        pending.set(requestId, value => { clearTimeout(timeout);resolve(value); });
        ws.send(JSON.stringify({ ...message, requestId }));
      }),
      until: check => new Promise((resolve, reject) => {
        if (last && check(last)) return resolve(last);
        const timeout = setTimeout(() => reject(new Error('No matching snapshot')), 8000);
        ws.on('message', function seen(raw) { const value = JSON.parse(raw);if (value.type === 'snapshot' && check(value)) { clearTimeout(timeout);ws.off('message', seen);resolve(value); } });
      }),
    };
  };
  return { sessions, gateway, join, sockets, apps };
}

for (const mode of ['memory', 'redis']) test(`${mode}: owner rules reach both clients, forged commands change nothing, and rules survive reconnect${mode === 'redis' ? ' and writer replacement' : ''}`, { skip: mode === 'redis' && !process.env.REDIS_URL, timeout: 120_000 }, async t => {
  const { sessions, gateway, join, sockets, apps } = await harness(t, mode);
  const first = await gateway(), second = await gateway();
  const owner = await join(first, 'owner'), alice = await join(first, 'alice'), bob = await join(second, 'bob');
  assert.equal(bob.snapshot.worldPolicy.violence.mode, 'off', 'peaceful by default');
  assert.equal(owner.snapshot.players.find(player => player.id === OWNER).canSetWorldPolicy, true);
  assert.equal(bob.snapshot.players.find(player => player.id === 'bob').canSetWorldPolicy, false);
  // Forged: another account, a claimed identity, and an emergency stop all need the owner.
  const forged = { type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { violence: { mode: 'forced', zones: ['westcreek-lane'], pvp: true } } };
  assert.equal((await alice.send(forged)).error, 'world_policy_owner_only');
  assert.equal((await bob.send({ ...forged, userId: OWNER })).error, 'world_policy_owner_only');
  assert.equal((await bob.send({ type: 'worldPolicy', action: 'emergencyOff' })).error, 'world_policy_owner_only');
  const applied = await owner.send({ type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { violence: { mode: 'scheduled', zones: ['westcreek-lane'] }, clock: { minute: 22 * 60, rate: 0 } } });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  // Both clients, on both gateways, see the same revision and rules.
  for (const client of [alice, bob]) {
    const frame = await client.until(value => value.worldPolicy.revision === 1);
    assert.deepEqual([frame.worldPolicy.violence.mode, frame.worldPolicy.violence.zones, frame.worldPolicy.minute, frame.worldPolicy.active], ['scheduled', ['westcreek-lane'], 1320, true]);
  }
  // A stale second edit is a conflict, not a silent overwrite.
  assert.equal((await owner.send({ type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { violence: { pvp: true } } })).error, 'world_policy_conflict');
  // Bob drops and returns on the other gateway with a new session: the rules are the town's.
  bob.ws.terminate();sessions.bob = 1;
  const bobAgain = await join(first, 'bob');
  assert.equal(bobAgain.snapshot.worldPolicy.revision, 1);
  assert.deepEqual(bobAgain.snapshot.worldPolicy.violence.zones, ['westcreek-lane']);
  const stopped = await owner.send({ type: 'worldPolicy', action: 'emergencyOff' });
  assert.deepEqual([stopped.ok, stopped.worldPolicy.violence.mode, stopped.worldPolicy.lastChange.kind], [true, 'off', 'emergency_off']);
  for (const client of [alice, bobAgain]) assert.equal((await client.until(value => value.worldPolicy.revision === 2)).worldPolicy.violence.mode, 'off');
  // Social life carries on.
  assert.equal((await alice.send({ type: 'chat', text: 'all calm' })).ok, true);
  if (mode === 'memory') return;
  // Writer replacement: every gateway goes; a new one serves the same rules.
  for (const ws of sockets) ws.terminate();
  for (const app of apps.splice(0)) await app.close();
  const third = await gateway();
  const ownerAgain = await join(third, 'owner');
  assert.deepEqual([ownerAgain.snapshot.worldPolicy.revision, ownerAgain.snapshot.worldPolicy.violence.mode, ownerAgain.snapshot.worldPolicy.lastChange.kind, ownerAgain.snapshot.worldPolicy.minute], [2, 'off', 'emergency_off', 1320]);
  assert.deepEqual(ownerAgain.snapshot.worldPolicy.violence.zones, ['westcreek-lane'], 'configured zones are kept for later');
});

const testRedis = (name, fn) => test(name, { skip: !process.env.REDIS_URL, timeout: 120_000 }, fn);
const small = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, 0, 0], collisionPolygons: [], stores: [], buildings: [], communityLocations: [{ id: 'a', name: 'Garden', position: [-12, 0, 0] }] };

testRedis('coordinators: a v13 town committed by an older writer is fenced, restored peaceful with its chat, then keeps new rules', async t => {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: null });
  redis.on('error', () => {});await redis.connect();
  const prefix = `{river-oaks:world-policy-room-test:${randomUUID()}}`, rooms = [], clock = { time: Date.UTC(2026, 9, 22, 20) };
  const create = () => { const room = createRedisRoom({ redis, prefix, worldData: small, authorize: async () => true, now: () => clock.time, isAdmin: isOwner });rooms.push(room);return room; };
  t.after(async () => {
    await Promise.all(rooms.map(room => room.close()));
    const keys = await redis.keys(`${prefix}:*`);if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  const join = (room, userId) => room.request({ type: 'join', identity: { userId, name: userId, sessionId: `${userId}-session`, expiresAt: clock.time + 600000 }, connectionId: `${userId}-socket` });
  const send = (room, userId, message) => { clock.time += 1500;return room.request({ type: 'command', userId, connectionId: `${userId}-socket`, message }); };
  const state = async () => JSON.parse(inflateSync(await redis.getBuffer(`${prefix}:state`)).toString());
  const first = create();
  assert.equal((await join(first, 'alice')).ok, true);
  assert.equal((await send(first, 'alice', { type: 'chat', text: 'before the rules' })).ok, true);
  await first.close();
  // Rewrite the committed town as a v13 writer left it: no rules, and that writer's lease.
  const room = await state();
  const { worldPolicy, ...payload } = room.checkpoint.payload;
  assert.equal(worldPolicy.revision, 0);
  const envelope = { version: 13, worldId: room.checkpoint.worldId, worldFingerprint: room.checkpoint.worldFingerprint, payload };
  room.checkpoint = { ...envelope, checksum: digest(envelope) };
  await redis.set(`${prefix}:state`, deflateSync(Buffer.from(JSON.stringify(room))));
  await redis.set(`${prefix}:lease`, `v14:${randomUUID()}`, 'PX', 5000);
  const next = create();await next.tick();
  assert.match(await redis.get(`${prefix}:lease`), new RegExp(`^v${WRITER_GENERATION}:`), 'the new generation fences the older writer at once');
  const view = (await next.read()).snapshot;
  assert.equal(view.worldPolicy.violence.mode, 'off');
  assert.deepEqual(view.chat.map(entry => entry.text), ['before the rules'], 'unrelated town state survives');
  assert.equal((await join(next, OWNER)).ok, true);
  assert.equal((await send(next, OWNER, { type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { violence: { mode: 'forced', zones: ['westcreek-lane'] } } })).ok, true);
  assert.equal((await state()).checkpoint.version, 16);
  // An older writer can no longer take this town; a v14 lease would be fenced again.
  await next.close();
  clock.time += 60_000;
  const third = create();await third.tick();
  const kept = (await third.read()).snapshot.worldPolicy;
  assert.deepEqual([kept.revision, kept.violence.mode, kept.violence.zones], [1, 'forced', ['westcreek-lane']]);
  assert.deepEqual((await state()).checkpoint.payload.chat.map(entry => entry.text), ['before the rules']);
});
