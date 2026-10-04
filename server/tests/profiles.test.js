import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryProfiles, createRedisProfiles } from '../profiles.js';

const fields={tagline:'Moonlit walker',bio:'I collect stories in the gardens.',pronouns:'she/her',interests:['Art','Gardens']};

test('profiles are bounded, versioned, and account owned',async()=>{
  const profiles=createMemoryProfiles({now:()=>42});
  assert.equal((await profiles.get('alice')).version,0);
  const first=await profiles.save('alice',{...fields,bio:'I collect stories\nin the gardens.',expectedVersion:0});
  assert.deepEqual(first,{ok:true,profile:{...fields,bio:'I collect stories\nin the gardens.',version:1,updatedAt:42}});
  assert.equal((await profiles.save('alice',{...fields,bio:'Old tab',expectedVersion:0})).reason,'profile_conflict');
  assert.equal((await profiles.get('alice')).bio,'I collect stories\nin the gardens.');
  assert.equal((await profiles.get('bob')).version,0);
  assert.equal((await profiles.save('bob',{...fields,interests:['Art','art'],expectedVersion:0})).reason,'invalid_profile');
  assert.equal((await profiles.save('bob',{...fields,bio:'x'.repeat(601),expectedVersion:0})).reason,'invalid_profile');
  assert.equal((await profiles.save('bob',{...fields,peerId:'alice',expectedVersion:0})).reason,'invalid_profile');
});

test('Redis profiles survive a new store instance and reject stale writes', {skip:!process.env.REDIS_URL},async t=>{
  const redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});
  const prefix=`{river-oaks:profiles-test:${randomUUID()}}`;
  t.after(async()=>{const keys=await redis.keys(`${prefix}:profiles:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
  const first=createRedisProfiles({redis,prefix,now:()=>50});
  const second=createRedisProfiles({redis,prefix,now:()=>60});
  const writes=await Promise.all([first.save('alice',{...fields,expectedVersion:0}),second.save('alice',{...fields,tagline:'Other tab',expectedVersion:0})]);
  assert.equal(writes.filter(item=>item.ok).length,1);
  assert.equal((await second.get('alice')).version,1);
  assert.equal((await second.save('alice',{...fields,expectedVersion:0})).reason,'profile_conflict');
  assert.equal((await first.save('alice',{...fields,expectedVersion:1})).ok,true);
  assert.equal((await second.get('alice')).version,2);
});
