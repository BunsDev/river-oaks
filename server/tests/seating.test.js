import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

const data={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],stores:[],buildings:[],communityLocations:[]};
const admin=JEVICA_ADMIN_USER_IDS[0];
function fixture(kind='seat',yaw=0) {
  let time=1000;
  const world=createSharedWorld(data,{now:()=>time});
  world.join({userId:admin,name:'Jevica'});
  world.join({userId:'a',name:'Visitor A'});
  world.join({userId:'b',name:'Visitor B'});
  const placed=world.command(admin,{type:'build',action:'place',kind,finish:'rose',position:[-12,3],yaw});
  assert.equal(placed.ok,true);
  return {world,id:placed.item.id,advance(){time+=2000;},player(id){return world.snapshot().players.find(p=>p.id===id);}};
}
const sit=(f,user='a',slot=0)=>f.world.command(user,{type:'sit',buildId:f.id,slot});
const resign=value=>{const {checksum,...envelope}=value;return {...envelope,checksum:createHash('sha256').update(JSON.stringify(envelope)).digest('hex')};};

test('guests sit in independently occupied garden-seat slots without builder powers',()=>{
  const f=fixture();
  assert.equal(sit(f).ok,true);
  const first=f.player('a');
  assert.deepEqual(first.sitting,{buildId:f.id,slot:0,height:.705,yaw:0});
  assert.deepEqual(first.position,[-12.32,3,0]);
  assert.equal(first.yaw,-Math.PI);
  assert.equal(first.canBuild,false);assert.equal(first.canGrantWishes,false);
  assert.equal(sit(f,'b').error,'seat_occupied');
  assert.equal(sit(f,'b',1).ok,true);
  assert.deepEqual(f.player('b').position,[-11.68,3,0]);
  assert.equal(f.world.command('b',{type:'build',action:'remove',id:f.id}).error,'admin_only');
  f.world.leave('a');
  assert.equal(sit(f,admin).ok,true,'departure releases only the departed slot');
  assert.equal(f.player('b').sitting.slot,1);
});

test('lounge chairs have one slot, and a rotated seat derives facing and cushion height',()=>{
  const f=fixture('armchair',Math.PI/2);
  assert.equal(sit(f,'a',1).error,'invalid_seat');
  assert.equal(sit(f).ok,true);
  const p=f.player('a');
  assert.ok(Math.abs(p.position[0]+11.93)<1e-8);
  assert.ok(Math.abs(p.position[1]-3)<1e-8);
  assert.equal(p.sitting.height,.595);assert.equal(p.sitting.yaw,Math.PI/2);
  assert.equal(p.yaw,-Math.PI/2);
  assert.equal(sit(f,'b').error,'seat_occupied');
});

test('seat intents reject spoofed positions, nonexistent furniture and unreachable slots',()=>{
  const f=fixture();
  assert.equal(f.world.command('a',{type:'sit',buildId:f.id,slot:0,position:[-12,3],userId:admin}).error,'invalid_seat');
  assert.equal(f.world.command('a',{type:'sit',buildId:'missing',slot:0}).error,'invalid_seat');
  for(const slot of [-1,.5,'0',2])assert.equal(sit(f,'a',slot).error,'invalid_seat');
  f.advance();
  assert.equal(f.world.command('a',{type:'travel',position:[15,15]}).ok,true);
  assert.equal(sit(f).error,'seat_out_of_reach');
  const sculpture=fixture('sculpture');assert.equal(sit(sculpture).error,'invalid_seat');
});

test('seated movement is server locked; standing returns a clear ground position',()=>{
  const f=fixture();assert.equal(sit(f).ok,true);
  const seated=f.player('a');f.advance();
  const forged=f.world.command('a',{type:'pose',position:[-10,3,0],yaw:0,altitude:0});
  assert.equal(forged.error,'stand_before_moving');assert.deepEqual(forged.correction,seated);
  assert.equal(f.world.command('a',{type:'pose',position:seated.position,yaw:1,altitude:0}).ok,true);
  assert.equal(f.player('a').yaw,seated.yaw,'camera turning cannot turn a seated body');
  assert.equal(f.world.command(admin,{type:'build',action:'edit',id:f.id,position:[-12,2.9],yaw:0}).error,'seat_in_use');
  assert.equal(f.world.command(admin,{type:'build',action:'remove',id:f.id}).error,'seat_in_use');
  const stood=f.world.command('a',{type:'stand'});
  assert.equal(stood.ok,true);assert.equal(stood.player.sitting,null);
  assert.ok(Math.hypot(stood.player.position[0]+12,stood.player.position[1]-3)>=1.28);
  assert.equal(stood.player.altitude,0);assert.equal(stood.player.position[2],0);
  assert.equal(f.world.command('a',{type:'stand',position:[20,20]}).error,'invalid_seat');
  assert.equal(f.world.command('a',{type:'stand'}).error,'not_seated');
  assert.equal(f.world.command(admin,{type:'build',action:'remove',id:f.id}).ok,true);
});

test('travel and trusted reset release seat reservations',()=>{
  const f=fixture();assert.equal(sit(f).ok,true);f.advance();
  assert.equal(f.world.command('a',{type:'travel',position:[15,15]}).ok,true);
  assert.equal(f.player('a').sitting,null);
  assert.equal(sit(f,'b').ok,true);
  f.world.reset();assert.equal(f.player('b').sitting,null);assert.deepEqual(f.world.snapshot().builds,[]);
});

test('checkpoint recovery keeps seat occupancy and rejects corrupt reservations atomically',()=>{
  const f=fixture();assert.equal(sit(f).ok,true);
  const checkpoint=f.world.checkpoint(),restored=createSharedWorld(data);
  assert.deepEqual(restored.restore(checkpoint),{ok:true});
  assert.deepEqual(restored.snapshot().players.find(p=>p.id==='a').sitting,f.player('a').sitting);
  assert.equal(restored.command('b',{type:'sit',buildId:f.id,slot:0}).error,'seat_occupied');
  const before=restored.snapshot();
  for(const mutate of [
    p=>{p.sitting.slot=2;}, p=>{p.sitting.buildId='missing';},
    p=>{p.sitting.height=20;},p=>{p.position[0]+=1;},p=>{p.altitude=1;},
  ]) {
    const bad=structuredClone(checkpoint);mutate(bad.payload.players.find(p=>p.id==='a'));
    assert.equal(restored.restore(resign(bad)).error,'invalid_checkpoint');
    assert.deepEqual(restored.snapshot(),before);
  }
  const duplicate=structuredClone(checkpoint),a=duplicate.payload.players.find(p=>p.id==='a'),b=duplicate.payload.players.find(p=>p.id==='b');
  Object.assign(b,{sitting:structuredClone(a.sitting),position:[...a.position],yaw:a.yaw});
  assert.equal(restored.restore(resign(duplicate)).error,'invalid_checkpoint');
});

test('a blocked exit keeps the reservation until safe travel is confirmed',()=>{
  const f=fixture();assert.equal(sit(f).ok,true);
  let index=0;
  for(const radius of [1.65,2.2,2.8])for(let step=0;step<8;step++) {
    const id=`blocker-${++index}`,angle=step*Math.PI/4;
    assert.equal(f.world.join({userId:id,name:id}).ok,true);
    assert.equal(f.world.command(id,{type:'travel',position:[-12+Math.sin(angle)*radius,3-Math.cos(angle)*radius]}).ok,true);
  }
  const before=f.player('a');
  assert.equal(f.world.command('a',{type:'stand'}).error,'stand_blocked');
  assert.deepEqual(f.player('a'),before);
  f.advance();assert.equal(f.world.command('a',{type:'travel',position:[15,15]}).ok,true);
  assert.equal(f.player('a').sitting,null);
});

test('private-home seating respects invitations, revocation and region revisions',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {compileRegionPackage}=await import('../region-package.js');
  const {createWalkingEnvironment}=await import('../../preview/src/walking.js');
  const {migrateWorldCheckpoint}=await import('../world.js');
  const sample=JSON.parse(await readFile(new URL('../../preview/public/data/sample-region.json',import.meta.url)));
  const region={...sample,buildings:sample.buildings.map((building,index)=>index===2
    ? {...building,interior:{name:'Moon House',category:'home',entrance:'south',access:'owner'}}:building)};
  const worldData=compileRegionPackage(region,'Moon Garden'),env=createWalkingEnvironment(worldData),room=env.rooms[0],storeId=room.storeId;
  let time=1000;
  const make=()=>createSharedWorld(worldData,{worldId:'moon-garden',now:()=>time});
  const world=make();world.join({userId:admin,name:'Jevica'});world.join({userId:'guest',name:'Guest'});
  assert.equal(world.command(admin,{type:'travel',storeId,mode:'enter'}).ok,true);
  const build=world.command(admin,{type:'build',action:'place',kind:'armchair',finish:'rose',position:room.toWorld(-2,3.5),yaw:0});assert.equal(build.ok,true);
  const seat={type:'sit',buildId:build.item.id,slot:0};
  assert.equal(world.command('guest',seat).error,'private_home');
  assert.equal(world.command(admin,{type:'homeAccess',action:'grant',storeId,peerId:'guest'}).ok,true);
  assert.equal(world.command('guest',{type:'travel',storeId,mode:'enter'}).ok,true);
  assert.equal(world.command('guest',seat).ok,true);
  const recovered=make();assert.equal(recovered.restore(world.checkpoint()).ok,true);
  assert.equal(recovered.command(admin,seat).error,'seat_occupied');
  const revised=compileRegionPackage({...region,places:region.places.map((p,i)=>i?p:{...p,name:'Revised Arch'})},'Moon Garden');
  const migrated=migrateWorldCheckpoint({fromData:worldData,toData:revised,checkpoint:world.checkpoint(),worldId:'moon-garden',now:()=>time});
  assert.equal(migrated.ok,true);assert.equal(migrated.disconnectedPlayers,2);
  const replacement=createSharedWorld(revised,{worldId:'moon-garden',now:()=>time});
  assert.equal(replacement.restore(migrated.checkpoint).ok,true);
  assert.deepEqual(replacement.snapshot().players,[]);assert.equal(replacement.snapshot().builds[0].id,build.item.id);
  assert.equal(world.command(admin,{type:'homeAccess',action:'revoke',storeId,peerId:'guest'}).ok,true);
  const guest=world.snapshot().players.find(p=>p.id==='guest');
  assert.equal(guest.sitting,null);assert.equal(env.roomAt(guest.position[0],-guest.position[1]),null);
  assert.equal(world.command(admin,seat).ok,true,'revocation releases the chair without granting the guest powers');
});

test('a seat checkpoint keeps its furniture base height when terrain beneath one slot differs',()=>{
  const heights=Array(121).fill(0);heights[5*11+2]=.4;
  const slope={...data,terrain:{width:11,height:11,grid_origin_m:[-12.5,2.5],spacing_m:[.1,.1],heights_m:heights}};
  const world=createSharedWorld(slope);
  world.join({userId:admin,name:'Jevica'});world.join({userId:'guest',name:'Guest'});
  const placed=world.command(admin,{type:'build',action:'place',kind:'seat',finish:'rose',position:[-12,3],yaw:0});assert.equal(placed.ok,true);
  assert.equal(world.command('guest',{type:'sit',buildId:placed.item.id,slot:0}).ok,true);
  const restored=createSharedWorld(slope);
  assert.deepEqual(restored.restore(world.checkpoint()),{ok:true});
  assert.equal(restored.snapshot().players.find(p=>p.id==='guest').position[2],placed.item.ground);
  restored.reset();
  assert.ok(restored.snapshot().players.find(p=>p.id==='guest').position[2]>.2,'reset returns feet to terrain after removing the cushion');
  assert.deepEqual(createSharedWorld(slope).restore(restored.checkpoint()),{ok:true});
});

test('seating uses a new private checkpoint version while upgrading valid pre-seat checkpoints',()=>{
  const f=fixture();const old=f.world.checkpoint();old.version=2;
  for(const player of old.payload.players)delete player.sitting;
  const restored=createSharedWorld(data);assert.deepEqual(restored.restore(resign(old)),{ok:true});
  assert.equal(sit(f).ok,true);
  const current=f.world.checkpoint();assert.equal(current.version,3,'old coordinators must reject state whose seat locks they do not understand');
  const downgrade=structuredClone(current);downgrade.version=2;
  assert.equal(restored.restore(resign(downgrade)).error,'invalid_checkpoint','a seat cannot be laundered into the old format');
});
