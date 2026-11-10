import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createSecurityTimeline } from '../e2e/security-timeline.js';

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'river-security-timeline-'));
  const server = createServer(), wss = new WebSocketServer({ noServer: true });
  let accepted;
  server.on('upgrade', (request, socket, head) => wss.handleUpgrade(request, socket, head, ws => { accepted = ws; }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const timeline = await createSecurityTimeline({ directory, ...options });
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/multiplayer?ticket=private-ticket-marker`);
  await once(client, 'open');
  t.after(async () => {
    client.terminate(); for (const socket of wss.clients) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
    await timeline.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  });
  const output = join(directory, `events-${process.pid}.jsonl`);
  const read = async () => (await readFile(output, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const health = async () => JSON.parse(await readFile(join(directory, `health-${process.pid}.json`), 'utf8'));
  return { directory, output, timeline, client, socket: accepted, read, health };
}

test('security timeline observes direct upgrade, delivery, pong and close without retaining private values', async t => {
  const { timeline, client, socket, read, health } = await fixture(t);
  const message = once(client, 'message');
  const sent = new Promise((resolve, reject) => socket.send('private-payload-marker', error => error ? reject(error) : resolve()));
  assert.equal((await message)[0].toString(), 'private-payload-marker');
  await sent;
  const pong = once(socket, 'pong'); socket.ping(); await pong;
  const closed = once(socket, 'close'), clientClosed = once(client, 'close');
  socket.close(4001, 'private-reason-marker');
  assert.equal((await clientClosed)[0], 4001); await closed;
  const result = await timeline.close();
  assert.equal(result.writeFailure, null);
  assert.ok(result.finishedAt >= result.startedAt);
  const events = await read(), serialized = JSON.stringify(events);
  assert.equal(events.filter(event => event.kind === 'server-socket-connected').length, 1);
  assert.ok(events.some(event => event.kind === 'server-send-gap' && event.sends === 1));
  assert.ok(events.some(event => event.kind === 'server-pong'));
  assert.ok(events.some(event => event.kind === 'server-socket-close' && event.code === 4001));
  assert.doesNotMatch(serialized, /private-ticket-marker|private-payload-marker|private-reason-marker|127\.0\.0\.1/);
  assert.deepEqual(await health(), result);
  assert.deepEqual(await timeline.close(), result, 'cleanup is idempotent');
});

test('security timeline caps observations without dropping transport traffic and stops recording after close', async t => {
  const { timeline, client, socket, read, health } = await fixture(t, { limit: 3 });
  for (let i = 0; i < 12; i++) {
    const pong = once(socket, 'pong'); socket.ping(); await pong;
  }
  const result = await timeline.close();
  assert.equal(result.events, 3); assert.ok(result.dropped > 0);
  assert.equal((await read()).length, 4, 'one start row plus the bounded observations');
  const message = once(client, 'message'); socket.send('after-observation');
  assert.equal((await message)[0].toString(), 'after-observation', 'transport remains usable after instrumentation cleanup');
  assert.equal((await read()).length, 4);
  assert.equal((await health()).writeFailure, null);
});

test('security timeline reports lost event output separately with no filesystem error text', async t => {
  const { timeline, socket, output, health } = await fixture(t);
  // Finish the initial connection row before making later appends fail.
  await new Promise(resolve => setImmediate(resolve));
  await rm(output, { force: true }); await mkdir(output);
  socket.ping();
  await assert.rejects(timeline.close(), /Security timeline event output failed/);
  const result = await health();
  assert.equal(result.writeFailure, 'event-write-failed');
  assert.doesNotMatch(JSON.stringify(result), /river-security-timeline-|EISDIR|private-/);
});

test('security timeline projects browser metadata and rejects unknown or oversized private values', async t => {
  const { timeline, read } = await fixture(t);
  let receive;
  await timeline.observeContext({ async exposeBinding(_name, callback) { receive = callback; }, async addInitScript() {} });
  const privateText = 'private-browser-marker'.repeat(10_000);
  receive({}, { kind: 'sample', documentEpoch: 123, pageAt: 10, ticket: privateText, url: privateText, appInert: true,
    frames: Infinity, visibility: privateText, multiplayer: 'joined', launcher: { x: -10, y: 5, width: 20, height: 30,
      label: privateText, hit: Array.from({ length: 100 }, () => ({ tag: 'BUTTON', target: 'settings-toggle', gate: false, accountId: privateText })) } });
  receive({}, { kind: 'socket-close', documentEpoch: 123, pageAt: 11, code: 4001, reason: privateText, wasClean: true });
  receive({}, { kind: privateText, documentEpoch: 123, pageAt: 12 });
  const result = await timeline.close(), events = await read();
  assert.equal(result.rejectedBrowserEvents, 1);
  const sample = events.find(row => row.event?.kind === 'sample').event;
  assert.equal(sample.appInert, true); assert.equal(sample.multiplayer, 'joined');
  assert.equal(sample.launcher.x, -10); assert.equal(sample.launcher.hit.length, 4);
  assert.equal(sample.frames, undefined);
  assert.equal(events.find(row => row.event?.kind === 'socket-close').event.code, 4001);
  assert.doesNotMatch(JSON.stringify(events), /private-browser-marker|ticket|accountId/);
  assert.ok(events.every(event => Buffer.byteLength(JSON.stringify(event)) <= result.maxEventBytes));
});

test('security timeline cleanup emits health after context instrumentation fails during setup', async t => {
  const { timeline, health } = await fixture(t);
  await assert.rejects(timeline.observeContext({ async exposeBinding() { throw new Error('fixture setup failed'); } }), /fixture setup failed/);
  const result = await timeline.close();
  assert.equal(result.writeFailure, null);
  assert.deepEqual(await health(), result);
});

test('security timeline retains bounded source positions and capability enums without raw stacks or driver text', async t => {
  const { timeline, read } = await fixture(t);
  let receive;
  await timeline.observeContext({ async exposeBinding(_name, callback) { receive = callback; }, async addInitScript() {} });
  receive({}, { kind: 'gl-capabilities', documentEpoch: 1, pageAt: 1, glContext: 2, parallelCompile: true, rendererClass: 'llvmpipe', driver: 'private-driver-marker' });
  receive({}, { kind: 'slow-gl-call', documentEpoch: 1, pageAt: 2, glContext: 2, name: 'getProgramInfoLog', duration: 12000, stack: 'private-stack-marker', callers: [
    { asset: 'main-abc12345.js', line: 10, column: 20, url: 'private-origin-marker' },
    { asset: 'https://private-origin-marker/main-abc12345.js', line: 1, column: 2 },
    { asset: 'private-origin-marker'.repeat(100), line: 1, column: 2 },
    ...Array.from({ length: 30 }, () => ({ asset: 'three-abc12345.js', line: 3, column: 4 })),
  ] });
  await timeline.close();
  const rows = await read(), capability = rows.find(row => row.event?.kind === 'gl-capabilities').event;
  assert.equal(capability.parallelCompile, true); assert.equal(capability.rendererClass, 'llvmpipe');
  const gl = rows.find(row => row.event?.kind === 'slow-gl-call').event;
  assert.equal(gl.glContext, capability.glContext);
  assert.deepEqual(gl.callers[0], { asset: 'main-abc12345.js', line: 10, column: 20 });
  assert.ok(gl.callers.length <= 10);
  assert.doesNotMatch(JSON.stringify(rows), /private-(?:driver|stack|origin)-marker/);
});
