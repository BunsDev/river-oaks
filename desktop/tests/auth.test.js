import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceSignIn, exchangeDesktopSession } from '../auth.js';

test('desktop device flow opens the system browser and accepts only GitHub', async () => {
  const calls = [], replies = [
    Response.json({ device_code: 'private-code', user_code: 'ABCD-EFGH', verification_uri_complete: 'https://signin.workos.com/device?code=ABCD-EFGH', expires_in: 300, interval: 5 }),
    Response.json({ error: 'authorization_pending' }, { status: 400 }),
    Response.json({ authentication_method: 'GitHubOAuth', refresh_token: 'refresh-token' }),
  ];
  const token = await deviceSignIn({ clientId: 'client_test', fetcher: async (url, options) => {
    calls.push({ url, body: String(options.body) }); return replies.shift();
  }, openBrowser: async (url, code) => {
    assert.match(url, /^https:\/\/signin\.workos\.com/); assert.equal(code, 'ABCD-EFGH'); return true;
  }, sleep: async () => {}, now: () => 0 });
  assert.equal(token, 'refresh-token');
  assert.match(calls[2].body, /device_code=private-code/);
  const emailOnly = [replies[0] = Response.json({ device_code: 'private-code', user_code: 'ABCD-EFGH', verification_uri_complete: 'https://signin.workos.com/device', expires_in: 300, interval: 5 }),
    Response.json({ authentication_method: 'MagicAuth', refresh_token: 'refresh-token' })];
  await assert.rejects(deviceSignIn({ clientId: 'client_test', fetcher: async () => emailOnly.shift(),
    openBrowser: async () => true, sleep: async () => {}, now: () => 0 }), /GitHub/);
  const google = [Response.json({ device_code: 'private-code', user_code: 'ABCD-EFGH', verification_uri_complete: 'https://signin.workos.com/device', expires_in: 300, interval: 5 }),
    Response.json({ authentication_method: 'GoogleOAuth', refresh_token: 'refresh-token' })];
  await assert.rejects(deviceSignIn({ clientId: 'client_test', fetcher: async () => google.shift(),
    openBrowser: async () => true, sleep: async () => {}, now: () => 0 }), /GitHub/);
});

test('desktop exchange sends the refresh credential only to its own origin', async () => {
  let target, options;
  const cookie = await exchangeDesktopSession({ origin: 'https://sim.jev.works', refreshToken: 'private-refresh',
    fetcher: async (url, request) => { target = url; options = request;
      return new Response('{"authenticated":true}', { headers: { 'Set-Cookie': 'river_oaks_session=sealed-value; Path=/; Secure; HttpOnly' } }); } });
  assert.equal(target, 'https://sim.jev.works/auth/desktop/exchange');
  assert.equal(options.headers.Origin, 'https://sim.jev.works');
  assert.equal(cookie, 'sealed-value');
});
