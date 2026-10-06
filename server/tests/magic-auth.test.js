import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import Redis from 'ioredis';
import { createAuth } from '../auth.js';
import { workosSdkFixture, boundaryCases } from './workos-sdk-fixture.js';
import { createRedisAuth } from '../redis-auth.js';
const config = { apiKey: 'sk_test', clientId: 'client_test', cookiePassword: 'a'.repeat(32), origin: 'https://river.example' };
const cookie = (r, name = 'river_oaks_magic_state') => r.headers.getSetCookie().find(v => v.startsWith(`${name}=`))?.split(';')[0];
async function fixture(t, mode, overrides = {}) {
  let time = Date.now(), identityCalls = 0, calls = 0, attempts = 0, failSend = null, failVerify = null, claimsOverride = {}, userOverride = {}, verifying;
  const user = () => ({ id: 'user_email', email: 'private@example.com', emailVerified: true, ...userOverride });
  const session = () => ({ authenticated: true, authenticationMethod: 'MagicAuth', sessionId: 'session_email', user: user(), accessToken: `h.${Buffer.from(JSON.stringify({ iss: 'https://api.workos.com', client_id: config.clientId, sid: 'session_email', sub: 'user_email', exp: Math.floor(time / 1000) + 300, ...claimsOverride })).toString('base64url')}.s` });
  const workos = { userManagement: {
    async createMagicAuth({ email }) { calls++; assert.equal(email, 'private@example.com'); if (failSend) throw failSend; return { code: '123456', email }; },
    async authenticateWithMagicAuth(options) { attempts++; assert.equal(options.email, 'private@example.com'); assert.equal(options.clientId, config.clientId); assert.deepEqual(options.session, { sealSession: true, cookiePassword: config.cookiePassword }); if (verifying) await verifying; if (failVerify) throw failVerify; if (options.code !== '123456') throw { status: 400 }; return { ...session(), sealedSession: 'sealed-private-session' }; },
    async authenticateWithRefreshToken({ refreshToken }) { assert.equal(refreshToken, 'private-desktop-refresh'); return { ...session(), sealedSession: 'sealed-private-session' }; },
    loadSealedSession() { return { authenticate: async () => session() }; },
    getUserIdentities() { identityCalls++; throw new Error('Email sessions must never query GitHub'); },
  } };
  const prefix = `{magic-test:${randomUUID()}}`, clients = [], auths = [], servers = [];
  if (mode === 'redis') { for (let i = 0; i < 2; i++) clients.push(new Redis(process.env.REDIS_URL)); await Promise.all(clients.map(c => c.ping())); }
  t.after(async () => { for (const a of auths) a.close(); for (const s of servers) { s.closeAllConnections(); await new Promise(r => s.close(r)); } if (clients.length) { const keys = await clients[0].keys(`${prefix}:auth:*`); if (keys.length) await clients[0].del(...keys); await Promise.all(clients.map(c => c.quit())); } });
  const requests = [];
  for (let i = 0; i < (mode === 'redis' ? 2 : 1); i++) {
    const auth = (mode === 'redis' ? createRedisAuth : createAuth)({ ...config, workos, now: () => time, redis: clients[i], prefix, ...overrides }); auths.push(auth);
    const server = createServer(async (req, res) => { if (!await auth.handle(req, res)) { res.writeHead(404); res.end(); } }); servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    requests.push((path, body, state, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json', ...(state ? { Cookie: state } : {}), ...headers }, body: JSON.stringify(body), redirect: 'manual' }));
  }
  return { request: requests[0], peer: requests.at(-1), calls: () => calls, identityCalls: () => identityCalls, attempts: () => attempts, advance: ms => time += ms, failSend: e => failSend = e, failVerify: e => failVerify = e, claims: c => claimsOverride = c, user: u => userOverride = u, hold: p => verifying = p };
}
for (const mode of ['memory', 'redis']) {
  const run = (name, fn) => test(`${mode} magic auth: ${name}`, { skip: mode === 'redis' && !process.env.REDIS_URL }, fn);
  run('sends normalized email, seals verified session without exposing email or code, consumes once', async t => {
    const f = await fixture(t, mode), sent = await f.request('/auth/email/start', { email: ' PRIVATE@EXAMPLE.COM ' });
    assert.equal(sent.status, 200); assert.deepEqual(await sent.json(), { sent: true });
    assert.match(sent.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    const state = cookie(sent); assert.ok(state);
    assert.equal((await f.peer('/auth/email/verify', { code: '123456' })).status, 400);
    const verified = await f.peer('/auth/email/verify', { code: '123456' }, state);
    assert.equal(verified.status, 200); assert.deepEqual(await verified.json(), { authenticated: true, redirectTo: '/' }); assert.ok(cookie(verified, 'river_oaks_session'));
    assert.equal((await f.request('/auth/email/verify', { code: '123456' }, state)).status, 400);
    assert.equal(f.attempts(), 1);
    const profile = await f.peer('/auth/session', undefined, cookie(verified, 'river_oaks_session'));
    const data = await profile.json(); assert.equal(data.user.name, 'resident');
    assert.equal(JSON.stringify(data).includes('private@'), false); assert.equal(f.identityCalls(), 0);
  });
  run('desktop exchange accepts only verified Magic Auth and keeps identity generic', async t => {
    const f = await fixture(t, mode);
    const accepted = await f.request('/auth/desktop/exchange', { refreshToken: 'private-desktop-refresh' }); assert.equal(accepted.status, 200);
    const profile = await f.peer('/auth/session', undefined, cookie(accepted, 'river_oaks_session'));
    const data = await profile.json(); assert.equal(data.user.name, 'resident'); assert.equal(f.identityCalls(), 0);
    f.user({ emailVerified: false }); assert.equal((await f.peer('/auth/desktop/exchange', { refreshToken: 'private-desktop-refresh' })).status, 403);
  });
  run('cooldown is shared and case normalized; expired state cannot authenticate', async t => {
    const f = await fixture(t, mode), start = await f.request('/auth/email/start', { email: 'private@example.com' });
    const otherBrowser = await f.peer('/auth/email/start', { email: 'PRIVATE@example.com' });
    assert.equal(otherBrowser.status, 200);
    assert.deepEqual(await otherBrowser.json(), { sent: false, retryAfter: 60 });
    assert.equal(cookie(otherBrowser), undefined);
    const sameBrowser = await f.request('/auth/email/start', { email: 'private@example.com' }, cookie(start));
    assert.deepEqual(await sameBrowser.json(), { sent: false, retryAfter: 60 });
    assert.equal(cookie(sameBrowser), undefined); assert.equal(f.calls(), 1);
    f.advance(600001); assert.equal((await f.peer('/auth/email/verify', { code: '123456' }, cookie(start))).status, 400);
    await f.peer('/auth/email/start', { email: 'private@example.com' }); assert.equal(f.calls(), 2);
  });
  run('at most five exchange attempts even across peers', async t => {
    const f = await fixture(t, mode), state = cookie(await f.request('/auth/email/start', { email: 'private@example.com' }));
    for (let i = 0; i < 5; i++) assert.equal((await f.peer('/auth/email/verify', { code: '999999' }, state)).status, 400);
    assert.equal((await f.request('/auth/email/verify', { code: '123456' }, state)).status, 429); assert.equal(f.attempts(), 5);
  });
  run('concurrent success creates only one session', async t => {
    const f = await fixture(t, mode), state = cookie(await f.request('/auth/email/start', { email: 'private@example.com' }));
    let release; f.hold(new Promise(r => release = r));
    const first = f.request('/auth/email/verify', { code: '123456' }, state);
    for (let i = 0; !f.attempts() && i < 200; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(f.attempts(), 1);
    const second = await f.peer('/auth/email/verify', { code: '123456' }, state); assert.equal(second.status, 429);
    release(); assert.equal((await first).status, 200); assert.equal(f.attempts(), 1);
  });
  run('an exchange cannot issue a session after its browser state expires', async t => {
    const f = await fixture(t, mode), state = cookie(await f.request('/auth/email/start', { email: 'private@example.com' }));
    let release; f.hold(new Promise(r => release = r));
    const exchange = f.peer('/auth/email/verify', { code: '123456' }, state);
    for (let i = 0; !f.attempts() && i < 200; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(f.attempts(), 1); f.advance(600001); release();
    const response = await exchange; assert.equal(response.status, 400); assert.equal(cookie(response, 'river_oaks_session'), undefined);
  });
  run('verification transport failure returns 503 and permits a bounded retry', async t => {
    const f = await fixture(t, mode), state = cookie(await f.request('/auth/email/start', { email: 'private@example.com' }));
    f.failVerify({ status: 503 }); assert.equal((await f.peer('/auth/email/verify', { code: '123456' }, state)).status, 503);
    f.failVerify(null); assert.equal((await f.peer('/auth/email/verify', { code: '123456' }, state)).status, 200); assert.equal(f.attempts(), 2);
  });
  run('validates origin, content type and input before sending', async t => {
    const f = await fixture(t, mode);
    assert.equal((await f.request('/auth/email/start', { email: 'private@example.com' }, null, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await f.request('/auth/email/start', { email: 'private@example.com' }, null, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await f.request('/auth/email/start', { email: 'invalid' })).status, 400);
    assert.equal((await f.request('/auth/email/start', { email: 'a'.repeat(5000) })).status, 413); assert.equal(f.calls(), 0);
  });
  run('does not enumerate provider rejection but retains transport failures', async t => {
    const f = await fixture(t, mode); f.failSend({ status: 400 }); const rejected = await f.request('/auth/email/start', { email: 'private@example.com' }); assert.equal(rejected.status, 200); assert.deepEqual(await rejected.json(), { sent: true });
    f.advance(60001); f.failSend({ status: 503 }); assert.equal((await f.peer('/auth/email/start', { email: 'private@example.com' })).status, 503);
  });
  for (const [label, claims, user] of [['issuer', { iss: 'https://evil.example' }, {}], ['client', { client_id: 'other' }, {}], ['subject', { sub: 'other' }, {}], ['session', { sid: 'other' }, {}], ['unverified', {}, { emailVerified: false }]]) run(`rejects ${label} mismatch`, async t => {
    const f = await fixture(t, mode); f.claims(claims); f.user(user); const state = cookie(await f.request('/auth/email/start', { email: 'private@example.com' }));
    const r = await f.peer('/auth/email/verify', { code: '123456' }, state); assert.equal(r.status, 403); assert.equal(cookie(r, 'river_oaks_session'), undefined);
  });
}

for (const mode of ['memory', 'redis']) test(`${mode} magic store caps admission and atomically reserves cooldown`, { skip: mode === 'redis' && !process.env.REDIS_URL }, async t => {
  const { createMagicStore } = await import('../magic-auth.js');
  const namespace = `{magic-store:${randomUUID()}}`;
  const redis = mode === 'redis' ? new Redis(process.env.REDIS_URL) : undefined;
  if (redis) await redis.ping();
  let time = Date.now();
  const store = createMagicStore({ redis, namespace, now: () => time, maxStates: 2 });
  t.after(async () => { store.close(); if (redis) { const keys = await redis.keys(`${namespace}:auth:*`); if (keys.length) await redis.del(...keys); await redis.quit(); } });
  const start = (id, emailHash = id) => store.transaction({ op: 'start', id, emailHash, record: { email: `${id}@example.com`, attempts: 0, expiresAt: time + 600000 } });
  assert.deepEqual((await Promise.all([start('a'), start('b', 'a')])).sort(), ['cooldown', 'ok']);
  assert.equal(await start('c'), 'ok'); assert.equal(await start('d'), 'full');
  time += 600001; assert.equal(await start('d'), 'ok');
});

for (const mode of ['memory', 'redis']) {
  for (const scenario of boundaryCases) test(`${mode} Magic Auth real SDK: ${scenario.name}`, { skip: mode === 'redis' && !process.env.REDIS_URL }, async t => {
    const { sdk, requests } = await workosSdkFixture(t, config, { ...scenario, authenticationMethod: 'MagicAuth' });
    const f = await fixture(t, mode, { workos: sdk });
    const sent = await f.request('/auth/email/start', { email: 'private@example.com' }); assert.equal(sent.status, 200);
    const verified = await f.peer('/auth/email/verify', { code: '123456' }, cookie(sent));
    assert.equal(verified.status, scenario.status === 302 ? 200 : scenario.status);
    assert.equal(requests.some(r => r.endsWith('/identities')), false);
    if (verified.status === 200) {
      const profile = await f.peer('/auth/session', undefined, cookie(verified, 'river_oaks_session'));
      assert.equal((await profile.json()).user.name, 'resident');
    } else assert.equal(cookie(verified, 'river_oaks_session'), undefined);
  });
}
