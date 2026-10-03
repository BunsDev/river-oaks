import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { createCommunity } from '../../preview/src/community.js';
import { storeRoomsFor } from '../../preview/src/store-rooms.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { SHARED_APPEARANCES } from '../../preview/src/shared-appearances.js';

const data = { scene: 'district', bounds_m: [-30,-30,30,30], walkSpawn: [-12,0,0],
  collisionPolygons: [[[-3,-8],[3,-8],[3,8],[-3,8]]], stores: [], buildings: [],
  communityLocations: [
    { id:'a',name:'Garden',position:[-12,0,0] },
    { id:'b',name:'Gallery',position:[12,0,0] },
    { id:'c',name:'Plaza',position:[0,15,0] },
    { id:'d',name:'Cafe',position:[-12,10,0] },
  ],
};
function setup() {
  let time = 1000;
  const world = createSharedWorld(data, { now: () => time });
  assert.equal(world.join({userId:'a',name:'Alice'}).ok,true);
  assert.equal(world.join({userId:'b',name:'Bob'}).ok,true);
  return {world,advance(ms){time+=ms;},now(){return time;}};
}
const cast = (world,userId='a',localId='local-00') => world.command(userId,{type:'wish',localId,kind:'dragon'});
const travel = (world,id,userId='a') => world.command(userId,{type:'travel',localId:id});

test('only the named account can enter shared play as either Jevica form',()=>{
  const owner='user_01M40Y914S1H4EJCEHH91DKTAY';
  const world=createSharedWorld(data);
  assert.equal(world.join({userId:owner,name:'Owner'}).player.appearance,'jevica');
  assert.equal(world.join({userId:'guest',name:'Guest'}).player.appearance,'sable-human');
  for(const appearance of ['jevica','jevica-beast']) {
    assert.equal(world.command('guest',{type:'appearance',appearance}).error,'exclusive_appearance');
    assert.equal(world.snapshot().players.find(player=>player.id==='guest').appearance,'sable-human');
  }
  assert.equal(world.command(owner,{type:'appearance',appearance:'jevica-beast'}).ok,true);
  assert.equal(world.command('guest',{type:'appearance',appearance:'woman-tailored'}).ok,true);
});

test('the same WorkOS account has Jevica and vehicle access under its Production ID',()=>{
  const owner='user_01M402HKJYDTH1QJM5NAQDZ4HH';
  const world=createSharedWorld(data);
  const joined=world.join({userId:owner,name:'Owner'});
  assert.equal(joined.player.appearance,'jevica');
  assert.equal(world.command(owner,{type:'appearance',appearance:'jevica-beast'}).ok,true);
  assert.equal(world.command(owner,{type:'pose',position:joined.player.position,yaw:0,altitude:0,vehicle:'rolls'}).ok,true);
});

test('only the Jevica owner can submit a vehicle pose in shared play',()=>{
  let time=1000;
  const owner='user_01M40Y914S1H4EJCEHH91DKTAY';
  const world=createSharedWorld(data,{now:()=>time});
  const ownerPosition=world.join({userId:owner,name:'Owner'}).player.position;
  const guestPosition=world.join({userId:'guest',name:'Guest'}).player.position;
  time+=1000;
  const pose=position=>({type:'pose',position:[position[0],position[1]+5.5,position[2]],yaw:0,altitude:0,vehicle:'rolls'});
  assert.equal(world.command('guest',pose(guestPosition)).error,'exclusive_vehicle');
  assert.equal(world.command(owner,pose(ownerPosition)).ok,true);
  assert.equal(world.snapshot().players.find(player=>player.id===owner).vehicle,'rolls');
  assert.equal(world.command(owner,{...pose(ownerPosition),vehicle:'unknown'}).error,'invalid_pose');
  const checkpoint=JSON.parse(JSON.stringify(world.checkpoint()));
  const restored=createSharedWorld(data,{now:()=>time});
  assert.deepEqual(restored.restore(checkpoint),{ok:true});
  assert.equal(restored.snapshot().players.find(player=>player.id===owner).vehicle,'rolls');
  checkpoint.payload.players.find(player=>player.id==='guest').vehicle='rolls';
  assert.equal(restored.restore(resign(checkpoint)).error,'invalid_checkpoint');
});

test('only a current Jevica appearance may fly, including across appearance changes',()=>{
  let time=1000;
  const owner='user_01M40Y914S1H4EJCEHH91DKTAY';
  const world=createSharedWorld(data,{now:()=>time});
  const ownerPosition=world.join({userId:owner,name:'Owner'}).player.position;
  const guestPosition=world.join({userId:'guest',name:'Guest'}).player.position;
  const flying=position=>({type:'pose',position,yaw:0,altitude:1});
  time+=1000;
  assert.equal(world.command('guest',flying(guestPosition)).error,'flight_not_allowed');
  assert.equal(world.command(owner,flying(ownerPosition)).ok,true);
  assert.equal(world.command(owner,{type:'appearance',appearance:'kai-noir-beast'}).error,'land_before_appearance');
  time+=1000;
  assert.equal(world.command(owner,{...flying(ownerPosition),altitude:0}).ok,true);
  assert.equal(world.command(owner,{type:'appearance',appearance:'kai-noir-beast'}).ok,true);
  time+=1000;
  assert.equal(world.command(owner,flying(ownerPosition)).error,'flight_not_allowed');
});

test('a pre-rule airborne guest checkpoint lands safely on restore',()=>{
  const world=createSharedWorld(data),guest=world.join({userId:'guest',name:'Guest'}).player;
  const checkpoint=JSON.parse(JSON.stringify(world.checkpoint()));
  checkpoint.payload.players[0].altitude=2;
  const restored=createSharedWorld(data);
  assert.deepEqual(restored.restore(resign(checkpoint)),{ok:true});
  assert.equal(restored.snapshot().players[0].altitude,0);
  assert.deepEqual(restored.snapshot().players[0].position,guest.position);
});

test('beast movement admits a fast ground lope that upright movement cannot forge',()=>{
  let time=1000;
  const world=createSharedWorld(data,{now:()=>time});
  const start=world.join({userId:'guest',name:'Guest'}).player.position;
  const lope={type:'pose',position:[start[0],start[1]+4,start[2]],yaw:0,altitude:0};
  time+=1000;
  assert.equal(world.command('guest',lope).error,'movement_too_fast');
  assert.equal(world.command('guest',{type:'appearance',appearance:'man-casual'}).ok,true);
  assert.equal(world.command('guest',{type:'movement',movement:'beast'}).ok,true);
  assert.equal(world.command('guest',lope).ok,true);
  time+=2100;
  assert.equal(world.command('guest',{type:'appearance',appearance:'rowan-human'}).ok,true);
  assert.equal(world.command('guest',{type:'pose',position:[start[0],start[1]+8,start[2]],yaw:0,altitude:0}).error,'movement_too_fast');
});

test('town chat is attributed, bounded, rate limited and survives checkpoint recovery',()=>{
  const {world,advance,now}=setup();
  assert.equal(world.command('a',{type:'chat',text:'  Hello   Bob!  '}).ok,true);
  assert.deepEqual(world.snapshot().chat.map(({authorId,authorName,text})=>({authorId,authorName,text})),
    [{authorId:'a',authorName:'Alice',text:'Hello Bob!'}]);
  assert.equal(world.command('a',{type:'chat',text:'again'}).error,'chat_cooldown');
  for(const text of ['', ' '.repeat(5), 'x'.repeat(281), 'hi\nthere', '\u202ehello'])
    assert.equal(world.command('b',{type:'chat',text}).error,'invalid_chat');
  assert.equal(world.snapshot().chat.length,1);
  advance(1000);
  assert.equal(world.command('a',{type:'chat',text:'After a pause'}).ok,true);
  for(let i=0;i<42;i++){advance(1000);assert.equal(world.command('a',{type:'chat',text:`Line ${i}`}).ok,true);}
  assert.equal(world.snapshot().chat.length,40);
  assert.equal(world.snapshot().chat[0].text,'Line 2');
  const snapshot=world.snapshot();snapshot.chat[0].text='changed';
  assert.equal(world.snapshot().chat[0].text,'Line 2');
  const restored=createSharedWorld(data,{now});
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))),{ok:true});
  assert.deepEqual(restored.snapshot().chat,world.snapshot().chat);
  assert.equal(restored.command('a',{type:'chat',text:'too soon'}).error,'chat_cooldown');
  world.leave('a');
  assert.equal(world.snapshot().chat[0].authorName,'Alice','history remains readable after departure');
  world.reset();assert.deepEqual(world.snapshot().chat,[]);
});

test('appearance belongs to the authenticated account and survives departure and checkpoint recovery',()=>{
  const {world,advance,now}=setup();
  assert.equal(world.snapshot().players[0].appearance,'sable-human');
  assert.equal(world.command('a',{type:'appearance',appearance:'woman-tailored'}).ok,true);
  assert.equal(world.snapshot().players.find(player=>player.id==='a').appearance,'woman-tailored');
  assert.equal(world.snapshot().players.find(player=>player.id==='b').appearance,'sable-human');
  assert.equal(world.command('b',{type:'appearance',appearance:'man-casual',userId:'a'}).error,'invalid_appearance');
  assert.equal(world.command('b',{type:'appearance',appearance:'unknown'}).error,'invalid_appearance');
  assert.equal(world.command('a',{type:'appearance',appearance:'man-workwear'}).error,'appearance_cooldown');
  world.leave('a');advance(61000);world.step(0.05);
  assert.equal(world.join({userId:'a',name:'Alice again'}).player.appearance,'woman-tailored');
  const restored=createSharedWorld(data,{now});
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))),{ok:true});
  assert.equal(restored.snapshot().players.find(player=>player.id==='a').appearance,'woman-tailored');
  restored.leave('a');
  assert.equal(restored.join({userId:'a',name:'Alice'}).player.appearance,'woman-tailored');
});

const resign=checkpoint=>{checkpoint.checksum=createHash('sha256').update(JSON.stringify({version:checkpoint.version,worldFingerprint:checkpoint.worldFingerprint,payload:checkpoint.payload})).digest('hex');return checkpoint;};

test('older checkpoints cannot restore Jevica to another account',()=>{
  const {world,now}=setup();
  const checkpoint=JSON.parse(JSON.stringify(world.checkpoint()));
  for(const player of checkpoint.payload.players)player.appearance='jevica';
  checkpoint.payload.appearances=checkpoint.payload.appearances.map(([id])=>[id,'jevica']);
  checkpoint.payload.appearances.push(['departed-guest','jevica']);
  resign(checkpoint);
  const restored=createSharedWorld(data,{now});
  assert.deepEqual(restored.restore(checkpoint),{ok:true});
  assert.ok(restored.snapshot().players.every(player=>player.appearance==='sable-human'));
  assert.equal(restored.join({userId:'departed-guest',name:'Returned'}).player.appearance,'sable-human');
});

test('every character form and style is selectable and durable',()=>{
  const {world,advance,now}=setup(),ids=SHARED_APPEARANCES.filter(appearance=>appearance.character!=='jevica').map(appearance=>appearance.id);
  for(const appearance of ids){
    advance(2100);
    assert.equal(world.command('a',{type:'appearance',appearance}).ok,true,appearance);
    assert.equal(world.snapshot().players.find(player=>player.id==='a').appearance,appearance);
  }
  const last=ids.at(-1),restored=createSharedWorld(data,{now});
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))),{ok:true});
  assert.equal(restored.snapshot().players.find(player=>player.id==='a').appearance,last);
  restored.leave('a');
  assert.equal(restored.join({userId:'a',name:'Alice'}).player.appearance,last);
});

test('the retired wolf-eared host becomes his wolf form, live and in an older checkpoint',()=>{
  const {world,now}=setup();
  const chosen=world.command('a',{type:'appearance',appearance:'midnight-host-hybrid'});
  assert.equal(chosen.ok,true);assert.equal(chosen.player.appearance,'midnight-host-wolf');
  const checkpoint=JSON.parse(JSON.stringify(world.checkpoint()));
  for(const player of checkpoint.payload.players)if(player.id==='a')player.appearance='midnight-host-hybrid';
  checkpoint.payload.appearances=checkpoint.payload.appearances.map(([id,appearance])=>[id,id==='a'?'midnight-host-hybrid':appearance]);
  const restored=createSharedWorld(data,{now});
  assert.deepEqual(restored.restore(resign(checkpoint)),{ok:true});
  assert.equal(restored.snapshot().players.find(player=>player.id==='a').appearance,'midnight-host-wolf');
  assert.doesNotMatch(JSON.stringify(restored.checkpoint().payload),/midnight-host-hybrid/);
  restored.leave('a');
  assert.equal(restored.join({userId:'a',name:'Alice'}).player.appearance,'midnight-host-wolf');
});

test('beast movement is an account preference that only shows in a beast form',()=>{
  const {world,advance,now}=setup(),alice=(town=world)=>town.snapshot().players.find(player=>player.id==='a');
  assert.equal(alice().movement,'upright');
  assert.equal(world.command('a',{type:'movement',movement:'beast'}).error,'beast_form_required');
  assert.equal(world.command('a',{type:'appearance',appearance:'kai-noir-beast'}).ok,true);
  const moved=world.command('a',{type:'movement',movement:'beast'});
  assert.equal(moved.ok,true);assert.equal(moved.player.movement,'beast');assert.equal(alice().movement,'beast');
  assert.equal(world.snapshot().players.find(player=>player.id==='b').movement,'upright','only the owner moves like a beast');
  for(const movement of ['prowl',1,null,undefined])assert.equal(world.command('a',{type:'movement',movement}).error,'invalid_movement',String(movement));
  assert.equal(world.command('a',{type:'movement',movement:'beast',userId:'b'}).error,'invalid_movement');
  advance(2100);assert.equal(world.command('a',{type:'appearance',appearance:'kai-noir'}).ok,true);
  assert.equal(alice().movement,'upright','a humanoid form walks upright');
  advance(2100);assert.equal(world.command('a',{type:'appearance',appearance:'kai-explorer-beast'}).ok,true);
  assert.equal(alice().movement,'beast','the preference returns with a beast form');
  world.leave('a');advance(61000);world.step(0.05);
  assert.equal(world.join({userId:'a',name:'Alice'}).player.movement,'beast','it survives leaving town');
  const restored=createSharedWorld(data,{now});
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))),{ok:true});
  assert.equal(alice(restored).movement,'beast','it survives checkpoint recovery');
  assert.equal(restored.command('a',{type:'movement',movement:'upright'}).player.movement,'upright');
  assert.equal(alice(restored).movement,'upright');
  const stale=JSON.parse(JSON.stringify(world.checkpoint()));stale.payload.movements=[['a','sideways']];
  assert.equal(restored.restore(resign(stale)).error,'invalid_checkpoint');
});

test('appearance migration restores a town checkpoint written before player looks existed',()=>{
  const {world,now}=setup(),checkpoint=JSON.parse(JSON.stringify(world.checkpoint()));
  delete checkpoint.payload.appearances;
  delete checkpoint.payload.builds;
  for(const player of checkpoint.payload.players)delete player.appearance;
  for(const [,ledger] of checkpoint.payload.ledgers)delete ledger.appearanceAt;
  checkpoint.checksum=createHash('sha256').update(JSON.stringify({version:checkpoint.version,worldFingerprint:checkpoint.worldFingerprint,payload:checkpoint.payload})).digest('hex');
  const restored=createSharedWorld(data,{now});
  assert.deepEqual(restored.restore(checkpoint),{ok:true});
  assert.ok(restored.snapshot().players.every(player=>player.appearance==='sable-human'));
  assert.equal(restored.command('a',{type:'appearance',appearance:'woman-daywear'}).ok,true);
  assert.deepEqual(restored.snapshot().builds,[]);
});

test('player creations are owned, spatially checked, shared, and durable',()=>{
  const {world,advance,now}=setup();
  const place={type:'build',action:'place',kind:'seat',finish:'rose',position:[-12,3],yaw:0};
  const result=world.command('a',place);
  assert.equal(result.ok,true);assert.equal(result.item.ownerId,'a');assert.equal(result.item.ground,0);
  assert.deepEqual(world.snapshot().builds,[result.item]);
  assert.equal(world.command('b',{type:'build',action:'remove',id:result.item.id}).error,'not_build_owner');
  assert.equal(world.command('b',{...place,position:[-12,3.2]}).error,'blocked_build_site');
  assert.equal(world.command('a',{type:'build',action:'edit',id:result.item.id,position:[-11,3],yaw:Math.PI/2}).ok,true);
  assert.deepEqual(world.snapshot().builds[0].position,[-11,3]);
  assert.equal(world.snapshot().builds[0].yaw,Math.PI/2);
  const copy=world.snapshot();copy.builds[0].position[0]=999;
  assert.equal(world.snapshot().builds[0].position[0],-11);
  world.leave('a');advance(61000);world.step(.05);
  assert.equal(world.join({userId:'a',name:'Alice again'}).ok,true);
  assert.equal(world.snapshot().builds[0].ownerId,'a');
  const restored=createSharedWorld(data,{now});
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))),{ok:true});
  assert.deepEqual(restored.snapshot().builds,world.snapshot().builds);
  assert.equal(restored.command('a',{type:'build',action:'remove',id:result.item.id}).ok,true);
  assert.deepEqual(restored.snapshot().builds,[]);
  world.reset();assert.deepEqual(world.snapshot().builds,[]);
});

test('build commands reject road, invalid position, and forged checkpoint records without mutation',()=>{
  const roads=[{points:[[-12,2],[-12,8]],width_m:3}];
  const blocked=createSharedWorld({...data,roads});blocked.join({userId:'a',name:'Alice'});
  assert.equal(blocked.command('a',{type:'build',action:'place',kind:'lamp',finish:'teal',position:[-12,3],yaw:0}).error,'blocked_build_site');
  const {world,now}=setup(),before=world.snapshot();
  for(const command of [
    {type:'build',action:'place',kind:'lamp',finish:'teal',position:[-12,3],yaw:Infinity},
    {type:'build',action:'place',kind:'unknown',finish:'teal',position:[-12,3],yaw:0},
    {type:'build',action:'place',kind:'lamp',finish:'teal',position:[12,3],yaw:0},
    {type:'build',action:'place',kind:'lamp',finish:'teal',position:[-12,3,0],yaw:0},
  ])assert.equal(world.command('a',command).ok,false);
  const far=world.command('a',{type:'build',action:'place',kind:'lamp',finish:'teal',position:[12,3],yaw:0});
  assert.equal(far.error,'build_out_of_reach');assert.match(far.message,/outside.*ground.*nearby/);
  assert.deepEqual(world.snapshot().builds,before.builds);
  assert.equal(world.command('a',{type:'build',action:'place',kind:'lamp',finish:'teal',position:[-12,3],yaw:0}).ok,true);
  const checkpoint=JSON.parse(JSON.stringify(world.checkpoint()));
  checkpoint.payload.builds[0].ownerId='forged';
  checkpoint.payload.builds[0].position=[0,0];
  checkpoint.checksum=createHash('sha256').update(JSON.stringify({version:checkpoint.version,worldFingerprint:checkpoint.worldFingerprint,payload:checkpoint.payload})).digest('hex');
  const fresh=createSharedWorld(data,{now});
  assert.equal(fresh.restore(checkpoint).error,'invalid_checkpoint');
  assert.deepEqual(fresh.snapshot().builds,[]);
});

test('shared flight and checkpoint restore honor the same tall-roof ceiling as the browser',()=>{
  const tall={...data,buildings:[{center:[0,0,2],size:[6,16,48],ring:data.collisionPolygons[0]}]};
  let time=1000;const world=createSharedWorld(tall,{now:()=>time}),env=createWalkingEnvironment(tall);
  const owner='user_01M40Y914S1H4EJCEHH91DKTAY';
  world.join({userId:owner,name:'Jevica'});const position=world.snapshot().players[0].position;
  for(let altitude=1;altitude<=56;altitude++){
    time+=400;const result=world.command(owner,{type:'pose',position,yaw:0,altitude});
    assert.equal(result.ok,true,`ascent ${altitude}: ${result.error}`);
  }
  assert.equal(env.canFly(0,56,0),true,'clears the tall roof');
  const restored=createSharedWorld(tall,{now:()=>time});assert.equal(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))).ok,true);
  assert.equal(restored.snapshot().players[0].altitude,56);
  assert.equal(world.command(owner,{type:'pose',position,yaw:0,altitude:env.flightCeiling+1}).error,'invalid_pose','server still enforces finite world ceiling');
  assert.equal(world.command(owner,{type:'pose',position,yaw:0,altitude:0}).error,'movement_too_fast','higher ceiling never weakens motion limits');
});

test('two accounts share one authoritative wish and NPC simulation', () => {
  const {world} = setup();
  const before = world.snapshot();
  assert.equal(before.players.length,2);
  assert.equal(travel(world,'local-00').ok,true);
  assert.equal(cast(world).ok,true);
  for(let i=0;i<300;i++) world.step(0.05);
  const after = world.snapshot();
  assert.equal(after.locals[0].wish.phase,'trouble');
  assert.equal(after.locals[0].wish.ownerId,'a');
  assert.ok(after.locals[0].wishDisruption);
  assert.ok(after.locals.some(local=>local.life.distance>0));
  assert.ok(after.revision>before.revision);
  assert.deepEqual(after,world.snapshot());
  after.locals[0].wish.kind='dog';
  assert.equal(world.snapshot().locals[0].wish.kind,'dragon','snapshots cannot mutate shared state');
});

test('shared wish dialogue addresses its account owner instead of a fixed heroine',()=>{
  const {world}=setup();
  assert.equal(travel(world,'local-00').ok,true);
  assert.equal(cast(world).ok,true);
  for(let i=0;i<600;i++)world.step(0.05);
  const wish=world.snapshot().locals[0].wish;
  assert.equal(wish.ownerName,'Alice');
  assert.match(wish.message,/Alice/);
  assert.doesNotMatch(wish.message,/Jevica/);
  assert.match(world.command('a',{type:'undoWish',localId:'local-00'}).message,/Alice/);
});

test('duplicate grants and other-owner undo are atomic rejections',()=>{
  const {world} = setup();
  travel(world,'local-00');travel(world,'local-00','b');
  assert.equal(cast(world).ok,true);
  const before=world.snapshot();
  assert.equal(cast(world).ok,false);
  assert.equal(cast(world,'b').ok,false);
  assert.equal(world.command('b',{type:'undoWish',localId:'local-00'}).ok,false);
  assert.equal(world.snapshot().wishes.granted,1);
  assert.equal(world.snapshot().revision,before.revision);
  assert.equal(world.command('a',{type:'undoWish',localId:'local-00'}).ok,true);
  assert.equal(cast(world).ok,false,'undo does not bypass grant cooldown');
});

test('wish range and sight cannot be bypassed with supplied identity, position or time',()=>{
  const {world}=setup();
  assert.equal(cast(world,'a','local-01').ok,false);
  assert.equal(world.command('a',{type:'wish',localId:'local-01',kind:'dragon',position:[12,0,0],userId:'b',now:1e15}).ok,false);
  assert.equal(world.command('missing',{type:'wish',localId:'local-00',kind:'dragon'}).ok,false);
  assert.equal(world.snapshot().wishes.granted,0);
});

test('poses validate finite types, ground, bounds, travel speed and collision with correction',()=>{
  const {world,advance}=setup(), before=world.snapshot().players[0];
  for(const position of [[NaN,0,0],[Infinity,0,0],['1',0,0],[1,2],[0,0,100],[999,0,0],[12,0,0]]) {
    const result=world.command('a',{type:'pose',position,yaw:0,altitude:0});
    assert.equal(result.ok,false);
    assert.deepEqual(result.correction.position,before.position);
  }
  for(const altitude of [-1,33,NaN,'2']) assert.equal(world.command('a',{type:'pose',position:before.position,yaw:0,altitude}).ok,false);
  advance(1000);
  assert.equal(world.command('a',{type:'pose',position:[-9,0,0],yaw:0,altitude:0}).ok,true);
  advance(1000);
  assert.equal(world.command('a',{type:'pose',position:[1,0,0],yaw:0,altitude:0}).ok,false,'cannot enter solid footprint');
  assert.equal(world.command('a',{type:'pose',position:[-9,0,0],yaw:Infinity,altitude:0}).ok,false);
});

test('packet spam cannot manufacture movement allowance or teleport with client fields',()=>{
  const {world}=setup(), start=world.snapshot().players[0];
  for(let i=0;i<100;i++) {
    const current=world.snapshot().players[0];
    world.command('a',{type:'pose',position:[current.position[0]+0.1,current.position[1],current.position[2]],yaw:0,altitude:0});
  }
  assert.ok(Math.abs(world.snapshot().players[0].position[0]-start.position[0])<=1);
  assert.equal(world.command('a',{type:'travel',position:[12,0,0]}).ok,false);
  assert.equal(travel(world,'local-01').ok,true);
  assert.equal(travel(world,'local-02').ok,false);
});

test('per-account cooldown survives disconnect; departure removes owned disruption',()=>{
  const {world}=setup();travel(world,'local-00');cast(world);
  for(let i=0;i<250;i++)world.step(0.05);
  assert.ok(world.snapshot().locals[0].wishDisruption);
  world.leave('a');
  assert.equal(world.snapshot().locals[0].wish,null);
  assert.equal(world.snapshot().wishes.trouble,0);
  assert.equal(world.join({userId:'a',name:'Alice'}).ok,true);
  assert.equal(cast(world).ok,false);
});

test('active wish cap, bounded simulation delta and trusted reset cleanup',()=>{
  const {world,advance}=setup();
  for(const id of ['local-00','local-01','local-02']) {
    advance(5000);assert.equal(travel(world,id).ok,true);assert.equal(cast(world,'a',id).ok,true);
  }
  advance(5000);travel(world,'local-03');assert.equal(cast(world,'a','local-03').ok,false);
  world.step(Infinity);world.step(-1);
  assert.equal(world.snapshot().locals[0].wish.age,0);
  world.step(1e9);assert.ok(world.snapshot().locals[0].wish.age<=0.25);
  assert.equal(world.command('a',{type:'reset'}).ok,false);
  world.reset();
  assert.equal(world.snapshot().wishes.granted,0);
  assert.ok(world.snapshot().locals.every(local=>!local.wish&&!local.wishDisruption));
});

test('join capacity and duplicate identity preserve original player',()=>{
  const world=createSharedWorld(data,{maxPlayers:1});
  assert.equal(world.join({userId:'a',name:'Alice'}).ok,true);
  assert.equal(world.join({userId:'a',name:'Spoof'}).ok,false);
  assert.equal(world.join({userId:'b',name:'Bob'}).ok,false);
  assert.equal(world.snapshot().players[0].name,'Alice');
});

test('district indoor resident identities match browser; server travel enables same-room wishes',async()=>{
  const district=JSON.parse(await readFile(new URL('../../preview/public/data/district.json',import.meta.url),'utf8'));
  const world=createSharedWorld(district), expected=createCommunity(district,storeRoomsFor(district),{carriage:false});
  assert.ok(!expected.locals.some(local=>local.vehicleRole),'shared towns exclude solo vehicle encounters');
  assert.deepEqual(world.snapshot().locals.map(local=>local.id),expected.locals.map(local=>local.id));
  const indoor=expected.locals.find(local=>local.indoor);
  assert.ok(indoor);
  world.join({userId:'a',name:'Alice'});
  assert.equal(cast(world,'a',indoor.id).ok,false,'cannot cast through shop walls');
  const result=travel(world,indoor.id);assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(cast(world,'a',indoor.id).ok,true);
});

test('support resources and conversation holds are shared and expire',()=>{
  const {world,advance}=setup();travel(world,'local-00');
  assert.equal(world.command('a',{type:'focus',localId:'local-00'}).ok,true);
  const position=world.snapshot().locals[0].position;
  for(let i=0;i<30;i++)world.step(0.05);
  assert.deepEqual(world.snapshot().locals[0].position,position);
  assert.equal(world.command('a',{type:'support',localId:'local-00',action:'ask'}).ok,true);
  assert.equal(world.command('a',{type:'scenario',action:'start'}).ok,true);
  assert.equal(world.command('a',{type:'support',localId:'local-00',action:'supply'}).ok,true);
  assert.equal(world.snapshot().community.supplies,10);
  assert.equal(world.command('a',{type:'support',localId:'local-00',action:'supply'}).ok,false);
  advance(31000);
  for(let i=0;i<100;i++)world.step(0.05);
  assert.notDeepEqual(world.snapshot().locals[0].position,position);
});

test('movement checks the whole segment and altitude rather than only its endpoint',()=>{
  let time=1000;
  const world=createSharedWorld({...data,walkSpawn:[-1.6,0,0],collisionPolygons:[[[-0.2,-5],[0.2,-5],[0.2,5],[-0.2,5]]]}, {now:()=>time});
  const owner='user_01M40Y914S1H4EJCEHH91DKTAY';
  world.join({userId:owner,name:'A'});time+=1000;
  const crossing=world.command(owner,{type:'pose',position:[1.6,0,0],yaw:0,altitude:0});
  assert.equal(crossing.error,'blocked','both endpoints are free but the wall is solid');
  assert.equal(world.command(owner,{type:'pose',position:[-1.6,0,0],yaw:0,altitude:32}).error,'movement_too_fast');
  assert.equal(world.command(owner,{type:'pose',position:[-1.6,0,0],yaw:0,altitude:3}).ok,true);
  time+=1000;
  assert.equal(world.command(owner,{type:'pose',position:[1.6,0,0],yaw:0,altitude:3}).error,'blocked');
  assert.equal(world.command(owner,{type:'pose',position:[-1.6,5,0],yaw:0,altitude:3}).ok,true);
});

test('all district residents have a validated focus destination; malformed travel is rejected',async()=>{
  const district=JSON.parse(await readFile(new URL('../../preview/public/data/district.json',import.meta.url),'utf8'));
  let time=1000;const world=createSharedWorld(district,{now:()=>time});
  world.join({userId:'a',name:'A'});
  for (const local of world.state.locals) {
    time+=1100;
    assert.equal(travel(world,local.id).ok,true,local.id);
  }
  time+=1100;
  const storeId=storeRoomsFor(district)[0].storeId;
  assert.equal(world.command('a',{type:'travel',storeId,localId:123}).ok,false);
  assert.equal(world.command('a',{type:'travel',storeId}).ok,true);
});

test('store travel modes select known collision-free interior and exterior destinations',async()=>{
  const district=JSON.parse(await readFile(new URL('../../preview/public/data/district.json',import.meta.url),'utf8'));
  const {createWalkingEnvironment}=await import('../../preview/src/walking.js');
  const environment=createWalkingEnvironment(district);
  let time=1000;const world=createSharedWorld(district,{now:()=>time});
  world.join({userId:'a',name:'A'});
  for(const store of district.stores) {
    const room=environment.rooms.find(room=>room.storeId===store.id);
    for(const mode of room?['arrive','enter','leave']:['arrive','enter']) {
      time+=1100;
      const result=world.command('a',{type:'travel',storeId:store.id,mode});
      assert.equal(result.ok,true,`${store.id}: ${mode}: ${result.error}`);
      const [east,north]=result.player.position;
      assert.equal(environment.isFree(east,-north),true);
      assert.equal(result.player.altitude,0);
      assert.equal(environment.roomAt(east,-north)?.storeId??null,mode==='enter'&&room?store.id:null,`${store.id}: ${mode}`);
    }
  }
});

test('store travel rejects unknown modes, remote leave and client-supplied destinations',async()=>{
  const district=JSON.parse(await readFile(new URL('../../preview/public/data/district.json',import.meta.url),'utf8'));
  let time=1000;const world=createSharedWorld(district,{now:()=>time});
  const storeId=storeRoomsFor(district)[0].storeId;
  world.join({userId:'a',name:'A'});
  const before=world.snapshot().players[0];
  for(const message of [
    {storeId,mode:'teleport'}, {storeId,mode:42}, {storeId,mode:null},
    {storeId:'missing',mode:'arrive'}, {localId:'local-00',mode:'enter'},
    {storeId,mode:'leave'}, {storeId,mode:'arrive',position:[0,0,0]},
  ]) {
    time+=1100;
    assert.equal(world.command('a',{type:'travel',...message}).ok,false,JSON.stringify(message));
    assert.deepEqual(world.snapshot().players[0],before);
  }
});

test('snapshot exposes volunteer assignments and clones helping metadata',()=>{
  const volunteerData={...data,collisionPolygons:[],communityLocations:Array.from({length:12},(_,i)=>({id:`stop-${i}`,name:`Stop ${i}`,position:[-20+i*3,0,0]}))};
  const world=createSharedWorld(volunteerData);
  world.join({userId:'a',name:'A'});
  const recipient=world.state.locals.find(local=>local.priority);
  assert.equal(travel(world,recipient.id).ok,true);
  assert.equal(world.command('a',{type:'support',localId:recipient.id,action:'ask'}).ok,true);
  assert.equal(world.command('a',{type:'scenario',action:'start'}).ok,true);
  assert.equal(world.command('a',{type:'support',localId:recipient.id,action:'dispatch'}).ok,true);
  world.step(0.05);
  const snapshot=world.snapshot(), job=snapshot.community.jobs[0];
  assert.ok(job.helperId);
  const helper=snapshot.locals.find(local=>local.id===job.helperId);
  assert.equal(helper.life.visitId,job.id);
  assert.equal(helper.life.helping.name,recipient.name);
  helper.life.helping.name='Modified';
  assert.equal(world.snapshot().locals.find(local=>local.id===job.helperId).life.helping.name,recipient.name);
  assert.equal(snapshot.locals.find(local=>local.id!==job.helperId).life.visitId,null);
});

const roundTrip=value=>JSON.parse(JSON.stringify(value));

test('private JSON checkpoint recovers initial cooldown sentinels and preserves exported references',()=>{
  let time=1000;
  const original=createSharedWorld(data,{now:()=>time});
  original.join({userId:'a',name:'A'});
  const checkpoint=roundTrip(original.checkpoint());
  const restored=createSharedWorld(data,{now:()=>time}),stateReference=restored.state,playersReference=restored.players;
  assert.deepEqual(restored.restore(checkpoint),{ok:true});
  assert.equal(restored.state,stateReference);assert.equal(restored.players,playersReference);
  assert.deepEqual(restored.snapshot(),original.snapshot());
  assert.equal(travel(restored,'local-00').ok,true,'initial negative Infinity must not become null/zero and throttle first travel');
  assert.equal(cast(restored).ok,true,'initial negative Infinity must not throttle first wish');
  assert.equal(original.state.locals[0].wish,undefined,'restored state is deeply detached');
  assert.equal(restored.command('a',{type:'restore',checkpoint}).ok,false,'private recovery cannot be invoked by players');
});

test('checkpoint continues moving NPC routes, owned wishes, focus holds and cooldowns identically',()=>{
  let time=10000;
  const original=createSharedWorld(data,{now:()=>time});
  original.join({userId:'a',name:'A'});original.join({userId:'b',name:'B'});
  for(let i=0;i<100;i++)original.step(0.05);
  assert.ok(original.state.locals.some(local=>local.life.route.length>0));
  travel(original,'local-00');travel(original,'local-00','b');cast(original);
  original.command('b',{type:'focus',localId:'local-00'});
  const restored=createSharedWorld(data,{now:()=>time});
  assert.equal(restored.restore(roundTrip(original.checkpoint())).ok,true);
  for(let i=0;i<100;i++) {time+=50;original.step(0.05);restored.step(0.05);}
  assert.deepEqual(restored.snapshot(),original.snapshot());
  assert.deepEqual(restored.checkpoint(),original.checkpoint(),'internal route state also continues identically');
  const both=(userId,message)=>{
    const result=original.command(userId,message);
    assert.deepEqual(restored.command(userId,message),result);
    return result;
  };
  assert.equal(both('b',{type:'undoWish',localId:'local-00'}).error,'not_wish_owner');
  assert.equal(both('a',{type:'wish',localId:'local-00',kind:'dog'}).error,'already_enchanted');
  assert.equal(both('a',{type:'undoWish',localId:'local-00'}).ok,true);
  for(let i=0;i<10;i++) {original.step(0.05);restored.step(0.05);}
  assert.deepEqual(restored.snapshot(),original.snapshot());
  time+=31000;
  for(let i=0;i<80;i++) {original.step(0.05);restored.step(0.05);}
  assert.deepEqual(restored.checkpoint(),original.checkpoint());
});

test('checkpoint preserves movement budgets, wish cooldown and disconnected account ledgers',()=>{
  let time=1000;
  const original=createSharedWorld(data,{now:()=>time});original.join({userId:'a',name:'A'});
  travel(original,'local-00');cast(original);original.command('a',{type:'undoWish',localId:'local-00'});
  const player=original.snapshot().players[0];
  const pose={type:'pose',position:[player.position[0]+0.2,player.position[1],player.position[2]],yaw:0,altitude:0};
  assert.equal(original.command('a',pose).ok,true);
  const restored=createSharedWorld(data,{now:()=>time});
  assert.equal(restored.restore(roundTrip(original.checkpoint())).ok,true);
  const next={...pose,position:[pose.position[0]+0.2,pose.position[1],pose.position[2]]};
  assert.equal(original.command('a',next).error,'movement_too_fast');
  assert.equal(restored.command('a',next).error,'movement_too_fast');
  assert.equal(cast(restored).error,'wish_cooldown');
  original.leave('a');
  const disconnected=createSharedWorld(data,{now:()=>time});
  assert.equal(disconnected.restore(roundTrip(original.checkpoint())).ok,true);
  disconnected.join({userId:'a',name:'A'});
  assert.equal(cast(disconnected).error,'wish_cooldown');
  time+=5000;
  assert.equal(cast(disconnected).ok,true);
});

test('checkpoint preserves an in-progress volunteer route through fresh navigation recovery',()=>{
  let time=1000;
  const volunteerData={...data,collisionPolygons:[],communityLocations:Array.from({length:12},(_,i)=>({id:`stop-${i}`,name:`Stop ${i}`,position:[-20+i*3,0,0]}))};
  const original=createSharedWorld(volunteerData,{now:()=>time});original.join({userId:'a',name:'A'});
  travel(original,'local-00');
  original.command('a',{type:'support',localId:'local-00',action:'ask'});
  original.command('a',{type:'scenario',action:'start'});
  original.command('a',{type:'support',localId:'local-00',action:'dispatch'});
  original.step(0.05);
  assert.ok(original.state.jobs[0].helperId);
  const restored=createSharedWorld(volunteerData,{now:()=>time});
  assert.equal(restored.restore(roundTrip(original.checkpoint())).ok,true);
  for(let i=0;i<200;i++) {time+=50;original.step(0.05);restored.step(0.05);}
  assert.deepEqual(restored.checkpoint(),original.checkpoint());
});

test('corrupt or incompatible checkpoints fail closed without changing the live world',()=>{
  const {world}=setup(),checkpoint=roundTrip(world.checkpoint()),before=world.snapshot();
  const changes=[
    value=>{value.version=999;},
    value=>{value.payload.state.locals[0].id='unknown-resident';},
    value=>{value.payload.state.locals.pop();},
    value=>{value.payload.players[0].moveBudget=100;},
    value=>{value.payload.state.locals[0].position=[null,0,0];},
    value=>{value.payload.state.locals[0].life.route=[[0,0],['bad',1]];},
    value=>{value.payload.ledgers[0][1].wishAt=null;},
  ];
  for(const change of changes) {
    const bad=roundTrip(checkpoint);change(bad);
    assert.equal(world.restore(bad).ok,false);
    assert.deepEqual(world.snapshot(),before);
    // Schema checks remain necessary even if a storage writer recalculates integrity.
    bad.checksum=createHash('sha256').update(JSON.stringify({version:bad.version,worldFingerprint:bad.worldFingerprint,payload:bad.payload})).digest('hex');
    assert.equal(world.restore(bad).ok,false);
    assert.deepEqual(world.snapshot(),before);
  }
  for(const bad of [null,{},[],{version:1,payload:null}])assert.equal(world.restore(bad).ok,false);
  const incompatible=createSharedWorld({...data,bounds_m:[-31,-30,30,30]});
  assert.equal(incompatible.restore(checkpoint).ok,false,'same resident IDs with changed world geometry are incompatible');
});


test('checkpoint JSON preserves infinite resident waits and full district routes',async()=>{
  let time=1000;
  const district=JSON.parse(await readFile(new URL('../../preview/public/data/district.json',import.meta.url),'utf8'));
  const original=createSharedWorld(district,{now:()=>time});original.join({userId:'a',name:'A'});
  for(let i=0;i<80;i++) {time+=50;original.step(0.05);}
  original.state.locals[0].life.waitUntil=Infinity;
  original.state.locals[0].life.route=[];
  const serialized=JSON.stringify(original.checkpoint());
  const restored=createSharedWorld(district,{now:()=>time});
  assert.equal(restored.restore(JSON.parse(serialized)).ok,true);
  assert.equal(restored.state.locals[0].life.waitUntil,Infinity);
  assert.deepEqual(restored.snapshot(),original.snapshot());
  for(let i=0;i<60;i++) {time+=50;original.step(0.05);restored.step(0.05);}
  assert.deepEqual(restored.checkpoint(),original.checkpoint());
  assert.equal('ledgers' in restored.snapshot(),false,'private cooldown ledger is never in client snapshots');
});

test('players arriving together each get their own spot near the spawn', async () => {
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url), 'utf8'));
  data.vegetation = JSON.parse(await readFile(new URL('../../preview/public/data/district-vegetation.json', import.meta.url), 'utf8'));
  const town = createSharedWorld(data);
  const spots = ['a', 'b', 'c', 'd', 'e'].map(id => town.join({ userId: id, name: id, sessionId: id }).player.position);
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
    assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) >= 1.2, `players ${i} and ${j} overlap`);
  }
  assert.ok(spots.every(spot => Math.hypot(spot[0] - spots[0][0], spot[1] - spots[0][1]) < 7), 'everyone still arrives together');
});

test('travel reaches community places and bare positions outdoors, and refuses anything else', () => {
  const {world,advance} = setup();
  const byPlace = world.command('a',{type:'travel',placeId:'c'});
  assert.equal(byPlace.ok,true,'a community place is a destination');
  assert.ok(Math.hypot(byPlace.player.position[0]-0,byPlace.player.position[1]-15)<4.5,'arrives beside the plaza');
  advance(1500);
  const byPoint = world.command('a',{type:'travel',position:[20,-20]});
  assert.equal(byPoint.ok,true,'an open position inside the district is a destination');
  assert.ok(Math.hypot(byPoint.player.position[0]-20,byPoint.player.position[1]+20)<1.3,'lands within a step of the asked-for spot');
  assert.equal(byPoint.player.yaw,byPlace.player.yaw,'a bare position keeps the traveller facing as they were');
  advance(1500);
  assert.equal(world.command('a',{type:'travel',position:[0,0]}).ok,false,'inside a wall is refused, not nudged across it');
  assert.equal(world.command('a',{type:'travel',position:[500,0]}).ok,false,'outside the district is refused');
  assert.equal(world.command('a',{type:'travel',position:[1,'2']}).ok,false);
  assert.equal(world.command('a',{type:'travel',position:[1,2,3]}).ok,false);
  assert.equal(world.command('a',{type:'travel',placeId:'nope'}).ok,false);
  assert.equal(world.command('a',{type:'travel',placeId:'c',position:[20,-20]}).ok,false,'one destination per travel');
  assert.equal(world.command('a',{type:'travel',placeId:'c',mode:'enter'}).ok,false,'modes belong to stores');
  const quick = world.command('a',{type:'travel',placeId:'d'});
  assert.equal(quick.ok,true);
  assert.equal(world.command('a',{type:'travel',placeId:'c'}).ok,false,'the travel cooldown still applies');
});
