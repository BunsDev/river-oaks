import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createRedisLandmarks } from '../landmarks.js';
import { createRedisSocial } from '../social.js';

const origin = 'https://sim.jev.works';
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const live = { skip: !process.env.REDIS_URL, timeout: 30_000 };
async function fixture(t, { worldId = 'river-oaks', worldIds = [worldId, worldId] } = {}) {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', () => {});
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  const sessions = new Map(['alice', 'bob', 'moderator'].map(userId => [userId, {
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
    const room = createRedisRoom({ redis, prefix:roomPrefix, worldId:nodeWorldId, worldData: data, isAdmin:id=>id==='alice', authorize: async identity =>
      sessions.get(identity.userId)?.sessionId === identity.sessionId && !(await security.isBanned(identity.userId)) });
    const app = createDistributedServer({ auth, security, room, landmarks:createRedisLandmarks({redis,prefix}), social:createRedisSocial({redis,prefix}), origin, moderators: ['moderator'] });
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
  return { nodes, sessions, post, ticket };
}
function client(node, user, ticket, worldId = null, protocol = null) {
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

test('distributed HTTP authentication and CSRF gates reject invalid tickets', live, async t => {
  const f = await fixture(t), [a] = f.nodes;
  assert.equal((await f.post(a, 'nobody', '/api/multiplayer/ticket')).status, 401);
  assert.equal((await f.post(a, 'alice', '/api/multiplayer/ticket', null, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.post(a, 'alice', '/api/multiplayer/ticket', null, { 'X-CSRF-Token': 'wrong' })).status, 403);
});

test('distributed tickets and sockets are admitted only to their named world and protocol', live, async t => {
  const f=await fixture(t,{worldId:'garden-2'}),[a]=f.nodes;
  assert.equal((await f.post(a,'alice','/api/multiplayer/ticket')).status,404);
  assert.equal((await f.post(a,'alice','/api/multiplayer/ticket?world=river-oaks')).status,404);
  const issued=await f.post(a,'alice','/api/multiplayer/ticket?world=garden-2');
  assert.equal(issued.status,200);
  const {ticket,worldId,protocolVersion}=await issued.json();
  assert.equal(worldId,'garden-2');assert.equal(protocolVersion,1);
  assert.equal((await f.post(a,'alice','/api/landmarks/list?world=river-oaks')).status,404);
  assert.equal((await f.post(a,'alice','/api/landmarks/list?world=garden-2')).status,200);
  const rejected=(world,protocol)=>new Promise(resolve=>{
    const ws=new WebSocket(`${a.url.replace('http:','ws:')}/multiplayer?ticket=${ticket}&world=${world}&protocol=${protocol}`,{headers:{Origin:origin,Cookie:'test_session=alice'}});
    ws.once('unexpected-response',(_request,response)=>{resolve(response.statusCode);response.resume();});
    ws.once('error',()=>{});
  });
  assert.equal(await rejected('river-oaks',1),403);
  assert.equal(await rejected('garden-2',2),426);
  const alice=client(a,'alice',ticket,'garden-2',1);t.after(()=>alice.ws.terminate());
  const joined=await alice.waitFor(message=>message.selfId==='alice');
  assert.equal(joined.worldId,'garden-2');
});

test('two distributed worlds share sign-in but isolate presence and ticket admission', live, async t => {
  const f=await fixture(t,{worldIds:['river-oaks','garden-2']}),[river,garden]=f.nodes;
  const riverTicket=await f.ticket(river,'alice');
  const crossed=await new Promise(resolve=>{
    const ws=new WebSocket(`${garden.url.replace('http:','ws:')}/multiplayer?ticket=${riverTicket}&world=garden-2&protocol=1`,{headers:{Origin:origin,Cookie:'test_session=alice'}});
    ws.once('unexpected-response',(_request,response)=>{resolve(response.statusCode);response.resume();});
    ws.once('error',()=>{});
  });
  assert.equal(crossed,401);
  const a=client(river,'alice',riverTicket,'river-oaks',1);
  const b=client(garden,'alice',await f.ticket(garden,'alice'),'garden-2',1);
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
