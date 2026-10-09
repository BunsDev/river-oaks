import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import test from 'node:test';
import { WorkOS } from '@workos-inc/node';
import { boundaryCases, workosSdkFixture } from './workos-sdk-fixture.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

import { createGitHubFixture } from './github-fixture.js';
const module = await import('../auth.js').catch(() => ({}));
const { createAuth } = module;
const config = { apiKey: 'sk_test', clientId: 'client_test', cookiePassword: 'a'.repeat(32), origin: 'http://localhost:3000' };
const cookie = (response, name) => response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`))?.split(';')[0];

function adapter(clock) {
  const sealed = new Map();
  const calls = { codes: [], refresh: 0 };
  let verificationRequired = false, signIns = 0, distinctSessions = false;
  let user = { id: 'user_1', firstName: 'Val', lastName: 'Dev', email: 'private@example.com', emailVerified: true };
  let issuer = 'https://api.workos.com', tokenClientId = config.clientId, authenticationMethod = 'GitHubOAuth';
  function mint(sessionId = 'session_1') {
    const accessToken = `header.${Buffer.from(JSON.stringify({ iss: issuer, client_id: tokenClientId, sid: sessionId, sub: user.id, exp: Math.floor(clock() / 1000) + 300 })).toString('base64url')}.signature`;
    const sealedSession = randomBytes(32).toString('base64url');
    sealed.set(sealedSession, { authenticated: true, user: { ...user }, sessionId, accessToken, authenticationMethod });
    return { user: { ...user }, accessToken, refreshToken: 'private-refresh-token', sealedSession, authenticationMethod };
  }
  return {
    calls,
    setUser(value) { user = { ...user, ...value }; },
    setIssuer(value) { issuer = value; },
    setTokenClientId(value) { tokenClientId = value; },
    setAuthenticationMethod(value) { authenticationMethod = value; },
    requireEmailVerification() { verificationRequired = true; },
    mintDistinctSessions() { distinctSessions = true; },
    setUserId(id) { user = { ...user, id }; },
    userManagement: {
      async getUserIdentities(id) {
        const githubId = { user_1: '1001', user_2: '1002' }[id];
        return githubId ? [{ idpId: githubId, type: 'OAuth', provider: 'GitHubOAuth' }] : [];
      },
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
        if (verificationRequired) {
          verificationRequired = false;
          throw Object.assign(new Error('Email verification required'), {
            code: 'email_verification_required', status: 403, pendingAuthenticationToken: 'private-pending-token',
          });
        }
        return mint(distinctSessions ? `session_${++signIns}` : undefined);
      },
      async authenticateWithEmailVerification(options) {
        assert.equal(options.pendingAuthenticationToken, 'private-pending-token');
        assert.deepEqual(options.session, { sealSession: true, cookiePassword: config.cookiePassword });
        if (options.code !== '123456') throw Object.assign(new Error('Invalid code'), { status: 400, code: 'invalid_code' });
        return mint();
      },
      async authenticateWithRefreshToken(options) {
        assert.equal(options.refreshToken, 'private-desktop-refresh');
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
  const githubApi = createGitHubFixture({ 1001: 'val-dev', 1002: 'second-resident', 2002: 'real-sdk-resident', 3003: 'sdk-boundary-resident' });
  const auth = createAuth({ ...config, workos, githubFetch: githubApi.fetcher, now: () => time, onLogout: (...args) => loggedOut.push(args), ...overrides });
  const server = createServer(async (req, res) => {
    if (!await auth.handle(req, res)) { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { auth.close(); server.closeAllConnections(); server.close(); });
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { redirect: 'manual', ...options });
  async function login(provider = 'github') {
    const response = await request(`/auth/login?provider=${provider}`);
    const state = new URL(response.headers.get('location')).searchParams.get('state');
    const stateCookie = cookie(response, 'river_oaks_auth_state');
    const callback = await request(`/auth/callback?code=code_1&state=${state}`, { headers: { cookie: stateCookie } });
    return { response, callback, state, stateCookie, sessionCookie: cookie(callback, 'river_oaks_session') };
  }
  return { auth, workos, githubApi, loggedOut, request, login, advance: (ms) => { time += ms; } };
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
  assert.deepEqual(body.user, { id: 'user_1', name: 'val-dev' }, 'the GitHub username, not the WorkOS display name');
  assert.equal(body.authenticated, true);
  assert.equal(body.canGrantWishes, false, 'a verified visitor has no Jevica privileges');
  assert.match(body.csrfToken, /^[A-Za-z0-9_-]{32,}$/);
  assert.doesNotMatch(JSON.stringify(body), /private|email|accessToken|refreshToken/);
  const identity = await app.auth.authenticate({ headers: { cookie: sessionCookie } });
  assert.equal(identity.sessionId, 'session_1');
  assert.equal(identity.userId, 'user_1');
  assert.ok(identity.expiresAt > Date.now());
});

test('GitHub sign-in completes WorkOS email verification before issuing a session', async t => {
  const app = await fixture(t, { returnPath: '/play' });
  app.workos.requireEmailVerification();
  const { callback } = await app.login();
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/auth/verify');
  const verifyCookie = cookie(callback, 'river_oaks_verify_state');
  assert.ok(verifyCookie);
  assert.deepEqual(await (await app.request('/auth/session', { headers: { cookie: verifyCookie } })).json(), { authenticated: false });
  assert.equal((await app.request('/auth/verify')).status, 400);
  const page = await app.request('/auth/verify', { headers: { cookie: verifyCookie } });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('referrer-policy'), 'same-origin');
  assert.match(await page.text(), /Verification code/);
  const post = (code, origin = config.origin) => app.request('/auth/verify', { method: 'POST', headers: {
    cookie: verifyCookie, origin, 'content-type': 'application/x-www-form-urlencoded',
  }, body: `code=${code}` });
  assert.equal((await post('123456', 'https://attacker.example')).status, 403);
  assert.equal((await post('123456', 'null')).status, 403);
  assert.match(await (await post('000000')).text(), /could not be confirmed/);
  const verified = await post('123456');
  assert.equal(verified.status, 302);
  assert.equal(verified.headers.get('location'), '/play');
  const sessionCookie = cookie(verified, 'river_oaks_session');
  assert.ok(sessionCookie);
  assert.equal((await (await app.request('/auth/session', { headers: { cookie: sessionCookie } })).json()).authenticated, true);
  assert.equal((await post('123456')).status, 400);
});

test('desktop device credentials exchange for verified GitHub and Magic Auth sessions', async t => {
  const app = await fixture(t);
  const exchange = () => app.request('/auth/desktop/exchange', { method: 'POST', headers: {
    origin: config.origin, 'content-type': 'application/json',
  }, body: JSON.stringify({ refreshToken: 'private-desktop-refresh' }) });
  assert.equal((await app.request('/auth/desktop/exchange', { method: 'POST', headers: {
    origin: 'https://evil.example', 'content-type': 'application/json',
  }, body: JSON.stringify({ refreshToken: 'private-desktop-refresh' }) })).status, 403);
  const accepted = await exchange();
  assert.equal(accepted.status, 200);
  const session = await app.request('/auth/session', { headers: { cookie: cookie(accepted, 'river_oaks_session') } });
  assert.equal((await session.json()).authenticated, true);
  app.workos.setAuthenticationMethod('MagicAuth');
  const emailSession = await exchange();
  assert.equal(emailSession.status, 200);
  const emailIdentity = await (await app.request('/auth/session', { headers: { cookie: cookie(emailSession, 'river_oaks_session') } })).json();
  assert.equal(emailIdentity.user.name, 'Visitor #user_1');
  app.workos.setUser({ emailVerified: false });
  assert.equal((await exchange()).status, 403);
  app.workos.setUser({ emailVerified: true });
  app.workos.setAuthenticationMethod('GoogleOAuth');
  assert.equal((await exchange()).status, 403);
});

test('a verified Jevica account receives the publishing capability from the server', async t => {
  const app=await fixture(t);
  app.workos.setUser({id:JEVICA_ADMIN_USER_IDS[0]});
  const {sessionCookie}=await app.login();
  const session=await (await app.request('/auth/session',{headers:{cookie:sessionCookie}})).json();
  assert.equal(session.authenticated,true);
  assert.equal(session.canGrantWishes,true);
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

test('only GitHub OAuth methods can create or retain a session', async t => {
  const app = await fixture(t);
  assert.equal((await app.request('/auth/login?provider=password')).status, 400);
  assert.equal((await app.request('/auth/login?provider=google')).status, 400);
  const github = await app.login();
  assert.equal(new URL(github.response.headers.get('location')).searchParams.get('provider'), 'GitHubOAuth');
  assert.equal(github.callback.status, 302);
  app.workos.setAuthenticationMethod('Password');
  const denied = await app.login();
  assert.equal(denied.callback.status, 403);
  app.workos.setAuthenticationMethod('GoogleOAuth');
  assert.equal((await app.login()).callback.status, 403);
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
    { id: 'user_1', name: 'val-dev' });
});

test('bounded login state expires and frees capacity', async (t) => {
  const app = await fixture(t, { maxStates: 50 });
  for (let i = 0; i < 50; i++) assert.equal((await app.request('/auth/login')).status, 302);
  assert.equal((await app.request('/auth/login')).status, 503);
  app.advance(21 * 60_000);
  assert.equal((await app.request('/auth/login')).status, 302);
});

// One account could sign in over and over until the session table was full,
// locking every other account out.
test('one account keeps only its newest sessions, so repeated sign-ins cannot fill the table', async (t) => {
  const app = await fixture(t);
  app.workos.mintDistinctSessions();
  const cookies = [];
  for (let i = 0; i < 13; i++) cookies.push((await app.login()).sessionCookie);
  const signedIn = async cookie => (await (await app.request('/auth/session', { headers: { cookie } })).json()).authenticated;
  for (const cookie of cookies.slice(0, 3)) assert.equal(await signedIn(cookie), false, 'the oldest sessions were retired');
  for (const cookie of cookies.slice(3)) assert.equal(await signedIn(cookie), true);
  app.workos.setUserId('user_2');
  assert.equal(await signedIn((await app.login()).sessionCookie), true, 'another account is unaffected');
  assert.equal(await signedIn(cookies.at(-1)), true);
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
      access_token: accessToken, refresh_token: 'secret-refresh', authentication_method: 'GitHubOAuth',
    } };
  };
  sdk.userManagement.getJWKS = async () => async () => publicKey;
  sdk.userManagement.getUserIdentities = async userId => (userId === 'user_real_sdk' ? [{ idpId: '2002', type: 'OAuth', provider: 'GitHubOAuth' }] : []);
  const app = await fixture(t, { workos: sdk });
  const { callback, sessionCookie } = await app.login();
  assert.equal(callback.status, 302);
  const response = await app.request('/auth/session', { headers: { cookie: sessionCookie } });
  // The GitHub username, not the WorkOS first name "Val".
  assert.deepEqual((await response.json()).user, { id: 'user_real_sdk', name: 'real-sdk-resident' });
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
    // A rejected session is never looked up on GitHub.
    assert.deepEqual(requests, ['POST /user_management/authenticate', `GET /sso/jwks/${config.clientId}`,
      ...(scenario.status === 302 ? ['GET /user_management/users/user_sdk/identities'] : [])]);
    if (scenario.status === 302) {
      assert.ok(sessionCookie);
      const session = await app.request('/auth/session', { headers: { cookie: sessionCookie } });
      assert.deepEqual((await session.json()).user, { id: 'user_sdk', name: 'sdk-boundary-resident' });
    } else {
      assert.equal(sessionCookie, undefined);
      assert.deepEqual(await callback.json(), { error: 'invalid_session' });
      assert.equal((await (await app.request('/auth/session')).json()).authenticated, false);
      assert.equal(log.mock.calls[0].arguments[0], 'Authentication session rejected');
    }
  });
}


test('canonical game callback returns to /play and rejects unsafe return paths', async t => {
  const app = await fixture(t, { returnPath: '/play' });
  assert.equal((await app.login()).callback.headers.get('location'), '/play');
  for (const returnPath of ['https://evil.example', '//evil.example', '/play?next=evil', '/auth/login']) {
    const invalid = await fixture(t, { returnPath });
    assert.equal((await invalid.request('/auth/login')).status, 503);
  }
});

test('missing GitHub lookups receive distinct stable account fallbacks', async t => {
  const app = await fixture(t);
  app.workos.mintDistinctSessions();
  const names = [];
  for (const userId of ['user_1', 'user_2']) {
    app.workos.setUserId(userId);
    app.workos.userManagement.getUserIdentities = async () => [];
    const { sessionCookie } = await app.login();
    const read = async () => (await (await app.request('/auth/session', { headers: { cookie: sessionCookie } })).json()).user.name;
    names.push(await read());
    assert.equal(await read(), `Visitor #${userId}`);
  }
  assert.equal(new Set(names).size, 2);
});
