import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createResidentNavigation} from '../src/navigation.js';
import {createWalkingEnvironment} from '../src/walking.js';
import {carriageContains} from '../src/carriage-parking.js';
import {companionSlot,createCompanionBody,stepCompanion} from '../src/prince-companion.js';
import {storefrontSpot} from '../src/arrival.js';
const routes=await import('../src/companion-navigation.js').catch(()=>({}));
const empty={scene:'district',bounds_m:[-30,-30,30,30],collisionPolygons:[]};

test('a local trailing companion finds a reachable side when a storefront blocks every rear slot',()=>{
  const world=JSON.parse(fs.readFileSync('preview/public/data/district.json'));
  world.vegetation=JSON.parse(fs.readFileSync('preview/public/data/district-vegetation.json'));
  const environment=createWalkingEnvironment(world),nav=routes.createCompanionNavigation(world);
  const arrival=storefrontSpot(world,world.stores.find(store=>store.name==='Dior'),'arrive',{
    isFree:(x,z)=>environment.isFree(x,z)&&!environment.roomAt(x,z),
  });
  const player=[arrival[0],-arrival[1]],body=createCompanionBody([player[0],player[1]+5]);
  const free=(x,z)=>environment.isFree(x,z)&&nav.canTravel([player[0],-player[1]],[x,-z]);
  const slot=companionSlot(player,0,'trail',free);
  assert.ok(slot,'The real Dior entrance leaves a clear side even though every rear slot is blocked');
  assert.ok(free(...slot.point),'The fallback must stay reachable without crossing the facade');
  for(let frame=0;frame<600;frame++) {
    const before=[...body.position];
    stepCompanion(body,slot.point,environment,1/60,{player});
    assert.ok(Math.hypot(body.position[0]-before[0],body.position[1]-before[1])<.08,'Approach stays physical');
  }
  assert.ok(Math.hypot(body.position[0]-player[0],body.position[1]-player[1])<2,'Local following reaches conversation distance');
});

test('the route follower guides physical steps around a wall without relocation',async()=>{
  assert.equal(typeof routes.createCompanionRouteFollower,'function');
  const world={...empty,collisionPolygons:[[[-1,-5],[1,-5],[1,5],[-1,5]]]},nav=routes.createCompanionNavigation(world),env=createWalkingEnvironment(world);
  const follower=routes.createCompanionRouteFollower(nav,{route:async(a,b)=>nav.route(a,b)}),body=createCompanionBody([-8,0]);
  for(let i=0;i<1000;i++) {
    const start=[...body.position],target=follower.update(body.position,[8,0],1/60);
    stepCompanion(body,target,env,1/60);await Promise.resolve();
    assert.ok(nav.canTravel([start[0],-start[1]],[body.position[0],-body.position[1]]));
    assert.ok(Math.hypot(body.position[0]-start[0],body.position[1]-start[1])<.06);
  }
  assert.ok(Math.hypot(body.position[0]-8,body.position[1])<.3);
});

test('reset invalidates pending waypoint replies and unreachable targets never relocate the body',async()=>{
  assert.equal(typeof routes.createCompanionRouteFollower,'function');
  const nav=routes.createCompanionNavigation({...empty,collisionPolygons:[[[-1,-30],[1,-30],[1,30],[-1,30]]]}),body=createCompanionBody([-8,0]);
  let finish;const follower=routes.createCompanionRouteFollower(nav,{route:()=>new Promise(done=>{finish=done;})});
  assert.equal(follower.update(body.position,[8,0],1/60),null);await Promise.resolve();
  follower.reset();finish([[20,20]]);await Promise.resolve();await Promise.resolve();
  assert.equal(follower.update(body.position,null,1/60),null);assert.deepEqual(body.position,[-8,0]);
});
test('companion routes enter and leave shipped shops through doors and around their furniture',()=>{
  assert.equal(typeof routes.createCompanionNavigation,'function','Companion needs bidirectional interior routes');
  const world=JSON.parse(fs.readFileSync('preview/public/data/district.json'));
  const nav=routes.createCompanionNavigation(world),reference=createResidentNavigation(world),rooms=createWalkingEnvironment(world).rooms;
  let checked=0;
  for(const room of rooms) {
    const outside=room.toWorld(0,-2);
    // Some authored staff stations are enclosed behind display cases; a
    // visitor cannot walk there either. Exercise reachable shopping aisles.
    const inside=room.people.find(p=>reference.route(room.toWorld(p.a,p.d),outside));
    if(!inside||!nav.free(outside))continue;
    const end=room.toWorld(inside.a,inside.d);
    for(const [from,to]of [[outside,end],[end,outside]]) {
      const route=nav.route(from,to);assert.ok(route?.length,`${room.name} needs a route`);
      let previous=from;for(const point of route){assert.ok(nav.canTravel(previous,point),`${room.name} crosses a wall or display`);previous=point;}
      assert.deepEqual(route.at(-1),to);
    }
    checked++;
  }
  assert.ok(checked>=20,`Only ${checked} shop doors tested`);
});

test('outdoor companion routing includes the parked coach and unicorn team footprint',()=>{
  assert.equal(typeof routes.createCompanionNavigation,'function');
  const placement={position:[0,0,0],yaw:.4,scale:.9,team:true};
  const nav=routes.createCompanionNavigation(empty,{placement});
  const start=[-12,-5],end=[10,5],route=nav.route(start,end);
  assert.ok(route);let previous=start;
  for(const point of route) {
    assert.ok(nav.canTravel(previous,point));
    for(let i=0;i<=100;i++) {
      const p=previous.map((v,k)=>v+(point[k]-v)*i/100);
      assert.equal(carriageContains(placement,p[0],.9,-p[1],.35),false);
    }
    previous=point;
  }
});

test('Prince Jev follows her freely across open roads while keeping solid obstacle clearance',()=>{
 const world={...empty,roads:[{id:'road',kind:'service',width_m:8.4,points:[[-20,0,0],[20,0,0]]}]};
 const nav=routes.createCompanionNavigation(world),start=[0,-6],end=[0,6];
 assert.equal(nav.pedestrian.classify([0,0]),'road');assert.equal(nav.canWalk(start,end),true);assert.deepEqual(nav.route(start,end),[end]);
 const blocked=routes.createCompanionNavigation({...world,collisionPolygons:[[[-1,-1],[1,-1],[1,1],[-1,1]]]});assert.equal(blocked.canWalk(start,end),false);
});

test('a waypoint just beside him is kept when the next one is only reachable from it',async()=>{
  const {createCompanionRouteFollower}=await import('../src/companion-navigation.js');
  // East/north planner points; the follower takes scene [x, z] with z = -north.
  const near=[.17,0],corner=[.17,-2],goal=[3,-2];
  const navigation={
    canWalk:()=>false,
    canTravel:(a,b)=>!(Math.abs(a[0])<.01&&Math.abs(a[1])<.01&&b===corner)&&!(b===goal&&a!==corner),
  };
  const follower=createCompanionRouteFollower(navigation,{route:async()=>[near,corner,goal]});
  follower.update([0,0],[goal[0],-goal[1]],1/60);
  await new Promise(resolve=>setTimeout(resolve,0));
  const waypoint=follower.update([0,0],[goal[0],-goal[1]],1/60);
  assert.deepEqual(waypoint,[near[0],-near[1]],'he takes the short step instead of discarding the route');
  assert.equal(follower.waiting,false);
});
