import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoVisitor, visitorOptions } from '../src/auto-visitor.js';
import { createWalkingState, stepWalking, steerWalkingToward } from '../src/walking.js';
import { createCommunity, interactWithLocal, stepCommunity } from '../src/community.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const world = { stores: [{ id:'shop',name:'Shop',facade:[20,0,0],outward:[0,1] }], communityLocations:[{name:'Garden',position:[10,0,0]}] };
  const state = { generation:1,locals:[],storm:false,running:true,status:'running',supplies:4,helpBudget:1,elapsed:0,scenario:{supplyCost:2,supplyRelief:30} };
  let position = [0,0,1.68], clock = 0, weather = false;
  const actions = [], statuses = [];
  const auto = createAutoVisitor({getWorld:()=>world,getState:()=>state,getPosition:()=>position,getStorm:()=>weather,
    route:async (from,to)=>[to],steer:point=>actions.push(['steer',point]),halt:()=>actions.push(['halt']),
    interact:(id,action)=>{actions.push([action,id]);return {ok:true};},
    decide:async packet=>({schema_version:1,tick:packet.tick,generation:packet.generation,candidate_id:packet.candidates[0].id,source:'jev',confidence:0.99}),
    onStatus:s=>statuses.push(s),now:()=>clock,...overrides});
  return {auto,state,world,actions,statuses,move:p=>{position=p;},clock:t=>{clock=t;},weather:v=>{weather=v;}};
}

test('model destination produces walking and real arrival without teleportation',async()=>{
  const f=fixture();f.auto.start();f.auto.update(0.016);await settle();
  assert.equal(f.auto.status.phase,'walking');
  f.auto.update(0.016);assert.deepEqual(f.actions.at(-1),['steer',[10,0]]);
  assert.equal(f.auto.status.arrivals,0);
  f.move([10,0,1.68]);f.auto.update(0.016);
  assert.equal(f.auto.status.arrivals,1);assert.equal(f.auto.status.phase,'arrived');
});

test('manual cancellation fences inference even if provider ignores abort',async()=>{
  let resolve,packet;
  const f=fixture({decide:p=>{packet=p;return new Promise(r=>{resolve=r;});}});
  f.auto.start();f.auto.update(0.016);f.auto.stop();
  resolve({schema_version:1,tick:packet.tick,generation:packet.generation,candidate_id:'stop-0',source:'jev',confidence:1});
  await settle();f.auto.update(0.016);
  assert.equal(f.auto.status.enabled,false);assert.equal(f.auto.status.decisions,0);
  assert.ok(!f.actions.some(a=>a[0]==='steer'));
});

test('reset and weather changes fence route results and old movement',async()=>{
  let resolve;
  const f=fixture({route:()=>new Promise(r=>{resolve=r;})});
  f.auto.start();f.auto.update(0.016);await settle();
  f.state.generation++;f.auto.update(0.016);resolve([[10,0]]);await settle();
  assert.equal(f.auto.status.enabled,false);assert.ok(!f.actions.some(a=>a[0]==='steer'));
  const g=fixture();g.auto.start();g.auto.update(0.016);await settle();g.weather(true);g.auto.update(0.016);await settle();
  assert.equal(g.auto.status.action,'shelter');
});

test('low confidence, invented IDs, stale ticks and missing provider never move',async()=>{
  for(const change of [{confidence:0.29},{candidate_id:'unknown'},{tick:0},{source:'unavailable',reason:'not_configured'}]) {
    const f=fixture({decide:async p=>({schema_version:1,tick:p.tick,generation:p.generation,candidate_id:'stop-0',source:'jev',confidence:1,...change})});
    f.auto.start();f.auto.update(0.016);await settle();f.auto.update(0.016);
    assert.equal(f.auto.status.phase,'waiting');assert.ok(!f.actions.some(a=>a[0]==='steer'));
  }
});

test('a resident leaving range before inference resolves prevents remote support',async()=>{
  let resolve,packet;
  const f=fixture({decide:p=>{packet=p;return new Promise(r=>{resolve=r;});}});
  const local={id:'maya',name:'Maya',position:[1,0,0],needKnown:true,priority:true,status:'needs_help',need:25,cooldownUntil:0};
  f.state.locals.push(local);f.auto.start();f.auto.update(0.016);local.position=[30,0,0];
  resolve({schema_version:1,tick:packet.tick,generation:packet.generation,candidate_id:'supply-maya',source:'jev',confidence:1});
  await settle();assert.ok(!f.actions.some(a=>a[0]==='supply'));
});

test('nearby eligible support executes once; pending inference never overlaps',async()=>{
  let count=0;
  const f=fixture({decide:async p=>{count++;return {schema_version:1,tick:p.tick,generation:p.generation,candidate_id:'supply-maya',source:'jev',confidence:1};}});
  f.state.locals.push({id:'maya',name:'Maya',position:[1,0,0],needKnown:true,priority:true,status:'needs_help',need:25,cooldownUntil:0});
  f.auto.start();for(let i=0;i<10;i++)f.auto.update(0.016);await settle();
  assert.equal(count,1);assert.equal(f.actions.filter(a=>a[0]==='supply').length,1);
});

test('unreachable and obstructed destinations are temporarily excluded',async()=>{
  const f=fixture({route:async()=>null});f.auto.start();f.auto.update(0.016);await settle();
  assert.equal(f.auto.status.phase,'waiting');f.clock(6000);f.auto.update(0.016);await settle();
  assert.equal(f.auto.status.reason,'model_wait');
  const g=fixture();g.auto.start();g.auto.update(0.016);await settle();
  for(let i=0;i<55;i++)g.auto.update(0.08);
  assert.match(g.auto.status.reason,/obstructed/);
});

test('candidate construction preserves proximity, resources, storm and scenario gates',()=>{
  const f=fixture();const local={id:'maya',name:'Maya',position:[1,0,0],needKnown:false,priority:true,status:'needs_help',need:25,cooldownUntil:0};
  f.state.locals.push(local);
  let opts=visitorOptions(f.world,f.state,[0,0]);assert.ok(opts.candidates.some(c=>c.action==='ask'));assert.ok(!opts.candidates.some(c=>c.action==='supply'));
  local.needKnown=true;f.state.supplies=0;f.state.helpBudget=0;
  opts=visitorOptions(f.world,f.state,[0,0]);assert.ok(!opts.candidates.some(c=>['supply','dispatch'].includes(c.action)));
  opts=visitorOptions(f.world,f.state,[0,0],{storm:true});assert.ok(opts.candidates.every(c=>['shelter','wait'].includes(c.action)));
  opts=visitorOptions(f.world,f.state,[20,0.9],{storm:true});assert.deepEqual(opts.candidates.map(c=>c.action),['wait']);
});

test('approaching a moving neighbor retains speaking-range headroom for the next decision',async()=>{
  const f=fixture();
  f.state.locals.push({id:'maya',name:'Maya',position:[10,0,0],needKnown:false,priority:true,status:'needs_help',need:25,cooldownUntil:0});
  f.auto.start();f.auto.update(.016);await settle();
  f.move([7.5,0,1.68]);f.auto.update(.016);
  assert.equal(f.auto.status.phase,'walking','Do not stop at the outer edge of speaking range while the neighbor keeps moving');
  assert.equal(f.actions.at(-1)[0],'steer');
  const target=f.actions.at(-1)[1];
  assert.ok(Math.hypot(target[0]-10,target[1])>=1.2,'Keep comfortable personal space');
  assert.ok(Math.hypot(target[0]-10,target[1])<=1.6,'Leave time for the next provider decision without losing reach');
  f.move([...target,1.68]);f.auto.update(.016);
  assert.equal(f.auto.status.phase,'arrived');
});

for(const initialGap of [1.4,2.5,3.2])test(`guided support catches a walking neighbor from ${initialGap} m away`,async()=>{
  const world={stores:[],communityLocations:[{id:'maya',name:'Maya stop',position:[initialGap,0,0]}]};
  const state=createCommunity(world,[],{carriage:false});state.running=true;
  const local=state.locals[0],environment={isFree:()=>true,groundAt:()=>0};
  const walker=createWalkingState(environment,[0,0,0],-Math.PI/2);
  const position=()=>[walker.position[0],-walker.position[2]],interactions=[];
  let clock=0,input={};
  const auto=createAutoVisitor({getWorld:()=>world,getState:()=>state,getPosition:position,getStorm:()=>false,now:()=>clock,
    route:async(_from,to)=>[to],steer:(point,dt)=>{input=steerWalkingToward(walker,point,dt);},
    halt:()=>{input={};walker.velocity=[0,0];walker.speed=0;},
    decide:async packet=>{
      const candidate=['ask','supply','visit'].map(action=>packet.candidates.find(c=>c.action===action&&c.target_id===local.id)).find(Boolean)??packet.candidates.find(c=>c.action==='wait');
      return {schema_version:1,tick:packet.tick,generation:packet.generation,candidate_id:candidate.id,source:'jev',confidence:1};
    },
    interact:(id,action)=>{
      const gap=Math.hypot(position()[0]-local.position[0],position()[1]-local.position[1]);
      assert.ok(gap<=2.8,'Support still requires physical speaking range');
      const selected=state.selectedId,result=interactWithLocal(state,id,action);state.selectedId=selected;
      interactions.push({action,at:clock,gap});return result;
    }});
  auto.start();
  // Maya's normal 1.05 m/s pace versus the production walking motor. Keep her
  // moving through the ask-to-supply cooldown instead of freezing the target.
  for(let frame=0;frame<1200&&interactions.length<2;frame++){
    const dt=1/60;clock+=dt*1000;local.position[0]+=1.05*dt;stepCommunity(state,dt);
    auto.update(dt);await settle();stepWalking(walker,environment,input,dt);
  }
  auto.stop();
  assert.deepEqual(interactions.map(i=>i.action),['ask','supply'],'Catch the moving neighbor and complete support within 20 seconds');
  assert.equal(state.supplies,10,'The delivery spends real scenario supplies');
  assert.ok(interactions[1].at-interactions[0].at>=3000,'Interaction pacing is preserved');
  assert.ok(walker.distance>0,'Support follows physical walking');
});

test('abducted neighbours are never offered as people to meet or help',()=>{
  const world={stores:[],communityLocations:[{name:'Garden',position:[10,0,0]}]};
  const state={generation:1,storm:false,supplies:4,helpBudget:1,elapsed:0,scenario:{supplyCost:2,supplyRelief:30},locals:[
    {id:'here',name:'Here',position:[2,0,0],priority:true,status:'needs_help',need:80},
    {id:'taken',name:'Taken',position:[1,0,0],priority:true,status:'needs_help',need:90,abducted:true},
  ]};
  const options=visitorOptions(world,state,[0,0,1.68]).candidates;
  assert.ok(options.some(option=>option.target_id==='here'),'the neighbour on the ground is offered');
  assert.ok(options.every(option=>option.target_id!=='taken'),'the abducted neighbour is not');
});
