import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { createSharedWorld } from '../../server/world.js';
import { createResidentNavigation } from '../src/navigation.js';
import { createWalkingEnvironment,createWalkingState,steerWalkingToward,stepWalking } from '../src/walking.js';
import { arrivalPedestrianRoute } from '../audit/baseline-580-route.js';

test('both real arrivals physically exit roadway and reach the gateway through normal pedestrian routes',async()=>{
  const world=await loadDistrictData({districtRevision:'east-garden-commons-market-1'}),nav=createResidentNavigation(world),env=createWalkingEnvironment(world);
  const town=createSharedWorld(world);town.join({userId:'owner',name:'Owner'});town.join({userId:'alice',name:'Alice'});
  for(const player of town.snapshot().players) {
    const start=player.position.slice(0,2),gate=[-2685,-1334],route=arrivalPedestrianRoute(nav,start,gate);
    assert.ok(route?.length,`Missing route for ${player.id}`);
    assert.ok(nav.canTravel(start,route[0]),'arrival escape is physically clear');
    assert.notEqual(nav.pedestrian.classify(route[0]),'road');
    for(let i=1;i<route.length;i++)assert.ok(nav.canWalk(route[i-1],route[i]),'normal pedestrian rules remain enforced');
    const walker=createWalkingState(env,start);
    for(const target of [...route,...[...route].reverse(),start]) {
      let steps=0;
      while(Math.hypot(walker.position[0]-target[0],-walker.position[2]-target[1])>.15){
        assert.ok(++steps<10800,`Controller stalled for ${player.id}`);
        stepWalking(walker,env,steerWalkingToward(walker,target,1/60),1/60);
      }
    }
    assert.ok(walker.distance>200,'both legs really moved through the District');
    assert.ok(Math.hypot(walker.position[0]-start[0],-walker.position[2]-start[1])<=.15);
  }
});

test('arrival route refuses inaccessible reserved land rather than granting roadway access',async()=>{
  const world=await loadDistrictData({districtRevision:'east-garden-commons-market-1'}),nav=createResidentNavigation(world);
  assert.equal(arrivalPedestrianRoute(nav,world.walkSpawn.slice(0,2),[world.eastGardenCommons.edge+20,-1280]),null);
});
