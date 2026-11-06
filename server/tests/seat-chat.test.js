import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createRedisSocial } from '../social.js';
import { createMemoryBlocks, createRedisBlocks, seatChatFor } from '../blocks.js';
import { createRedisLandmarks } from '../landmarks.js';
import { SEAT_CHAT_RULES, createSeatChat } from '../seat-chat.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { SIT_REACH, benchSeats } from '../../preview/src/world-interactions.js';
import { seatClusters } from '../../preview/src/seat-clusters.js';
import { WORLD_PROTOCOL_VERSION } from '../../preview/src/world-contract.js';

// Seat chat (#825 slice 3, Val's decision 3): sitting shares nothing, text flows only after both
// people act, standing ends it, a block overrides it, the sender sees who receives it.
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const contract = JSON.parse(await readFile(new URL('../../config/ribbon/five-rooms.json', import.meta.url)));
const environment = createWalkingEnvironment(data), clusters = seatClusters(data);
const [counter, garden] = clusters;
// A walk over the walking rules, as a list of [east, north] points.
function routeTo(from, to, step = 0.25) {
  const key = (a, b) => `${a},${b}`, came = new Map([[key(0, 0), null]]), queue = [[0, 0]];
  while (queue.length && came.size < 40000) {
    const [a, b] = queue.shift(), point = [from[0] + a * step, from[1] + b * step];
    if (Math.hypot(point[0] - to[0], point[1] - to[1]) < step) {
      const path = [];
      for (let at = key(a, b); at; at = came.get(at)) { const [i, j] = at.split(',').map(Number);path.unshift([from[0] + i * step, from[1] + j * step]); }
      return path;
    }
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const na = a + da, nb = b + db, x = from[0] + na * step, north = from[1] + nb * step;
      if (came.has(key(na, nb)) || !environment.isFree(x, -north)) continue;
      came.set(key(na, nb), key(a, b));queue.push([na, nb]);
    }
  }
  return null;
}
const identity = userId => ({ userId, name: userId, sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });
const sitOn = seat => ({ type: 'sit', buildId: seat.buildId, slot: seat.slot });
const ask = peerId => ({ type: 'seatChat', action: 'invite', peerId }), yes = peerId => ({ type: 'seatChat', action: 'accept', peerId });
const say = (sessionId, text) => ({ type: 'seatChat', action: 'send', sessionId, text });

function setup(ids = ['alice', 'bob', 'carol']) {
  const clock = { time: 1_000_000 };
  const world = createSharedWorld(data, { now: () => clock.time });
  for (const id of ids) assert.equal(world.join(identity(id)).ok, true);
  const seat = (id, place) => {
    if (world.players.get(id).sitting) { clock.time += 2000; assert.equal(world.command(id, { type: 'stand' }).ok, true); }
    Object.assign(world.players.get(id), { position: [...place.approach, environment.groundAt(place.approach[0], -place.approach[1])], moveBudget: 1, liftBudget: 1 });
    clock.time += 2000;
    const result = world.command(id, sitOn(place));
    assert.equal(result.ok, true, `${id} sits: ${JSON.stringify(result)}`);
  };
  const act = (id, message) => { clock.time += 2000; return world.command(id, message); };
  return { clock, world, seat, act };
}
const talking = () => {
  const town = setup();
  town.seat('alice', counter.seats[0]);town.seat('bob', counter.seats[2]);
  assert.equal(town.act('alice', ask('bob')).ok, true);
  const accepted = town.act('bob', yes('alice'));
  assert.equal(accepted.ok, true);
  return { ...town, sessionId: accepted.sessionId };
};

test('clusters are real seats on walkable ground inside two Five Rooms venues, for the District only', () => {
  assert.deepEqual(clusters.map(cluster => cluster.venueId), ['venue:counter', 'venue:shade-garden']);
  const all = benchSeats(data);
  for (const cluster of clusters) {
    assert.equal(cluster.seats.length, 4);
    const rooms = new Set();
    for (const seat of cluster.seats) {
      assert.ok(all.some(item => item.buildId === seat.buildId && item.slot === seat.slot), 'every finish and the town read the same seats');
      assert.ok(environment.isFree(seat.x, -seat.north), `${seat.id} stands on free ground`);
      assert.ok(environment.isFree(seat.approach[0], -seat.approach[1]), `${seat.id} can be approached`);
      rooms.add(environment.roomAt(seat.x, -seat.north)?.storeId ?? null);
    }
    assert.equal(rooms.size, 1, 'one cluster, one room');
    assert.notEqual([...rooms][0], null);
    // Someone can walk from the venue's door to the seats: a search over the walking rules.
    const [door] = contract.venues.find(item => item.id === cluster.venueId).entrances;
    const reached = routeTo([door.centre[0] + door.outward[0] * 0.8, door.centre[1] + door.outward[1] * 0.8], cluster.seats[0].approach);
    assert.ok(reached, `${cluster.id}: walkable from its entrance`);
  }
  assert.deepEqual(seatClusters({ ...data, roads: [] }), [], 'a creator world without the District lane has none');
});

test("a cluster never adds a seat to a shop's arrival, door or doorstep", () => {
  // Found by contextual-first-visit: a seat within reach of the Hermès arrival added Sit to the
  // phone HUD's More, which the touch stick zone covers.
  for (const cluster of clusters) {
    const store = data.stores.find(item => item.id === environment.roomAt(cluster.center[0], -cluster.center[1])?.storeId);
    assert.ok(store, `${cluster.id} is in a mapped shop`);
    const door = [store.facade[0] - store.outward[0] * 0.8, store.facade[1] - store.outward[1] * 0.8];
    for (const mark of [store.position, store.facade, store.visit, door]) for (const seat of cluster.seats) {
      assert.ok(Math.hypot(seat.x - mark[0], seat.north - mark[1]) > SIT_REACH + 1, `${seat.id} is out of reach of ${store.name}'s ${mark}`);
    }
  }
});

test('sitting shares nothing: no view, no field and no flag says anyone is open to talk', () => {
  const { world, seat } = setup();
  const before = JSON.stringify(world.snapshot().players.find(player => player.id === 'alice'));
  seat('alice', counter.seats[0]);seat('bob', counter.seats[2]);
  assert.equal(world.seatChatView('alice'), null);
  assert.deepEqual(world.seatChatViews(), {});
  const seated = world.snapshot().players.find(player => player.id === 'alice');
  assert.deepEqual(Object.keys(seated).sort(), Object.keys(JSON.parse(before)).sort(), 'sitting adds no field to the public player');
  assert.equal(Object.hasOwn(world.snapshot(), 'seatChat'), false);
});

test('text flows only after both act; the sender sees who receives it; nobody else sees any of it', () => {
  const { world, seat, act } = setup();
  seat('alice', counter.seats[0]);seat('bob', counter.seats[2]);seat('carol', counter.seats[3]);
  assert.equal(act('alice', say(1, 'too soon')).error, 'seat_chat_ended', 'sitting beside someone is not a conversation');
  assert.equal(act('alice', ask('bob')).ok, true);
  assert.equal(act('alice', say(1, 'still too soon')).error, 'seat_chat_ended', 'asking alone is not a conversation');
  assert.deepEqual(world.seatChatView('alice').outgoing.to, { id: 'bob', name: 'bob' });
  assert.equal(world.seatChatView('bob').invites[0].from.id, 'alice');
  assert.equal(world.seatChatView('carol'), null, 'a third person in the cluster cannot see the request');
  const { sessionId } = act('bob', yes('alice'));
  assert.equal(act('alice', say(sessionId, 'secret-line-one')).to, 'bob', 'the answer names the recipient');
  assert.equal(world.seatChatView('alice').session.peer.name, 'bob');
  assert.equal(world.seatChatView('bob').session.messages[0].text, 'secret-line-one');
  assert.equal(world.seatChatView('carol'), null);
  assert.equal(act('carol', say(sessionId, 'gatecrash')).error, 'seat_chat_ended');
  assert.equal(JSON.stringify(world.snapshot()).includes('secret-line-one'), false, 'never in the shared snapshot');
  assert.deepEqual(world.snapshot().chat, [], 'never in town chat');
});

test('a request needs both people seated in one cluster, and every refusal reads alike', () => {
  const { world, seat, act } = setup();
  const unavailable = message => assert.equal(message.error, 'seat_chat_unavailable');
  unavailable(act('alice', ask('bob')));
  seat('alice', counter.seats[0]);
  unavailable(act('alice', ask('bob')));
  seat('bob', garden.seats[0]);
  unavailable(act('alice', ask('bob')));
  unavailable(act('alice', ask('alice')));
  unavailable(act('alice', ask('resident-not-here')));
  unavailable(act('alice', yes('bob')));
  // An ordinary storefront bench is not a cluster.
  const bench = benchSeats(data).find(item => item.buildId.startsWith('bench:osm-'));
  assert.ok(bench);
  assert.equal(act('alice', { type: 'seatChat', action: 'invite', peerId: 'bob', extra: 1 }).error, 'invalid_seat_chat');
  assert.equal(act('alice', { type: 'seatChat', action: 'nope' }).error, 'invalid_seat_chat');
});

test('standing ends the conversation, for both, and removes what was said', () => {
  const { world, seat, act, sessionId } = talking();
  act('alice', say(sessionId, 'before-standing'));
  assert.equal(act('bob', { type: 'stand' }).ok, true);
  assert.equal(world.seatChatView('alice'), null);
  assert.equal(world.seatChatView('bob'), null);
  assert.equal(act('alice', say(sessionId, 'late')).error, 'seat_chat_ended');
  assert.equal(JSON.stringify(world.checkpoint()).includes('before-standing'), false, 'gone from the checkpoint');
  assert.ok(seat);
});

test('a late answer fails after the asker stands, and a stale line never reaches a later conversation', () => {
  const { world, seat, act } = setup();
  seat('alice', counter.seats[0]);seat('bob', counter.seats[2]);seat('carol', counter.seats[3]);
  act('alice', ask('bob'));
  act('alice', { type: 'stand' });
  assert.equal(act('bob', yes('alice')).error, 'seat_chat_unavailable', 'a late accept finds nobody');
  seat('alice', counter.seats[0]);
  act('alice', ask('bob'));
  const first = act('bob', yes('alice')).sessionId;
  assert.equal(act('bob', { type: 'seatChat', action: 'leave' }).ok, true);
  act('alice', ask('carol'));
  const second = act('carol', yes('alice')).sessionId;
  assert.notEqual(first, second);
  assert.equal(act('alice', say(first, 'meant for bob')).error, 'seat_chat_ended');
  assert.deepEqual(world.seatChatView('carol').session.messages, [], 'carol never receives it');
});

test('declining and lapsing look the same to the asker and both stop repeat asking', () => {
  const { world, seat, act, clock } = setup();
  seat('alice', counter.seats[0]);seat('bob', counter.seats[2]);seat('carol', counter.seats[3]);
  act('alice', ask('bob'));
  assert.equal(act('bob', { type: 'seatChat', action: 'decline', peerId: 'alice' }).ok, true);
  assert.equal(world.seatChatView('alice'), null);
  assert.equal(act('alice', ask('bob')).error, 'seat_chat_unavailable', 'no asking again straight away');
  clock.time += SEAT_CHAT_RULES.retryMs;
  assert.equal(act('alice', ask('bob')).ok, true);
  clock.time += SEAT_CHAT_RULES.inviteMs;
  assert.equal(world.seatChatView('alice'), null, 'a lapsed request is gone the same way');
  assert.equal(world.seatChatView('bob'), null);
  assert.equal(act('bob', yes('alice')).error, 'seat_chat_unavailable');
  // Two people asking each other have both acted.
  act('carol', ask('bob'));
  const crossing = act('bob', ask('carol'));
  assert.equal(crossing.ok, true);
  assert.equal(world.seatChatView('carol').session.peer.id, 'bob');
});

test('a block ends it at once, and account erasure leaves no line behind', () => {
  const { world, act, sessionId } = talking();
  act('alice', say(sessionId, 'erase-me-please'));
  world.separate('bob', 'alice');
  assert.equal(world.seatChatView('alice'), null);
  assert.equal(world.seatChatView('bob'), null);
  const second = talking();
  second.act('alice', say(second.sessionId, 'erase-me-please'));
  second.world.forgetAccount('alice');
  assert.equal(second.world.seatChatView('bob'), null);
  assert.equal(JSON.stringify(second.world.checkpoint()).includes('erase-me-please'), false);
});

test('a hidden peer never reaches a frame, even before the world has heard of the block', () => {
  const view = { invites: [{ from: { id: 'bob', name: 'bob' }, expiresAt: 9 }], outgoing: { to: { id: 'bob', name: 'bob' }, expiresAt: 9 }, session: { id: 1, peer: { id: 'bob', name: 'bob' }, messages: [] } };
  assert.equal(seatChatFor(view, new Set(['bob'])), null);
  assert.equal(seatChatFor(view, new Set()), view);
  assert.equal(seatChatFor(null, new Set(['bob'])), null);
});

test('a conversation survives a checkpoint; an idle town saves nothing; a damaged save starts clean', () => {
  const { world, act, sessionId, clock } = talking();
  act('alice', say(sessionId, 'carried-across'));
  const next = createSharedWorld(data, { now: () => clock.time });
  assert.equal(next.restore(world.checkpoint()).ok, true);
  assert.equal(next.seatChatView('bob').session.messages[0].text, 'carried-across');
  clock.time += 2000;
  assert.equal(next.command('alice', say(sessionId, 'x')).ok, true, 'and goes on');
  const idle = setup();
  assert.equal(Object.hasOwn(idle.world.checkpoint().payload, 'seatChat'), false, 'an idle checkpoint has no new field for an older build to meet');
  const chat = createSeatChat({ clusterOf: () => 'c' });
  chat.restore({ invites: 'nope', sessions: [], retries: [], nextSession: 1, nextMessage: 1 });
  assert.equal(chat.live(), false);
  chat.restore({ invites: [], sessions: [{ id: 1, a: 'a', b: 'b', startedAt: 0, messages: [{ id: 1 }] }], retries: [], nextSession: 2, nextMessage: 2 });
  assert.equal(chat.live(), false);
});

test('a dropped connection keeps the seat and the talk until its grace ends', () => {
  const { world, sessionId, act } = talking();
  act('alice', say(sessionId, 'still-here'));
  assert.equal(world.seatChatView('alice').session.messages.length, 1, 'nothing changes while the seat is held');
  world.leave('alice');
  assert.equal(world.seatChatView('bob'), null, 'the grace ending takes the person, and the conversation');
});

test('messages stay within their bound and share the town chat cooldown', () => {
  const { world, act, sessionId, clock } = talking();
  for (let i = 0; i < SEAT_CHAT_RULES.messages + 5; i++) assert.equal(act('alice', say(sessionId, `line ${i}`)).ok, true);
  const { messages } = world.seatChatView('bob').session;
  assert.equal(messages.length, SEAT_CHAT_RULES.messages);
  assert.equal(messages.at(-1).text, `line ${SEAT_CHAT_RULES.messages + 4}`);
  clock.time += 10;
  assert.equal(world.command('alice', say(sessionId, 'too fast')).error, 'chat_cooldown');
  clock.time += 2000;
  assert.equal(world.command('alice', say(sessionId, 'bad\u0007text')).error, 'invalid_chat');
  assert.equal(world.command('alice', say(sessionId, 'x'.repeat(281))).error, 'invalid_chat');
});

// Over a real socket: what each account's frames actually carry.
async function connected(t, url, origin, user, ticketPath = '/api/multiplayer/ticket') {
  const headers = { Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' };
  const { ticket } = await (await fetch(url + ticketPath, { method: 'POST', headers, body: '{}' })).json();
  const ws = new WebSocket(`${url.replace('http:', 'ws:')}/multiplayer?${new URLSearchParams({ ticket, protocol: String(WORLD_PROTOCOL_VERSION) })}`, { headers: { Origin: origin, Cookie: headers.Cookie } });
  ws.on('error', () => {});t.after(() => ws.terminate());
  const client = { ws, raw: [], latest: null, results: new Map() };
  await new Promise(resolve => ws.on('message', raw => {
    const text = raw.toString();client.raw.push(text);
    const message = JSON.parse(text);
    if (message.type === 'result') client.results.get(message.requestId)?.(message);
    if (Array.isArray(message.chat)) { client.latest = message; if (message.selfId === user) resolve(); }
  }));
  client.command = message => new Promise(resolve => { const requestId = randomUUID();client.results.set(requestId, resolve);ws.send(JSON.stringify({ ...message, requestId })); });
  return client;
}
const until = async (check, label, ms = 8000) => { const start = Date.now();while (!check()) { if (Date.now() - start > ms) throw new Error(`Timed out: ${label}`);await new Promise(resolve => setTimeout(resolve, 25)); } };

test('over a real socket: only the two people receive the words, the filter screens them, and a block ends it', { timeout: 40000 }, async t => {
  const origin = 'https://sim.jev.works', sessions = new Map(['alice', 'bob', 'carol'].map(userId => [userId, { ...identity(userId), csrfToken: 'test-csrf' }]));
  const auth = { handle: async () => false, authenticate: async req => sessions.get(req.headers.cookie?.match(/test_session=(\w+)/)?.[1]) ?? null };
  const world = createSharedWorld(data), blocks = createMemoryBlocks();
  const contentFilter = { screen: (_field, text) => /forbidden/.test(text) ? { ok: false, message: 'Not that.' } : { ok: true, text } };
  const app = createGameServer({ auth, world, waitlist: approvedWaitlist, origin, blocks, contentFilter, blockSyncMs: 100 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const alice = await connected(t, url, origin, 'alice'), bob = await connected(t, url, origin, 'bob'), carol = await connected(t, url, origin, 'carol');
  const place = (id, seat) => Object.assign(world.players.get(id), { position: [...seat.approach, environment.groundAt(seat.approach[0], -seat.approach[1])], moveBudget: 1, liftBudget: 1 });
  place('alice', counter.seats[0]);place('bob', counter.seats[2]);place('carol', counter.seats[3]);
  assert.equal((await alice.command(sitOn(counter.seats[0]))).ok, true);
  assert.equal((await bob.command(sitOn(counter.seats[2]))).ok, true);
  assert.equal((await carol.command(sitOn(counter.seats[3]))).ok, true);
  assert.equal((await alice.command(ask('bob'))).ok, true);
  await until(() => bob.latest.seatChat?.invites?.length === 1, 'bob sees the request');
  assert.equal(alice.latest.seatChat.outgoing.to.id, 'bob');
  const accepted = await bob.command(yes('alice'));
  assert.equal(accepted.ok, true);
  assert.equal((await alice.command(say(accepted.sessionId, 'private-words-here'))).to, 'bob');
  await until(() => bob.latest.seatChat?.session?.messages?.length === 1, 'bob receives the words');
  assert.equal(bob.latest.seatChat.session.messages[0].text, 'private-words-here');
  await new Promise(resolve => setTimeout(resolve, 1100));
  const filtered = await alice.command(say(accepted.sessionId, 'something forbidden'));
  assert.equal(filtered.error, 'chat_filtered');
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(carol.raw.some(frame => frame.includes('private-words-here') || frame.includes('"seatChat"') || frame.includes('invites')), false, 'not one frame to carol carries any of it');
  assert.equal(JSON.stringify(world.snapshot()).includes('private-words-here'), false);
  // A reconnect brings the conversation back.
  bob.ws.terminate();
  const again = await connected(t, url, origin, 'bob');
  await until(() => again.latest.seatChat?.session?.messages?.length === 1, 'the reconnected socket reads its conversation');
  // A block toward an unblocked-looking peer reads as someone not there, and ends the talk.
  await blocks.add('bob', { userId: 'alice', name: 'alice' });
  world.separate('bob', 'alice');
  await until(() => !again.latest.seatChat && !alice.latest.seatChat, 'the block ends it for both');
  assert.equal((await again.command(ask('alice'))).error, 'seat_chat_unavailable');
});

const live = { skip: !process.env.REDIS_URL, timeout: 60_000 };
test('across two gateways on one Redis room: the words reach only the two, and standing ends it', live, async t => {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test:${randomUUID()}}`, origin = 'https://sim.jev.works', nodes = [];
  const sessions = new Map(['alice', 'bob', 'carol'].map(userId => [userId, { ...identity(userId), csrfToken: 'test-csrf' }]));
  t.after(async () => {
    for (const node of nodes) { await node.app.close();await node.room.close(); }
    const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  const start = async () => {
    const auth = { authenticate: async req => sessions.get(req.headers.cookie?.match(/test_session=(\w+)/)?.[1]) ?? null, handle: async () => false };
    const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, isAdmin: () => false, authorize: async value => sessions.get(value.userId)?.sessionId === value.sessionId });
    const app = createDistributedServer({ auth, security: createRedisSecurity({ redis, prefix }), room, waitlist: approvedWaitlist, landmarks: createRedisLandmarks({ redis, prefix }),
      social: createRedisSocial({ redis, prefix }), blocks: createRedisBlocks({ redis, prefix }), blockSyncMs: 100, isAdmin: () => false, origin, moderators: [] });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const node = { app, room, url: `http://127.0.0.1:${app.server.address().port}` };nodes.push(node);
    return node;
  };
  const first = await start(), second = await start(), path = '/api/multiplayer/ticket?world=river-oaks';
  const alice = await connected(t, first.url, origin, 'alice', path), bob = await connected(t, second.url, origin, 'bob', path), carol = await connected(t, first.url, origin, 'carol', path);
  const walkToSeat = async (client, user, seat) => {
    const room = environment.roomAt(seat.x, -seat.north).storeId;
    assert.equal((await client.command({ type: 'travel', storeId: room })).ok, true, 'travel into the room');
    await until(() => environment.roomAt(client.latest.players.find(player => player.id === user).position[0], -client.latest.players.find(player => player.id === user).position[1])?.storeId === room, 'arrives in the room');
    const { position } = client.latest.players.find(player => player.id === user), path = routeTo(position, seat.approach);
    assert.ok(path, 'a way to the seat');
    for (const [east, north] of path) {
      await new Promise(resolve => setTimeout(resolve, 110));
      assert.equal((await client.command({ type: 'pose', position: [east, north, environment.groundAt(east, -north)], yaw: 0, altitude: 0 })).ok, true);
    }
    return client.command(sitOn(seat));
  };
  assert.deepEqual((await walkToSeat(alice, 'alice', counter.seats[0])).ok, true);
  assert.deepEqual((await walkToSeat(bob, 'bob', counter.seats[2])).ok, true);
  assert.equal((await alice.command(ask('bob'))).ok, true);
  await until(() => bob.latest.seatChat?.invites?.length === 1, 'the other gateway delivers the request');
  const accepted = await bob.command(yes('alice'));
  assert.equal(accepted.ok, true);
  assert.equal((await alice.command(say(accepted.sessionId, 'over-redis-words'))).to, 'bob');
  await until(() => bob.latest.seatChat?.session?.messages?.length === 1, 'the words cross gateways');
  assert.equal(carol.raw.some(frame => frame.includes('over-redis-words') || frame.includes('"seatChat"')), false, 'nothing to carol');
  assert.equal((await bob.command({ type: 'stand' })).ok, true);
  await until(() => !alice.latest.seatChat, 'standing ends it for the other gateway too');
});
