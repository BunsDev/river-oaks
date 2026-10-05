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
  assert.deepEqual((await (await fetch(origin+'/api/worlds')).json()).worlds.map(world=>world.visitors),[0,0]);
  const access=await fetch(origin+'/api/multiplayer/ticket?world=moon-garden',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':owner.csrfToken}});
  assert.equal(access.status,200);
  const ticket=(await access.json()).ticket;
  const socket=new WebSocket(`${origin.replace('http:','ws:')}/multiplayer?world=moon-garden&protocol=2&ticket=${ticket}`,{headers:{Origin:origin,Cookie:cookie}});
  t.after(()=>socket.terminate());
  const snapshot=await new Promise((resolve,reject)=>{socket.once('error',reject);socket.on('message',raw=>{const value=JSON.parse(raw);if(value.type==='snapshot')resolve(value);});});
  assert.equal(snapshot.worldId,'moon-garden');
  assert.equal(snapshot.locals.length,8);
  assert.equal(snapshot.players[0].canBuild,true);
  const command=(ws,requestId,body)=>new Promise((resolve,reject)=>{
    const receive=raw=>{const value=JSON.parse(raw);if(value.type==='result'&&value.requestId===requestId){ws.off('message',receive);resolve(value);}};
    ws.on('message',receive);ws.once('error',reject);ws.send(JSON.stringify({requestId,...body}));
  });
  assert.equal((await command(socket,'look',{type:'appearance',appearance:'woman-casual'})).ok,true);
  assert.equal((await command(socket,'gait',{type:'movement',movement:'beast'})).ok,true);
  const riverAccess=await fetch(origin+'/api/multiplayer/ticket?world=river-oaks',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':owner.csrfToken}});
  const riverTicket=(await riverAccess.json()).ticket;
  const riverSocket=new WebSocket(`${origin.replace('http:','ws:')}/multiplayer?world=river-oaks&protocol=2&ticket=${riverTicket}`,{headers:{Origin:origin,Cookie:cookie}});
  t.after(()=>riverSocket.terminate());
  const riverSnapshot=await new Promise((resolve,reject)=>{riverSocket.once('error',reject);riverSocket.on('message',raw=>{const value=JSON.parse(raw);if(value.type==='snapshot')resolve(value);});});
  assert.equal(riverSnapshot.players.find(player=>player.id===owner.user.id).appearance,'woman-casual');
  assert.equal(riverSnapshot.players.find(player=>player.id===owner.user.id).movement,'beast');
  assert.deepEqual((await (await fetch(origin+'/api/worlds')).json()).worlds.map(world=>world.visitors),[1,1]);
  const guest=await fetch(origin+'/auth/session');
  const guestSession=await guest.json(),guestCookie=guest.headers.get('set-cookie').split(';')[0];
  assert.equal((await draftRequest(guestSession,guestCookie,'load',{id:'moon-garden'})).status,403);
  assert.equal((await draftRequest(guestSession,guestCookie,'history',{id:'moon-garden'})).status,403);
  assert.equal((await draftRequest(guestSession,guestCookie,'version',{id:'moon-garden',revision:1,baseRegionSha256:editable.world.regionSha256})).status,403);
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
  const history=await (await draftRequest(owner,cookie,'history',{id:'moon-garden'})).json();
  assert.deepEqual(history.versions.map(version=>version.revision),[1]);
  const original=await (await draftRequest(owner,cookie,'version',{id:'moon-garden',revision:1,baseRegionSha256:history.world.regionSha256})).json();
  assert.equal(original.region.places[0].name,editable.publishedRegion.places[0].name);
  assert.equal((await draftRequest(owner,cookie,'version',{id:'moon-garden',revision:1,baseRegionSha256:editable.world.regionSha256})).status,409);
  assert.equal((await draftRequest(owner,cookie,'save',{id:'moon-garden',baseRegionSha256:history.world.regionSha256,expectedDraftVersion:0,region:original.region})).status,200);
  assert.equal((await draftRequest(owner,cookie,'apply',{id:'moon-garden',expectedDraftVersion:1})).status,200);
  assert.equal((await (await fetch(origin+'/api/world-data?world=moon-garden')).json()).world.communityLocations[0].name,editable.publishedRegion.places[0].name);
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

test('accepted contacts see a current world across joins and old socket cleanup',async t=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  const temporary=await mkdtemp(join(tmpdir(),'river-oaks-contact-worlds-'));
  const town=await createTown({origin,env:{RIVER_OAKS_DEV_AUTH:'local',RIVER_OAKS_ACCEPTANCE_FIXTURE:'1',
    MODERATION_FILE:join(temporary,'moderation.json'),WAITLIST_FILE:join(temporary,'waitlist.json')},devAuth:'local',staticRoot:null});
  await new Promise(resolve=>town.server.listen(port,'127.0.0.1',resolve));
  t.after(async()=>{await town.close();await rm(temporary,{recursive:true,force:true});});
  const session=async()=>{
    const response=await fetch(origin+'/auth/session');
    return {identity:await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};
  };
  const owner=await session(),guest=await session();
  const post=(account,path,data={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,Cookie:account.cookie,
    'X-CSRF-Token':account.identity.csrfToken,'Content-Type':'application/json'},body:JSON.stringify(data)});
  assert.equal((await post(owner,'/api/worlds',{id:'moon-garden',title:'Moon Garden',region})).status,201);
  const sockets=[];
  t.after(()=>{for(const socket of sockets)socket.terminate();});
  const joinWorld=async(account,worldId)=>{
    const ticketResponse=await post(account,`/api/multiplayer/ticket?world=${worldId}`);
    assert.equal(ticketResponse.status,200);
    const {ticket}=await ticketResponse.json();
    const socket=new WebSocket(`${origin.replace('http:','ws:')}/multiplayer?world=${worldId}&protocol=2&ticket=${ticket}`,
      {headers:{Origin:origin,Cookie:account.cookie}});
    sockets.push(socket);
    const snapshot=await new Promise((resolve,reject)=>{
      socket.once('error',reject);
      socket.on('message',raw=>{const message=JSON.parse(raw);if(message.type==='snapshot')resolve(message);});
    });
    assert.equal(snapshot.worldId,worldId);
    return socket;
  };
  const ownerRiver=await joinWorld(owner,'river-oaks');
  await joinWorld(guest,'river-oaks');
  assert.equal((await post(owner,'/api/social/request?world=river-oaks',{peerId:guest.identity.user.id})).status,200);
  assert.equal((await post(guest,'/api/social/accept?world=river-oaks',{peerId:owner.identity.user.id})).status,200);
  const current=async()=>{
    const response=await post(guest,'/api/social/list?world=river-oaks');
    assert.equal(response.status,200);
    return (await response.json()).contacts.find(item=>item.peer.id===owner.identity.user.id)?.presence;
  };
  assert.deepEqual(await current(),{worldId:'river-oaks',title:'River Oaks District'});
  const ownerGarden=await joinWorld(owner,'moon-garden');
  const olderClosed=new Promise(resolve=>ownerRiver.once('close',resolve));
  ownerRiver.close();await olderClosed;
  assert.deepEqual(await current(),{worldId:'moon-garden',title:'Moon Garden'});
  const newerClosed=new Promise(resolve=>ownerGarden.once('close',resolve));
  ownerGarden.close();await newerClosed;
  const deadline=Date.now()+3000;
  while(await current()){
    if(Date.now()>deadline)assert.fail('Disconnected contact remained online');
    await new Promise(resolve=>setTimeout(resolve,20));
  }
});
