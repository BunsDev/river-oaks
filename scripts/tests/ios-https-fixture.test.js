import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';
import { WebSocket } from 'ws';
import { startWitness } from '../../experiments/ios-bundled-origin/witness.mjs';
import { startHTTPSFixture } from '../../experiments/ios-bundled-origin/https-fixture.mjs';

test('TLS fixture preserves real Origin/CSRF enforcement and secure bootstrap attributes', { timeout: 90000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'river-oaks-test-tls-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=River Oaks disposable test', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const key = readFileSync(join(dir, 'key.pem')), cert = readFileSync(join(dir, 'cert.pem'));
  const witness = await startWitness({ tls: { key, cert }, allowedOrigins: ['capacitor://localhost'] });
  t.after(() => witness.close());
  assert.match(witness.origin, /^https:\/\/127\.0\.0\.1:/);
  const witnessResult = await new Promise((resolve, reject) => {
    https.get(`${witness.origin}/witness/get`, { ca: cert, headers: { Origin: 'capacitor://localhost', Cookie: 'fixture_session=bob' } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ headers: res.headers, body: JSON.parse(text) }));
    }).on('error', reject);
  });
  assert.equal(witnessResult.headers['access-control-allow-origin'], 'capacitor://localhost');
  assert.deepEqual(witnessResult.body.cookieNames, ['fixture_session']);
  assert.equal(JSON.stringify(witnessResult.body).includes('bob'), false);
  const fixture = await startHTTPSFixture({ key, cert });
  t.after(() => fixture.close());
  const request = (path, { headers = {}, method = 'GET', trusted = true } = {}) => new Promise((resolve, reject) => {
    const req = https.request(`${fixture.origin}${path}`, { method, headers, ...(trusted ? { ca: cert } : {}) }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    }); req.on('error', reject); req.end();
  });
  await assert.rejects(request('/', { trusted: false }), error => ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(error.code));
  const bootstrap = await request('/__host-cookie-bootstrap');
  assert.equal(bootstrap.status, 200);
  assert.deepEqual(bootstrap.headers['set-cookie'], ['fixture_session=bob; Path=/; Secure; HttpOnly; SameSite=Lax']);
  const headers = { Origin: fixture.origin, Cookie: 'fixture_session=bob', 'X-CSRF-Token': 'fixture-bob' };
  assert.equal(JSON.parse((await request('/auth/session', { headers })).body).authenticated, true);
  for (const wrong of [{ Origin: 'capacitor://localhost' }, { 'X-CSRF-Token': 'wrong' }]) assert.equal((await request('/api/multiplayer/ticket?world=river-oaks', { method: 'POST', headers: { ...headers, ...wrong } })).status, 403);
  assert.equal((await request('/api/multiplayer/ticket?world=river-oaks', { method: 'POST', headers: { Origin: fixture.origin, 'X-CSRF-Token': 'fixture-bob' } })).status, 401);
  const issued = await request('/api/multiplayer/ticket?world=river-oaks', { method: 'POST', headers });
  assert.equal(issued.status, 200);
  const ticket = JSON.parse(issued.body);
  const url = new URL('/multiplayer', fixture.origin.replace('https:', 'wss:'));
  url.search = new URLSearchParams({ ticket: ticket.ticket, world: ticket.worldId, protocol: ticket.protocolVersion });
  const socketStatus = origin => new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { ca: cert, headers: { Origin: origin, Cookie: 'fixture_session=bob' } });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('Socket control timed out')); }, 10000);
    ws.on('open', () => { clearTimeout(timer); ws.close(); resolve(101); });
    ws.on('unexpected-response', (_req, res) => { clearTimeout(timer); res.resume(); resolve(res.statusCode); });
    ws.on('error', reject);
  });
  assert.equal(await socketStatus('capacitor://localhost'), 403);
  assert.equal(await socketStatus(fixture.origin), 101);
  assert.ok(fixture.records.some(r => r.origin === 'capacitor://localhost' && r.upgrade === 'websocket'));
  assert.equal(JSON.stringify(fixture.records).includes(ticket.ticket), false, 'ticket values must never enter retained request metadata');
  assert.equal(JSON.stringify(fixture.records).includes('fixture-bob'), false, 'CSRF values must never enter retained request metadata');
});
