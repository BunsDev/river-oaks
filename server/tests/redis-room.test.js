import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import Redis from 'ioredis';
import { createRedisRoom } from '../redis-room.js';
import { compileRegionPackage } from '../region-package.js';

const enabled=Boolean(process.env.REDIS_URL);
const testRedis=(name,fn)=>test(name,{skip:!enabled},fn);
const worldData={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],collisionPolygons:[],stores:[],buildings:[],
  communityLocations:[{id:'a',name:'Garden',position:[-12,0,0]},{id:'b',name:'Gallery',position:[12,0,0]},{id:'c',name:'Plaza',position:[0,15,0]}]};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function setup(t,{authorize=async()=>true,world=worldData}={}) {
  const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,retryStrategy:null});
  redis.on('error',()=>{});await redis.connect();
  const prefix=`{river-oaks:test:${randomUUID()}}`,rooms=[];
  let time=100000;
  const create=(client=redis)=>{const room=createRedisRoom({redis:client,prefix,worldData:world,authorize,now:()=>time,isAdmin:id=>id==='alice'});rooms.push(room);return room;};
  t.after(async()=>{
    await Promise.all(rooms.map(room=>room.close()));
    const keys=await redis.keys(`${prefix}:*`);
    if(keys.length)await redis.del(...keys);
    await redis.quit();
  });
  const identity=(userId,sessionId=`${userId}-session`)=>({userId,name:userId,sessionId,expiresAt:time+120000});
  const join=(room,userId,connectionId=`${userId}-socket`,sessionId)=>room.request({type:'join',identity:identity(userId,sessionId),connectionId});
  const command=(room,userId,message,connectionId=`${userId}-socket`)=>room.request({type:'command',userId,connectionId,message});
  return {redis,prefix,create,identity,join,command,advance(ms){time+=ms;}};
}

testRedis('two coordinators share committed players, wishes, ownership and concurrent operations',async t=>{
  const f=await setup(t),a=f.create(),b=f.create();
  assert.equal(await a.read(),null);
  const joined=await Promise.all([f.join(a,'alice'),f.join(b,'bob')]);
  assert.ok(joined.every(result=>result.ok));
  assert.equal((await a.read()).snapshot.players.length,2);
  assert.deepEqual(await a.read(),await b.read());
  assert.equal((await f.command(a,'alice',{type:'travel',localId:'local-00'})).ok,true);
  assert.equal((await f.command(b,'bob',{type:'travel',localId:'local-00'})).ok,true);
  const grants=await Promise.all([
    f.command(a,'alice',{type:'wish',localId:'local-00',kind:'dragon'}),
    f.command(b,'bob',{type:'wish',localId:'local-00',kind:'dog'}),
  ]);
  assert.equal(grants.filter(result=>result.ok).length,1);
  const view=await b.read(),owner=view.snapshot.locals[0].wish.ownerId,other=owner==='alice'?'bob':'alice';
  assert.equal(view.snapshot.wishes.granted,1);
  assert.equal((await f.command(b,other,{type:'undoWish',localId:'local-00'})).error,'not_wish_owner');
  assert.equal((await f.command(a,owner,{type:'undoWish',localId:'local-00'})).ok,true);
  assert.equal((await b.read()).snapshot.locals[0].wish,null);
});

testRedis('separate world rooms isolate presence, commands, and snapshots for the same account',async t=>{
  const f=await setup(t),river=f.create(),prefix=`{river-oaks:test:${randomUUID()}}`;
  const garden=createRedisRoom({redis:f.redis,prefix,worldId:'garden-2',worldData,now:()=>100000,authorize:async()=>true,isAdmin:id=>id==='alice'});
  try {
    assert.equal((await f.join(river,'alice')).ok,true);
    assert.equal((await garden.request({type:'join',identity:f.identity('alice'),connectionId:'garden-socket'})).ok,true);
    assert.equal((await f.join(river,'bob')).ok,true);
    assert.deepEqual((await river.read()).snapshot.players.map(player=>player.id),['alice','bob']);
    assert.deepEqual((await garden.read()).snapshot.players.map(player=>player.id),['alice']);
    assert.equal((await river.read()).snapshot.worldId,'river-oaks');
    assert.equal((await garden.read()).snapshot.worldId,'garden-2');
    assert.equal((await f.command(garden,'alice',{type:'chat',text:'wrong socket'})).error,'stale_connection');
    assert.equal((await f.command(garden,'alice',{type:'chat',text:'Private garden'},'garden-socket')).ok,true);
    assert.deepEqual((await river.read()).snapshot.chat,[]);
    assert.equal((await garden.read()).snapshot.chat[0].text,'Private garden');
  } finally {
    await garden.close();
    const keys=await f.redis.keys(`${prefix}:*`);if(keys.length)await f.redis.del(...keys);
  }
});

testRedis('visitor counts are bounded room projections that expire without a live coordinator',async t=>{
  const f=await setup(t),room=f.create(),key=`${f.prefix}:population`;
  assert.equal(await f.redis.get(key),null);
  assert.equal((await f.join(room,'alice')).ok,true);
  assert.equal(await f.redis.get(key),'1');
  assert.ok((await f.redis.ttl(key))>0);
  assert.equal((await f.join(room,'bob')).ok,true);
  assert.equal(await f.redis.get(key),'2');
  assert.equal((await room.request({type:'leave',userId:'bob',connectionId:'bob-socket'})).ok,true);
  assert.equal(await f.redis.get(key),'1');
  await f.redis.pexpire(key,50);
  await delay(220);
  assert.equal(await f.redis.get(key),null);
  await room.tick();
  assert.equal(await f.redis.get(key),'1');
});

testRedis('restart restores checkpoint and replacing an account preserves wishes while fencing stale sockets',async t=>{
  const f=await setup(t),first=f.create();
  await f.join(first,'alice');await f.command(first,'alice',{type:'travel',localId:'local-00'});
  await f.command(first,'alice',{type:'wish',localId:'local-00',kind:'dragon'});
  const before=await first.read();await first.close();
  const replacement=f.create();
  assert.equal((await f.join(replacement,'alice','alice-new','alice-new-session')).ok,true);
  const after=await replacement.read();
  assert.deepEqual(after.snapshot.locals,before.snapshot.locals);
  assert.equal(after.snapshot.players.length,1);
  assert.equal(after.connections[0].connectionId,'alice-new');
  assert.equal((await f.command(replacement,'alice',{type:'undoWish',localId:'local-00'})).error,'stale_connection');
  assert.equal((await f.command(replacement,'alice',{type:'undoWish',localId:'local-00'},'alice-new')).ok,true);
  assert.equal((await f.command(replacement,'alice',{type:'wish',localId:'local-00',kind:'dog'},'alice-new')).error,'wish_cooldown');
});

testRedis('private home invitations survive coordinator replacement and revocation ejects guests',async t=>{
  const sample=JSON.parse(readFileSync(new URL('../../preview/public/data/sample-region.json',import.meta.url)));
  const region={...sample,buildings:sample.buildings.map((building,index)=>index===2
    ? {...building,interior:{name:'Moon House',category:'home',entrance:'south',access:'owner'}}:building)};
  const world=compileRegionPackage(region,'Moon Garden'),storeId=world.stores[0].id;
  const f=await setup(t,{world}),first=f.create();
  assert.equal((await f.join(first,'alice')).ok,true);
  assert.equal((await f.join(first,'bob')).ok,true);
  assert.equal((await f.command(first,'bob',{type:'travel',storeId,mode:'enter'})).error,'private_home');
  assert.equal((await f.command(first,'bob',{type:'homeAccess',action:'grant',storeId,peerId:'bob'})).error,'admin_only');
  assert.equal((await f.command(first,'alice',{type:'homeAccess',action:'grant',storeId,peerId:'bob'})).ok,true);
  await first.close();
  const replacement=f.create();
  assert.deepEqual((await f.command(replacement,'bob',{type:'homeAccess',action:'list'})).homes.map(home=>home.storeId),[storeId]);
  assert.equal((await f.command(replacement,'bob',{type:'travel',storeId,mode:'enter'})).ok,true);
  assert.equal((await f.command(replacement,'bob',{type:'wish',localId:'local-00',kind:'dragon'})).error,'admin_only');
  assert.equal((await f.command(replacement,'alice',{type:'homeAccess',action:'revoke',storeId,peerId:'bob'})).ok,true);
  assert.deepEqual((await f.command(replacement,'bob',{type:'homeAccess',action:'list'})).homes,[]);
  assert.equal((await f.command(replacement,'bob',{type:'travel',storeId,mode:'enter'})).error,'private_home');
});

testRedis('default room upgrades a stored version-one checkpoint without losing its roster',async t=>{
  const f=await setup(t),room=f.create();
  assert.equal((await f.join(room,'alice')).ok,true);
  const key=`${f.prefix}:state`,stored=JSON.parse(inflateSync(await f.redis.getBuffer(key)).toString('utf8'));
  stored.version=1;delete stored.worldId;
  const checkpoint=stored.checkpoint;
  checkpoint.version=1;delete checkpoint.worldId;
  checkpoint.checksum=createHash('sha256').update(JSON.stringify({version:1,worldFingerprint:checkpoint.worldFingerprint,payload:checkpoint.payload})).digest('hex');
  await f.redis.set(key,deflateSync(Buffer.from(JSON.stringify(stored))));
  await room.close();
  const restored=f.create();
  assert.equal((await f.join(restored,'alice','replacement')).ok,true);
  assert.deepEqual((await restored.read()).snapshot.players.map(player=>player.id),['alice']);
  assert.equal((await restored.read()).snapshot.worldId,'river-oaks');
});

testRedis('authorization revocation and presence expiration remove residents and owned wishes',async t=>{
  const invalid=new Set(),f=await setup(t,{authorize:async identity=>!invalid.has(identity.sessionId)}),room=f.create();
  invalid.add('banned-session');
  assert.equal((await f.join(room,'banned','banned-socket','banned-session')).ok,false);
  await f.join(room,'alice');await f.command(room,'alice',{type:'travel',localId:'local-00'});
  await f.command(room,'alice',{type:'wish',localId:'local-00',kind:'dragon'});
  invalid.add('alice-session');
  assert.equal((await f.command(room,'alice',{type:'undoWish',localId:'local-00'})).ok,false);
  assert.equal((await room.read()).snapshot.players.length,0);
  assert.equal((await room.read()).snapshot.locals[0].wish,null);
  await f.join(room,'bob');
  assert.equal((await room.request({type:'leave',userId:'bob',connectionId:'bob-socket'})).ok,true);
  assert.equal((await room.read()).snapshot.players.length,1,'disconnect receives reconnect grace');
  f.advance(10001);await delay(210);await room.tick();
  assert.equal((await room.read()).snapshot.players.length,0);
  await f.join(room,'carol');f.advance(19000);
  assert.equal((await room.request({type:'heartbeat',userId:'carol',connectionId:'carol-socket'})).ok,true);
  f.advance(19000);await delay(210);await room.tick();
  assert.equal((await room.read()).snapshot.players.length,1);
  f.advance(1001);await delay(210);await room.tick();
  assert.equal((await room.read()).snapshot.players.length,0);
});

testRedis('session-scoped kick cannot evict a replacement session and expired identities cannot join',async t=>{
  const f=await setup(t),room=f.create();
  const expired={...f.identity('expired'),expiresAt:0};
  assert.equal((await room.request({type:'join',identity:expired,connectionId:'expired-socket'})).ok,false);
  await f.join(room,'alice');await f.join(room,'alice','new-connection','new-session');
  await room.request({type:'kick',userId:'alice',sessionId:'alice-session'});
  assert.equal((await room.read()).snapshot.players.length,1);
  await room.request({type:'kick',userId:'alice',sessionId:'new-session'});
  assert.equal((await room.read()).snapshot.players.length,0);
});

testRedis('lost lease cannot publish replies or trim queue; next leader replays from committed state',async t=>{
  const f=await setup(t),leader=f.create();await f.join(leader,'alice');
  const stateBefore=await f.redis.getBuffer(`${f.prefix}:state`);
  let release,entered;
  const blocked=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  let intercepted=false;
  const proxy=new Proxy(f.redis,{get(target,key){
    if(key==='eval')return async(...args)=>{
      if(String(args[0]).includes('COMMIT_ROOM') && !intercepted){intercepted=true;entered();await gate;}
      return target.eval(...args);
    };
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  await leader.close();
  const stalled=f.create(proxy),request= f.command(stalled,'alice',{type:'travel',localId:'local-00'});
  await blocked;
  assert.equal(await f.redis.llen(`${f.prefix}:queue`),1);
  assert.deepEqual(await f.redis.getBuffer(`${f.prefix}:state`),stateBefore);
  assert.equal((await f.redis.keys(`${f.prefix}:reply:*`)).length,1,'only earlier committed join has a reply');
  await f.redis.set(`${f.prefix}:lease`,'v4:different-leader','PX',5000);
  release();await delay(250);
  assert.equal(await f.redis.llen(`${f.prefix}:queue`),1,'stale commit cannot trim pending operation');
  assert.deepEqual(await f.redis.getBuffer(`${f.prefix}:state`),stateBefore);
  await stalled.close();
  assert.equal(await f.redis.get(`${f.prefix}:lease`),'v4:different-leader','close only releases its own lease');
  await f.redis.del(`${f.prefix}:lease`);
  const survivor=f.create();await survivor.tick();
  await request;
  const view=await survivor.read();
  assert.equal(view.snapshot.players.length,1);
  assert.equal(await f.redis.llen(`${f.prefix}:queue`),0);
  assert.notDeepEqual(view.snapshot.players[0].position,[-12,0,0]);
});

testRedis('durable queue bound rejects overflow without deleting accepted work',async t=>{
  const f=await setup(t),room=f.create();
  await f.redis.rpush(`${f.prefix}:queue`,...Array.from({length:4096},(_,i)=>JSON.stringify({id:`reserved-${i}`})));
  const result=await f.join(room,'alice');
  assert.equal(result.error,'queue_full');
  assert.equal(await f.redis.llen(`${f.prefix}:queue`),4096);
  assert.equal(await room.read(),null);
});

testRedis('a stalled commit respects the request deadline without exposing an uncommitted result',async t=>{
  const f=await setup(t);
  let release,entered;
  const gate=new Promise(resolve=>{release=resolve;}),blocked=new Promise(resolve=>{entered=resolve;});
  const proxy=new Proxy(f.redis,{get(target,key){
    if(key==='eval')return async(...args)=>{
      if(String(args[0]).includes('COMMIT_ROOM')){entered();await gate;}
      return target.eval(...args);
    };
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  const room=f.create(proxy),pending=f.join(room,'alice');
  await blocked;
  let watchdog;
  try {
    const result=await Promise.race([pending,new Promise(resolve=>{watchdog=setTimeout(()=>resolve({error:'deadline_missing'}),7600);})]);
    assert.equal(result.error,'request_timeout');
    assert.equal(await room.read(),null,'timed-out tentative join has no published view');
  } finally {
    clearTimeout(watchdog);await room.close();release();await pending;
  }
});

testRedis('owned ticks use two Redis round trips and throttled ticks do not refetch full views',async t=>{
  const f=await setup(t);let tracking=false;const calls=[];
  const proxy=new Proxy(f.redis,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return async(...args)=>{if(tracking)calls.push(key);return value.apply(target,args);};}});
  const room=f.create(proxy);await f.join(room,'alice');await delay(210);tracking=true;
  await room.tick();
  assert.ok(calls.length<=2,`Owned tick Redis calls: ${calls.join(', ')}`);
  tracking=false;calls.length=0;
  // The just-completed tick can run longer than200ms under network load. Start
  // concurrent ticks to assert overlap coalescing independently of RTT.
  tracking=true;
  await Promise.all([room.tick(),room.tick(),room.tick()]);
  assert.ok(calls.length<=2,`Coalesced tick Redis calls: ${calls.join(', ')}`);
});

testRedis('a previous leader reloads state after another instance committed during its lease loss',async t=>{
  const f=await setup(t),a=f.create(),b=f.create();await f.join(a,'alice');
  await f.redis.del(`${f.prefix}:lease`);
  await f.join(b,'bob');await f.command(b,'alice',{type:'travel',localId:'local-00'});
  await f.command(b,'alice',{type:'wish',localId:'local-00',kind:'dragon'});
  await f.redis.del(`${f.prefix}:lease`);await delay(210);await a.tick();
  const view=await a.read();
  assert.equal(view.snapshot.players.length,2);
  assert.equal(view.snapshot.locals[0].wish.ownerId,'alice');
  assert.equal(view.snapshot.wishes.granted,1);
});

testRedis('JWT expiry denies commands but preserves wishes through fresh-token reconnect grace',async t=>{
  const revoked=new Set(),f=await setup(t,{authorize:async identity=>!revoked.has(identity.sessionId)}),room=f.create();
  const identity={...f.identity('alice'),expiresAt:101000};
  assert.equal((await room.request({type:'join',identity,connectionId:'alice-socket'})).ok,true);
  await f.command(room,'alice',{type:'travel',localId:'local-00'});
  await f.command(room,'alice',{type:'wish',localId:'local-00',kind:'dragon'});
  f.advance(1001);
  assert.equal((await f.command(room,'alice',{type:'undoWish',localId:'local-00'})).error,'session_expired');
  assert.equal((await room.read()).snapshot.locals[0].wish.ownerId,'alice');
  assert.equal((await f.join(room,'alice','alice-refreshed')).ok,true);
  assert.equal((await room.read()).snapshot.locals[0].wish.ownerId,'alice');
  assert.equal((await f.command(room,'alice',{type:'undoWish',localId:'local-00'},'alice-refreshed')).ok,true);
  const bob={...f.identity('bob'),expiresAt:102000};
  await room.request({type:'join',identity:bob,connectionId:'bob-socket'});
  f.advance(1000);revoked.add('bob-session');await delay(210);await room.tick();
  assert.equal((await room.read()).snapshot.players.some(player=>player.id==='bob'),false,'revocation is immediate even within expired-token grace');
  const carol={...f.identity('carol'),expiresAt:103000};
  await room.request({type:'join',identity:carol,connectionId:'carol-socket'});
  f.advance(11000);await delay(210);await room.tick();
  assert.equal((await room.read()).snapshot.players.some(player=>player.id==='carol'),false,'expired-token grace is bounded to10s');
});

testRedis('competing edges reserve one furniture slot and recover it through coordinator replacement',async t=>{
  const f=await setup(t),first=f.create(),second=f.create();
  for(const id of ['alice','bob','charlie'])assert.equal((await f.join(first,id)).ok,true);
  const placed=await f.command(first,'alice',{type:'build',action:'place',kind:'seat',finish:'rose',position:[-12,3],yaw:0});assert.equal(placed.ok,true);
  const intent={type:'sit',buildId:placed.item.id,slot:0};
  const results=await Promise.all([f.command(first,'bob',intent),f.command(second,'charlie',intent)]);
  assert.equal(results.filter(result=>result.ok).length,1);assert.equal(results.find(result=>!result.ok).error,'seat_occupied');
  const before=(await first.read()).snapshot,winner=before.players.find(player=>player.sitting)?.id;
  assert.ok(winner==='bob'||winner==='charlie');
  await first.close();await second.close();
  const replacement=f.create();assert.equal((await f.join(replacement,winner,`${winner}-new`)).ok,true);
  const recovered=(await replacement.read()).snapshot.players.find(player=>player.id===winner);
  assert.equal(recovered.sitting.buildId,placed.item.id);assert.equal(recovered.sitting.slot,0);
  assert.equal((await f.command(replacement,'alice',{type:'build',action:'remove',id:placed.item.id})).error,'seat_in_use');
  assert.equal((await f.command(replacement,winner,{type:'stand'},`${winner}-new`)).ok,true);
  const other=winner==='bob'?'charlie':'bob';
  assert.equal((await f.command(replacement,other,intent)).ok,true);
  assert.equal((await replacement.request({type:'leave',userId:other,connectionId:`${other}-socket`})).ok,true);
  assert.equal((await f.command(replacement,'alice',intent)).error,'seat_occupied','reconnect grace retains the reservation');
  f.advance(11000);await replacement.tick();
  const released=await f.command(replacement,'alice',intent);assert.equal(released.ok,true,JSON.stringify(released));
});

testRedis('an upgraded coordinator takes over an older lease without waiting for its TTL',async t=>{
  const f=await setup(t),room=f.create(),key=`${f.prefix}:lease`,legacy=`v3:${randomUUID()}`;
  await f.redis.set(key,legacy,'PX',5000);
  await room.tick();
  const owner=await f.redis.get(key);
  assert.notEqual(owner,legacy,'a pre-creator writer cannot keep renewing the obsolete lease');
  assert.match(owner,/^v4:/);
  assert.equal((await room.read()).snapshot.worldId,'river-oaks');
});

testRedis('an older generation does not steal an active newer coordinator lease',async t=>{
  const f=await setup(t),room=f.create(),key=`${f.prefix}:lease`,future=`v5:${randomUUID()}`;
  await f.redis.set(key,future,'PX',5000);
  await room.tick();
  assert.equal(await f.redis.get(key),future);
  assert.equal(await room.read(),null);
});
