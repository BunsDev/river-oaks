import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceService, createMemoryVoiceLeases, voiceSpaceName, voiceRoomPrefix, VOICE_LEASE_TTL_MS, VOICE_RENEW_MS, VOICE_TOKEN_TTL_S } from '../voice.js';
import { createFakeLiveKit } from './livekit-fixture.js';

const NAMESPACE = 'river-oaks:test:v1';
function fixture({ allowed = () => true, dailyLimit, maxPerSpace, leases: wrap = store => store } = {}) {
  let time = 1_000_000;
  const clock = () => time;
  const livekit = createFakeLiveKit({ now: clock });
  const leases = wrap(createMemoryVoiceLeases({ now: clock }));
  const allowCalls = [], logs = [];
  const voice = createVoiceService({ leases, livekit, namespace: NAMESPACE, now: clock, dailyLimit, maxPerSpace,
    allow: async (...args) => { allowCalls.push(args); return allowed(...args); },
    log: { warn: line => logs.push(line), info: line => logs.push(line), error: line => logs.push(line) } });
  const join = (userId = 'alice', connectionId = 'c1', space = 'outdoor') => voice.join({ userId, worldId: 'river-oaks', connectionId, space });
  return { voice, livekit, leases, allowCalls, logs, join, advance: ms => { time += ms; }, now: clock };
}

test('join mints a token for the derived room with a random identity and reports renew timing', async () => {
  const f = fixture();
  const result = await f.join('alice', 'c1', 'osm-node-8172494989');
  assert.equal(result.ok, true);
  const room = voiceSpaceName({ namespace: NAMESPACE, worldId: 'river-oaks', space: 'osm-node-8172494989' });
  assert.equal(room, 'river-oaks.test.v1.river-oaks.osm-node-8172494989');
  assert.equal(result.url, f.livekit.url);
  assert.equal(result.token, `fake.${room}.${result.participantIdentity}.${VOICE_TOKEN_TTL_S}`);
  assert.equal(result.space, 'osm-node-8172494989');
  assert.notEqual(result.participantIdentity, 'alice');
  assert.match(result.participantIdentity, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(result.expiresAt, f.now() + VOICE_LEASE_TTL_MS);
  assert.equal(result.renewMs, VOICE_RENEW_MS);
  assert.deepEqual(f.allowCalls, [['voice_daily', 'global', 5000, 86_400_000]]);
  const again = await f.join('alice', 'c1', 'osm-node-8172494989');
  assert.notEqual(again.participantIdentity, result.participantIdentity, 'every join gets a fresh identity');
  assert.deepEqual(f.livekit.called('removeParticipant'), [['removeParticipant', room, result.participantIdentity]], 'the replaced participant is removed');
});

test('room names isolate namespace, world and interior, and unsafe store ids are hashed', () => {
  assert.equal(voiceSpaceName({ namespace: 'a:b', worldId: 'w', space: 'outdoor' }), 'a.b.w.outdoor');
  assert.notEqual(voiceSpaceName({ namespace: 'a:b', worldId: 'w', space: 'outdoor' }), voiceSpaceName({ namespace: 'a:b', worldId: 'w2', space: 'outdoor' }));
  assert.notEqual(voiceSpaceName({ namespace: 'a:b', worldId: 'w', space: 'outdoor' }), voiceSpaceName({ namespace: 'a:c', worldId: 'w', space: 'outdoor' }));
  const hashed = voiceSpaceName({ namespace: 'a:b', worldId: 'w', space: 'store with spaces/and/slashes' });
  assert.match(hashed, /^a\.b\.w\.[a-f0-9]{16}$/);
  assert.equal(voiceRoomPrefix('a:b'), 'a.b.');
  assert.throws(() => voiceSpaceName({ namespace: 'a:b', worldId: '../x', space: 'outdoor' }));
  assert.throws(() => voiceSpaceName({ namespace: 'bad namespace', worldId: 'w', space: 'outdoor' }));
  assert.throws(() => voiceSpaceName({ namespace: 'a:b', worldId: 'w', space: '' }));
});

test('no space means no token', async () => {
  const f = fixture();
  assert.deepEqual(await f.join('alice', 'c1', null), { ok: false, reason: 'no_space' });
  assert.equal(f.livekit.called('token').length, 0);
  assert.equal(f.allowCalls.length, 0, 'the budget is not spent on a refused join');
});

test('renew refreshes the lease and token; a replaced tab, another participant or a departed lease cannot renew', async () => {
  const f = fixture();
  const joined = await f.join();
  f.advance(VOICE_RENEW_MS);
  const renewed = await f.voice.renew({ userId: 'alice', worldId: 'river-oaks', connectionId: 'c1', space: 'outdoor', participantIdentity: joined.participantIdentity });
  assert.equal(renewed.ok, true);
  assert.equal(renewed.expiresAt, f.now() + VOICE_LEASE_TTL_MS);
  assert.equal(renewed.space, 'outdoor');
  assert.equal(renewed.renewMs, VOICE_RENEW_MS);
  assert.equal(renewed.token, `fake.${voiceSpaceName({ namespace: NAMESPACE, worldId: 'river-oaks', space: 'outdoor' })}.${joined.participantIdentity}.${VOICE_TOKEN_TTL_S}`);
  assert.deepEqual(await f.voice.renew({ userId: 'alice', worldId: 'river-oaks', connectionId: 'c2', space: 'outdoor', participantIdentity: joined.participantIdentity }), { ok: false, reason: 'stale_connection' });
  assert.deepEqual(await f.voice.renew({ userId: 'alice', worldId: 'river-oaks', connectionId: 'c1', space: 'outdoor', participantIdentity: 'someone-else' }), { ok: false, reason: 'stale_connection' });
  assert.deepEqual(await f.voice.leave({ userId: 'alice', connectionId: 'c1', participantIdentity: 'someone-else' }), { ok: true, left: false });
  assert.deepEqual(await f.voice.leave({ userId: 'alice', connectionId: 'c1', participantIdentity: joined.participantIdentity }), { ok: true, left: true });
  assert.deepEqual(await f.voice.renew({ userId: 'alice', worldId: 'river-oaks', connectionId: 'c1', space: 'outdoor', participantIdentity: joined.participantIdentity }), { ok: false, reason: 'no_lease' });
  assert.equal(f.allowCalls.length, 1, 'renewals do not spend the join budget');
});

test('a lease moves only from the connection it names, for its own account', async () => {
  const f = fixture();
  const joined = await f.voice.join({ userId: 'alice', worldId: 'river-oaks', connectionId: 'c1', space: 'outdoor' });
  assert.equal(joined.ok, true);
  assert.equal(await f.voice.continueConnection({ userId: 'alice', from: 'c9', to: 'c2' }), false, 'a connection the lease never had');
  assert.equal(await f.voice.continueConnection({ userId: 'bob', from: 'c1', to: 'c2' }), false, 'another account');
  assert.equal(await f.voice.continueConnection({ userId: 'alice', from: 'c1', to: 'c1' }), false, 'no move');
  assert.equal(await f.voice.continueConnection({ userId: 'alice', from: 'c1', to: 'c2' }), true);
  assert.equal(await f.voice.continueConnection({ userId: 'alice', from: 'c1', to: 'c3' }), false, 'once moved, the old connection holds nothing');
  const renewed = await f.voice.renew({ userId: 'alice', worldId: 'river-oaks', connectionId: 'c2', space: 'outdoor', participantIdentity: joined.participantIdentity });
  assert.equal(renewed.ok, true);
});

test('a space change on renew revokes the old lease, removes the participant and reports the new space', async () => {
  const f = fixture();
  const joined = await f.join('alice', 'c1', 'outdoor');
  const outdoor = voiceSpaceName({ namespace: NAMESPACE, worldId: 'river-oaks', space: 'outdoor' });
  const changed = await f.voice.renew({ userId: 'alice', worldId: 'river-oaks', connectionId: 'c1', space: 'osm-node-1', participantIdentity: joined.participantIdentity });
  assert.deepEqual(changed, { ok: false, reason: 'space_changed', space: 'osm-node-1' });
  assert.deepEqual(f.livekit.called('removeParticipant'), [['removeParticipant', outdoor, joined.participantIdentity]]);
  assert.equal((await f.leases.getMany(['alice'])).size, 0, 'no token for the old room survives the move');
  const inside = await f.join('alice', 'c1', 'osm-node-1');
  assert.equal(inside.ok, true);
  assert.notEqual(inside.participantIdentity, joined.participantIdentity);
  const gone = await f.voice.renew({ userId: 'alice', worldId: 'river-oaks', connectionId: 'c1', space: null, participantIdentity: inside.participantIdentity });
  assert.deepEqual(gone, { ok: false, reason: 'space_changed', space: null }, 'losing access to a private home ends voice there');
});

test('a LiveKit failure trips the breaker: no tokens for a minute and status reports unavailable', async () => {
  const f = fixture();
  f.livekit.fail(true);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(await f.join(), { ok: false, reason: 'voice_unavailable' });
    assert.equal((await f.leases.getMany(['alice'])).size, 0, 'a lease without a token is revoked');
  }
  assert.equal(f.livekit.called('token').length, 3);
  assert.equal(f.voice.status().available, false);
  f.livekit.fail(false);
  assert.deepEqual(await f.join(), { ok: false, reason: 'voice_unavailable' }, 'paused: no provider call is attempted');
  assert.equal(f.livekit.called('token').length, 3);
  f.advance(60_001);
  assert.equal((await f.join()).ok, true);
  assert.deepEqual(f.voice.status(), { enabled: true, available: true, renewMs: VOICE_RENEW_MS });
});

test('a lease store failure answers voice_unavailable and mints no token', async () => {
  const f = fixture({ leases: store => ({ ...store, issue: async () => { throw new Error('redis down: rediss://user:secret@host'); } }) });
  assert.deepEqual(await f.join(), { ok: false, reason: 'voice_unavailable' });
  assert.equal(f.livekit.called('token').length, 0);
  assert.equal(f.logs.some(line => /secret/.test(line)), false, 'storage errors are never logged verbatim');
});

test('the global daily join budget stops joins until it resets', async () => {
  const f = fixture({ allowed: scope => scope !== 'voice_daily', dailyLimit: 12 });
  assert.deepEqual(await f.join(), { ok: false, reason: 'budget_exhausted' });
  assert.deepEqual(f.allowCalls, [['voice_daily', 'global', 12, 86_400_000]]);
  assert.equal(f.livekit.called('token').length, 0);
});

test('a space holds at most maxPerSpace participants', async () => {
  const f = fixture({ maxPerSpace: 2 });
  assert.equal((await f.join('alice', 'c1', 'osm-node-1')).ok, true);
  assert.equal((await f.join('bob', 'c1', 'osm-node-1')).ok, true);
  assert.deepEqual(await f.join('carol', 'c1', 'osm-node-1'), { ok: false, reason: 'space_full' });
  assert.equal((await f.join('carol', 'c1', 'outdoor')).ok, true);
  assert.equal((await f.join('alice', 'c2', 'osm-node-1')).ok, true, 'a member re-joining its own space keeps its place');
});

test('revokeUser and a leave without a connection remove the lease and the participant', async () => {
  const f = fixture();
  const joined = await f.join();
  const outdoor = voiceSpaceName({ namespace: NAMESPACE, worldId: 'river-oaks', space: 'outdoor' });
  assert.equal(await f.voice.revokeUser('alice'), true);
  assert.deepEqual(f.livekit.called('removeParticipant'), [['removeParticipant', outdoor, joined.participantIdentity]]);
  assert.equal((await f.leases.getMany(['alice'])).size, 0);
  assert.equal(await f.voice.revokeUser('alice'), false);
  const second = await f.join('alice', 'c2');
  assert.deepEqual(await f.voice.leave({ userId: 'alice', connectionId: null, participantIdentity: second.participantIdentity }), { ok: true, left: true }, 'a closing tab with no live connection still ends its lease');
  assert.equal((await f.leases.getMany(['alice'])).size, 0);
  assert.equal(await f.voice.revokeUser('bob'), false);
  await f.join('bob', 'c1');
  f.livekit.fail(true);
  assert.equal(await f.voice.revokeUser('bob'), true, 'a failed provider removal still drops the lease');
  assert.equal((await f.leases.getMany(['bob'])).size, 0);
});

test('tokens never appear in logs', async () => {
  const f = fixture();
  const joined = await f.join();
  f.livekit.fail(true);
  await f.voice.renew({ userId: 'alice', worldId: 'river-oaks', connectionId: 'c1', space: 'outdoor', participantIdentity: joined.participantIdentity });
  await f.voice.revokeUser('alice');
  assert.equal(f.logs.some(line => /fake\./.test(line)), false, f.logs.join('\n'));
  for (const line of f.logs) assert.doesNotMatch(line, /alice/, 'account ids stay out of provider failure logs');
});
