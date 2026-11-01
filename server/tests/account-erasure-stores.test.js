import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import { createMemorySocial, createRedisSocial } from '../social.js';
import { createMemoryGroups, createRedisGroups } from '../groups.js';
import { createMemoryEvents, createRedisEvents } from '../events.js';
import { createMemoryProfiles, createRedisProfiles } from '../profiles.js';
import { createMemoryPresence, createRedisPresence } from '../presence.js';
import { createMemoryDesignLibrary, createRedisDesignLibrary } from '../design-library.js';
import { createMemoryOfficeDesk, createRedisOfficeDesk } from '../office-desk.js';
import { createMemoryAvatarPreferences, createRedisAvatarPreferences } from '../avatar-preferences.js';
import { createMemoryCyclingMiles, createRedisCyclingMiles } from '../cycling-miles.js';
import { createMemoryLandmarks, createRedisLandmarks } from '../landmarks.js';
import { createMemoryDebugReports, createRedisDebugReports } from '../debug-reports.js';
import { createMemoryGitHubNameStore, createRedisGitHubNameStore } from '../github-names.js';
import { createFileWaitlist, createRedisWaitlist, ERASED_ACCOUNT } from '../waitlist.js';
import { createAccountErasure } from '../account-erasure.js';

// Each store's eraseUser runs against both twins: Erin goes, Pat stays, a repeat is a no-op.
const erin = { userId: 'user_erin', name: 'Erin' }, pat = { userId: 'user_pat', name: 'Pat' };
const redisUrl = process.env.REDIS_URL;
async function redisFor(t) {
  const redis = new Redis(redisUrl), prefix = `{erasure-stores:${randomUUID()}}`;redis.on('error', () => {});
  t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  return { redis, prefix };
}
function twins(name, memory, redis, check) {
  test(`${name} erases one account (memory)`, async () => check(memory()));
  test(`${name} erases one account (Redis)`, { skip: !redisUrl }, async t => { const r = await redisFor(t); await check(redis(r), r); });
}
const report = description => ({ schema: 'river-oaks.debug-report', version: 1, id: 'client-id', createdAt: '2026-10-24T15:00:00.000Z', description,
  app: { version: '0.1.6', commit: 'abc123', path: '/play' }, environment: { browser: 'Chrome 126' }, errors: [], console: [], network: [], breadcrumbs: [] });

twins('social', () => createMemorySocial(), r => createRedisSocial(r), async social => {
  const third = { userId: 'user_third', name: 'Third' };
  await social.request(erin, pat);await social.accept(pat.userId, erin.userId);await social.send(erin, pat.userId, 'hello');
  await social.request(third, erin);await social.request(pat, third);
  await social.eraseUser(erin.userId);
  assert.deepEqual(await social.list(erin.userId), []);
  assert.deepEqual((await social.list(pat.userId)).map(item => item.peer.id), [third.userId]);
  assert.deepEqual((await social.list(third.userId)).map(item => item.peer.id), [pat.userId]);
  assert.equal(await social.messages(pat.userId, erin.userId), null);
  await social.eraseUser(erin.userId);
  // The pair can be made again later without an orphaned record in the way.
  assert.equal((await social.request(pat, erin)).ok, true);
});

twins('groups', () => createMemoryGroups(), r => createRedisGroups(r), async groups => {
  const owned = (await groups.create(erin, { name: 'Erin circle' })).group;
  const theirs = (await groups.create(pat, { name: 'Pat circle' })).group, left = (await groups.create(pat, { name: 'Pat other' })).group;
  await groups.invite(erin, owned.id, pat);
  await groups.invite(pat, theirs.id, erin);await groups.accept(erin.userId, theirs.id);await groups.send(erin, theirs.id, 'erin words');
  await groups.send(pat, theirs.id, 'pat words');
  // A group Erin has already left still holds her messages.
  await groups.invite(pat, left.id, erin);await groups.accept(erin.userId, left.id);await groups.send(erin, left.id, 'erin earlier');await groups.leave(erin.userId, left.id);
  await groups.eraseUser(erin.userId);
  assert.deepEqual(await groups.list(erin.userId), []);
  assert.deepEqual((await groups.list(pat.userId)).map(item => item.name).sort(), ['Pat circle', 'Pat other']);
  const read = await groups.read(pat.userId, theirs.id);
  assert.deepEqual(read.members.map(item => item.id), [pat.userId]);
  assert.deepEqual(read.messages.map(item => item.text), ['pat words']);
  assert.deepEqual((await groups.read(pat.userId, left.id)).messages, []);
  await groups.eraseUser(erin.userId);
});

twins('events', () => createMemoryEvents(), r => createRedisEvents(r), async events => {
  const venue = { worldId: 'river-oaks', worldTitle: 'River Oaks', placeId: 'arrival', placeName: 'Arrival' }, start = Date.now() + 3_600_000;
  const draft = title => ({ title, description: '', placeId: 'arrival', startsAt: start, endsAt: start + 3_600_000, capacity: 8 });
  await events.create(erin, draft('Erin social'), venue);
  const theirs = (await events.create(pat, draft('Pat social'), venue)).event;await events.rsvp(erin.userId, theirs.id, true);
  await events.eraseUser(erin.userId);
  const listed = await events.list(pat.userId);
  assert.deepEqual(listed.map(item => [item.title, item.attending]), [['Pat social', 1]]);
  await events.eraseUser(erin.userId);
});

// Stores with one record per account.
const simple = [
  ['profiles', () => createMemoryProfiles(), r => createRedisProfiles(r), async store => {
    for (const person of [erin, pat]) { await store.save(person.userId, { tagline: person.name, bio: '', pronouns: '', interests: [], expectedVersion: 0 }); await store.claimStoreIntro(person.userId, 'river-oaks', 'shop:cafe'); }
  }, async store => {
    assert.equal((await store.get(erin.userId)).version, 0);assert.equal((await store.claimStoreIntro(erin.userId, 'river-oaks', 'shop:cafe')).firstVisit, true);
    assert.equal((await store.get(pat.userId)).tagline, 'Pat');assert.equal((await store.claimStoreIntro(pat.userId, 'river-oaks', 'shop:cafe')).firstVisit, false);
  }],
  ['presence', () => createMemoryPresence(), r => createRedisPresence(r), async store => {
    for (const person of [erin, pat]) await store.join(person.userId, { id: 'river-oaks', title: 'River Oaks' }, `t-${person.userId}`);
  }, async store => assert.deepEqual([...(await store.getMany([erin.userId, pat.userId])).keys()], [pat.userId])],
  ['design library', () => createMemoryDesignLibrary(), r => createRedisDesignLibrary(r), async store => {
    for (const person of [erin, pat]) await store.save(person.userId, { kind: 'seat', finish: 'rose' });
  }, async store => { assert.deepEqual(await store.list(erin.userId), []);assert.equal((await store.list(pat.userId)).length, 1); }],
  ['office desk', () => createMemoryOfficeDesk(), r => createRedisOfficeDesk(r), async store => {
    for (const person of [erin, pat]) await store.save(person.userId, { expectedVersion: 0, task: { id: 'first-task', title: person.name, notes: '', links: [], result: '', status: 'open' } });
  }, async store => { assert.equal((await store.read(erin.userId)).version, 0);assert.equal((await store.read(pat.userId)).tasks.length, 1); }],
  ['avatar preferences', () => createMemoryAvatarPreferences(), r => createRedisAvatarPreferences(r), async store => {
    for (const person of [erin, pat]) await store.initialize(person.userId);
  }, async store => { assert.equal(await store.get(erin.userId), null);assert.notEqual(await store.get(pat.userId), null); }],
  ['cycling miles', () => createMemoryCyclingMiles(), r => createRedisCyclingMiles(r), async store => {
    await store.add(erin.userId, 900, erin.name);await store.add(pat.userId, 300, pat.name);
  }, async store => { assert.equal(await store.rank(erin.userId), null);assert.deepEqual(await store.top(5), [{ userId: pat.userId, name: 'Pat', total: 300 }]); }],
  ['landmarks', () => createMemoryLandmarks(), r => createRedisLandmarks(r), async store => {
    for (const person of [erin, pat]) await store.add(person.userId, { name: `${person.name} corner`, position: [1, 2] });
  }, async store => { assert.deepEqual(await store.list(erin.userId), []);assert.equal((await store.list(pat.userId)).length, 1); }],
  ['debug reports', () => createMemoryDebugReports(), r => createRedisDebugReports(r), async store => {
    await store.add(report('erin one'), erin);await store.add(report('pat one'), pat);await store.add(report('erin two'), erin);
  }, async store => assert.deepEqual((await store.list()).map(item => item.description), ['pat one'])],
];
for (const [name, memory, redis, seed, check] of simple) twins(name, memory, redis, async store => {
  await seed(store);
  await store.eraseUser(erin.userId);await check(store);
  await store.eraseUser(erin.userId);await check(store);
});

twins('GitHub names', () => createMemoryGitHubNameStore(), r => createRedisGitHubNameStore({ redis: r.redis, key: `${r.prefix}:auth:github` }), async store => {
  await store.set(erin.userId, { githubId: '1', login: 'erin', checkedAt: 0 });await store.set(pat.userId, { githubId: '2', login: 'pat', checkedAt: 0 });
  await store.delete(erin.userId);
  assert.equal(await store.get(erin.userId), null);assert.equal((await store.get(pat.userId)).login, 'pat');
});

// The waitlist holds the email address: the request, the account's invites, its audit
// entries and every mention of it in other records go; the inviter's mark becomes a marker.
async function waitlistCase(waitlist, contents) {
  const email = 'erin@example.test';
  // A login change and a chosen username leave earlier name holds behind; erasure finds them all.
  await waitlist.request({ ...erin, name: 'erin-old', email });
  assert.equal((await waitlist.setUsername({ userId: erin.userId, username: 'erinchosen', actorId: erin.userId })).ok, true);
  await waitlist.request({ ...erin, name: 'erin-new', email });
  await waitlist.decide({ userId: erin.userId, approved: true, actorId: 'admin' });
  const assigned = await waitlist.issueInvite({ actorId: 'admin', ownerId: 'admin', assignedUserId: erin.userId });
  await waitlist.request({ ...pat, email: 'pat@example.test' });
  const code = (await waitlist.listInvites({ userId: erin.userId })).find(item => item.status === 'active').code;
  assert.equal((await waitlist.redeemInvite({ identity: pat, code })).ok, true);
  assert.ok((await contents()).includes(email));
  await waitlist.eraseUser(erin.userId);
  const after = await contents();
  assert.equal(after.includes(erin.userId), false);assert.equal(after.includes(email), false);
  const records = await waitlist.list();
  assert.deepEqual(records.map(record => record.userId), [pat.userId]);
  assert.equal(records[0].status, 'approved');assert.equal(records[0].decidedBy, ERASED_ACCOUNT);
  const invites = await waitlist.listInvites({ userId: 'admin' });
  assert.equal(invites.some(invite => invite.ownerId === erin.userId), false);
  const kept = invites.find(invite => invite.id === assigned.id);
  assert.equal(kept.assignedUserId, null);assert.equal(kept.status, 'revoked');
  assert.equal(await waitlist.usernameOf(erin.userId), null);
  await waitlist.eraseUser(erin.userId);
}
test('the file waitlist erases one account, legacy mirror included', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'erasure-waitlist-'));t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'waitlist.json');
  const waitlist = await createFileWaitlist(file, { admins: ['admin'] });
  await waitlistCase(waitlist, async () => (await readFile(file, 'utf8')) + await readFile(`${file}.audit.jsonl`, 'utf8').catch(() => ''));
});
test('the Redis waitlist erases one account', { skip: !redisUrl }, async t => {
  const { redis, prefix } = await redisFor(t);
  const waitlist = createRedisWaitlist({ redis, prefix, admins: ['admin'] });
  await waitlistCase(waitlist, async () => {
    const parts = [];
    for (const key of await redis.keys(`${prefix}*`)) {
      const type = await redis.type(key);
      parts.push(key, ...(type === 'hash' ? Object.entries(await redis.hgetall(key)).flat() : type === 'list' ? await redis.lrange(key, 0, -1)
        : type === 'zset' ? await redis.zrange(key, 0, -1) : type === 'set' ? await redis.smembers(key) : [await redis.get(key)]));
    }
    return parts.join('\n');
  });
});

test('erasure shuts the account out first, reports a failed step by name only, and retries whole', async t => {
  const order = [], warnings = [];let flaky = true;
  t.mock.method(console, 'warn', line => warnings.push(line));
  const eraseAccount = createAccountErasure({ tombstone: async id => order.push(`tombstone:${id}`), revoke: async id => order.push(`revoke:${id}`), steps: {
    social: async () => order.push('social'),
    waitlist: async () => { order.push('waitlist'); if (flaky) throw new Error('storage detail user_erin'); },
  } });
  await assert.rejects(eraseAccount(erin.userId), /Account erasure incomplete/);
  assert.deepEqual(order.slice(0, 2), ['tombstone:user_erin', 'revoke:user_erin']);
  assert.deepEqual(warnings.map(line => JSON.parse(line)), [{ event: 'account_erasure_incomplete', eventId: null, steps: ['waitlist'] }]);
  flaky = false;order.length = 0;
  await eraseAccount(erin.userId);
  assert.deepEqual(order, ['tombstone:user_erin', 'revoke:user_erin', 'social', 'waitlist']);
  // Concurrent requests for one account share a run.
  order.length = 0;
  await Promise.all([eraseAccount(erin.userId), eraseAccount(erin.userId)]);
  assert.equal(order.filter(item => item === 'social').length, 1);
  await assert.rejects(eraseAccount(''), /Invalid account/);
});
