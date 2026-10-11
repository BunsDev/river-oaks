import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { createMemoryDesignLibrary } from '../design-library.js';
import { accountDesignCommand } from '../design-commands.js';
import { JEVICA_ACCOUNT_IDS } from '../../preview/src/jevica-accounts.js';

const owner=JEVICA_ACCOUNT_IDS[0];
const data={scene:'district',bounds_m:[-40,-40,40,40],walkSpawn:[-12,0,0],stores:[],buildings:[],collisionPolygons:[],roads:[],
  communityLocations:[{id:'a',name:'Garden',position:[-12,0,0]},{id:'b',name:'Gallery',position:[12,0,0]}]};
const assembly=()=>({name:'Rose lantern',parts:[
  {shape:'box',size:[1,.2,1],position:[0,.1,0],rotation:[0,0,0],color:'#b97986',material:'metal'},
  {shape:'sphere',size:[.7,.7,.7],position:[0,.65,0],rotation:[0,0,0],color:'#edc6bc',material:'glass'},
]});
const create=(value=assembly(),extra={})=>({type:'build',action:'place',kind:'object',finish:'rose',assembly:value,position:[-12,2.4],yaw:0,...extra});
function town(){const world=createSharedWorld(data);world.join({userId:owner,name:'Jevica'});world.join({userId:'guest',name:'Guest'});return world;}
function signed(checkpoint){const {checksum,...value}=checkpoint;return {...value,checksum:createHash('sha256').update(JSON.stringify(value)).digest('hex')};}

test('Jevica creates an assembly and guests see detached confirmed geometry without build rights',()=>{
  const world=town(),value=assembly(),placed=world.command(owner,create(value));
  assert.equal(placed.ok,true,JSON.stringify(placed));
  assert.deepEqual(placed.item.assembly,value);
  value.parts[0].color='#000000';
  assert.equal(world.snapshot().builds[0].assembly.parts[0].color,'#b97986');
  const before=world.snapshot();
  for(const command of [create(),{type:'build',action:'edit',id:placed.item.id,position:placed.item.position,yaw:0,assembly:assembly()},
    {type:'inventory',action:'save',buildId:placed.item.id}])assert.equal(world.command('guest',command).error,'admin_only');
  assert.equal(world.snapshot().revision,before.revision);
  placed.item.assembly.parts.length=0;
  assert.equal(world.snapshot().builds[0].assembly.parts.length,2);
});

test('full rotated assembly bounds govern placement and geometry edits without partial mutation',()=>{
  const world=town(),placed=world.command(owner,create());
  assert.equal(placed.ok,true,JSON.stringify(placed));
  const next=assembly();next.parts[0].size=[2,.2,1];next.parts[0].rotation[1]=Math.PI/4;
  const moved=world.command(owner,{type:'build',action:'edit',id:placed.item.id,assembly:next,position:placed.item.position,yaw:.4});
  assert.equal(moved.ok,true,JSON.stringify(moved));
  assert.deepEqual(moved.item.assembly,next);
  const before=world.snapshot();
  const overlapping=world.command(owner,create(assembly(),{position:[-10.8,2.4]}));
  assert.equal(overlapping.error,'blocked_build_site');
  const invalid=assembly();invalid.parts[0].size[0]=100;
  assert.equal(world.command(owner,{type:'build',action:'edit',id:placed.item.id,assembly:invalid,position:placed.item.position,yaw:0}).error,'invalid_build');
  assert.deepEqual(world.snapshot(),before);
});

test('malformed and unbounded parts cannot enter the authoritative world',()=>{
  const invalid=[null,{...assembly(),ownerId:owner},{...assembly(),name:'\u0000'},
    {...assembly(),parts:[]},{...assembly(),parts:Array.from({length:17},()=>assembly().parts[0])}];
  for(const modify of [part=>part.size[0]=Infinity,part=>part.size[0]=-.1,part=>part.size[0]=100,
    part=>part.position[0]=10,part=>part.position[1]=-1,part=>part.rotation[0]=NaN,
    part=>part.color='url(https://example.test)',part=>part.material='remote',part=>part.shape='script',part=>part.script='run()']){
    const value=assembly();modify(value.parts[0]);invalid.push(value);
  }
  invalid.push(assembly());
  for(const [index,value] of invalid.entries()){
    const world=town(),before=world.snapshot();
    const command=index===invalid.length-1?create(value,{kind:'seat'}):create(value);
    assert.equal(world.command(owner,command).error,'invalid_build');
    assert.deepEqual(world.snapshot(),before);
  }
});

test('assemblies and world designs survive recovery while corrupted geometry is rejected atomically',()=>{
  const world=town(),placed=world.command(owner,create());
  assert.equal(placed.ok,true,JSON.stringify(placed));
  const saved=world.command(owner,{type:'inventory',action:'save',buildId:placed.item.id});
  assert.equal(saved.ok,true);assert.deepEqual(saved.item.assembly,assembly());
  const checkpoint=world.checkpoint(),restored=createSharedWorld(data);
  assert.equal(restored.restore(checkpoint).ok,true);
  assert.deepEqual(restored.snapshot(),world.snapshot());
  const bad=structuredClone(checkpoint);bad.payload.builds[0].assembly.parts[0].position[0]=100;
  assert.equal(restored.restore(signed(bad)).error,'invalid_checkpoint');
  assert.deepEqual(restored.snapshot(),world.snapshot());
  const badDesign=structuredClone(checkpoint);badDesign.payload.inventory[0][1][0].assembly.parts[0].shape='unknown';
  assert.equal(restored.restore(signed(badDesign)).error,'invalid_checkpoint');
});

test('account designs preserve the entire assembly through save, copy, and cross-world placement',async()=>{
  const library=createMemoryDesignLibrary(),value=assembly();
  const saved=await library.save(owner,{kind:'object',finish:'rose',assembly:value});
  assert.equal(saved.ok,true,JSON.stringify(saved));
  value.parts[0].size[0]=100;
  assert.deepEqual((await library.get(owner,saved.item.id)).assembly,assembly());
  assert.equal(await library.get('guest',saved.item.id),null);
  const room={async request(){return {ok:true,items:[]};}};
  const result=await accountDesignCommand({command:{type:'build',action:'place',templateId:saved.item.id,position:[1,2],yaw:0},userId:owner,
    connectionId:'connection',worldId:'garden',room,library,security:{allow:async()=>true},isAdmin:id=>id===owner});
  assert.deepEqual(result.command.assembly,assembly());
});

test('a version 3 checkpoint preserves occupied furniture while new geometry requires version 4',()=>{
  const world=town(),placed=world.command(owner,{type:'build',action:'place',kind:'seat',finish:'rose',position:[-12,2.4],yaw:0});
  assert.equal(placed.ok,true);
  assert.equal(world.command(owner,{type:'sit',buildId:placed.item.id,slot:0}).ok,true);
  const checkpoint=world.checkpoint();assert.equal(checkpoint.version,5);
  checkpoint.version=3;
  const restored=createSharedWorld(data);
  assert.equal(restored.restore(signed(checkpoint)).ok,true,'valid old seated state remains recoverable');
  assert.deepEqual(restored.snapshot(),world.snapshot());
});

test('authoritative movement cannot cross a placed creator object',()=>{
  let time=1000;const world=createSharedWorld(data,{now:()=>time});world.join({userId:owner,name:'Jevica'});
  assert.equal(world.command(owner,create()).ok,true);time+=2000;
  const before=world.snapshot().players[0].position;
  const result=world.command(owner,{type:'pose',position:[-12,2.4,0],yaw:0,altitude:0});
  assert.equal(result.error,'blocked');assert.deepEqual(world.snapshot().players[0].position,before);
});


test('recovery validates positions against candidate objects without leaking old colliders',()=>{
  const world=town();assert.equal(world.command(owner,create()).ok,true);
  const clean=town().checkpoint();assert.equal(world.restore(clean).ok,true);
  const timeWorld=createSharedWorld(data,{now:()=>100000});
  assert.equal(timeWorld.restore(world.checkpoint()).ok,true);
  // Restore must not reject free positions because a previous live object stood there.
  assert.equal(world.command(owner,create()).ok,true);
  const saved=town().checkpoint();saved.payload.players.find(player=>player.id===owner).position=[-12,2.4,0];
  assert.equal(world.restore(signed(saved)).ok,true);
  const occupied=town();assert.equal(occupied.command(owner,create()).ok,true);
  const forged=occupied.checkpoint();forged.payload.players.find(player=>player.id===owner).position=[-12,2.4,0];
  assert.equal(world.restore(signed(forged)).error,'invalid_checkpoint');
  assert.deepEqual(world.snapshot().builds,[],'failed recovery does not install candidate objects');
});

test('a large creation cannot hide a static footprint between placement samples',()=>{
  const world=createSharedWorld({...data,collisionPolygons:[[[-11.15,3.65],[-11.05,3.65],[-11.05,3.75],[-11.15,3.75]]]});
  world.join({userId:owner,name:'Jevica'});
  const value=assembly();value.parts=[{...value.parts[0],size:[3,1,3],position:[0,.5,0]}];
  const before=world.snapshot();
  assert.equal(world.command(owner,create(value,{position:[-12,3.4]})).error,'blocked_build_site');
  assert.deepEqual(world.snapshot(),before);
});

test('creator placement and edits cannot trap a flying visitor or poison recovery',()=>{
  let time=1000;const world=createSharedWorld(data,{now:()=>time}),other=JEVICA_ACCOUNT_IDS[1];
  world.join({userId:owner,name:'Jevica'});world.join({userId:other,name:'Jevica'});time+=2000;
  assert.equal(world.command(other,{type:'pose',position:[-10.4,3.4,0],yaw:0,altitude:1.2}).ok,true);
  const value=assembly();value.parts=[{...value.parts[0],size:[1,1,1],position:[0,.5,0]}];
  assert.equal(world.command(owner,create(value,{position:[-12,3.4]})).error,'blocked_build_site');
  assert.equal(world.command(owner,create(value,{position:[-14,2.4]})).ok,true);
  const item=world.snapshot().builds[0],before=world.snapshot();
  assert.equal(world.command(owner,{type:'build',action:'edit',id:item.id,position:[-12,3.4],yaw:0,assembly:value}).error,'blocked_build_site');
  assert.deepEqual(world.snapshot(),before);
  assert.equal(createSharedWorld(data,{now:()=>time}).restore(world.checkpoint()).ok,true);
});
