import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createSharedWorld } from '../world.js';
import { compileRegionPackage } from '../region-package.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { createVoiceService, createMemoryVoiceLeases, createRedisVoiceLeases, voiceSpaceName } from '../voice.js';
import { createFakeLiveKit } from './livekit-fixture.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

const NAMESPACE = 'river-oaks:test:v1';
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const live = { skip: !process.env.REDIS_URL, timeout: 30_000 };
const auth = {
  async handle() { return false; },
  async authenticate(req) { const id = req.headers.cookie?.match(/session=([\w@.-]+)/)?.[1]; return id ? { userId: id, name: id, sessionId: id + '-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000 } : null; },
};
const room = (worldId, space) => voiceSpaceName({ namespace: NAMESPACE, worldId, space });

async function fixture(t, { voiceOn = true, worldData = data, worldId = 'river-oaks', isAdmin = id => id === 'owner', banned = new Set(), pending = new Set() } = {}) {
  const livekit = createFakeLiveKit(), leases = createMemoryVoiceLeases();
  const voice = voiceOn ? createVoiceService({ leases, livekit, namespace: NAMESPACE, allow: async () => true, log: { warn() {} } }) : null;
  // The world's own clock can be moved past its cooldowns; auth and tickets keep real time.
  let offset = 0;
  const world = createSharedWorld(worldData, { isAdmin, worldId, now: () => Date.now() + offset });
  const waitlist = { ...approvedWaitlist, isApproved: async id => !pending.has(id) };
  const moderation = { isBanned: id => banned.has(id), async setBanned() {}, async report() {} };
  const app = createGameServer({ auth, world, waitlist, moderation, origin: 'http://127.0.0.1', staticRoot: '/nonexistent', voice, isAdmin });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const sockets = [];
  t.after(async () => { for (const ws of sockets) ws.terminate(); await app.close(); });
  const query = worldId === 'river-oaks' ? '' : `?world=${worldId}`;
  const post = (user, path, body = {}, headers = {}) => fetch(origin + path, { method: 'POST', headers: { Origin: 'http://127.0.0.1', 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json', ...(user ? { Cookie: `session=${user}` } : {}), ...headers }, body: JSON.stringify(body) });
  const voiceCall = (user, action, body, headers) => post(user, `/api/voice/${action}${query}`, body, headers);
  const connect = async user => {
    const ticket = (await (await post(user, `/api/multiplayer/ticket${query}`)).json()).ticket;
    const params = new URLSearchParams({ ticket, protocol: '3' }); if (worldId !== 'river-oaks') params.set('world', worldId);
    const ws = new WebSocket(`${origin.replace('http', 'ws')}/multiplayer?${params}`, { headers: { Origin: 'http://127.0.0.1', Cookie: `session=${user}` } });
    sockets.push(ws);
    const snapshot = await new Promise((resolve, reject) => { ws.once('message', raw => resolve(JSON.parse(raw))); ws.once('error', reject); });
    return { ws, snapshot, closed: new Promise(resolve => ws.once('close', code => resolve(code))) };
  };
  return { app, origin, world, livekit, leases, voice, post, voiceCall, connect, worldId, advance: ms => { offset += ms; } };
}

test('voice routes require a session, approval, no ban, the exact origin, CSRF and rate allowance before any LiveKit call', async t => {
  const f = await fixture(t, { banned: new Set(['banned']), pending: new Set(['pending']) });
  assert.equal((await f.voiceCall(null, 'join')).status, 401);
  assert.equal((await f.voiceCall('pending', 'join')).status, 403);
  assert.equal((await f.voiceCall('banned', 'join')).status, 403);
  assert.equal((await f.voiceCall('alice', 'join', {}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.voiceCall('alice', 'join', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await fetch(f.origin + '/api/voice/join', { method: 'GET', headers: { Cookie: 'session=alice' } })).status, 405);
  assert.equal((await f.voiceCall('alice', 'unknown')).status, 404);
  for (let i = 0; i < 30; i++) assert.equal((await f.voiceCall('alice', 'join')).status, 409, 'not connected, but inside the rate allowance');
  assert.equal((await f.voiceCall('alice', 'join')).status, 429);
  assert.equal(f.livekit.calls.length, 0);
});

test('join needs a live game connection in this world and ignores a client-supplied room, identity, world and space', async t => {
  const f = await fixture(t);
  assert.deepEqual(await (await f.voiceCall('alice', 'join')).json(), { ok: false, error: 'not_connected' });
  const { snapshot } = await f.connect('alice');
  assert.deepEqual(snapshot.voice, { available: true });
  assert.deepEqual(snapshot.players.find(player => player.id === 'alice').voice, { space: 'outdoor', id: null });
  const response = await f.voiceCall('alice', 'join', { room: 'river-oaks.test.v1.river-oaks.osm-node-1', identity: 'alice', worldId: 'other', space: 'osm-node-1', participantIdentity: 'chosen' });
  assert.equal(response.status, 200);
  const joined = await response.json();
  assert.equal(joined.ok, true);
  assert.equal(joined.space, 'outdoor');
  assert.equal(joined.token, `fake.${room('river-oaks', 'outdoor')}.${joined.participantIdentity}.60`);
  assert.notEqual(joined.participantIdentity, 'alice');
  assert.notEqual(joined.participantIdentity, 'chosen');
  assert.equal(typeof joined.url, 'string');
  assert.equal((await f.post('alice', '/api/voice/join?world=other')).status, 404);
  const oversized = await f.voiceCall('alice', 'join', { padding: 'x'.repeat(2000) });
  assert.equal(oversized.status, 400);
});

test('a player inside a store joins that store\'s room, and leaving it changes the space on renew', async t => {
  const f = await fixture(t);
  await f.connect('alice');
  const storeId = data.stores[0].id;
  assert.equal(f.world.command('alice', { type: 'travel', storeId, mode: 'enter' }).ok, true);
  const joined = await (await f.voiceCall('alice', 'join')).json();
  assert.equal(joined.space, storeId);
  assert.equal(joined.token, `fake.${room('river-oaks', storeId)}.${joined.participantIdentity}.60`);
  const same = await (await f.voiceCall('alice', 'renew', { participantIdentity: joined.participantIdentity })).json();
  assert.equal(same.ok, true);
  assert.equal(same.space, storeId);
  f.advance(1100);
  assert.equal(f.world.command('alice', { type: 'travel', storeId, mode: 'leave' }).ok, true);
  const moved = await f.voiceCall('alice', 'renew', { participantIdentity: joined.participantIdentity });
  assert.equal(moved.status, 409);
  assert.deepEqual(await moved.json(), { ok: false, error: 'space_changed', space: 'outdoor' });
  assert.deepEqual(f.livekit.called('removeParticipant'), [['removeParticipant', room('river-oaks', storeId), joined.participantIdentity]]);
  const outside = await (await f.voiceCall('alice', 'join')).json();
  assert.equal(outside.space, 'outdoor');
});

test('a player inside a private home without access gets no_space and no token', async t => {
  const sample = JSON.parse(await readFile(new URL('../../preview/public/data/sample-region.json', import.meta.url)));
  const region = { ...sample, buildings: sample.buildings.map((building, index) => index === 2 ? { ...building, interior: { name: 'Moon House', category: 'home', entrance: 'south', access: 'owner' } } : building) };
  const worldData = compileRegionPackage(region, 'Moon Garden'), home = createWalkingEnvironment(worldData).rooms[0];
  const admin = JEVICA_ADMIN_USER_IDS[0];
  const f = await fixture(t, { worldData, worldId: 'moon-garden', isAdmin: id => id === admin });
  await f.connect(admin); await f.connect('guest');
  assert.equal(f.world.command('guest', { type: 'travel', storeId: home.storeId, mode: 'enter' }).error, 'private_home');
  assert.equal(f.world.command(admin, { type: 'homeAccess', action: 'grant', storeId: home.storeId, peerId: 'guest' }).ok, true);
  assert.equal(f.world.command('guest', { type: 'travel', storeId: home.storeId, mode: 'enter' }).ok, true);
  assert.equal(f.world.voiceSpaceOf('guest'), home.storeId);
  const joined = await (await f.voiceCall('guest', 'join')).json();
  assert.equal(joined.space, home.storeId);
  // Revocation moves the guest outside; put them back to prove the gate itself.
  assert.equal(f.world.command(admin, { type: 'homeAccess', action: 'revoke', storeId: home.storeId, peerId: 'guest' }).ok, true);
  const guest = f.world.players.get('guest');
  const [east, north] = home.toWorld(0, 1);
  guest.position = [east, north, guest.position[2]];
  assert.equal(f.world.voiceSpaceOf('guest'), null);
  const refused = await f.voiceCall('guest', 'join');
  assert.equal(refused.status, 409);
  assert.deepEqual(await refused.json(), { ok: false, error: 'no_space' });
  assert.equal(f.livekit.called('token').length, 1);
  assert.equal(f.world.voiceSpaceOf(admin), 'outdoor');
  assert.equal(f.world.voiceSpaceOf('nobody'), null);
});

test('a replaced tab cannot release or renew its successor\'s lease', async t => {
  const f = await fixture(t);
  const first = await f.connect('alice');
  const stale = await (await f.voiceCall('alice', 'join')).json();
  await f.connect('alice');
  assert.equal(await first.closed, 4009);
  const current = await (await f.voiceCall('alice', 'join')).json();
  assert.notEqual(current.participantIdentity, stale.participantIdentity);
  assert.deepEqual(await (await f.voiceCall('alice', 'leave', { participantIdentity: stale.participantIdentity })).json(), { ok: true, left: false });
  assert.equal((await f.voiceCall('alice', 'renew', { participantIdentity: stale.participantIdentity })).status, 409);
  assert.equal((await f.leases.getMany(['alice'])).get('alice').participantIdentity, current.participantIdentity);
  assert.deepEqual(await (await f.voiceCall('alice', 'leave', { participantIdentity: current.participantIdentity })).json(), { ok: true, left: true });
  assert.equal((await f.leases.getMany(['alice'])).size, 0);
  assert.equal((await f.voiceCall('alice', 'leave', { participantIdentity: current.participantIdentity })).status, 200, 'leaving twice is harmless');
});

test('a ban, approval loss, logout or move to another world revokes the voice lease with the connection', async t => {
  const f = await fixture(t);
  const { closed } = await f.connect('alice');
  const joined = await (await f.voiceCall('alice', 'join')).json();
  assert.equal((await f.leases.getMany(['alice'])).size, 1);
  // Every kick (ban, approval ended, logout, joined another world) goes through this one path.
  f.app.disconnectUser('alice', 4003, 'This account cannot join the town.');
  assert.equal(await closed, 4003);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await f.leases.getMany(['alice'])).size, 0);
  assert.deepEqual(f.livekit.called('removeParticipant'), [['removeParticipant', room('river-oaks', 'outdoor'), joined.participantIdentity]]);
  assert.deepEqual(await (await f.voiceCall('alice', 'renew', { participantIdentity: joined.participantIdentity })).json(), { ok: false, error: 'not_connected' });
});

test('with voice off the routes answer 404 and the snapshot does not advertise voice', async t => {
  const f = await fixture(t, { voiceOn: false });
  const { snapshot } = await f.connect('alice');
  assert.equal(snapshot.voice, undefined);
  assert.deepEqual(snapshot.players[0].voice, { space: 'outdoor', id: null }, 'the world still reports the space; only the service is absent');
  assert.equal((await f.voiceCall('alice', 'join')).status, 404);
});

test('the world rejects a voice command from a client and reports voice state on players', () => {
  let time = 1000;
  const world = createSharedWorld(data, { now: () => time });
  world.join({ userId: 'alice', name: 'Alice' });
  assert.equal(world.command('alice', { type: 'voice', room: 'x' }).error, 'invalid_command');
  assert.deepEqual(world.snapshot().players[0].voice, { space: 'outdoor', id: null });
  world.setVoice('alice', 'participant-1');
  assert.deepEqual(world.snapshot().players[0].voice, { space: 'outdoor', id: 'participant-1' });
  const player = world.players.get('alice');
  player.altitude = 3;
  assert.equal(world.voiceSpaceOf('alice'), 'outdoor', 'flying is never an interior');
  player.altitude = 0;
  world.setVoice('alice', null);
  assert.deepEqual(world.snapshot().players[0].voice, { space: 'outdoor', id: null });
  assert.equal(world.setVoice('nobody', 'p'), false);
  const revived = createSharedWorld(data, { now: () => time });
  world.setVoice('alice', 'participant-2');
  assert.equal(revived.restore(world.checkpoint()).ok, true);
  assert.deepEqual(revived.snapshot().players[0].voice, { space: 'outdoor', id: null }, 'voice identities are not checkpointed');
});

test('the hosted edge derives the voice space from the committed room view', live, async t => {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', () => {});
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  const sessions = new Map(['alice', 'bob'].map(userId => [userId, { userId, name: userId, sessionId: userId + '-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000 }]));
  const security = createRedisSecurity({ redis, prefix });
  const livekit = createFakeLiveKit();
  const voice = createVoiceService({ leases: createRedisVoiceLeases({ redis, prefix }), livekit, namespace: NAMESPACE, allow: security.allow, log: { warn() {} } });
  const hostedRoom = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, authorize: async identity => sessions.get(identity.userId)?.sessionId === identity.sessionId });
  const app = createDistributedServer({ auth: { authenticate: async req => sessions.get(req.headers.cookie?.match(/test_session=(\w+)/)?.[1]) ?? null, handle: async () => false }, security, room: hostedRoom, waitlist: approvedWaitlist, origin: 'https://sim.jev.works', voice });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const sockets = [];
  t.after(async () => { for (const ws of sockets) ws.terminate(); await app.close(); await hostedRoom.close(); const keys = await redis.keys(prefix + ':*'); if (keys.length) await redis.del(...keys); await redis.quit(); });
  const post = (user, path, body = {}) => fetch(url + path, { method: 'POST', headers: { Origin: 'https://sim.jev.works', Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.deepEqual(await (await post('alice', '/api/voice/join')).json(), { ok: false, error: 'not_connected' });
  const ticket = (await (await post('alice', '/api/multiplayer/ticket?world=river-oaks')).json()).ticket;
  const ws = new WebSocket(`${url.replace('http:', 'ws:')}/multiplayer?${new URLSearchParams({ ticket, world: 'river-oaks', protocol: '3' })}`, { headers: { Origin: 'https://sim.jev.works', Cookie: 'test_session=alice' } });
  sockets.push(ws);
  const snapshot = await new Promise((resolve, reject) => { ws.once('message', raw => resolve(JSON.parse(raw))); ws.once('error', reject); });
  assert.deepEqual(snapshot.voice, { available: true });
  const joined = await (await post('alice', '/api/voice/join?world=river-oaks', { space: 'osm-node-1' })).json();
  assert.equal(joined.ok, true);
  assert.equal(joined.space, 'outdoor');
  assert.equal(joined.token, `fake.${room('river-oaks', 'outdoor')}.${joined.participantIdentity}.60`);
  assert.equal((await post('alice', '/api/voice/renew?world=river-oaks', { participantIdentity: joined.participantIdentity })).status, 200);
  assert.equal((await post('alice', '/api/voice/join?world=moon-garden')).status, 404);
  assert.deepEqual(await (await post('alice', '/api/voice/leave?world=river-oaks', { participantIdentity: joined.participantIdentity })).json(), { ok: true, left: true });
  for (let i = 0; i < 30; i++) await post('bob', '/api/voice/join?world=river-oaks');
  assert.equal((await post('bob', '/api/voice/join?world=river-oaks')).status, 429, 'the shared voice rate scope is allowlisted');
});
