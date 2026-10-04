import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createTown } from '../town.js';

async function freePort(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}

test('the local owner publishes and joins a second world without restarting the town',async t=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  const temporary=await mkdtemp(join(tmpdir(),'river-oaks-worlds-'));
  const town=await createTown({origin,env:{RIVER_OAKS_DEV_AUTH:'local',MODERATION_FILE:join(temporary,'moderation.json')},devAuth:'local',staticRoot:null});
  await new Promise(resolve=>town.server.listen(port,'127.0.0.1',resolve));
  t.after(async()=>{await town.close();await rm(temporary,{recursive:true,force:true});});
  const first=await fetch(origin+'/auth/session'),owner=await first.json(),cookie=first.headers.get('set-cookie').split(';')[0];
  assert.equal(owner.canGrantWishes,true);
  const publish=await fetch(origin+'/api/worlds',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':owner.csrfToken,'Content-Type':'application/json'},body:JSON.stringify({id:'moon-garden',title:'Moon Garden'})});
  assert.equal(publish.status,201);
  assert.deepEqual((await (await fetch(origin+'/api/worlds')).json()).worlds.map(world=>world.id),['river-oaks','moon-garden']);
  const access=await fetch(origin+'/api/multiplayer/ticket?world=moon-garden',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':owner.csrfToken}});
  assert.equal(access.status,200);
  const ticket=(await access.json()).ticket;
  const socket=new WebSocket(`${origin.replace('http:','ws:')}/multiplayer?world=moon-garden&protocol=1&ticket=${ticket}`,{headers:{Origin:origin,Cookie:cookie}});
  t.after(()=>socket.terminate());
  const snapshot=await new Promise((resolve,reject)=>{socket.once('error',reject);socket.on('message',raw=>{const value=JSON.parse(raw);if(value.type==='snapshot')resolve(value);});});
  assert.equal(snapshot.worldId,'moon-garden');
  assert.equal(snapshot.players[0].canBuild,true);
  const guest=await fetch(origin+'/auth/session');
  const denied=await fetch(origin+'/api/worlds',{method:'POST',headers:{Origin:origin,Cookie:guest.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':(await guest.json()).csrfToken,'Content-Type':'application/json'},body:JSON.stringify({id:'guest-world',title:'Guest World'})});
  assert.equal(denied.status,403);
});
