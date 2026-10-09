import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { treeSupports } from '../src/tree-placements.js';
import { matureTreePlacements } from '../src/landscape-models.js';
import { createResidentNavigation } from '../src/navigation.js';
import { clearOfRoads } from '../src/street-fixtures.js';
const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
world.vegetation = JSON.parse(readFileSync(new URL('../public/data/district-vegetation.json', import.meta.url)));

test('Hopdoddy photo placements share clear pavement stems with rendering and navigation', () => {
  const original = JSON.stringify(world.vegetation);
  const supports = treeSupports(world), placements = matureTreePlacements(world);
  const corrected = supports.filter(tree => tree.referencePlacement && tree.id.startsWith('hopdoddy'));
  assert.equal(corrected.length, 3);
  assert.equal(supports.length, world.vegetation.branch_supports.length - 2);
  const navigation = createResidentNavigation(world);
  for (const tree of corrected) {
    const [x, north] = tree.position;
    assert.ok(clearOfRoads(world, x, -north, .35, { vehiclesOnly: true }), tree.id);
    assert.equal(navigation.free([x, north]), false, 'navigation blocks the corrected trunk');
    assert.ok(navigation.free([x, north + 1.3]), 'pavement behind trunk remains traversable');
    assert.ok(placements.some(item => item.position[0] === x && item.position[2] === -north), 'rendered stem follows correction');
    assert.ok(world.stores.every(store => Math.hypot(x - store.facade[0], north - store.facade[1]) > 2), 'door landing stays clear');
  }
  assert.equal(JSON.stringify(world.vegetation), original, 'source measurements remain untouched');
  assert.equal(treeSupports(world), supports, 'shared selector reuses its result');
});


test('Winston references keep the right-hand stem and remove the duplicate foreground interpretation',()=>{
 const before=JSON.stringify(world.vegetation),supports=treeSupports(world);
 const tree=supports.find(item=>item.id==='winston-south');
 assert.ok(tree);assert.deepEqual(tree.position,[-2761,-1365]);
 assert.equal(tree.height_m,12);assert.equal(tree.radius_m,2.6);
 assert.ok(!supports.some(item=>item.position[0]===-2761 && item.position[1]===-1355));
 const nav=createResidentNavigation(world);assert.equal(nav.free(tree.position),false);
 assert.equal(JSON.stringify(world.vegetation),before);
});
