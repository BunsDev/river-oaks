import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setImmediate as flush } from 'node:timers/promises';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
import { createRedisRoom } from '../redis-room.js';
import { createSharedWorld } from '../world.js';
import { createVoiceService, createMemoryVoiceLeases, createRedisVoiceLeases, voiceSpaceName } from '../voice.js';
import { createFakeLiveKit } from './livekit-fixture.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const NAMESPACE = 'river-oaks:test:v1';
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const live = { skip: !process.env.REDIS_URL, timeout: 60_000 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const room = space => voiceSpaceName({ namespace: NAMESPACE, worldId: 'river-oaks', space });

function service({ leases: wrap = store => store } = {}) {
  let time = 1_000_000;
  const livekit = createFakeLiveKit({ now: () => time });
  const leases = wrap(createMemoryVoiceLeases({ now: () => time }));
  const voice = createVoiceService({ leases, livekit, namespace: NAMESPACE, allow: async () => true, now: () => time, log: { warn() {} } });
  const join = (userId, connectionId, space = 'outdoor') => voice.join({ userId, worldId: 'river-oaks', connectionId, space });
  const reconcile = (present, removed = []) => voice.reconcileWorld({ worldId: 'river-oaks', present, removed });
  return { voice, livekit, leases, join, reconcile, advance: ms => { time += ms; } };
}

test('a present player with a matching lease keeps its identity; a replaced connection loses it on the next reconcile', async () => {
  const f = service();
  const joined = await f.join('alice', 'c1');
  assert.deepEqual([...await f.reconcile([{ userId: 'alice', connectionId: 'c1', space: 'outdoor' }, { userId: 'bob', connectionId: 'c1', space: 'outdoor' }])], [['alice', joined.participantIdentity], ['bob', null]]);
  assert.deepEqual([...await f.reconcile([{ userId: 'alice', connectionId: 'c2', space: 'outdoor' }])], [['alice', null]]);
  await flush();
  assert.deepEqual(f.livekit.called('removeParticipant'), [['removeParticipant', room('outdoor'), joined.participantIdentity]]);
  assert.equal((await f.leases.getMany(['alice'])).size, 0);
  assert.deepEqual([...await f.reconcile([{ userId: 'alice', connectionId: 'c2', space: 'outdoor' }])], [['alice', null]], 'the stale tab cannot be revived by its successor');
});

test('walking into an interior revokes the lease after three consecutive mismatches, not on a doorway flicker', async () => {
  const f = service();
  const joined = await f.join('alice', 'c1');
  const outside = [{ userId: 'alice', connectionId: 'c1', space: 'outdoor' }], inside = [{ userId: 'alice', connectionId: 'c1', space: 'osm-node-1' }];
  for (const present of [inside, inside, outside, inside, inside]) assert.equal((await f.reconcile(present)).get('alice'), joined.participantIdentity);
  assert.equal((await f.reconcile(inside)).get('alice'), null);
  await flush();
  assert.deepEqual(f.livekit.called('removeParticipant'), [['removeParticipant', room('outdoor'), joined.participantIdentity]]);
  assert.equal((await f.leases.getMany(['alice'])).size, 0);
  const rejoined = await f.join('alice', 'c1', 'osm-node-1');
  assert.equal((await f.reconcile(inside)).get('alice'), rejoined.participantIdentity, 'a fresh lease starts with a clean mismatch count');
});

test('losing access to a private home or leaving the world revokes at once', async () => {
  const f = service();
  const joined = await f.join('alice', 'c1', 'osm-node-1');
  assert.equal((await f.reconcile([{ userId: 'alice', connectionId: 'c1', space: null }])).get('alice'), null);
  await flush();
  assert.deepEqual(f.livekit.called('removeParticipant'), [['removeParticipant', room('osm-node-1'), joined.participantIdentity]]);
  const again = await f.join('alice', 'c1', 'osm-node-1');
  const bob = await f.join('bob', 'c1');
  assert.deepEqual([...await f.reconcile([], ['alice', 'bob', 'nobody'])], []);
  await flush();
  assert.deepEqual(f.livekit.called('removeParticipant').slice(1), [['removeParticipant', room('osm-node-1'), again.participantIdentity], ['removeParticipant', room('outdoor'), bob.participantIdentity]]);
  assert.equal((await f.leases.getMany(['alice', 'bob'])).size, 0);
});

test('a lease store failure rejects the reconcile so the caller can log and retry, and the next one succeeds', async () => {
  let fail = true;
  const f = service({ leases: store => ({ ...store, getMany: async ids => { if (fail) throw new Error('redis down'); return store.getMany(ids); } }) });
  const joined = await f.join('alice', 'c1');
  await assert.rejects(() => f.reconcile([{ userId: 'alice', connectionId: 'c1', space: 'outdoor' }]));
  fail = false;
  assert.equal((await f.reconcile([{ userId: 'alice', connectionId: 'c1', space: 'outdoor' }])).get('alice'), joined.participantIdentity);
  await assert.rejects(() => f.reconcile([{ userId: 'alice', connectionId: '', space: 'outdoor' }]), 'invalid presence is a programming error, not a quiet revoke');
});

test('the standalone town stamps voice identities on its players and revokes a departed tab', async t => {
  const livekit = createFakeLiveKit(), leases = createMemoryVoiceLeases();
  const voice = createVoiceService({ leases, livekit, namespace: NAMESPACE, allow: async () => true, log: { warn() {} } });
  const auth = { async handle() { return false; }, async authenticate(req) { const id = req.headers.cookie?.match(/session=(\w+)/)?.[1]; return id ? { userId: id, name: id, sessionId: id + '-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000 } : null; } };
  const app = createGameServer({ auth, world: createSharedWorld(data), waitlist: approvedWaitlist, origin: 'http://127.0.0.1', staticRoot: '/nonexistent', voice, voiceReconcileMs: 25, departureGraceMs: 50 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => app.close());
  const post = (path, body = {}) => fetch(origin + path, { method: 'POST', headers: { Origin: 'http://127.0.0.1', Cookie: 'session=alice', 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ticket = (await (await post('/api/multiplayer/ticket')).json()).ticket;
  const ws = new WebSocket(`${origin.replace('http', 'ws')}/multiplayer?${new URLSearchParams({ ticket, protocol: '3' })}`, { headers: { Origin: 'http://127.0.0.1', Cookie: 'session=alice' } });
  const snapshots = [];
  ws.on('message', raw => snapshots.push(JSON.parse(raw)));
  await new Promise((resolve, reject) => { ws.once('message', resolve); ws.once('error', reject); });
  const joined = await (await post('/api/voice/join')).json();
  assert.equal(joined.ok, true);
  const until = Date.now() + 2000;
  while (Date.now() < until && !snapshots.some(s => s.players?.[0]?.voice?.id === joined.participantIdentity)) await delay(50);
  assert.ok(snapshots.some(s => s.players?.[0]?.voice?.id === joined.participantIdentity), 'the identity reaches the snapshot');
  ws.close();
  await delay(300);
  assert.equal((await leases.getMany(['alice'])).size, 0, 'a tab that never came back loses its lease after the departure grace');
  assert.deepEqual(livekit.called('removeParticipant'), [['removeParticipant', room('outdoor'), joined.participantIdentity]]);
});

test('the hosted room tick reconciles leases against its committed presence', live, async t => {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: null });
  redis.on('error', () => {}); await redis.connect();
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  let time = 1_000_000;
  const livekit = createFakeLiveKit({ now: () => time });
  const voice = createVoiceService({ leases: createRedisVoiceLeases({ redis, prefix, now: () => time }), livekit, namespace: NAMESPACE, allow: async () => true, now: () => time, log: { warn() {} } });
  const invalid = new Set();
  const hosted = createRedisRoom({ redis, prefix, worldData: data, now: () => time, authorize: async identity => !invalid.has(identity.userId), voice });
  t.after(async () => { await hosted.close(); const keys = await redis.keys(prefix + ':*'); if (keys.length) await redis.del(...keys); await redis.quit(); });
  const identity = userId => ({ userId, name: userId, sessionId: userId + '-session', expiresAt: time + 120_000 });
  const tick = async () => { await delay(210); return hosted.tick(); };
  const player = async () => (await hosted.read()).snapshot.players.find(p => p.id === 'alice');
  assert.equal((await hosted.request({ type: 'join', identity: identity('alice'), connectionId: 'alice-socket' })).ok, true);
  const joined = await voice.join({ userId: 'alice', worldId: 'river-oaks', connectionId: 'alice-socket', space: 'outdoor' });
  await tick();
  assert.deepEqual((await player()).voice, { space: 'outdoor', id: joined.participantIdentity });
  // Another tab replaces the connection: the old lease goes with it.
  assert.equal((await hosted.request({ type: 'join', identity: identity('alice'), connectionId: 'alice-second' })).ok, true);
  await tick();
  assert.deepEqual((await player()).voice, { space: 'outdoor', id: null });
  assert.deepEqual(livekit.called('removeParticipant'), [['removeParticipant', room('outdoor'), joined.participantIdentity]]);
  // Walking into a store: three stable ticks, then the outdoor lease ends.
  const again = await voice.join({ userId: 'alice', worldId: 'river-oaks', connectionId: 'alice-second', space: 'outdoor' });
  const storeId = data.stores[0].id;
  assert.equal((await hosted.request({ type: 'command', userId: 'alice', connectionId: 'alice-second', message: { type: 'travel', storeId, mode: 'enter' } })).ok, true);
  await tick();
  assert.deepEqual((await player()).voice, { space: storeId, id: again.participantIdentity }, 'the first mismatching tick keeps the lease');
  await tick();
  await tick();
  assert.deepEqual((await player()).voice, { space: storeId, id: null });
  assert.equal(livekit.called('removeParticipant').length, 2);
  // A kick in the same tick revokes before the snapshot is committed.
  const inside = await voice.join({ userId: 'alice', worldId: 'river-oaks', connectionId: 'alice-second', space: storeId });
  await tick();
  assert.equal((await player()).voice.id, inside.participantIdentity);
  invalid.add('alice');
  await tick();
  assert.equal(await player(), undefined);
  assert.deepEqual(livekit.called('removeParticipant').at(-1), ['removeParticipant', room(storeId), inside.participantIdentity]);
});
