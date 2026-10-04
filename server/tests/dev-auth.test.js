import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevAuth, devAuthAllowed } from '../dev-auth.js';
import { chooseAuth, workosConfigured } from '../town.js';

const origin = 'http://127.0.0.1:5173';
function exchange(auth, path, { method = 'GET', cookie, headers = {} } = {}) {
  const req = { url: path, method, headers: { ...headers, ...(cookie ? { cookie } : {}) } };
  const res = { status: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    writeHead(status, extra = {}) { this.status = status; for (const [k, v] of Object.entries(extra)) this.setHeader(k, v); }, end(body = '') { this.body = body; } };
  return auth.handle(req, res).then(handled => ({ handled, res, json: res.body.startsWith('{') ? JSON.parse(res.body) : null }));
}
const cookieOf = res => res.headers['set-cookie'].split(';')[0];

test('development identities only on loopback http outside production and Vercel', () => {
  const fixture = { RIVER_OAKS_ACCEPTANCE_FIXTURE: '1' };
  assert.equal(devAuthAllowed({ origin, env: {} }), false);
  assert.equal(devAuthAllowed({ origin, env: fixture }), true);
  assert.equal(devAuthAllowed({ origin: 'http://localhost:5173', env: fixture }), true);
  for (const [value, env] of [['https://sim.jev.works', fixture], ['http://192.168.1.4:5173', fixture], [origin, { ...fixture, NODE_ENV: 'production' }], [origin, { ...fixture, VERCEL: '1' }], [origin, { RIVER_OAKS_DEV_AUTH: 'off' }], ['not a url', fixture]]) {
    assert.equal(devAuthAllowed({ origin: value, env }), false, `${value} ${JSON.stringify(env)}`);
  }
  assert.throws(() => createDevAuth({ origin: 'https://sim.jev.works', env: fixture }), /loopback/);
});

test('the town picks WorkOS when configured and never falls back to dev identities in production', () => {
  const keys = { WORKOS_API_KEY: 'sk', WORKOS_CLIENT_ID: 'client', WORKOS_COOKIE_PASSWORD: 'x'.repeat(32) };
  assert.equal(workosConfigured(keys), true);
  assert.equal(workosConfigured({ ...keys, WORKOS_COOKIE_PASSWORD: 'short' }), false);
  assert.equal(chooseAuth({ env: {}, origin }), 'workos', 'development requires WorkOS by default');
  assert.equal(chooseAuth({ env: keys, origin }), 'workos', 'configured WorkOS wins in auto');
  assert.equal(chooseAuth({ env: keys, origin, devAuth: 'local' }), 'workos', 'local identities require explicit acceptance fixture');
  assert.equal(chooseAuth({ env: { ...keys, RIVER_OAKS_ACCEPTANCE_FIXTURE: '1' }, origin, devAuth: 'local' }), 'local');
  assert.equal(chooseAuth({ env: { RIVER_OAKS_DEV_AUTH: 'workos' }, origin, devAuth: 'local' }), 'workos', 'WorkOS in dev is opt-in');
  assert.equal(chooseAuth({ env: {}, origin: 'https://sim.jev.works' }), 'workos', 'a public origin fails closed');
  assert.equal(chooseAuth({ env: { NODE_ENV: 'production' }, origin, devAuth: 'local' }), 'workos');
});

test('each browser gets its own development resident without a sign-in step', async () => {
  const auth = createDevAuth({ origin, env: { RIVER_OAKS_ACCEPTANCE_FIXTURE: '1' } });
  const first = await exchange(auth, '/auth/session');
  assert.equal(first.handled, true);
  assert.equal(first.json.authenticated, true);
  assert.equal(first.json.development, true);
  assert.equal(first.json.canGrantWishes, true, 'the local development owner has Jevica privileges');
  const cookie = cookieOf(first.res);
  assert.match(first.res.headers['set-cookie'], /HttpOnly; SameSite=Lax/);
  const again = await exchange(auth, '/auth/session', { cookie });
  assert.equal(again.json.user.id, first.json.user.id, 'the cookie keeps the same resident');
  const other = await exchange(auth, '/auth/session');
  assert.notEqual(other.json.user.id, first.json.user.id, 'a second browser is a second player');
  assert.equal(other.json.canGrantWishes, false, 'another development browser cannot grant wishes');
  const identity = await auth.authenticate({ headers: { cookie } });
  assert.equal(identity.userId, first.json.user.id);
  assert.equal(await auth.authenticate({ headers: {} }), null);
  assert.equal((await exchange(auth, '/api/other')).handled, false);
  const login = await exchange(auth, '/auth/login');
  assert.equal(login.res.status, 302);
});

test('development logout still checks origin and CSRF', async () => {
  let loggedOut = null;
  const auth = createDevAuth({ origin, env: { RIVER_OAKS_ACCEPTANCE_FIXTURE: '1' }, onLogout: id => { loggedOut = id; } });
  const session = await exchange(auth, '/auth/session'), cookie = cookieOf(session.res);
  assert.equal((await exchange(auth, '/auth/logout', { method: 'POST', cookie, headers: { origin: 'http://evil.test', 'x-csrf-token': session.json.csrfToken } })).res.status, 403);
  assert.equal((await exchange(auth, '/auth/logout', { method: 'POST', cookie, headers: { origin, 'x-csrf-token': 'wrong' } })).res.status, 403);
  const done = await exchange(auth, '/auth/logout', { method: 'POST', cookie, headers: { origin, 'x-csrf-token': session.json.csrfToken } });
  assert.equal(done.res.status, 200);
  assert.equal(loggedOut, session.json.user.id);
  assert.equal(await auth.authenticate({ headers: { cookie } }), null);
});
