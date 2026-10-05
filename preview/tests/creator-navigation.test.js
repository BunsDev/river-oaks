import test from 'node:test';
import assert from 'node:assert/strict';
import { createResidentNavigation } from '../src/navigation.js';
import { createCommunity } from '../src/community.js';
import { createResidentLife,stepResidentLife } from '../src/resident-life.js';
import { objectCollider,newAssembly } from '../src/creator-object.js';

const world={scene:'district',bounds_m:[-20,-20,20,20],collisionPolygons:[],roads:[],
  communityLocations:[{id:'west',name:'West',position:[-5,0,0]}]};
const obstacle=(position=[0,0],up=.5)=>{
  const assembly=newAssembly();assembly.parts[0].position[1]=up;
  return objectCollider({kind:'object',assembly,position,ground:0,yaw:0});
};
const clearSegments=(nav,route,start,colliders)=>{
  assert.ok(route?.length,'reachable destination keeps a route');
  let previous=start;
  for(const point of route){
    assert.equal(nav.canTravel(previous,point),true);
    const steps=Math.max(1,Math.ceil(Math.hypot(point[0]-previous[0],point[1]-previous[1])/.02));
    for(let i=0;i<=steps;i++){
      const x=previous[0]+(point[0]-previous[0])*i/steps,north=previous[1]+(point[1]-previous[1])*i/steps;
      assert.equal(colliders.some(c=>c.contains(x,.9,-north,.35,.9)),false,'no path segment crosses confirmed geometry');
    }
    previous=point;
  }
};

test('navigation respects custom parts and refreshes cached grid links after edits and removal',()=>{
  const colliders=[obstacle()],nav=createResidentNavigation(world,{placedObjects:colliders});
  const start=[-5,0],end=[5,0];
  assert.equal(nav.canTravel(start,end),false);
  const first=nav.route(start,end);clearSegments(nav,first,start,colliders);
  // Put a second object on an already searched/cached detour, without covering the start or goal.
  const point=first.find(p=>Math.abs(p[0])<3)??first[0];
  colliders.push(obstacle(point));nav.invalidate();
  clearSegments(nav,nav.route(start,end),start,colliders);
  colliders.splice(0);nav.invalidate();
  assert.deepEqual(nav.route(start,end),[end],'removed geometry releases the direct path');
});

test('overhead assemblies and openings leave the standing route clear',()=>{
  const colliders=[obstacle([0,0],3)],nav=createResidentNavigation(world,{placedObjects:colliders});
  assert.equal(nav.canTravel([-5,0],[5,0]),true,'overhead geometry does not become a ground disk');
  clearSegments(nav,nav.route([-5,0],[5,0]),[-5,0],colliders);
});

test('a resident reroutes an existing stroll around a newly placed assembly without teleporting',()=>{
  const colliders=[],state=createCommunity(world),life=createResidentLife(world,state);
  const local=state.locals[0];
  Object.assign(local.life,{route:[[5,0]],destination:{id:'east',name:'East'},heading:Math.PI/2,waitUntil:Infinity});
  colliders.push(obstacle());life.navigation.setPlacedObjects(colliders);
  let arrived=false;
  for(let i=0;i<1800;i++){
    const before=[...local.position];stepResidentLife(life,1/60);
    assert.ok(Math.hypot(local.position[0]-before[0],local.position[1]-before[1])<.025,'continuous movement');
    assert.equal(colliders[0].contains(local.position[0],.9,-local.position[1],.35,.9),false,'resident clears the assembly');
    arrived ||= Math.hypot(local.position[0]-5,local.position[1])<.1;
  }
  assert.ok(arrived,'resident reaches the original destination before starting another stroll');
});

test('nearby route queries skip distant assemblies rather than testing every part set',()=>{
  let queries=0;
  const colliders=Array.from({length:48},(_,i)=>{
    const collider=obstacle([100+i*7,100]);
    return {...collider,contains(...args){queries++;return collider.contains(...args);}};
  });
  const nav=createResidentNavigation(world,{placedObjects:colliders});
  assert.equal(nav.canTravel([-5,0],[5,0]),true);
  assert.ok(queries<100,'collision work scales with nearby creations');
});

test('a multi-part opening stays traversable at negative bucket boundaries',()=>{
  const assembly=newAssembly();assembly.parts=[
    {...assembly.parts[0],size:[.2,3,.2],position:[-1.5,1.5,0]},
    {...assembly.parts[0],size:[.2,3,.2],position:[1.5,1.5,0]},
    {...assembly.parts[0],size:[3.2,.2,.2],position:[0,2.9,0]},
  ];
  const colliders=[objectCollider({kind:'object',assembly,position:[-4,-4],ground:0,yaw:0})];
  const nav=createResidentNavigation(world,{placedObjects:colliders});
  assert.equal(nav.canTravel([-4,-9],[-4,1]),true);
  clearSegments(nav,nav.route([-4,-9],[-4,1]),[-4,-9],colliders);
  assert.equal(nav.free([-5.5,-4]),false,'posts remain occupied across bucket boundaries');
});

test('cached dynamic edges retain thin-corner endpoint clearance',()=>{
  const assembly=newAssembly();assembly.parts[0].size=[.05,1,.05];
  const colliders=[objectCollider({kind:'object',assembly,position:[Math.hypot(.025,.025)+.35-.0003,.022],ground:0,yaw:Math.PI/4})];
  const nav=createResidentNavigation({...world,bounds_m:[-5,-5,5,5]},{placedObjects:colliders});
  assert.equal(nav.free([0,0]),true);assert.equal(nav.free([0,1]),true);
  assert.equal(nav.canTravel([0,0],[0,1]),false);
  clearSegments(nav,nav.route([0,0],[0,1]),[0,0],colliders);
});
