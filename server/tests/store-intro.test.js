import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryProfiles, createRedisProfiles } from '../profiles.js';
import { profileAction } from '../profile-api.js';
for(const backend of ['memory','redis'])test(`${backend}: private intro claims are atomic, account/world scoped and survive storage recreation`,{skip:backend==='redis'&&!process.env.REDIS_URL},async t=>{
 const redis=backend==='redis'?new Redis(process.env.REDIS_URL):null,prefix=`{intro-test-${randomUUID()}}`;
 if(redis)t.after(async()=>{const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
 const make=()=>redis?createRedisProfiles({redis,prefix}):createMemoryProfiles();const profiles=make();
 const results=await Promise.all(Array.from({length:8},()=>profiles.claimStoreIntro('alice','river-oaks','harry')));
 assert.equal(results.filter(r=>r.firstVisit).length,1);
 assert.equal((await profiles.claimStoreIntro('bob','river-oaks','harry')).firstVisit,true);
 assert.equal((await profiles.claimStoreIntro('alice','other','harry')).firstVisit,true);
 assert.deepEqual(Object.keys(await profiles.get('alice')).sort(),['bio','interests','pronouns','tagline','updatedAt','version']);
 if(redis)assert.equal((await make().claimStoreIntro('alice','river-oaks','harry')).firstVisit,false);
 await assert.rejects(()=>profiles.claimStoreIntro('alice','river-oaks',''));
 for(let i=0;i<512;i++)await profiles.claimStoreIntro('bounded','river-oaks',String(i));
 assert.equal((await profiles.claimStoreIntro('bounded','river-oaks','overflow')).firstVisit,false);
});
test('intro API uses authenticated account and server world, rejects extra fields and rate limits',async()=>{
 const profiles=createMemoryProfiles();let allowed=true;
 const call=data=>profileAction({action:'claim-intro',identity:{userId:'alice'},worldId:'river-oaks',profiles,readBody:async()=>data,allowWrite:async()=>allowed});
 assert.equal((await call({storeId:'harry',userId:'bob'})).status,400);
 assert.equal((await call({storeId:'harry'})).value.firstVisit,true);
 assert.equal((await call({storeId:'harry'})).value.firstVisit,false);
 allowed=false;assert.equal((await call({storeId:'hermes'})).status,429);
});
