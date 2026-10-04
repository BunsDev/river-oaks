import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createTown } from '../town.js';

const region=JSON.parse(readFileSync(new URL('../../preview/public/data/sample-region.json',import.meta.url)));

async function freePort(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}

test('the local owner publishes and joins a second world without restarting the town',async t=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  const temporary=await mkdtemp(join(tmpdir(),'river-oaks-worlds-'));
  const town=await createTown({origin,env:{RIVER_OAKS_DEV_AUTH:'local',RIVER_OAKS_ACCEPTANCE_FIXTURE:'1',
    MODERATION_FILE:join(temporary,'moderation.json'),WAITLIST_FILE:join(temporary,'waitlist.json')},devAuth:'local',staticRoot:null});
  await new Promise(resolve=>town.server.listen(port,'127.0.0.1',resolve));
  t.after(async()=>{await town.close();await rm(temporary,{recursive:true,force:true});});
  const first=await fetch(origin+'/auth/session'),owner=await first.json(),cookie=first.headers.get('set-cookie').split(';')[0];
  assert.equal(owner.canGrantWishes,true);
  const publish=await fetch(origin+'/api/worlds',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':owner.csrfToken,'Content-Type':'application/json'},body:JSON.stringify({id:'moon-garden',title:'Moon Garden',region})});
  assert.equal(publish.status,201);
  assert.equal((await (await fetch(origin+'/api/world-data?world=moon-garden')).json()).world.buildings.length,4);
  const draftRequest=(session,sessionCookie,action,data)=>fetch(origin+`/api/world-draft/${action}`,{method:'POST',headers:{Origin:origin,Cookie:sessionCookie,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'},body:JSON.stringify(data)});
  const editable=await (await draftRequest(owner,cookie,'load',{id:'moon-garden'})).json();
  assert.equal(editable.publishedRegion.buildings.length,4);
  const revised={...editable.publishedRegion,places:editable.publishedRegion.places.map((place,index)=>index?place:{...place,name:'Private revision'})};
  assert.equal((await draftRequest(owner,cookie,'save',{id:'moon-garden',baseRegionSha256:editable.world.regionSha256,expectedDraftVersion:0,region:revised})).status,200);
  assert.equal((await draftRequest(owner,cookie,'save',{id:'moon-garden',baseRegionSha256:editable.world.regionSha256,expectedDraftVersion:0,region:revised})).status,409);
  assert.equal((await (await draftRequest(owner,cookie,'load',{id:'moon-garden'})).json()).draft.region.places[0].name,'Private revision');
  assert.notEqual((await (await fetch(origin+'/api/world-data?world=moon-garden')).json()).world.communityLocations[0].name,'Private revision');
  assert.deepEqual((await (await fetch(origin+'/api/worlds')).json()).worlds.map(world=>world.id),['river-oaks','moon-garden']);
  const access=await fetch(origin+'/api/multiplayer/ticket?world=moon-garden',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':owner.csrfToken}});
  assert.equal(access.status,200);
  const ticket=(await access.json()).ticket;
  const socket=new WebSocket(`${origin.replace('http:','ws:')}/multiplayer?world=moon-garden&protocol=1&ticket=${ticket}`,{headers:{Origin:origin,Cookie:cookie}});
  t.after(()=>socket.terminate());
  const snapshot=await new Promise((resolve,reject)=>{socket.once('error',reject);socket.on('message',raw=>{const value=JSON.parse(raw);if(value.type==='snapshot')resolve(value);});});
  assert.equal(snapshot.worldId,'moon-garden');
  assert.equal(snapshot.locals.length,8);
  assert.equal(snapshot.players[0].canBuild,true);
  const guest=await fetch(origin+'/auth/session');
  const guestSession=await guest.json(),guestCookie=guest.headers.get('set-cookie').split(';')[0];
  assert.equal((await draftRequest(guestSession,guestCookie,'load',{id:'moon-garden'})).status,403);
  const profileRequest=(session,sessionCookie,action,data)=>fetch(origin+`/api/profile/${action}?world=moon-garden`,{method:'POST',headers:{Origin:origin,Cookie:sessionCookie,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'},body:JSON.stringify(data)});
  assert.equal((await profileRequest(owner,cookie,'save',{tagline:'Garden host',bio:'Welcome to my world.',pronouns:'she/her',interests:['Gardens'],expectedVersion:0})).status,200);
  assert.equal((await (await profileRequest(owner,cookie,'view',{})).json()).profile.bio,'Welcome to my world.');
  assert.equal((await profileRequest(guestSession,guestCookie,'view',{peerId:owner.user.id})).status,404);
  const denied=await fetch(origin+'/api/worlds',{method:'POST',headers:{Origin:origin,Cookie:guestCookie,'X-CSRF-Token':guestSession.csrfToken,'Content-Type':'application/json'},body:JSON.stringify({id:'guest-world',title:'Guest World'})});
  assert.equal(denied.status,403);
  assert.equal((await draftRequest(guestSession,guestCookie,'apply',{id:'moon-garden',expectedDraftVersion:1})).status,403);
  const oldConnectionClosed=new Promise(resolve=>socket.once('close',resolve));
  const applied=await draftRequest(owner,cookie,'apply',{id:'moon-garden',expectedDraftVersion:1});
  assert.equal(applied.status,200);
  assert.equal((await applied.json()).world.revision,2);
  assert.equal(await oldConnectionClosed,4000);
  assert.equal((await (await fetch(origin+'/api/world-data?world=moon-garden')).json()).world.communityLocations[0].name,'Private revision');
  assert.equal((await draftRequest(owner,cookie,'apply',{id:'moon-garden',expectedDraftVersion:1})).status,409);
});

test('a configured alternate world exposes the bundled geography without a catalog entry',async t=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  const temporary=await mkdtemp(join(tmpdir(),'river-oaks-configured-world-'));
  const town=await createTown({origin,env:{WORLD_ID:'private-garden',RIVER_OAKS_DEV_AUTH:'local',MODERATION_FILE:join(temporary,'moderation.json')},devAuth:'local',staticRoot:null});
  await new Promise(resolve=>town.server.listen(port,'127.0.0.1',resolve));
  t.after(async()=>{await town.close();await rm(temporary,{recursive:true,force:true});});
  const response=await fetch(origin+'/api/world-data?world=private-garden');
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{template:'river-oaks'});
  assert.equal((await fetch(origin+'/api/waitlist/status')).status,401);
  assert.equal((await fetch(origin+'/api/world-data?world=missing')).status,404);
});
