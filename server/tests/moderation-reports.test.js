import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createGameServer } from '../app.js';
import { createModeration } from '../moderation.js';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createRedisSocial } from '../social.js';
import { createRedisBlocks } from '../blocks.js';
import { createRedisLandmarks } from '../landmarks.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { REPORT_LIST_LIMIT, normalizeReport } from '../moderation-reports.js';
import { accountName } from '../../preview/src/resident-names.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

// Moderators read saved player reports in the app (#292, App Review guideline 1.2). The
// route reads where each server already saves them; it writes nothing.
const ORIGIN = 'http://127.0.0.1';
const auth = {
  async handle() { return false; },
  async authenticate(req) { const id = req.headers.cookie?.match(/session=([\w-]+)/)?.[1];return id ? { userId: id, name: id, sessionId: id, csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000 } : null; },
};
const usernames = { 'user-pat': 'pat', 'user-erin': 'erin' };
// 'moderator-pending' is listed as a moderator but has no waitlist approval.
const waitlist = { ...approvedWaitlist, isApproved: async id => id !== 'moderator-pending', usernameOf: async id => usernames[id] ?? null };
const read = (base, user, method = 'GET') => fetch(`${base}/api/moderation/reports`, { method, headers: { Origin: ORIGIN, ...(user ? { Cookie: `session=${user}` } : {}), 'X-CSRF-Token': 'test-csrf' } });
const ban = (base, user, userId, banned = true) => fetch(`${base}/api/moderation/ban`, { method: 'POST',
  headers: { Origin: ORIGIN, Cookie: `session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, banned }) });
// The whole of each listed report, with its time checked and set aside.
const whole = reports => reports.map(({ at, ...rest }) => { assert.ok(!Number.isNaN(Date.parse(at)), at);return rest; });
const town = () => ({ worldId: 'river-oaks', players: new Map(), join: () => ({ ok: true }), leave() {}, command: () => ({ ok: true }), step() {},
  snapshot: () => ({ type: 'snapshot', players: [], locals: [], wishes: {} }), resolvePlace: () => null, listPlaces: () => [] });

test('the town file and the hosted list read as one report shape', () => {
  assert.deepEqual(normalizeReport({ at: '2026-10-26T10:00:00.000Z', type: 'report', reporterId: 'a', userId: 'b', reason: 'harassment' }),
    { at: '2026-10-26T10:00:00.000Z', reporterId: 'a', reportedId: 'b', reason: 'harassment' });
  assert.deepEqual(normalizeReport({ kind: 'report', at: '2026-10-26T10:00:00.000Z', reporterId: 'a', targetId: 'b', reason: 'cheating' }),
    { at: '2026-10-26T10:00:00.000Z', reporterId: 'a', reportedId: 'b', reason: 'cheating' });
  for (const entry of [null, 'text', { type: 'ban', userId: 'b' }, { kind: 'unban', userId: 'b' }, { type: 'report', reporterId: 'a', userId: 'b', reason: 'spam', at: 'x' },
    { type: 'report', reporterId: '', userId: 'b', reason: 'harassment', at: '2026-10-26T10:00:00.000Z' }, { type: 'report', reporterId: 'a', userId: 'b', reason: 'harassment', at: 'not a time' },
    // Every field of a report, but another kind of entry.
    { type: 'ban', reporterId: 'a', userId: 'b', reason: 'harassment', at: '2026-10-26T10:00:00.000Z' }, { kind: 'invite', reporterId: 'a', targetId: 'b', reason: 'cheating', at: '2026-10-26T10:00:00.000Z' }])
    assert.equal(normalizeReport(entry), null, JSON.stringify(entry));
});

test('the standalone town lists its saved reports to moderators only, newest first, with names and bans', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-moderation-reports-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const path = join(temporary, 'moderation.json');
  // An older log, already rotated at 5 MB, is read after the current one.
  await writeFile(`${path}.audit.jsonl.previous`, `${JSON.stringify({ at: '2026-10-20T09:00:00.000Z', type: 'report', reporterId: 'user-erin', userId: 'user-pat', reason: 'cheating' })}\nnot json\n`);
  const store = await createModeration(path);
  await store.report('user-pat', 'user-erin', 'harassment');
  await store.setBanned('user-erin', true, 'moderator');
  await store.report('user-kim', 'user-pat', 'disruption');
  // A report about a moderator is for the other moderators.
  await store.report('user-pat', 'moderator', 'harassment');
  // Counts store reads, to show that only a moderator's request reaches them, and records
  // whose ban is looked up.
  let reads = 0;const checked = new Set();
  const moderation = { ...store, reports: () => { reads++;return store.reports(); }, isBanned: id => { checked.add(id);return store.isBanned(id); } };
  const app = createGameServer({ auth, world: town(), waitlist, origin: ORIGIN, staticRoot: '/nonexistent', moderation, moderators: ['moderator', 'moderator-pending', 'moderator-2'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;

  assert.equal((await read(base, null)).status, 401);
  assert.equal((await read(base, 'moderator', 'POST')).status, 405);
  const resident = await read(base, 'user-pat');
  assert.equal(resident.status, 200);
  assert.deepEqual(await resident.json(), { moderator: false }, 'a resident learns nothing but that');
  assert.deepEqual(await (await read(base, 'moderator-pending')).json(), { moderator: false }, 'a moderator without approval is treated as a resident');
  assert.equal(reads, 0, 'nothing is read for anyone but an approved moderator');
  const listed = await (await read(base, 'moderator')).json();
  assert.deepEqual(Object.keys(listed), ['moderator', 'reports']);
  // Only a shown name for the reporter, and no report about the reader.
  assert.deepEqual(whole(listed.reports), [
    { reason: 'disruption', reporter: { name: accountName('user-kim', null) }, reported: { id: 'user-pat', name: 'pat', banned: false, staff: false } },
    { reason: 'harassment', reporter: { name: 'pat' }, reported: { id: 'user-erin', name: 'erin', banned: true, staff: false } },
    { reason: 'cheating', reporter: { name: 'erin' }, reported: { id: 'user-pat', name: 'pat', banned: false, staff: false } },
  ]);
  assert.ok(accountName('user-kim', null), 'an account with no username still has a shown name');
  assert.equal(checked.has('user-kim'), false, 'a reporter\'s ban is never looked up');
  assert.equal(reads, 1);
  assert.deepEqual(whole((await (await read(base, 'moderator-2')).json()).reports)[0],
    { reason: 'harassment', reporter: { name: 'pat' }, reported: { id: 'moderator', name: accountName('moderator', null), banned: false, staff: true } },
    'another moderator sees it');
  // A banned moderator sees nothing.
  await store.setBanned('moderator', true, 'someone');
  assert.equal((await read(base, 'moderator')).status, 403);
  assert.equal(reads, 2);
});

// A moderator can't ban another moderator, a waitlist admin or an owner: a banned
// moderator couldn't even lift their own ban. Lifting a ban on one still works.
// `revoked` records invite revocations, the first thing a ban does.
async function refusesStaffBans(base, isBanned, revoked, owners = [JEVICA_ADMIN_USER_IDS[0]]) {
  for (const userId of ['moderator-2', 'admin-1', ...owners]) {
    const refused = await ban(base, 'moderator', userId);
    assert.equal(refused.status, 403, userId);
    assert.deepEqual(await refused.json(), { error: 'Moderators, waitlist admins and owners can’t be banned here.' });
    assert.equal(await isBanned(userId), false, userId);
  }
  assert.deepEqual(revoked, [], 'nothing happens before the refusal');
  assert.equal((await ban(base, 'moderator', 'user-pat')).status, 200);
  assert.equal(await isBanned('user-pat'), true);
  assert.deepEqual(revoked, ['user-pat']);
}
const revoking = revoked => ({ ...waitlist, revokeInvites: async ({ userId }) => { revoked.push(userId);return true; } });

test('the town refuses to ban a moderator, a waitlist admin or an owner, but lifts a ban on one', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-moderation-reports-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const moderation = await createModeration(join(temporary, 'moderation.json'));
  // The town's owner is whoever its sign-in says administers it, as in local development.
  const revoked = [];
  const app = createGameServer({ auth, world: town(), waitlist: revoking(revoked), origin: ORIGIN, staticRoot: '/nonexistent', moderation,
    moderators: ['moderator', 'moderator-2'], waitlistAdmins: ['admin-1'], isAdmin: id => id === 'dev-owner' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  await refusesStaffBans(base, id => moderation.isBanned(id), revoked, ['dev-owner']);
  await moderation.setBanned('moderator-2', true, 'someone');
  assert.equal((await ban(base, 'moderator', 'moderator-2', false)).status, 200);
  assert.equal(await moderation.isBanned('moderator-2'), false);
});

test('the town limits how often a moderator reads, and a failed lookup is a 503', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-moderation-reports-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const store = await createModeration(join(temporary, 'moderation.json'));
  await store.report('user-pat', 'user-erin', 'harassment');
  let broken = false;
  const moderation = { ...store, isBanned: id => { if (broken && id === 'user-erin') throw new Error('store offline');return store.isBanned(id); } };
  const app = createGameServer({ auth, world: town(), waitlist, origin: ORIGIN, staticRoot: '/nonexistent', moderation, moderators: ['moderator', 'moderator-2'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  broken = true;
  const failed = await read(base, 'moderator-2');
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { moderator: true, error: 'Reports are unavailable right now.' });
  broken = false;
  for (let i = 0; i < 30; i++) assert.equal((await read(base, 'moderator')).status, 200, `read ${i + 1}`);
  const limited = await read(base, 'moderator');
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).moderator, true);
  assert.equal((await read(base, 'moderator-2')).status, 200, 'each moderator has their own limit');
});

test('the town lists at most the newest 200 reports', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-moderation-reports-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const moderation = await createModeration(join(temporary, 'moderation.json'));
  for (let i = 0; i < REPORT_LIST_LIMIT + 5; i++) await moderation.report(`user-${i}`, 'user-pat', 'disruption');
  const reports = await moderation.reports();
  assert.equal(reports.length, REPORT_LIST_LIMIT);
  assert.equal(reports[0].reporterId, `user-${REPORT_LIST_LIMIT + 4}`, 'newest first');
  assert.match(await readFile(join(temporary, 'moderation.json.audit.jsonl'), 'utf8'), /user-0"/, 'nothing is removed by reading');
});

// A report about the reader is left out before the newest 200 are taken, so it doesn't
// push the reader's oldest row off the list either.
async function keepsTheList(base, reportAbout) {
  const before = (await (await read(base, 'moderator')).json()).reports;
  assert.equal(before.length, REPORT_LIST_LIMIT);
  await reportAbout('moderator');
  assert.deepEqual((await (await read(base, 'moderator')).json()).reports, before);
}

test('the town keeps a moderator\'s 200 rows when a report about them arrives', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-moderation-reports-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const moderation = await createModeration(join(temporary, 'moderation.json'));
  for (let i = 0; i < REPORT_LIST_LIMIT; i++) await moderation.report(`user-${i}`, 'user-pat', 'disruption');
  const app = createGameServer({ auth, world: town(), waitlist, origin: ORIGIN, staticRoot: '/nonexistent', moderation, moderators: ['moderator'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  await keepsTheList(`http://127.0.0.1:${app.server.address().port}`, id => moderation.report('user-kim', id, 'harassment'));
});

test('the hosted backend keeps a moderator\'s 200 rows when a report about them arrives', { skip: !process.env.REDIS_URL, timeout: 60000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test-moderation-reports:${randomUUID()}}`;
  const security = createRedisSecurity({ redis, prefix });
  const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, authorize: async () => true });
  const app = createDistributedServer({ auth, security, room, waitlist, landmarks: createRedisLandmarks({ redis, prefix }),
    social: createRedisSocial({ redis, prefix }), blocks: createRedisBlocks({ redis, prefix }), origin: ORIGIN, moderators: ['moderator'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close();await room.close();security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  for (let i = 0; i < REPORT_LIST_LIMIT; i++) assert.equal(await security.report({ reporterId: `user-${i}`, targetId: 'user-pat', reason: 'disruption' }), true);
  await keepsTheList(`http://127.0.0.1:${app.server.address().port}`, async id => assert.equal(await security.report({ reporterId: 'user-kim', targetId: id, reason: 'harassment' }), true));
});

test('the hosted backend lists reports from the shared Redis audit list', { skip: !process.env.REDIS_URL, timeout: 30000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test-moderation-reports:${randomUUID()}}`;
  // The limiter counts per clock minute; one fixed minute keeps the count whole.
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  const security = createRedisSecurity({ redis, prefix, now: () => minute + 1_000 });
  const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, authorize: async () => true });
  const app = createDistributedServer({ auth, security, room, waitlist, landmarks: createRedisLandmarks({ redis, prefix }),
    social: createRedisSocial({ redis, prefix }), blocks: createRedisBlocks({ redis, prefix }), origin: ORIGIN, moderators: ['moderator', 'moderator-pending', 'moderator-2'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close();await room.close();security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal(await security.report({ reporterId: 'user-pat', targetId: 'user-erin', reason: 'harassment' }), true);
  assert.equal(await security.ban({ userId: 'user-erin', actorId: 'moderator', reason: 'Moderator action' }), true);
  assert.equal(await security.report({ reporterId: 'user-erin', targetId: 'user-pat', reason: 'cheating' }), true);
  assert.equal(await security.report({ reporterId: 'user-pat', targetId: 'moderator', reason: 'harassment' }), true);
  assert.deepEqual(await (await read(base, 'user-pat')).json(), { moderator: false });
  assert.equal((await read(base, null)).status, 401);
  assert.deepEqual(await (await read(base, 'moderator-pending')).json(), { moderator: false }, 'a moderator without approval is treated as a resident');
  const listed = await (await read(base, 'moderator')).json();
  assert.deepEqual(Object.keys(listed), ['moderator', 'reports']);
  assert.deepEqual(whole(listed.reports), [
    { reason: 'cheating', reporter: { name: 'erin' }, reported: { id: 'user-pat', name: 'pat', banned: false, staff: false } },
    { reason: 'harassment', reporter: { name: 'pat' }, reported: { id: 'user-erin', name: 'erin', banned: true, staff: false } },
  ], 'newest first; the ban in between is not a report, and the report about the reader is left out');
  assert.deepEqual(whole((await (await read(base, 'moderator-2')).json()).reports)[0],
    { reason: 'harassment', reporter: { name: 'pat' }, reported: { id: 'moderator', name: accountName('moderator', null), banned: false, staff: true } }, 'another moderator sees it');
  assert.equal((await read(base, 'moderator', 'DELETE')).status, 405);
  for (let i = 1; i < 30; i++) assert.equal((await read(base, 'moderator')).status, 200, `read ${i + 1}`);
  assert.equal((await read(base, 'moderator')).status, 429, 'thirty reads a minute');
  assert.equal((await read(base, 'moderator-2')).status, 200, 'each moderator has their own limit');
  assert.equal(await security.ban({ userId: 'user-pat', actorId: 'moderator', reason: 'Moderator action' }), true);
  assert.equal((await read(base, 'user-pat')).status, 403, 'a banned account is refused');
});

test('the hosted backend refuses to ban a moderator, a waitlist admin or an owner, but lifts a ban on one', { skip: !process.env.REDIS_URL, timeout: 30000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test-moderation-reports:${randomUUID()}}`;
  const security = createRedisSecurity({ redis, prefix });
  const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, authorize: async () => true });
  const revoked = [];
  const app = createDistributedServer({ auth, security, room, waitlist: revoking(revoked), landmarks: createRedisLandmarks({ redis, prefix }),
    social: createRedisSocial({ redis, prefix }), blocks: createRedisBlocks({ redis, prefix }), origin: ORIGIN,
    moderators: ['moderator', 'moderator-2'], waitlistAdmins: ['admin-1'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close();await room.close();security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  await refusesStaffBans(base, id => security.isBanned(id), revoked);
  assert.equal(await security.ban({ userId: 'moderator-2', actorId: 'someone', reason: 'Moderator action' }), true);
  assert.equal((await ban(base, 'moderator', 'moderator-2', false)).status, 200);
  assert.equal(await security.isBanned('moderator-2'), false);
});

test('the hosted list reads past other audit entries, and returns at most the newest 200', { skip: !process.env.REDIS_URL, timeout: 60000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test-moderation-reports:${randomUUID()}}`;
  const security = createRedisSecurity({ redis, prefix });
  t.after(async () => { security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  assert.equal(await security.report({ reporterId: 'user-early', targetId: 'user-pat', reason: 'cheating' }), true);
  for (let i = 0; i < 600; i++) await security.audit('note', { i });
  for (let i = 0; i < REPORT_LIST_LIMIT + 5; i++) assert.equal(await security.report({ reporterId: `user-${i}`, targetId: 'user-pat', reason: 'disruption' }), true);
  const newest = await security.reports();
  assert.equal(newest.length, REPORT_LIST_LIMIT);
  assert.equal(newest[0].reporterId, `user-${REPORT_LIST_LIMIT + 4}`);
  const all = await security.reports(1000);
  assert.equal(all.length, REPORT_LIST_LIMIT + 6);
  assert.equal(all.at(-1).reporterId, 'user-early', 'a report behind 600 other entries is still found');
});
