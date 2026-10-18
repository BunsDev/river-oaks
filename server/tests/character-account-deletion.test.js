import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import Redis from 'ioredis';
import {WebSocket} from 'ws';
import {createAuth} from '../auth.js';
import {createRedisAuth} from '../redis-auth.js';
import {createAuthAdapter} from './redis-auth-fixture.js';
import {createGitHubFixture} from './github-fixture.js';
import {approvedWaitlist} from './waitlist-fixture.js';
import {createMemoryCharacterStore,createRedisCharacterStore} from '../character-store.js';
import {accountPrefixFor} from '../world-keys.js';
import {createGameServer} from '../app.js';
import {createSharedWorld} from '../world.js';
import {createWorldRouter} from '../world-router.js';
import {createWorldGateway} from '../world-gateway.js';
import {createRedisSecurity} from '../redis-security.js';
import {customizedCharacterDefinition} from '../../preview/src/character-customization.js';
import {createWorkOSDeletionHandler} from '../workos-deletion.js';
const data={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],collisionPolygons:[],stores:[],buildings:[],communityLocations:[]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cookie=(response,name='river_oaks_session')=>response.headers.getSetCookie().find(value=>value.startsWith(name+'='))?.split(';')[0];
for(const mode of ['memory','redis'])test(`${mode}: signed account deletion revokes all sessions, erases only the owner and retries peer cleanup`,{skip:mode==='redis'&&!process.env.REDIS_URL,timeout:30000},async t=>{
 const origin='http://127.0.0.1',namespace=`character-delete:${randomUUID()}`,secret='local-webhook-fixture',sockets=[];
 let redis,security,app,game,cleanupAttempts=0,failCleanup=true;
 if(mode==='redis'){redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});security=createRedisSecurity({redis,prefix:`{${namespace}}`});}
 const characters=mode==='redis'?createRedisCharacterStore({redis,prefix:accountPrefixFor(namespace)}):createMemoryCharacterStore();
 const workos=createAuthAdapter(),github=createGitHubFixture({1001:'alice',1002:'bob'});
 const options={origin,apiKey:'sk_test',clientId:'client_test',cookiePassword:'a'.repeat(32),workos,githubFetch:github.fetcher,
  accountActive:async id=>!(await characters.get(id)).deleted,
  onLogout:async id=>{cleanupAttempts++;if(failCleanup&&mode==='memory'){failCleanup=false;throw new Error('fixture cleanup unavailable');}if(mode==='redis')await app.disconnectUser(id);else game.disconnectUser(id);}};
 const auth=mode==='redis'?createRedisAuth({...options,redis,prefix:`{${namespace}}`}):createAuth(options);
 const handleRequest=createWorkOSDeletionHandler({secret,onDelete:async id=>{await characters.deleteAccount(id);await auth.revokeUser(id);}});
 if(mode==='redis')app=createWorldGateway({redis,namespace,worldData:data,auth,security,waitlist:approvedWaitlist,origin,handleRequest});
 else{
  game=createGameServer({world:createSharedWorld(data),auth:{handle:(...args)=>auth.handle(...args),authenticate:(...args)=>auth.authenticate(...args),...(auth.isSessionActive?{isSessionActive:(...args)=>auth.isSessionActive(...args)}:{}),close(){}},waitlist:approvedWaitlist,origin,characters,staticRoot:null});
  const router=createWorldRouter({worldFor:async()=>({game}),handleRequest});app={server:router.server,close:async()=>{await game.close();await router.close();}};
 }
 t.after(async()=>{for(const ws of sockets)ws.terminate();await app.close();auth.close();security?.close();if(redis){const keys=await redis.keys(`*${namespace}*`);if(keys.length)await redis.del(...keys);await redis.quit();}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
 const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
 async function login(id,expected=302){
  workos.setUserId(id);const start=await request('/auth/login'),state=new URL(start.headers.get('location')).searchParams.get('state');
  const result=await request(`/auth/callback?code=code&state=${state}`,{headers:{cookie:cookie(start,'river_oaks_auth_state')}});assert.equal(result.status,expected);
  if(expected!==302)return;const sessionCookie=cookie(result);assert.ok(sessionCookie);
  const session=await (await request('/auth/session',{headers:{cookie:sessionCookie}})).json();assert.equal(session.authenticated,true);
  return {cookie:sessionCookie,headers:{Cookie:sessionCookie,Origin:origin,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'}};
 }
 const owner=await login('user_1'),otherSession=await login('user_1'),peer=await login('user_2');
 const action=(resident,path,body)=>request(path,{method:path.endsWith('/draft')?'PUT':'POST',headers:resident.headers,body:JSON.stringify(body)});
 for(const [resident,id] of [[owner,'user_1'],[peer,'user_2']])assert.equal((await action(resident,'/api/character/draft',{definition:customizedCharacterDefinition(id,'sable-human',{palette:'rose'}),expectedVersion:0,requestId:'save'})).status,200);
 assert.equal((await action(owner,'/api/character/publish',{expectedVersion:1,requestId:'publish'})).status,200);
 async function open(resident){
  const response=await action(resident,'/api/multiplayer/ticket',{});assert.equal(response.status,200);
  const ws=new WebSocket(`${base.replace('http:','ws:')}/multiplayer?ticket=${(await response.json()).ticket}&world=river-oaks&protocol=3`,{headers:resident.headers});sockets.push(ws);const frames=[];
  ws.on('message',raw=>frames.push(JSON.parse(raw)));ws.on('error',()=>{});
  const until=async(predicate,timeout=10000)=>{const end=Date.now()+timeout;while(Date.now()<end){const frame=frames.find(predicate);if(frame)return frame;await pause(20);}throw new Error('Frame timeout');};
  await until(frame=>frame.type==='snapshot');return {ws,frames,until};
 }
 const a=await open(owner),b=await open(peer);
 const selected=await (await request('/api/character',{headers:owner.headers})).json();
 a.ws.send(JSON.stringify({type:'character',revision:1,requestId:'socket-equip',selection:{expectedVersion:selected.selection.version,requestId:'equip'}}));
 const result=await a.until(frame=>frame.type==='result'&&frame.requestId==='socket-equip');assert.equal(result.ok,true);
 await b.until(frame=>frame.type==='snapshot'&&frame.players.some(p=>p.id==='user_1'&&p.character?.palette==='rose'));
 if(mode==='redis'){
  const {game:roomGame}=await app.worldFor('river-oaks'),disconnect=roomGame.disconnectUser.bind(roomGame);
  t.mock.method(roomGame,'disconnectUser',async(...args)=>{if(failCleanup){failCleanup=false;return {ok:false,error:'queue_full'};}return disconnect(...args);});
 }
 const disconnect=new Promise(resolve=>a.ws.once('close',code=>resolve(code)));
 const body=JSON.stringify({id:'event_fixture',event:'user.deleted',data:{object:'user',id:'user_1'}}),timestamp=Date.now();
 const signature=createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
 const deliver=()=>request('/api/workos/events',{method:'POST',headers:{'Content-Type':'application/json','workos-signature':`t=${timestamp}, v1=${signature}`},body});
 const first=await deliver();assert.equal(first.status,503);assert.deepEqual(await first.json(),{error:'webhook_unavailable'});
 for(const resident of [owner,otherSession]){
  assert.equal((await (await request('/auth/session',{headers:resident.headers})).json()).authenticated,false);
  assert.equal((await action(resident,'/api/multiplayer/ticket',{})).status,401);
 }
 assert.equal((await deliver()).status,200);assert.ok([4001,4003].includes(await disconnect));
 b.frames.length=0;await b.until(frame=>frame.type==='snapshot'&&!frame.players.some(p=>p.id==='user_1'),3000);
 assert.equal(cleanupAttempts,2,'retry must run disconnect even after all sessions were removed');
 const erased=await characters.get('user_1');assert.equal(erased.deleted,true);assert.equal(erased.draft,null);assert.equal(erased.published,null);assert.equal(await characters.getSelection('user_1'),null);
 assert.equal((await characters.get('user_2')).draft.palette,'rose');assert.equal((await (await request('/auth/session',{headers:peer.headers})).json()).authenticated,true);
 assert.equal((await deliver()).status,200);assert.equal(cleanupAttempts,3);assert.deepEqual(await characters.get('user_1'),erased);
 await login('user_1',403);
 await assert.rejects(characters.saveDraft('user_1',customizedCharacterDefinition('user_1','sable-human'),{expectedVersion:0,requestId:'recreate'}),{code:'character_account_deleted'});
});
