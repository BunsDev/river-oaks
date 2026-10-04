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
