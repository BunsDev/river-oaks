import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storeRoomsFor } from '../src/store-rooms.js';
import { createCommunity, chooseCommunityScenario, snapshotForLocal } from '../src/community.js';
import { createResidentLife, stepResidentLife, residentPacket } from '../src/resident-life.js';
import { conversationLine } from '../src/personas.js';
import { storePersonId } from '../src/store-encounters.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const rooms = storeRoomsFor(world);
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
