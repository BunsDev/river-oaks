import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import Redis from 'ioredis';
import {createRedisBackend} from '../redis-backend.js';
import {createRedisCharacterStore} from '../character-store.js';
import {createRedisSocial} from '../social.js';
import {createRedisGroups} from '../groups.js';
import {createRedisProfiles} from '../profiles.js';
import {createRedisEvents} from '../events.js';
import {createRedisPresence} from '../presence.js';
import {createRedisDesignLibrary} from '../design-library.js';
import {createRedisOfficeDesk} from '../office-desk.js';
import {createRedisAvatarPreferences} from '../avatar-preferences.js';
import {createRedisCyclingMiles} from '../cycling-miles.js';
import {createRedisLandmarks} from '../landmarks.js';
import {createRedisDebugReports} from '../debug-reports.js';
import {createRedisWaitlist} from '../waitlist.js';
import {createRedisGitHubNameStore} from '../github-names.js';
import {createRedisVoiceLeases,VOICE_LEASE_TTL_MS} from '../voice.js';
import {accountPrefixFor,roomPrefixFor} from '../world-keys.js';
import {createRedisRoom} from '../redis-room.js';
import {loadDistrictData} from '../district-data.js';
import {configuredDistrictRevision} from '../../preview/src/garden-campus-district.js';
import {customizedCharacterDefinition} from '../../preview/src/character-customization.js';

// The deleted account (Erin) and a peer (Pat) who keeps everything that is theirs.
const origin='http://127.0.0.1',secret='local-erasure-webhook-fixture';
const erin={userId:'user_01ERASEME',name:'Erin Erasable'},pat={userId:'user_01KEEPME',name:'Pat Peer'};
const erinEmail='erin.erasable@example.test',erinText='erin-private-words';
const digests=id=>[id,createHash('sha256').update(id).digest('hex'),createHash('sha256').update(id).digest('base64url')];
async function listen(app){await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${app.server.address().port}`;}
function deletion(base,userId,event='event_erasure'){
 const body=JSON.stringify({id:event,event:'user.deleted',data:{object:'user',id:userId}}),timestamp=Date.now();
 return fetch(base+'/api/workos/events',{method:'POST',headers:{'Content-Type':'application/json',
  'workos-signature':`t=${timestamp}, v1=${createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex')}`},body});
}
// Every account store the backend builds, at the prefixes the backend gives them.
function stores(redis,namespace){
 const prefix=`{${namespace}}`,accounts=accountPrefixFor(namespace);
 return {characters:createRedisCharacterStore({redis,prefix:accounts}),social:createRedisSocial({redis,prefix}),groups:createRedisGroups({redis,prefix}),
  profiles:createRedisProfiles({redis,prefix}),events:createRedisEvents({redis,prefix}),presence:createRedisPresence({redis,prefix}),
  designLibrary:createRedisDesignLibrary({redis,prefix:accounts}),officeDesk:createRedisOfficeDesk({redis,prefix}),
  avatarPreferences:createRedisAvatarPreferences({redis,prefix}),cyclingMiles:createRedisCyclingMiles({redis,prefix:accounts}),
  landmarks:createRedisLandmarks({redis,prefix:accounts}),debugReports:createRedisDebugReports({redis,prefix}),
  waitlist:createRedisWaitlist({redis,prefix:`{${namespace}:access}`}),githubNames:createRedisGitHubNameStore({redis,key:`${prefix}:auth:github`}),
  voiceLeases:createRedisVoiceLeases({redis,prefix})};
}
const report={schema:'river-oaks.debug-report',version:1,id:'client-id',createdAt:'2026-10-24T15:00:00.000Z',description:erinText,
 app:{version:'0.1.6',commit:'abc123',path:'/play'},environment:{browser:'Chrome 126'},errors:[],console:[],network:[],breadcrumbs:[]};
async function seed(s,person,peer){
 const {userId,name}=person,email=person===erin?erinEmail:'pat.peer@example.test',text=person===erin?erinText:'pat-own-words';
 await s.characters.saveDraft(userId,customizedCharacterDefinition(userId,'sable-human',{palette:'rose'}),{expectedVersion:0,requestId:'save'});
 assert.equal((await s.profiles.save(userId,{tagline:text,bio:text,pronouns:'',interests:[],expectedVersion:0})).ok,true);
 assert.equal((await s.profiles.claimStoreIntro(userId,'river-oaks','shop:cafe')).firstVisit,true);
 assert.equal((await s.groups.create(person,{name:`${name} circle`,description:text})).ok,true);
 const start=Date.now()+3_600_000;
 assert.equal((await s.events.create(person,{title:`${name} social`,description:text,placeId:'arrival',startsAt:start,endsAt:start+3_600_000,capacity:8},
  {worldId:'river-oaks',worldTitle:'River Oaks',placeId:'arrival',placeName:'Arrival'})).ok,true);
 await s.presence.join(userId,{id:'river-oaks',title:'River Oaks'},`token-${userId}`);
 assert.equal((await s.designLibrary.save(userId,{kind:'seat',finish:'rose'})).ok,true);
 assert.equal((await s.officeDesk.save(userId,{expectedVersion:0,task:{id:'first-task',title:text,notes:text,links:[],result:'',status:'open'}})).ok,true);
 await s.avatarPreferences.initialize(userId);
 await s.cyclingMiles.add(userId,1200,name);
 assert.equal((await s.landmarks.add(userId,{name:`${name} corner`,position:[1,2]})).ok,true);
 await s.debugReports.add({...report,description:text},{userId,name});
 await s.waitlist.request({userId,name,email});
 await s.githubNames.set(userId,{githubId:userId===erin.userId?'101':'202',login:userId===erin.userId?'erin-erasable':'pat-peer',checkedAt:0});
 const time=Date.now();
 await s.voiceLeases.issue({userId,worldId:'river-oaks',space:'outdoor',room:'river-oaks.test.v1.river-oaks.outdoor',participantIdentity:`p-${userId}-c1`,
  connectionId:'c1',issuedAt:time,expiresAt:time+VOICE_LEASE_TTL_MS,revision:0});
 if(peer){
  // Shared records: a friendship with messages both ways, each in the other's group, an RSVP.
  assert.equal((await s.social.request(person,peer)).ok,true);
  assert.equal((await s.social.accept(peer.userId,userId)).ok,true);
  assert.equal((await s.social.send(person,peer.userId,text)).ok,true);
  assert.equal((await s.social.send(peer,userId,'pat-own-words')).ok,true);
 }
}
// The default world's room, as a gateway would hold it: both join and talk.
async function seedWorld(redis,namespace){
 const worldData=await loadDistrictData({districtRevision:configuredDistrictRevision(undefined)});
 const room=createRedisRoom({redis,prefix:roomPrefixFor(namespace,'river-oaks'),worldId:'river-oaks',worldData,authorize:async()=>true});
 try{
  for(const [person,text] of [[pat,'pat-own-words'],[erin,erinText]]){
   const identity={userId:person.userId,name:person.name,sessionId:`session-${person.userId}`,expiresAt:Date.now()+3_600_000};
   assert.equal((await room.request({type:'join',identity,connectionId:`${person.userId}-socket`})).ok,true);
   assert.equal((await room.request({type:'command',userId:person.userId,connectionId:`${person.userId}-socket`,message:{type:'chat',text}})).ok,true);
  }
 }finally{await room.close();}
}
// Every key in the namespace, with its contents decoded (room state is deflated).
async function dump(redis,namespace){
 const out=[];let cursor='0';
 do{
  const [next,keys]=await redis.scan(cursor,'MATCH',`*${namespace}*`,'COUNT',500);cursor=next;
  for(const key of keys){
   const type=await redis.type(key);let values=[];
   if(type==='string'){const raw=await redis.getBuffer(key);values=[raw.toString('utf8')];try{values.push(inflateSync(raw).toString('utf8'));}catch{}}
   else if(type==='hash')values=Object.entries(await redis.hgetall(key)).flat();
   else if(type==='list')values=await redis.lrange(key,0,-1);
   else if(type==='set')values=await redis.smembers(key);
   else if(type==='zset')values=await redis.zrange(key,0,-1);
   out.push({key,type,text:[key,...values].join('\n')});
  }
 }while(cursor!=='0');
 return out;
}
const traces=(entries,needles)=>entries.filter(entry=>needles.some(needle=>entry.text.includes(needle))).map(entry=>entry.key).sort();

test('a signed WorkOS deletion leaves no trace of the account in any Redis store',{skip:!process.env.REDIS_URL,timeout:30000},async t=>{
 const namespace=`account-erasure:${randomUUID()}`,redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});
 const app=await createRedisBackend({PUBLIC_ORIGIN:origin,REDIS_URL:process.env.REDIS_URL,REDIS_NAMESPACE:namespace,WORKOS_WEBHOOK_SECRET:secret,CRON_SECRET:'cron-fixture'});
 t.after(async()=>{await app.close();let cursor='0';do{const [next,keys]=await redis.scan(cursor,'MATCH',`*${namespace}*`,'COUNT',500);cursor=next;if(keys.length)await redis.del(...keys);}while(cursor!=='0');await redis.quit();});
 const s=stores(redis,namespace);
 await seed(s,pat);await seed(s,erin,pat);await seedWorld(redis,namespace);
 const needles=[...digests(erin.userId),erin.name,erinEmail,erinText,'erin-erasable'];
 const before=traces(await dump(redis,namespace),needles);
 assert.ok(before.length>=10,`seeded traces: ${before.join(', ')}`);
 assert.ok(before.includes(roomPrefixFor(namespace,'river-oaks')+':state'),'the room checkpoint holds the account');
 const base=await listen(app);
 assert.equal((await deletion(base,erin.userId)).status,200);
 // Until its second pass, the request's record names the account, under the WorkOS event.
 const pendingKey=accountPrefixFor(namespace)+':erasure:pending:v1';
 const recorded=JSON.parse(await redis.hget(pendingKey,erin.userId));
 assert.equal(recorded.eventId,'event_erasure');assert.ok(recorded.settleAt>Date.now(),'the second pass waits for the request timeout');
 const sweep=()=>fetch(base+'/api/erasure-sweep',{headers:{Authorization:'Bearer cron-fixture'}}).then(response=>response.json());
 assert.deepEqual(await sweep(),{ok:true,finished:0,failed:0,waiting:1});
 // The cron runs the second pass once it is due.
 await redis.hset(pendingKey,erin.userId,JSON.stringify({...recorded,settleAt:Date.now()-1}));
 assert.deepEqual(await sweep(),{ok:true,finished:1,failed:0,waiting:0});
 // The only record kept is the character tombstone that refuses the deleted id a new session.
 const left=(await dump(redis,namespace)).filter(entry=>needles.some(needle=>entry.text.includes(needle)));
 const tombstone=accountPrefixFor(namespace)+':characters:v1';
 // A room reply to the account's own last request lapses within REPLY_MS (15 s).
 const replies=left.filter(entry=>entry.key.includes(':reply:'));
 for(const entry of replies){const ttl=await redis.pttl(entry.key);assert.ok(ttl>0&&ttl<=15000,`reply ${ttl} ms`);}
 assert.deepEqual(left.map(entry=>entry.key).filter(key=>key!==tombstone&&!key.includes(':reply:')),[],'stores still holding the deleted account');
 // The tombstone, under the hashed id, holds nothing but the deletion itself.
 assert.deepEqual(left.filter(entry=>entry.key===tombstone).length,1);
 assert.deepEqual(JSON.parse(await redis.hget(tombstone,digests(erin.userId)[1])),
  {schemaVersion:2,version:2,deleted:true,draft:null,revisions:[],receipts:[],selection:null,selectionReceipts:[]});
 // Pat keeps everything that is Pat's.
 assert.equal((await s.profiles.get(pat.userId)).tagline,'pat-own-words');
 assert.equal((await s.groups.list(pat.userId)).length,1);
 assert.ok((await s.waitlist.list()).some(record=>record.userId===pat.userId));
 assert.equal((await s.cyclingMiles.rank(pat.userId)).meters,1200);
 assert.equal((await s.landmarks.list(pat.userId)).length,1);
 assert.deepEqual(await s.social.list(pat.userId),[]);
 // A duplicate delivery stays a success, finds nothing more and leaves Pat alone.
 assert.equal((await deletion(base,erin.userId,'event_erasureagain')).status,200);
 assert.deepEqual(traces(await dump(redis,namespace),needles).filter(key=>!key.includes(':reply:')),[tombstone,pendingKey]);
 await redis.hset(pendingKey,erin.userId,JSON.stringify({eventId:'event_erasureagain',settleAt:Date.now()-1}));
 assert.deepEqual(await sweep(),{ok:true,finished:1,failed:0,waiting:0});
 assert.deepEqual(traces(await dump(redis,namespace),needles).filter(key=>!key.includes(':reply:')),[tombstone]);
 assert.equal((await s.profiles.get(pat.userId)).tagline,'pat-own-words');
});

test('on Vercel, a deletion webhook without the cron secret is reported at every start', { skip: !process.env.REDIS_URL, timeout: 30000 }, async t => {
  const warnings = [];t.mock.method(console, 'warn', line => warnings.push(line));
  const namespace = `account-erasure:${randomUUID()}`, redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  t.after(async () => { let cursor = '0';do { const [next, keys] = await redis.scan(cursor, 'MATCH', `*${namespace}*`, 'COUNT', 500);cursor = next;if (keys.length) await redis.del(...keys); } while (cursor !== '0');await redis.quit(); });
  const env = { PUBLIC_ORIGIN: origin, REDIS_URL: process.env.REDIS_URL, REDIS_NAMESPACE: namespace, WORKOS_WEBHOOK_SECRET: secret, VERCEL: '1' };
  for (const [more, expected] of [[{}, true], [{ CRON_SECRET: 'cron-fixture' }, false]]) {
    warnings.length = 0;
    const app = await createRedisBackend({ ...env, ...more });await app.close();
    assert.equal(warnings.some(line => line === JSON.stringify({ event: 'account_erasure_sweep_unscheduled' })), expected, JSON.stringify(more));
  }
});
