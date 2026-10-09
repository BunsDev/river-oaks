// Actual prior/current coordinator acceptance against an owned random Redis namespace.
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JEVICA_ADMIN_USER_IDS} from './admin.js';
import {inflateSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
import {createRedisRoom} from './redis-room.js';
const previousRoot=process.argv[2],output=process.argv[3]??'data/reports/creator-objects-rollout.json';
if(!previousRoot||!process.env.REDIS_URL)throw new Error('Provide a previous source directory and a loopback REDIS_URL.');
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.REDIS_URL).hostname))throw new Error('Rollout acceptance only uses loopback Redis.');
const {createRedisRoom:previousRoom}=await import(pathToFileURL(resolve(previousRoot,'server/redis-room.js')).href);
const owner=JEVICA_ADMIN_USER_IDS[0];
const redis=new Redis(process.env.REDIS_URL),prefix=`{river-oaks:creator-rollout:${randomUUID()}}`;
const data={scene:'district',bounds_m:[-40,-40,40,40],walkSpawn:[-12,0,0],stores:[],buildings:[],collisionPolygons:[],roads:[],communityLocations:[{id:'a',name:'Garden',position:[-12,0,0]}]};
const options={redis,prefix,worldData:data,authorize:async()=>true,now:()=>100000};
const old=previousRoom(options),next=createRedisRoom(options);let obsolete;
const pause=()=>new Promise(resolve=>setTimeout(resolve,210));
try{
  assert.equal((await old.request({type:'join',identity:{userId:owner,name:'Owner',sessionId:'s',expiresAt:200000},connectionId:'c'})).ok,true);
  const oldLease=await redis.get(prefix+':lease');assert.match(oldLease,/^v3:/);
  await next.tick();const nextLease=await redis.get(prefix+':lease');assert.match(nextLease,/^v5:/);
  const assembly={name:'Rolling creator',parts:[{shape:'box',size:[1,1,1],position:[0,.5,0],rotation:[0,0,0],color:'#b97986',material:'matte'}]};
  assert.equal((await next.request({type:'command',userId:owner,connectionId:'c',message:{type:'build',action:'place',kind:'object',finish:'rose',assembly,position:[-12,2.4],yaw:0}})).ok,true);
  await pause();await old.tick();assert.equal(await redis.get(prefix+':lease'),nextLease,'old writer does not replace v5');
  await old.close();assert.equal(await redis.get(prefix+':lease'),nextLease,'old close does not release v5');
  const before=await redis.getBuffer(prefix+':state');
  assert.equal(JSON.parse(inflateSync(before).toString()).checkpoint.version,5);
  await redis.del(prefix+':lease');obsolete=previousRoom(options);
  await assert.rejects(obsolete.tick(),/Invalid durable town checkpoint/);
  assert.deepEqual(await redis.getBuffer(prefix+':state'),before,'obsolete recovery does not write a partial state');
  await pause();await next.tick();assert.match(await redis.get(prefix+':lease'),/^v5:/);
  assert.deepEqual((await next.read()).snapshot.builds[0].assembly,assembly);
  const proof={createdAt:new Date().toISOString(),status:'passed',previousSourceCommit:process.env.CREATOR_PREVIOUS_COMMIT??null,sha256:{previousRoom:createHash('sha256').update(await readFile(resolve(previousRoot,'server/redis-room.js'))).digest('hex'),previousWorld:createHash('sha256').update(await readFile(resolve(previousRoot,'server/world.js'))).digest('hex'),currentRoom:createHash('sha256').update(await readFile(new URL('./redis-room.js',import.meta.url))).digest('hex'),currentWorld:createHash('sha256').update(await readFile(new URL('./world.js',import.meta.url))).digest('hex')},scope:'Actual previous v3 coordinator and current v5 coordinator against owned loopback Redis.',checks:['v3 checkpoint/presence recovered by v5','v5 lease replaces v3 without TTL wait','v3 writer and close cannot disturb live v5 lease','v3 recovery rejects v5 checkpoint without mutation','v5 retakes obsolete lease and preserves assembly'],hostedAcceptance:false};
  await writeFile(output,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{
  await old.close();await next.close();await obsolete?.close();
  const keys=await redis.keys(prefix+':*');if(keys.length)await redis.del(...keys);await redis.quit();
}
