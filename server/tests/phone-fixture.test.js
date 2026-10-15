import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startBrowserFixture } from '../../preview/e2e/fixture-server.js';
import { phoneFixtureHost } from './phone-fixture-host.js';

test('phone fixture binds only loopback or private IPv4 interfaces', () => {
  assert.equal(phoneFixtureHost(undefined), null);
  for (const host of ['127.0.0.1', '10.0.0.152', '172.16.0.1', '172.31.255.254', '192.168.1.5', '100.64.0.1', '100.127.255.254'])
    assert.equal(phoneFixtureHost(host), host);
  for (const host of ['', '0.0.0.0', '8.8.8.8', '172.32.0.1', '100.128.0.1', 'localhost', '::1'])
    assert.throws(() => phoneFixtureHost(host), /private IPv4/);
});

test('phone fixture issues only a synthetic guest and retains HTTP and WebSocket origin gates', { timeout: 90000 }, async t => {
  const fixture = await startBrowserFixture({ env: { RIVER_OAKS_PHONE_FIXTURE_HOST: '127.0.0.1' } });
  t.after(() => fixture.close());
  const { origin } = fixture;
  const sessionResponse = await fetch(`${origin}/auth/session`);
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.equal(session.authenticated, true);
  assert.equal(session.user.name, 'guest');
  const cookie = sessionResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie?.startsWith('fixture_session='));
  const request = (requestOrigin, csrf) => fetch(`${origin}/api/multiplayer/ticket`, {
    method: 'POST', headers: { Origin: requestOrigin, Cookie: cookie, 'X-CSRF-Token': csrf },
  });
  assert.equal((await fetch(`${origin}/api/multiplayer/ticket`, {
    method: 'POST', headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken },
  })).status, 401);
  assert.equal((await request('https://evil.example', session.csrfToken)).status, 403);
  assert.equal((await request(origin, 'wrong')).status, 403);
  const ticketResponse = await request(origin, session.csrfToken);
  assert.equal(ticketResponse.status, 200);
  const { ticket } = await ticketResponse.json();
  const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/multiplayer?protocol=3&ticket=${encodeURIComponent(ticket)}`, {
    headers: { Origin: origin, Cookie: cookie },
  });
  t.after(() => socket.terminate());
  const [raw] = await once(socket, 'message');
  const snapshot = JSON.parse(raw);
  assert.equal(snapshot.type, 'snapshot');
  assert.ok(snapshot.players.some(player => player.id === 'guest'));
});

test('ordinary browser fixture keeps anonymous entry unauthenticated', { timeout: 90000 }, async t => {
  const fixture = await startBrowserFixture();
  t.after(() => fixture.close());
  const response = await fetch(`${fixture.origin}/auth/session`);
  assert.equal((await response.json()).authenticated, false);
  assert.equal(response.headers.get('set-cookie'), null);
});
