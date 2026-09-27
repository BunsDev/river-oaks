import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunity } from '../src/community.js';
import { createResidentLife, stepResidentLife } from '../src/resident-life.js';
import { releaseResidents } from '../src/invasion.js';

function crowd(neighborPosition,target=[5,0],heading=Math.PI/2) {
  const world={scene:'district',bounds_m:[-20,-20,20,20],collisionPolygons:[],communityLocations:[[0,0,0],neighborPosition].map((position,i)=>({id:`stop-${i}`,name:`Stop ${i}`,position}))};
  const state=createCommunity(world),life=createResidentLife(world,state),[walker,neighbor]=state.locals;
  const resetWalker=()=>{
    walker.position=[0,0,0];
    Object.assign(walker.life,{heading,speed:1,velocity:1,route:[[...target]],destination:{id:'end',name:'Destination'},visits:0});
  };
  resetWalker();neighbor.abducted=true;neighbor.life.waitUntil=Infinity;
  const release=()=>{releaseResidents({abducted:[neighbor.id]},state.locals);resetWalker();};
  return {life,walker,release};
}

test('passing ignores abducted neighbors and resumes avoiding them after release',()=>{
  const {life,walker,release}=crowd([1.5,0,0]);
  stepResidentLife(life,1/60);
  assert.equal(walker.life.heading,Math.PI/2,'An empty path needs no passing turn');
  assert.ok(walker.position[0]>0);
  release();stepResidentLife(life,1/60);
  assert.ok(walker.life.heading<Math.PI/2,'The released neighbor needs a passing turn');
});

test('abducted neighbors do not cause early arrival at a stop, but released neighbors do',()=>{
  const {life,walker,release}=crowd([0.8,0,0],[0.8,0]);
  stepResidentLife(life,1/60);
  assert.equal(walker.life.visits,0,'The empty stop has not been reached');
  assert.equal(walker.life.route.length,1);
  assert.ok(walker.position[0]>0);
  release();stepResidentLife(life,1/60);
  assert.equal(walker.life.visits,1,'Arrival keeps personal space from the released neighbor');
  assert.equal(walker.life.route.length,0);
  assert.deepEqual(walker.position,[0,0,0]);
});

test('abducted neighbors do not block a turning step, but released neighbors do',()=>{
  // The neighbor is beside the route, so passing does not turn away from it.
  // The walker is still easing toward that route and would step into its space.
  const {life,walker,release}=crowd([0,0.69,0],[5,0],Math.PI*3/4);
  stepResidentLife(life,1/60);
  assert.equal(walker.life.blocked,false,'The abducted neighbor occupies no ground space');
  assert.ok(walker.position[0]>0 && walker.position[1]>0);
  release();stepResidentLife(life,1/60);
  assert.equal(walker.life.blocked,true,'The released neighbor occupies ground space again');
  assert.deepEqual(walker.position,[0,0,0]);
});
