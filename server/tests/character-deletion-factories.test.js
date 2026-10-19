import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Redis from 'ioredis';
import {createTown} from '../town.js';
import {createRedisBackend} from '../redis-backend.js';
import {createRedisCharacterStore} from '../character-store.js';
import {accountPrefixFor} from '../world-keys.js';
import {normalizeVercelRoute} from '../vercel-routing.js';
import {customizedCharacterDefinition} from '../../preview/src/character-customization.js';
const origin='http://127.0.0.1',secret='local-factory-webhook-fixture';
async function listen(app){await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${app.server.address().port}`;}
function delivery(base,path='/api/workos/events',key=secret){
 const body=JSON.stringify({id:'event_factory',event:'user.deleted',data:{object:'user',id:'user_1'}}),timestamp=Date.now();
 return fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','workos-signature':`t=${timestamp}, v1=${createHmac('sha256',key).update(timestamp+'.'+body).digest('hex')}`},body});
}
async function town(t,{local=false,configured=true}={}){
 const directory=await mkdtemp(join(tmpdir(),'character-delete-factory-'));
 const app=await createTown({origin,devAuth:local?'local':'workos',staticRoot:null,env:{
  ...(local?{RIVER_OAKS_ACCEPTANCE_FIXTURE:'1'}:{}),...(configured?{WORKOS_WEBHOOK_SECRET:secret}:{}),
  WAITLIST_FILE:join(directory,'waitlist.json'),MODERATION_FILE:join(directory,'moderation.json')}});
 t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});return {app,base:await listen(app)};
}
test('standalone factory authenticates signed deletion and removes the owner from its live world',async t=>{
 const {app,base}=await town(t),{world}=await app.worldFor('river-oaks');world.join({userId:'user_1',name:'Alice'});world.join({userId:'user_2',name:'Bob'});
 assert.equal((await delivery(base,'/api/workos/events','wrong-key')).status,401);assert.ok(world.snapshot().players.some(p=>p.id==='user_1'));
 assert.equal((await delivery(base)).status,200);assert.deepEqual(world.snapshot().players.map(p=>p.id),['user_2']);
 assert.equal((await delivery(base)).status,200);assert.equal((await delivery(base,'/api/workos/events?world=other')).status,400);
});
test('unconfigured and local-identity towns do not activate the WorkOS deletion webhook',async t=>{
 for(const options of [{configured:false},{local:true}]){
  const {app,base}=await town(t,options),{world}=await app.worldFor('river-oaks');world.join({userId:'user_1',name:'Alice'});
  assert.notEqual((await delivery(base)).status,200);assert.ok(world.snapshot().players.some(p=>p.id==='user_1'));
 }
});
test('Redis factory deletion uses the same durable account namespace as world gateways',{skip:!process.env.REDIS_URL,timeout:15000},async t=>{
 const namespace=`character-delete-factory:${randomUUID()}`,redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});
 const app=await createRedisBackend({PUBLIC_ORIGIN:origin,REDIS_URL:process.env.REDIS_URL,REDIS_NAMESPACE:namespace,WORKOS_WEBHOOK_SECRET:secret});
 t.after(async()=>{await app.close();const keys=await redis.keys(`*${namespace}*`);if(keys.length)await redis.del(...keys);await redis.quit();});
 const characters=createRedisCharacterStore({redis,prefix:accountPrefixFor(namespace)});
 for(const id of ['user_1','user_2'])await characters.saveDraft(id,customizedCharacterDefinition(id,'sable-human',{palette:'rose'}),{expectedVersion:0,requestId:'save'});
 const base=await listen(app);assert.equal((await delivery(base)).status,200);
 const erased=await characters.get('user_1');assert.equal(erased.deleted,true);assert.equal(erased.draft,null);assert.equal((await characters.get('user_2')).draft.palette,'rose');
 assert.equal((await delivery(base)).status,200);assert.deepEqual(await characters.get('user_1'),erased);
});
test('hosted routing preserves the exact signed webhook path and rejects unrelated endpoints',async()=>{
 const config=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url)));
 const rewrite=config.rewrites.find(item=>item.source==='/api/workos/events');assert.ok(rewrite);
 assert.equal(normalizeVercelRoute(rewrite.destination),'/api/workos/events');assert.equal(normalizeVercelRoute('/api/workos/events'),'/api/workos/events');
 assert.equal(normalizeVercelRoute('/api/workos/delete'),'/not-found');
});
