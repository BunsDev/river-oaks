import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCommunity } from '../src/community.js';
import { storeRoomsFor } from '../src/store-rooms.js';
import { includeSharedStorePerson, sharedRoomSummary } from '../src/shared-population.js';
import { storePersonId } from '../src/store-encounters.js';

const district=JSON.parse(await readFile(new URL('../public/data/district.json',import.meta.url),'utf8'));

test('multiplayer presentation keeps building residents and omits outdoor and vehicle encounters',()=>{
  const rooms=storeRoomsFor(district);
  const shared=createCommunity(district,rooms,{sharedPopulation:true,outdoor:false});
  const cast=createCommunity(district,rooms,{carriage:false,sharedPopulation:true});
  assert.deepEqual(shared.locals.map(local=>local.id),cast.locals.filter(local=>local.indoor).map(local=>local.id));
  assert.equal(shared.locals.length,74);
  assert.ok(shared.locals.every(local=>local.indoor&&!local.vehicleRole));
});

test('shared district removes about half its NPCs while retaining outdoor scenarios and a shop host',()=>{
  const rooms=storeRoomsFor(district);
  const solo=createCommunity(district,rooms,{carriage:false});
  const shared=createCommunity(district,rooms,{carriage:false,sharedPopulation:true});
  assert.equal(solo.locals.length,193);
  assert.equal(shared.locals.length,98);
  assert.equal(shared.locals.filter(local=>!local.indoor).length,24);
  assert.ok(1-shared.locals.length/solo.locals.length>=.4 && 1-shared.locals.length/solo.locals.length<=.6);
  const active=new Set(shared.locals.map(local=>local.id));
  for(const room of rooms){
    const included=room.people.map((spot,index)=>({spot,index})).filter(({spot,index})=>includeSharedStorePerson(room,spot,index));
    const summary=sharedRoomSummary(room);
    assert.equal(summary.staff,1,room.name);
    assert.equal(summary.staff,included.filter(({spot})=>spot.role==='staff').length);
    assert.equal(summary.guests,included.filter(({spot})=>spot.role==='guest').length);
    assert.equal(summary.mannequins,included.filter(({spot})=>spot.role==='mannequin').length);
    for(const {spot,index} of room.people.map((spot,index)=>({spot,index}))){
      if(spot.role==='mannequin')continue;
      assert.equal(active.has(storePersonId(room,index)),includeSharedStorePerson(room,spot,index),`${room.name} person ${index}`);
    }
  }
});
