import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRegionPackage, editableRegionFromWorld } from '../region-package.js';
import { createSharedWorld, migrateWorldCheckpoint } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { createStoreEncounters } from '../../preview/src/store-encounters.js';

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
    {...sample,buildings:[{...sample.buildings[0],interior:{name:'Bad',category:'art',entrance:'roof'}}]},
    {...sample,buildings:[{...sample.buildings[0],size:[5,16,8],interior:{name:'Too Small',category:'art',entrance:'south'}}]},
    {...sample,buildings:[{...sample.buildings[0],kind:'parking',interior:{name:'No Room',category:'art',entrance:'south'}}]},
    {...sample,buildings:sample.buildings.map((building,index)=>index===2?{...building,interior:{name:'Wrong Kind',category:'art',entrance:'south'}}:building)},
    {...sample,buildings:[{...sample.buildings[0],interior:{name:'Wrong Kind',category:'home',entrance:'south'}}]},
    {...sample,buildings:[{...sample.buildings[0],interior:{name:'Wrong Access',category:'art',entrance:'south',access:'owner'}}]},
    {...sample,buildings:sample.buildings.map((building,index)=>index===2?{...building,interior:{name:'Wrong Access',category:'home',entrance:'south',access:'friends'}}:building)},
    {...sample,trees:[{...sample.trees[0],id:sample.roads[0].id}]},
    {...sample,places:[]},
    {...sample,script:'alert(1)'},
  ];
  for(const region of invalid)assert.throws(()=>compileRegionPackage(region,'Moon Garden'));
  const venues=Array.from({length:9},(_,index)=>({id:`venue-${index}`,center:[-60+index%3*60,-60+Math.floor(index/3)*60],
    size:[12,12,8],yaw_deg:0,kind:'retail',interior:{name:`Venue ${index}`,category:'art',entrance:'south'}}));
  assert.throws(()=>compileRegionPackage({...sample,buildings:venues},'Moon Garden'));
});

test('an authored venue becomes an enterable shared interior and survives an editor round trip',()=>{
  const interior={name:'Moon Pavilion Gallery',category:'art',entrance:'south'};
  const region={...sample,buildings:sample.buildings.map((building,index)=>index?building:{...building,interior})};
  const world=compileRegionPackage(region,'Moon Garden');
  assert.equal(world.stores.length,1);
  assert.equal(world.stores[0].name,interior.name);
  const environment=createWalkingEnvironment(world);
  assert.equal(environment.rooms.length,1);
  assert.equal(environment.rooms[0].storeId,world.stores[0].id);
  assert.deepEqual(editableRegionFromWorld(world).buildings[0].interior,interior);
  let time=1000;
  const room=createSharedWorld(world,{worldId:'moon-garden',now:()=>time,isAdmin:id=>id==='jevica'});
  assert.equal(room.join({userId:'guest',name:'Guest'}).ok,true);
  const entered=room.command('guest',{type:'travel',storeId:world.stores[0].id,mode:'enter'});
  assert.equal(entered.ok,true);
  assert.equal(environment.roomAt(entered.player.position[0],-entered.player.position[1])?.storeId,world.stores[0].id);
  assert.equal(entered.player.canBuild,false);
  time+=1000;
  const left=room.command('guest',{type:'travel',storeId:world.stores[0].id,mode:'leave'});
  assert.equal(left.ok,true);
  assert.equal(environment.roomAt(left.player.position[0],-left.player.position[1]),null);
});

test('an authored home becomes a furnished social room without granting guests build or wish powers',()=>{
  const interior={name:'Moon House',category:'home',entrance:'south'};
  const region={...sample,buildings:sample.buildings.map((building,index)=>index===2?{...building,interior}:building)};
  const world=compileRegionPackage(region,'Moon Garden');
  const compact={...region,buildings:region.buildings.map((building,index)=>index===2?{...building,size:[6,6,8]}:building)};
  assert.equal(createWalkingEnvironment(compileRegionPackage(compact,'Small Home')).rooms.length,1);
  assert.equal(world.stores.length,1);
  assert.equal(world.stores[0].category,'home');
  const environment=createWalkingEnvironment(world),room=environment.rooms[0];
  assert.equal(room.theme,'home');
  assert.ok(room.fixtures.some(item=>item.kind==='sofa'));
  assert.ok(room.fixtures.some(item=>item.kind==='bookshelf'));
  assert.ok(createStoreEncounters(environment.rooms,{sharedPopulation:true}).some(person=>person.role==='Home resident'));
  assert.deepEqual(editableRegionFromWorld(world).buildings[2].interior,interior);
  let time=1000;
  const shared=createSharedWorld(world,{worldId:'moon-garden',now:()=>time,isAdmin:id=>id==='jevica'});
  assert.equal(shared.join({userId:'guest',name:'Guest'}).ok,true);
  assert.ok(shared.snapshot().locals.some(local=>local.storeId===world.stores[0].id));
  const entered=shared.command('guest',{type:'travel',storeId:world.stores[0].id,mode:'enter'});
  assert.equal(entered.ok,true);
  assert.equal(environment.roomAt(entered.player.position[0],-entered.player.position[1])?.storeId,world.stores[0].id);
  assert.equal(entered.player.canBuild,false);
  assert.equal(entered.player.canGrantWishes,false);
  assert.equal(shared.command('guest',{type:'build',action:'remove',id:'build-1'}).error,'admin_only');
  assert.equal(shared.command('guest',{type:'wish',localId:'local-00',kind:'dragon'}).error,'admin_only');
  time+=1000;
  const left=shared.command('guest',{type:'travel',storeId:world.stores[0].id,mode:'leave'});
  assert.equal(left.ok,true);
  assert.equal(environment.roomAt(left.player.position[0],-left.player.position[1]),null);
});

test('Jevica-only homes block guest travel and walking while preserving public homes',()=>{
  const interior={name:'Moon House',category:'home',entrance:'south',access:'owner'};
  const region={...sample,buildings:sample.buildings.map((building,index)=>index===2?{...building,interior}:building)};
  const world=compileRegionPackage(region,'Moon Garden'),store=world.stores[0];
  assert.equal(store.access,'owner');
  assert.deepEqual(editableRegionFromWorld(world).buildings[2].interior,interior);
  const environment=createWalkingEnvironment(world),room=environment.rooms[0];
  let time=1000;
  const shared=createSharedWorld(world,{worldId:'moon-garden',now:()=>time,isAdmin:id=>id==='jevica'});
  shared.join({userId:'guest',name:'Guest'});
  shared.join({userId:'jevica',name:'Jevica'});
  const local=shared.snapshot().locals.find(person=>person.storeId===store.id);
  assert.ok(local);
  assert.equal(shared.command('guest',{type:'travel',localId:local.id}).error,'private_home');
  assert.equal(shared.command('guest',{type:'travel',storeId:store.id,mode:'enter'}).error,'private_home');
  assert.equal(shared.command('guest',{type:'travel',storeId:store.id,mode:'arrive'}).ok,true);
  const outside=shared.snapshot().players.find(player=>player.id==='guest').position;
  const [east,north]=room.toWorld(0,0.5);
  time+=1000;
  const crossed=shared.command('guest',{type:'pose',position:[east,north,environment.groundAt(east,-north)],yaw:0,altitude:0});
  assert.equal(crossed.error,'private_home');
  assert.deepEqual(shared.snapshot().players.find(player=>player.id==='guest').position,outside);
  assert.equal(shared.command('jevica',{type:'travel',storeId:store.id,mode:'enter'}).ok,true);
  const publicRegion={...region,buildings:region.buildings.map((building,index)=>index===2?{...building,interior:{...interior,access:'public'}}:building)};
  const publicWorld=compileRegionPackage(publicRegion,'Public Moon Garden');
  assert.equal(publicWorld.stores[0].access,undefined);
  const publicShared=createSharedWorld(publicWorld,{worldId:'public-garden',isAdmin:()=>false});
  publicShared.join({userId:'guest',name:'Guest'});
  assert.equal(publicShared.command('guest',{type:'travel',storeId:publicWorld.stores[0].id,mode:'enter'}).ok,true);
});

test('a live region revision can add and later remove an authored venue',()=>{
  const before=compileRegionPackage(sample,'Moon Garden');
  const region={...sample,buildings:sample.buildings.map((building,index)=>index?building:{...building,
    interior:{name:'Moon Gallery',category:'art',entrance:'south'}})};
  const after=compileRegionPackage(region,'Moon Garden');
  const oldRoom=createSharedWorld(before,{worldId:'moon-garden'});
  assert.equal(oldRoom.join({userId:'guest',name:'Guest'}).ok,true);
  const added=migrateWorldCheckpoint({fromData:before,toData:after,checkpoint:oldRoom.checkpoint(),worldId:'moon-garden'});
  assert.equal(added.ok,true);
  assert.equal(added.disconnectedPlayers,1);
  const withVenue=createSharedWorld(after,{worldId:'moon-garden'});
  assert.equal(withVenue.restore(added.checkpoint).ok,true);
  assert.ok(withVenue.snapshot().locals.some(local=>local.storeId===after.stores[0].id));
  const removed=migrateWorldCheckpoint({fromData:after,toData:before,checkpoint:withVenue.checkpoint(),worldId:'moon-garden'});
  assert.equal(removed.ok,true);
  const withoutVenue=createSharedWorld(before,{worldId:'moon-garden'});
  assert.equal(withoutVenue.restore(removed.checkpoint).ok,true);
  assert.equal(withoutVenue.snapshot().locals.some(local=>local.indoor),false);
});
