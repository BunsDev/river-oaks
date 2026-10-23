import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter, once } from 'node:events';
import vm from 'node:vm';
import { WebSocket, WebSocketServer } from 'ws';
import { createCampusStartupReadiness as createStartupReadiness, waitForCampusLift } from '../e2e/garden-campus-readiness.js';

// A thin page/Playwright event façade over real loopback frames. No renderer,
// Vite, authentication or heartbeat coverage is claimed by these tests.
async function fixture(onCommand) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const page = new EventEmitter(), logs = [], connections = [];
  const state = { connected: false, selfId: 'alice', snapshot: null };
  let current, sequence = 0, players = [{ id: 'alice' }];
  const button = { textContent: 'Take the lift up', hidden: false, disabled: false };
  const context = vm.createContext({ document: { querySelector: () => button }, window: {
    __riverMultiplayer: () => state,
    __riverMultiplayerCommand: message => {
      const wire = current;
      if (!state.connected || wire.socket.readyState !== WebSocket.OPEN) return Promise.resolve({ ok: false, message: 'Reconnect before taking an action.' });
      return new Promise((resolve, reject) => {
        const requestId = String(++sequence), frame = JSON.stringify({ ...message, requestId });
        wire.pending.set(requestId, { resolve, reject });
        wire.events.emit('framesent', { payload: frame }); wire.socket.send(frame);
      });
    },
  } });
  page.evaluate = (fn, argument) => Promise.resolve(vm.runInContext(`(${fn.toString()})(argument)`, vm.createContext({ ...context, argument })));
  page.waitForFunction = async (fn, argument, { timeout }) => {
    const deadline = Date.now() + timeout;
    while (!await page.evaluate(fn, argument)) {
      if (Date.now() >= deadline) throw new Error('Page predicate deadline');
      await new Promise(resolve => setTimeout(resolve, 2));
    }
  };
  const connect = async () => {
    const accepted = once(server, 'connection');
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/multiplayer`);
    const [peer] = await accepted;
    await once(socket, 'open');
    const events = new EventEmitter(), wire = { socket, peer, events, pending: new Map() };
    events.url = () => socket.url; events.isClosed = () => socket.readyState === WebSocket.CLOSED;
    current = wire; connections.push(wire); state.connected = true;
    page.emit('websocket', events);
    socket.on('message', raw => {
      events.emit('framereceived', { payload: raw });
      const message = JSON.parse(raw);
      if (message.type === 'snapshot' && current === wire) state.snapshot = message;
      const request = wire.pending.get(message.requestId);
      if (message.type === 'result' && request) { wire.pending.delete(message.requestId); request.resolve(message); }
    });
    socket.on('close', () => {
      if (current === wire) { state.connected = false; state.snapshot = null; }
      events.emit('close');
      for (const request of wire.pending.values()) request.reject(new Error('Disconnected. Your action was not confirmed.'));
      wire.pending.clear(); clearInterval(wire.snapshots);
    });
    peer.on('message', raw => onCommand(JSON.parse(raw), wire));
    wire.snapshots = setInterval(() => { if (peer.readyState === WebSocket.OPEN) peer.send(JSON.stringify({ type: 'snapshot', serverTimeMs: Date.now(), players })); }, 10);
    return wire;
  };
  const close = async () => {
    for (const wire of connections) { clearInterval(wire.snapshots); wire.socket.terminate(); wire.peer.terminate(); }
    await new Promise(resolve => server.close(resolve));
  };
  return { page, logs, connect, close, state, button, setPlayers: value => { players = value; } };
}

const reply = (wire, message, result = { ok: false, error: 'admin_only' }) => wire.peer.send(JSON.stringify({ type: 'result', requestId: message.requestId, ...result }));

test('fresh snapshots do not complete startup until a correlated application acknowledgement', async () => {
  const held = [], f = await fixture((message, wire) => held.push({ message, wire }));
  const startup = createStartupReadiness({ timeoutMs: 2000, log: record => f.logs.push(record) }); startup.track(f.page);
  try {
    await f.connect(); let settled = false;
    const readiness = startup.joined(f.page).then(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(settled, false); assert.equal(held.length, 1);
    reply(held[0].wire, { requestId: 'unrelated' });
    await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(settled, false);
    reply(held[0].wire, held[0].message); await readiness;
    assert.equal(f.logs.at(-1).event, 'ready'); assert.equal(f.logs.at(-1).attempts, 1);
  } finally { await f.close(); }
});

test('startup retries only the read-only exchange after normal connection recovery', async () => {
  let count = 0;
  const f = await fixture((message, wire) => {
    assert.equal(message.type, 'inventory'); assert.equal(message.action, 'list');
    if (++count === 1) { wire.peer.terminate(); setTimeout(() => { void f.connect(); }, 20); }
    else reply(wire, message);
  });
  const startup = createStartupReadiness({ timeoutMs: 2000, log: record => f.logs.push(record) }); startup.track(f.page);
  try {
    await f.connect(); await startup.joined(f.page);
    assert.equal(count, 2); assert.equal(f.logs.some(record => record.event === 'probe-transport-loss'), true);
    assert.equal(f.logs.at(-1).generation, 2);
  } finally { await f.close(); }
});

test('startup restarts admission when the socket changes before the probe is sent', async () => {
  let count = 0, first, replaced = false;
  const f = await fixture((message, wire) => { count++; reply(wire, message); });
  const startup = createStartupReadiness({ timeoutMs: 2000, log: record => f.logs.push(record) }); startup.track(f.page);
  const evaluate = f.page.evaluate;
  f.page.evaluate = async (fn, argument) => {
    // Schedule the real transport replacement at the browser evaluation seam.
    if (!replaced && fn.toString().includes('await window.__riverMultiplayerCommand')) {
      replaced = true;
      const closed = once(first.socket, 'close'); first.peer.terminate(); await closed;
      await f.connect();
      await f.page.waitForFunction(() => Boolean(window.__riverMultiplayer().snapshot), null, { timeout: 1000 });
    }
    return evaluate(fn, argument);
  };
  try {
    first = await f.connect(); await startup.joined(f.page);
    assert.equal(count, 2, 'a replacement socket must pass a fresh admission and probe checkpoint');
    assert.equal(f.logs.some(record => record.event === 'probe-socket-changed'), true);
    assert.equal(f.logs.at(-1).event, 'ready'); assert.equal(f.logs.at(-1).generation, 2);
  } finally { await f.close(); }
});

test('unexpected server permission errors fail immediately rather than retrying', async () => {
  let count = 0;
  const f = await fixture((message, wire) => { count++; reply(wire, message, { ok: false, error: 'invalid_character_operation' }); });
  const startup = createStartupReadiness({ timeoutMs: 2000, log: record => f.logs.push(record) }); startup.track(f.page);
  try {
    await f.connect(); await assert.rejects(startup.joined(f.page), /Unexpected startup response: invalid_character_operation/);
    assert.equal(count, 1); assert.equal(f.logs.some(record => record.event === 'ready'), false);
  } finally { await f.close(); }
});

test('the original deadline bounds an unacknowledged read-only exchange', async () => {
  const f = await fixture(() => {}), startup = createStartupReadiness({ timeoutMs: 150, log: record => f.logs.push(record) }); startup.track(f.page);
  try {
    await f.connect(); await assert.rejects(startup.joined(f.page), /Town startup exceeded its 150ms deadline/);
    assert.equal(f.logs.some(record => record.event === 'ready'), false);
  } finally { await f.close(); }
});

test('an acknowledgement on a superseded socket cannot establish startup readiness', async () => {
  let count = 0;
  const f = await fixture((message, wire) => {
    if (++count === 1) void f.connect().then(() => reply(wire, message));
    else reply(wire, message);
  });
  const startup = createStartupReadiness({ timeoutMs: 2000, log: record => f.logs.push(record) }); startup.track(f.page);
  try {
    await f.connect(); await startup.joined(f.page);
    assert.equal(count, 2); assert.equal(f.logs.some(record => record.event === 'probe-socket-changed'), true);
    assert.equal(f.logs.at(-1).generation, 2);
  } finally { await f.close(); }
});

test('recovery consumes the original startup budget instead of restarting it', async () => {
  let count = 0, started, lateAck;
  const f = await fixture((message, wire) => {
    if (++count === 1) setTimeout(() => { wire.peer.terminate(); setTimeout(() => { void f.connect(); }, 10); }, 100);
    else lateAck = setTimeout(() => reply(wire, message), Math.max(0, started + 550 - Date.now()));
  });
  const startup = createStartupReadiness({ timeoutMs: 500, log: record => f.logs.push(record) }); startup.track(f.page);
  try {
    await f.connect(); started = Date.now();
    // This reply would fit a fresh 500ms budget after recovery. It must not fit
    // the original deadline. Timer ordering, not host wall-clock speed, decides.
    await assert.rejects(startup.joined(f.page), /Town startup exceeded its 500ms deadline/);
    assert.equal(count, 2); assert.equal(f.logs.some(record => record.event === 'probe-transport-loss'), true);
  } finally { clearTimeout(lateAck); await f.close(); }
});


test('Playwright evaluation error decoration does not prevent startup recovery', async () => {
  let count = 0, reconnectTimer, reconnecting;
  const f = await fixture((message, wire) => {
    if (++count === 1) { wire.peer.terminate(); reconnectTimer = setTimeout(() => { reconnecting = f.connect(); }, 20); }
    else reply(wire, message);
  });
  const evaluate = f.page.evaluate;
  f.page.evaluate = (...args) => evaluate(...args).catch(error => { error.message = 'page.evaluate: ' + error.message; throw error; });
  const startup = createStartupReadiness({ timeoutMs: 2000, log: record => f.logs.push(record) }); startup.track(f.page);
  try {
    await f.connect(); await startup.joined(f.page);
    assert.equal(count, 2); assert.equal(f.logs.at(-1).event, 'ready');
  } finally {
    clearTimeout(reconnectTimer); await reconnecting; await f.close();
  }
});


test('the lift waits for the published authoritative pose before its single action', async () => {
  const f = await fixture(() => {}), outside = [1.31, 0, 18], inside = [1.2, 0, 18];
  let readiness, actions = 0;
  try {
    f.setPlayers([{ id: 'alice', position: outside, levelId: null }]); await f.connect();
    await f.page.waitForFunction(() => Boolean(window.__riverMultiplayer().snapshot), null, { timeout: 1000 });
    readiness = waitForCampusLift(f.page, [0, 0, 18], { timeoutMs: 1000 }).then(() => { actions++; });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(actions, 0, 'a local lift label cannot authorize an out-of-reach server pose');
    f.setPlayers([{ id: 'alice', position: inside, levelId: null }]);
    await readiness; assert.equal(actions, 1);
  } finally { await readiness?.catch(() => {}); await f.close(); }
});

test('the lift requires a live source-level pose and a usable prompt within its existing deadline', async () => {
  const f = await fixture(() => {});let readiness;
  try {
    f.setPlayers([{ id: 'alice', position: [1.2, 0, 18], levelId: 'garden-campus/l1' }]); await f.connect();
    await f.page.waitForFunction(() => Boolean(window.__riverMultiplayer().snapshot), null, { timeout: 1000 });
    readiness = waitForCampusLift(f.page, [0, 0, 18], { timeoutMs: 80 });
    await assert.rejects(readiness, /Page predicate deadline/);
    f.setPlayers([{ id: 'alice', position: [1.2, 0, 18], levelId: null }]); f.state.connected = false;
    await assert.rejects(waitForCampusLift(f.page, [0, 0, 18], { timeoutMs: 80 }), /Page predicate deadline/);
    f.state.connected = true; f.button.hidden = true;
    await assert.rejects(waitForCampusLift(f.page, [0, 0, 18], { timeoutMs: 80 }), /Page predicate deadline/);
    f.button.hidden = false; f.button.disabled = true;
    await assert.rejects(waitForCampusLift(f.page, [0, 0, 18], { timeoutMs: 80 }), /Page predicate deadline/);
    f.button.disabled = false;
    await waitForCampusLift(f.page, [0, 0, 18], { timeoutMs: 1000 });
  } finally { await readiness?.catch(() => {}); await f.close(); }
});


test('startup begun before the first socket waits for admission and its application acknowledgement', async () => {
  const held = [], f = await fixture((message, wire) => held.push({ message, wire }));
  const startup = createStartupReadiness({ timeoutMs: 2000, log: record => f.logs.push(record) });startup.track(f.page);
  let actions = 0, readiness;
  try {
    readiness = startup.joined(f.page).then(() => { actions++; });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(actions, 0);assert.equal(held.length, 0);
    await f.connect();
    await f.page.waitForFunction(() => Boolean(window.__riverMultiplayer().snapshot), null, { timeout: 1000 });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(actions, 0);assert.equal(held.length, 1);
    assert.equal(held[0].message.type, 'inventory');assert.equal(held[0].message.action, 'list');
    reply(held[0].wire, held[0].message);await readiness;
    assert.equal(actions, 1);assert.equal(held.length, 1);assert.equal(f.logs.at(-1).event, 'ready');
  } finally { await readiness?.catch(() => {});await f.close(); }
});
