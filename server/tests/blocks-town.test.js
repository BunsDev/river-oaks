import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createTown } from '../town.js';

// Blocking in the standalone town, over real HTTP and WebSocket: the blocked resident's
// chat and gestures stop reaching the blocker, and the blocker's stop reaching them,
// across a reconnect and a second tab, until the block is lifted.
async function freePort() {
  const server = createServer();await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();await new Promise(resolve => server.close(resolve));return port;
}
async function signIn(origin) {
  const response = await fetch(origin + '/auth/session'), session = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0];
  const post = (path, data = {}) => fetch(origin + path, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return { id: session.user.id, cookie, post };
}
// One socket for a signed-in resident: every chat line it has seen, and its latest snapshot.
async function connect(t, origin, person) {
  const ticket = (await (await person.post('/api/multiplayer/ticket')).json()).ticket;
  const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/multiplayer?protocol=3&ticket=${ticket}`, { headers: { Origin: origin, Cookie: person.cookie } });
  t.after(() => socket.terminate());
  const seen = new Set(), view = { latest: null }, results = new Map();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.type === 'result') results.get(message.requestId)?.(message);
      if (Array.isArray(message.chat)) { view.latest = message; for (const entry of message.chat) seen.add(entry.text); resolve(); }
    });
  });
  const command = message => new Promise(resolve => { const requestId = `r${results.size}`;results.set(requestId, ({ type, requestId: _, ...result }) => resolve(result));socket.send(JSON.stringify({ ...message, requestId })); });
  return { socket, seen, view, command, say: text => socket.send(JSON.stringify({ type: 'chat', text })) };
}
// Longer than the town's one-second chat cooldown, so every line is accepted.
const settle = (ms = 1100) => new Promise(resolve => setTimeout(resolve, ms));

test('a block in the standalone town holds across a reconnect and a second tab, and lifting it restores chat', { timeout: 40000 }, async t => {
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-blocks-'));
  const town = await createTown({ origin, env: { RIVER_OAKS_DEV_AUTH: 'local', RIVER_OAKS_ACCEPTANCE_FIXTURE: '1',
    MODERATION_FILE: join(temporary, 'moderation.json'), WAITLIST_FILE: join(temporary, 'waitlist.json'), BLOCKS_FILE: join(temporary, 'blocks.json') }, devAuth: 'local', staticRoot: null });
  await new Promise(resolve => town.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await town.close();await rm(temporary, { recursive: true, force: true }); });
  const owner = await signIn(origin), erin = await signIn(origin), pat = await signIn(origin), third = await signIn(origin);
  const ownerSocket = await connect(t, origin, owner), erinSocket = await connect(t, origin, erin), patSocket = await connect(t, origin, pat), thirdSocket = await connect(t, origin, third);
  assert.ok(ownerSocket);
  assert.equal((await erin.post('/api/blocks/add', { peerId: erin.id })).status, 400);
  assert.equal((await erin.post('/api/blocks/add', { peerId: 'dev-000000000000' })).status, 404);
  assert.equal((await erin.post('/api/blocks/add', { peerId: pat.id })).status, 200);
  assert.deepEqual((await (await erin.post('/api/blocks/list')).json()).blocked.map(item => item.id), [pat.id]);

  patSocket.say('pat-before-reconnect');erinSocket.say('erin-to-the-town');thirdSocket.say('third-one');
  await settle();
  assert.equal(erinSocket.seen.has('pat-before-reconnect'), false, 'the blocker no longer hears the blocked');
  assert.equal(patSocket.seen.has('erin-to-the-town'), false, 'the blocked no longer hears the blocker');
  assert.ok(erinSocket.seen.has('third-one') && patSocket.seen.has('third-one'), 'both sockets are live');
  assert.ok(thirdSocket.seen.has('pat-before-reconnect') && thirdSocket.seen.has('erin-to-the-town'), 'everyone else hears both');
  // The blocked resident's attempts read as an unavailable resident.
  assert.deepEqual(await (await pat.post('/api/social/request', { peerId: erin.id })).json(), { error: 'Meet this resident in the same world first.' });
  assert.equal((await pat.post('/api/profile/view', { peerId: erin.id })).status, 404);
  // Travel toward Erin is answered as travel toward someone who left; unblocked, it would arrive.
  assert.deepEqual(await patSocket.command({ type: 'travel', peerId: erin.id }), await thirdSocket.command({ type: 'travel', peerId: 'dev-000000000000' }));
  // A gesture from Pat reaches Erin's view as nothing.
  patSocket.socket.send(JSON.stringify({ type: 'gesture', kind: 'wave' }));
  await settle(400);
  assert.equal(erinSocket.view.latest.players.find(player => player.id === pat.id)?.gesture ?? null, null);
  assert.ok(thirdSocket.view.latest.players.find(player => player.id === pat.id)?.gesture);

  // A reconnect, then a second tab: the block comes with the session, not the socket.
  erinSocket.socket.close();await settle(300);
  const again = await connect(t, origin, erin);
  patSocket.say('pat-after-reconnect');thirdSocket.say('third-two');await settle();
  assert.equal(again.seen.has('pat-after-reconnect'), false);
  assert.ok(again.seen.has('third-two'), 'the new socket is live');
  assert.ok(thirdSocket.seen.has('pat-after-reconnect'), 'the line was sent');
  assert.equal(again.view.latest.chat.some(entry => entry.authorId === pat.id), false, 'history from before is hidden too');
  const secondTab = await connect(t, origin, erin);
  patSocket.say('pat-second-tab');thirdSocket.say('third-three');await settle();
  assert.equal(secondTab.seen.has('pat-second-tab'), false);
  assert.ok(secondTab.seen.has('third-three'), 'the second tab is live');
  assert.ok(thirdSocket.seen.has('pat-second-tab'), 'the line was sent');

  assert.equal((await erin.post('/api/blocks/remove', { peerId: pat.id })).status, 200);
  await settle(200);
  patSocket.say('pat-after-unblock');await settle();
  assert.ok(secondTab.seen.has('pat-after-unblock'), 'lifting the block restores chat');
  assert.equal((await pat.post('/api/profile/view', { peerId: erin.id })).status, 200);
  assert.equal((await pat.post('/api/social/request', { peerId: erin.id })).status, 200);
  assert.equal((await patSocket.command({ type: 'travel', peerId: erin.id })).ok, true, 'travel to Erin works again');
});
