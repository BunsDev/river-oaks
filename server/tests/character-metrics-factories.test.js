import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Redis from 'ioredis';
import {createTown} from '../town.js';
import {createRedisBackend} from '../redis-backend.js';
for(const mode of ['memory','redis'])test(`${mode} production factory enables aggregate metrics only for 1 and flushes on close`,{skip:mode==='redis'&&!process.env.REDIS_URL,timeout:30000},async t=>{
 const messages=[];t.mock.method(console,'info',value=>{const parsed=JSON.parse(value);if(parsed.event==='character_studio_metrics')messages.push(parsed);});
 for(const flag of [undefined,'true','1']){
  messages.length=0;const directory=await mkdtemp(join(tmpdir(),'studio-metrics-')),namespace=`studio-metrics:${randomUUID()}`;
  const env={PUBLIC_ORIGIN:'http://127.0.0.1',REDIS_URL:process.env.REDIS_URL,REDIS_NAMESPACE:namespace,WAITLIST_FILE:join(directory,'waitlist.json'),MODERATION_FILE:join(directory,'moderation.json'),...(flag===undefined?{}:{RIVER_OAKS_CHARACTER_STUDIO_METRICS:flag})};
  let app;
  try{
   app=mode==='redis'?await createRedisBackend(env):await createTown({origin:env.PUBLIC_ORIGIN,devAuth:'workos',staticRoot:null,env});
   await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
   const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/character`);assert.equal(response.status,401);await response.text();
   assert.equal(messages.length,0,'no per-request payload logging');
   await app.close();app=null;
   if(flag==='1'){
    assert.equal(messages.length,1);assert.deepEqual(messages[0].counts.map(({operation,outcome,count})=>({operation,outcome,count})),[{operation:'read',outcome:'rejected',count:1}]);
    assert.doesNotMatch(JSON.stringify(messages),/userId|requestId|definition|cookie|namespace/);
   }else assert.deepEqual(messages,[]);
  }finally{
   await app?.close();await rm(directory,{recursive:true,force:true});
   if(mode==='redis'){const redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});try{const keys=await redis.keys(`*${namespace}*`);if(keys.length)await redis.del(...keys);}finally{await redis.quit();}}
  }
 }
});
