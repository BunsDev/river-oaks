import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
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

test('HTML-image decoder control applies only to the phone fixture and only when requested', { timeout: 90000 }, async t => {
  const phone = await startBrowserFixture({ env: { RIVER_OAKS_PHONE_FIXTURE_HOST: '127.0.0.1' } });
  t.after(() => phone.close());
  const normal = await (await fetch(phone.origin)).text();
  assert.doesNotMatch(normal, /phone-decoder-control/);
  const controlled = await (await fetch(`${phone.origin}/?phone-decoder=html`)).text();
  const injected = controlled.match(/<script id="phone-decoder-control">([^<]+)<\/script>/)?.[1];
  assert.ok(injected, 'requested phone control is present in served HTML');
  assert.ok(controlled.indexOf('phone-decoder-control') < controlled.indexOf('/assets/boot/first-paint.js'));
  const context = { createImageBitmap() {}, document: { documentElement: { dataset: {} } } };
  runInNewContext(injected, context);
  assert.equal(context.createImageBitmap, undefined);
  assert.equal(context.document.documentElement.dataset.phoneDecoder, 'html-images');

  const avatarOnly = await (await fetch(`${phone.origin}/?phone-avatar-decoder=html`)).text();
  const avatarScript = avatarOnly.match(/<script id="phone-avatar-decoder-control">([^<]+)<\/script>/)?.[1];
  assert.ok(avatarScript, 'avatar-only control is present in served phone HTML');
  const avatarContext = { createImageBitmap() {}, document: { documentElement: { dataset: {} } } };
  const bitmap = avatarContext.createImageBitmap;
  runInNewContext(avatarScript, avatarContext);
  assert.equal(avatarContext.createImageBitmap, bitmap);
  assert.equal(avatarContext.__riverPhoneAvatarHtmlImages, true);

  const desktop = await startBrowserFixture();
  t.after(() => desktop.close());
  const desktopHtml = await (await fetch(`${desktop.origin}/?phone-decoder=html`)).text();
  assert.doesNotMatch(desktopHtml, /phone-decoder-control/);
  const desktopAvatarHtml = await (await fetch(`${desktop.origin}/?phone-avatar-decoder=html`)).text();
  assert.doesNotMatch(desktopAvatarHtml, /phone-avatar-decoder-control/);
});

test('phone readiness report sends bounded asset and renderer data only to its private fixture', { timeout: 90000 }, async t => {
  const phone = await startBrowserFixture({ env: { RIVER_OAKS_PHONE_FIXTURE_HOST: '127.0.0.1' } });
  t.after(() => phone.close());
  const html = await (await fetch(`${phone.origin}/?phone-avatar-decoder=html&phone-report=1`)).text();
  const script = html.match(/<script id="phone-readiness-report">([^<]+)<\/script>/)?.[1];
  assert.ok(script, 'explicit phone report script is injected');

  const scheduled = [], sent = [];
  const context = {
    document: { documentElement: { dataset: { phoneAvatarDecoder: 'html-images' } },
      querySelector: selector => selector === '#viewport'
        ? { dataset: { assetProgress: JSON.stringify({ loaded: 88, total: 88, failed: 0, done: true }) } }
        : { hidden: false, classList: { contains: () => false }, querySelector: () => ({ textContent: 'Connecting to the town…' }) } },
    performance: { now: () => 7000 },
    __riverRenderAudit: { graphics: () => ({ renderer: 'Test WebGL', viewport: [400, 800], render: { calls: 123 }, memory: { textures: 12 } }) },
    setTimeout: (fn, ms) => scheduled.push({ fn, ms }),
    fetch: (url, options) => { sent.push({ url, options }); return Promise.resolve(); },
  };
  runInNewContext(script, context);
  assert.deepEqual(scheduled.map(item => item.ms), [5000, 25000]);
  await scheduled[0].fn();
  assert.equal(sent[0].url, '/__phone_readiness');
  const report = JSON.parse(sent[0].options.body);
  assert.equal(report.mode, 'avatar-html');
  assert.deepEqual(JSON.parse(JSON.stringify(report.asset)), { loaded: 88, total: 88, failed: 0, done: true });
  assert.equal(report.graphics.renderer, 'Test WebGL');
  assert.equal(report.loading.message, 'Connecting to the town…');

  const posted = await fetch(`${phone.origin}/__phone_readiness`, {
    method: 'POST', headers: { Origin: phone.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(report),
  });
  assert.equal(posted.status, 204);
  const records = await (await fetch(`${phone.origin}/__phone_readiness`)).json();
  assert.equal(records.length, 1);
  assert.equal(records[0].asset.failed, 0);
  assert.equal(records[0].graphics.renderer, 'Test WebGL');
  assert.equal(records[0].loading.message, 'Connecting to the town…');
  assert.equal((await fetch(`${phone.origin}/__phone_readiness`, {
    method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(report),
  })).status, 403);
});
