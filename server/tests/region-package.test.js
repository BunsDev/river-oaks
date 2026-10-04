import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRegionPackage } from '../region-package.js';
import { createSharedWorld } from '../world.js';

const sample=JSON.parse(readFileSync(new URL('../../preview/public/data/sample-region.json',import.meta.url)));

test('a creator package becomes a distinct walkable and populated shared region',()=>{
  const world=compileRegionPackage(sample,'Moon Garden');
  assert.equal(world.provenance.kind,'creator');
  assert.equal(world.stores.length,0);
  assert.equal(world.buildings.length,4);
  assert.equal(world.communityLocations.length,8);
  const room=createSharedWorld(world,{worldId:'moon-garden',isAdmin:id=>id==='jevica'});
  assert.equal(room.snapshot().locals.length,8);
  assert.equal(room.join({userId:'guest',name:'Guest'}).ok,true);
  assert.equal(room.snapshot().players[0].canBuild,false);
});

test('creator packages reject unsafe geometry, identifiers, and unbounded input',()=>{
  const invalid=[
    {...sample,bounds_m:[-96,-96,2000,96]},
    {...sample,spawn:[-35,-34]},
    {...sample,roads:[{...sample.roads[0],points:[[0,0],[10000,0]]}]},
    {...sample,terrain:{...sample.terrain,heights_m:[0]}},
    {...sample,buildings:[{...sample.buildings[0],size:[20,16,4]}]},
    {...sample,trees:[{...sample.trees[0],id:sample.roads[0].id}]},
    {...sample,places:[]},
    {...sample,script:'alert(1)'},
  ];
  for(const region of invalid)assert.throws(()=>compileRegionPackage(region,'Moon Garden'));
});
