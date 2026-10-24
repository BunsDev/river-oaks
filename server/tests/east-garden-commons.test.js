import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { attachEastGardenCommons } from '../../preview/src/east-garden-commons.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { createResidentNavigation } from '../../preview/src/navigation.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
const base=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const data=attachEastGardenCommons(base),layout=data.eastGardenCommons;

test('two server-owned players walk the commons seam both ways and restore positions',()=>{
  let time=1000;
  const fixture={...data,walkSpawn:[layout.edge-1,-1335,layout.ground]};
  const town=createSharedWorld(fixture,{now:()=>time}),environment=createWalkingEnvironment(fixture);
  for(const id of ['alice','bob'])assert.equal(town.join({userId:id,name:id}).ok,true);
  const starts=new Map(town.snapshot().players.map(p=>[p.id,[...p.position]]));
  const move=(direction)=>{
    for(let i=0;i<400;i++){
      time+=100;
      for(const id of ['alice','bob']){
        const player=town.snapshot().players.find(p=>p.id===id),x=player.position[0]+direction*.25,n=player.position[1];
        const result=town.command(id,{type:'pose',position:[x,n,environment.groundAt(x,-n)],yaw:direction>0?-Math.PI/2:Math.PI/2,altitude:0});
        assert.equal(result.ok,true,`${id} step ${i}: ${JSON.stringify(result)}`);
      }
    }
  };
  move(1);
  for(const p of town.snapshot().players)assert.ok(p.position[0]>layout.edge+90);
  const restored=createSharedWorld(fixture,{now:()=>time});
  assert.deepEqual(restored.restore(town.checkpoint()),{ok:true});
  assert.deepEqual(restored.snapshot().players.map(p=>p.position),town.snapshot().players.map(p=>p.position));
  move(-1);
  for(const p of town.snapshot().players)assert.ok(Math.hypot(...p.position.map((v,i)=>v-starts.get(p.id)[i]))<.01);
});

test('authority refuses bare travel into reserved land without changing the player',()=>{
  let time=1000;const town=createSharedWorld(data,{now:()=>time});town.join({userId:'alice',name:'Alice'});
  const before=town.snapshot().players[0].position;
  const result=town.command('alice',{type:'travel',position:[layout.edge+15,-1280]});
  assert.equal(result.ok,false);
  assert.deepEqual(town.snapshot().players[0].position,before);
});

test('existing District resident planner keeps its bounded grid and routes after composition',()=>{
  const before=createResidentNavigation(base),after=createResidentNavigation(data);
  assert.ok(before&&after);
  const start=[-2685,-1334],end=[-2685,-1345];
  const originalRoute=before.route(start,end);assert.ok(originalRoute?.length);
  assert.deepEqual(after.route(start,end),originalRoute);
  assert.equal(after.free([layout.edge+80,-1335]),false,'cross-location resident routing is not yet granted');
});

test('authority rejects invalid Commons poses: seam teleport, solid penetration and leaving the location',()=>{
  let time=1000;
  const fixture={...data,walkSpawn:[layout.edge-1,-1335,layout.ground]};
  const town=createSharedWorld(fixture,{now:()=>time}),environment=createWalkingEnvironment(fixture);
  town.join({userId:'alice',name:'Alice'});
  const me=()=>town.snapshot().players[0].position;
  const pose=(x,n)=>{time+=100;return town.command('alice',{type:'pose',position:[x,n,environment.groundAt(x,-n)],yaw:0,altitude:0});};
  const walkTo=(x,n)=>{for(let i=0;i<4000;i++){const p=me(),d=Math.hypot(x-p[0],n-p[1]);if(d<.05)return {ok:true};const k=Math.min(.25,d)/d,result=pose(p[0]+(x-p[0])*k,p[1]+(n-p[1])*k);if(!result.ok)return result;}return {ok:false};};
  const start=[...me()],jump=pose(layout.edge+29,-1335);
  assert.equal(jump.error,'movement_too_fast');assert.deepEqual(me(),start);assert.deepEqual(jump.correction.position,start);
  const post=layout.solids.find(solid=>solid.id.endsWith('/post-0')),[west,south,east]=post.rect,x=(west+east)/2;
  assert.equal(walkTo(x,-1335).ok,true,'valid promenade walk is accepted');
  const blocked=walkTo(x,(south+post.rect[3])/2);
  assert.equal(blocked.error,'blocked');
  assert.ok(me()[1]<=south-.45,`player stays outside the post: ${me()[1]} vs ${south}`);
  assert.deepEqual(blocked.correction.position,me());
  assert.equal(walkTo(x,-1335).ok,true);
  const edgeOut=walkTo(layout.bounds[2]+5,-1335);
  assert.equal(edgeOut.ok,false,'walking off the east edge of the location is refused');
  assert.ok(me()[0]<layout.bounds[2],`player remains inside the location: ${me()[0]} vs ${layout.bounds[2]}`);
});
