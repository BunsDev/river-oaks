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
  // Counts store reads, to show that only a moderator's request reaches them.
  let reads = 0;
  const moderation = { ...store, reports: () => { reads++;return store.reports(); } };
  const world = { worldId: 'river-oaks', players: new Map(), join: () => ({ ok: true }), leave() {}, command: () => ({ ok: true }), step() {},
    snapshot: () => ({ type: 'snapshot', players: [], locals: [], wishes: {} }), resolvePlace: () => null, listPlaces: () => [] };
  const app = createGameServer({ auth, world, waitlist, origin: ORIGIN, staticRoot: '/nonexistent', moderation, moderators: ['moderator', 'moderator-pending'] });
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
  assert.equal(listed.moderator, true);
  assert.deepEqual(listed.reports.map(({ reason, reporter, reported }) => [reason, reporter.id, reporter.name, reported.id, reported.name, reported.banned]), [
    ['disruption', 'user-kim', accountName('user-kim', null), 'user-pat', 'pat', false],
    ['harassment', 'user-pat', 'pat', 'user-erin', 'erin', true],
    ['cheating', 'user-erin', 'erin', 'user-pat', 'pat', false],
  ]);
  assert.ok(accountName('user-kim', null), 'an account with no username still has a shown name');
  assert.ok(listed.reports.every(report => !Number.isNaN(Date.parse(report.at))));
  assert.equal(reads, 1);
  // A banned moderator sees nothing.
  await store.setBanned('moderator', true, 'someone');
  assert.equal((await read(base, 'moderator')).status, 403);
  assert.equal(reads, 1);
});

test('the town limits how often a moderator reads, and a failed lookup is a 503', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-moderation-reports-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const store = await createModeration(join(temporary, 'moderation.json'));
  await store.report('user-pat', 'user-erin', 'harassment');
  let broken = false;
  const moderation = { ...store, isBanned: id => { if (broken && id === 'user-erin') throw new Error('store offline');return store.isBanned(id); } };
  const world = { worldId: 'river-oaks', players: new Map(), join: () => ({ ok: true }), leave() {}, command: () => ({ ok: true }), step() {},
    snapshot: () => ({ type: 'snapshot', players: [], locals: [], wishes: {} }), resolvePlace: () => null, listPlaces: () => [] };
  const app = createGameServer({ auth, world, waitlist, origin: ORIGIN, staticRoot: '/nonexistent', moderation, moderators: ['moderator', 'moderator-2'] });
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

test('the hosted backend lists reports from the shared Redis audit list', { skip: !process.env.REDIS_URL, timeout: 30000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test-moderation-reports:${randomUUID()}}`;
  // The limiter counts per clock minute; one fixed minute keeps the count whole.
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  const security = createRedisSecurity({ redis, prefix, now: () => minute + 1_000 });
  const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, authorize: async () => true });
  const app = createDistributedServer({ auth, security, room, waitlist, landmarks: createRedisLandmarks({ redis, prefix }),
    social: createRedisSocial({ redis, prefix }), blocks: createRedisBlocks({ redis, prefix }), origin: ORIGIN, moderators: ['moderator', 'moderator-pending'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close();await room.close();security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal(await security.report({ reporterId: 'user-pat', targetId: 'user-erin', reason: 'harassment' }), true);
  assert.equal(await security.ban({ userId: 'user-erin', actorId: 'moderator', reason: 'Moderator action' }), true);
  assert.equal(await security.report({ reporterId: 'user-erin', targetId: 'user-pat', reason: 'cheating' }), true);
  assert.deepEqual(await (await read(base, 'user-pat')).json(), { moderator: false });
  assert.equal((await read(base, null)).status, 401);
  assert.deepEqual(await (await read(base, 'moderator-pending')).json(), { moderator: false }, 'a moderator without approval is treated as a resident');
  const listed = await (await read(base, 'moderator')).json();
  assert.deepEqual(listed.reports.map(({ reason, reporter, reported }) => [reason, reporter.id, reported.id, reported.name, reported.banned]), [
    ['cheating', 'user-erin', 'user-pat', 'pat', false],
    ['harassment', 'user-pat', 'user-erin', 'erin', true],
  ], 'newest first; the ban in between is not a report');
  assert.equal((await read(base, 'moderator', 'DELETE')).status, 405);
  for (let i = 1; i < 30; i++) assert.equal((await read(base, 'moderator')).status, 200, `read ${i + 1}`);
  assert.equal((await read(base, 'moderator')).status, 429, 'thirty reads a minute');
  assert.equal(await security.ban({ userId: 'user-pat', actorId: 'moderator', reason: 'Moderator action' }), true);
  assert.equal((await read(base, 'user-pat')).status, 403, 'a banned account is refused');
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
