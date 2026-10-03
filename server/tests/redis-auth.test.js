import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import test from 'node:test';
import Redis from 'ioredis';
import { WorkOS } from '@workos-inc/node';
import { createAuthAdapter } from './redis-auth-fixture.js';

const { createRedisAuth } = await import('../redis-auth.js').catch(() => ({}));
const integration = (name, run) => test(name, { skip: !process.env.REDIS_URL }, run);
const config = { apiKey: 'sk_test', clientId: 'client_test', cookiePassword: 'a'.repeat(32), origin: 'https://river.example' };
const cookie = (response, name = 'river_oaks_session') => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];

async function fixture(t, overrides = {}) {
  assert.equal(typeof createRedisAuth, 'function', 'redis-auth must export createRedisAuth');
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  const keys = ['states', 'state-expiry', 'sessions', 'session-expiry', 'cookies'].map(suffix => `${prefix}:auth:${suffix}`);
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 5000, enableOfflineQueue: false });
  redis.on('error', () => {});
  await redis.connect();
  const peer = redis.duplicate({ lazyConnect: true }); peer.on('error', () => {}); await peer.connect();
  let time = Date.now();
  const now = () => time, workos = createAuthAdapter(now), loggedOut = [], servers = [], auths = [];
  t.after(async () => {
    for (const auth of auths) auth.close();
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    // Delete only the exact random namespace owned by this test, never FLUSH.
    await redis.del(...keys);
    await Promise.all([redis.quit(), peer.quit()]);
  });
  async function app(connection = redis, options = {}) {
    const auth = createRedisAuth({ ...config, redis: connection, prefix, workos, now, onLogout: (...args) => loggedOut.push(args), ...overrides, ...options });
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
  return { a, b, app, begin, login, redis, peer, prefix, keys, workos, loggedOut, now, advance: ms => { time += ms; } };
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
  assert.deepEqual(body.user, { id: 'user_1', name: 'Val Dev' });
  assert.ok(body.csrfToken);
  assert.doesNotMatch(JSON.stringify(body), /private|email|accessToken|refreshToken/);
  assert.equal(await c.auth.isSessionActive('user_1', 'session_1'), true);
  assert.equal(await c.auth.isSessionActive('other', 'session_1'), false);
  assert.equal(await f.redis.ping(), 'PONG', 'close must not quit caller Redis');
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
  for (let i = 0; i < 999; i++) { stateFields.push(`seed-${i}`, JSON.stringify({expiresAt:f.now()+60_000})); scores.push(f.now()+60_000, `seed-${i}`); }
  await f.redis.hset(f.keys[0], ...stateFields); await f.redis.zadd(f.keys[1], ...scores);
  const admissions = await Promise.all([f.a.request('/auth/login'),f.b.request('/auth/login')]);
  assert.deepEqual(admissions.map(response=>response.status).sort(), [302,503]);
  assert.equal(await f.redis.hlen(f.keys[0]), 1000);
  f.advance(61_000);
  const starts = await Promise.all([f.begin(),f.begin(f.b)]);
  const sessions = [], expiry = [];
  for (let i = 0; i < 9999; i++) { sessions.push(`seed-${i}`, JSON.stringify({sessionId:`seed-${i}`,cookieHash:`hash-${i}`,expiresAt:f.now()+60_000})); expiry.push(f.now()+60_000, `seed-${i}`); }
  await f.redis.hset(f.keys[2], ...sessions); await f.redis.zadd(f.keys[3], ...expiry);
  const callbacks = await Promise.all(starts.map((start,index) => [f.a,f.b][index].request(start.path,{headers:start.headers})));
  assert.deepEqual(callbacks.map(response=>response.status).sort(), [302,503]);
  assert.equal(await f.redis.hlen(f.keys[2]), 10000);
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
    return {data:{user:{object:'user',id:'user_sdk',email:'private@example.com',email_verified:true,first_name:'Val',last_name:null,profile_picture_url:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},access_token:accessToken,refresh_token:'private-refresh',authentication_method:'Password'}};
  };
  sdk.userManagement.getJWKS=async()=>async()=>publicKey;
  const f=await fixture(t,{workos:sdk}),{response,sessionCookie}=await f.login();
  assert.equal(response.status,302);
  assert.equal((await f.a.auth.authenticate({headers:{cookie:sessionCookie}})).userId,'user_sdk');
  const value=decodeURIComponent(sessionCookie.slice(sessionCookie.indexOf('=')+1)),midpoint=Math.floor(value.length/2);
  const tampered=`${value.slice(0,midpoint)}${value[midpoint]==='a'?'b':'a'}${value.slice(midpoint+1)}`;
  assert.equal(await f.b.auth.authenticate({headers:{cookie:`river_oaks_session=${encodeURIComponent(tampered)}`}}),null);
  assert.equal((await sdk.userManagement.loadSealedSession({sessionData:tampered,cookiePassword:config.cookiePassword}).authenticate()).authenticated,false);
});
