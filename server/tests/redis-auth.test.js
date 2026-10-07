import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import test from 'node:test';
import Redis from 'ioredis';
import { WorkOS } from '@workos-inc/node';
import { boundaryCases, workosSdkFixture } from './workos-sdk-fixture.js';
import { createAuthAdapter } from './redis-auth-fixture.js';
import { createGitHubFixture } from './github-fixture.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

const { createRedisAuth, MAX_PENDING_SIGN_INS, MAX_SESSIONS, MAX_SESSIONS_PER_USER } = await import('../redis-auth.js').catch(() => ({}));
const integration = (name, run) => test(name, { skip: !process.env.REDIS_URL }, run);
const config = { apiKey: 'sk_test', clientId: 'client_test', cookiePassword: 'a'.repeat(32), origin: 'https://river.example' };
const cookie = (response, name = 'river_oaks_session') => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];

async function fixture(t, overrides = {}) {
  assert.equal(typeof createRedisAuth, 'function', 'redis-auth must export createRedisAuth');
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  const keys = ['states', 'state-expiry', 'sessions', 'session-expiry', 'cookies', 'user-sessions'].map(suffix => `${prefix}:auth:${suffix}`);
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 5000, enableOfflineQueue: false });
  redis.on('error', () => {});
  await redis.connect();
  const peer = redis.duplicate({ lazyConnect: true }); peer.on('error', () => {}); await peer.connect();
  let time = Date.now();
  const now = () => time, workos = createAuthAdapter(now), loggedOut = [], servers = [], auths = [];
  const githubApi = createGitHubFixture({ 1001: 'val-dev', 1002: 'second-resident', 3003: 'sdk-boundary-resident' });
  t.after(async () => {
    for (const auth of auths) auth.close();
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    // Delete only the exact random namespace owned by this test, never FLUSH.
    await redis.del(...keys, `${prefix}:auth:github`);
    await Promise.all([redis.quit(), peer.quit()]);
  });
  async function app(connection = redis, options = {}) {
    const auth = createRedisAuth({ ...config, redis: connection, prefix, workos, githubFetch: githubApi.fetcher, now, onLogout: (...args) => loggedOut.push(args), ...overrides, ...options });
    auths.push(auth);
    const server = createServer(async (req, res) => { if (!await auth.handle(req, res)) { res.writeHead(404); res.end(); } });
    servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const request = (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { redirect: 'manual', ...options });
    return { auth, request };
  }
  const a = await app(), b = await app(peer);
  async function begin(target = a) {
    const response = await target.request('/auth/login');
    const state = new URL(response.headers.get('location')).searchParams.get('state');
    return { response, path: `/auth/callback?code=code&state=${state}`, headers: { cookie: cookie(response, 'river_oaks_auth_state') } };
  }
  async function login() { const start = await begin(); const response = await b.request(start.path, { headers: start.headers }); return { response, sessionCookie: cookie(response) }; }
  return { a, b, app, begin, login, redis, peer, prefix, keys, workos, githubApi, loggedOut, now, advance: ms => { time += ms; } };
}

integration('cross-instance callback consumes PKCE once and survives closing the login instance', async t => {
  const f = await fixture(t), start = await f.begin();
  assert.match(start.response.headers.get('set-cookie'), /HttpOnly.*SameSite=Lax.*Secure/);
  f.a.auth.close();
  const [one, two] = await Promise.all([f.b.request(start.path, { headers: start.headers }), f.b.request(start.path, { headers: start.headers })]);
  assert.deepEqual([one.status, two.status].sort(), [302, 400]);
  assert.equal(f.workos.calls.codes, 1);
  const successful = one.status === 302 ? one : two;
  const c = await f.app();
  const session = await c.request('/auth/session', { headers: { cookie: cookie(successful) } });
  const body = await session.json();
  assert.deepEqual(body.user, { id: 'user_1', name: 'val-dev' });
  assert.ok(body.csrfToken);
  assert.equal(body.canGrantWishes,false);
  assert.doesNotMatch(JSON.stringify(body), /private|email|accessToken|refreshToken/);
  assert.equal(await c.auth.isSessionActive('user_1', 'session_1'), true);
  assert.equal(await c.auth.isSessionActive('other', 'session_1'), false);
  assert.equal(await f.redis.ping(), 'PONG', 'close must not quit caller Redis');
});

integration('email verification after GitHub OAuth survives another server instance', async t => {
  const f = await fixture(t);
  f.workos.requireEmailVerification();
  const start = await f.begin();
  const callback = await f.b.request(start.path, { headers: start.headers });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/auth/verify');
  const verifyCookie = cookie(callback, 'river_oaks_verify_state');
  assert.ok(verifyCookie);
  const c = await f.app();
  assert.equal((await c.request('/auth/verify', { headers: { cookie: verifyCookie } })).status, 200);
  const post = code => c.request('/auth/verify', { method: 'POST', headers: {
    cookie: verifyCookie, origin: config.origin, 'content-type': 'application/x-www-form-urlencoded',
  }, body: `code=${code}` });
  assert.equal((await c.request('/auth/verify', { method: 'POST', headers: {
    cookie: verifyCookie, origin: 'null', 'content-type': 'application/x-www-form-urlencoded',
  }, body: 'code=123456' })).status, 403);
  assert.match(await (await post('000000')).text(), /could not be confirmed/);
  const verified = await post('123456');
  assert.equal(verified.status, 302);
  const sessionCookie = cookie(verified);
  assert.ok(sessionCookie);
  assert.equal((await (await f.a.request('/auth/session', { headers: { cookie: sessionCookie } })).json()).authenticated, true);
  assert.equal((await post('123456')).status, 400);
});

integration('a verified Jevica account has the publishing capability on every Redis auth edge', async t => {
  const f=await fixture(t);
  f.workos.setUserId(JEVICA_ADMIN_USER_IDS[0]);
  const {sessionCookie}=await f.login();
  for(const edge of [f.a,f.b]) {
    const session=await (await edge.request('/auth/session',{headers:{cookie:sessionCookie}})).json();
    assert.equal(session.authenticated,true);
    assert.equal(session.canGrantWishes,true);
  }
});

integration('state is browser-bound, expires, and cannot be replayed across nodes', async t => {
  const f = await fixture(t), start = await f.begin();
  assert.equal((await f.b.request(start.path, { headers: { cookie: 'river_oaks_auth_state=wrong' } })).status, 400);
  f.advance(11 * 60_000);
  assert.equal((await f.b.request(start.path, { headers: start.headers })).status, 302);
  assert.equal(f.workos.calls.codes, 1);
  const expired = await f.begin();
  f.advance(21 * 60_000);
  assert.equal((await f.b.request(expired.path, { headers: expired.headers })).status, 400);
  assert.equal(f.workos.calls.codes, 1);
});

integration('unverified accounts and incorrect token issuer never enter the durable registry', async t => {
  const f = await fixture(t);
  f.workos.setVerified(false);
  assert.equal((await f.login()).response.status, 403);
  f.workos.setVerified(true); f.workos.setTokenClientId('client_wrong');
  assert.equal((await f.login()).response.status, 403);
  f.workos.setTokenClientId('client_test'); f.workos.setIssuer('https://wrong.example');
  assert.equal((await f.login()).response.status, 403);
  assert.equal(await f.redis.hlen(f.keys[2]), 0);
});

integration('email-only, password, and Google authentication cannot enter the distributed session registry', async t => {
  const f = await fixture(t);
  for (const method of ['MagicAuth', 'Password', 'GoogleOAuth']) {
    f.workos.setAuthenticationMethod(method);
    assert.equal((await f.login()).response.status, 403);
  }
  assert.equal(await f.redis.hlen(f.keys[2]), 0);
});

integration('dedicated application accepts the environment issuer across nodes', async t => {
  const f = await fixture(t);
  f.workos.setIssuer('https://api.workos.com/user_management/client_environment');
  const { response, sessionCookie } = await f.login();
  assert.equal(response.status, 302);
  assert.equal((await f.b.auth.authenticate({ headers: { cookie: sessionCookie } })).userId, 'user_1');
});

integration('arbitrary forged cookies create no Redis keys or registry fields', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 20; i++) assert.equal(await f.a.auth.authenticate({ headers: { cookie: `river_oaks_session=forged-${i}` } }), null);
  assert.deepEqual(await f.redis.exists(...f.keys), 0);
});

integration('concurrent cross-node refresh rotates only once and shares the renewed cookie', async t => {
  const f = await fixture(t), { sessionCookie } = await f.login();
  f.advance(301_000);
  assert.equal(await f.a.auth.authenticate({ headers: { cookie: sessionCookie } }), null);
  assert.equal(f.workos.calls.refresh, 0, 'WS authentication must never refresh');
  const gate = f.workos.blockRefresh();
  const first = f.a.request('/auth/session', { headers: { cookie: sessionCookie } });
  await gate.started;
  const second = f.b.request('/auth/session', { headers: { cookie: sessionCookie } });
  await new Promise(resolve => setTimeout(resolve, 100));
  gate.release();
  const responses = await Promise.all([first, second]);
  for (const response of responses) assert.equal((await response.json()).authenticated, true);
  assert.equal(f.workos.calls.refresh, 1);
  assert.ok(cookie(responses[0]));
  assert.equal(cookie(responses[0]), cookie(responses[1]));
  f.advance(31_000);
  assert.equal(await f.a.auth.authenticate({ headers: { cookie: sessionCookie } }), null, 'old cookie grace must end');
});

integration('logout on another node defeats an in-flight refresh without resurrecting its session', async t => {
  const f = await fixture(t), { sessionCookie } = await f.login();
  const identity = await f.a.auth.authenticate({ headers: { cookie: sessionCookie } });
  f.advance(301_000);
  const gate = f.workos.blockRefresh();
  const pending = f.a.request('/auth/session', { headers: { cookie: sessionCookie } });
  await gate.started;
  const logout = await f.b.request('/auth/logout', { method: 'POST', headers: { cookie: sessionCookie, origin: config.origin, 'x-csrf-token': identity.csrfToken } });
  assert.equal(logout.status, 200);
  assert.equal(await f.b.auth.isSessionActive('user_1', 'session_1'), false);
  gate.release();
  assert.deepEqual(await (await pending).json(), { authenticated: false });
  assert.equal(await f.a.auth.isSessionActive('user_1', 'session_1'), false);
  assert.equal(await f.redis.hlen(f.keys[2]), 0);
  assert.equal(await f.redis.hlen(f.keys[4]), 0);
  assert.deepEqual(f.loggedOut, [['user_1', 'session_1']]);
});

integration('logout requires origin and CSRF and revokes replay for all nodes', async t => {
  const f = await fixture(t), { sessionCookie } = await f.login();
  const identity = await f.a.auth.authenticate({ headers: { cookie: sessionCookie } });
  const headers = { cookie: sessionCookie, origin: config.origin, 'x-csrf-token': identity.csrfToken };
  assert.equal((await f.b.request('/auth/logout', { method: 'POST', headers: { ...headers, origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.b.request('/auth/logout', { method: 'POST', headers: { ...headers, 'x-csrf-token': 'forged' } })).status, 403);
  const response = await f.b.request('/auth/logout', { method: 'POST', headers });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.match((await response.json()).url, /^https:\/\/api\.workos\.com/);
  assert.equal(await f.a.auth.authenticate({ headers: { cookie: sessionCookie } }), null);
});

integration('absolute expiry cannot be extended by refresh or by closing an instance', async t => {
  const f = await fixture(t), { sessionCookie } = await f.login();
  f.a.auth.close(); f.advance(7 * 24 * 60 * 60_000 + 1);
  assert.equal(await f.b.auth.isSessionActive('user_1', 'session_1'), false);
  assert.deepEqual(await (await f.b.request('/auth/session', { headers: { cookie: sessionCookie } })).json(), { authenticated: false });
  assert.equal(f.workos.calls.refresh, 0);
});

integration('state and session admission caps are atomic across nodes', async t => {
  const f = await fixture(t);
  const stateFields = [], scores = [];
  for (let i = 0; i < MAX_PENDING_SIGN_INS - 1; i++) { stateFields.push(`seed-${i}`, JSON.stringify({expiresAt:f.now()+60_000})); scores.push(f.now()+60_000, `seed-${i}`); }
  await f.redis.hset(f.keys[0], ...stateFields); await f.redis.zadd(f.keys[1], ...scores);
  const admissions = await Promise.all([f.a.request('/auth/login'),f.b.request('/auth/login')]);
  assert.deepEqual(admissions.map(response=>response.status).sort(), [302,503]);
  assert.equal(await f.redis.hlen(f.keys[0]), MAX_PENDING_SIGN_INS);
  f.advance(61_000);
  const starts = await Promise.all([f.begin(),f.begin(f.b)]);
  const sessions = [], expiry = [];
  for (let i = 0; i < MAX_SESSIONS - 1; i++) { sessions.push(`seed-${i}`, JSON.stringify({sessionId:`seed-${i}`,cookieHash:`hash-${i}`,expiresAt:f.now()+60_000})); expiry.push(f.now()+60_000, `seed-${i}`); }
  await f.redis.hset(f.keys[2], ...sessions); await f.redis.zadd(f.keys[3], ...expiry);
  const callbacks = await Promise.all(starts.map((start,index) => [f.a,f.b][index].request(start.path,{headers:start.headers})));
  assert.deepEqual(callbacks.map(response=>response.status).sort(), [302,503]);
  assert.equal(await f.redis.hlen(f.keys[2]), MAX_SESSIONS);
});

// One account could sign in over and over until the shared session table was
// full, locking every other account out for the seven-day session lifetime.
integration('one account keeps only its newest sessions, so repeated sign-ins cannot fill the table', async t => {
  const f = await fixture(t), cookies = [];
  for (let i = 0; i < MAX_SESSIONS_PER_USER + 3; i++) {
    const { response, sessionCookie } = await f.login();
    assert.equal(response.status, 302);
    cookies.push(sessionCookie);
  }
  assert.equal(await f.redis.hlen(f.keys[2]), MAX_SESSIONS_PER_USER);
  assert.equal(await f.redis.hlen(f.keys[4]), MAX_SESSIONS_PER_USER);
  assert.equal(JSON.parse(await f.redis.hget(f.keys[5], 'user_1')).length, MAX_SESSIONS_PER_USER);
  const signedIn = async cookie => (await (await f.a.request('/auth/session', { headers: { cookie } })).json()).authenticated;
  for (const cookie of cookies.slice(0, 3)) assert.equal(await signedIn(cookie), false, 'the oldest sessions were retired');
  for (const cookie of cookies.slice(3)) assert.equal(await signedIn(cookie), true);
  // Another account is unaffected.
  f.workos.setUserId('user_2');
  const other = await f.login();
  assert.equal(await signedIn(other.sessionCookie), true);
  assert.equal(JSON.parse(await f.redis.hget(f.keys[5], 'user_2')).length, 1);
});

integration('Redis failures and missing configuration fail closed without exposing errors', async t => {
  const f = await fixture(t);
  const unavailable = await f.app({ eval: async () => { throw new Error('private Redis credentials'); } });
  assert.equal(await unavailable.auth.authenticate({headers:{cookie:'river_oaks_session=forged'}}), null);
  assert.equal(await unavailable.auth.isSessionActive('user_1','session_1'), false);
  const response = await unavailable.request('/auth/session', {headers:{cookie:'river_oaks_session=forged'}});
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), {error:'auth_unavailable'});
  const missing = await f.app(f.redis, {apiKey:undefined});
  assert.equal((await missing.request('/auth/login')).status, 503);
});

integration('expired refresh lease fences the previous owner from overwriting a newer refresh', async t => {
  const f = await fixture(t), { sessionCookie } = await f.login();
  f.advance(301_000);
  const gate = f.workos.blockRefresh();
  const first = f.a.request('/auth/session', {headers:{cookie:sessionCookie}});
  await gate.started;
  f.advance(31_000);
  const second = f.b.request('/auth/session', {headers:{cookie:sessionCookie}});
  const deadline = Date.now()+5000;
  while (f.workos.calls.refresh<2 && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,20));
  gate.release();
  const [oldOwner,newOwner] = await Promise.all([first,second]);
  assert.equal(f.workos.calls.refresh,2);
  assert.deepEqual(await oldOwner.json(),{authenticated:false});
  assert.equal((await newOwner.json()).authenticated,true);
  const renewed = cookie(newOwner);
  assert.ok(renewed);
  assert.equal((await f.a.auth.authenticate({headers:{cookie:renewed}})).sessionId,'session_1');
});

integration('real WorkOS SDK sealed sessions and signed JWTs authenticate on another instance', async t => {
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:'https://api.workos.com',client_id:config.clientId,sub:'user_sdk',sid:'session_sdk',exp:Math.floor(Date.now()/1000)+300})}`;
  const accessToken=`${payload}.${sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url')}`;
  const sdk=new WorkOS(config.apiKey,{clientId:config.clientId});
  sdk.post=async(path,body)=>{
    assert.equal(path,'/user_management/authenticate');assert.ok(body.code_verifier.length>=43);
    return {data:{user:{object:'user',id:'user_sdk',email:'private@example.com',email_verified:true,first_name:'Val',last_name:null,profile_picture_url:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},access_token:accessToken,refresh_token:'private-refresh',authentication_method:'GitHubOAuth'}};
  };
  sdk.userManagement.getJWKS=async()=>async()=>publicKey;
  sdk.userManagement.getUserIdentities=async userId=>userId==='user_sdk'?[{idpId:'3003',type:'OAuth',provider:'GitHubOAuth'}]:[];
  const f=await fixture(t,{workos:sdk}),{response,sessionCookie}=await f.login();
  assert.equal(response.status,302);
  const user=await f.a.auth.authenticate({headers:{cookie:sessionCookie}});
  assert.deepEqual([user.userId,user.name],['user_sdk','sdk-boundary-resident']);
  const value=decodeURIComponent(sessionCookie.slice(sessionCookie.indexOf('=')+1)),midpoint=Math.floor(value.length/2);
  const tampered=`${value.slice(0,midpoint)}${value[midpoint]==='a'?'b':'a'}${value.slice(midpoint+1)}`;
  assert.equal(await f.b.auth.authenticate({headers:{cookie:`river_oaks_session=${encodeURIComponent(tampered)}`}}),null);
  assert.equal((await sdk.userManagement.loadSealedSession({sessionData:tampered,cookiePassword:config.cookiePassword}).authenticate()).authenticated,false);
});

for (const scenario of boundaryCases) {
  integration(`real SDK cross-node application key boundary: ${scenario.name}`, async t => {
    const { sdk, requests } = await workosSdkFixture(t, config, scenario);
    const log = t.mock.method(console, 'error', () => {});
    const f = await fixture(t, { workos: sdk });
    const { response, sessionCookie } = await f.login();
    assert.equal(response.status, scenario.status);
    // A rejected session is never looked up on GitHub.
    assert.deepEqual(requests, ['POST /user_management/authenticate', `GET /sso/jwks/${config.clientId}`,
      ...(scenario.status === 302 ? ['GET /user_management/users/user_sdk/identities'] : [])]);
    if (scenario.status === 302) {
      assert.equal((await f.a.auth.authenticate({ headers: { cookie: sessionCookie } })).name, 'sdk-boundary-resident');
    } else {
      assert.equal(sessionCookie, undefined);
      assert.deepEqual(await response.json(), { error: 'invalid_session' });
      assert.equal(await f.redis.hlen(f.keys[2]), 0);
      assert.equal(await f.redis.hlen(f.keys[4]), 0);
      assert.equal(log.mock.calls[0].arguments[0], 'Authentication session rejected');
    }
  });
}

// Residents are shown by GitHub username. Only the admin is Jevica, whatever
// any other account puts in its GitHub profile name or username.
integration('residents are named by GitHub username and only the admin is Jevica', async t => {
  const f = await fixture(t);
  const nameFor = async cookie => (await (await f.a.request('/auth/session', { headers: { cookie } })).json()).user?.name;
  f.workos.setDisplayName('Jevica');
  assert.equal(await nameFor((await f.login()).sessionCookie), 'val-dev', 'a GitHub profile name of Jevica is ignored');
  f.workos.setUserId('user_2'); f.githubApi.accounts['1002'] = 'Jevica';
  assert.equal(await nameFor((await f.login()).sessionCookie), 'github-1002', 'a GitHub username of Jevica is not shown');
  f.githubApi.accounts['1002'] = 'jev1ca-official';
  assert.equal(await nameFor((await f.login()).sessionCookie), 'github-1002', 'nor a lookalike');
  f.workos.setUserId(JEVICA_ADMIN_USER_IDS[0]); f.workos.githubIds[JEVICA_ADMIN_USER_IDS[0]] = '1003'; f.githubApi.accounts['1003'] = 'BunsDev';
  f.workos.setDisplayName('Val', 'Dev');
  const admin = (await f.login()).sessionCookie;
  assert.equal(await nameFor(admin), 'Jevica', 'the admin account is Jevica');
  assert.equal((await f.b.auth.authenticate({ headers: { cookie: admin } })).name, 'Jevica', 'on every instance');
});

integration('a GitHub outage at sign-in shows the GitHub account number until GitHub answers again', async t => {
  const f = await fixture(t);
  f.githubApi.down = true;
  const { sessionCookie } = await f.login();
  assert.equal((await f.a.auth.authenticate({ headers: { cookie: sessionCookie } })).name, 'github-1001');
  f.githubApi.down = false;
  assert.equal((await f.a.auth.authenticate({ headers: { cookie: sessionCookie } })).name, 'github-1001', 'not retried on every request');
  f.advance(10 * 60_000);
  // The WorkOS access token has expired by now; the HTTP session route refreshes it.
  assert.equal((await (await f.b.request('/auth/session', { headers: { cookie: sessionCookie } })).json()).user.name, 'val-dev');
});

integration('a session created before usernames were stored is named by GitHub username on its next request', async t => {
  const f = await fixture(t), { sessionCookie } = await f.login();
  const [id, raw] = await f.redis.hgetall(f.keys[2]).then(entries => Object.entries(entries)[0]);
  const legacy = JSON.parse(raw); delete legacy.githubId; delete legacy.login;
  await f.redis.hset(f.keys[2], id, JSON.stringify(legacy));
  await f.redis.del(`${f.prefix}:auth:github`);
  const before = f.githubApi.calls.length;
  assert.equal((await f.b.auth.authenticate({ headers: { cookie: sessionCookie } })).name, 'val-dev');
  assert.equal((await f.a.auth.authenticate({ headers: { cookie: sessionCookie } })).name, 'val-dev');
  assert.equal(f.githubApi.calls.length, before + 1, 'looked up once, then remembered');
});


integration('canonical callbacks return to /play across Redis instances', async t => {
  const f = await fixture(t, { returnPath: '/play' }), start = await f.begin();
  const callback = await f.b.request(start.path, { headers: start.headers });
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/play');
  const invalid = await f.app(f.redis, { returnPath: '//evil.example' });
  assert.equal((await invalid.request('/auth/login')).status, 503);
});
