import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createFileWaitlist, createRedisWaitlist } from '../waitlist.js';
import { createWaitlistRoutes } from '../waitlist-routes.js';

test('pending users cannot enter; a named approver can approve, revoke, and audit decisions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'river-oaks-waitlist-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'waitlist.json'), admins = ['admin'];
  const waitlist = await createFileWaitlist(file, { admins });
  const admin = { userId: 'admin', name: 'Admin', csrfToken: 'admin-csrf' };
  const visitor = { userId: 'visitor', name: 'Visitor', csrfToken: 'visitor-csrf' };
  const auth = { authenticate: async req => req.headers.cookie === 'session=admin' ? admin
    : req.headers.cookie === 'session=visitor' ? visitor : null };
  const origin = 'http://127.0.0.1:43210';
  const route = createWaitlistRoutes({ auth, waitlist, admins, origin });
  const server = createServer(async (req, res) => {
    try { if (!await route(req, res, new URL(req.url, origin).pathname)) { res.writeHead(404); res.end(); } }
    catch { res.writeHead(503); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, cookie, { headers = {}, ...options } = {}) => fetch(base + path, { ...options, headers: { cookie, ...headers } });
  assert.equal((await request('/api/waitlist/status', '')).status, 401);
  const first = await (await request('/api/waitlist/status', 'session=visitor')).json();
  assert.equal(first.status, 'pending');
  assert.equal(await waitlist.isApproved('visitor'), false);
  assert.equal((await request('/api/waitlist/requests', 'session=visitor')).status, 403);
  const listed = await (await request('/api/waitlist/requests', 'session=admin')).json();
  assert.equal(listed.requests.length, 1);
  const decision = (approved, headers = {}) => request('/api/waitlist/decision', 'session=admin', {
    method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-csrf-token': 'admin-csrf', ...headers },
    body: JSON.stringify({ userId: 'visitor', approved }),
  });
  assert.equal((await decision(true, { 'x-csrf-token': 'forged' })).status, 403);
  assert.equal((await decision(true, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await decision(true)).status, 200);
  assert.equal(await waitlist.isApproved('visitor'), true);
  assert.equal((await decision(false)).status, 200);
  assert.equal(await waitlist.isApproved('visitor'), false);
  const reopened = await createFileWaitlist(file, { admins });
  assert.equal((await reopened.request(visitor)).status, 'rejected');
  const audit = await readFile(`${file}.audit.jsonl`, 'utf8');
  assert.equal(audit.trim().split('\n').length, 2);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).audit.length, 2);
  assert.equal((await reopened.request(admin)).status, 'approved');
});

test('a failed legacy audit mirror cannot leave a decision applied but reported as failed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'river-oaks-waitlist-audit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'waitlist.json');
  const waitlist = await createFileWaitlist(file, { admins: ['admin'] });
  await waitlist.request({ userId: 'visitor', name: 'Visitor' });
  await mkdir(`${file}.audit.jsonl`);
  assert.equal((await waitlist.decide({ userId: 'visitor', approved: true, actorId: 'admin' })).status, 'approved');
  const stored = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(stored.audit.length, 1);
  assert.equal(await (await createFileWaitlist(file)).isApproved('visitor'), true);
});

test('Redis waitlist decisions survive instances and concurrent requests', { skip: !process.env.REDIS_URL }, async t => {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on('error', () => {});
  await redis.connect();
  const prefix = `{river-oaks:waitlist:test:${randomUUID()}}`;
  t.after(async () => { await redis.del(`${prefix}:waitlist:users`, `${prefix}:waitlist:audit`); await redis.quit(); });
  const first = createRedisWaitlist({ redis, prefix, admins: ['admin'] });
  const second = createRedisWaitlist({ redis, prefix, admins: ['admin'] });
  const identity = { userId: 'visitor', name: 'Visitor', email: 'visitor@example.com' };
  const requests = await Promise.all([first.request(identity), second.request(identity)]);
  assert.deepEqual(requests, [requests[0], requests[0]]);
  assert.equal(requests[0].status, 'pending');
  assert.equal(await second.isApproved('visitor'), false);
  assert.equal(await first.isApproved('admin'), true);
  assert.equal((await second.list())[0].email, identity.email);
  assert.equal((await first.decide({ userId: 'visitor', approved: true, actorId: 'admin' })).status, 'approved');
  assert.equal(await second.isApproved('visitor'), true);
  assert.equal((await second.decide({ userId: 'visitor', approved: false, actorId: 'admin' })).status, 'rejected');
  assert.equal(await first.isApproved('visitor'), false);
  assert.equal((await redis.lrange(`${prefix}:waitlist:audit`, 0, -1)).length, 2);
});
