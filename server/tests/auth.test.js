import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import test from 'node:test';
import { WorkOS } from '@workos-inc/node';
import { boundaryCases, workosSdkFixture } from './workos-sdk-fixture.js';

const module = await import('../auth.js').catch(() => ({}));
const { createAuth } = module;
const config = { apiKey: 'sk_test', clientId: 'client_test', cookiePassword: 'a'.repeat(32), origin: 'http://localhost:3000' };
const cookie = (response, name) => response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`))?.split(';')[0];

function adapter(clock) {
  const sealed = new Map();
  const calls = { codes: [], refresh: 0 };
  let user = { id: 'user_1', firstName: 'Val', lastName: 'Dev', email: 'private@example.com', emailVerified: true };
  let issuer = 'https://api.workos.com', tokenClientId = config.clientId;
  function mint(sessionId = 'session_1') {
    const accessToken = `header.${Buffer.from(JSON.stringify({ iss: issuer, client_id: tokenClientId, sid: sessionId, sub: user.id, exp: Math.floor(clock() / 1000) + 300 })).toString('base64url')}.signature`;
    const sealedSession = randomBytes(32).toString('base64url');
    sealed.set(sealedSession, { authenticated: true, user: { ...user }, sessionId, accessToken });
    return { user: { ...user }, accessToken, refreshToken: 'private-refresh-token', sealedSession };
  }
  return {
    calls,
    setUser(value) { user = { ...user, ...value }; },
    setIssuer(value) { issuer = value; },
    setTokenClientId(value) { tokenClientId = value; },
    userManagement: {
      async getAuthorizationUrlWithPKCE(options) {
        const url = new URL('https://api.workos.com/user_management/authorize');
        for (const [key, value] of Object.entries(options)) url.searchParams.set(key, value);
        const state = randomBytes(32).toString('base64url');
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', 'test-challenge');
        return { url: url.href, state, codeVerifier: 'private-pkce-verifier' };
      },
      async authenticateWithCode(options) {
        calls.codes.push(options);
        assert.equal(options.codeVerifier, 'private-pkce-verifier');
        assert.deepEqual(options.session, { sealSession: true, cookiePassword: config.cookiePassword });
        return mint();
      },
      loadSealedSession({ sessionData }) {
        let data = sealed.get(sessionData);
        return {
          async authenticate() {
            if (!data) return { authenticated: false, reason: 'invalid_session_cookie' };
            const claims = JSON.parse(Buffer.from(data.accessToken.split('.')[1], 'base64url'));
            return claims.exp * 1000 <= clock() ? { authenticated: false, reason: 'invalid_jwt' } : data;
          },
          async refresh() {
            calls.refresh++;
            if (!data) return { authenticated: false };
            const result = mint(data.sessionId);
            data = sealed.get(result.sealedSession);
            return { authenticated: true, sealedSession: result.sealedSession, session: result, user: result.user, sessionId: data.sessionId };
          },
        };
      },
      getLogoutUrl({ sessionId, returnTo }) {
        return `https://api.workos.com/user_management/sessions/logout?session_id=${sessionId}&return_to=${encodeURIComponent(returnTo)}`;
      },
    },
  };
}

async function fixture(t, overrides = {}) {
  assert.equal(typeof createAuth, 'function', 'auth module must export createAuth');
  let time = Date.now();
  const workos = adapter(() => time);
  const loggedOut = [];
  const auth = createAuth({ ...config, workos, now: () => time, onLogout: (...args) => loggedOut.push(args), ...overrides });
  const server = createServer(async (req, res) => {
    if (!await auth.handle(req, res)) { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { auth.close(); server.closeAllConnections(); server.close(); });
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { redirect: 'manual', ...options });
  async function login() {
    const response = await request('/auth/login');
    const state = new URL(response.headers.get('location')).searchParams.get('state');
    const stateCookie = cookie(response, 'river_oaks_auth_state');
    const callback = await request(`/auth/callback?code=code_1&state=${state}`, { headers: { cookie: stateCookie } });
    return { response, callback, state, stateCookie, sessionCookie: cookie(callback, 'river_oaks_session') };
  }
  return { auth, workos, loggedOut, request, login, advance: (ms) => { time += ms; } };
}

test('fails closed without credentials and rejects insecure non-local origins', async (t) => {
  const app = await fixture(t, { apiKey: undefined });
  const response = await app.request('/auth/session');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'auth_unavailable');
  assert.equal(await app.auth.authenticate({ headers: {} }), null);
  const insecure = await fixture(t, { origin: 'http://example.com' });
  assert.equal((await insecure.request('/auth/login')).status, 503);
});

test('completes state-bound PKCE callback and exposes only safe identity and CSRF', async (t) => {
  const app = await fixture(t);
  const { response, callback, sessionCookie } = await app.login();
  assert.equal(response.status, 302);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
  assert.doesNotMatch(response.headers.get('set-cookie'), /Secure/);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/');
  assert.ok(sessionCookie);
  const session = await app.request('/auth/session', { headers: { cookie: sessionCookie } });
  assert.equal(session.headers.get('cache-control'), 'no-store');
  const body = await session.json();
  assert.deepEqual(body.user, { id: 'user_1', name: 'Val Dev' });
  assert.equal(body.authenticated, true);
  assert.match(body.csrfToken, /^[A-Za-z0-9_-]{32,}$/);
  assert.doesNotMatch(JSON.stringify(body), /private|email|accessToken|refreshToken/);
  const identity = await app.auth.authenticate({ headers: { cookie: sessionCookie } });
  assert.equal(identity.sessionId, 'session_1');
  assert.equal(identity.userId, 'user_1');
  assert.ok(identity.expiresAt > Date.now());
});

test('sets Secure cookies on HTTPS', async (t) => {
  const app = await fixture(t, { origin: 'https://river.example' });
  const { response, callback } = await app.login();
  assert.match(response.headers.get('set-cookie'), /Secure/);
  assert.match(callback.headers.get('set-cookie'), /Secure/);
});

test('rejects missing, mismatched, expired, and replayed callback state before code exchange', async (t) => {
  const app = await fixture(t);
  assert.equal((await app.request('/auth/callback?code=x&state=forged')).status, 400);
  const login = await app.request('/auth/login');
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  assert.equal((await app.request(`/auth/callback?code=x&state=${state}`, { headers: { cookie: 'river_oaks_auth_state=forged' } })).status, 400);
  app.advance(11 * 60_000);
  assert.equal((await app.request(`/auth/callback?code=x&state=${state}`, { headers: { cookie: cookie(login, 'river_oaks_auth_state') } })).status, 302);
  assert.equal(app.workos.calls.codes.length, 1);
  const expired = await app.request('/auth/login');
  const expiredState = new URL(expired.headers.get('location')).searchParams.get('state');
  app.advance(21 * 60_000);
  assert.equal((await app.request(`/auth/callback?code=x&state=${expiredState}`, { headers: { cookie: cookie(expired, 'river_oaks_auth_state') } })).status, 400);
  assert.equal(app.workos.calls.codes.length, 1);
  const valid = await app.login();
  assert.equal(valid.callback.status, 302);
  assert.equal((await app.request(`/auth/callback?code=x&state=${valid.state}`, { headers: { cookie: valid.stateCookie } })).status, 400);
  assert.equal(app.workos.calls.codes.length, 2);
});

test('rejects unverified accounts and forged session cookies', async (t) => {
  const app = await fixture(t);
  app.workos.setUser({ emailVerified: false });
  assert.equal((await app.login()).callback.status, 403);
  const response = await app.request('/auth/session', { headers: { cookie: 'river_oaks_session=forged' } });
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(await app.auth.authenticate({ headers: { cookie: 'river_oaks_session=forged' } }), null);
});

test('expires WS identity without refresh but refreshes HTTP sessions with a new cookie', async (t) => {
  const app = await fixture(t);
  const { sessionCookie } = await app.login();
  app.advance(301_000);
  assert.equal(await app.auth.authenticate({ headers: { cookie: sessionCookie } }), null);
  assert.equal(app.workos.calls.refresh, 0);
  const response = await app.request('/auth/session', { headers: { cookie: sessionCookie } });
  assert.equal((await response.json()).authenticated, true);
  assert.ok(cookie(response, 'river_oaks_session'));
  assert.equal(app.workos.calls.refresh, 1);
});

test('logout requires same origin and CSRF, revokes replay and invokes WS invalidation', async (t) => {
  const app = await fixture(t);
  const { sessionCookie } = await app.login();
  const session = await app.request('/auth/session', { headers: { cookie: sessionCookie } });
  const { csrfToken } = await session.json();
  const headers = { cookie: sessionCookie, origin: config.origin, 'x-csrf-token': csrfToken };
  assert.equal((await app.request('/auth/logout', { method: 'POST', headers: { ...headers, origin: 'https://evil.example' } })).status, 403);
  assert.equal((await app.request('/auth/logout', { method: 'POST', headers: { ...headers, 'x-csrf-token': 'forged' } })).status, 403);
  const response = await app.request('/auth/logout', { method: 'POST', headers });
  assert.equal(response.status, 200);
  assert.match((await response.json()).url, /^https:\/\/api\.workos\.com\/user_management\/sessions\/logout/);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual(app.loggedOut, [['user_1', 'session_1']]);
  assert.equal(await app.auth.authenticate({ headers: { cookie: sessionCookie } }), null);
  app.advance(301_000);
  assert.equal((await (await app.request('/auth/session', { headers: { cookie: sessionCookie } })).json()).authenticated, false);
  assert.equal(app.workos.calls.refresh, 0);
});

test('official WorkOS SDK rejects a forged sealed cookie without network access', async (t) => {
  const sdk = new WorkOS(config.apiKey, { clientId: config.clientId });
  const session = sdk.userManagement.loadSealedSession({ sessionData: 'not-a-sealed-session', cookiePassword: config.cookiePassword });
  assert.equal((await session.authenticate()).authenticated, false);
  const app = await fixture(t, { workos: undefined });
  assert.equal(await app.auth.authenticate({ headers: { cookie: 'river_oaks_session=not-a-sealed-session' } }), null);
});

test('rejects a verified token issued for a different WorkOS application', async (t) => {
  const app = await fixture(t);
  app.workos.setTokenClientId('client_other');
  assert.equal((await app.login()).callback.status, 403);
  app.workos.setTokenClientId(config.clientId);
  app.workos.setIssuer('https://wrong.example');
  assert.equal((await app.login()).callback.status, 403);
});

test('accepts a dedicated application token with the environment issuer', async (t) => {
  const app = await fixture(t);
  app.workos.setIssuer('https://api.workos.com/user_management/client_environment');
  const { callback, sessionCookie } = await app.login();
  assert.equal(callback.status, 302);
  assert.deepEqual((await (await app.request('/auth/session', { headers: { cookie: sessionCookie } })).json()).user,
    { id: 'user_1', name: 'Val Dev' });
});

test('bounded login state expires and frees capacity', async (t) => {
  const app = await fixture(t);
  for (let i = 0; i < 1_000; i++) assert.equal((await app.request('/auth/login')).status, 302);
  assert.equal((await app.request('/auth/login')).status, 503);
  app.advance(21 * 60_000);
  assert.equal((await app.request('/auth/login')).status, 302);
});

test('absolute session expiry cannot be extended by refresh', async (t) => {
  const app = await fixture(t);
  const { sessionCookie } = await app.login();
  app.advance(8 * 24 * 60 * 60_000);
  const response = await app.request('/auth/session', { headers: { cookie: sessionCookie } });
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(app.workos.calls.refresh, 0);
});

test('does not leak WorkOS exceptions or authorize mutation through GET', async (t) => {
  const app = await fixture(t);
  app.workos.userManagement.authenticateWithCode = async () => { throw new Error('secret-key-token'); };
  const { callback } = await app.login();
  assert.equal(callback.status, 503);
  assert.deepEqual(await callback.json(), { error: 'auth_unavailable' });
  assert.equal((await app.request('/auth/logout')).status, 405);
});

test('official SDK seals and verifies a signed session through the real HTTP callback', async (t) => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: 'https://api.workos.com', client_id: config.clientId,
    sub: 'user_real_sdk', sid: 'session_real_sdk', exp: Math.floor(Date.now() / 1000) + 300,
  })}`;
  const accessToken = `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}`;
  const sdk = new WorkOS(config.apiKey, { clientId: config.clientId });
  // Replace only remote transport/key retrieval; SDK PKCE, sealing, unsealing,
  // JWT signature verification and response deserialization remain real.
  sdk.post = async (path, body) => {
    assert.equal(path, '/user_management/authenticate');
    assert.equal(body.grant_type, 'authorization_code');
    assert.ok(body.code_verifier.length >= 43);
    return { data: {
      user: { object: 'user', id: 'user_real_sdk', email: 'secret@example.com', email_verified: true,
        first_name: 'Val', last_name: null, profile_picture_url: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      access_token: accessToken, refresh_token: 'secret-refresh', authentication_method: 'Password',
    } };
  };
  sdk.userManagement.getJWKS = async () => async () => publicKey;
  const app = await fixture(t, { workos: sdk });
  const { callback, sessionCookie } = await app.login();
  assert.equal(callback.status, 302);
  const response = await app.request('/auth/session', { headers: { cookie: sessionCookie } });
  assert.deepEqual((await response.json()).user, { id: 'user_real_sdk', name: 'Val' });
  const sealed = decodeURIComponent(sessionCookie.slice(sessionCookie.indexOf('=') + 1));
  assert.equal((await sdk.userManagement.loadSealedSession({ sessionData: sealed, cookiePassword: config.cookiePassword }).authenticate()).authenticated, true);
  const midpoint = Math.floor(sealed.length / 2);
  const tampered = `${sealed.slice(0, midpoint)}${sealed[midpoint] === 'a' ? 'b' : 'a'}${sealed.slice(midpoint + 1)}`;
  assert.equal((await sdk.userManagement.loadSealedSession({ sessionData: tampered, cookiePassword: config.cookiePassword }).authenticate()).authenticated, false);
});

for (const scenario of boundaryCases) {
  test(`real SDK application key boundary: ${scenario.name}`, async t => {
    const { sdk, requests } = await workosSdkFixture(t, config, scenario);
    const log = t.mock.method(console, 'error', () => {});
    const app = await fixture(t, { workos: sdk });
    const { callback, sessionCookie } = await app.login();
    assert.equal(callback.status, scenario.status);
    assert.deepEqual(requests, ['POST /user_management/authenticate', `GET /sso/jwks/${config.clientId}`]);
    if (scenario.status === 302) {
      assert.ok(sessionCookie);
      const session = await app.request('/auth/session', { headers: { cookie: sessionCookie } });
      assert.equal((await session.json()).authenticated, true);
    } else {
      assert.equal(sessionCookie, undefined);
      assert.deepEqual(await callback.json(), { error: 'invalid_session' });
      assert.equal((await (await app.request('/auth/session')).json()).authenticated, false);
      assert.equal(log.mock.calls[0].arguments[0], 'Authentication session rejected');
    }
  });
}
