import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { SIGN_INS_PER_ADDRESS } from '../rate-limit.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { createRedisLandmarks } from '../landmarks.js';
import { createRedisSocial } from '../social.js';
import { createRedisGroups } from '../groups.js';
import { WORLD_PROTOCOL_VERSION } from '../../preview/src/world-contract.js';
import { districtRibbonPlan } from '../../preview/src/ribbon-district.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';

const origin = 'https://sim.jev.works';
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const live = { skip: !process.env.REDIS_URL, timeout: 30_000 };
async function fixture(t, { worldId = 'river-oaks', worldIds = [worldId, worldId], waitlist = approvedWaitlist, world = data, now = Date.now } = {}) {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', () => {});
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  const sessions = new Map(['alice', 'bob', 'moderator', 'user_01M40Y914S1H4EJCEHH91DKTAY',...Array.from({length:16},(_,index)=>`resident${index}`)].map(userId => [userId, {
    userId, name: userId, sessionId: userId + '-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000,
  }]));
  const nodes = [];
  t.after(async () => {
    for (const node of nodes) await node.app.close();
    for (const node of nodes) await node.room.close();
    for(const roomPrefix of new Set([prefix,...nodes.map(node=>node.prefix)])){
      const keys=await redis.keys(roomPrefix+':*');if(keys.length)await redis.del(...keys);
    }
    await redis.quit();
  });
  for (let i = 0; i < 2; i++) {
    const nodeWorldId=worldIds[i],roomPrefix=nodeWorldId===worldIds[0]?prefix:`${prefix.slice(0,-1)}:world:${nodeWorldId}}`;
    const security = createRedisSecurity({ redis, prefix });
    const auth = {
      authenticate: async req => sessions.get(req.headers.cookie?.match(/test_session=(\w+)/)?.[1]) ?? null,
      handle: async () => false,
    };
    const room = createRedisRoom({ redis, prefix:roomPrefix, worldId:nodeWorldId, worldData: world, now, isAdmin:id=>id==='alice', authorize: async identity =>
      sessions.get(identity.userId)?.sessionId === identity.sessionId && !(await security.isBanned(identity.userId)) });
    const app = createDistributedServer({ auth, security, room, waitlist, landmarks:createRedisLandmarks({redis,prefix}), social:createRedisSocial({redis,prefix}), groups:createRedisGroups({redis,prefix}), origin, moderators: ['moderator'] });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    nodes.push({ app, room, security, prefix:roomPrefix, url: `http://127.0.0.1:${app.server.address().port}` });
  }
  const post = (node, user, path, body, extra = {}) => fetch(node.url + path, {
    method: 'POST', headers: { Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json', ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const ticket = async (node, user) => {
    const response = await post(node, user, `/api/multiplayer/ticket?world=${node.room.worldId}`);
    assert.equal(response.status, 200);
    return (await response.json()).ticket;
  };
  return { nodes, sessions, post, ticket, redis, prefix };
}
function client(node, user, ticket, worldId = null, protocol = WORLD_PROTOCOL_VERSION) {
  const query = new URLSearchParams({ ticket });
  if (worldId) query.set('world', worldId);
  if (protocol) query.set('protocol', String(protocol));
  const ws = new WebSocket(`${node.url.replace('http:', 'ws:')}/multiplayer?${query}`, {
    headers: { Origin: origin, Cookie: `test_session=${user}` },
  });
  const messages = [], waiters = new Set();
  ws.on('error', () => {});
  ws.on('message', raw => {
    const message = JSON.parse(raw); messages.push(message);
    for (const waiter of [...waiters]) if (waiter.match(message)) {
      waiters.delete(waiter); clearTimeout(waiter.timer); waiter.resolve(message);
    }
  });
  function waitFor(match, after = 0) {
    const found = messages.slice(after).find(match);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, timer: setTimeout(() => { waiters.delete(waiter); reject(new Error('No matching server message')); }, 8000) };
      waiters.add(waiter);
    });
  }
  return { ws, messages, waitFor, async command(command) {
    const requestId = randomUUID();
    const result = waitFor(message => message.type === 'result' && message.requestId === requestId);
    ws.send(JSON.stringify({ ...command, requestId }));
    return result;
  } };
}
const closed = ws => new Promise(resolve => ws.once('close', (code) => resolve(code)));

// No Redis: a synthetic room whose committed view cannot be read, and a ticket store
// that records what it issued, behind the real HTTP edge.
test('a ticket is returned, not orphaned, when the room view cannot be read', async t => {
  const issued = [], identity = { userId: 'alice', name: 'alice', sessionId: 'alice-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000 };
  const security = { allow: async () => true, isBanned: async () => false, consumeTicket: async () => false,
    issueTicket: async (user, worldId) => { const ticket = `ticket-${issued.length}`; issued.push({ ticket, userId: user.userId, worldId }); return ticket; } };
  const auth = { authenticate: async req => req.headers.cookie === 'test_session=alice' ? identity : null, handle: async () => false };
  let reads = 0;
  const room = { worldId: 'harbour-cafe', read: async () => { reads++; throw new Error('synthetic Redis failure'); },
    request: async () => ({ ok: false }), tick: async () => null };
  // The room was created from world data that asks for protocol 4.
  const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, origin, protocolVersion: 4 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/multiplayer/ticket?world=harbour-cafe`, {
    method: 'POST', headers: { Origin: origin, Cookie: 'test_session=alice', 'X-CSRF-Token': 'test-csrf' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ticket: 'ticket-0', worldId: 'harbour-cafe', protocolVersion: 4, moderator: false });
  assert.deepEqual(issued, [{ ticket: 'ticket-0', userId: 'alice', worldId: 'harbour-cafe' }], 'the one ticket issued is the one returned');
  assert.equal(reads, 1);
});

test('with approved spaces off, a base-protocol world names its protocol without reading the room view', async t => {
  const identity = { userId: 'alice', name: 'alice', sessionId: 'alice-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000 };
  const security = { allow: async () => true, isBanned: async () => false, consumeTicket: async () => false, issueTicket: async () => 'ticket-0' };
  const auth = { authenticate: async req => req.headers.cookie === 'test_session=alice' ? identity : null, handle: async () => false };
  const serve = async worldCatalog => {
    const counter = { reads: 0 };
    // A committed view that would ask for protocol 4, if anything read it.
    const room = { worldId: 'harbour-cafe', read: async () => { counter.reads++; return { snapshot: { protocolVersion: 4 } }; },
      request: async () => ({ ok: false }), tick: async () => null };
    const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, origin, worldCatalog });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/multiplayer/ticket?world=harbour-cafe`, {
      method: 'POST', headers: { Origin: origin, Cookie: 'test_session=alice', 'X-CSRF-Token': 'test-csrf' } });
    return { protocolVersion: (await response.json()).protocolVersion, reads: counter.reads };
  };
  assert.deepEqual(await serve(null), { protocolVersion: 3, reads: 0 }, 'no catalog: no approved spaces');
  assert.deepEqual(await serve({ approvedSpacesEnabled: false, list: async () => [] }), { protocolVersion: 3, reads: 0 });
  assert.deepEqual(await serve({ approvedSpacesEnabled: true, list: async () => [] }), { protocolVersion: 4, reads: 1 }, 'a revision may add an approved space');
});

// Each sign-in start holds a pending slot for twenty minutes; one address used
// to be able to take every slot and block sign-in for everyone.
test('one address can start only a few sign-ins at a time, across instances', live, async t => {
  const { nodes } = await fixture(t);
  for (let i = 0; i < SIGN_INS_PER_ADDRESS; i++) assert.notEqual((await fetch(nodes[i % 2].url + '/auth/login')).status, 429);
  for (const node of nodes) assert.equal((await fetch(node.url + '/auth/login')).status, 429);
  assert.notEqual((await fetch(nodes[0].url + '/auth/session')).status, 429, 'other routes keep their own limit');
});

test('pending accounts cannot use distributed world APIs', live, async t => {
  const waitlist = { ...approvedWaitlist, isApproved: async id => id === 'alice' };
  const { nodes, post } = await fixture(t, { waitlist });
  assert.equal((await post(nodes[0], 'bob', '/api/multiplayer/ticket?world=river-oaks')).status, 403);
  assert.equal((await post(nodes[0], 'bob', '/api/social/list?world=river-oaks', {})).status, 403);
});

test('distributed HTTP authentication and CSRF gates reject invalid tickets', live, async t => {
  const f = await fixture(t), [a] = f.nodes;
  assert.equal((await f.post(a, 'nobody', '/api/multiplayer/ticket')).status, 401);
  assert.equal((await f.post(a, 'alice', '/api/multiplayer/ticket', null, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.post(a, 'alice', '/api/multiplayer/ticket', null, { 'X-CSRF-Token': 'wrong' })).status, 403);
});
test('distributed residents behind one address can poll contacts and groups',live,async t=>{
  const f=await fixture(t),[a]=f.nodes;
  for(let cycle=0;cycle<6;cycle++)for(let account=0;account<16;account++)for(const scope of ['social','groups']) {
    const response=await f.post(a,`resident${account}`,`/api/${scope}/list`,{});
    assert.equal(response.status,200,`${scope} poll for resident ${account} in cycle ${cycle}`);
  }
});

test('distributed tickets and sockets are admitted only to their named world and protocol', live, async t => {
  const f=await fixture(t,{worldId:'garden-2'}),[a]=f.nodes;
  assert.equal((await f.post(a,'alice','/api/multiplayer/ticket')).status,404);
  assert.equal((await f.post(a,'alice','/api/multiplayer/ticket?world=river-oaks')).status,404);
  const issued=await f.post(a,'alice','/api/multiplayer/ticket?world=garden-2');
  assert.equal(issued.status,200);
  const {ticket,worldId,protocolVersion}=await issued.json();
  assert.equal(worldId,'garden-2');assert.equal(protocolVersion,WORLD_PROTOCOL_VERSION);
  assert.equal((await f.post(a,'alice','/api/landmarks/list?world=river-oaks')).status,404);
  assert.equal((await f.post(a,'alice','/api/landmarks/list?world=garden-2')).status,200);
  const rejected=(world,protocol)=>new Promise(resolve=>{
    const ws=new WebSocket(`${a.url.replace('http:','ws:')}/multiplayer?ticket=${ticket}&world=${world}&protocol=${protocol}`,{headers:{Origin:origin,Cookie:'test_session=alice'}});
    ws.once('unexpected-response',(_request,response)=>{resolve(response.statusCode);response.resume();});
    ws.once('error',()=>{});
  });
  assert.equal(await rejected('river-oaks',2),403);
  assert.equal(await rejected('garden-2',2),426);
  const alice=client(a,'alice',ticket,'garden-2');t.after(()=>alice.ws.terminate());
  const joined=await alice.waitFor(message=>message.selfId==='alice');
  assert.equal(joined.worldId,'garden-2');
});

test('two distributed worlds share sign-in but isolate presence and ticket admission', live, async t => {
  const f=await fixture(t,{worldIds:['river-oaks','garden-2']}),[river,garden]=f.nodes;
  const riverTicket=await f.ticket(river,'alice');
  const crossed=await new Promise(resolve=>{
    const ws=new WebSocket(`${garden.url.replace('http:','ws:')}/multiplayer?ticket=${riverTicket}&world=garden-2&protocol=${WORLD_PROTOCOL_VERSION}`,{headers:{Origin:origin,Cookie:'test_session=alice'}});
    ws.once('unexpected-response',(_request,response)=>{resolve(response.statusCode);response.resume();});
    ws.once('error',()=>{});
  });
  assert.equal(crossed,401);
  const a=client(river,'alice',riverTicket,'river-oaks');
  const b=client(garden,'alice',await f.ticket(garden,'alice'),'garden-2');
  t.after(()=>{a.ws.terminate();b.ws.terminate();});
  assert.equal((await a.waitFor(message=>message.selfId==='alice')).worldId,'river-oaks');
  assert.equal((await b.waitFor(message=>message.selfId==='alice')).worldId,'garden-2');
  assert.equal((await a.command({type:'chat',text:'Only the first world'})).ok,true);
  assert.equal((await garden.room.read()).snapshot.chat.length,0);
  assert.equal((await river.room.read()).snapshot.chat[0].text,'Only the first world');
});

test('landmarks stay private and durable across distributed edge instances', live, async t => {
  const f=await fixture(t),[a,b]=f.nodes;
  assert.equal((await f.post(a,'alice','/api/landmarks/list',{}, {Origin:'https://evil.example'})).status,403);
  assert.equal((await f.post(a,'alice','/api/landmarks/list',{}, {'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await f.post(a,'nobody','/api/landmarks/list')).status,401);
  assert.deepEqual((await (await f.post(a,'alice','/api/landmarks/list')).json()).landmarks,[]);
  assert.equal((await f.post(a,'alice','/api/landmarks/add',{name:'Before joining'})).status,409);
  const alice=client(a,'alice',await f.ticket(a,'alice'));
  const joined=await alice.waitFor(message=>message.selfId==='alice');
  t.after(()=>alice.ws.terminate());
  const saved=await (await f.post(b,'alice','/api/landmarks/add',{name:'Cross-device gate',position:[0,0],yaw:9})).json();
  assert.equal(saved.ok,true);
  assert.deepEqual(saved.landmark.position,joined.players.find(player=>player.id==='alice').position.slice(0,2));
  assert.equal(saved.landmark.yaw,joined.players.find(player=>player.id==='alice').yaw);
  assert.deepEqual((await (await f.post(a,'alice','/api/landmarks/list')).json()).landmarks,[saved.landmark]);
  assert.deepEqual((await (await f.post(b,'bob','/api/landmarks/list')).json()).landmarks,[]);
  assert.equal(JSON.stringify((await b.room.read()).snapshot).includes('Cross-device gate'),false);
  assert.equal((await (await f.post(a,'bob','/api/landmarks/remove',{id:saved.landmark.id})).json()).removed,false);
  assert.equal((await (await f.post(b,'alice','/api/landmarks/remove',{id:saved.landmark.id})).json()).removed,true);
  assert.deepEqual((await (await f.post(a,'alice','/api/landmarks/list')).json()).landmarks,[]);
});
test('accepted contacts and private history survive distributed edge replacement',live,async t=>{
  const f=await fixture(t),[a,b]=f.nodes;
  assert.equal((await f.post(a,'alice','/api/social/request',{peerId:'bob'})).status,409);
  const alice=client(a,'alice',await f.ticket(a,'alice'));
  const bob=client(b,'bob',await f.ticket(b,'bob'));
  t.after(()=>{alice.ws.terminate();bob.ws.terminate();});
  await alice.waitFor(message=>message.selfId==='alice');
  await bob.waitFor(message=>message.selfId==='bob');
  assert.equal((await f.post(a,'alice','/api/social/request',{peerId:'bob'})).status,200);
  assert.equal((await f.post(b,'alice','/api/social/send',{peerId:'bob',text:'Too soon'})).status,409);
  assert.equal((await f.post(b,'bob','/api/social/accept',{peerId:'alice'})).status,200);
  assert.equal((await f.post(a,'alice','/api/social/send',{peerId:'bob',text:'Across instances'})).status,200);
  assert.equal((await f.post(a,'moderator','/api/social/messages',{peerId:'alice'})).status,404);
  const history=await (await f.post(b,'bob','/api/social/messages',{peerId:'alice'})).json();
  assert.equal(history.messages[0].text,'Across instances');
  assert.equal((await f.post(b,'bob','/api/social/remove',{peerId:'alice'})).status,200);
  assert.equal((await f.post(a,'alice','/api/social/messages',{peerId:'bob'})).status,404);
});
test('group invitations and chat cross Redis edges without leaking to outsiders',live,async t=>{
  const f=await fixture(t,{worldIds:['river-oaks','garden-2']}),[a,b]=f.nodes;
  const created=await f.post(a,'alice','/api/groups/create?world=river-oaks',{name:'World Walkers'});
  assert.equal(created.status,200);const {id:groupId}=(await created.json()).group;
  const alice=client(a,'alice',await f.ticket(a,'alice'));
  const bob=client(b,'bob',await f.ticket(b,'bob'),'garden-2');
  t.after(()=>{alice.ws.terminate();bob.ws.terminate();});
  await alice.waitFor(message=>message.selfId==='alice');
  await bob.waitFor(message=>message.selfId==='bob');
  assert.equal((await f.post(a,'alice','/api/social/request?world=river-oaks',{peerId:'bob'})).status,409,'contacts still require a meeting');
  // Existing accepted contacts can be invited from either world.
  const social=createRedisSocial({redis:f.redis,prefix:f.prefix});
  await social.request({userId:'alice',name:'alice'},{userId:'bob',name:'bob'});await social.accept('bob','alice');
  assert.equal((await f.post(a,'alice','/api/groups/invite?world=river-oaks',{groupId,peerId:'bob'})).status,200);
  assert.equal((await f.post(b,'bob','/api/groups/read?world=garden-2',{groupId})).status,404);
  assert.equal((await f.post(b,'bob','/api/groups/accept?world=garden-2',{groupId})).status,200);
  assert.equal((await f.post(b,'bob','/api/groups/send?world=garden-2',{groupId,text:'Across regions'})).status,200);
  const read=await f.post(a,'alice','/api/groups/read?world=river-oaks',{groupId});
  assert.equal((await read.json()).group.messages[0].text,'Across regions');
  assert.equal((await f.post(a,'moderator','/api/groups/read?world=river-oaks',{groupId})).status,404);
});

test('different server instances share tickets, players, wishes, and durable acknowledgments', live, async t => {
  const f = await fixture(t), [a, b] = f.nodes;
  const alice = client(b, 'alice', await f.ticket(a, 'alice'));
  await alice.waitFor(message => message.selfId === 'alice');
  const bob = client(a, 'bob', await f.ticket(b, 'bob'));
  await bob.waitFor(message => message.selfId === 'bob' && message.players.length === 2);
  assert.equal((await alice.command({ type: 'travel', localId: 'local-00' })).ok, true);
  const grant = await alice.command({ type: 'wish', localId: 'local-00', kind: 'dragon' });
  assert.equal(grant.ok, true);
  const snapshot = await alice.waitFor(message => message.locals?.some(local => local.id === 'local-00' && local.wish?.ownerId === 'alice'));
  assert.ok(alice.messages.indexOf(snapshot) < alice.messages.indexOf(grant));
  await bob.waitFor(message => message.locals?.some(local => local.id === 'local-00' && local.wish?.ownerId === 'alice'));
  assert.equal((await alice.command({ type: 'undoWish', localId: 'local-00' })).ok, true);
});

test('Ribbon canopy refusal is authoritative across two gateways and a reconnect', live, async t => {
  const owner = 'user_01M40Y914S1H4EJCEHH91DKTAY'; // Existing local acceptance identity.
  const module = districtRibbonPlan(data).modules.find(item => item.id === 'ribbon:spine:module:013');
  const [east, north] = module.from.map((value, i) => (value + module.to[i]) / 2);
  const world = { ...data, walkSpawn: [east, north, 0] }, environment = createWalkingEnvironment(world);
  const f = await fixture(t, { world }), [a, b] = f.nodes;
  const pilot = client(a, owner, await f.ticket(a, owner)), peer = client(b, 'bob', await f.ticket(b, 'bob'));
  t.after(() => { pilot.ws.terminate(); peer.ws.terminate(); });
  const joined = await pilot.waitFor(message => message.selfId === owner);
  await peer.waitFor(message => message.selfId === 'bob' && message.players.length === 2);
  const position = joined.players.find(player => player.id === owner).position;
  let last = 0, refusal = null;
  for (let step = 1; step <= 30; step++) {
    await new Promise(resolve => setTimeout(resolve, 60));
    const result = await pilot.command({ type: 'pose', position, yaw: 0, altitude: step / 10 });
    if (!result.ok) { refusal = result.error; break; }
    last = step / 10;
  }
  assert.equal(refusal, 'blocked');
  assert.ok(last > 0.5 && last < 1.3, 'full body stops before its foot reaches the slab');
  assert.equal(environment.canFly(east, environment.groundAt(east, -north) + last, -north), true);
  const observed = await peer.waitFor(message => message.players?.some(player => player.id === owner && player.altitude === last));
  assert.deepEqual(observed.players.find(player => player.id === owner).position, position);
  assert.equal((await b.room.read()).snapshot.players.find(player => player.id === owner).altitude, last);
  const ended = closed(pilot.ws); pilot.ws.close(); await ended;
  const resumed = client(b, owner, await f.ticket(b, owner));
  t.after(() => resumed.ws.terminate());
  const snapshot = await resumed.waitFor(message => message.selfId === owner);
  assert.equal(snapshot.players.find(player => player.id === owner).altitude, last);
  assert.deepEqual(snapshot.players.find(player => player.id === owner).position, position);
});

test('an away aircraft holds its full hull clear for a peer and resumes across gateways', { ...live, timeout: 60_000 }, async t => {
  const owner = 'user_01M40Y914S1H4EJCEHH91DKTAY';
  const module = districtRibbonPlan(data).modules[0];
  const midEast = (module.from[0] + module.to[0]) / 2, north = (module.from[1] + module.to[1]) / 2;
  // Keep the admitted real lane and canopy, with an open departure site west of it.
  // Motion climbs there normally, then flies over to the side of module000.
  const world = { scene: 'district', bounds_m: data.bounds_m, buildings: [], stores: [],
    roads: data.roads.filter(road => road.id === 'osm-way-583333526-0'), walkSpawn: [midEast - 15, north, 0] };
  let time = Date.now();
  const env = createWalkingEnvironment(world), f = await fixture(t, { world, now: () => time }), [a, b] = f.nodes;
  const pilot = client(a, owner, await f.ticket(a, owner)), peer = client(b, 'bob', await f.ticket(b, 'bob'));
  t.after(() => { pilot.ws.terminate(); peer.ws.terminate(); });
  const joined = await pilot.waitFor(message => message.selfId === owner);
  await peer.waitFor(message => message.selfId === 'bob' && message.players.length === 2);
  const initial = joined.players.find(player => player.id === owner);
  let position = initial.position;
  assert.equal(env.canFlyHullPilot(position[0], position[2], -position[1], 0), true, 'open departure hull');
  for (let step = 1; step <= 40; step++) {
    time += 70;
    const reply = await pilot.command({ type: 'pose', position, yaw: 0, altitude: step / 5, vehicle: 'hover' });
    assert.equal(reply.ok, true, 'climb outside the canopy using the real command');
  }
  for (let step = 1; step <= 48; step++) {
    time += 60;
    const east = initial.position[0] + step / 4;
    position = [east, north, env.groundAt(east, -north)];
    assert.equal((await pilot.command({ type: 'pose', position, yaw: 0, altitude: 8, vehicle: 'hover' })).ok, true, 'normal overflight reaches the station');
  }
  const from = peer.messages.length, ended = closed(pilot.ws);
  // A socket close alone does not prove its queued leave has committed. Observe
  // the real request's acknowledgement before advancing the fixture clock.
  const request = a.room.request.bind(a.room);
  let departure;
  const departed = new Promise(resolve => { departure = resolve; });
  a.room.request = async operation => {
    const result = await request(operation);
    if (operation.type === 'leave' && operation.userId === owner) departure(result);
    return result;
  };
  pilot.ws.close(); await ended;
  assert.equal((await departed).ok, true);
  const advance = async ms => {
    time += ms;
    // An automatic gateway tick may already be in flight at the previous time.
    // Wait for the public committed timestamp, rather than consuming that tick
    // as if it had applied this new simulation interval.
    for (let attempt = 0; attempt < 100; attempt++) {
      await a.room.tick(); await b.room.tick();
      const snapshot = (await b.room.read()).snapshot;
      if (snapshot.serverTimeMs === time) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('controlled room time did not commit');
  };
  for (let tick = 0; tick < 7; tick++) await advance(250);
  const beforeAdmission = (await b.room.read()).snapshot;
  assert.equal(beforeAdmission.players.find(p => p.id === owner).altitude, 4.5, JSON.stringify(beforeAdmission.players));
  const heldView = await peer.waitFor(message => message.players?.some(p => p.id === owner && p.altitude === 4.5), from);
  const observations = peer.messages.slice(from).flatMap(message => message.players?.filter(p => p.id === owner) ?? []);
  assert.ok(observations.length >= 2, 'the live peer observes the away descent and held craft');
  for (const p of observations) {
    assert.deepEqual(p.position, position);
    assert.equal(env.canFlyHullPilot(p.position[0], p.position[2] + p.altitude, -p.position[1], p.yaw), true, 'no published away pose admits aircraft penetration');
  }
  const held = (await b.room.read()).snapshot.players.find(p => p.id === owner);
  assert.equal(held.altitude, heldView.players.find(p => p.id === owner).altitude);
  // Reproduce the hosted interleaving: a legal smaller step occurs after this
  // earlier read, before the replacement socket is admitted on the other gateway.
  await advance(210);
  const resumed = client(b, owner, await f.ticket(b, owner));
  t.after(() => resumed.ws.terminate());
  const rejoined = (await resumed.waitFor(message => message.selfId === owner)).players.find(p => p.id === owner);
  assert.equal(rejoined.vehicle, 'hover');
  assert.equal(held.altitude, 4.5);
  assert.equal(rejoined.altitude, 4.08);
  assert.notEqual(rejoined.altitude, held.altitude, 'admission follows the intervening legal away step');
  assert.equal(env.canFlyHullPilot(position[0], position[2] + rejoined.altitude, -position[1], rejoined.yaw), true);
  assert.equal(rejoined.appearance, initial.appearance);
  assert.deepEqual(rejoined.position, position);
  await advance(400);
  for (const node of [a, b]) assert.equal((await node.room.read()).snapshot.players.find(p => p.id === owner).altitude, rejoined.altitude, 'admission stops the away descent');
  // Clear air makes a stale away flag observable; a canopy-blocked craft alone
  // could appear stationary even if reconnect failed to restore its presence.
  for (let altitude = 4.2; altitude <= 6.001; altitude += .2) {
    time += 100;
    assert.equal((await resumed.command({ type: 'pose', position, yaw: 0, altitude: Math.round(altitude * 10) / 10, vehicle: 'hover' })).ok, true);
  }
  await advance(250);
  for (const node of [a, b]) assert.equal((await node.room.read()).snapshot.players.find(p => p.id === owner).altitude, 6, 'reconnected craft remains at its admitted clear-air pose on both gateways');
});

test('account replacement, ban, and logout cross instance boundaries', live, async t => {
  const f = await fixture(t), [a, b] = f.nodes;
  const first = client(a, 'alice', await f.ticket(b, 'alice'));
  await first.waitFor(message => message.selfId === 'alice');
  const replaced = closed(first.ws);
  const second = client(b, 'alice', await f.ticket(a, 'alice'));
  await second.waitFor(message => message.selfId === 'alice');
  assert.equal(await replaced, 4009);
  const ended = closed(second.ws);
  const response = await f.post(a, 'moderator', '/api/moderation/ban', { userId: 'alice', banned: true });
  assert.equal(response.status, 200);
  assert.equal(await ended, 4003);
  assert.equal((await f.post(b, 'alice', '/api/multiplayer/ticket')).status, 403);
  const bob = client(b, 'bob', await f.ticket(a, 'bob'));
  await bob.waitFor(message => message.selfId === 'bob');
  const logout = closed(bob.ws);
  f.sessions.delete('bob');
  await a.app.disconnectUser('bob', 'bob-session');
  assert.equal(await logout, 4003);
});
