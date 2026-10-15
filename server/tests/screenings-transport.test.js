import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { SCREENING_MEDIA } from '../../preview/src/screening-contract.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const ipic = createWalkingEnvironment(data).rooms.find(room => room.interior === 'ipic-photo-v1');
const FILM = SCREENING_MEDIA['ipic-fixture-v1'];
const VIEW_KEYS = ['anchorServerTimeMs', 'durationMs', 'epoch', 'hostId', 'mediaId', 'positionMs', 'revision', 'screeningId', 'status', 'venueId'];
const venueOf = snapshot => snapshot.screenings.find(item => item.venueId === 'ipic');

for (const mode of ['memory', 'redis']) test(`${mode}: a granted host controls the screening and viewers only read it, through real ticket/WebSocket gates`, { skip: mode === 'redis' && !process.env.REDIS_URL }, async t => {
  const origin = 'http://127.0.0.1', ids = { host: 'cinema-host', viewer: 'viewer', late: 'late-viewer' };
  const screeningHosts = [{ venueId: 'ipic', userId: ids.host }];
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true, authenticate: async req => {
    const id = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];
    return ids[id] ? { userId: ids[id], name: id, sessionId: `${id}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 60000 } : null;
  } };
  let redis, security; const namespace = `river-oaks:screening-test:${randomUUID()}`;
  if (mode === 'redis') { redis = new Redis(process.env.REDIS_URL); security = createRedisSecurity({ redis, prefix: `{${namespace}}` }); }
  const app = mode === 'redis'
    ? createWorldGateway({ redis, namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin, screeningHosts })
    : createGameServer({ world: createSharedWorld(data, { screeningHosts }), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`, sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    await app.close(); security?.close();
    if (redis) { const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys); await redis.quit(); }
  });
  const join = async id => {
    const response = await fetch(base + '/api/multiplayer/ticket', { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'test-csrf' } });
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: `fixture=${id}` } });
    sockets.push(ws);
    const pending = new Map(), frames = []; let last = null, seq = 0;
    await new Promise((resolve, reject) => {
      ws.once('error', reject);
      ws.on('message', raw => {
        const value = JSON.parse(raw);
        if (value.type === 'snapshot') { last = value; frames.push(value); resolve(); }
        if (value.type === 'result' && pending.has(value.requestId)) { pending.get(value.requestId)(value); pending.delete(value.requestId); }
      });
    });
    const client = {
      ws, frames, get snapshot() { return last; },
      send: message => new Promise((resolve, reject) => {
        const requestId = String(++seq), timeout = setTimeout(() => { pending.delete(requestId); reject(new Error('Screening command timed out')); }, 7000);
        pending.set(requestId, value => { clearTimeout(timeout); resolve(value); });
        ws.send(JSON.stringify({ ...message, requestId }));
      }),
      // Wait for a snapshot frame that satisfies the check (the town broadcasts every 200 ms).
      until: check => new Promise((resolve, reject) => {
        if (last && check(last)) return resolve(last);
        const timeout = setTimeout(() => reject(new Error('No matching snapshot')), 5000);
        ws.on('message', function seen(raw) { const value = JSON.parse(raw); if (value.type === 'snapshot' && check(value)) { clearTimeout(timeout); ws.off('message', seen); resolve(value); } });
      }),
    };
    assert.equal((await client.send({ type: 'travel', storeId: ipic.storeId, mode: 'enter' })).ok, true, `${id} enters IPIC`);
    return client;
  };
  const sync = client => client.send({ type: 'screening', action: 'sync', venueId: 'ipic' });
  const control = (client, action, current, operationId, more = {}) =>
    client.send({ type: 'screening', action, venueId: 'ipic', epoch: current.epoch, expectedRevision: current.revision, operationId, ...more });

  const host = await join('host'), viewer = await join('viewer');
  const hostView = await sync(host), viewerView = await sync(viewer);
  assert.deepEqual([hostView.canHost, viewerView.canHost], [true, false]);
  assert.ok(Number.isFinite(hostView.serverTimeMs));
  const before = viewerView.screening;
  assert.equal((await control(viewer, 'start', before, 'viewer-start-1', { mediaId: FILM.id })).error, 'screening_host_required');
  // A forged timeline field from a viewer is refused before any authority check.
  assert.equal((await control(viewer, 'play', before, 'viewer-play-01', { positionMs: 0 })).error, 'invalid_screening');
  assert.deepEqual((await sync(viewer)).screening, before, 'refused commands leave the shared timeline unchanged');

  const started = await control(host, 'start', before, 'host-start-001', { mediaId: FILM.id });
  assert.equal(started.ok, true, started.error);
  const retried = await control(host, 'start', before, 'host-start-001', { mediaId: FILM.id });
  assert.equal(retried.replayed, true, 'a resent request applies once');
  assert.equal(retried.screening.revision, started.screening.revision);

  const playingFrame = await viewer.until(frame => venueOf(frame)?.status === 'playing');
  assert.deepEqual(Object.keys(venueOf(playingFrame)).sort(), VIEW_KEYS);
  assert.ok(Number.isFinite(playingFrame.serverTimeMs));
  const late = await join('late');
  const joined = (await sync(late));
  assert.equal(joined.screening.screeningId, started.screening.screeningId, 'a late viewer reads the running film, not a restart');
  assert.equal(joined.screening.anchorServerTimeMs, started.screening.anchorServerTimeMs);
  const position = joined.screening.positionMs + joined.serverTimeMs - joined.screening.anchorServerTimeMs;
  assert.ok(position >= 0 && position < FILM.durationMs);

  const paused = await control(host, 'pause', started.screening, 'host-pause-001');
  assert.equal(paused.ok, true, paused.error);
  const pausedFrame = await late.until(frame => venueOf(frame)?.status === 'paused');
  assert.equal(venueOf(pausedFrame).positionMs, paused.screening.positionMs);
  assert.equal((await control(viewer, 'play', paused.screening, 'viewer-play-02')).error, 'screening_host_required');
  assert.equal((await control(host, 'play', started.screening, 'host-play-0001')).error, 'screening_stale', 'an old revision cannot rewind the pause');
});

const redisTest = (name, fn) => test(name, { skip: !process.env.REDIS_URL }, fn);
redisTest('two coordinators keep one screening history, dedupe a retry through either edge, and hand it over', async t => {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: null });
  redis.on('error', () => {}); await redis.connect();
  const prefix = `{river-oaks:screening-race:${randomUUID()}}`, rooms = [];
  let time = 5_000_000;
  const screeningHosts = [{ venueId: 'ipic', userId: 'host-a' }, { venueId: 'ipic', userId: 'host-b' }];
  const create = () => { const room = createRedisRoom({ redis, prefix, worldData: data, authorize: async () => true, now: () => time, screeningHosts }); rooms.push(room); return room; };
  t.after(async () => { await Promise.all(rooms.map(room => room.close())); const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  const identity = userId => ({ userId, name: userId, sessionId: `${userId}-session`, expiresAt: time + 600_000 });
  const command = (room, userId, message) => room.request({ type: 'command', userId, connectionId: `${userId}-socket`, message });
  const first = create(), second = create();
  for (const [room, id] of [[first, 'host-a'], [second, 'host-b']]) {
    assert.equal((await room.request({ type: 'join', identity: identity(id), connectionId: `${id}-socket` })).ok, true);
    assert.equal((await command(room, id, { type: 'travel', storeId: ipic.storeId, mode: 'enter' })).ok, true);
  }
  const current = venueOf((await first.read()).snapshot);
  const start = (id, operationId) => ({ type: 'screening', action: 'start', venueId: 'ipic', epoch: current.epoch, expectedRevision: current.revision, operationId, mediaId: FILM.id });
  const results = await Promise.all([command(first, 'host-a', start('host-a', 'race-a-000001')), command(second, 'host-b', start('host-b', 'race-b-000001'))]);
  assert.equal(results.filter(result => result.ok).length, 1, JSON.stringify(results));
  assert.ok(['screening_stale', 'screening_in_progress'].includes(results.find(result => !result.ok).error));
  const winner = results[0].ok ? 'host-a' : 'host-b', room = winner === 'host-a' ? second : first, op = winner === 'host-a' ? 'race-a-000001' : 'race-b-000001';
  const settled = venueOf((await first.read()).snapshot);
  assert.deepEqual(venueOf((await second.read()).snapshot), settled, 'both edges publish one timeline');
  assert.equal(settled.hostId, winner);
  const retry = await command(room, winner, start(winner, op));
  assert.equal(retry.replayed, true, 'a retry through the other edge applies once');
  assert.equal(venueOf((await first.read()).snapshot).revision, settled.revision);
  await first.close(); await second.close();
  time += 2000;
  const replacement = create();
  for (const id of ['host-a', 'host-b']) assert.equal((await replacement.request({ type: 'join', identity: identity(id), connectionId: `${id}-new` })).ok, true);
  const handed = venueOf((await replacement.read()).snapshot);
  assert.deepEqual([handed.status, handed.screeningId, handed.anchorServerTimeMs], ['playing', settled.screeningId, settled.anchorServerTimeMs], 'a replacement coordinator keeps the running film');
});
