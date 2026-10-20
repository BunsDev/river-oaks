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
      querySelector: selector => {
        if (selector === '#viewport') return { dataset: { assetProgress: JSON.stringify({ loaded: 88, total: 88, failed: 0, done: true }) } };
        if (selector === '.multiplayer-gate') return { hidden: false };
        if (selector === '#multiplayer-status') return { textContent: 'Connecting to the town…' };
        return { hidden: false, classList: { contains: () => false }, querySelector: () => ({ textContent: 'Building the view' }) };
      } },
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
  assert.equal(report.gate.shown, true);
  assert.equal(report.gate.status, 'Connecting to the town…');

  const posted = await fetch(`${phone.origin}/__phone_readiness`, {
    method: 'POST', headers: { Origin: phone.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(report),
  });
  assert.equal(posted.status, 204);
  const records = await (await fetch(`${phone.origin}/__phone_readiness`)).json();
  assert.equal(records.length, 1);
  assert.equal(records[0].asset.failed, 0);
  assert.equal(records[0].graphics.renderer, 'Test WebGL');
  assert.equal(records[0].gate.status, 'Connecting to the town…');
  assert.equal((await fetch(`${phone.origin}/__phone_readiness`, {
    method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(report),
  })).status, 403);
});

test('opt-in phone frame report waits for a playable view and retains bounded render frames', { timeout: 90000 }, async t => {
  const phone = await startBrowserFixture({ env: { RIVER_OAKS_PHONE_FIXTURE_HOST: '127.0.0.1' } });
  t.after(() => phone.close());
  const ordinary = await (await fetch(`${phone.origin}/?phone-frame-report=1`)).text();
  assert.doesNotMatch(ordinary, /id="phone-frame-report"/);
  const html = await (await fetch(`${phone.origin}/?phone-avatar-decoder=html&phone-frame-report=1&render-audit=1`)).text();
  const script = html.match(/<script id="phone-frame-report">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);

  const scheduled = [], sent = [];
  const loading = { hidden: false }, gate = { hidden: false };
  let now = 0, starts = 0, stops = 0;
  const context = {
    document: { documentElement: { dataset: { phoneAvatarDecoder: 'html-images' } },
      querySelector: selector => selector === '#loading' ? loading : selector === '.multiplayer-gate' ? gate : null },
    performance: { now: () => now }, location: { search: '?phone-avatar-decoder=html&phone-frame-report=1&render-audit=1' }, URLSearchParams,
    __riverRenderAudit: { start: () => { starts++; }, stop: () => {
      stops++;
      return { frames: [{ intervalMs: 16.67, cpuMs: 3.42 }, { intervalMs: 33.34, cpuMs: 4.51 }], overflow: false };
    } },
    setTimeout: (fn, ms) => scheduled.push({ fn, ms }),
    fetch: (url, options) => { sent.push({ url, options }); return Promise.resolve(); },
  };
  runInNewContext(script, context);
  const firstPoll = scheduled.shift();
  assert.equal(firstPoll.ms, 250);
  now = 250;
  firstPoll.fn();
  assert.equal(starts, 0);
  loading.hidden = gate.hidden = true;
  now = 500;
  scheduled.shift().fn();
  assert.equal(starts, 1);
  const finishSample = scheduled.shift();
  assert.equal(finishSample.ms, 5000);
  now = 5500;
  finishSample.fn();
  assert.equal(stops, 1);
  assert.equal(sent.length, 1);
  assert.equal(scheduled.length, 0, 'one window by default');
  const report = JSON.parse(sent[0].options.body);
  assert.equal(report.mode, 'avatar-html');
  assert.deepEqual(report.sample.frames, [[16.67, 3.42], [33.34, 4.51]]);
  assert.equal(report.sample.overflow, false);
  const posted = await fetch(`${phone.origin}/__phone_readiness`, {
    method: 'POST', headers: { Origin: phone.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(report),
  });
  assert.equal(posted.status, 204);
  const records = await (await fetch(`${phone.origin}/__phone_readiness`)).json();
  assert.deepEqual(records[0].sample.frames, [[16.67, 3.42], [33.34, 4.51]]);
  assert.equal((await fetch(`${phone.origin}/__phone_readiness`, {
    method: 'POST', headers: { Origin: phone.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...report, sample: { ...report.sample, frames: [[-1, 4]] } }),
  })).status, 400);
});

test('phone frame report can take consecutive windows with render-phase totals and effective quality', { timeout: 90000 }, async t => {
  const phone = await startBrowserFixture({ env: { RIVER_OAKS_PHONE_FIXTURE_HOST: '127.0.0.1' } });
  t.after(() => phone.close());
  const search = '?phone-frame-report=1&render-audit=1&phone-frame-windows=2&phone-frame-seconds=10';
  const script = (await (await fetch(`${phone.origin}/${search}`)).text()).match(/<script id="phone-frame-report">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const scheduled = [], sent = [];
  let now = 0, starts = 0;
  const frame = (intervalMs, cpuMs, pipeline) => ({ intervalMs, cpuMs, phasesMs: { setup: 1, residents: 2, pipeline, tail: cpuMs - 3 - pipeline } });
  const context = {
    document: { documentElement: { dataset: {} }, querySelector: () => ({ hidden: true }) },
    performance: { now: () => now }, location: { search }, URLSearchParams,
    __riverRenderAudit: {
      start: () => { starts++; },
      stop: () => ({ frames: [frame(66, 20, 12), frame(70, 24, 15)], overflow: false }),
      graphics: () => ({ quality: { mode: 'auto', scale: 0.6, occlusion: false, fps: 15 }, render: { calls: 739, triangles: 2928000, points: 0 } }),
    },
    setTimeout: (fn, ms) => scheduled.push({ fn, ms }),
    fetch: (url, options) => { sent.push(JSON.parse(options.body)); return Promise.resolve(); },
  };
  runInNewContext(script, context);
  scheduled.shift().fn();
  assert.equal(starts, 1);
  for (const window of [0, 1]) {
    const finish = scheduled.shift();
    assert.equal(finish.ms, 10000);
    now += 10000; finish.fn();
    assert.equal(sent.at(-1).window, window);
  }
  assert.equal(starts, 2);
  assert.equal(scheduled.length, 0, 'stops after the requested windows');
  assert.deepEqual(sent[0].sample.phases, { setup: 2, residents: 4, pipeline: 27, tail: 11 });
  assert.deepEqual(sent[0].quality, { mode: 'auto', scale: 0.6, occlusion: false });
  assert.deepEqual(sent[0].render, { calls: 739, triangles: 2928000 });
  const post = body => fetch(`${phone.origin}/__phone_readiness`, {
    method: 'POST', headers: { Origin: phone.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post(sent[1])).status, 204);
  const [record] = await (await fetch(`${phone.origin}/__phone_readiness`)).json();
  assert.equal(record.window, 1);
  assert.deepEqual(record.sample.phases, sent[1].sample.phases);
  assert.deepEqual(record.quality, { mode: 'auto', scale: 0.6, occlusion: false });
  assert.equal((await post({ ...sent[1], sample: { ...sent[1].sample, phases: { gpu: 1 } } })).status, 400);
  assert.equal((await post({ ...sent[1], window: 60 })).status, 400);

  // The shadow-caster A/B alternates variants window by window, starting with every caster.
  const abSearch = `${search}&phone-frame-ab=shadow-casters`;
  const abScript = (await (await fetch(`${phone.origin}/${abSearch}`)).text()).match(/<script id="phone-frame-report">([\s\S]*?)<\/script>/)?.[1];
  const variants = [], abSent = [], abScheduled = [];
  runInNewContext(abScript, { ...context, location: { search: abSearch },
    __riverRenderAudit: { ...context.__riverRenderAudit, shadowCasters: mode => { variants.push(mode); } },
    setTimeout: (fn, ms) => abScheduled.push({ fn, ms }),
    fetch: (url, options) => { abSent.push(JSON.parse(options.body)); return Promise.resolve(); } });
  abScheduled.shift().fn();
  while (abScheduled.length) abScheduled.shift().fn();
  assert.deepEqual(variants, ['all', 'lean']);
  assert.deepEqual(abSent.map(report => report.variant), ['all', 'lean']);
  assert.equal((await post(abSent[1])).status, 204);
  assert.equal((await (await fetch(`${phone.origin}/__phone_readiness`)).json()).at(-1).variant, 'lean');
  assert.equal((await post({ ...abSent[1], variant: 'none' })).status, 400);
});

test('phone fixture can retain only bounded redacted app diagnostic summaries', { timeout: 90000 }, async t => {
  const phone = await startBrowserFixture({ env: { RIVER_OAKS_PHONE_FIXTURE_HOST: '127.0.0.1' } });
  t.after(() => phone.close());
  const ordinary = await (await fetch(phone.origin)).text();
  assert.doesNotMatch(ordinary, /html-proxy/);
  const html = await (await fetch(`${phone.origin}/?phone-errors=1`)).text();
  const proxy = html.match(/<script type="module" src="([^"]*html-proxy[^"]*)"/)?.[1];
  assert.ok(proxy, 'Vite proxies the opt-in inline module');
  const script = await (await fetch(new URL(proxy, phone.origin))).text();
  assert.match(script, /diagnosticLogs/);
  assert.doesNotMatch(script, /buildDebugReport\(/);
  const desktop = await startBrowserFixture();
  t.after(() => desktop.close());
  assert.doesNotMatch(await (await fetch(`${desktop.origin}/?phone-errors=1`)).text(), /html-proxy/);

  const body = { mode: 'normal', elapsedMs: 15000, diagnostics: {
    errors: [{ at: 14000, type: 'error', message: 'synthetic error' }],
    console: [], network: [],
  } };
  const post = value => fetch(`${phone.origin}/__phone_readiness`, {
    method: 'POST', headers: { Origin: phone.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
  assert.equal((await post(body)).status, 204);
  const reports = await (await fetch(`${phone.origin}/__phone_readiness`)).json();
  assert.deepEqual(reports[0].diagnostics.errors, [{ at: 14000, type: 'error', message: 'synthetic error' }]);
  assert.equal((await post({ ...body, diagnostics: { ...body.diagnostics,
    errors: Array.from({ length: 5 }, () => ({ at: 1, type: 'error', message: 'too many' })) } })).status, 400);
});
