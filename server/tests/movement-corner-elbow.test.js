import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { createResidentNavigation } from '../../preview/src/navigation.js';
import { createWalkingEnvironment, createWalkingState, stepWalking, steerWalkingToward, fastWalkFor } from '../../preview/src/walking.js';

// The client slides along a wall one axis at a time, so its path round a convex corner
// is an elbow. The server checks the straight chord between two poses 200 ms apart,
// which can clip the corner the client walked round, refuse it, and snap the player
// back to the same place indefinitely (the arrival-to-Commons route, #587 D14).
const world=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const environment=createWalkingEnvironment(world);
// Captured on the route: the client's path between these poses was free; the chord is not.
const before=[-2714.687,-1322.055],after=[-2715.136,-1321.623];
const town=(start,time)=>{
  const shared=createSharedWorld({...world,walkSpawn:[...start,environment.groundAt(start[0],-start[1])]},{now:()=>time.now});
  assert.equal(shared.join({userId:'alice',name:'Alice'}).ok,true);
  return shared;
};
const pose=([x,north])=>({type:'pose',position:[x,north,environment.groundAt(x,-north)],yaw:0,altitude:0});
const chordFree=(a,b)=>{const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.15);
  for(let i=1;i<=steps;i++)if(!environment.isFree(a[0]+(b[0]-a[0])*i/steps,-(a[1]+(b[1]-a[1])*i/steps)))return false;return true;};

test('a corner slide the client walked is accepted although its straight chord clips the corner',()=>{
  assert.equal(chordFree(before,after),false,'fixture: the chord clips the building corner');
  const time={now:1000},shared=town(before,time);time.now+=1000;
  const result=shared.command('alice',pose(after));
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(shared.snapshot().players[0].position.slice(0,2),after);
});

test('the production walker reaches the District arrival round both route corners without a refusal',()=>{
  const start=[-2685,-1334],spawn=[-2765.321977373157,-1295.064162750871];
  const time={now:1000},shared=town(start,time),nav=createResidentNavigation(world,{allowRoads:true});
  const route=nav.route(start,spawn),state=createWalkingState(environment,start,0),refusals=[];
  let index=0,since=0;
  for(let frame=0;frame<6000&&index<route.length;frame++){
    if(Math.hypot(state.position[0]-route[index][0],state.position[2]+route[index][1])<.3){index++;continue;}
    stepWalking(state,environment,{...steerWalkingToward(state,route[index],1/60),fast:true},1/60);
    time.now+=1000/60;since+=1/60;
    if(since<.2)continue;since=0;
    const result=shared.command('alice',pose([state.position[0],-state.position[2]]));
    if(!result.ok){refusals.push(result.error);const p=result.correction.position;state.position=[p[0],p[2]+1.68,-p[1]];state.velocity=[0,0];}
  }
  assert.equal(index,route.length,'reached the arrival');
  assert.deepEqual(refusals,[]);
});

test('an elbow move pays for the distance actually walked',()=>{
  const time={now:1000},shared=town(before,time),speed=fastWalkFor('alice')+.2;
  const chord=Math.hypot(after[0]-before[0],after[1]-before[1]),elbow=Math.abs(after[0]-before[0])+Math.abs(after[1]-before[1]);
  // join leaves 0.1 s of budget; add just enough time for the chord, not the elbow.
  time.now+=(chord/speed-.1+.02)*1000;
  assert.ok(elbow/speed>chord/speed+.02,'fixture: the budget fits the chord but not the elbow');
  const result=shared.command('alice',pose(after));
  assert.equal(result.error,'movement_too_fast',JSON.stringify(result));
  assert.deepEqual(shared.snapshot().players[0].position.slice(0,2),before);
});

test('a move whose chord and elbows all cross the corner margin is still refused',()=>{
  // Both endpoints are clear and only 0.6 m apart, but every path between them grazes
  // the building's collision margin, so the authority keeps refusing it.
  const start=[-2714.915,-1321.953],target=[-2714.915,-1321.353];
  assert.ok(environment.isFree(start[0],-start[1])&&environment.isFree(target[0],-target[1]),'fixture: both ends clear');
  for(const corner of [[target[0],start[1]],[start[0],target[1]]])assert.equal(chordFree(start,corner)&&chordFree(corner,target),false,'fixture: no clear elbow');
  const time={now:1000},shared=town(start,time);time.now+=1000;
  const result=shared.command('alice',pose(target));
  assert.equal(result.error,'blocked',JSON.stringify(result));
  assert.deepEqual(shared.snapshot().players[0].position.slice(0,2),start);
});
