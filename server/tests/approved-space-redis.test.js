import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createRedisWorldCatalog } from '../world-catalog.js';
import { createRedisRoom } from '../redis-room.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { roomPrefixFor } from '../world-keys.js';
import { approvedWaitlist } from './waitlist-fixture.js';

// #420 on the Redis path: the catalog's atomic scripts and the room's fenced commit.
// Needs an isolated, disposable Redis (REDIS_URL); every key lives in a random namespace.
const options = { skip: !process.env.REDIS_URL, timeout: 90_000 };
const pilot = JSON.parse(await readFile(new URL('./fixtures/cafe-pilot-region.json', import.meta.url)));
const withoutCafe = () => { const region = structuredClone(pilot); delete region.buildings[0].interior.space; return region; };
const [owner] = JEVICA_ADMIN_USER_IDS;

// One ordered cleanup per test: the test's own services first, Redis last.
async function redisFor(t, before = async () => {}) {
  const redis = new Redis(process.env.REDIS_URL); redis.on('error', () => {});
  const namespace = `river-oaks:cafe-420-test:${randomUUID()}`, cleanup = [];
  t.after(async () => {
    for (const step of cleanup.reverse()) await step();
    const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys); await redis.quit();
  });
  return { redis, namespace, prefix: `{${namespace}}`, cleanup };
}

test('the Redis catalog refuses revoked or cross-owner placement in its atomic scripts', options, async t => {
  const { redis, prefix } = await redisFor(t);
  const catalog = createRedisWorldCatalog({ redis, prefix });
  assert.equal((await catalog.revokeApprovedSpace('corner-cafe@1')).ok, true);
  assert.deepEqual(await catalog.publish({ id: 'harbour-cafe', title: 'Harbour Café', region: pilot }, owner), { ok: false, reason: 'approved_space_revoked' });
  assert.equal(await catalog.get('harbour-cafe'), null, 'nothing is stored');
  await redis.srem(`${prefix}:approved-space-revocations:v1`, 'corner-cafe@1');
  assert.equal((await catalog.publish({ id: 'harbour-cafe', title: 'Harbour Café', region: withoutCafe() }, owner)).ok, true);
  const meta = await catalog.get('harbour-cafe');
  assert.equal((await catalog.saveDraft({ id: 'harbour-cafe', baseRegionSha256: meta.regionSha256, expectedDraftVersion: 0, region: pilot }, owner)).ok, true);
  assert.equal((await catalog.revisionCandidate('harbour-cafe', 1, 'another-publisher')).reason, 'not_owner');
  const candidate = await catalog.revisionCandidate('harbour-cafe', 1, owner);
  assert.equal(candidate.ok, true);
  assert.deepEqual(candidate.sources, ['corner-cafe@1']);
  assert.equal(await catalog.activationReason(candidate), null);
  await catalog.revokeApprovedSpace('corner-cafe@1');
  assert.equal(await catalog.activationReason(candidate), 'approved_space_revoked');
  // A revoked revision's history and drafts stay readable; only activation is fenced.
  assert.equal((await catalog.editable('harbour-cafe')).draft.version, 1);
  assert.equal((await catalog.history('harbour-cafe')).ok, true);
});

test('a revocation that lands just before the room commits is refused by Redis itself; the prior world stays', options, async t => {
  const { redis, namespace, prefix, cleanup } = await redisFor(t);
  const catalog = createRedisWorldCatalog({ redis, prefix });
  assert.equal((await catalog.publish({ id: 'harbour-cafe', title: 'Harbour Café', region: withoutCafe() }, owner)).ok, true);
  const meta = await catalog.get('harbour-cafe');
  let time = Date.now();
  const room = createRedisRoom({ redis, prefix: roomPrefixFor(namespace, 'harbour-cafe'), worldId: 'harbour-cafe',
    worldData: await catalog.getRegion('harbour-cafe'), regionCatalog: catalog, regionSha256: meta.regionSha256,
    now: () => time, authorize: async () => true, isAdmin: id => id === owner });
  cleanup.push(() => room.close());
  const identity = { userId: owner, name: 'Owner', sessionId: 'owner-session', expiresAt: time + 120_000 };
  assert.equal((await room.request({ type: 'join', identity, connectionId: 'owner-socket' })).ok, true);
  assert.equal((await catalog.saveDraft({ id: 'harbour-cafe', baseRegionSha256: meta.regionSha256, expectedDraftVersion: 0, region: pilot }, owner)).ok, true);
  const previousView = await room.read(), previousMeta = await catalog.get('harbour-cafe');
  const evalRedis = redis.eval.bind(redis); let intercepted = false;
  redis.eval = async (...args) => {
    if (!intercepted && args[0].startsWith('-- COMMIT_ROOM')) {
      intercepted = true;
      await catalog.revokeApprovedSpace('corner-cafe@1');
      assert.equal(await evalRedis(...args), 0, 'the real commit script refuses the revoked revision');
      assert.deepEqual(await catalog.get('harbour-cafe'), previousMeta);
      assert.deepEqual(await room.read(), previousView);
      return 0;
    }
    return evalRedis(...args);
  };
  const result = await room.request({ type: 'revise', actorId: owner, expectedDraftVersion: 1 });
  assert.equal(intercepted, true);
  assert.equal(result.error, 'approved_space_revoked', 'the retry is refused before any swap');
  assert.deepEqual(await catalog.get('harbour-cafe'), previousMeta);
  assert.equal((await catalog.getRegion('harbour-cafe')).buildingInteriors, undefined);
  assert.equal((await room.read()).snapshot.protocolVersion, 3);
});

test('through the Redis gateway, two clients join the Café world and an older client is refused there', options, async t => {
  const { redis, namespace, prefix, cleanup } = await redisFor(t);
  const origin = 'https://sim.jev.works';
  const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const users = new Map([['owner', owner], ['guest', 'guest-user']]);
  const auth = { handle: async () => false, authenticate: async req => {
    const userId = users.get(req.headers.cookie?.match(/test_session=(\w+)/)?.[1]);
    return userId ? { userId, name: userId, sessionId: `${userId}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000 } : null;
  }, isSessionActive: async () => true, close() {} };
  const security = createRedisSecurity({ redis, prefix });
  const gateway = createWorldGateway({ redis, namespace, worldData, auth, security, waitlist: approvedWaitlist, origin, moderators: [owner], approvedSpacesEnabled: true });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.server.address().port}`, sockets = [];
  cleanup.push(async () => { for (const socket of sockets) socket.terminate(); await gateway.close(); security.close(); });
  const post = (user, path, data = {}) => fetch(base + path, { method: 'POST', headers: { Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await post('guest', '/api/worlds', { id: 'harbour-cafe', title: 'Harbour Café', region: pilot })).status, 403);
  assert.equal((await post('owner', '/api/worlds', { id: 'harbour-cafe', title: 'Harbour Café', region: pilot })).status, 201);
  const open = async (user, protocol) => {
    const access = await (await post(user, '/api/multiplayer/ticket?world=harbour-cafe')).json();
    const socket = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?world=harbour-cafe&protocol=${protocol}&ticket=${access.ticket}`, { headers: { Origin: origin, Cookie: `test_session=${user}` } });
    sockets.push(socket);
    const outcome = await new Promise(resolve => {
      socket.on('message', raw => { const message = JSON.parse(raw); if (message.type === 'snapshot') resolve({ snapshot: message }); });
      socket.once('close', code => resolve({ closed: code }));
      socket.once('unexpected-response', (_, response) => resolve({ refused: response.statusCode }));
    });
    return { socket, access, ...outcome };
  };
  // Before and after the room's first commit, the Café world asks for protocol 4 and
  // closes an older client before it joins.
  const older = await open('guest', 3);
  assert.equal(older.access.protocolVersion, 4);
  assert.equal(older.closed, 4000);
  const first = await open('owner', 4), second = await open('guest', 4);
  for (const joined of [first, second]) {
    assert.equal(joined.snapshot.protocolVersion, 4);
    assert.equal(joined.snapshot.regionSha256, first.snapshot.regionSha256);
  }
  const command = (socket, requestId, body) => new Promise(resolve => {
    const receive = raw => { const value = JSON.parse(raw); if (value.type === 'result' && value.requestId === requestId) { socket.off('message', receive); resolve(value); } };
    socket.on('message', receive); socket.send(JSON.stringify({ requestId, ...body }));
  });
  const entered = await command(second.socket, 'enter', { type: 'travel', storeId: 'venue-corner-cafe', mode: 'enter' });
  assert.equal(entered.ok, true, entered.error);
  assert.equal(entered.player.levelId, 'corner-cafe/l0');
  const again = await open('guest', 3);
  assert.equal(again.access.protocolVersion, 4);
  assert.equal(again.closed, 4000);
  const listed = await (await fetch(base + '/api/worlds')).json();
  assert.equal(listed.worlds.find(world => world.id === 'harbour-cafe').visitors, 2, 'the refused client never joined');
});

test('a production-default Redis gateway refuses the Café and keeps worlds on protocol 3', options, async t => {
  const { redis, namespace, prefix, cleanup } = await redisFor(t);
  const origin = 'https://sim.jev.works';
  const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const auth = { handle: async () => false, authenticate: async req => req.headers.cookie === 'test_session=owner'
    ? { userId: owner, name: 'owner', sessionId: 'owner-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000 } : null,
  isSessionActive: async () => true, close() {} };
  const security = createRedisSecurity({ redis, prefix });
  // As server/redis-backend.js builds it with RIVER_OAKS_APPROVED_SPACES unset.
  const gateway = createWorldGateway({ redis, namespace, worldData, auth, security, waitlist: approvedWaitlist, origin, moderators: [owner] });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  cleanup.push(async () => { await gateway.close(); security.close(); });
  const post = (path, data = {}) => fetch(base + path, { method: 'POST', headers: { Origin: origin, Cookie: 'test_session=owner', 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal(Object.hasOwn(await (await fetch(base + '/api/worlds')).json(), 'approvedSpaces'), false);
  const refused = await post('/api/worlds', { id: 'harbour-cafe', title: 'Harbour Café', region: pilot });
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error, 'approved_space_unknown');
  assert.equal(await redis.hget(`${prefix}:worlds:v1`, 'harbour-cafe'), null, 'nothing is stored');
  assert.equal((await post('/api/worlds', { id: 'harbour-cafe', title: 'Harbour Café', region: withoutCafe() })).status, 201);
  const ticket = await (await post('/api/multiplayer/ticket?world=harbour-cafe')).json();
  assert.equal(ticket.protocolVersion, 3);
});
