import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BELLA_BLOCK, HERMES_BLOCK, IPIC_BLOCK, facadeEdges, referencePlan, visibleRoofHeight } from '../src/reference-facades.js';
import { DIOR_BLOCK, EQUINOX_BLOCK, ETRO_BLOCK, RESIDENCES_NORTH, RESIDENCES_SOUTH } from '../src/reference-blocks.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const building = id => world.buildings.find(item => item.id === id);

const facing = (plan, id) => plan.frontages.filter(frontage => frontage.building.id === id).map(frontage => `${frontage.edge.facing}:${frontage.full ? 'full' : 'upper'}`).sort();

test('photographed frontages take over the street faces they were photographed from', () => {
  const plan = referencePlan(world), names = [...plan.stores].map(id => world.stores.find(store => store.id === id).name).sort();
  assert.deepEqual(names, ['Alice + Olivia', 'Amorino', 'Baccarat', 'Bella Rinova', 'Brunello Cucinelli', 'Cartier', 'Dior', 'Diptyque', 'Dolce & Gabbana', 'Equinox', 'Hermès', 'Hopdoddy Burger Bar',
    'IPIC Theaters', 'Jo Malone London', 'Kiton', 'Laura Rathe Fine Art', 'Le Colonial', 'MAD Houston', 'Moreau', 'Oliver Peoples', 'Saint Bernard', 'Steak 48', 'Toulouse', 'Van Cleef & Arpels', 'Veronica Beard', 'Vilebrequin', 'Vince', 'Zadig & Voltaire', 'de Boulle']);
  assert.deepEqual(facing(plan, IPIC_BLOCK), ['north:upper', 'north:upper', 'south:full', 'south:upper', 'west:full', 'west:full']);
  assert.deepEqual(facing(plan, BELLA_BLOCK), ['east:full', 'north:full', 'south:full', 'west:upper']);
  assert.deepEqual(facing(plan, HERMES_BLOCK), ['north:full', 'west:full']);
  assert.equal(plan.frontages.find(frontage => frontage.building.id === BELLA_BLOCK && frontage.edge.facing === 'south').kind, 'hopdoddy');
  // Unphotographed storefronts keep the shared storefront kit.
  for (const name of ['Harry Winston']) assert.ok(!plan.stores.has(world.stores.find(store => store.name === name).id), name);
});

test('the Equinox, Etro and Dior blocks are rebuilt on every face', () => {
  const plan = referencePlan(world);
  for (const id of [EQUINOX_BLOCK, ETRO_BLOCK, DIOR_BLOCK]) assert.deepEqual(facing(plan, id), ['east:full', 'north:full', 'south:full', 'west:full'], id);
  const kinds = id => Object.fromEntries(plan.frontages.filter(frontage => frontage.building.id === id).map(frontage => [frontage.edge.facing, frontage.kind]));
  assert.deepEqual(kinds(ETRO_BLOCK), { north: 'plaza', east: 'etro', south: 'etro', west: 'etro' });
  assert.deepEqual(kinds(DIOR_BLOCK), { south: 'dior', east: 'dior-row', north: 'dior-row', west: 'toulouse' });
});

test('the residences rebuild their photographed faces whole and clad every other storey', () => {
  const plan = referencePlan(world);
  const kinds = id => Object.fromEntries(plan.frontages.filter(frontage => frontage.building.id === id).map(frontage => [frontage.edge.index, frontage.kind]));
  const south = kinds(RESIDENCES_SOUTH), north = kinds(RESIDENCES_NORTH);
  assert.deepEqual([south[7], south[9], south[10], south[11], south[12]], ['steak-row', 'kettering', 'louvre-podium', 'boutique-row', 'bari-lawn']);
  assert.deepEqual([north[4], north[5], north[6], north[7]], ['dolce', 'tile-row', 'veronica', 'ojo']);
  // Every edge is covered: the rest carry residential storeys over the shared shop kit.
  assert.equal(Object.keys(south).length, facadeEdges(building(RESIDENCES_SOUTH)).length);
  assert.equal(Object.keys(north).length, facadeEdges(building(RESIDENCES_NORTH)).length);
  for (const frontage of plan.frontages.filter(item => item.kind === 'residence')) assert.equal(frontage.full, false);
  // Steak 48's Westheimer face is photographed, so its own shopfront and sign come from the rebuild.
  const steak = world.stores.find(store => store.name === 'Steak 48');
  assert.equal(steak.building_id, RESIDENCES_SOUTH);
  assert.ok(plan.stores.has(steak.id));
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

test('mapped heights follow the photographs; the Hermès, Etro and Dior blocks step down beside their tall ends', () => {
  const heights = { [IPIC_BLOCK]: 18.5, [BELLA_BLOCK]: 10.6, [HERMES_BLOCK]: 14.5, [EQUINOX_BLOCK]: 28, [ETRO_BLOCK]: 9.2, [DIOR_BLOCK]: 13.5, [RESIDENCES_SOUTH]: 23.5, [RESIDENCES_NORTH]: 23.5 };
  for (const [id, height] of Object.entries(heights)) {
    assert.equal(building(id).size[2], height, id);
    assert.match(building(id).height_source, /reference photographs/, id);
  }
  assert.equal(visibleRoofHeight(world, building(HERMES_BLOCK)), 9.6);
  assert.equal(visibleRoofHeight(world, building(ETRO_BLOCK)), 8.2);
  assert.equal(visibleRoofHeight(world, building(DIOR_BLOCK)), 9.4);
  for (const id of [IPIC_BLOCK, BELLA_BLOCK, EQUINOX_BLOCK, RESIDENCES_SOUTH, RESIDENCES_NORTH]) assert.equal(visibleRoofHeight(world, building(id)), building(id).size[2]);
});

test('the build script carries the same photographed heights as the district data', () => {
  const script = readFileSync(new URL('../../scripts/build_district.py', import.meta.url), 'utf8');
  const table = Object.fromEntries([...script.match(/REFERENCE_HEIGHTS = \{([^}]*)\}/)[1].matchAll(/"(\d+)": ([\d.]+)/g)].map(([, id, height]) => [`osm-way-${id}`, Number(height)]));
  for (const [id, height] of Object.entries(table)) assert.equal(building(id).size[2], height, id);
  assert.equal(Object.keys(table).length, 8);
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


test('Cartier replaces two contiguous corner spans while retaining its mapped doorway', () => {
  const plan = referencePlan(world), cartier = world.stores.find(store => store.name === 'Cartier');
  const fronts = plan.frontages.filter(frontage => frontage.kind === 'cartier');
  assert.equal(fronts.length, 2);
  assert.ok(plan.stores.has(cartier.id));
  assert.deepEqual(fronts.map(f => f.edge.facing).sort(), ['south', 'west']);
  assert.equal(fronts[0].corner, fronts[1].corner);
  for (const front of fronts) {
    assert.ok(front.full && front.hi - front.lo >= 18 && front.hi - front.lo <= 24);
    const spans = plan.spans.get(`${front.building.id}:${front.edge.index}`).toSorted((a,b) => a.lo - b.lo);
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i].lo >= spans[i-1].hi, 'no duplicate facade surfaces');
  }
});
