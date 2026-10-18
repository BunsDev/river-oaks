import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { createMemoryCharacterStore } from '../character-store.js';
import { customizedCharacterDefinition } from '../../preview/src/character-customization.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const data=JSON.parse(readFileSync(new URL('../../preview/public/data/district.json',import.meta.url)));
for(const mode of ['memory','redis'])test(`${mode}: private character drafts cross real HTTP gates and survive gateway replacement`,{skip:mode==='redis'&&!process.env.REDIS_URL,timeout:30000},async t=>{
  const origin='http://127.0.0.1',banned=new Set();let approved=true;
  const auth={handle:async()=>false,close(){},isSessionActive:async()=>true,authenticate:async req=>{
    const id=req.headers.cookie?.match(/fixture=(alice|bob)/)?.[1];
    return id?{userId:id,name:id,sessionId:id,csrfToken:'test-csrf',expiresAt:Date.now()+60000}:null;
  }};
  const waitlist={...approvedWaitlist,isApproved:async()=>approved};
  const namespace=`river-oaks:character-http:${randomUUID()}`,characters=createMemoryCharacterStore();
  let redis,security;
  if(mode==='redis'){
    redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});
    security=createRedisSecurity({redis,prefix:`{${namespace}}`});
  }
  const createApp=()=>mode==='redis'
    ?createWorldGateway({redis,namespace,worldData:data,auth,security:{...security,isBanned:async id=>banned.has(id)},waitlist,origin})
    :createGameServer({world:createSharedWorld(data),auth,waitlist,origin,characters,moderation:{isBanned:id=>banned.has(id)},staticRoot:'/nonexistent'});
  let app=createApp();const sockets=[];
  t.after(async()=>{for(const ws of sockets)ws.terminate();await app.close();security?.close();if(redis){const keys=await redis.keys(`*${namespace}*`);if(keys.length)await redis.del(...keys);await redis.quit();}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));let base=`http://127.0.0.1:${app.server.address().port}`;
  const headers=id=>({Origin:origin,Cookie:`fixture=${id}`,'X-CSRF-Token':'test-csrf','Content-Type':'application/json'});
  const get=(id,path='/api/character')=>fetch(base+path,{headers:headers(id)});
  const put=(id,value,extra={})=>fetch(base+'/api/character/draft',{method:'PUT',headers:{...headers(id),...extra},body:JSON.stringify(value)});
  const definition=customizedCharacterDefinition('alice','sable-human',{palette:'rose',hair:'espresso'});
  const first={definition,expectedVersion:0,requestId:'first-edit'};
  assert.equal((await get('missing')).status,401);
  assert.equal((await put('missing',first)).status,401);
  assert.equal((await put('alice',first,{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await put('alice',first,{Origin:'https://other.invalid'})).status,403);
  approved=false;assert.equal((await get('alice')).status,403);assert.equal((await put('alice',first)).status,403);approved=true;
  banned.add('alice');assert.equal((await get('alice')).status,403);assert.equal((await put('alice',first)).status,403);banned.clear();
  assert.equal((await get('alice','/api/character?ownerId=bob')).status,400);
  assert.equal((await put('bob',first)).status,400,'another owner cannot save the definition');
  assert.equal((await put('alice',{...first,userId:'bob'})).status,400);
  assert.equal((await put('alice',{...first,definition:{...definition,flight:true}})).status,400);
  const initial=await get('alice');assert.equal(initial.status,200);assert.match(initial.headers.get('cache-control'),/no-store/);
  assert.equal(initial.headers.get('vary'),'Cookie');
  assert.equal((await initial.json()).character.version,0);
  const saved=await put('alice',first);assert.equal(saved.status,200);assert.equal((await saved.json()).state.draft.palette,'rose');
  assert.equal((await (await get('bob')).json()).character.draft,null);
  const edits=await Promise.all([
    put('alice',{definition:{...definition,palette:'midnight'},expectedVersion:1,requestId:'editor-a'}),
    put('alice',{definition:{...definition,palette:'lagoon'},expectedVersion:1,requestId:'editor-b'}),
  ]);
  assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
  const retry=await put('alice',first);assert.equal(retry.status,200);const replay=await retry.json();assert.equal(replay.appliedVersion,1);assert.equal(replay.state.version,2);
  const tooLarge=await put('alice',{...first,extra:'x'.repeat(20000)});assert.equal(tooLarge.status,413);
  const malformed=await fetch(base+'/api/character/draft',{method:'PUT',headers:headers('alice'),body:'{'});assert.equal(malformed.status,400);
  assert.equal((await put('alice',first,{'Content-Type':'text/plain'})).status,415);
  const unsupported=await fetch(base+'/api/character',{method:'DELETE',headers:headers('alice')});assert.equal(unsupported.status,405);

  // Private drafts must not become peer-visible appearance or protocol data.
  const ticket=await fetch(base+'/api/multiplayer/ticket',{method:'POST',headers:headers('alice')});assert.equal(ticket.status,200);
  const token=(await ticket.json()).ticket,ws=new WebSocket(`${base.replace('http:','ws:')}/multiplayer?ticket=${token}&world=river-oaks&protocol=3`,{headers:headers('alice')});sockets.push(ws);
  const snapshot=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Snapshot timeout')),5000);ws.once('error',reject);ws.on('message',raw=>{const message=JSON.parse(raw);if(message.type==='snapshot'){clearTimeout(timeout);resolve(message);}});});
  assert.equal(JSON.stringify(snapshot).includes('river-oaks-looks-v2'),false);
  assert.equal(snapshot.players.find(p=>p.id==='alice').appearance,'sable-human');
  ws.terminate();await app.close();app=createApp();
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;
  const resumed=await get('alice');assert.equal(resumed.status,200);const state=(await resumed.json()).character;
  assert.equal(state.version,2);assert.ok(['midnight','lagoon'].includes(state.draft.palette));assert.equal(state.published,null);
  const replacedRetry=await put('alice',first);assert.equal(replacedRetry.status,200);assert.equal((await replacedRetry.json()).appliedVersion,1);
  const bob={definition:customizedCharacterDefinition('bob','sable-human'),expectedVersion:0,requestId:'bob-edit'};
  const statuses=[];for(let i=0;i<32;i++)statuses.push((await put('bob',bob)).status);
  assert.ok(statuses.includes(429),'per-owner write limits apply to retries too');
  assert.ok(statuses.every(status=>[200,429].includes(status)));
});

test('character HTTP storage failures return generic errors without backend details',async t=>{
  const origin='http://127.0.0.1',auth={handle:async()=>false,authenticate:async()=>({userId:'alice',csrfToken:'test-csrf'})};
  const unavailable=async()=>{throw new Error('synthetic-private-backend-detail');};
  const app=createGameServer({world:createSharedWorld(data),auth,origin,waitlist:approvedWaitlist,
    characters:{get:unavailable,saveDraft:unavailable},staticRoot:'/nonexistent'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const headers={Origin:origin,'X-CSRF-Token':'test-csrf','Content-Type':'application/json'};
  for(const response of [await fetch(base+'/api/character'),await fetch(base+'/api/character/draft',{method:'PUT',headers,
    body:JSON.stringify({definition:customizedCharacterDefinition('alice','sable-human'),expectedVersion:0,requestId:'edit'})})]){
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'character_unavailable'});
  }
});
