import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedWorld } from '../world.js';
import { newAssembly,objectCollider } from '../../preview/src/creator-object.js';
import { JEVICA_ACCOUNT_IDS } from '../../preview/src/jevica-accounts.js';

const owner=JEVICA_ACCOUNT_IDS[0],data={scene:'district',bounds_m:[-40,-40,40,40],walkSpawn:[-12,0,0],stores:[],buildings:[],collisionPolygons:[],roads:[],
  communityLocations:[{id:'a',name:'Garden',position:[-12,-10,0]}]};
const place=(position=[-12,2.4])=>({type:'build',action:'place',kind:'object',finish:'rose',assembly:newAssembly(),position,yaw:0});
const town=()=>{const world=createSharedWorld(data);world.join({userId:owner,name:'Jevica'});return world;};

test('custom placement and editing cannot enclose a resident body',()=>{
  const world=town(),local=world.state.locals[0];local.position=[-12,2.4,0];
  const before=world.snapshot();
  assert.equal(world.command(owner,place()).error,'blocked_build_site');
  assert.deepEqual(world.snapshot(),before,'rejected placement is atomic');
  const placed=world.command(owner,place([-14,2.4]));assert.equal(placed.ok,true);
  const after=world.snapshot();
  assert.equal(world.command(owner,{type:'build',action:'edit',id:placed.item.id,position:[-12,2.4],yaw:0}).error,'blocked_build_site');
  assert.deepEqual(world.snapshot(),after,'rejected edit is atomic');
});

test('authoritative strolling and recovered routes avoid confirmed assemblies',()=>{
  for(const recover of [false,'fresh','same']){
    let world=town();
    const local=world.state.locals[0];
    Object.assign(local.life,{route:[[-12,10]],destination:{id:'b',name:'North'},heading:Math.PI,waitUntil:1000});
    const placed=world.command(owner,place());assert.equal(placed.ok,true,JSON.stringify(placed));
    if(recover){const checkpoint=world.checkpoint();if(recover==='fresh')world=town();assert.equal(world.restore(checkpoint).ok,true);}
    const walker=world.state.locals[0],collider=objectCollider(placed.item);
    let arrived=false;
    for(let i=0;i<700;i++){
      const before=[...walker.position];world.step(.05);
      assert.ok(Math.hypot(walker.position[0]-before[0],walker.position[1]-before[1])<.071,'no relocation');
      assert.equal(collider.contains(walker.position[0],walker.position[2]+.9,-walker.position[1],.35,.9),false,'NPC remains outside custom geometry');
      arrived ||= Math.hypot(walker.position[0]+12,walker.position[1]-10)<.1;
    }
    assert.ok(arrived,'original destination survives recovery');
  }
});


test('moving, removing and resetting assemblies refresh live resident clearance',()=>{
  const world=town(),local=world.state.locals[0];
  const placed=world.command(owner,place());assert.equal(placed.ok,true);
  const cross=(x)=>{
    local.position=[x,0,0];
    Object.assign(local.life,{route:[[x,5]],destination:{id:'b',name:'North'},heading:Math.PI,waitUntil:1000,speed:0,velocity:0});
    let reached=false;
    for(let i=0;i<200;i++){world.step(.05);reached ||= Math.hypot(local.position[0]-x,local.position[1]-5)<.1;}
    assert.ok(reached,'clear route is reachable');
    assert.ok(Math.abs(local.position[0]-x)<.01,'released direct route does not retain a phantom detour');
  };
  assert.equal(world.command(owner,{type:'build',action:'edit',id:placed.item.id,position:[-14,2.4],yaw:0}).ok,true);
  cross(-12);
  assert.equal(world.command(owner,{type:'build',action:'remove',id:placed.item.id}).ok,true);
  cross(-14);
  assert.equal(world.command(owner,place()).ok,true);
  world.reset();
  const after=world.state.locals[0];after.position=[-12,0,0];
  Object.assign(after.life,{route:[[-12,5]],destination:{id:'b',name:'North'},heading:Math.PI,waitUntil:1000});
  let reached=false;
  for(let i=0;i<200;i++){world.step(.05);reached ||= Math.hypot(after.position[0]+12,after.position[1]-5)<.1;}
  assert.ok(reached,'reset clears the previous custom obstacle');
});

test('custom placement reserves a lifted resident’s grounded return volume',()=>{
  const world=town(),local=world.state.locals[0];local.position=[-12,2.4,0];
  assert.equal(world.command(owner,{type:'wish',localId:local.id,kind:'flight'}).ok,true);
  for(let i=0;i<80;i++)world.step(.05);
  const before=world.snapshot();
  assert.equal(world.command(owner,place()).error,'blocked_build_site');
  assert.deepEqual(world.snapshot(),before);
  assert.equal(world.command(owner,{type:'undoWish',localId:local.id}).ok,true);
  // A physical Force lift also has to keep its grounded return space.
  local.force={height:3};
  assert.equal(world.command(owner,place()).error,'blocked_build_site');
});

test('an older checkpoint with an enclosed resident recovers to nearby free ground',()=>{
  const world=town(),placed=world.command(owner,place());assert.equal(placed.ok,true);
  const local=world.state.locals[0];
  // Previous v4 authority allowed both movement and a wish landing inside an assembly.
  local.position=[-12,2.4,0];Object.assign(local.life,{route:[[-12,10]],destination:{id:'b',name:'North'},heading:Math.PI,waitUntil:1000});
  const checkpoint=world.checkpoint(),restored=town();
  assert.equal(restored.restore(checkpoint).ok,true);
  const walker=restored.state.locals[0],collider=objectCollider(placed.item);
  assert.equal(collider.contains(walker.position[0],walker.position[2]+.9,-walker.position[1],.35,.9),false,'recovery releases occupied start');
  assert.ok(Math.hypot(walker.position[0]+12,walker.position[1]-2.4)<=4,'recovery stays near the former position');
  let arrived=false;
  for(let i=0;i<500;i++){restored.step(.05);arrived ||= Math.hypot(walker.position[0]+12,walker.position[1]-10)<.1;}
  assert.ok(arrived,'the recovered resident can finish the previous route');
});

test('legacy repair stays on resident navigation rather than moving into a road',()=>{
  const roadWorld={...data,walkSpawn:[-14,2.4,0],roads:[{id:'r',points:[[-10,-30,0],[-10,30,0]],width_m:2,kind:'residential'}],
    communityLocations:[{id:'a',name:'Garden',position:[-14,-10,0]}]};
  const world=createSharedWorld(roadWorld);world.join({userId:owner,name:'Jevica'});
  const placed=world.command(owner,place());assert.equal(placed.ok,true,JSON.stringify(placed));
  const local=world.state.locals[0];local.position=[-11.52,2.4,placed.item.ground];
  Object.assign(local.life,{route:[[-14,10]],destination:{id:'b',name:'North'},heading:Math.PI,waitUntil:1000});
  const restored=createSharedWorld(roadWorld);assert.equal(restored.restore(world.checkpoint()).ok,true);
  const walker=restored.state.locals[0];let arrived=false;
  for(let i=0;i<500;i++){restored.step(.05);arrived ||= Math.hypot(walker.position[0]+14,walker.position[1]-10)<.1;}
  assert.ok(arrived,'the repair point supports a pedestrian route to the retained destination');
});

test('repairing a legacy visit recipient refreshes the approach without spending another visit',async()=>{
  const {interactWithLocal}=await import('../../preview/src/community.js');
  const positions=[[-12,-10],[-25,-20],[-25,20],[-30,0],[-10,-25],[10,-25],[25,-15],[25,25],[-20,-10]];
  const visitData={...data,communityLocations:positions.map((position,i)=>({id:'stop-'+i,name:'Stop '+i,position:[...position,0]}))};
  const world=createSharedWorld(visitData);world.join({userId:owner,name:'Jevica'});
  const placed=world.command(owner,place());assert.equal(placed.ok,true);
  world.state.running=true;
  const recipient=world.state.locals[0];
  assert.equal(interactWithLocal(world.state,recipient.id,'ask').ok,true);
  assert.equal(interactWithLocal(world.state,recipient.id,'dispatch').ok,true);
  world.state.selectedId=null;world.step(.05);
  assert.equal(world.state.jobs[0].phase,'traveling');
  recipient.position=[-12,2.4,placed.item.ground];
  const budget=world.state.helpBudget,restored=createSharedWorld(visitData);
  assert.equal(restored.restore(world.checkpoint()).ok,true);
  assert.equal(restored.state.jobs[0].phase,'queued','saved approach is invalidated');
  assert.equal(restored.state.helpBudget,budget,'no extra visit spent by recovery');
  for(let i=0;i<1200&&restored.state.locals[0].status!=='supported';i++)restored.step(.05);
  assert.equal(restored.state.locals[0].status,'supported','volunteer reaches the repaired recipient');
  assert.equal(restored.state.helpBudget,budget);
});
