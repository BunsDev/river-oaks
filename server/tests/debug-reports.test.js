import test from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import { createGameServer } from '../app.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { createMemoryDebugReports, createRedisDebugReports, validDebugReport, MAX_DEBUG_REPORT_BYTES } from '../debug-reports.js';

const report = (overrides = {}) => ({ schema: 'river-oaks.debug-report', version: 1, id: 'client-id', createdAt: '2026-10-09T15:00:00.000Z', description: 'Dior went black',
  app: { version: '0.1.6', commit: 'abc123', path: '/play' }, environment: { browser: 'Chrome 126' }, errors: [{ type: 'error', message: 'TypeError: boom' }], console: [], network: [], breadcrumbs: [], ...overrides });

test('reports are validated at the envelope and bounded in size', () => {
  assert.ok(validDebugReport(report()));
  for (const bad of [null, [], report({ schema: 'other' }), report({ version: 2 }), report({ description: 'x'.repeat(2001) }), report({ createdAt: 'yesterday' }),
    report({ app: null }), report({ errors: 'boom' }), report({ screenshot: 'javascript:alert(1)' }), report({ screenshot: `data:image/jpeg;base64,${'A'.repeat(140_001)}` })]) assert.equal(validDebugReport(bad), null);
  assert.ok(validDebugReport(report({ screenshot: 'data:image/jpeg;base64,AAAA' })));
});

test('the store keeps the newest reports, drops old ones, and summarises without the payload', async () => {
  let now = Date.parse('2026-10-09T15:00:00Z'), n = 0;
  const store = createMemoryDebugReports({ now: () => now, createId: () => `report-${++n}`, limit: 3, ttl: 86_400_000 });
  for (let i = 0; i < 4; i++) await store.add(report({ description: `report ${i}` }), { userId: 'u', name: 'Ana' });
  const list = await store.list();
  assert.deepEqual(list.map(item => item.description), ['report 3', 'report 2', 'report 1']);
  assert.equal(list[0].errors, 1); assert.equal(list[0].firstError, 'TypeError: boom'); assert.equal(list[0].reporter.name, 'Ana'); assert.equal('report' in list[0], false);
  assert.equal((await store.get('report-4')).report.description, 'report 3');
  now += 2 * 86_400_000;
  assert.deepEqual(await store.list(), []);
});

const auth = { async handle() { return false; }, async authenticate(req) { const id = req.headers.cookie?.match(/session=(\w+)/)?.[1]; return id ? { userId: id, name: id, sessionId: id, csrfToken: 'test-csrf' } : null; } };
async function server(t) {
  const world = { players: new Map(), join() { return { ok: true }; }, leave() {}, command() { return { ok: true }; }, step() {}, snapshot() { return { type: 'snapshot', players: [] }; }, worldId: 'river-oaks' };
  const app = createGameServer({ auth, world, waitlist: approvedWaitlist, waitlistAdmins: ['admin'], origin: 'http://127.0.0.1', staticRoot: '/nonexistent' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  return `http://127.0.0.1:${app.server.address().port}`;
}
const send = (origin, body, { user = 'ana', csrf = 'test-csrf', from = 'http://127.0.0.1', type = 'application/json' } = {}) => fetch(`${origin}/api/debug-reports`, {
  method: 'POST', headers: { Cookie: user ? `session=${user}` : '', Origin: from, 'X-CSRF-Token': csrf, 'Content-Type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('signed-in players send reports; only admins list and download them', async t => {
  const origin = await server(t);
  assert.equal((await send(origin, report(), { user: null })).status, 401);
  assert.equal((await send(origin, report(), { csrf: 'forged' })).status, 403);
  assert.equal((await send(origin, report(), { from: 'https://evil.example' })).status, 403);
  // Malformed attempts count toward the sending limit too, so they come from another account.
  assert.equal((await send(origin, report(), { type: 'text/plain', user: 'probe' })).status, 415);
  assert.equal((await send(origin, '{not json', { user: 'probe' })).status, 400);
  assert.equal((await send(origin, report({ schema: 'other' }), { user: 'probe' })).status, 400);
  assert.equal((await send(origin, 'x'.repeat(MAX_DEBUG_REPORT_BYTES + 1), { user: 'probe2' })).status, 413);
  const sent = await send(origin, report());
  assert.equal(sent.status, 200);
  const { id } = await sent.json();
  assert.match(id, /^[\w-]{8,}$/);
  const get = (path, user) => fetch(`${origin}${path}`, { headers: { Cookie: `session=${user}` } });
  assert.equal((await get('/api/debug-reports', 'ana')).status, 403);
  assert.equal((await get(`/api/debug-reports/get?id=${id}`, 'ana')).status, 403);
  const listed = await (await get('/api/debug-reports', 'admin')).json();
  assert.equal(listed.reports.length, 1);
  assert.deepEqual({ name: listed.reports[0].reporter.name, description: listed.reports[0].description }, { name: 'ana', description: 'Dior went black' });
  const full = await get(`/api/debug-reports/get?id=${id}`, 'admin');
  assert.equal(full.status, 200);
  assert.match(full.headers.get('content-disposition'), /attachment; filename="river-oaks-report-/);
  assert.equal((await full.json()).report.errors[0].message, 'TypeError: boom');
  assert.equal((await get('/api/debug-reports/get?id=missing-report-id', 'admin')).status, 404);
  assert.equal((await fetch(`${origin}/api/debug-reports`, { method: 'DELETE', headers: { Cookie: 'session=admin' } })).status, 405);
});

test('one account can send only a few reports in ten minutes', async t => {
  const origin = await server(t);
  for (let i = 0; i < 3; i++) assert.equal((await send(origin, report(), { user: 'busy' })).status, 200);
  assert.equal((await send(origin, report(), { user: 'busy' })).status, 429);
  assert.equal((await send(origin, report(), { user: 'other' })).status, 200);
});

test('Redis keeps reports newest first, trimmed to the limit', { skip: !process.env.REDIS_URL }, async t => {
  const redis = new Redis(process.env.REDIS_URL); redis.on('error', () => {});
  const prefix = `{debug-reports-test-${process.pid}-${Date.now()}}`;
  t.after(async () => { await redis.del(`${prefix}:debug-reports`); redis.disconnect(); });
  let n = 0;
  const store = createRedisDebugReports({ redis, prefix, limit: 2, createId: () => `report-${++n}` });
  for (let i = 0; i < 3; i++) await store.add(report({ description: `report ${i}` }), { userId: 'u', name: 'Ana' });
  assert.deepEqual((await store.list()).map(item => item.description), ['report 2', 'report 1']);
  assert.equal((await store.get('report-3')).report.description, 'report 2');
  assert.ok(await redis.pttl(`${prefix}:debug-reports`) > 0);
});
