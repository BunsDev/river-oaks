import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BELLA_BLOCK, HERMES_BLOCK, IPIC_BLOCK, facadeEdges, referencePlan, visibleRoofHeight } from '../src/reference-facades.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const building = id => world.buildings.find(item => item.id === id);

test('photographed frontages take over the Hermès, IPIC and Bella Rinova street faces', () => {
  const plan = referencePlan(world), names = [...plan.stores].map(id => world.stores.find(store => store.id === id).name).sort();
  assert.deepEqual(names, ['Amorino', 'Bella Rinova', 'Hermès', 'IPIC Theaters', 'MAD Houston', 'Van Cleef & Arpels']);
  const facing = id => plan.frontages.filter(frontage => frontage.building.id === id).map(frontage => `${frontage.edge.facing}:${frontage.full ? 'full' : 'upper'}`).sort();
  assert.deepEqual(facing(IPIC_BLOCK), ['north:upper', 'north:upper', 'south:upper', 'west:full']);
  assert.deepEqual(facing(BELLA_BLOCK), ['east:full', 'north:full', 'south:upper', 'west:upper']);
  assert.deepEqual(facing(HERMES_BLOCK), ['north:full', 'west:full']);
  // Cartier and Harry Winston keep the shared storefront kit.
  for (const name of ['Cartier', 'Harry Winston', 'Hopdoddy Burger Bar']) assert.ok(!plan.stores.has(world.stores.find(store => store.name === name).id), name);
});

test('the Hermès pavilion turns its corner and ends on the shared bay grid', () => {
  const plan = referencePlan(world), hermes = building(HERMES_BLOCK);
  for (const frontage of plan.frontages.filter(item => item.building === hermes)) {
    const { edge, lo, hi } = frontage;
    for (const end of [lo, hi]) assert.ok(Math.abs(end / edge.span - Math.round(end / edge.span)) < 1e-6, `${edge.facing} ends at ${end} on the ${edge.span} m bay grid`);
    assert.ok(lo === 0 || Math.abs(hi - edge.length) < 1e-9, 'the pavilion starts at the corner');
  }
  const main = plan.frontages.find(item => item.kind === 'hermes'), door = world.stores.find(store => store.name === 'Hermès');
  const along = (door.facade[0] - main.edge.a[0]) * main.edge.u[0] + (door.facade[1] - main.edge.a[1]) * main.edge.u[1];
  assert.ok(along > main.lo + 4 && along < main.hi - 4, 'the door opens inside the pavilion, clear of its piers');
});

test('mapped heights follow the photographs and the Hermès block steps down beside its pavilion', () => {
  assert.equal(building(IPIC_BLOCK).size[2], 18.5);
  assert.equal(building(BELLA_BLOCK).size[2], 10.6);
  assert.equal(building(HERMES_BLOCK).size[2], 14.5);
  assert.equal(visibleRoofHeight(world, building(HERMES_BLOCK)), 9.6);
  for (const id of [IPIC_BLOCK, BELLA_BLOCK]) assert.equal(visibleRoofHeight(world, building(id)), building(id).size[2]);
  for (const id of [HERMES_BLOCK, IPIC_BLOCK, BELLA_BLOCK]) assert.match(building(id).height_source, /reference photographs/);
});

test('facade edges share the renderer numbering and outward normals', () => {
  const edges = facadeEdges(building(IPIC_BLOCK)), west = edges.find(edge => edge.facing === 'west');
  assert.equal(west.index, 3);
  assert.ok(west.o[0] < -0.99, 'the IPIC west face looks west');
  assert.equal(edges.length, building(IPIC_BLOCK).ring.length - 1);
});

test('worlds without the photographed buildings are left to the shared kit', () => {
  const plan = referencePlan({ buildings: [{ ...building(IPIC_BLOCK), id: 'creator-hall' }], stores: [] });
  assert.equal(plan.spans.size, 0);
  assert.equal(plan.stores.size, 0);
});
