import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDistributedServer } from '../distributed-app.js';
import { createVoiceService, createMemoryVoiceLeases, voiceSpaceName, VOICE_LEASE_TTL_MS } from '../voice.js';
import { normalizeVercelRoute } from '../vercel-routing.js';
import { createFakeLiveKit } from './livekit-fixture.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const NAMESPACE = 'river-oaks:test:v1';
const room = space => voiceSpaceName({ namespace: NAMESPACE, worldId: 'river-oaks', space });

function fixture({ monotonicStep = 0 } = {}) {
  let time = 1_000_000, monotonic = 0;
  const livekit = createFakeLiveKit({ now: () => time });
  const leases = createMemoryVoiceLeases({ now: () => time });
  const voice = createVoiceService({ leases, livekit, namespace: NAMESPACE, allow: async () => true, now: () => time, monotonic: () => { monotonic += monotonicStep; return monotonic; }, log: { warn() {} } });
  const join = (userId, connectionId = 'c1', space = 'outdoor') => voice.join({ userId, worldId: 'river-oaks', connectionId, space });
  return { voice, livekit, leases, join, advance: ms => { time += ms; } };
}

test('the sweep removes participants without a lease, deletes empty rooms and ignores other namespaces', async () => {
  const f = fixture();
  const alice = await f.join('alice', 'c1', 'outdoor'), bob = await f.join('bob', 'c1', 'osm-node-1');
  f.livekit.simulateJoin(room('outdoor'), alice.participantIdentity);
  f.livekit.simulateJoin(room('outdoor'), 'stranger-1');
  f.livekit.simulateJoin(room('osm-node-1'), bob.participantIdentity);
  f.livekit.simulateJoin(room('osm-node-2'), 'left-over');
  f.livekit.simulateJoin('other.namespace.river-oaks.outdoor', 'theirs');
  const result = await f.voice.sweep({ budgetMs: 1000 });
  assert.deepEqual(result, { ok: true, rooms: 2, removed: 1, deletedRooms: 1, failures: 0, complete: true });
  assert.deepEqual([...f.livekit.rooms.get(room('outdoor')).keys()], [alice.participantIdentity]);
  assert.deepEqual([...f.livekit.rooms.get(room('osm-node-1')).keys()], [bob.participantIdentity]);
  assert.equal(f.livekit.rooms.has(room('osm-node-2')), false, 'a room of this namespace with no lease is deleted');
  assert.equal(f.livekit.rooms.has('other.namespace.river-oaks.outdoor'), true);
  await f.voice.leave({ userId: 'bob', connectionId: 'c1', participantIdentity: bob.participantIdentity });
  const after = await f.voice.sweep({ budgetMs: 1000 });
  assert.equal(after.deletedRooms, 1, 'an emptied room is deleted on the next sweep');
  assert.equal(f.livekit.rooms.has(room('osm-node-1')), false);
});

test('the sweep stops at its budget and the next run finishes the rest', async () => {
  const f = fixture({ monotonicStep: 400 });
  for (const [user, space] of [['a', 'outdoor'], ['b', 'osm-node-1'], ['c', 'osm-node-2']]) {
    f.livekit.simulateJoin(room(space), 'orphan-' + user);
    await f.join(user, 'c1', space);
  }
  const first = await f.voice.sweep({ budgetMs: 1000 });
  assert.equal(first.complete, false);
  assert.ok(first.rooms < 3 && first.removed === first.rooms, `stopped early: ${JSON.stringify(first)}`);
  const second = await f.voice.sweep({ budgetMs: 100_000 });
  assert.equal(second.complete, true);
  assert.equal(first.removed + second.removed, 3);
});

test('an orphaned participant is gone within one cron period plus the budget after its lease expires', async () => {
  const f = fixture();
  const alice = await f.join('alice');
  f.livekit.simulateJoin(room('outdoor'), alice.participantIdentity);
  f.advance(VOICE_LEASE_TTL_MS + 1);
  assert.equal((await f.leases.getMany(['alice'])).size, 0);
  assert.equal(f.livekit.rooms.get(room('outdoor')).has(alice.participantIdentity), true, 'expiry alone does not stop audio');
  f.advance(60_000);
  const result = await f.voice.sweep({ budgetMs: 20_000 });
  assert.equal(result.removed + result.deletedRooms, 1);
  assert.equal(f.livekit.rooms.has(room('outdoor')), false);
});

test('a failing provider ends the sweep early and trips the pause', async () => {
  const f = fixture();
  await f.join('alice');
  f.livekit.fail(true);
  const result = await f.voice.sweep({ budgetMs: 1000 });
  assert.equal(result.complete, false);
  assert.ok(result.failures >= 1);
  assert.equal(f.voice.status().available, true, 'one failure does not pause');
  await f.voice.sweep({ budgetMs: 1000 });
  await f.voice.sweep({ budgetMs: 1000 });
  f.livekit.fail(false);
  assert.equal(f.voice.status().available, false, 'three in a row do');
  assert.equal((await f.voice.sweep({ budgetMs: 1000 })).failures, 1, 'a paused sweep does not call the provider');
  assert.equal(f.livekit.called('listParticipants').length, 3);
});

test('a timer sweep runs on long-lived hosts and stops on close', async () => {
  const f = fixture();
  await f.join('alice');
  f.livekit.simulateJoin(room('outdoor'), 'orphan');
  f.voice.sweepEvery(20);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(f.livekit.rooms.get(room('outdoor')).has('orphan'), false);
  const calls = f.livekit.called('listParticipants').length;
  f.voice.close();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(f.livekit.called('listParticipants').length, calls, 'no sweeps after close');
});

test('Vercel declares the per-minute voice sweep, rewritten to the server and allowlisted', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url)));
  assert.ok(config.crons.some(cron => cron.path === '/api/voice-sweep' && cron.schedule === '* * * * *'));
  assert.equal(config.rewrites.find(item => item.source === '/api/voice-sweep')?.destination, '/api/server?_river_path=/api/voice-sweep');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/api/voice-sweep'), '/api/voice-sweep');
});

test('the Vercel entry answers the voice sweep with 404 while voice is off, without starting the backend', async t => {
  const saved = { ...process.env };
  for (const name of ['RIVER_OAKS_VOICE', 'REDIS_URL', 'PUBLIC_ORIGIN']) delete process.env[name];
  t.after(() => { process.env = saved; });
  const { default: server } = await import(`../../api/server.js?probe=${randomUUID()}`);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/server?_river_path=/api/voice-sweep`);
  assert.equal(response.status, 404);
});

test('the sweep route needs the cron bearer secret and exists only when voice and a secret are configured', async t => {
  const f = fixture();
  f.livekit.simulateJoin(room('outdoor'), 'orphan');
  await f.join('alice');
  const stubRoom = { worldId: 'river-oaks', read: async () => null, request: async () => ({ ok: true }), tick: async () => null, close: async () => {} };
  const auth = { authenticate: async () => null, handle: async () => false, close() {} };
  const security = { allow: async () => true, isBanned: async () => false };
  const start = async options => {
    const app = createDistributedServer({ auth, security, room: stubRoom, waitlist: approvedWaitlist, origin: 'https://sim.jev.works', ...options });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    return (headers = {}) => fetch(`http://127.0.0.1:${app.server.address().port}/api/voice-sweep`, { headers });
  };
  const guarded = await start({ voice: f.voice, voiceCronSecret: 'cron-secret' });
  assert.equal((await guarded()).status, 401);
  assert.equal((await guarded({ Authorization: 'Bearer wrong' })).status, 401);
  const swept = await guarded({ Authorization: 'Bearer cron-secret' });
  assert.equal(swept.status, 200);
  assert.equal((await swept.json()).removed, 1);
  assert.equal((await (await start({ voice: f.voice }))({ Authorization: 'Bearer cron-secret' })).status, 404, 'no secret, no route');
  assert.equal((await (await start({ voiceCronSecret: 'cron-secret' }))({ Authorization: 'Bearer cron-secret' })).status, 404, 'no voice, no route');
});
