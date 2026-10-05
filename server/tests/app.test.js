import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../app.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { createMemoryLandmarks } from '../landmarks.js';
import { createMemorySocial } from '../social.js';
import { createMemoryGroups } from '../groups.js';
import { SIGN_INS_PER_ADDRESS } from '../rate-limit.js';
const auth = {
  async handle(){return false;},
  async authenticate(req){const id=req.headers.cookie?.match(/session=(\w+)/)?.[1];return id?{userId:id,name:id,sessionId:id,csrfToken:'test-csrf',expiresAt:Date.now()+60000}:null;},
};
async function fixture(t,options={},staticRoot='/nonexistent'){
  const waitlist=options?.isApproved?options:options.waitlist??approvedWaitlist;
  const {landmarks=createMemoryLandmarks(),social=createMemorySocial(),groups=createMemoryGroups(),worldId='river-oaks'}=options?.isApproved?{}:options;
  const players=new Map();let commands=0;
  const world={players,join(i){players.set(i.userId,{id:i.userId,name:i.name,position:[5,7,0],yaw:.3});return {ok:true};},leave(id){players.delete(id);},command(){commands++;return {ok:true};},step(){},snapshot(){return {type:'snapshot',players:[...players.values()],locals:[],wishes:{}};}};
  world.worldId=worldId;
  const app=createGameServer({auth,world,landmarks,social,groups,waitlist,origin:'http://127.0.0.1',staticRoot});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  t.after(()=>app.close());
  return {app,world,landmarks,origin,commands:()=>commands};
}
test('standalone server protects every game chunk and world data after approval',async t=>{
  const root=await mkdtemp(join(tmpdir(),'river-oaks-assets-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'assets'));await mkdir(join(root,'data'));
  for(const file of ['index.html','assets/index-entry.js','assets/preload-helper-entry.js','assets/main-game.js','assets/walking-game.js','assets/three-game.js','data/district.json'])
    await writeFile(join(root,file),'fixture');
  const waitlist={...approvedWaitlist,isApproved:async id=>id==='owner'};
  const {origin}=await fixture(t,waitlist,root);
  const get=(path,id)=>fetch(origin+path,{headers:id?{Cookie:`session=${id}`}:{}});
  for(const path of ['/','/assets/index-entry.js','/assets/preload-helper-entry.js'])assert.equal((await get(path)).status,200,path);
  for(const path of ['/assets/main-game.js','/assets/walking-game.js','/assets/three-game.js','/data/district.json']){
    assert.equal((await get(path)).status,403,path);
    assert.equal((await get(path,'guest')).status,403,path);
    const response=await get(path,'owner');
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(response.headers.get('vary'),'Cookie');
  }
});
const ticket = async (origin,id,headers={}) => fetch(origin+'/api/multiplayer/ticket',{method:'POST',headers:{Origin:'http://127.0.0.1',Cookie:`session=${id}`,'X-CSRF-Token':'test-csrf',...headers}});
const connect=(origin,token,id,wsOrigin='http://127.0.0.1')=>new Promise((resolve,reject)=>{
 const ws=new WebSocket(origin.replace('http','ws')+'/multiplayer?ticket='+token,{headers:{Origin:wsOrigin,Cookie:`session=${id}`}});
 ws.once('message',data=>resolve({ws,snapshot:JSON.parse(data)}));ws.once('error',reject);
});
test('one address can start only a few sign-ins at a time',async t=>{
  const {origin}=await fixture(t);
  for(let i=0;i<SIGN_INS_PER_ADDRESS;i++)assert.notEqual((await fetch(origin+'/auth/login')).status,429);
  assert.equal((await fetch(origin+'/auth/login')).status,429);
  assert.notEqual((await fetch(origin+'/auth/session')).status,429,'other routes keep their own limit');
});
test('anonymous requests and cross-origin or forged-CSRF ticket requests are denied',async t=>{
 const {origin}=await fixture(t);
 assert.equal((await fetch(origin+'/api/multiplayer/ticket',{method:'POST',headers:{Origin:'http://127.0.0.1'}})).status,401);
 assert.equal((await ticket(origin,'one',{Origin:'https://evil.example'})).status,403);
 assert.equal((await ticket(origin,'one',{'X-CSRF-Token':'wrong'})).status,403);
});
test('tickets name their world and protocol, and the socket rejects a different world or version',async t=>{
 const {origin}=await fixture(t,{worldId:'garden-2'});
 const request=path=>fetch(origin+path,{method:'POST',headers:{Origin:'http://127.0.0.1',Cookie:'session=one','X-CSRF-Token':'test-csrf'}});
 assert.equal((await request('/api/multiplayer/ticket')).status,404);
 assert.equal((await request('/api/multiplayer/ticket?world=river-oaks')).status,404);
 const response=await request('/api/multiplayer/ticket?world=garden-2');
 assert.equal(response.status,200);
 const {ticket,worldId,protocolVersion}=await response.json();
 assert.equal(worldId,'garden-2');assert.equal(protocolVersion,1);
 assert.equal((await request('/api/landmarks/list?world=river-oaks')).status,404);
 assert.equal((await request('/api/landmarks/list?world=garden-2')).status,200);
 await assert.rejects(connect(origin,`${ticket}&world=river-oaks&protocol=1`,'one'),/403/);
 await assert.rejects(connect(origin,`${ticket}&world=garden-2&protocol=2`,'one'),/426/);
 const {ws}=await connect(origin,`${ticket}&world=garden-2&protocol=1`,'one');t.after(()=>ws.terminate());
});
test('two authenticated accounts receive the shared roster, and tickets are single-use',async t=>{
 const {origin,world}=await fixture(t);
 const token1=(await (await ticket(origin,'one')).json()).ticket;
 const a=await connect(origin,token1,'one');t.after(()=>a.ws.terminate());
 const token2=(await (await ticket(origin,'two')).json()).ticket;
 const b=await connect(origin,token2,'two');t.after(()=>b.ws.terminate());
 assert.equal(b.snapshot.players.length,2);assert.equal(world.players.size,2);
 await assert.rejects(connect(origin,token1,'one'));
});
test('concurrent upgrades cannot reuse a ticket while approval is pending',async t=>{
 let hold=false,checking=0,release;
 const approval=new Promise(resolve=>{release=resolve;});
 const waitlist={...approvedWaitlist,async isApproved(){
   if(!hold)return true;
   if(++checking===2)release();
   await approval;
   return true;
 }};
 const {origin}=await fixture(t,waitlist);
 const token=(await (await ticket(origin,'one')).json()).ticket;
 hold=true;
 const results=await Promise.allSettled([connect(origin,token,'one'),connect(origin,token,'one')]);
 assert.equal(checking,2);
 const admitted=results.filter(result=>result.status==='fulfilled');
 assert.equal(admitted.length,1,'only one upgrade may consume the ticket');
 t.after(()=>admitted[0].value.ws.terminate());
});
test('pending waitlist approval blocks tickets and revocation closes an active player',async t=>{
 const approved=new Set();
 const waitlist={...approvedWaitlist,async isApproved(userId){return approved.has(userId);}};
 const {origin,app}=await fixture(t,waitlist);
 assert.equal((await ticket(origin,'one')).status,403);
 const pendingSocial=await fetch(origin+'/api/social/list',{method:'POST',headers:{Origin:'http://127.0.0.1',Cookie:'session=one','X-CSRF-Token':'test-csrf','Content-Type':'application/json'},body:'{}'});
 assert.equal(pendingSocial.status,403,'new world APIs also require approval');
 approved.add('one');
 const token=(await (await ticket(origin,'one')).json()).ticket;
 const {ws}=await connect(origin,token,'one');t.after(()=>ws.terminate());
 approved.delete('one');
 ws.send(JSON.stringify({type:'pose',position:[0,0,0]}));
 const code=await new Promise(resolve=>ws.once('close',resolve));
 assert.equal(code,4001);
 assert.equal((await ticket(origin,'one')).status,403);
});
test('oversized and flooding frames cannot generate unbounded world commands',async t=>{
 const {origin,commands}=await fixture(t);
 const token=(await (await ticket(origin,'one')).json()).ticket;
 const {ws}=await connect(origin,token,'one');t.after(()=>ws.terminate());
 for(let i=0;i<200;i++)ws.send(JSON.stringify({type:'pose',position:[0,0,0]}));
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.ok(commands()<=40);
});
test('landmark API saves the authenticated player pose privately and checks origin and CSRF',async t=>{
  const {origin}=await fixture(t);
  const request=(user,action,data={},headers={})=>fetch(origin+`/api/landmarks/${action}`,{method:'POST',headers:{Origin:'http://127.0.0.1',Cookie:`session=${user}`,'X-CSRF-Token':'test-csrf','Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  assert.equal((await request('alice','list',{}, {Origin:'https://evil.example'})).status,403);
  assert.equal((await request('alice','list',{}, {'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await request('','list')).status,401);
  assert.deepEqual((await (await request('alice','list')).json()).landmarks,[]);
  assert.equal((await request('alice','add',{name:'Before joining'})).status,409);
  const token=(await (await ticket(origin,'alice')).json()).ticket;
  const {ws}=await connect(origin,token,'alice');t.after(()=>ws.terminate());
  const saved=await (await request('alice','add',{name:'  Garden   gate ',position:[99,99],yaw:2})).json();
  assert.equal(saved.ok,true);
  assert.equal(saved.landmark.name,'Garden gate');
  assert.deepEqual(saved.landmark.position,[5,7]);
  assert.equal(saved.landmark.yaw,.3);
  assert.deepEqual((await (await request('bob','list')).json()).landmarks,[]);
  assert.equal((await (await request('bob','remove',{id:saved.landmark.id})).json()).removed,false);
  assert.deepEqual((await (await request('alice','list')).json()).landmarks,[saved.landmark]);
  assert.equal((await (await request('alice','remove',{id:saved.landmark.id})).json()).removed,true);
});
test('contacts require a meeting and acceptance before private messages',async t=>{
  const {origin}=await fixture(t);
  const post=(user,action,data={},headers={})=>fetch(origin+`/api/social/${action}`,{method:'POST',headers:{Origin:'http://127.0.0.1',Cookie:`session=${user}`,'X-CSRF-Token':'test-csrf','Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  assert.equal((await post('','list')).status,401);
  assert.equal((await post('one','list',{}, {Origin:'https://evil.example'})).status,403);
  assert.equal((await post('one','list',{}, {'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await post('one','request',{peerId:'two'})).status,409);
  const one=await connect(origin,(await (await ticket(origin,'one')).json()).ticket,'one');t.after(()=>one.ws.terminate());
  assert.equal((await post('one','request',{peerId:'two'})).status,409);
  const two=await connect(origin,(await (await ticket(origin,'two')).json()).ticket,'two');t.after(()=>two.ws.terminate());
  assert.equal((await post('one','request',{peerId:'two'})).status,200);
  assert.equal((await post('one','send',{peerId:'two',text:'Too early'})).status,409);
  assert.equal((await post('one','accept',{peerId:'two'})).status,409);
  const invitation=await (await post('two','list')).json();
  assert.equal(invitation.contacts[0].direction,'incoming');
  assert.equal((await post('two','accept',{peerId:'one'})).status,200);
  assert.equal((await post('one','send',{peerId:'two',text:'Hello privately'})).status,200);
  assert.equal((await post('three','messages',{peerId:'one'})).status,404);
  const history=await (await post('two','messages',{peerId:'one'})).json();
  assert.equal(history.messages[0].text,'Hello privately');
  assert.equal((await post('two','remove',{peerId:'one'})).status,200);
  assert.equal((await post('one','messages',{peerId:'two'})).status,404);
});
test('authenticated group routes persist across members and reject outsiders',async t=>{
  const {origin}=await fixture(t);
  const post=(user,scope,action,data={})=>fetch(origin+`/api/${scope}/${action}`,{method:'POST',headers:{Origin:'http://127.0.0.1',Cookie:`session=${user}`,'X-CSRF-Token':'test-csrf','Content-Type':'application/json'},body:JSON.stringify(data)});
  const created=await post('one','groups','create',{name:'Neighborhood Circle'});
  assert.equal(created.status,200);const {id:groupId}=(await created.json()).group;
  assert.equal((await post('one','groups','invite',{groupId,peerId:'two'})).status,409);
  const one=await connect(origin,(await (await ticket(origin,'one')).json()).ticket,'one');t.after(()=>one.ws.terminate());
  const two=await connect(origin,(await (await ticket(origin,'two')).json()).ticket,'two');t.after(()=>two.ws.terminate());
  assert.equal((await post('one','social','request',{peerId:'two'})).status,200);
  assert.equal((await post('two','social','accept',{peerId:'one'})).status,200);
  assert.equal((await post('one','groups','invite',{groupId,peerId:'two'})).status,200);
  assert.equal((await post('two','groups','read',{groupId})).status,404);
  assert.equal((await post('two','groups','accept',{groupId})).status,200);
  assert.equal((await post('two','groups','send',{groupId,text:'Hello across the world'})).status,200);
  assert.equal((await post('three','groups','read',{groupId})).status,404);
  assert.equal((await post('','groups','list')).status,401);
  assert.equal((await post('one','groups','list')).status,200);
  assert.equal((await post('one','groups','read',{groupId})).status,200);
});
test('residents behind one address can poll contacts and groups without hitting the access limit',async t=>{
  const {origin}=await fixture(t);
  for(let cycle=0;cycle<6;cycle++)for(let account=0;account<16;account++)for(const scope of ['social','groups']) {
    const response=await fetch(`${origin}/api/${scope}/list`,{method:'POST',headers:{Origin:'http://127.0.0.1',
      Cookie:`session=resident${account}`,'X-CSRF-Token':'test-csrf','Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,200,`${scope} poll for resident ${account} in cycle ${cycle}`);
  }
});
