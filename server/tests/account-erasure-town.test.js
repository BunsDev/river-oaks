import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createTown } from '../town.js';

async function freePort(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
// One loopback fixture resident: a session, its CSRF token, and a joined socket.
async function resident(t,origin){
  const response=await fetch(origin+'/auth/session'),session=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
  const post=(path,data={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'},body:JSON.stringify(data)});
  const ticket=(await (await post('/api/multiplayer/ticket')).json()).ticket;
  const socket=new WebSocket(`${origin.replace('http:','ws:')}/multiplayer?protocol=3&ticket=${ticket}`,{headers:{Origin:origin,Cookie:cookie}});
  t.after(()=>socket.terminate());
  const closed=new Promise(resolve=>socket.once('close',code=>resolve(code)));
  await new Promise((resolve,reject)=>{socket.once('error',reject);socket.on('message',raw=>{if(JSON.parse(raw).type==='snapshot')resolve();});});
  return {id:session.user.id,name:session.user.name,post,socket,closed};
}

test('the standalone town erases an account from every store and world, and keeps the peer whole',{timeout:30000},async t=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  const temporary=await mkdtemp(join(tmpdir(),'river-oaks-erasure-'));
  const town=await createTown({origin,env:{RIVER_OAKS_DEV_AUTH:'local',RIVER_OAKS_ACCEPTANCE_FIXTURE:'1',
    MODERATION_FILE:join(temporary,'moderation.json'),WAITLIST_FILE:join(temporary,'waitlist.json')},devAuth:'local',staticRoot:null});
  await new Promise(resolve=>town.server.listen(port,'127.0.0.1',resolve));
  t.after(async()=>{await town.close();await rm(temporary,{recursive:true,force:true});});
  const pat=await resident(t,origin),erin=await resident(t,origin);
  const text='erin-private-words',json=response=>response.json();
  // Erin's footprint: a profile, a contact with messages, a group, an event, a landmark and a chat line.
  assert.equal((await erin.post('/api/profile/save',{tagline:text,bio:text,pronouns:'',interests:[],expectedVersion:0})).status,200);
  assert.equal((await erin.post('/api/social/request',{peerId:pat.id})).status,200);
  assert.equal((await pat.post('/api/social/accept',{peerId:erin.id})).status,200);
  assert.equal((await erin.post('/api/social/send',{peerId:pat.id,text})).status,200);
  const group=(await json(await erin.post('/api/groups/create',{name:'Erin circle',description:text}))).group;
  assert.equal((await erin.post('/api/groups/invite',{groupId:group.id,peerId:pat.id})).status,200);
  const start=Date.now()+3_600_000;
  const created=await erin.post('/api/events/create',{title:'Erin social',description:text,placeId:'arrival',startsAt:start,endsAt:start+3_600_000,capacity:8});assert.equal(created.status,201);
  assert.equal((await erin.post('/api/landmarks/add',{name:'Erin corner'})).status,200);
  erin.socket.send(JSON.stringify({type:'chat',text}));
  const {world}=await town.worldFor('river-oaks');
  for(let i=0;i<50&&!world.snapshot().chat.some(entry=>entry.text===text);i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(world.snapshot().chat.some(entry=>entry.text===text));
  assert.equal((await json(await pat.post('/api/social/list'))).contacts.length,1);
  assert.equal((await json(await pat.post('/api/groups/list'))).groups.length,1);
  assert.ok((await json(await pat.post('/api/events/list'))).events.some(event=>event.title==='Erin social'));

  await town.eraseAccount(erin.id);
  assert.equal(await erin.closed,4003);
  assert.equal((await erin.post('/api/profile/save',{tagline:'',bio:'',pronouns:'',interests:[],expectedVersion:1})).status,401);
  assert.deepEqual((await json(await pat.post('/api/social/list'))).contacts,[]);
  assert.deepEqual((await json(await pat.post('/api/groups/list'))).groups,[]);
  assert.equal((await json(await pat.post('/api/events/list'))).events.some(event=>event.title==='Erin social'),false);
  const snapshot=world.snapshot();
  assert.equal(snapshot.players.some(player=>player.id===erin.id),false);
  assert.equal(JSON.stringify(world.checkpoint()).includes(erin.id),false);
  assert.equal(JSON.stringify(world.checkpoint()).includes(text),false);
  // The file waitlist forgets the request too, mirror included.
  assert.equal((await readFile(join(temporary,'waitlist.json'),'utf8')).includes(erin.id),false);
  // Pat is whole: still signed in, still in town, with their own profile intact.
  assert.equal((await pat.post('/api/profile/save',{tagline:'pat',bio:'',pronouns:'',interests:[],expectedVersion:0})).status,200);
  assert.ok(snapshot.players.some(player=>player.id===pat.id));
  // A second run finds nothing more to do.
  await town.eraseAccount(erin.id);
});
