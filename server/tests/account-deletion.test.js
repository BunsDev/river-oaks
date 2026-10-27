import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { accountDeletionEnabled, createAccountDeletionRoute, DELETION_PHRASE, RECENT_SIGN_IN_MS } from '../account-deletion.js';
import { createAccountErasure, createMemoryPendingErasures } from '../account-erasure.js';
import { createLocalChauffeurSecurity } from '../chauffeur.js';
import { createAuth } from '../auth.js';
import { createRedisAuth } from '../redis-auth.js';
import { createRedisSecurity } from '../redis-security.js';
import { createRedisBackend } from '../redis-backend.js';
import { createAuthAdapter } from './redis-auth-fixture.js';
import { createGitHubFixture } from './github-fixture.js';

// In-app account deletion (#292): the route's refusals and order with a stand-in sign-in,
// then both WorkOS session stores with the WorkOS boundary faked and everything else real.
const origin = 'https://river.example';
async function serve(t, handler) {
  const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { redirect: 'manual', ...options });
}
const ask = (request, { cookie = 'session', csrf = 'csrf', from = origin, body = { confirm: DELETION_PHRASE }, raw } = {}) => request('/api/account/delete', {
  method: 'POST', headers: { Origin: from, Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body) });

async function harness(t, { enabled = true, provider = async () => {}, erase = async () => {} } = {}) {
  let time = 1_000_000_000;
  const calls = [], user = { userId: 'erin', csrfToken: 'csrf', signedInAt: time - 60_000 };
  const auth = { authenticate: async req => req.headers.cookie === 'session' ? { ...user } : null,
    deleteProviderUser: async id => { calls.push(['provider', id]); await provider(id); },
    clearSession: res => { calls.push(['signed out']); res.setHeader('Set-Cookie', 'session=; Max-Age=0'); } };
  const security = createLocalChauffeurSecurity({ isBanned: async () => false, now: () => time });
  const route = createAccountDeletionRoute({ enabled, auth, security, origin, now: () => time,
    eraseAccount: async id => { calls.push(['erased', id]); await erase(id); } });
  return { request: await serve(t, route), calls, user, advance: ms => { time += ms; } };
}

test('with the flag off the control stays hidden and there is no deletion route', async t => {
  const { request, calls } = await harness(t, { enabled: false });
  assert.deepEqual(await (await request('/api/account/delete', { headers: { Cookie: 'session' } })).json(), { available: false });
  assert.equal((await ask(request)).status, 404);
  assert.deepEqual(calls, []);
  assert.throws(() => createAccountDeletionRoute({ enabled: true, auth: { authenticate() {} }, origin, eraseAccount: async () => {} }), /Invalid account deletion/);
});

test('every refusal leaves the account alone', async t => {
  const { request, calls, advance } = await harness(t);
  assert.deepEqual(await (await request('/api/account/delete')).json(), { available: false }, 'signed out');
  assert.deepEqual(await (await request('/api/account/delete', { headers: { Cookie: 'session' } })).json(), { available: true, recent: true });
  assert.equal((await request('/api/account/delete', { method: 'PUT', headers: { Cookie: 'session' } })).status, 405);
  assert.equal((await ask(request, { cookie: 'someone-else' })).status, 401);
  assert.equal((await ask(request, { from: 'https://elsewhere.example' })).status, 403);
  assert.equal((await ask(request, { csrf: 'guess' })).status, 403);
  assert.equal((await ask(request, { body: { confirm: 'Delete my account' } })).status, 400, 'the phrase is exact');
  assert.equal((await ask(request, { raw: JSON.stringify({ confirm: DELETION_PHRASE, pad: 'x'.repeat(300) }) })).status, 400, 'a large body is refused');
  advance(RECENT_SIGN_IN_MS);
  assert.deepEqual(await (await request('/api/account/delete', { headers: { Cookie: 'session' } })).json(), { available: true, recent: false });
  const stale = await ask(request);
  assert.equal(stale.status, 403);assert.equal((await stale.json()).reason, 'sign_in_again');
  assert.deepEqual(calls, []);
});

test('deletion asks the provider first, signs the browser out, then erases', async t => {
  const { request, calls } = await harness(t);
  const response = await ask(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, complete: true });
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual(calls, [['provider', 'erin'], ['signed out'], ['erased', 'erin']], 'once: the erasure\'s own second pass follows a minute later');
});

test('when the provider cannot delete the account, nothing is erased and the session stays', async t => {
  const { request, calls } = await harness(t, { provider: async () => { throw new Error('WorkOS unavailable'); } });
  const response = await ask(request);
  assert.equal(response.status, 502);assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(calls, [['provider', 'erin']]);
});

test('when erasure fails after the provider deleted the account, the browser is still signed out and told', async t => {
  const { request, calls } = await harness(t, { erase: async () => { throw new Error('a store is down'); } });
  const response = await ask(request);
  assert.equal(response.status, 503);
  assert.deepEqual((({ deleted, complete }) => ({ deleted, complete }))(await response.json()), { deleted: true, complete: false });
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual(calls, [['provider', 'erin'], ['signed out'], ['erased', 'erin']]);
});

test('an account can try three times an hour', async t => {
  const { request, advance } = await harness(t);
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await ask(request, { body: { confirm: 'no' } })).status);
  assert.deepEqual(statuses, [400, 400, 400, 429]);
  advance(3_600_000);
  assert.equal((await ask(request, { body: { confirm: 'no' } })).status, 400, 'the limit lifts after an hour');
});

// WorkOS session stores. The fake WorkOS keeps sealed sessions, codes and refreshes, and here
// deletes users; HTTP, cookies, CSRF, Redis transactions and erasure are real.
function provider(workos) {
  const deleted = [];let failure = null;
  workos.userManagement.deleteUser = async id => { if (failure) throw failure; deleted.push(id); };
  return { deleted, fail: error => { failure = error; } };
}
async function signIn(request, workos, userId) {
  workos.setUserId(userId);
  const login = await request('/auth/login');
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const stateCookie = login.headers.getSetCookie().find(value => value.startsWith('river_oaks_auth_state=')).split(';')[0];
  const callback = await request(`/auth/callback?code=code&state=${state}`, { headers: { Cookie: stateCookie } });
  assert.equal(callback.status, 302);
  return callback.headers.getSetCookie().find(value => value.startsWith('river_oaks_session=')).split(';')[0];
}
// /auth/session refreshes an expired access token, as the client does before deleting.
async function session(request, cookie) {
  const response = await request('/auth/session', { headers: { Cookie: cookie } });
  const fresh = response.headers.getSetCookie().find(value => value.startsWith('river_oaks_session='))?.split(';')[0];
  return { ...await response.json(), cookie: fresh && !fresh.endsWith('=') ? fresh : cookie };
}
async function sessionStore(t, kind) {
  let time = Date.now();
  const now = () => time, workos = createAuthAdapter(now), deletion = provider(workos), github = createGitHubFixture({ 1001: 'erin-dev', 1002: 'pat-dev', 1003: 'kim-dev' });
  workos.githubIds.user_3 = '1003';
  const erased = [], tombstones = new Set();
  const options = { apiKey: 'sk_test', clientId: 'client_test', cookiePassword: 'a'.repeat(32), workos, githubFetch: github.fetcher, now, accountActive: async id => !tombstones.has(id) };
  let auth, security;
  if (kind === 'redis') {
    const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
    const prefix = `{river-oaks:test-deletion:${randomUUID()}}`;
    t.after(async () => { auth.close();security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
    auth = createRedisAuth({ ...options, origin, redis, prefix });security = createRedisSecurity({ redis, prefix });
  } else {
    auth = createAuth({ ...options, origin: 'http://localhost:3000' });t.after(() => auth.close());
    security = createLocalChauffeurSecurity({ isBanned: async () => false, now });
  }
  const base = kind === 'redis' ? origin : 'http://localhost:3000';
  const eraseAccount = createAccountErasure({ tombstone: async id => { tombstones.add(id); }, revoke: id => auth.revokeUser(id), steps: { stores: async id => { erased.push(id); } },
    pending: createMemoryPendingErasures(), now });
  const route = createAccountDeletionRoute({ enabled: true, auth, security, origin: base, eraseAccount, now });
  const request = await serve(t, async (req, res) => await auth.handle(req, res) || await route(req, res));
  const remove = (current, body = { confirm: DELETION_PHRASE }) => request('/api/account/delete', { method: 'POST',
    headers: { Origin: base, Cookie: current.cookie, 'X-CSRF-Token': current.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const status = async current => (await request('/api/account/delete', { headers: { Cookie: current.cookie } })).json();
  return { request, base, workos, deletion, erased, eraseAccount, remove, status, advance: ms => { time += ms; } };
}
for (const kind of ['single-process', 'redis']) {
  test(`${kind} sessions keep their sign-in time through refreshes, and WorkOS deletes the user before erasure`, { skip: kind === 'redis' && !process.env.REDIS_URL }, async t => {
    const { request, base, workos, deletion, erased, eraseAccount, remove, status, advance } = await sessionStore(t, kind);
    let erin = await session(request, await signIn(request, workos, 'user_1'));
    assert.deepEqual(await status(erin), { available: true, recent: true });
    // The access token lasts five minutes; a refresh is not a new sign-in.
    const before = erin.cookie, refreshes = workos.calls.refresh;
    advance(6 * 60_000);
    // The route itself never refreshes, so the client asks for the session first.
    assert.deepEqual(await status(erin), { available: false }, 'an expired access token alone');
    erin = await session(request, erin.cookie);assert.equal(erin.authenticated, true);
    assert.ok(workos.calls.refresh > refreshes && erin.cookie !== before, 'the session was refreshed');
    assert.deepEqual(await status(erin), { available: true, recent: true });
    advance(5 * 60_000);erin = await session(request, erin.cookie);assert.equal(erin.authenticated, true);
    assert.deepEqual(await status(erin), { available: true, recent: false }, 'eleven minutes after signing in');
    assert.equal((await remove(erin)).status, 403);assert.deepEqual([deletion.deleted, erased], [[], []]);
    // Signing in again makes the next attempt recent.
    erin = await session(request, await signIn(request, workos, 'user_1'));
    const removed = await remove(erin);
    assert.equal(removed.status, 200);assert.match(removed.headers.getSetCookie().join('\n'), /river_oaks_session=; [^\n]*Max-Age=0/);
    assert.deepEqual([deletion.deleted, erased], [['user_1'], ['user_1']]);
    assert.equal((await session(request, erin.cookie)).authenticated, false, 'every session of the account ended');
    // The request is recorded; a minute later the sweep runs its second pass, for a write already in flight.
    assert.deepEqual(await eraseAccount.sweep(), { finished: 0, failed: 0, waiting: 1 });
    advance(60_000);
    assert.deepEqual(await eraseAccount.sweep(), { finished: 1, failed: 0, waiting: 0 });
    assert.deepEqual(erased, ['user_1', 'user_1']);

    // A user WorkOS no longer has counts as deleted.
    let pat = await session(request, await signIn(request, workos, 'user_2'));
    deletion.fail(Object.assign(new Error('Not found'), { status: 404 }));
    assert.equal((await remove(pat)).status, 200);assert.deepEqual(erased.slice(2), ['user_2']);
    // Any other WorkOS failure erases nothing and keeps the session.
    const kim = await session(request, await signIn(request, workos, 'user_3'));
    deletion.fail(Object.assign(new Error('Server error'), { status: 500 }));
    assert.equal((await remove(kim)).status, 502);
    assert.equal(erased.includes('user_3'), false);assert.equal((await session(request, kim.cookie)).authenticated, true);

    // The desktop shell exchanges its token right after the browser sign-in: that is a sign-in.
    workos.setUserId('user_4');
    const exchanged = await request('/auth/desktop/exchange', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'private-desktop-refresh' }) });
    assert.equal(exchanged.status, 200);
    const desktop = await session(request, exchanged.headers.getSetCookie().find(value => value.startsWith('river_oaks_session=')).split(';')[0]);
    assert.deepEqual(await status(desktop), { available: true, recent: true });
    advance(RECENT_SIGN_IN_MS + 60_000);
    assert.deepEqual(await status(await session(request, desktop.cookie)), { available: true, recent: false });
  });
}

test('the flag turns deletion on only where a failed erasure is retried', t => {
  const warnings = [];t.mock.method(console, 'warn', line => warnings.push(line));
  assert.equal(accountDeletionEnabled({}), false);
  assert.equal(accountDeletionEnabled({ RIVER_OAKS_ACCOUNT_DELETION: 'true', WORKOS_WEBHOOK_SECRET: 'set' }), false, 'only 1 turns it on');
  assert.equal(accountDeletionEnabled({ RIVER_OAKS_ACCOUNT_DELETION: '1', WORKOS_WEBHOOK_SECRET: 'set' }), true);
  assert.equal(accountDeletionEnabled({ RIVER_OAKS_ACCOUNT_DELETION: '1' }, { development: true }), true, 'the loopback fixture has no provider account');
  assert.deepEqual(warnings, []);
  assert.equal(accountDeletionEnabled({ RIVER_OAKS_ACCOUNT_DELETION: '1' }), false, 'no webhook, no retry');
  assert.deepEqual(warnings.map(line => JSON.parse(line)), [{ event: 'account_deletion_off', reason: 'webhook_secret_missing' }]);
  // On Vercel only the cron sweeps, so without its secret no second pass or retry would run.
  warnings.length = 0;
  assert.equal(accountDeletionEnabled({ RIVER_OAKS_ACCOUNT_DELETION: '1', WORKOS_WEBHOOK_SECRET: 'set', VERCEL: '1' }), false);
  assert.deepEqual(warnings.map(line => JSON.parse(line)), [{ event: 'account_deletion_off', reason: 'cron_secret_missing' }]);
  // Vercel calls the cron only on the production deployment, so a preview never sweeps.
  warnings.length = 0;
  for (const VERCEL_ENV of [undefined, 'preview', 'development']) assert.equal(accountDeletionEnabled({ RIVER_OAKS_ACCOUNT_DELETION: '1', WORKOS_WEBHOOK_SECRET: 'set', VERCEL: '1', CRON_SECRET: 'set', VERCEL_ENV }), false, VERCEL_ENV);
  assert.deepEqual(warnings.map(line => JSON.parse(line).reason), ['cron_not_scheduled', 'cron_not_scheduled', 'cron_not_scheduled']);
  assert.equal(accountDeletionEnabled({ RIVER_OAKS_ACCOUNT_DELETION: '1', WORKOS_WEBHOOK_SECRET: 'set', VERCEL: '1', CRON_SECRET: 'set', VERCEL_ENV: 'production' }), true);
});

test('the hosted backend serves the deletion route only with the flag on and the webhook configured', { skip: !process.env.REDIS_URL }, async t => {
  t.mock.method(console, 'warn', () => {});
  const vercel = { VERCEL: '1', CRON_SECRET: 'cron-fixture' };
  for (const [flag, secret, served, extra = {}] of [['', 'webhook-fixture', false], ['1', '', false], ['1', 'webhook-fixture', true],
    ['1', 'webhook-fixture', false, { VERCEL: '1' }], ['1', 'webhook-fixture', false, { ...vercel, VERCEL_ENV: 'preview' }], ['1', 'webhook-fixture', true, { ...vercel, VERCEL_ENV: 'production' }]]) {
    const namespace = `river-oaks:test-deletion-flag:${randomUUID()}`;
    const app = await createRedisBackend({ PUBLIC_ORIGIN: 'http://127.0.0.1', REDIS_URL: process.env.REDIS_URL, REDIS_NAMESPACE: namespace,
      RIVER_OAKS_ACCOUNT_DELETION: flag, WORKOS_WEBHOOK_SECRET: secret, ...extra });
    t.after(async () => {
      await app.close();
      const redis = new Redis(process.env.REDIS_URL);const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit();
    });
    const request = await serve(t, async (req, res) => { app.server.emit('request', req, res); return true; });
    assert.deepEqual(await (await request('/api/account/delete')).json(), { available: false });
    // Without WorkOS credentials nobody is signed in, so the route, when it exists, answers 401.
    assert.equal((await request('/api/account/delete', { method: 'POST', headers: { Origin: 'http://127.0.0.1' } })).status, served ? 401 : 404, `flag ${flag || 'unset'}, webhook ${secret ? 'set' : 'unset'}, ${JSON.stringify(extra)}`);
  }
});

// Erasure's second pass and its retries run only through the sweep: a timer on a
// long-lived backend, the cron on Vercel.
test('the hosted backend sweeps recorded erasures on a timer, except on Vercel', { skip: !process.env.REDIS_URL }, async t => {
  t.mock.method(console, 'warn', () => {});
  for (const [extra, timed] of [[{}, 1], [{ VERCEL: '1', CRON_SECRET: 'cron-fixture', VERCEL_ENV: 'production' }, 0]]) {
    const intervals = [], real = globalThis.setInterval;
    const spy = t.mock.method(globalThis, 'setInterval', (fn, ms, ...rest) => { intervals.push([fn, ms]);return real(fn, ms, ...rest); });
    const namespace = `river-oaks:test-deletion-sweep:${randomUUID()}`;
    const app = await createRedisBackend({ PUBLIC_ORIGIN: 'http://127.0.0.1', REDIS_URL: process.env.REDIS_URL, REDIS_NAMESPACE: namespace,
      RIVER_OAKS_ACCOUNT_DELETION: '1', WORKOS_WEBHOOK_SECRET: 'webhook-fixture', ...extra });
    spy.mock.restore();
    t.after(async () => {
      await app.close();
      const redis = new Redis(process.env.REDIS_URL);const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit();
    });
    let sweeps = 0;app.eraseAccount.sweep = async () => { sweeps++;return { finished: 0, failed: 0, waiting: 0 }; };
    for (const [fn, ms] of intervals) if (ms === 30_000) try { fn(); } catch {}
    assert.equal(sweeps, timed, JSON.stringify(extra));
  }
});
