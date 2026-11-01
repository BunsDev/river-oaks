// The bundled-origin experiment's header witness (#286): it must report what a
// client sent, by header name, over real HTTP and a real WebSocket upgrade, let
// any origin read the answer, and summarize results the same way for every mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { WebSocket } from 'ws';
import { comparisonRows, cookieNames, describeRequest, startWitness, summarize } from '../../experiments/ios-bundled-origin/witness.mjs';

test('cookies are reported by name only', () => {
  assert.deepEqual(cookieNames('fixture_session=bob; river_oaks_gate=v1.123.abc'), ['fixture_session', 'river_oaks_gate']);
  assert.deepEqual(cookieNames(undefined), []);
  assert.deepEqual(cookieNames(''), []);
  const seen = describeRequest({ method: 'GET', url: '/witness/get', headers: { cookie: 'fixture_session=bob', origin: 'capacitor://localhost', 'sec-fetch-site': 'cross-site' } });
  assert.equal(JSON.stringify(seen).includes('bob'), false, 'no cookie value is reported');
  assert.deepEqual(seen.cookieNames, ['fixture_session']);
  assert.equal(seen.origin, 'capacitor://localhost');
  assert.equal(seen.secFetchSite, 'cross-site');
  assert.equal(seen.csrfToken, false);
});

test('the witness echoes request headers over HTTP, preflight and WebSocket, to any origin', async t => {
  const witness = await startWitness();
  t.after(() => witness.close());
  const response = await fetch(`${witness.origin}/witness/post`, { method: 'POST', headers: { Origin: 'capacitor://localhost', Cookie: 'fixture_session=bob', 'X-CSRF-Token': 'fixture-bob', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  const echo = await response.json();
  assert.equal(echo.method, 'POST');
  assert.equal(echo.origin, 'capacitor://localhost');
  assert.deepEqual(echo.cookieNames, ['fixture_session']);
  assert.equal(echo.csrfToken, true);
  const preflight = await fetch(`${witness.origin}/witness/post`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'content-type, x-csrf-token');
  const anonymous = await fetch(`${witness.origin}/witness/get`);
  assert.equal(anonymous.headers.get('access-control-allow-origin'), '*');
  assert.equal(anonymous.headers.get('access-control-allow-credentials'), null);
  assert.equal((await anonymous.json()).origin, null);
  const upgrade = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${witness.origin.replace('http', 'ws')}/witness/socket`, { headers: { Origin: 'capacitor://localhost', Cookie: 'fixture_session=bob' } });
    ws.on('message', data => resolve(JSON.parse(data)));
    ws.on('error', reject);
  });
  assert.equal(upgrade.upgrade, 'websocket');
  assert.equal(upgrade.origin, 'capacitor://localhost');
  assert.deepEqual(upgrade.cookieNames, ['fixture_session']);
  assert.equal(witness.records.length, 4);
  assert.deepEqual(witness.records.map(r => r.method), ['POST', 'OPTIONS', 'GET', 'GET']);
});

test('summaries name the verdict and the headers, never a value', () => {
  assert.equal(summarize({ ok: false, error: 'TypeError: Load failed' }), 'failed: TypeError: Load failed');
  assert.equal(summarize({ ok: true, status: 200, body: { origin: null, cookieNames: ['fixture_session'], secFetchSite: 'same-origin' } }), 'HTTP 200: Origin absent; cookies [fixture_session]; Sec-Fetch-Site same-origin');
  assert.equal(summarize({ ok: true, status: 200, body: { authenticated: false } }), 'HTTP 200: authenticated false');
  assert.equal(summarize({ ok: true, status: 403, body: { error: 'Invalid request origin or security token.' } }), 'HTTP 403: error Invalid request origin or security token.');
  assert.equal(summarize({ ok: true, status: 200, issued: true, error: null }), 'HTTP 200, ticket issued');
  assert.equal(summarize({ ok: true, open: true, echo: { origin: 'capacitor://localhost', cookieNames: [] } }), 'opened: Origin capacitor://localhost; cookies []');
  assert.equal(summarize({ ok: true, open: false, closeCode: 1006, wasClean: false }), 'never opened (close 1006)');
  assert.equal(summarize({ ok: true, loaded: true }), 'loaded');
  assert.equal(summarize({ ok: true }), 'ok');
  assert.equal(summarize({ ok: false }), 'failed');
  assert.equal(summarize(undefined), 'undefined');
  const rows = comparisonRows({ hosted: { checks: { a: { ok: true }, b: { ok: true, loaded: true } } }, bundled: { checks: { a: { ok: false, error: 'E: no' } } } });
  assert.deepEqual(rows, [{ check: 'a', hosted: 'ok', bundled: 'failed: E: no' }, { check: 'b', hosted: 'loaded', bundled: 'undefined' }]);
});


test('worker summaries do not turn a quiet timeout into verified startup', () => {
  assert.equal(summarize({ ok: true, noErrorObserved: true, startupVerified: false, windowMs: 3000 }), 'no error observed in 3000 ms; worker startup unverified');
});

test('runner rejects unknown or duplicate modes before native work', () => {
  for (const modes of ['hosetd', '', 'hosted,hosted']) {
    const run = spawnSync(process.execPath, ['experiments/ios-bundled-origin/run.mjs', '--modes', modes], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Invalid modes/);
  }
});

test('runner refuses a directory that cannot match its fixed play manifest', () => {
  const run = spawnSync(process.execPath, ['experiments/ios-bundled-origin/run.mjs', '--play-dir', '/tmp/unrelated-play-bundle'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /play-dir must match dist\/play/);
});
