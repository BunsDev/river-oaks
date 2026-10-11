// Hardening: the static-asset gate must not cost a server function call (and a
// shared rate-limit bucket) for every gated file. An approved browser carries a
// short-lived signed pass, bound to its session, that the middleware checks
// locally; any other cookie is refused without calling the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAssetMiddleware } from '../../middleware.js';
import { ASSET_GATE_COOKIE, ASSET_GATE_TTL_MS, signAssetGate, verifyAssetGate } from '../asset-gate.js';
import { createWaitlistRoutes } from '../waitlist-routes.js';

const SECRET = 'a'.repeat(40), NOW = 1_800_000_000_000;

test('a pass verifies only for its own session, before it expires, with the same secret', async () => {
  const value = await signAssetGate({secret: SECRET, session: 'sealed-session-a', now: NOW});
  assert.match(value, /^v1\.\d{13}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(await verifyAssetGate({secret: SECRET, session: 'sealed-session-a', value, now: NOW + 1000}), true);
  assert.equal(await verifyAssetGate({secret: SECRET, session: 'sealed-session-b', value, now: NOW + 1000}), false, 'another session cannot borrow it');
  assert.equal(await verifyAssetGate({secret: SECRET, session: 'sealed-session-a', value, now: NOW + ASSET_GATE_TTL_MS + 1}), false, 'expired');
  assert.equal(await verifyAssetGate({secret: 'b'.repeat(40), session: 'sealed-session-a', value, now: NOW}), false, 'another secret');
  const [, expires, signature] = value.split('.');
  assert.equal(await verifyAssetGate({secret: SECRET, session: 'sealed-session-a', value: `v1.${Number(expires) + 60_000}.${signature}`, now: NOW}), false, 'a stretched expiry breaks the signature');
  const forged = await signAssetGate({secret: SECRET, session: 'sealed-session-a', now: NOW + 10 * ASSET_GATE_TTL_MS});
  assert.equal(await verifyAssetGate({secret: SECRET, session: 'sealed-session-a', value: forged, now: NOW}), false, 'a lifetime longer than the gate allows is refused');
  for (const bad of [null, '', 'v1', `v2.${expires}.${signature}`, `v1.${expires}.${signature}x`, 'x'.repeat(4096)])
    assert.equal(await verifyAssetGate({secret: SECRET, session: 'sealed-session-a', value: bad, now: NOW}), false, String(bad).slice(0, 20));
  assert.equal(await verifyAssetGate({secret: undefined, session: 'sealed-session-a', value, now: NOW}), false, 'no secret, no pass');
});

test('the middleware serves a valid pass without calling the server, and refuses non-session cookies outright', async () => {
  const calls = [], forwarded = [];
  const gate = createGameAssetMiddleware({secret: SECRET, now: () => NOW,
    fetcher: async (url, options) => { calls.push(options.headers.cookie);return Response.json({status: 'approved'}); },
    forward: options => { forwarded.push(options);return new Response('asset'); }});
  const request = cookie => new Request('https://typesafe.place/assets/main-abc.js', {headers: cookie ? {cookie} : {}});
  const pass = await signAssetGate({secret: SECRET, session: 'sealed', now: NOW});
  assert.equal((await gate(request(`river_oaks_session=sealed; ${ASSET_GATE_COOKIE}=${pass}`))).status, 200);
  assert.deepEqual(calls, [], 'no server function call for a valid pass');
  assert.equal(forwarded[0].headers['Cache-Control'], 'private, no-store');
  // Any cookie that is not a session no longer costs a function call.
  for (const cookie of ['a=b', `${ASSET_GATE_COOKIE}=${pass}`, 'river_oaks_session=']) assert.equal((await gate(request(cookie))).status, 403, cookie);
  assert.deepEqual(calls, []);
  // A session with a missing, stale or borrowed pass falls back to the server check once.
  assert.equal((await gate(request('river_oaks_session=other; ' + `${ASSET_GATE_COOKIE}=${pass}`))).status, 200);
  assert.equal(calls.length, 1);
});

test('the status route hands an approved browser its pass, and nobody else', async () => {
  const statuses = {approved: 'approved', waiting: 'pending'};
  const routes = createWaitlistRoutes({origin: 'https://typesafe.place', assetGateSecret: SECRET, now: () => NOW,
    auth: {authenticate: async req => ({userId: req.headers['x-user'], name: req.headers['x-user']})},
    waitlist: {request: async identity => ({status: statuses[identity.userId]})}});
  const call = async user => {
    const headers = {};let status = 0;
    const res = {setHeader: (name, value) => { headers[name.toLowerCase()] = value; }, appendHeader(name, value) { (headers[name.toLowerCase()] ??= []).push(value); },
      writeHead: (code, extra = {}) => { status = code;for (const [name, value] of Object.entries(extra)) headers[name.toLowerCase()] ??= value; }, end() {}};
    await routes({method: 'GET', headers: {cookie: `river_oaks_session=sealed-${user}`, 'x-user': user}}, res, '/api/waitlist/status');
    return {status, cookie: [headers['set-cookie']].flat().filter(Boolean)};
  };
  const approved = await call('approved');
  assert.equal(approved.status, 200);
  assert.equal(approved.cookie.length, 1);
  const [cookie] = approved.cookie;
  assert.match(cookie, new RegExp(`^${ASSET_GATE_COOKIE}=v1\\.`));
  for (const attribute of ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure', `Max-Age=${ASSET_GATE_TTL_MS / 1000}`]) assert.ok(cookie.includes(attribute), attribute);
  const value = cookie.split(';')[0].split('=')[1];
  assert.equal(await verifyAssetGate({secret: SECRET, session: 'sealed-approved', value, now: NOW}), true);
  assert.deepEqual((await call('waiting')).cookie, [], 'a waitlisted user gets no pass');
});
