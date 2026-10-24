// Isolated probe behavior check, not browser or product acceptance.
// Removing the probe's stopped-state fence must fail the final assertion.
import assert from 'node:assert/strict';
import { installInputAuthorityTrace, captureInputAuthorityEvidence } from '../e2e/input-authority-trace.js';

const nativeSends = [];
class Socket extends EventTarget {
  static OPEN = 1;
  constructor(...args) { super(); this.args = args; }
  send(data) { nativeSends.push(data); return 123; }
}
class ElementStub {}
globalThis.Element = ElementStub;
const self = { id: 'fixture-self', position: [1, 2, 3], yaw: 0, altitude: 0, sitting: null };
globalThis.document = Object.assign(new EventTarget(), {
  querySelector: () => null, elementFromPoint: () => null,
  hasFocus: () => true, hidden: false, activeElement: null,
});
globalThis.window = Object.assign(new EventTarget(), {
  WebSocket: Socket,
  __riverMultiplayer: () => ({ selfId: self.id, connected: true, snapshot: { players: [self] } }),
  __riverCarriage: () => ({ pose: { ...self, speed: 0, velocity: [0, 0] } }),
});
globalThis.location = { href: 'http://127.0.0.1:43210/' };
const originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
let stoppedTimer = false;
globalThis.setInterval = () => 7;
globalThis.clearInterval = id => { assert.equal(id, 7); stoppedTimer = true; };
try {
  installInputAuthorityTrace();
  const socket = new window.WebSocket('ws://127.0.0.1:43210/multiplayer?ticket=synthetic-private-marker');
  const payload = JSON.stringify({ type: 'stand', requestId: '5', ignored: 'synthetic-private-marker' });
  assert.equal(socket.send(payload), 123);
  assert.equal(nativeSends.at(-1), payload, 'the probe forwards bytes and return value unchanged');
  socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'result', requestId: '5', ok: true, player: self, ignored: 'synthetic-private-marker' }) }));
  const trace = window.__commonsInputAuthorityTrace;
  assert.equal(trace.events.find(event => event.kind === 'authority-result').command, 'stand');
  assert.ok(!JSON.stringify(trace).includes('synthetic-private-marker'), 'ignored payload fields and ticket URL must stay out of trace');
  assert.ok(trace.events.every(event => Number.isFinite(event.epochMs)));
  const key = new Event('keydown', { cancelable: true });
  Object.defineProperties(key, { code: { value: 'KeyW' }, repeat: { value: false } });
  document.dispatchEvent(key);
  await new Promise(queueMicrotask);
  const keyObservation = trace.events.find(event => event.kind === 'keydown');
  assert.equal(keyObservation.code, 'KeyW');
  assert.equal(Object.hasOwn(keyObservation, 'prevented'), false, 'capture-phase observation must not claim downstream handler acceptance');
  for (let index = 0; index < 6100; index++) window.dispatchEvent(new Event('blur'));
  assert.ok(trace.events.length <= 6000, 'long diagnostics retain a bounded event ring');
  assert.ok(trace.dropped >= 1000);
  assert.equal(trace.events[0].kind, 'probe-installed', 'initial event context survives ring trimming');
  const dump = trace.stop();
  assert.ok(dump.coordinateFrames.local.position.includes('eyeY'));
  assert.ok(dump.coordinateFrames.authoritative.position.includes('groundZ'));
  assert.ok(dump.coordinateFrames.clientCommand.position.includes('groundZ'));

  assert.equal(stoppedTimer, true);
  assert.equal(window.WebSocket, Socket);
  const count = dump.events.length;
  socket.send(payload);
  assert.equal(nativeSends.at(-1), payload);
  assert.equal(trace.events.length, count, 'stopped probe must not record sends from existing sockets');
  console.log('passed: passthrough, allowlist, acknowledgement correlation, timestamp and stopped cleanup');
} finally {
  globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear;
}

const captures = [];
const evidence = await captureInputAuthorityEvidence([
  ['owner', { async evaluate() { captures.push('owner trace'); throw new Error('fixture trace unavailable'); }, async screenshot() { captures.push('owner screenshot'); } }],
  ['peer', { async evaluate() { captures.push('peer trace'); return { events: [{ kind: 'fixture' }] }; }, async screenshot() { captures.push('peer screenshot'); throw new Error('fixture screenshot unavailable'); } }],
]);
assert.equal(evidence.length, 2);
assert.equal(evidence[0].traceError, 'fixture trace unavailable');
assert.equal(evidence[1].trace.events[0].kind, 'fixture');
assert.equal(evidence[1].screenshotError, 'fixture screenshot unavailable');
assert.equal(captures.length, 4, 'one capture failure cannot prevent the other page or screenshot');
console.log('passed: both-page capture and independent evidence failure preservation');
