import test from 'node:test';
import assert from 'node:assert/strict';
import { eventAction } from '../events-api.js';
import { createMemoryEvents } from '../events.js';

test('event actions derive venue and host from the server and never trust client cancellation power',async()=>{
  const events=createMemoryEvents({now:()=>0});
  const call=(userId,action,data)=>eventAction({action,identity:{userId,name:userId},events,readBody:async()=>data,
    resolveVenue:async id=>id==='arrival'?{worldId:'moon-garden',worldTitle:'Moon Garden',placeId:id,placeName:'Arrival'}:null,
    allowWrite:async()=>true,isAdmin:id=>id==='jevica'});
  const draft={title:'Stories',description:'Welcome',placeId:'arrival',startsAt:1000,endsAt:3_601_000,capacity:4};
  assert.equal((await call('host','create',{...draft,hostId:'jevica'})).status,400);
  assert.equal((await call('host','create',{...draft,placeId:'unknown'})).status,400);
  const response=await call('host','create',draft);assert.equal(response.status,201);
  const id=response.value.event.id;
  assert.equal(response.value.event.worldId,'moon-garden');assert.equal(response.value.event.hostName,'host');
  assert.equal((await call('guest','rsvp',{id,going:true,userId:'host'})).status,400);
  assert.equal((await call('guest','rsvp',{id,going:true})).status,200);
  assert.equal((await call('guest','cancel',{id,admin:true})).status,400);
  assert.equal((await call('guest','cancel',{id})).status,403);
  assert.equal((await call('jevica','list',{})).value.events[0].canCancel,true);
  assert.equal((await call('jevica','cancel',{id})).status,200);
  assert.equal((await call('guest','list',{})).value.events.length,0);
});
