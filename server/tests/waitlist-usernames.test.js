import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createFileWaitlist, createRedisWaitlist } from '../waitlist.js';
import { createWaitlistRoutes } from '../waitlist-routes.js';
import { validUsername } from '../../preview/src/resident-names.js';

// Usernames at sign-up: a GitHub login by default (held for its owner), otherwise a
// generated name; the waiting resident may change it; an approver may change it until
// approval; the approved username names the resident. The file and Redis stores agree.
const github = login => ({ userId: `gh-${login}`, name: login, email: `${login}@example.test` });
const email = id => ({ userId: id, name: `Visitor #${id}`, email: `${id}@example.test` });

async function contract(t, waitlist, readAudit) {
  const octo = await waitlist.request(github('octocat'));
  assert.equal(octo.username, 'octocat');
  assert.equal(octo.usernameBy, 'default');
  const guest = await waitlist.request(email('guest-1'));
  assert.equal(validUsername(guest.username), true);
  assert.match(guest.username, /^[a-z]+-[a-z]+-\d\d$/, 'someone without a GitHub login gets a generated name');
  assert.equal((await waitlist.request(email('guest-1'))).username, guest.username, 'the default stays put across polls');

  // A GitHub login is held for its owner, under any spelling that reads the same.
  for (const name of ['octocat', 'OctoCat', '0ctocat', 'octo.cat']) {
    assert.equal((await waitlist.setUsername({ userId: 'guest-1', username: name, actorId: 'guest-1' })).reason, 'taken', name);
  }
  // The waiting resident renames themselves; the old name is free again.
  const renamed = await waitlist.setUsername({ userId: 'guest-1', username: 'night-owl', actorId: 'guest-1' });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.record.usernameBy, 'self');
  await waitlist.request(email('guest-2'));
  assert.equal((await waitlist.setUsername({ userId: 'guest-2', username: guest.username, actorId: 'guest-2' })).ok, true, 'a released name can be taken');
  assert.equal((await waitlist.setUsername({ userId: 'guest-2', username: 'Night_Owl', actorId: 'guest-2' })).reason, 'taken');
  const invalid = await waitlist.setUsername({ userId: 'guest-2', username: 'j3v1ca', actorId: 'guest-2' });
  assert.equal(invalid.reason, 'invalid');
  assert.match(invalid.message, /reserved/);
  assert.equal((await waitlist.setUsername({ userId: 'guest-2', username: 'a', actorId: 'guest-2' })).reason, 'invalid');
  await assert.rejects(waitlist.setUsername({ userId: 'guest-2', username: 'stolen-name', actorId: 'guest-1' }), /authority/, 'nobody renames another resident');

  // The approver may rename before approving; the approved name then names the resident.
  const byAdmin = await waitlist.setUsername({ userId: 'guest-1', username: 'evening-owl', actorId: 'admin' });
  assert.equal(byAdmin.ok, true);
  assert.equal(byAdmin.record.usernameBy, 'admin');
  assert.equal(await waitlist.usernameOf('guest-1'), null, 'not until approval');
  await waitlist.decide({ userId: 'guest-1', approved: true, actorId: 'admin' });
  assert.equal(await waitlist.usernameOf('guest-1'), 'evening-owl');
  assert.equal((await waitlist.setUsername({ userId: 'guest-1', username: 'other-name', actorId: 'guest-1' })).reason, 'locked');
  assert.equal((await waitlist.setUsername({ userId: 'guest-1', username: 'other-name', actorId: 'admin' })).reason, 'locked');
  assert.equal((await waitlist.setUsername({ userId: 'guest-1', username: 'evening-owl', actorId: 'admin' })).ok, true, 'the same name again is no change');
  // A refused request may still be renamed by an approver, not by its owner.
  await waitlist.decide({ userId: 'guest-2', approved: false, actorId: 'admin' });
  assert.equal((await waitlist.setUsername({ userId: 'guest-2', username: 'second-try', actorId: 'guest-2' })).reason, 'locked');
  assert.equal((await waitlist.setUsername({ userId: 'guest-2', username: 'second-try', actorId: 'admin' })).ok, true);
  assert.equal((await waitlist.setUsername({ userId: 'nobody', username: 'nobody-here', actorId: 'admin' })).reason, 'missing');

  // A GitHub login that someone already chose falls back to a generated default.
  const late = await waitlist.request(github('night-owl-2'));
  assert.equal(late.username, 'night-owl-2');
  await waitlist.setUsername({ userId: late.userId, username: 'copycat', actorId: late.userId });
  const copycat = await waitlist.request(github('copycat'));
  assert.notEqual(copycat.username, 'copycat');
  assert.equal(validUsername(copycat.username), true);
  // Approved residents from before usernames keep their names and hold their logins.
  assert.deepEqual((await readAudit()).filter(entry => entry.action === 'username').map(entry => [entry.userId, entry.username, entry.actorId]),
    [['guest-1', 'evening-owl', 'admin'], ['guest-2', 'second-try', 'admin']]);
}

test('the file waitlist keeps usernames unique, editable while waiting, and fixed once approved', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'river-oaks-usernames-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'waitlist.json');
  const waitlist = await createFileWaitlist(file, { admins: ['admin'] });
  await contract(t, waitlist, async () => JSON.parse(await readFile(file, 'utf8')).audit);
  // A restart reads the same names back.
  const reopened = await createFileWaitlist(file, { admins: ['admin'] });
  assert.equal(await reopened.usernameOf('guest-1'), 'evening-owl');
  assert.equal((await reopened.setUsername({ userId: 'guest-2', username: 'OctoCat', actorId: 'admin' })).reason, 'taken');
});

test('the Redis waitlist enforces the same usernames atomically', { skip: !process.env.REDIS_URL }, async t => {
  const redis = new Redis(process.env.REDIS_URL);
  const prefix = `{test-usernames-${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); redis.disconnect(); });
  const waitlist = createRedisWaitlist({ redis, prefix, admins: ['admin'] });
  await contract(t, waitlist, async () => (await redis.lrange(`${prefix}:waitlist:audit`, 0, -1)).map(raw => JSON.parse(raw)).reverse());
  // Two requests racing for one name: exactly one wins.
  await waitlist.request(email('racer-a')); await waitlist.request(email('racer-b'));
  const results = await Promise.all(['racer-a', 'racer-b'].map(id => waitlist.setUsername({ userId: id, username: 'photo-finish', actorId: id })));
  assert.deepEqual(results.map(result => result.ok).sort(), [false, true]);
});

test('the routes let a waiting resident name themselves and an approver rename before approving', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'river-oaks-username-routes-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const admins = ['admin'], waitlist = await createFileWaitlist(join(directory, 'waitlist.json'), { admins });
  const people = { admin: { userId: 'admin', name: 'Admin', csrfToken: 'admin-csrf' }, octo: { ...github('octocat'), csrfToken: 'octo-csrf' }, guest: { ...email('guest-1'), csrfToken: 'guest-csrf' } };
  const auth = { authenticate: async req => people[req.headers.cookie?.replace('session=', '')] ?? null };
  const origin = 'http://127.0.0.1:43211', route = createWaitlistRoutes({ auth, waitlist, admins, origin });
  const server = createServer(async (req, res) => { if (!await route(req, res, new URL(req.url, origin).pathname)) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, who) => fetch(base + path, { headers: { cookie: `session=${who}` } });
  const post = (path, who, body, headers = {}) => fetch(base + path, { method: 'POST', body: JSON.stringify(body),
    headers: { cookie: `session=${who}`, 'content-type': 'application/json', origin, 'x-csrf-token': people[who].csrfToken, ...headers } });

  const octo = await (await get('/api/waitlist/status', 'octo')).json();
  assert.deepEqual([octo.status, octo.username, octo.usernameBy, octo.github], ['pending', 'octocat', 'default', 'octocat']);
  const guest = await (await get('/api/waitlist/status', 'guest')).json();
  assert.equal(guest.github, null);
  assert.equal(validUsername(guest.username), true);

  // Every write keeps the origin and CSRF checks.
  assert.equal((await post('/api/waitlist/username', 'guest', { username: 'river-wren' }, { 'x-csrf-token': 'wrong' })).status, 403);
  assert.equal((await post('/api/waitlist/username', 'guest', { username: 'river-wren' }, { origin: 'https://evil.example' })).status, 403);
  const saved = await post('/api/waitlist/username', 'guest', { username: 'river-wren' });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { userId: 'guest-1', username: 'river-wren', usernameBy: 'self' });
  const taken = await post('/api/waitlist/username', 'guest', { username: 'OctoCat' });
  assert.equal(taken.status, 409);
  assert.equal((await taken.json()).error, 'username_taken');
  const reserved = await post('/api/waitlist/username', 'guest', { username: 'Jevica' });
  assert.equal(reserved.status, 400);
  assert.match((await reserved.json()).message, /reserved/);
  assert.equal((await post('/api/waitlist/username', 'guest', { username: 'sneaky', userId: 'gh-octocat' })).status, 400, 'nobody renames another resident');
  assert.equal((await post('/api/waitlist/username', 'guest', { username: 'x'.repeat(80) })).status, 400);

  // The approver renames in the review, and a decision may carry the name.
  assert.equal((await post('/api/waitlist/username', 'admin', { username: 'wren-of-the-oaks', userId: 'guest-1' })).status, 200);
  const refused = await post('/api/waitlist/decision', 'admin', { userId: 'gh-octocat', approved: true, username: 'wren-of-the-oaks' });
  assert.equal(refused.status, 409, 'a name already held refuses the decision');
  assert.equal(await waitlist.isApproved('gh-octocat'), false);
  const approved = await post('/api/waitlist/decision', 'admin', { userId: 'gh-octocat', approved: true, username: 'octo-the-cat' });
  assert.equal(approved.status, 200);
  assert.deepEqual(await approved.json(), { userId: 'gh-octocat', status: 'approved', username: 'octo-the-cat' });
  assert.equal(await waitlist.usernameOf('gh-octocat'), 'octo-the-cat');
  // Revoking with the unchanged name is allowed; a new name after approval is not.
  assert.equal((await post('/api/waitlist/decision', 'admin', { userId: 'gh-octocat', approved: false, username: 'octo-the-cat' })).status, 200);
  const listed = await (await get('/api/waitlist/requests', 'admin')).json();
  assert.deepEqual(listed.requests.map(request => [request.userId, request.username]).sort(), [['gh-octocat', 'octo-the-cat'], ['guest-1', 'wren-of-the-oaks']]);
});
