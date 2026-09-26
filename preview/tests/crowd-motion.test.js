import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCommunity } from '../src/community.js';
import { createResidentLife, stepResidentLife, residentPacket, applyResidentDecisions } from '../src/resident-life.js';

const angle = (a,b) => Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
function walking(points,routes,extra={}) {
  const world={scene:'district',bounds_m:[-20,-20,20,20],collisionPolygons:[],communityLocations:points.map((position,i)=>({id:`stop-${i}`,name:`Stop ${i}`,position})),...extra};
  const state=createCommunity(world);state.locals=state.locals.filter(local=>!local.stationary);
  const life=createResidentLife(world,state);
  state.locals.forEach((local,i)=>Object.assign(local.life,{heading:Math.atan2(routes[i][0][0]-local.position[0],-(routes[i][0][1]-local.position[1])),route:routes[i].map(p=>[...p]),destination:{id:`end-${i}`,name:'Destination'}}));
  return {state,life};
}

test('opposing walkers start passing with personal space and face their direction of travel',()=>{
  for(const dt of [1/30,1/60,1/120]) {
    const {state,life}=walking([[-5,0,0],[5,0,0]],[[[5,0]],[[-5,0]]]);
    let firstYield=null,minGap=Infinity,maxSlip=0;
    for(let frame=0;frame<12/dt;frame++) {
      const before=state.locals.map(l=>[...l.position]);stepResidentLife(life,dt);
      const gap=Math.hypot(state.locals[0].position[0]-state.locals[1].position[0],state.locals[0].position[1]-state.locals[1].position[1]);minGap=Math.min(minGap,gap);
      state.locals.forEach((local,i)=>{
        const dx=local.position[0]-before[i][0],dy=local.position[1]-before[i][1];
        if(Math.abs(dy)>0.0001 && firstYield===null)firstYield=gap;
        if(Math.hypot(dx,dy)>0.001)maxSlip=Math.max(maxSlip,angle(Math.atan2(dx,-dy),local.life.heading));
      });
    }
    assert.ok(firstYield>1.4,`Passing began too late: ${firstYield} m at ${dt} s`);
    assert.ok(minGap>=0.7-1e-6,`Walkers overlapped: ${minGap} m`);
    assert.ok(maxSlip<0.2,`Body slid sideways by ${maxSlip*180/Math.PI} degrees`);
    assert.ok(state.locals[0].position[0]>4.5 && state.locals[1].position[0]<-4.5,'Both people must reach their destination');
  }
});

test('residents brake before a sharp corner instead of snapping direction at full speed',()=>{
  const {state,life}=walking([[-5,0,0]],[[[0,0],[0,6]]]),local=state.locals[0];
  let approachSpeed=null,maxTurnRate=0;
  for(let frame=0;frame<960;frame++) {
    const heading=local.life.heading;stepResidentLife(life,1/60);
    maxTurnRate=Math.max(maxTurnRate,angle(local.life.heading,heading)*60);
    if(local.life.route.length===2 && local.position[0]>-0.18)approachSpeed=local.life.speed;
  }
  assert.ok(approachSpeed!==null && approachSpeed<0.65,`Corner approached at ${approachSpeed} m/s`);
  assert.ok(maxTurnRate<=3.2+1e-6,`Turn exceeded a controlled pivot: ${maxTurnRate} rad/s`);
  assert.ok(Math.hypot(local.position[0],local.position[1]-6)<0.05,'Resident must complete the corner');
});

test('opposing groups pass on a designated sidewalk without spilling into the road',()=>{
  const starts=[-5,-7,-9,5,7,9],ends=[9,7,5,-9,-7,-5];
  const {state,life}=walking(starts.map(x=>[x,5.5,0]),ends.map(x=>[[x,5.5]]),{roads:[{id:'street',width_m:8,points:[[-20,0,0],[20,0,0]]}]});
  let minGap=Infinity;
  for(let frame=0;frame<2400;frame++) {
    stepResidentLife(life,1/60);
    for(const [i,local] of state.locals.entries()) {
      if(local.life.visits)local.life.waitUntil=Infinity;
      assert.notEqual(life.navigation.pedestrian.classify(local.position),'road','Passing must remain on pedestrian surfaces');
      for(const other of state.locals.slice(i+1))minGap=Math.min(minGap,Math.hypot(local.position[0]-other.position[0],local.position[1]-other.position[1]));
    }
  }
  assert.ok(minGap>=0.7-1e-6,`Crowd overlapped: ${minGap} m`);
  assert.ok(state.locals.every((local,i)=>Math.hypot(local.position[0]-ends[i],local.position[1]-5.5)<0.05),`Crowd got stuck: ${JSON.stringify(state.locals.map(l=>l.position))}`);
});

test('a redirect cannot send a sidewalk resident into an unmarked traffic lane',()=>{
  const {state,life}=walking([[0,5.5,0]],[[[8,5.5]]],{roads:[{id:'street',width_m:8,points:[[-20,0,0],[20,0,0]]}]});
  state.locals[0].life.heading=Math.PI;
  const packet=residentPacket(life,1);
  applyResidentDecisions(life,{schema_version:1,tick:packet.tick,latency_ms:1,decisions:[{id:state.locals[0].id,action:'redirect',source:'jev'}]});
  assert.ok(state.locals[0].life.route.every(point=>life.navigation.canWalk(state.locals[0].position,point)),'Redirect must choose a legal pedestrian segment');
});

test('people arriving at the same stop rest with space instead of fighting over one coordinate',()=>{
  const {state,life}=walking([[-4,0,0],[4,0,0]],[[[0,0]],[[0,0]]]);
  for(let frame=0;frame<600;frame++) {
    stepResidentLife(life,1/60);
    for(const local of state.locals)if(local.life.visits)local.life.waitUntil=Infinity;
  }
  assert.ok(state.locals.every(local=>local.life.visits===1),'Both residents must arrive');
  assert.ok(state.locals.every(local=>Math.hypot(...local.position.slice(0,2))<1.1),'Arrival must remain near the intended stop');
  assert.ok(Math.hypot(state.locals[0].position[0]-state.locals[1].position[0],state.locals[0].position[1]-state.locals[1].position[1])>=0.7);
});

test('people already at personal-space distance can turn aside and pass without deadlock',()=>{
  const {state,life}=walking([[-0.351,0,0],[0.351,0,0]],[[[5,0]],[[-5,0]]]);
  for(let frame=0;frame<1200;frame++) {
    stepResidentLife(life,1/60);
    for(const local of state.locals)if(local.life.visits)local.life.waitUntil=Infinity;
    assert.ok(Math.hypot(state.locals[0].position[0]-state.locals[1].position[0],state.locals[0].position[1]-state.locals[1].position[1])>=0.7-1e-6);
  }
  assert.ok(state.locals[0].position[0]>4.9 && state.locals[1].position[0]<-4.9,'Both walkers must escape the close encounter');
});

test('a resident displaced toward a tree replans from the actual position',()=>{
  const district=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
  district.vegetation=JSON.parse(readFileSync(new URL('../public/data/district-vegetation.json',import.meta.url)));
  const start=[-2770.5740137108996,-1242.727749410543,0],end=[-2769.875526102923,-1259.2950448434674];
  const {state,life}=walking([start],[[end]],{...district,communityLocations:[{id:'start',name:'Start',position:start}]}),local=state.locals[0];
  assert.equal(life.navigation.canWalk(start,end),false,'The original straight segment must be blocked');
  for(let frame=0;frame<1800;frame++){stepResidentLife(life,1/60);if(local.life.visits)local.life.waitUntil=Infinity;}
  assert.equal(local.life.visits,1,'Resident must recover without teleporting or abandoning the destination');
  assert.ok(Math.hypot(local.position[0]-end[0],local.position[1]-end[1])<0.025);
});

test('district crowds keep moving for three minutes without road incursions or sustained deadlocks',()=>{
  const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
  world.vegetation=JSON.parse(readFileSync(new URL('../public/data/district-vegetation.json',import.meta.url)));
  const state=createCommunity(world),life=createResidentLife(world,state),pedestrians=state.locals.filter(local=>!local.stationary),blocked=pedestrians.map(()=>0);
  assert.equal(pedestrians.length,24,'All 24 street pedestrians remain covered');
  for(let frame=0;frame<5400;frame++) {
    stepResidentLife(life,1/30);
    for(const [i,local] of pedestrians.entries()) {
      assert.notEqual(life.navigation.pedestrian.classify(local.position),'road',`${local.id} left pedestrian space`);
      blocked[i]=local.life.blocked?blocked[i]+1:0;
      assert.ok(blocked[i]<90,`${local.id} has waited for space for three seconds`);
    }
  }
  assert.ok(pedestrians.every(local=>local.life.distance>50),'Every pedestrian must sustain progress');
});

test('an in-flight recovery is bounded and cannot overwrite a newer redirect',async()=>{
  const {state,life}=walking([[0,0,0]],[[[6,0]]],{collisionPolygons:[[[0.31,-2],[2,-2],[2,2],[0.31,2]]]});
  const local=state.locals[0],pending=[];
  life.routeProvider=(start,end)=>new Promise(resolve=>pending.push({start,end,resolve}));
  for(let i=0;i<120;i++)stepResidentLife(life,1/60);
  assert.equal(pending.length,1,'Only one recovery search may be in flight');
  const packet=residentPacket(life,7);applyResidentDecisions(life,{schema_version:1,tick:7,latency_ms:1,decisions:[{id:local.id,action:'redirect',source:'jev'}]});
  const route=local.life.route.map(p=>[...p]);
  pending[0].resolve([[6,0]]);await Promise.resolve();
  assert.deepEqual(local.life.route,route,'The old route must not replace the redirect');
});

test('an abducted resident does not alter passing, clearance or arrival',()=>{
  for(const hiddenPosition of [[-3.5,0,0],[-4.5,0,0],[5,0,0]]){
    const baseline=walking([[-5,0,0]],[[[5,0]]]);
    const crowded=walking([[-5,0,0],hiddenPosition],[[[5,0]],[[5,0]]]);
    const hidden=crowded.state.locals[1];hidden.abducted=true;hidden.life.route=[];
    for(let frame=0;frame<750;frame++){
      stepResidentLife(baseline.life,1/60);stepResidentLife(crowded.life,1/60);
      const a=baseline.state.locals[0],b=crowded.state.locals[0];
      assert.deepEqual(b.position,a.position,`invisible obstacle at ${hiddenPosition}: frame ${frame}`);
      assert.equal(b.life.visits,a.life.visits,'arrival should not stop short of an absent person');
      if(a.life.visits){a.life.waitUntil=Infinity;b.life.waitUntil=Infinity;}
    }
  }
});
