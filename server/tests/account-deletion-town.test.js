import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createTown } from '../town.js';
import { DELETION_PHRASE } from '../account-deletion.js';

// In-app deletion in the standalone town (#292), over real HTTP and WebSocket with the
// loopback fixture sign-in: the resident deletes their own account from the page.
async function freePort(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
async function town(t,flag){
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  const temporary=await mkdtemp(join(tmpdir(),'river-oaks-deletion-'));
  const app=await createTown({origin,env:{RIVER_OAKS_DEV_AUTH:'local',RIVER_OAKS_ACCEPTANCE_FIXTURE:'1',RIVER_OAKS_ACCOUNT_DELETION:flag,
    MODERATION_FILE:join(temporary,'moderation.json'),WAITLIST_FILE:join(temporary,'waitlist.json'),BLOCKS_FILE:join(temporary,'blocks.json')},devAuth:'local',staticRoot:null});
  await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));
  t.after(async()=>{await app.close();await rm(temporary,{recursive:true,force:true});});
  return {origin,temporary};
}
async function resident(t,origin){
  const response=await fetch(origin+'/auth/session'),session=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
  const headers={Origin:origin,Cookie:cookie,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'};
  const post=(path,data={})=>fetch(origin+path,{method:'POST',headers,body:JSON.stringify(data)});
  const ticket=(await (await post('/api/multiplayer/ticket')).json()).ticket;
  const socket=new WebSocket(`${origin.replace('http:','ws:')}/multiplayer?protocol=3&ticket=${ticket}`,{headers:{Origin:origin,Cookie:cookie}});
  t.after(()=>socket.terminate());
  const closed=new Promise(resolve=>socket.once('close',code=>resolve(code)));
  await new Promise((resolve,reject)=>{socket.once('error',reject);socket.on('message',raw=>{if(JSON.parse(raw).type==='snapshot')resolve();});});
  const status=async()=>(await fetch(origin+'/api/account/delete',{headers:{Cookie:cookie}})).json();
  return {id:session.user.id,cookie,post,status,closed};
}

test('a resident deletes their own account in the standalone town, and the peer keeps their own',{timeout:30000},async t=>{
  const {origin,temporary}=await town(t,'1');
  const pat=await resident(t,origin),erin=await resident(t,origin);
  const json=response=>response.json(),text='erin-private-words';
  assert.equal((await erin.post('/api/profile/save',{tagline:text,bio:text,pronouns:'',interests:[],expectedVersion:0})).status,200);
  assert.equal((await erin.post('/api/social/request',{peerId:pat.id})).status,200);
  assert.equal((await pat.post('/api/social/accept',{peerId:erin.id})).status,200);
  assert.equal((await erin.post('/api/social/send',{peerId:pat.id,text})).status,200);
  assert.equal((await pat.post('/api/blocks/add',{peerId:erin.id})).status,200);
  assert.deepEqual(await erin.status(),{available:true,recent:true});

  assert.equal((await erin.post('/api/account/delete',{confirm:'delete it'})).status,400);
  const deleted=await erin.post('/api/account/delete',{confirm:DELETION_PHRASE});
  assert.equal(deleted.status,200);assert.deepEqual(await json(deleted),{deleted:true,complete:true});
  assert.match(deleted.headers.get('set-cookie'),/river_oaks_dev_session=; .*Max-Age=0/);
  assert.equal(await erin.closed,4003,'the socket closed');
  assert.equal((await erin.post('/api/profile/save',{tagline:'',bio:'',pronouns:'',interests:[],expectedVersion:1})).status,401,'the old session is gone');
  assert.deepEqual(await erin.status(),{available:false});
  assert.deepEqual((await json(await pat.post('/api/social/list'))).contacts,[]);
  assert.deepEqual((await json(await pat.post('/api/blocks/list'))).blocked,[]);
  assert.equal((await readFile(join(temporary,'blocks.json'),'utf8')).includes(erin.id),false);
  assert.equal((await pat.post('/api/profile/view',{peerId:erin.id})).status,404,'the profile is gone');
  assert.equal((await pat.post('/api/profile/save',{tagline:'pat',bio:'',pronouns:'',interests:[],expectedVersion:0})).status,200,'the peer is untouched');
});

test('with the flag off the standalone town has no deletion route',{timeout:30000},async t=>{
  const {origin}=await town(t,'');
  const erin=await resident(t,origin);
  assert.deepEqual(await erin.status(),{available:false});
  assert.equal((await erin.post('/api/account/delete',{confirm:DELETION_PHRASE})).status,404);
  assert.equal((await erin.post('/api/profile/save',{tagline:'still here',bio:'',pronouns:'',interests:[],expectedVersion:0})).status,200);
});
