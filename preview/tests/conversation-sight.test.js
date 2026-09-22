import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roomBlocksConversation } from '../src/conversation-sight.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { clearConversationLine, clearEncounterLine, indoorEncounterPosition } from '../src/encounter.js';
import { createStoreEncounters } from '../src/store-encounters.js';

test('a counter blocks legs but allows eye-level conversation, while tall shelving blocks the ray',()=>{
  const room={floor:5,toLocal:(x,y)=>[x,y],fixtures:[{kind:'counter',a:0,d:0,w:3,l:0.65}]};
  assert.equal(roomBlocksConversation(room,[0,-1,6.68],[0,1,6.55]),false);
  assert.equal(roomBlocksConversation(room,[0,-1,5.7],[0,1,5.7]),true);
  room.fixtures=[{kind:'shelves',a:0,d0:-1,d1:1}];
  assert.equal(roomBlocksConversation(room,[-1,0,6.68],[1,0,6.55]),true);
});
test('every indoor person has a clear, unoccupied conversation approach in their own room',()=>{
  const environment=createWalkingEnvironment(JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url))));
  const locals=createStoreEncounters(environment.rooms);
  assert.equal(locals.length,169);
  for(const local of locals) {
    const room=environment.rooms.find(room=>room.storeId===local.storeId);
    const visitor=[...room.toWorld(0,0.8),room.floor+1.68];
    const position=indoorEncounterPosition(environment,local,visitor,locals);
    assert.ok(position,`${local.id}: reachable`);
    assert.equal(environment.roomAt(position[0],-position[1])?.storeId,local.storeId);
    assert.equal(environment.isFree(position[0],-position[1]),true);
    const eye=[position[0],position[1],room.floor+1.68];
    assert.equal(clearConversationLine(environment,eye,local.position,local.eyeHeight),true);
    assert.ok(Math.hypot(position[0]-local.position[0],position[1]-local.position[1])<=4.5);
    assert.equal(indoorEncounterPosition(environment,local,eye,locals),eye,'already within range stays put');
  }
});
test('actual district counter staff have eye-level access without opening collision or adjacent rooms',()=>{
  const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url))),environment=createWalkingEnvironment(world);
  let acrossCounters=0;
  for(const room of environment.rooms)for(const counter of room.fixtures.filter(f=>f.kind==='counter')) {
    const from=[...room.toWorld(counter.a,counter.d-0.85),room.floor+1.68],target=[...room.toWorld(counter.a,counter.d+0.7),room.floor];
    if(!environment.isFree(from[0],-from[1])||environment.roomAt(target[0],-target[1])?.storeId!==room.storeId)continue;
    assert.equal(clearEncounterLine(environment,from,target),false,'counter still blocks walking');
    assert.equal(clearConversationLine(environment,from,target),true,room.name);
    acrossCounters++;
  }
  assert.ok(acrossCounters>=15,`covered ${acrossCounters} counters`);
  const a=environment.rooms[0],b=environment.rooms[1];
  assert.equal(clearConversationLine(environment,[...a.toWorld(0,1),a.floor+1.68],[...b.toWorld(0,1),b.floor]),false);
});
