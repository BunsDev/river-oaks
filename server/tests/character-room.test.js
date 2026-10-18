import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {inflateSync,deflateSync} from 'node:zlib';
import Redis from 'ioredis';
import {createRedisRoom} from '../redis-room.js';
import {createRedisCharacterStore} from '../character-store.js';
import {createMemoryAvatarPreferences} from '../avatar-preferences.js';
import {customizedCharacterDefinition} from '../../preview/src/character-customization.js';

const worldData={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],collisionPolygons:[],stores:[],buildings:[],
  communityLocations:[{id:'garden',name:'Garden',position:[-12,0,0]}]};
const pause=()=>new Promise(resolve=>setTimeout(resolve,210));
const options={skip:!process.env.REDIS_URL,timeout:30000};
async function fixture(t){
 const redis=new Redis(process.env.REDIS_URL),prefix=`{character-room:${randomUUID()}}`,accountPrefix=`{character-account:${randomUUID()}}`;
 redis.on('error',()=>{});let time=100000,authorized=true;const rooms=[],prefixes=new Set([prefix]);
 const store=createRedisCharacterStore({redis,prefix:accountPrefix}),legacy=createMemoryAvatarPreferences();
 const create=(overrides={})=>{const config={redis,prefix,characters:store,avatarPreferences:legacy,worldData,now:()=>time,authorize:async()=>authorized,...overrides};
  prefixes.add(config.prefix);const room=createRedisRoom(config);rooms.push(room);return room;};
 t.after(async()=>{await Promise.all(rooms.map(r=>r.close()));for(const p of [...prefixes,accountPrefix]){const keys=await redis.keys(`${p}:*`);if(keys.length)await redis.del(...keys);}await redis.quit();});
 const identity={userId:'alice',name:'Alice',sessionId:'alice-session',expiresAt:time+120000};
 const join=room=>room.request({type:'join',identity,connectionId:'alice-socket'});
 const enqueue=async(message,selection={expectedVersion:1,requestId:'equip'},p=prefix,extra={})=>{
  const id=randomUUID();await redis.rpush(`${p}:queue`,JSON.stringify({id,operation:{type:'command',userId:'alice',connectionId:'alice-socket',message,selection,...extra}}));return id;};
 const reply=async(id,p=prefix)=>{const raw=await redis.get(`${p}:reply:${id}`);return raw?JSON.parse(raw):null;};
 const tick=async room=>{await pause();return room.tick();};
 const stored=async(p=prefix)=>JSON.parse(inflateSync(await redis.getBuffer(`${p}:state`)).toString('utf8'));
 const publish=async()=>{await store.saveDraft('alice',customizedCharacterDefinition('alice','sable-human',{palette:'rose',hair:'espresso'}),{expectedVersion:0,requestId:'draft'});await store.publish('alice',{expectedVersion:1,requestId:'publish'});};
 return {redis,prefix,store,legacy,create,join,enqueue,reply,tick,stored,publish,advance:ms=>{time+=ms;},authorize:value=>{authorized=value;}};
}

test('Redis selection prepares durably before account CAS and acknowledges only confirmed projection',options,async t=>{
 const f=await fixture(t),room=f.create();await f.join(room);await f.publish();
 assert.equal((await f.store.getSelection('alice'))?.version,1);
 const id=await f.enqueue({type:'character',revision:1});await f.tick(room);
 assert.equal((await f.stored()).version,3);assert.equal((await f.stored()).pendingSelections.length,1);
 assert.equal((await f.store.getSelection('alice')).version,1);assert.equal(await f.reply(id),null);
 assert.equal((await room.read()).snapshot.players[0].character,undefined);
 await f.tick(room);const reply=await f.reply(id);assert.equal(reply.ok,true);assert.equal(reply.appliedVersion,2);
 assert.equal((await f.stored()).pendingSelections.length,0);
 assert.equal((await room.read()).snapshot.players[0].character.palette,'rose');
 assert.equal((await f.store.getSelection('alice')).character.palette,'rose');
 const cooldown=await f.enqueue({type:'appearance',appearance:'sable-human'},{expectedVersion:2,requestId:'too-soon'});
 await f.tick(room);assert.equal((await f.reply(cooldown)).error,'appearance_cooldown');
 assert.equal((await f.store.getSelection('alice')).version,2);
});

test('Redis failed prepare commit never writes account selection; replacement can retry the retained queue',options,async t=>{
 const f=await fixture(t);let refuse=false;
 const client=new Proxy(f.redis,{get(target,key){if(key==='eval')return async(script,...args)=>{
  if(refuse&&script.startsWith('-- COMMIT_ROOM')){refuse=false;await target.set(`${f.prefix}:lease`,'v99:fixture');return 0;}return target.eval(script,...args);};
  const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 const room=f.create({redis:client});await f.join(room);await f.publish();
 const id=await f.enqueue({type:'character',revision:1});refuse=true;await f.tick(room);
 assert.equal((await f.store.getSelection('alice'))?.version,1);
 assert.equal((await f.stored()).pendingSelections.length,0);assert.equal(await f.reply(id),null);
 assert.equal(await f.redis.llen(`${f.prefix}:queue`),1);
 await room.close();await f.redis.del(`${f.prefix}:lease`);
 const replacement=f.create();await f.tick(replacement);assert.equal((await f.store.getSelection('alice')).version,1);
 await f.tick(replacement);assert.equal((await f.reply(id)).ok,true);assert.equal((await f.store.getSelection('alice')).version,2);
});

test('Redis unavailable account writes leave the old view and intent intact, then recover without replay',options,async t=>{
 const f=await fixture(t);let unavailable=true;
 const room=f.create({characters:{...f.store,changeSelection:async(...args)=>{if(unavailable)throw new Error('fixture storage unavailable');return f.store.changeSelection(...args);}}});
 await f.join(room);await f.publish();const id=await f.enqueue({type:'character',revision:1});await f.tick(room);await f.tick(room);
 assert.equal((await f.store.getSelection('alice'))?.version,1);assert.equal((await room.read()).snapshot.players[0].character,undefined);
 assert.equal((await f.stored()).pendingSelections.length,1);assert.equal(await f.reply(id),null);
 const pose=await f.enqueue({type:'pose',position:[-12,0,0],yaw:0},undefined);await f.tick(room);
 assert.equal((await f.reply(pose)).error,'character_selection_pending');
 unavailable=false;await f.tick(room);assert.equal((await f.reply(id)).ok,true);assert.equal((await f.store.getSelection('alice')).version,2);
});

test('Redis lease loss after account CAS recovers the receipt and retry never re-equips an older selection',options,async t=>{
 const f=await fixture(t);let steal=true;
 const room=f.create({characters:{...f.store,changeSelection:async(...args)=>{const result=await f.store.changeSelection(...args);
  if(steal){steal=false;await f.redis.set(`${f.prefix}:lease`,'v99:fixture');}return result;}}});
 await f.join(room);await f.publish();const id=await f.enqueue({type:'character',revision:1});await f.tick(room);await f.tick(room);
 assert.equal((await f.store.getSelection('alice'))?.version,2);assert.equal((await room.read()).snapshot.players[0].character,undefined);
 assert.equal((await f.stored()).pendingSelections.length,1);assert.equal(await f.reply(id),null);
 await room.close();await f.redis.del(`${f.prefix}:lease`);const replacement=f.create();await f.tick(replacement);
 assert.equal((await f.reply(id)).ok,true);assert.equal((await f.store.getSelection('alice')).version,2);
 const retry=await f.enqueue({revision:1,type:'character'});await f.tick(replacement);
 assert.equal((await f.reply(retry)).ok,true);assert.equal((await f.reply(retry)).appliedVersion,2);
 f.advance(2000);const next=await f.enqueue({type:'appearance',appearance:'sable-human'},{expectedVersion:2,requestId:'newer'});
 await f.tick(replacement);await f.tick(replacement);assert.equal((await f.reply(next)).ok,true);
 const old=await f.enqueue({type:'character',revision:1});await f.tick(replacement);
 assert.equal((await f.reply(old)).ok,true);assert.equal((await f.reply(old)).appliedVersion,2);
 assert.equal((await replacement.read()).snapshot.players[0].appearance,'sable-human');assert.equal((await replacement.read()).snapshot.players[0].character,undefined);
});

test('Redis pending retry attachments are bounded and reused identities cannot change content',options,async t=>{
 const f=await fixture(t);const room=f.create({characters:{...f.store,changeSelection:async()=>{throw new Error('fixture unavailable');}}});
 await f.join(room);await f.publish();const first=await f.enqueue({type:'character',revision:1});await f.tick(room);
 const duplicate=await f.enqueue({revision:1,type:'character'}),reused=await f.enqueue({type:'appearance',appearance:'sable-human'});
 await f.tick(room);assert.equal(await f.reply(first),null);assert.equal(await f.reply(duplicate),null);
 assert.equal((await f.reply(reused)).error,'character_request_reused');
 const extra=[];for(let i=0;i<10;i++)extra.push(await f.enqueue({type:'character',revision:1}));await f.tick(room);
 const saved=await f.stored();assert.ok(saved.pendingSelections[0].replyIds.length<=8);
 assert.ok((await Promise.all(extra.map(id=>f.reply(id)))).some(r=>r?.error==='character_selection_pending'));
});

test('Redis concurrent worlds conflict on selection and converge on the confirmed account version',options,async t=>{
 const f=await fixture(t),a=f.create(),otherPrefix=`{character-room:${randomUUID()}}`,b=f.create({prefix:otherPrefix,worldId:'garden-2'});
 await f.join(a);await f.join(b);await f.publish();
 const one=await f.enqueue({type:'character',revision:1},{expectedVersion:1,requestId:'world-a'});
 const two=await f.enqueue({type:'appearance',appearance:'sable-human'},{expectedVersion:1,requestId:'world-b'},otherPrefix);
 await f.tick(a);await f.tick(b);await f.tick(a);await f.tick(b);
 assert.equal((await f.reply(one)).ok,true);assert.equal((await f.reply(two,otherPrefix)).error,'character_selection_conflict');
 assert.equal((await f.store.getSelection('alice')).version,2);
 assert.deepEqual((await a.read()).snapshot.players[0].character,(await b.read()).snapshot.players[0].character);
});

test('Redis pending selection rechecks authorization and deletion before an unapplied account mutation',options,async t=>{
 const f=await fixture(t),room=f.create();await f.join(room);await f.publish();
 const id=await f.enqueue({type:'character',revision:1});await f.tick(room);f.authorize(false);await f.tick(room);
 assert.equal((await f.reply(id)).error,'session_invalid');assert.equal((await f.store.getSelection('alice'))?.version,1);
 assert.equal((await f.stored()).pendingSelections.length,0);
 f.authorize(true);await f.join(room);const second=await f.enqueue({type:'character',revision:1},{expectedVersion:1,requestId:'before-delete'});await f.tick(room);
 await f.store.deleteAccount('alice');await f.tick(room);assert.equal((await f.reply(second)).error,'character_account_deleted');
 assert.equal(await f.store.getSelection('alice'),null);assert.equal((await f.stored()).pendingSelections.length,0);
});

test('Redis a committed account selection finalizes through departure without resurrecting its player',options,async t=>{
 const f=await fixture(t);let steal=true;
 const room=f.create({characters:{...f.store,changeSelection:async(...args)=>{const result=await f.store.changeSelection(...args);if(steal){steal=false;await f.redis.set(`${f.prefix}:lease`,'v99:fixture');}return result;}}});
 await f.join(room);await f.publish();const id=await f.enqueue({type:'character',revision:1});await f.tick(room);await f.tick(room);
 await room.close();await f.redis.del(`${f.prefix}:lease`);
 await f.redis.rpush(`${f.prefix}:queue`,JSON.stringify({id:randomUUID(),operation:{type:'kick',userId:'alice'}}));
 const replacement=f.create();await f.tick(replacement);
 assert.equal((await f.reply(id)).ok,true);assert.equal((await replacement.read()).snapshot.players.length,0);
 assert.equal((await f.stored()).pendingSelections.length,0);assert.equal((await f.store.getSelection('alice')).version,2);
});

test('Redis corrupt pending intents fail recovery before any account write',options,async t=>{
 const f=await fixture(t),room=f.create();await f.join(room);await f.publish();await f.enqueue({type:'character',revision:1});await f.tick(room);
 const saved=await f.stored();assert.equal(saved.pendingSelections?.length,1);await room.close();
 saved.pendingSelections[0].operation.fingerprint='forged';const packed=deflateSync(Buffer.from(JSON.stringify(saved)));await f.redis.set(`${f.prefix}:state`,packed);
 const replacement=f.create();await assert.rejects(replacement.tick(),/Invalid durable character selection/);
 assert.equal((await f.store.getSelection('alice')).version,1);assert.deepEqual(await f.redis.getBuffer(`${f.prefix}:state`),packed);
});

test('Redis repeated queue delivery attaches a reply only once and remains recoverable',options,async t=>{
 const f=await fixture(t),room=f.create({characters:{...f.store,changeSelection:async()=>{throw new Error('fixture unavailable');}}});
 await f.join(room);await f.publish();const id=await f.enqueue({type:'character',revision:1});await f.tick(room);
 await f.redis.rpush(`${f.prefix}:queue`,JSON.stringify({id,operation:{type:'command',userId:'alice',connectionId:'alice-socket',message:{type:'character',revision:1},selection:{expectedVersion:1,requestId:'equip'}}}));
 await f.tick(room);assert.deepEqual((await f.stored()).pendingSelections[0].replyIds,[id]);
 await room.close();const replacement=f.create();await f.tick(replacement);assert.equal((await f.reply(id)).ok,true);
});

test('Redis stale account reads cannot regress a confirmed projection or erase a rejoin response',options,async t=>{
 const f=await fixture(t);let stale=false;
 const room=f.create({characters:{...f.store,getSelection:async user=>stale?{appearance:'sable-human',movement:'upright',version:1}:f.store.getSelection(user)}});
 await f.join(room);await f.publish();const id=await f.enqueue({type:'character',revision:1});await f.tick(room);await f.tick(room);assert.equal((await f.reply(id)).ok,true);
 stale=true;const heartbeat=await f.enqueue({},undefined,f.prefix,{type:'heartbeat'});await f.tick(room);assert.equal((await f.reply(heartbeat)).ok,true);
 assert.equal((await room.read()).snapshot.players[0].character.palette,'rose');
 const rejoined=await f.join(room);assert.equal(rejoined.player?.character?.palette,'rose');
 assert.equal((await f.stored()).selectionVersions[0][1],2);
});

test('Redis recovery rejects a selection-version entry for an absent player',options,async t=>{
 const f=await fixture(t),room=f.create();await f.join(room);const saved=await f.stored();assert.ok(saved.selectionVersions);await room.close();
 saved.selectionVersions.push(['ghost',1]);await f.redis.set(`${f.prefix}:state`,deflateSync(Buffer.from(JSON.stringify(saved))));
 await assert.rejects(f.create().tick(),/Invalid durable character selection/);
});

test('Redis evicted account receipts finalize as conflict without replaying an old accepted intent',options,async t=>{
 const f=await fixture(t);let steal=true;
 const room=f.create({characters:{...f.store,changeSelection:async(...args)=>{const result=await f.store.changeSelection(...args);if(steal){steal=false;await f.redis.set(`${f.prefix}:lease`,'v99:fixture');}return result;}}});
 await f.join(room);await f.publish();const id=await f.enqueue({type:'character',revision:1});await f.tick(room);await f.tick(room);
 for(let i=0;i<65;i++)await f.store.changeSelection('alice',{type:'appearance',appearance:'sable-human'},{expectedVersion:2+i,requestId:`newer-${i}`});
 await room.close();await f.redis.del(`${f.prefix}:lease`);const replacement=f.create();await f.tick(replacement);
 assert.equal((await f.reply(id)).error,'character_selection_conflict');assert.equal((await f.stored()).pendingSelections.length,0);
 assert.equal((await replacement.read()).snapshot.players[0].appearance,'sable-human');assert.equal((await f.store.getSelection('alice')).version,67);
});


test('Redis region revision clears projection versions and restores the selected account on rejoin',options,async t=>{
 const f=await fixture(t),worldId='character-garden';
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const keys=Object.fromEntries(['catalog','region','draft','history'].map(key=>[key,`${f.prefix}:${key}`]));
 const initial={id:worldId,regionSha256:hash(worldData),revision:1};
 await f.redis.hset(keys.catalog,worldId,JSON.stringify(initial));
 await f.redis.hset(keys.region,worldId,JSON.stringify(worldData));
 const revised={...worldData,title:'Revised character garden'};
 await f.redis.hset(keys.draft,worldId,JSON.stringify({version:1,data:revised}));
 const catalog={get:async()=>JSON.parse(await f.redis.hget(keys.catalog,worldId)),getRegion:async()=>JSON.parse(await f.redis.hget(keys.region,worldId)),
  revisionCandidate:async()=>({ok:true,keys,worldData:revised,encoded:JSON.stringify(revised),
   world:{...initial,revision:2,regionSha256:hash(revised)},expectedRegionSha256:initial.regionSha256,expectedDraftVersion:1})};
 const config={worldId,regionCatalog:catalog,regionSha256:initial.regionSha256,isAdmin:id=>id==='owner'};
 const room=f.create(config);await f.join(room);await f.publish();
 await f.enqueue({type:'character',revision:1});await f.tick(room);await f.tick(room);
 assert.equal((await f.stored()).selectionVersions.length,1);
 const changed=await room.request({type:'revise',actorId:'owner',expectedDraftVersion:1});assert.equal(changed.ok,true);assert.equal(changed.disconnectedPlayers,1);
 assert.deepEqual((await f.stored()).selectionVersions,[]);
 await f.tick(room);assert.deepEqual((await room.read()).snapshot.players,[]);
 await room.close();const replacement=f.create(config);await f.tick(replacement);
 const joined=await f.join(replacement);assert.equal(joined.ok,true);assert.equal(joined.player.character.palette,'rose');
 assert.equal((await f.store.getSelection('alice')).version,2);
});

for(const transition of ['heartbeat','checkpoint rejoin'])test(`Redis removes a deleted custom character on ${transition}`,options,async t=>{
 const f=await fixture(t);let room=f.create();await f.join(room);await f.publish();
 const id=await f.enqueue({type:'character',revision:1});await f.tick(room);await f.tick(room);
 assert.equal((await f.reply(id)).ok,true);assert.equal((await room.read()).snapshot.players[0].character.palette,'rose');
 await f.store.deleteAccount('alice');
 if(transition==='heartbeat')await room.request({type:'heartbeat',userId:'alice',connectionId:'alice-socket'});
 else{await room.close();room=f.create();await f.join(room);}
 const player=(await room.read()).snapshot.players.find(player=>player.id==='alice');
 assert.equal(player?.character,undefined,'deleted customization must not survive in a room projection');
 assert.equal(await f.store.getSelection('alice'),null,'room recovery cannot recreate the tombstoned selection');
 assert.equal((await f.stored()).selectionVersions.some(([id])=>id==='alice'),false,'deleted version is removed from the durable room');
 const replay=await room.request({type:'command',userId:'alice',connectionId:'alice-socket',message:{type:'character',revision:1},selection:{expectedVersion:1,requestId:'equip'}});
 assert.equal(replay.error,'character_account_deleted','old receipts cannot re-equip deleted revisions');
 await room.close();room=f.create();await f.join(room);
 assert.equal((await room.read()).snapshot.players[0].character,undefined,'a further coordinator reload cannot restore deleted customization');
});

test('Redis retries deleted-character cleanup after a lost room lease without reviving the revision',options,async t=>{
 const f=await fixture(t);let refuse=false;
 const client=new Proxy(f.redis,{get(target,key){if(key==='eval')return async(script,...args)=>{
  if(refuse&&script.startsWith('-- COMMIT_ROOM')){refuse=false;await target.set(`${f.prefix}:lease`,'v99:fixture');return 0;}return target.eval(script,...args);};
  const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 const room=f.create({redis:client});await f.join(room);await f.publish();const equip=await f.enqueue({type:'character',revision:1});await f.tick(room);await f.tick(room);
 assert.equal((await f.reply(equip)).ok,true);await f.store.deleteAccount('alice');
 const heartbeat=await f.enqueue({},undefined,f.prefix,{type:'heartbeat'});refuse=true;await f.tick(room);
 assert.equal(await f.reply(heartbeat),null);assert.equal((await room.read()).snapshot.players[0].character.palette,'rose','uncommitted cleanup is not reported as durable');
 await room.close();await f.redis.del(`${f.prefix}:lease`);const replacement=f.create();await f.tick(replacement);
 assert.equal((await f.reply(heartbeat)).ok,true);assert.equal((await replacement.read()).snapshot.players[0].character,undefined);
 assert.equal(await f.store.getSelection('alice'),null);
});
