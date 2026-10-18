import {createCharacterMetrics} from '../character-metrics.js';
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
 const output=[],metrics=createCharacterMetrics({enabled:true,intervalMs:0,emit:value=>output.push(value)});
 const origin='http://127.0.0.1',namespace=`character-equip:${randomUUID()}`,sockets=[],characters=createMemoryCharacterStore(),avatarPreferences=createMemoryAvatarPreferences();
 let approved=true,banned=false,redis,security,app,studioEnabled=true;
 const auth={handle:async()=>false,close(){},isSessionActive:async()=>true,authenticate:async req=>{const userId=req.headers.cookie?.match(/fixture=(alice|bob)/)?.[1];return userId?{userId,name:userId,sessionId:userId,csrfToken:'fixture-csrf',expiresAt:Date.now()+120000}:null;}};
 const waitlist={...approvedWaitlist,isApproved:async()=>approved};
 if(mode==='redis'){redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});security=createRedisSecurity({redis,prefix:`{${namespace}}`});}
 const create=()=>mode==='redis'?createWorldGateway({characterMetrics:metrics,characterStudioEnabled:studioEnabled,redis,namespace,worldData:data,auth,security:{...security,isBanned:async()=>banned},waitlist,origin})
  :createGameServer({characterMetrics:metrics,characterStudioEnabled:studioEnabled,world:createSharedWorld(data),auth,waitlist,origin,characters:wrapStore(characters),avatarPreferences,moderation:{isBanned:()=>banned},staticRoot:'/nonexistent'});
 let base;const listen=async()=>{app=create();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;};await listen();
 t.after(async()=>{metrics.close();for(const ws of sockets)ws.terminate();await app.close();security?.close();if(redis){const keys=await redis.keys(`*${namespace}*`);if(keys.length)await redis.del(...keys);await redis.quit();}});
 const headers=user=>({Origin:origin,Cookie:`fixture=${user}`,'X-CSRF-Token':'fixture-csrf','Content-Type':'application/json'});
 const request=(user,path,body,extra={})=>fetch(base+path,{method:body===undefined?'GET':path.endsWith('/draft')?'PUT':'POST',headers:{...headers(user),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const state=async user=>{const r=await request(user,'/api/character');assert.equal(r.status,200);return r.json();};
 const open=async user=>{
  const ticket=await request(user,'/api/multiplayer/ticket',{});assert.equal(ticket.status,200);
  const ws=new WebSocket(`${base.replace('http:','ws:')}/multiplayer?ticket=${(await ticket.json()).ticket}&world=river-oaks&protocol=3`,{headers:headers(user)});sockets.push(ws);
  const frames=[];let seq=0;ws.on('message',raw=>frames.push(JSON.parse(raw)));
  const until=async (predicate,timeout=10000)=>{const end=Date.now()+timeout;while(Date.now()<end){const found=frames.find(predicate);if(found)return found;await pause(20);}throw new Error('Frame timeout');};
  await until(frame=>frame.type==='snapshot');
  return {ws,frames,until,command:async(message,selection)=>{const requestId=String(++seq);ws.send(JSON.stringify({...message,...(selection===undefined?{}:{selection}),requestId}));return until(frame=>frame.type==='result'&&frame.requestId===requestId);}};
 };
 return {metrics,output,request,state,open,characters,setStudioEnabled:value=>{studioEnabled=value;},setApproved:v=>{approved=v;},setBanned:v=>{banned=v;},replace:async()=>{for(const ws of sockets)ws.terminate();await app.close();await listen();}};
}

for(const mode of ['memory','redis'])test(`${mode}: aggregate character metrics follow real HTTP and WebSocket results`,{skip:mode==='redis'&&!process.env.REDIS_URL,timeout:30000},async t=>{
 const f=await fixture(mode,t),definition=customizedCharacterDefinition('alice','sable-human',{palette:'rose'});
 assert.equal((await f.request('alice','/api/character/draft',{definition,expectedVersion:0,requestId:'draft'})).status,200);
 assert.equal((await f.request('alice','/api/character/publish',{expectedVersion:1,requestId:'publish'})).status,200);
 const a=await f.open('alice');
 assert.equal((await a.command({type:'character',revision:99},{expectedVersion:1,requestId:'missing'})).error,'character_revision_missing');
 assert.equal((await a.command({type:'character',revision:1},{expectedVersion:1,requestId:'equip'})).ok,true);
 assert.equal((await a.command({type:'character',revision:1},{expectedVersion:1,requestId:'conflict'})).error,'character_selection_conflict');
 f.setStudioEnabled(false);await f.replace();const back=await f.open('alice');
 assert.equal((await back.command({type:'character',revision:1},{expectedVersion:2,requestId:'paused'})).error,'character_studio_disabled');
 f.metrics.flush();assert.equal(f.output.length,1);const counts=f.output[0].counts;
 for(const outcome of ['success','rejected','conflict','paused'])assert.equal(counts.filter(row=>row.operation==='equip'&&row.outcome===outcome).reduce((sum,row)=>sum+row.count,0),1,outcome);
 for(const operation of ['save','publish'])assert.equal(counts.filter(row=>row.operation===operation&&row.outcome==='success').reduce((sum,row)=>sum+row.count,0),1);
 assert.doesNotMatch(JSON.stringify(f.output),/alice|rose|sable|requestId|ownerId|definition/);
});
