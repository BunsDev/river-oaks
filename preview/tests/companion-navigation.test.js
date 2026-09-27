import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createResidentNavigation} from '../src/navigation.js';
import {createWalkingEnvironment} from '../src/walking.js';
import {carriageContains} from '../src/carriage-parking.js';
import {createCompanionBody,stepCompanion} from '../src/prince-companion.js';
const routes=await import('../src/companion-navigation.js').catch(()=>({}));
const empty={scene:'district',bounds_m:[-30,-30,30,30],collisionPolygons:[]};

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
