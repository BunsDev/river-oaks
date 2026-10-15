import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../app.js';
import { approvedWaitlist } from './waitlist-fixture.js';

// The standalone server serves the screening fixture (#367): video and caption types, and
// byte ranges, which Safari requires before it will play a video at all.
test('bundled screening media is served with its type and single byte ranges', async t => {
  const root = await mkdtemp(join(tmpdir(), 'river-oaks-static-'));
  await mkdir(join(root, 'assets/ipic/screening'), { recursive: true });
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
  await writeFile(join(root, 'assets/ipic/screening/fixture-v1.webm'), bytes);
  await writeFile(join(root, 'assets/ipic/screening/fixture-v1.en.vtt'), 'WEBVTT\n');
  const world = { players: new Map(), join() { return { ok: true }; }, leave() {}, command() { return { ok: true }; }, step() {}, snapshot() { return { players: [] }; }, worldId: 'river-oaks' };
  const app = createGameServer({ auth: { async handle() { return false; }, async authenticate() { return null; } }, world, waitlist: approvedWaitlist, origin: 'http://127.0.0.1', staticRoot: root });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const whole = await fetch(`${base}/assets/ipic/screening/fixture-v1.webm`);
  assert.deepEqual([whole.status, whole.headers.get('content-type'), whole.headers.get('accept-ranges')], [200, 'video/webm', 'bytes']);
  assert.equal((await whole.arrayBuffer()).byteLength, 1000);
  const part = await fetch(`${base}/assets/ipic/screening/fixture-v1.webm`, { headers: { Range: 'bytes=10-19' } });
  assert.deepEqual([part.status, part.headers.get('content-range'), part.headers.get('content-length')], [206, 'bytes 10-19/1000', '10']);
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [...bytes.subarray(10, 20)]);
  const tail = await fetch(`${base}/assets/ipic/screening/fixture-v1.webm`, { headers: { Range: 'bytes=990-' } });
  assert.deepEqual([tail.status, tail.headers.get('content-range')], [206, 'bytes 990-999/1000']);
  await tail.arrayBuffer();
  const beyond = await fetch(`${base}/assets/ipic/screening/fixture-v1.webm`, { headers: { Range: 'bytes=5000-6000' } });
  assert.deepEqual([beyond.status, beyond.headers.get('content-range')], [416, 'bytes */1000']);
  await beyond.arrayBuffer();
  const many = await fetch(`${base}/assets/ipic/screening/fixture-v1.webm`, { headers: { Range: 'bytes=0-1,5-6' } });
  assert.equal(many.status, 200, 'several ranges fall back to the whole file');
  await many.arrayBuffer();
  const captions = await fetch(`${base}/assets/ipic/screening/fixture-v1.en.vtt`);
  assert.equal(captions.headers.get('content-type'), 'text/vtt; charset=utf-8');
  await captions.arrayBuffer();
});
