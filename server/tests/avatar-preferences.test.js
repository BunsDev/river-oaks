import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import Redis from 'ioredis';
import { createMemoryAvatarPreferences, createRedisAvatarPreferences, legacyDefaultAppearance } from '../avatar-preferences.js';
import { createRedisRoom } from '../redis-room.js';
import { createSharedWorld } from '../world.js';

const data={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],collisionPolygons:[],stores:[],buildings:[],
  communityLocations:[{id:'garden',name:'Garden',position:[-12,0,0]}]};

test('account appearance is canonical, private to the account, and first join does not overwrite it',async()=>{
  const preferences=createMemoryAvatarPreferences();
  assert.equal(await preferences.get('alice'),null);
  assert.deepEqual(await preferences.initialize('alice',{appearance:'woman-casual',movement:'beast'}),
    {appearance:'woman-casual',movement:'beast',version:1});
  assert.deepEqual(await preferences.initialize('alice',{appearance:'sable-human',movement:'upright'}),
    {appearance:'woman-casual',movement:'beast',version:1});
  assert.deepEqual(await preferences.save('alice',{appearance:'sable-human',movement:'beast'}),
    {appearance:'sable-human',movement:'beast',version:2});
  assert.equal(await preferences.get('bob'),null);
  assert.equal((await preferences.initialize('bob')).appearance,'sable-human');
  await assert.rejects(preferences.save('bob',{appearance:'jevica',movement:'upright'}),/cannot use/);
  for(const value of [{appearance:'unknown',movement:'upright'},{appearance:'jevica',movement:'flying'}])
    await assert.rejects(preferences.save('alice',value),/Invalid account appearance/);
});

test('trusted room sync carries beast movement across human forms and preserves each world checkpoint',()=>{
  const first=createSharedWorld(data,{worldId:'river-oaks'}),second=createSharedWorld(data,{worldId:'moon-garden'});
  first.join({userId:'alice',name:'Alice'});second.join({userId:'alice',name:'Alice'});
  first.applyAccountAppearance('alice',{appearance:'woman-casual',movement:'beast'});
  const preference=first.accountAppearance('alice');
  assert.deepEqual(preference,{appearance:'woman-casual',movement:'beast'});
  assert.equal(second.applyAccountAppearance('alice',preference).movement,'beast');
  second.applyAccountAppearance('alice',{appearance:'sable-human',movement:'beast'});
  assert.equal(second.snapshot().players[0].movement,'upright');
  assert.deepEqual(second.accountAppearance('alice'),{appearance:'sable-human',movement:'beast'});
  const restored=createSharedWorld(data,{worldId:'moon-garden'});
  assert.deepEqual(restored.restore(second.checkpoint()),{ok:true});
  assert.deepEqual(restored.accountAppearance('alice'),second.accountAppearance('alice'));
  assert.equal(first.snapshot().players[0].appearance,'woman-casual','world rooms remain independent until account sync');
  assert.throws(()=>second.applyAccountAppearance('alice',{appearance:'missing',movement:'beast'}),/Invalid account appearance/);
  assert.throws(()=>second.applyAccountAppearance('alice',{appearance:'jevica',movement:'upright'}),/Invalid account appearance/);
});

test('a legacy guest Jevica look is replaced with the permitted guest default',async()=>{
  const checkpoint=createSharedWorld(data).checkpoint();
  checkpoint.payload.appearances=[['bob','jevica']];
  const {checksum: _checksum,...envelope}=checkpoint;
  checkpoint.checksum=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  const packed=deflateSync(JSON.stringify({version:2,worldId:'river-oaks',checkpoint}));
  const preference=await legacyDefaultAppearance({getBuffer:async()=>packed},'{test}:state','bob');
  assert.deepEqual(preference,{appearance:'sable-human',movement:'upright'});
});

test('Redis account preference seeds from the signed default-world checkpoint and survives a new store instance',
  {skip:!process.env.REDIS_URL,timeout:15000},async t=>{
    const redis=new Redis(process.env.REDIS_URL),namespace=`river-oaks:avatar-test:${randomUUID()}`;
    redis.on('error',()=>{});
    const roomPrefix=`{${namespace}}`,accountPrefix=`{${namespace}:accounts}`;
    const room=createRedisRoom({redis,prefix:roomPrefix,worldData:data,authorize:async()=>true,now:()=>1000});
    t.after(async()=>{
      await room.close();
      const keys=await redis.keys(`*${namespace}*`);if(keys.length)await redis.del(...keys);
      await redis.quit();
    });
    const identity={userId:'alice',sessionId:'alice-session',name:'Alice',expiresAt:100000};
    assert.equal((await room.request({type:'join',identity,connectionId:'alice-socket'})).ok,true);
    for(const message of [{type:'appearance',appearance:'woman-casual'},{type:'movement',movement:'beast'}])
      assert.equal((await room.request({type:'command',userId:'alice',connectionId:'alice-socket',message})).ok,true);
    assert.deepEqual(await legacyDefaultAppearance(redis,`${roomPrefix}:state`,'alice'),
      {appearance:'woman-casual',movement:'beast'});
    assert.equal(await legacyDefaultAppearance(redis,`${roomPrefix}:state`,'bob'),null);
    const first=createRedisAvatarPreferences({redis,prefix:accountPrefix});
    assert.deepEqual(await first.initialize('alice',await legacyDefaultAppearance(redis,`${roomPrefix}:state`,'alice')),
      {appearance:'woman-casual',movement:'beast',version:1});
    const second=createRedisAvatarPreferences({redis,prefix:accountPrefix});
    assert.deepEqual(await second.get('alice'),{appearance:'woman-casual',movement:'beast',version:1});
    assert.deepEqual(await second.save('alice',{appearance:'sable-human',movement:'beast'}),
      {appearance:'sable-human',movement:'beast',version:2});
  });

for(const backend of ['memory','redis'])test(`${backend}: selected character revisions persist with the account without losing legacy preferences`,{skip:backend==='redis'&&!process.env.REDIS_URL},async t=>{
  const {customizedCharacterDefinition}=await import('../../preview/src/character-customization.js');
  const character=customizedCharacterDefinition('alice','sable-human',{revision:1,palette:'rose',hair:'espresso'});
  let preferences,redis,prefix;
  if(backend==='memory')preferences=createMemoryAvatarPreferences();
  else{
    redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});prefix=`{river-oaks:character-preference:${randomUUID()}}`;
    t.after(async()=>{const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
    preferences=createRedisAvatarPreferences({redis,prefix});
  }
  const selected={appearance:'sable-human',movement:'upright',character};
  const saved=await preferences.initialize('alice',selected);assert.deepEqual(saved,{...selected,version:1});
  saved.character.palette='lagoon';assert.equal((await preferences.get('alice')).character.palette,'rose');
  assert.equal((await preferences.save('alice',selected)).version,1,'same revision and definition is idempotent');
  const moved=await preferences.save('alice',{...selected,movement:'beast'});assert.equal(moved.version,2);assert.deepEqual(moved.character,character);
  const revised=await preferences.save('alice',{...selected,character:{...character,revision:2,palette:'midnight'}});
  assert.equal(revised.version,3);assert.equal(revised.character.palette,'midnight');
  assert.deepEqual(await preferences.initialize('alice',{appearance:'woman-casual',movement:'beast'}),revised,'arrival never overwrites the selected revision');
  if(redis){preferences=createRedisAvatarPreferences({redis,prefix});assert.deepEqual(await preferences.get('alice'),revised);}
  for(const malformed of [{...character,ownerId:'bob'},{...character,revision:0},{...character,flight:true},null])
    await assert.rejects(preferences.save('alice',{...selected,character:malformed}),/Invalid account character/);
  await assert.rejects(preferences.save('alice',{...selected,appearance:'woman-casual'}),/Invalid account character/);
  assert.deepEqual(await preferences.save('alice',{appearance:'sable-human',movement:'upright'}),{appearance:'sable-human',movement:'upright',version:4},'legacy selection explicitly clears custom state');
});

test('legacy default-world migration retains a validated selected revision and rejects a corrupt one',async()=>{
  const {customizedCharacterDefinition}=await import('../../preview/src/character-customization.js');
  const world=createSharedWorld(data);world.join({userId:'alice',name:'Alice'});
  const character=customizedCharacterDefinition('alice','sable-human',{revision:1,palette:'rose',hair:'espresso'});
  world.command('alice',{type:'character',revision:1},{characterDefinition:character});
  const saved=world.checkpoint();
  const read=()=>legacyDefaultAppearance({getBuffer:async()=>deflateSync(JSON.stringify({version:2,worldId:'river-oaks',checkpoint:saved}))},'{test}:state','alice');
  assert.deepEqual(await read(),{appearance:'sable-human',movement:'upright',character});
  saved.payload.characters[0][1].ownerId='bob';const {checksum:_,...envelope}=saved;saved.checksum=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  await assert.rejects(read(),/Invalid account character/);
});

test('Redis selected account revision survives room replacement; client-forged definitions cannot select it and legacy choices clear it',
  {skip:!process.env.REDIS_URL,timeout:15000},async t=>{
    const {customizedCharacterDefinition}=await import('../../preview/src/character-customization.js');
    const redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});
    const namespace=`river-oaks:character-room:${randomUUID()}`,prefix=`{${namespace}}`,rooms=[];
    const preferences=createRedisAvatarPreferences({redis,prefix});
    const character=customizedCharacterDefinition('alice','sable-human',{revision:1,palette:'rose',hair:'espresso'});
    await preferences.initialize('alice',{appearance:'sable-human',movement:'upright',character});
    const create=()=>{const room=createRedisRoom({redis,prefix,worldData:data,avatarPreferences:preferences,authorize:async()=>true});rooms.push(room);return room;};
    t.after(async()=>{await Promise.all(rooms.map(room=>room.close()));const keys=await redis.keys(`*${namespace}*`);if(keys.length)await redis.del(...keys);await redis.quit();});
    const join=(room,id,connectionId=id)=>room.request({type:'join',identity:{userId:id,name:id,sessionId:id,expiresAt:Date.now()+60000},connectionId});
    let room=create();assert.equal((await join(room,'alice')).ok,true);assert.equal((await join(room,'bob')).ok,true);
    const snapshot=(await room.read()).snapshot;
    assert.deepEqual(snapshot.players.find(p=>p.id==='alice').character,character);
    assert.equal(snapshot.players.find(p=>p.id==='bob').character,undefined);
    assert.equal((await room.request({type:'command',userId:'bob',connectionId:'bob',message:{type:'character',revision:1,characterDefinition:character}})).error,'invalid_character');
    await room.close();room=create();assert.equal((await join(room,'alice','replacement')).ok,true);
    assert.deepEqual((await room.read()).snapshot.players.find(p=>p.id==='alice').character,character);
    assert.equal((await room.request({type:'command',userId:'alice',connectionId:'replacement',message:{type:'appearance',appearance:'sable-human'}})).ok,true);
    assert.equal((await preferences.get('alice')).character,undefined);
    assert.equal((await room.request({type:'heartbeat',userId:'alice',connectionId:'replacement'})).ok,true);
    assert.equal((await room.read()).snapshot.players.find(p=>p.id==='alice').character,undefined,'sync must not resurrect a cleared selection');
  });


test('legacy default-world migration reads envelope3 and still rejects a different world',async()=>{
  const world=createSharedWorld(data);world.join({userId:'alice',name:'Alice'});
  assert.equal(world.command('alice',{type:'appearance',appearance:'woman-casual'}).ok,true);
  const room={version:3,worldId:'river-oaks',checkpoint:world.checkpoint(),pendingSelections:[],selectionVersions:[]};
  const redis={getBuffer:async()=>deflateSync(JSON.stringify(room))};
  assert.equal((await legacyDefaultAppearance(redis,'{test}:state','alice')).appearance,'woman-casual');
  room.worldId='foreign';await assert.rejects(legacyDefaultAppearance(redis,'{test}:state','alice'),/Invalid legacy/);
});
