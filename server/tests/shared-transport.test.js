import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
import { createSharedWorld } from '../world.js';
import { createModeration } from '../moderation.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const district = JSON.parse(await readFile(new URL('../../preview/public/data/district.json',import.meta.url),'utf8'));
const publicOrigin = 'https://sim.jev.works';

async function fixture(t, { moderation, worldData=district, waitlist=approvedWaitlist } = {}) {
  let time = 100000, app;
  const sessions = new Map([
    ['alice-session', {userId:'alice',name:'Alice',sessionId:'alice-session'}],
    ['alice-other-session', {userId:'alice',name:'Alice',sessionId:'alice-other-session'}],
    ['bob-session', {userId:'bob',name:'Bob',sessionId:'bob-session'}],
    ['moderator-session', {userId:'moderator',name:'Moderator',sessionId:'moderator-session'}],
  ].map(([key,identity])=>[key,{...identity,csrfToken:'integration-csrf',expiresAt:time+600000}]));
  // Fake identities exist only in this test module. Logout exercises the same
  // dependency callback contract as createAuth, without any external credentials.
  const auth = {
    async authenticate(req) {
      const key=req.headers.cookie?.match(/(?:^|;\s*)test_session=([^;]+)/)?.[1];
      const identity=sessions.get(key);
      return identity?.expiresAt>time ? identity : null;
    },
    async handle(req,res) {
      if(req.url!=='/auth/logout')return false;
      const identity=await this.authenticate(req);
      if(req.method!=='POST' || !identity || req.headers.origin!==publicOrigin || req.headers['x-csrf-token']!==identity.csrfToken) {
        res.writeHead(403);res.end();return true;
      }
      sessions.delete(identity.sessionId);
      app.disconnectUser(identity.userId);
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));return true;
    },
  };
  const world=createSharedWorld(worldData,{now:()=>time,isAdmin:id=>id==='alice'});
  app=createGameServer({auth,world,waitlist,origin:publicOrigin,moderation,moderators:['moderator'],now:()=>time});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  const post=async(path,session,body)=>fetch(origin+path,{method:'POST',headers:{Origin:publicOrigin,Cookie:`test_session=${session}`,'X-CSRF-Token':'integration-csrf','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const issue=async session=>{
    const response=await post('/api/multiplayer/ticket',session);
    assert.equal(response.status,200);
    return (await response.json()).ticket;
  };
  return {app,world,origin,post,issue,advance(ms=200){time+=ms;}};
}

function client(origin, ticket, session) {
  const ws=new WebSocket(`${origin.replace('http:','ws:')}/multiplayer?ticket=${ticket}`,{headers:{Origin:publicOrigin,Cookie:`test_session=${session}`}});
  const messages=[],waiters=new Set();
  let request=0;
  ws.on('message',raw=>{
    const message=JSON.parse(raw.toString());messages.push(message);
    for(const waiter of [...waiters]) if(waiter.predicate(message)) {
      waiters.delete(waiter);clearTimeout(waiter.timer);waiter.resolve(message);
    }
  });
  // Failed upgrade requests are asserted by connect; retain an error listener
  // after connection so an intentional oversized close cannot escape the test.
  ws.on('error',()=>{});
  function waitFor(predicate, after=0) {
    const existing=messages.slice(after).find(predicate);
    if(existing)return Promise.resolve(existing);
    return new Promise((resolve,reject)=>{
      const waiter={predicate,resolve,timer:setTimeout(()=>{waiters.delete(waiter);reject(new Error('Timed out waiting for a WebSocket message'));},2500)};
      waiters.add(waiter);
    });
  }
  const ready=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{ws.terminate();reject(new Error('WebSocket upgrade timed out'));},2500);
    ws.once('message',()=>{clearTimeout(timeout);resolve();});
    ws.once('error',error=>{clearTimeout(timeout);reject(error);});
  });
  return {ws,messages,ready,waitFor,async command(message){
    const requestId=`request-${++request}`, result=waitFor(value=>value.type==='result' && value.requestId===requestId);
    ws.send(JSON.stringify({...message,requestId}));
    return result;
  }};
}
async function connect(fixture, session, ticket) {
  const connection=client(fixture.origin,ticket??await fixture.issue(session),session);
  await connection.ready;
  return connection;
}
function closed(ws) {
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Timed out waiting for WebSocket close')),2500);
    ws.once('close',(code,reason)=>{clearTimeout(timeout);resolve({code,reason:reason.toString()});});
  });
}

// These deliberately exercise the actual strict world command schema. A mock
// command handler would miss requestId accidentally leaking into world.command.
test('travel acknowledgment reaches its player before the full snapshot',async t=>{
  const f=await fixture(t),alice=await connect(f,'alice-session');
  const before=alice.messages.length;
  const arrived=await alice.command({type:'travel',localId:'local-00'});
  assert.equal(arrived.ok,true);
  const snapshot=await alice.waitFor(message=>message.type==='snapshot'
    && JSON.stringify(message.players.find(player=>player.id==='alice')?.position)===JSON.stringify(arrived.player.position),before);
  assert.ok(alice.messages.indexOf(arrived)<alice.messages.indexOf(snapshot));
});

test('waiting movement poses coalesce on either side of a travel command',async t=>{
  let block=false,release,started;
  const blocked=new Promise(resolve=>{release=resolve;});
  const entered=new Promise(resolve=>{started=resolve;});
  const waitlist={...approvedWaitlist,async isApproved(){if(block){block=false;started();await blocked;}return true;}};
  const f=await fixture(t,{waitlist}),alice=await connect(f,'alice-session');
  let done;
  const finished=new Promise(resolve=>{done=resolve;});
  const executed=[],command=f.world.command;
  f.world.command=(id,message)=>{executed.push(message);if(executed.length===4)done();return command(id,message);};
  t.after(()=>release());
  const spawn=f.world.snapshot().players.find(player=>player.id==='alice').position;
  const pose=value=>({type:'pose',position:spawn,yaw:value/100,altitude:0});
  block=true;alice.ws.send(JSON.stringify(pose(0)));await entered;
  for(let i=1;i<=12;i++)alice.ws.send(JSON.stringify(pose(i)));
  alice.ws.send(JSON.stringify({type:'travel',localId:'local-00',requestId:'travel'}));
  for(let i=13;i<=24;i++)alice.ws.send(JSON.stringify(pose(i)));
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(alice.ws.readyState,WebSocket.OPEN);
  release();
  await alice.waitFor(message=>message.type==='result'&&message.requestId==='travel');
  await finished;
  assert.deepEqual(executed,[pose(0),pose(12),{type:'travel',localId:'local-00'},pose(24)]);
});

test('real shared snapshots propagate grants and owner undo across two WebSocket accounts',async t=>{
  const f=await fixture(t),alice=await connect(f,'alice-session'),bob=await connect(f,'bob-session');
  assert.equal((await bob.waitFor(message=>message.type==='snapshot')).players.length,2);
  const localId='local-00';
  assert.equal((await alice.command({type:'travel',localId})).ok,true,'requestId must be removed before strict world validation');
  assert.equal((await bob.command({type:'travel',localId})).ok,true);
  const granted=await alice.command({type:'wish',localId,kind:'dragon'});
  assert.equal(granted.ok,true);
  const aliceGrant=await alice.waitFor(message=>message.type==='snapshot' && message.locals.find(local=>local.id===localId)?.wish?.ownerId==='alice');
  const resultIndex=alice.messages.findIndex(message=>message===granted);
  assert.ok(alice.messages.indexOf(aliceGrant)<resultIndex,'successful command snapshot arrives before its result');
  f.advance();
  const bobGrant=await bob.waitFor(message=>message.type==='snapshot' && message.locals.find(local=>local.id===localId)?.wish?.ownerId==='alice');
  assert.deepEqual(bobGrant.locals.find(local=>local.id===localId).position,aliceGrant.locals.find(local=>local.id===localId).position);
  assert.equal(bobGrant.wishes.granted,1);
  const denied=await bob.command({type:'undoWish',localId});
  assert.equal(denied.ok,false);assert.equal(denied.error,'not_wish_owner');
  assert.equal((await bob.command({type:'wish',localId,kind:'dog'})).ok,false);
  const after=bob.messages.length;
  assert.equal((await alice.command({type:'undoWish',localId})).ok,true);
  f.advance();
  const removed=await bob.waitFor(message=>message.type==='snapshot' && message.locals.find(local=>local.id===localId)?.wish===null,after);
  assert.equal(removed.wishes.granted,1);assert.equal(removed.wishes.resolved,1);
});

test('town chat reaches both accounts through the shared WebSocket transport',async t=>{
  const f=await fixture(t),alice=await connect(f,'alice-session'),bob=await connect(f,'bob-session');
  const sent=await alice.command({type:'chat',text:'Hello from Alice'});
  assert.equal(sent.ok,true);
  const own=await alice.waitFor(message=>message.type==='snapshot'&&message.chat?.some(entry=>entry.id===sent.id));
  assert.equal(own.chat.at(-1).authorId,'alice');
  f.advance();
  const received=await bob.waitFor(message=>message.type==='snapshot'&&message.chat?.some(entry=>entry.id===sent.id));
  assert.equal(received.chat.at(-1).text,'Hello from Alice');
});

test('player creations reach peers through snapshots and only the owner can remove them',async t=>{
  const worldData={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],stores:[],buildings:[],roads:[],communityLocations:[]};
  const f=await fixture(t,{worldData}),alice=await connect(f,'alice-session'),bob=await connect(f,'bob-session');
  const placed=await alice.command({type:'build',action:'place',kind:'planter',finish:'teal',position:[-12,3],yaw:0});
  assert.equal(placed.ok,true);
  const own=await alice.waitFor(message=>message.type==='snapshot'&&message.builds?.some(item=>item.id===placed.item.id));
  assert.equal(own.builds[0].ownerName,'Alice');
  f.advance();
  const seen=await bob.waitFor(message=>message.type==='snapshot'&&message.builds?.some(item=>item.id===placed.item.id));
  assert.equal(seen.builds[0].finish,'teal');
  const saved=await alice.command({type:'inventory',action:'save',buildId:placed.item.id});
  assert.equal(saved.ok,true);
  assert.deepEqual((await alice.command({type:'inventory',action:'list'})).items,[saved.item]);
  assert.equal((await bob.command({type:'inventory',action:'list'})).error,'admin_only');
  assert.equal((await bob.command({type:'build',action:'place',templateId:saved.item.id,position:[-12,3],yaw:0})).error,'admin_only');
  assert.equal(bob.messages.some(message=>JSON.stringify(message).includes(saved.item.id)),false,'private inventory never reaches a peer');
  assert.equal((await bob.command({type:'build',action:'remove',id:placed.item.id})).error,'admin_only');
  const before=bob.messages.length;
  assert.equal((await alice.command({type:'build',action:'remove',id:placed.item.id})).ok,true);
  f.advance();
  assert.deepEqual((await bob.waitFor(message=>message.type==='snapshot'&&message.builds?.length===0,before)).builds,[]);
  const copied=await alice.command({type:'build',action:'place',templateId:saved.item.id,position:[-12,3],yaw:0});
  assert.equal(copied.ok,true);
  f.advance();
  assert.equal((await bob.waitFor(message=>message.type==='snapshot'&&message.builds?.some(item=>item.id===copied.item.id))).builds[0].finish,'teal');
  assert.equal(bob.messages.some(message=>JSON.stringify(message).includes(saved.item.id)),false,'later public snapshots still omit private inventory');
});

test('appearance change is visible to peers and restored when the account rejoins',async t=>{
  const f=await fixture(t),alice=await connect(f,'alice-session'),bob=await connect(f,'bob-session');
  const changed=await alice.command({type:'appearance',appearance:'woman-tailored'});
  assert.equal(changed.ok,true);
  f.advance();
  const seen=await bob.waitFor(message=>message.type==='snapshot'&&message.players.some(player=>player.id==='alice'&&player.appearance==='woman-tailored'));
  assert.equal(seen.players.find(player=>player.id==='bob').appearance,'sable-human');
  alice.ws.close();
  await closed(alice.ws);
  const rejoined=await connect(f,'alice-session');
  assert.equal(rejoined.messages[0].players.find(player=>player.id==='alice').appearance,'woman-tailored');
});

test('tickets bind account and session, expire, and are consumed once',async t=>{
  const f=await fixture(t),token=await f.issue('alice-session');
  await assert.rejects(connect(f,'bob-session',token),/401/);
  await assert.rejects(connect(f,'alice-other-session',token),/401/);
  const alice=await connect(f,'alice-session',token);
  assert.equal(alice.messages[0].selfId,'alice');
  await assert.rejects(connect(f,'alice-session',token),/401/);
  const expired=await f.issue('bob-session');f.advance(15001);
  await assert.rejects(connect(f,'bob-session',expired),/401/);
  assert.equal(f.world.players.size,1);
});

test('moderator ban disconnects, releases owned wishes, invalidates tickets and persists on disk',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'river-oaks-transport-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'moderation.json'),moderation=await createModeration(path);
  const f=await fixture(t,{moderation}),alice=await connect(f,'alice-session');
  assert.equal((await alice.command({type:'travel',localId:'local-00'})).ok,true);
  assert.equal((await alice.command({type:'wish',localId:'local-00',kind:'dragon'})).ok,true);
  const reserved=await f.issue('alice-session'),ended=closed(alice.ws);
  const response=await f.post('/api/moderation/ban','moderator-session',{userId:'alice',banned:true});
  assert.equal(response.status,200);await response.json();
  assert.equal((await ended).code,4003);
  assert.equal(f.world.players.has('alice'),false);
  assert.equal(f.world.snapshot().locals[0].wish,null);
  const denied=await f.post('/api/multiplayer/ticket','alice-session');
  assert.equal(denied.status,403);await denied.json();
  assert.equal((await createModeration(path)).isBanned('alice'),true,'ban survives moderation store reload');
  const unban=await f.post('/api/moderation/ban','moderator-session',{userId:'alice',banned:false});
  assert.equal(unban.status,200);await unban.json();
  await assert.rejects(connect(f,'alice-session',reserved),/401/,'ban revoked previously issued ticket even after unban');
  const rejoined=await connect(f,'alice-session');
  assert.equal(rejoined.messages[0].selfId,'alice');
  assert.equal((await createModeration(path)).isBanned('alice'),false);
});

test('logout callback disconnects immediately and invalidates session and reserved tickets',async t=>{
  const f=await fixture(t),alice=await connect(f,'alice-session'),reserved=await f.issue('alice-session');
  const ended=closed(alice.ws);
  const response=await f.post('/auth/logout','alice-session');
  assert.equal(response.status,200);await response.json();
  assert.equal((await ended).code,4003);
  assert.equal(f.world.players.has('alice'),false);
  const denied=await f.post('/api/multiplayer/ticket','alice-session');
  assert.equal(denied.status,401);await denied.json();
  await assert.rejects(connect(f,'alice-session',reserved),/401/);
  await assert.rejects(connect(f,'alice-other-session',reserved),/401/);
});

test('another tab replaces the same account without duplicating roster or resetting owned wishes',async t=>{
  const f=await fixture(t),original=await connect(f,'alice-session');
  await original.command({type:'travel',localId:'local-00'});
  await original.command({type:'wish',localId:'local-00',kind:'dragon'});
  const ended=closed(original.ws),replacement=await connect(f,'alice-other-session');
  assert.equal((await ended).code,4009);
  const snapshot=replacement.messages[0];
  assert.deepEqual(snapshot.players.map(player=>player.id),['alice']);
  assert.equal(f.world.players.size,1);
  assert.equal(snapshot.locals[0].wish.ownerId,'alice');
  assert.equal((await replacement.command({type:'undoWish',localId:'local-00'})).ok,true);
});

test('oversized WebSocket payload closes before any real world mutation',async t=>{
  const f=await fixture(t),alice=await connect(f,'alice-session');
  const before=f.world.snapshot(),ended=closed(alice.ws);
  alice.ws.send(JSON.stringify({type:'wish',localId:'local-00',kind:'dragon',padding:'x'.repeat(3000)}));
  assert.equal((await ended).code,1009);
  assert.deepEqual(f.world.snapshot().wishes,before.wishes);
  assert.deepEqual(f.world.snapshot().locals,before.locals);
});


// Send exact request targets/upgrade headers without fetch or ws normalizing them.
function rawRequest(origin, request) {
  const address=new URL(origin);
  return new Promise((resolve,reject)=>{
    const socket=createConnection({host:address.hostname,port:Number(address.port)});
    let response='';
    const timeout=setTimeout(()=>{socket.destroy();reject(new Error('Raw HTTP response timed out'));},2500);
    socket.setEncoding('utf8');
    socket.once('connect',()=>socket.write(request));
    socket.on('data',chunk=>{response+=chunk;});
    socket.once('end',()=>{clearTimeout(timeout);resolve(response);});
    socket.once('error',error=>{clearTimeout(timeout);reject(error);});
  });
}

test('malformed raw HTTP URL returns 400 without an unhandled rejection and server stays available',async t=>{
  const f=await fixture(t),rejections=[];
  const record=reason=>rejections.push(reason);
  process.on('unhandledRejection',record);
  t.after(()=>process.off('unhandledRejection',record));
  const response=await rawRequest(f.origin,'GET //% HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
  assert.match(response,/^HTTP\/1\.1 400 /);
  assert.match(response,/Request could not be completed/);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(rejections,[]);
  const health=await fetch(f.origin+'/health');
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{ok:true,players:0});
});

test('invalid WebSocket key cannot admit a player before the handshake is validated',async t=>{
  const f=await fixture(t),token=await f.issue('alice-session');
  const response=await rawRequest(f.origin,[
    `GET /multiplayer?ticket=${token} HTTP/1.1`,
    'Host: localhost',
    'Connection: Upgrade',
    'Upgrade: websocket',
    'Sec-WebSocket-Version: 13',
    'Sec-WebSocket-Key: definitely-not-a-valid-websocket-key',
    `Origin: ${publicOrigin}`,
    'Cookie: test_session=alice-session',
    '', '',
  ].join('\r\n'));
  assert.match(response,/^HTTP\/1\.1 400 /);
  assert.equal(f.world.players.size,0,'authenticated identity is not admitted until handleUpgrade validates the handshake');
  assert.deepEqual(f.world.snapshot().players,[]);
  const alice=await connect(f,'alice-session');
  assert.equal(alice.messages[0].selfId,'alice');
  assert.deepEqual(alice.messages[0].players.map(player=>player.id),['alice']);
  assert.equal(f.world.players.size,1);
});
