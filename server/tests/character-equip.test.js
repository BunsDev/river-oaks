import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Redis from 'ioredis';
import {WebSocket} from 'ws';
import {createSharedWorld} from '../world.js';
import {createGameServer} from '../app.js';
import {createWorldGateway} from '../world-gateway.js';
import {createRedisSecurity} from '../redis-security.js';
import {createMemoryCharacterStore} from '../character-store.js';
import {createMemoryAvatarPreferences} from '../avatar-preferences.js';
import {customizedCharacterDefinition} from '../../preview/src/character-customization.js';
import {approvedWaitlist} from './waitlist-fixture.js';
const data={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],collisionPolygons:[],stores:[],buildings:[],communityLocations:[]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(mode,t,{wrapStore=store=>store}={}){
 const origin='http://127.0.0.1',namespace=`character-equip:${randomUUID()}`,sockets=[],characters=createMemoryCharacterStore(),avatarPreferences=createMemoryAvatarPreferences();
 let approved=true,banned=false,redis,security,app;
 const auth={handle:async()=>false,close(){},isSessionActive:async()=>true,authenticate:async req=>{const userId=req.headers.cookie?.match(/fixture=(alice|bob)/)?.[1];return userId?{userId,name:userId,sessionId:userId,csrfToken:'fixture-csrf',expiresAt:Date.now()+120000}:null;}};
 const waitlist={...approvedWaitlist,isApproved:async()=>approved};
 if(mode==='redis'){redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});security=createRedisSecurity({redis,prefix:`{${namespace}}`});}
 const create=()=>mode==='redis'?createWorldGateway({redis,namespace,worldData:data,auth,security:{...security,isBanned:async()=>banned},waitlist,origin})
  :createGameServer({world:createSharedWorld(data),auth,waitlist,origin,characters:wrapStore(characters),avatarPreferences,moderation:{isBanned:()=>banned},staticRoot:'/nonexistent'});
 let base;const listen=async()=>{app=create();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;};await listen();
 t.after(async()=>{for(const ws of sockets)ws.terminate();await app.close();security?.close();if(redis){const keys=await redis.keys(`*${namespace}*`);if(keys.length)await redis.del(...keys);await redis.quit();}});
 const headers=user=>({Origin:origin,Cookie:`fixture=${user}`,'X-CSRF-Token':'fixture-csrf','Content-Type':'application/json'});
 const request=(user,path,body,extra={})=>fetch(base+path,{method:body===undefined?'GET':path.endsWith('/draft')?'PUT':'POST',headers:{...headers(user),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const state=async user=>{const r=await request(user,'/api/character');assert.equal(r.status,200);return r.json();};
 const open=async user=>{
  const ticket=await request(user,'/api/multiplayer/ticket',{});assert.equal(ticket.status,200);
  const ws=new WebSocket(`${base.replace('http:','ws:')}/multiplayer?ticket=${(await ticket.json()).ticket}&world=river-oaks&protocol=3`,{headers:headers(user)});sockets.push(ws);
  const frames=[];let seq=0;ws.on('message',raw=>frames.push(JSON.parse(raw)));
  const until=async predicate=>{const end=Date.now()+10000;while(Date.now()<end){const found=frames.find(predicate);if(found)return found;await pause(20);}throw new Error('Frame timeout');};
  await until(frame=>frame.type==='snapshot');
  return {ws,frames,until,command:async(message,selection)=>{const requestId=String(++seq);ws.send(JSON.stringify({...message,...(selection===undefined?{}:{selection}),requestId}));return until(frame=>frame.type==='result'&&frame.requestId===requestId);}};
 };
 return {request,state,open,characters,setApproved:v=>{approved=v;},setBanned:v=>{banned=v;},replace:async()=>{for(const ws of sockets)ws.terminate();await app.close();await listen();}};
}
for(const mode of ['memory','redis'])test(`${mode}: publish, equip, peer, reconnect and republish use authenticated authoritative transports`,{skip:mode==='redis'&&!process.env.REDIS_URL,timeout:60000},async t=>{
 const f=await fixture(mode,t),definition=customizedCharacterDefinition('alice','sable-human',{palette:'rose'});
 assert.equal((await f.request('alice','/api/character/draft',{definition,expectedVersion:0,requestId:'draft'})).status,200);
 const a=await f.open('alice'),b=await f.open('bob');
 const metadata={expectedVersion:2,requestId:'publish'};
 assert.equal((await f.request('alice','/api/character/publish',{expectedVersion:1,requestId:'publish'},{'X-CSRF-Token':'wrong'})).status,403);
 const published=await f.request('alice','/api/character/publish',{expectedVersion:1,requestId:'publish'});assert.equal(published.status,200);
 assert.equal((await published.json()).state.published.revision,1);assert.equal((await f.state('alice')).selection.character,undefined);
 assert.equal((await f.request('bob','/api/character/publish',{expectedVersion:0,requestId:'publish'})).status,409);
 assert.equal((await a.command({type:'character',revision:1})).error,'invalid_character_operation');
 assert.equal((await a.command({type:'character',revision:1,ownerId:'bob'},{expectedVersion:1,requestId:'forged'})).ok,false);
 assert.equal((await b.command({type:'character',revision:1},{expectedVersion:1,requestId:'foreign'})).error,'character_revision_missing');
 const selected=await a.command({type:'character',revision:1},{expectedVersion:1,requestId:'equip'});assert.equal(selected.ok,true);assert.equal(selected.selectionVersion,2);
 const peer=await b.until(frame=>frame.type==='snapshot'&&frame.players.some(p=>p.id==='alice'&&p.character?.palette==='rose'));
 assert.equal(peer.players.find(p=>p.id==='bob').character,undefined);assert.equal(JSON.stringify(peer).includes('draft'),false);
 assert.equal((await a.command({type:'appearance',appearance:'woman-casual'})).error,'appearance_cooldown');
 assert.equal((await a.command({type:'movement',movement:'beast'})).error,'beast_form_required');
 assert.equal((await a.command({type:'character',revision:1},{expectedVersion:1,requestId:'equip'})).appliedVersion,2);
 assert.equal((await a.command({type:'appearance',appearance:'jevica'})).ok,false);
 assert.equal((await a.command({type:'character',revision:1},{expectedVersion:1,requestId:'stale'})).error,'character_selection_conflict');
 assert.equal((await f.request('alice','/api/character/draft',{definition:{...definition,palette:'midnight'},expectedVersion:2,requestId:'edit'})).status,200);
 assert.equal((await f.request('alice','/api/character/publish',{expectedVersion:3,requestId:'republish'})).status,200);
 assert.equal((await f.state('alice')).selection.character.palette,'rose','publication must not equip');
 await f.replace();const back=await f.open('alice');
 assert.equal(back.frames.find(frame=>frame.type==='snapshot').players.find(p=>p.id==='alice').character.palette,'rose');
 await pause(2050);
 assert.equal((await back.command({type:'character',revision:2},{expectedVersion:2,requestId:'equip-new'})).ok,true);
 assert.equal((await f.state('alice')).selection.character.palette,'midnight');
 const rollback=await f.request('alice','/api/character/rollback',{revision:1,expectedVersion:4,requestId:'rollback'});assert.equal(rollback.status,200);
 assert.equal((await rollback.json()).state.published.revision,3);assert.equal((await f.state('alice')).selection.character.palette,'midnight');
 f.setApproved(false);assert.equal((await f.request('alice','/api/character/publish',metadata)).status,403);f.setApproved(true);
 f.setBanned(true);assert.equal((await f.request('alice','/api/character/publish',metadata)).status,403);
});


test('memory transport recovers a selection write finishing after shutdown without overwriting a newer account choice',{timeout:30000},async t=>{
 let hold=false,release,entered;const started=new Promise(resolve=>{entered=resolve;});
 const f=await fixture('memory',t,{wrapStore:store=>({...store,changeSelection:async(...args)=>{
  if(hold){hold=false;entered();await new Promise(resolve=>{release=resolve;});}return store.changeSelection(...args);
 }})});
 const definition=customizedCharacterDefinition('alice','sable-human',{palette:'rose'});
 await f.request('alice','/api/character/draft',{definition,expectedVersion:0,requestId:'draft'});
 await f.request('alice','/api/character/publish',{expectedVersion:1,requestId:'publish'});
 const first=await f.open('alice');hold=true;
 first.ws.send(JSON.stringify({type:'character',revision:1,selection:{expectedVersion:1,requestId:'late'},requestId:'late-wire'}));
 await started;await f.replace();const next=await f.open('alice');
 assert.equal((await next.command({type:'appearance',appearance:'woman-casual'})).ok,true);
 release();await pause(100);
 assert.equal((await f.state('alice')).selection.appearance,'woman-casual');
 assert.equal((await next.command({type:'character',revision:1},{expectedVersion:1,requestId:'late'})).error,'character_selection_conflict');
 const latest=next.frames.filter(frame=>frame.type==='snapshot').at(-1).players.find(p=>p.id==='alice');
 assert.equal(latest.appearance,'woman-casual');assert.equal(latest.character,undefined);
});

test('publication rejects forged owner fields, stale versions, invalid rollback and unauthorized origins',{timeout:10000},async t=>{
 const f=await fixture('memory',t);const body={expectedVersion:0,requestId:'publish'};
 assert.equal((await f.request('alice','/api/character/publish',body,{Origin:'https://foreign.invalid'})).status,403);
 assert.equal((await f.request('missing','/api/character/publish',body)).status,401);
 assert.equal((await f.request('alice','/api/character/publish',{...body,ownerId:'bob'})).status,400);
 assert.equal((await f.request('alice','/api/character/rollback',{...body,revision:1})).status,404);
 assert.equal((await f.request('alice','/api/character/rollback',{...body,revision:0})).status,400);
 const definition=customizedCharacterDefinition('alice','sable-human');
 await f.request('alice','/api/character/draft',{definition,expectedVersion:0,requestId:'draft'});
 assert.equal((await f.request('alice','/api/character/publish',body)).status,409);
 const operation={expectedVersion:1,requestId:'publish-current'};
 assert.equal((await f.request('alice','/api/character/publish',operation)).status,200);
 assert.equal((await f.request('alice','/api/character/publish',operation)).status,200);
 assert.equal((await f.state('alice')).character.published.revision,1);
});


test('memory: deleting an idle character account removes its peer projection without reconnect grace',{timeout:15000},async t=>{
 const f=await fixture('memory',t),definition=customizedCharacterDefinition('alice','sable-human',{palette:'rose'});
 assert.equal((await f.request('alice','/api/character/draft',{definition,expectedVersion:0,requestId:'delete-draft'})).status,200);
 assert.equal((await f.request('alice','/api/character/publish',{expectedVersion:1,requestId:'delete-publish'})).status,200);
 const a=await f.open('alice'),b=await f.open('bob');
 assert.equal((await a.command({type:'character',revision:1},{expectedVersion:1,requestId:'delete-equip'})).ok,true);
 await b.until(frame=>frame.type==='snapshot'&&frame.players.some(p=>p.id==='alice'&&p.character?.palette==='rose'));
 const disconnected=new Promise(resolve=>a.ws.once('close',(code)=>resolve(code)));
 await f.characters.deleteAccount('alice');
 await disconnected;
 b.frames.length=0;
 const after=await b.until(frame=>frame.type==='snapshot');
 assert.equal(after.players.some(p=>p.id==='alice'),false,'deleted custom projection must not survive the disconnect grace period');
 const deleted=await f.state('alice');assert.equal(deleted.character.deleted,true);assert.equal(deleted.character.draft,null);assert.equal(deleted.character.published,null);assert.equal(deleted.selection,null);
 assert.equal((await f.request('alice','/api/character/draft',{definition,expectedVersion:0,requestId:'delete-recreate'})).status,410);
 assert.equal((await f.state('bob')).character.draft,null,'other accounts remain available');
});
