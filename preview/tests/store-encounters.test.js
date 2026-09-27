import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storeRoomsFor } from '../src/store-rooms.js';
import { createCommunity, chooseCommunityScenario, snapshotForLocal } from '../src/community.js';
import { createResidentLife, stepResidentLife, residentPacket } from '../src/resident-life.js';
import { conversationLine } from '../src/personas.js';
import { storePersonId, createStoreEncounters } from '../src/store-encounters.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const rooms = storeRoomsFor(world);
test('occupations follow staff order and seated guests retain their venue context',()=>{
  const room={index:0,storeId:'salon',name:'Salon',theme:'salon',floor:0,toWorld:(x,y)=>[x,y],people:[{role:'guest',pose:'seated',a:0,d:0},{role:'staff',a:1,d:1},{role:'guest',pose:'seated',a:2,d:2},{role:'staff',a:3,d:3},{role:'staff',a:4,d:4}]};
  assert.deepEqual(createStoreEncounters([room]).map(local=>local.role),['Salon client','Hair stylist','Salon client','Colorist','Salon host']);
  assert.deepEqual(createStoreEncounters([{...room,theme:'dining'}]).filter(local=>local.role!=='Dining guest').map(local=>local.role),['Host','Server','Bartender']);
});
test('every real boutique person has a distinct conversational identity and a matching rendered ID', () => {
  const state = createCommunity(world, rooms);
  assert.equal(new Set(state.locals.map(person => person.id)).size, state.locals.length);
  for (const room of rooms) for (const [index, spot] of room.people.entries()) {
    const local = state.locals.find(person => person.id === storePersonId(room, index));
    if (spot.role === 'mannequin') { assert.equal(local, undefined); continue; }
    assert.ok(local);
    assert.deepEqual(local.position, [...room.toWorld(spot.a, spot.d), room.floor]);
    assert.ok(conversationLine(local, 'greeting').includes(room.name));
    assert.match(conversationLine(local, 'greeting'), /Welcome back/);
    assert.ok(snapshotForLocal(state, local.id, 'conversation', 1).agents[0].role_context.includes(local.role));
  }
  assert.ok(new Set(state.locals.filter(local => local.indoor).map(local => local.role)).size >= 18);
});
test('indoor encounters stay at their stations and do not alter the outdoor support scenario or batch size', () => {
  const state = createCommunity(world, rooms), original = createCommunity(world);
  const life = createResidentLife(world, state, () => null);
  const positions = state.locals.filter(local => local.indoor).map(local => [...local.position]);
  for (const scenario of ['heatwave', 'storm', 'delivery']) {
    chooseCommunityScenario(state, scenario); chooseCommunityScenario(original, scenario);
    assert.deepEqual(state.locals.filter(local => local.priority).map(local => local.id), original.locals.filter(local => local.priority).map(local => local.id));
    for (let frame = 0; frame < 120; frame++) stepResidentLife(life, 1/60, { storm: scenario === 'storm' });
    assert.deepEqual(state.locals.filter(local => local.indoor).map(local => local.position), positions);
    assert.equal(residentPacket(life, 1).agents.length, 24);
  }
});

test('workers explain their occupation and remember returning visitors at their workplace',()=>{
  const locals=createStoreEncounters(rooms),stories=new Map();
  for(const room of rooms)for(const [index,spot] of room.people.entries()) {
    if(spot.role!=='staff')continue;
    const local=locals.find(person=>person.id===storePersonId(room,index));
    assert.ok(local.persona.work,`${local.role} has a work profile`);
    const about=conversationLine(local,'about'),story=conversationLine(local,'story');
    assert.ok(about.includes(room.name));
    assert.ok(about.includes(local.role.toLowerCase()));
    assert.notEqual(story,about);
    stories.set(local.role,story);
    conversationLine(local,'greeting');
    const returning=conversationLine(local,'greeting');
    assert.match(returning,/Welcome back/);
    assert.ok(returning.includes(room.name)&&returning.includes(local.role.toLowerCase()));
    assert.doesNotMatch(returning,/enjoying the afternoon|How is your walk/);
  }
  assert.equal(new Set(stories.values()).size,stories.size,'occupations have distinct work details');
  assert.match(stories.get('Tailor'),/seam|fit|fabric/i);
  assert.match(stories.get('Projection technician'),/sound|screen|projection/i);
  assert.match(stories.get('Perfumer'),/scent|note|fragrance/i);
  const guest=locals.find(local=>local.role==='Dining guest');
  assert.equal(guest.persona.work,undefined,'a dining guest is not presented as staff');
});
