import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createDistributedServer } from '../distributed-app.js';
import { approvedWaitlist } from './waitlist-fixture.js';

for (const failure of ['snapshot-read', 'join-acknowledgment']) {
  test(`releases a committed connection after ${failure} failure`, { timeout: 3000 }, async t => {
    const identity = { userId: 'resident', sessionId: 'session', name: 'Resident', expiresAt: Date.now() + 60000 };
    let committed, leave;
    let resolveLeave;
    const left = new Promise(resolve => { resolveLeave = resolve; });
    const room = {
      async request(command) {
        if (command.type === 'join') {
          committed = { userId: command.identity.userId, connectionId: command.connectionId };
          if (failure === 'join-acknowledgment') throw new Error('Join committed, acknowledgment lost');
          return { ok: true };
        }
        if (command.type === 'leave') { leave = command; resolveLeave(true); }
        return { ok: true };
      },
      async read() { throw new Error('Snapshot read unavailable after join'); },
      async tick() { return null; },
    };
    const auth = { authenticate: async () => identity, handle: async () => false };
    const security = { allow: async () => true, isBanned: async () => false, consumeTicket: async () => true };
    const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, origin: 'http://localhost' });
    t.after(() => app.close());
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/multiplayer?protocol=2&ticket=test`, { headers: { Origin: 'http://localhost' } });
    t.after(() => ws.terminate());
    const [code] = await once(ws, 'close');
    assert.equal(code, 1013);
    let timer;
    const released = await Promise.race([left, new Promise(resolve => { timer = setTimeout(() => resolve(false), 200); })]);
    clearTimeout(timer);
    assert.equal(released, true, 'Failed initialization must release the possibly committed join');
    assert.deepEqual(leave, { type: 'leave', ...committed }, 'Cleanup must target only its own connection');
  });
}

test('coalesces waiting poses without reordering them across travel', { timeout: 3000 }, async t => {
  const identity = { userId: 'resident', sessionId: 'session', name: 'Resident', expiresAt: Date.now() + 60000 };
  const executed = [];
  let active;
  let releaseFirst, startedFirst, completed;
  const blocked = new Promise(resolve => { releaseFirst = resolve; });
  const started = new Promise(resolve => { startedFirst = resolve; });
  const finished = new Promise(resolve => { completed = resolve; });
  const room = {
    async request(command) {
      if (command.type === 'join') active = { userId: identity.userId, connectionId: command.connectionId };
      if (command.type !== 'command') return { ok: true };
      executed.push(command.message);
      if (executed.length === 1) { startedFirst(); await blocked; }
      if (executed.length === 4) completed(true);
      return { ok: true };
    },
    async read() { return { snapshot: { type: 'snapshot', players: [] }, connections: active ? [active] : [] }; },
    async tick() { return null; },
  };
  const auth = { authenticate: async () => identity, handle: async () => false };
  const security = { allow: async () => true, isBanned: async () => false, consumeTicket: async () => true };
  const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, origin: 'http://localhost' });
  t.after(async () => { releaseFirst(); await app.close(); });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/multiplayer?protocol=2&ticket=test`, { headers: { Origin: 'http://localhost' } });
  t.after(() => ws.terminate());
  await once(ws, 'message');
  const pose = value => ({ type: 'pose', position: [value, 0, 0], yaw: 0, altitude: 0 });
  ws.send(JSON.stringify(pose(0)));
  await started;
  for (let i = 1; i <= 12; i++) ws.send(JSON.stringify(pose(i)));
  ws.send(JSON.stringify({ type: 'travel', storeId: 'store' }));
  for (let i = 13; i <= 24; i++) ws.send(JSON.stringify(pose(i)));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(ws.readyState, WebSocket.OPEN, 'Waiting poses must not exhaust the command queue');
  releaseFirst();
  let timer;
  const done = await Promise.race([finished, new Promise(resolve => { timer = setTimeout(() => resolve(false), 500); })]);
  clearTimeout(timer);
  assert.equal(done, true);
  assert.deepEqual(executed, [pose(0), pose(12), { type: 'travel', storeId: 'store' }, pose(24)]);
});

test('durable travel acknowledgment does not wait for the broadcast read', { timeout: 3000 }, async t => {
  const identity = { userId: 'resident', sessionId: 'session', name: 'Resident', expiresAt: Date.now() + 60000 };
  let active,committed=false,releaseRead;
  const blockedRead=new Promise(resolve=>{releaseRead=resolve;});
  const room={
    async request(command){
      if(command.type==='join')active={userId:identity.userId,connectionId:command.connectionId};
      if(command.type==='command'){committed=true;return {ok:true,player:{id:identity.userId,position:[1,2,3]}};}
      return {ok:true};
    },
    async read(){if(committed)await blockedRead;return {snapshot:{type:'snapshot',players:[]},connections:active?[active]:[]};},
    async tick(){return null;},
  };
  const auth={authenticate:async()=>identity,handle:async()=>false};
  const security={allow:async()=>true,isBanned:async()=>false,consumeTicket:async()=>true};
  const app=createDistributedServer({auth,security,room,waitlist:approvedWaitlist,origin:'http://localhost'});
  t.after(async()=>{releaseRead();await app.close();});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const ws=new WebSocket(`ws://127.0.0.1:${app.server.address().port}/multiplayer?protocol=2&ticket=test`,{headers:{Origin:'http://localhost'}});
  t.after(()=>ws.terminate());
  await once(ws,'message');
  ws.send(JSON.stringify({type:'travel',storeId:'store',requestId:'travel'}));
  let timeout;
  const acknowledged=await Promise.race([
    once(ws,'message').then(([raw])=>JSON.parse(raw)),
    new Promise(resolve=>{timeout=setTimeout(()=>resolve(null),1000);}),
  ]);
  clearTimeout(timeout);
  assert.deepEqual(acknowledged,{type:'result',requestId:'travel',ok:true,player:{id:identity.userId,position:[1,2,3]}});
  releaseRead();
  const [raw]=await once(ws,'message');
  assert.equal(JSON.parse(raw).type,'snapshot');
});

test('compresses public snapshots without leaking private view fields and bounds inflated frames', { timeout: 3000 }, async t => {
  const identity = { userId: 'resident', sessionId: 'private-session', csrfToken: 'private-csrf', name: 'Resident', expiresAt: Date.now() + 60000 };
  let active;
  let commands = 0;
  const snapshot = { type: 'snapshot', players: [{ id: identity.userId, name: identity.name }], locals: Array.from({ length: 50 }, (_, i) => ({ id: `local-${i}`, name: 'Neighbor' })) };
  const room = {
    async request(command) {
      if (command.type === 'join') active = { userId: identity.userId, connectionId: command.connectionId, identity };
      if (command.type === 'command') commands++;
      return { ok: true };
    },
    async read() { return { snapshot, connections: [active], checkpoint: { secret: 'private-checkpoint' } }; },
    async tick() { return null; },
  };
  const auth = { authenticate: async () => identity, handle: async () => false };
  const security = { allow: async () => true, isBanned: async () => false, consumeTicket: async () => true };
  const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, origin: 'http://localhost' });
  t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/multiplayer?protocol=2&ticket=test`, { headers: { Origin: 'http://localhost' } });
  t.after(() => ws.terminate());
  let extensions;
  ws.once('upgrade', response => { extensions = response.headers['sec-websocket-extensions']; });
  const [raw] = await once(ws, 'message');
  assert.match(extensions ?? '', /permessage-deflate/);
  assert.match(extensions, /server_no_context_takeover/);
  assert.match(extensions, /client_no_context_takeover/);
  assert.deepEqual(JSON.parse(raw), { ...snapshot, selfId: identity.userId });
  assert.doesNotMatch(raw.toString(), /private-session|private-csrf|private-checkpoint|connectionId|expiresAt|csrfToken|sessionId/);
  const closed = once(ws, 'close');
  ws.send(JSON.stringify({ type: 'pose', padding: 'x'.repeat(4096) }), { compress: true });
  const [code] = await closed;
  assert.equal(code, 1009, 'Payload limit applies after decompression');
  assert.equal(commands, 0, 'Oversized compressed input never reaches the room');
});
