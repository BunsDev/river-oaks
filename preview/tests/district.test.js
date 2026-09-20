import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWalkingEnvironment, createWalkingState } from '../src/walking.js';
import { createCommunity } from '../src/community.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
test('every published district destination and encounter starts outside mapped buildings', () => {
  const environment = createWalkingEnvironment(world);
  assert.ok(world.stores.length >= 20);
  for (const store of world.stores) {
    assert.ok(environment.isFree(store.visit[0], -store.visit[1]), `${store.name} arrival intersects a building`);
    const state = createWalkingState(environment, store.visit);
    assert.ok(Math.hypot(state.position[0]-store.visit[0], state.position[2]+store.visit[1]) < 0.001, `${store.name} arrival needs an unmarked relocation`);
    assert.ok(world.buildings.some(building => building.id === store.building_id));
    assert.ok(store.facade.every(Number.isFinite));
  }
  for (const local of createCommunity(world).locals) assert.ok(environment.isFree(local.position[0], -local.position[1]), `${local.name} intersects a building`);
  const spawn = createWalkingState(environment);
  assert.ok(environment.isFree(spawn.position[0], spawn.position[2]));
});
test('district carries source attribution and explicitly distinguishes inferred facades from mapped positions', () => {
  assert.equal(world.provenance.license, 'ODbL-1.0');
  assert.match(world.provenance.source_sha256, /^[0-9a-f]{64}$/);
  assert.equal(new Set(world.stores.map(s => s.id)).size, world.stores.length);
  assert.ok(world.stores.every(store => store.location_basis.includes('unverified')));
  assert.ok(world.limitations.some(item => item.includes('not photographed replicas')));
  assert.equal(world.terrain.heights_m.length, world.terrain.width * world.terrain.height);
  assert.ok(world.terrain.heights_m.every(Number.isFinite));
});
