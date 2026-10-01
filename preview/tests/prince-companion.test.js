import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPANION_STANCES,companionSlot,companionStanceEligible,createCompanionBody,createCompanionBrain,freeSpotNear,localStance,playerHeading,stepCompanion} from '../src/prince-companion.js';

const open={isFree:()=>true,groundAt:()=>0};
const walk=(body,target,env,seconds,options)=>{for(let t=0;t<seconds;t+=1/60)stepCompanion(body,target,env,1/60,options);return body;};

test('stances place Prince Jev beside, ahead or behind Jevica in her travel frame',()=>{
  const heading=playerHeading({velocity:[0,1.4]});assert.equal(heading,0);
  const beside=companionSlot([0,0],heading,'beside',open.isFree).point;
  assert.ok(Math.abs(Math.hypot(...beside)-.87)<.02&&Math.abs(beside[0])>.8);
  assert.ok(companionSlot([0,0],heading,'lead',open.isFree).point[1]>1.2);
  assert.ok(companionSlot([0,0],heading,'trail',open.isFree).point[1]<-1);
  assert.equal(companionSlot([0,0],heading,'pause',open.isFree),null);
  assert.equal(playerHeading({velocity:[0,0]},1.2),1.2);
});

test('a blocked side mirrors, then narrow paths fall back to single file',()=>{
  const right=companionSlot([0,0],0,'beside',(x)=>x<.5);
  assert.ok(right.point[0]<0&&right.side===-1);
  const narrow=companionSlot([0,0],0,'beside',(x)=>Math.abs(x)<.3);
  assert.ok(narrow.point[1]<-1&&Math.abs(narrow.point[0])<.3);
  assert.equal(companionSlot([0,0],0,'beside',()=>false),null,'No invented fallback inside a wall');
});

test('Jev rejects stale generations and actions that became unsafe during inference',async()=>{
  for(const changed of [{generation:-1},{candidate_id:'return'},{}]) {
    let resolve,packet;
    const brain=createCompanionBrain({decide:p=>{packet=p;return new Promise(done=>{resolve=done;});}});
    brain.update({player_speed:1.4,gap_m:1});
    if(!Object.keys(changed).length)brain.update({player_speed:1.4,gap_m:1,flying:true});
    resolve({schema_version:1,tick:packet.tick,generation:packet.generation,candidate_id:'lead',source:'jev',confidence:1,...changed});
    await new Promise(done=>setImmediate(done));
    assert.equal(brain.status.decisions,0);assert.notEqual(brain.status.source,'jev');
    brain.reset();
  }
});

test('cached Jev stances are revalidated during cooldown and while the next request is pending',async()=>{
  const cases=[
    {stance:'lead',before:{player_speed:1.4,gap_m:1},change:{indoor:true}},
    {stance:'lead',before:{player_speed:1.4,gap_m:1},change:{crowded:true}},
    {stance:'lead',before:{player_speed:1.4,gap_m:1},change:{narrow:true}},
    {stance:'pause',before:{player_speed:0,gap_m:1},change:{gap_m:4}},
  ];
  for(const pending of [false,true])for(const {stance,before,change} of cases) {
    let clock=0,calls=0,resolveNext;
    const brain=createCompanionBrain({now:()=>clock,decide:packet=>{
      const reply={schema_version:1,tick:packet.tick,generation:packet.generation,candidate_id:stance,source:'jev',confidence:1};
      if(++calls===1)return Promise.resolve(reply);
      return new Promise(resolve=>{resolveNext=()=>resolve(reply);});
    }});
    try {
      brain.update(before);await new Promise(done=>setImmediate(done));
      assert.equal(brain.status.stance,stance);assert.equal(brain.status.source,'jev');
      if(pending){clock=2500;brain.update(before);}
      clock+=200;const status=brain.update({...before,...change});
      assert.equal(status.stance,'trail',`${stance} must stop after ${JSON.stringify(change)} (${pending?'pending':'cooldown'})`);
      assert.equal(status.source,'local');assert.equal(status.reason,'context_changed');assert.equal(status.decisions,1);
      assert.equal(calls,pending?2:1,'Safety revalidation does not bypass the inference cadence');
    }finally{resolveNext?.();await new Promise(done=>setImmediate(done));brain.dispose();}
  }
});

test('an active courtly bow completes its short hold but stops when Jevica resumes walking',async()=>{
  let clock=0;
  const brain=createCompanionBrain({now:()=>clock,decide:async packet=>({schema_version:1,tick:packet.tick,generation:packet.generation,candidate_id:'greet',source:'jev',confidence:1})});
  try {
    brain.update({player_speed:0,gap_m:1});await new Promise(done=>setImmediate(done));
    clock=200;assert.equal(brain.update({player_speed:0,gap_m:1}).stance,'greet');
    assert.equal(brain.status.source,'jev');assert.equal(brain.greetedRecently,true);
    clock=400;const status=brain.update({player_speed:1.4,gap_m:1});
    assert.equal(status.stance,'beside');assert.equal(status.source,'local');
  }finally{brain.dispose();}
});

test('reset and dispose cancel inference even when a provider ignores abort',async()=>{
  let resolve,packet,signal;
  const brain=createCompanionBrain({decide:(p,s)=>{packet=p;signal=s;return new Promise(done=>{resolve=done;});}});
  brain.update({player_speed:1,gap_m:1});brain.reset();assert.equal(signal.aborted,true);
  resolve({schema_version:1,tick:packet.tick,generation:packet.generation,candidate_id:'lead',source:'jev',confidence:1});
  await new Promise(done=>setImmediate(done));assert.equal(brain.status.decisions,0);
  assert.equal(typeof brain.dispose,'function');brain.dispose();brain.update({player_speed:1,gap_m:1});
  assert.equal(brain.status.decisions,0);
});

test('fallback catches up through shops and waits safely when Jevica flies',()=>{
  assert.equal(localStance({indoor:true,player_speed:0,gap_m:6}),'trail');
  assert.equal(localStance({indoor:true,player_speed:0,gap_m:2.2}),'trail','He closes the remaining doorway gap before waiting');
  assert.equal(companionStanceEligible('pause',{player_speed:0,gap_m:2.2}),false);
  assert.equal(localStance({indoor:true,player_speed:0,gap_m:1.5}),'pause');
  assert.equal(localStance({flying:true,player_speed:4,gap_m:10}),'pause');
});

test('he keeps pace, settles at the slot and never enters walls or her personal space',()=>{
  const body=createCompanionBody([0,-6]);
  walk(body,[0,0],open,6,{});
  assert.ok(Math.hypot(...body.position)<.15);assert.ok(body.speed<.3);
  const wall={isFree:(x,z)=>z<2,groundAt:()=>0},blocked=walk(createCompanionBody([0,0]),[0,5],wall,4,{});
  assert.ok(blocked.position[1]<2);
  const kerb={isFree:()=>true,groundAt:(x,z)=>z>1?1:0},stopped=walk(createCompanionBody([0,0]),[0,4],kerb,4,{});
  assert.ok(stopped.position[1]<=1.02,'a step taller than 40 cm is not climbed');
  const guarded=walk(createCompanionBody([0,-3]),[0,0],open,5,{player:[0,0]});
  assert.ok(Math.hypot(...guarded.position)>=.6);
});

test('his pace changes build over several frames and settle without a jolt',()=>{
  const body=createCompanionBody([0,-6]),accelerations=[];let previous=0;
  for(let i=0;i<60;i++){stepCompanion(body,[0,0],open,1/60,{playerSpeed:1.1});accelerations.push((body.speed-previous)*60);previous=body.speed;}
  const peak=Math.max(...accelerations),peakFrame=accelerations.indexOf(peak);
  assert.ok(peakFrame>=2&&accelerations[0]<peak*.6,`peak ${peak.toFixed(2)} m/s² lands on frame ${peakFrame}; first frame ${accelerations[0].toFixed(2)}`);
  assert.ok(peak<16,`a catch-up start of ${peak.toFixed(2)} m/s² is a jolt`);
  const settled=walk(createCompanionBody([0,-6]),[0,0],open,6,{});
  assert.ok(Math.hypot(...settled.position)<.15&&settled.speed<.3,'he still arrives and settles at the slot');
});

test('while standing he turns to face Jevica and while walking he faces travel',()=>{
  const body=walk(createCompanionBody([0,0],0),null,open,2,{face:Math.PI/2});
  assert.ok(Math.abs(body.heading-Math.PI/2)<.01);
  walk(body,[0,-5],open,1,{});assert.ok(Math.abs(Math.abs(body.heading)-Math.PI)<.2);
});

test('free spots are found around a blocked centre',()=>{
  const spot=freeSpotNear([0,0],(x,z)=>Math.hypot(x,z)>1.5);
  assert.ok(spot&&Math.hypot(...spot)>1.5&&Math.hypot(...spot)<2.5);
  assert.equal(freeSpotNear([0,0],()=>false),null);
});

test('local stand-in stance is only a fallback and mirrors the policy',()=>{
  assert.equal(localStance({riding:true}),'return');
  assert.equal(localStance({player_speed:0}),'pause');
  assert.equal(localStance({player_speed:1.4,crowded:true}),'trail');
  assert.equal(localStance({player_speed:1.4}),'beside');
  assert.deepEqual(Object.keys(COMPANION_STANCES),['beside','lead','trail','pause','greet','return']);
});

test('Jev controls the stance; offline or uncertain replies are labelled local',async()=>{
  let clock=0,reply={schema_version:1,tick:1,source:'jev',candidate_id:'lead',confidence:.9};const packets=[];
  const brain=createCompanionBrain({now:()=>clock,decide:async packet=>{packets.push(packet);return {...reply,tick:packet.tick,generation:packet.generation};}});
  brain.update({player_speed:1.4,gap_m:1});await new Promise(r=>setTimeout(r,0));
  assert.equal(brain.status.stance,'lead');assert.equal(brain.status.source,'jev');assert.equal(brain.status.decisions,1);
  assert.equal(packets[0].candidates.length,6);assert.equal(packets[0].schema_version,1);
  reply={schema_version:1,source:'uncertain',candidate_id:null,reason:'low_confidence'};clock+=3000;
  brain.update({player_speed:1.4,gap_m:1});await new Promise(r=>setTimeout(r,0));
  assert.equal(brain.status.source,'local');assert.equal(brain.status.stance,'beside');assert.equal(brain.status.reason,'low_confidence');
  reply={schema_version:1,source:'jev',candidate_id:'greet',confidence:.9};clock+=3000;
  brain.update({player_speed:0,gap_m:1});await new Promise(r=>setTimeout(r,0));
  assert.equal(brain.status.stance,'greet');assert.equal(brain.greetedRecently,true);
  clock+=2700;brain.update({player_speed:0,gap_m:1});assert.equal(brain.status.stance,'pause');
  const offline=createCompanionBrain({now:()=>0,decide:async()=>{throw new Error('down');}});
  offline.update({player_speed:1.4});await new Promise(r=>setTimeout(r,0));
  assert.equal(offline.status.source,'local');assert.equal(offline.status.reason,'offline');
  assert.equal(offline.update({riding:true}).stance,'return');
});

test('in the real district he keeps pace beside a walking Jevica without entering buildings',async()=>{
  const fs=await import('node:fs'),{createWalkingEnvironment,createWalkingState,stepWalking}=await import('../src/walking.js');
  const world=JSON.parse(fs.readFileSync('preview/public/data/district.json'));
  const environment=createWalkingEnvironment(world),player=createWalkingState(environment);
  const start=freeSpotNear([player.position[0],player.position[2]],environment.isFree,{start:2});
  const body=createCompanionBody(start);let heading=0,worst=0,closest=Infinity,total=0,samples=0;
  for(let frame=0;frame<60*24;frame++) {
    // Walk, then turn, then stand: the prince must follow each change.
    const t=frame/60,input=t<16?{forward:1,turn:t>8&&t<9.2?1:0}:{};
    stepWalking(player,environment,input,1/60);
    const me=[player.position[0],player.position[2]];heading=playerHeading({velocity:player.velocity},heading);
    const slot=companionSlot(me,heading,t<16?'beside':'pause',environment.isFree);
    stepCompanion(body,slot?.point??null,environment,1/60,{player:me,playerSpeed:player.speed,face:Math.atan2(me[0]-body.position[0],me[1]-body.position[1])});
    assert.ok(environment.isFree(...body.position),'never inside a footprint');
    const gap=Math.hypot(me[0]-body.position[0],me[1]-body.position[1]);closest=Math.min(closest,gap);
    if(t>3){worst=Math.max(worst,gap);total+=gap;samples++;}
  }
  assert.ok(Math.hypot(player.position[0]-start[0],player.position[2]-start[1])>10,'Jevica actually travelled');
  assert.ok(worst<3.2,`gap stayed bounded (${worst.toFixed(2)} m)`);
  assert.ok(total/samples<1.6,`mean gap ${(total/samples).toFixed(2)} m`);
  assert.ok(closest>=.55,'personal space respected');
});

test('Prince Jev ships as a dedicated rigged hero mesh with blinks, detailed eyes and his suit',async()=>{
  const fs=await import('node:fs'),file=fs.readFileSync('preview/public/assets/characters/prince-jev.glb');
  const gltf=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)));
  const names=gltf.meshes.map(m=>m.name),materials=gltf.materials.map(m=>m.name);
  for(const part of ['male_elegantsuit01','shoes03','short02','high-poly','eyebrow001','eyelashes01'])assert.ok(names.some(n=>n.startsWith(part)),part);
  assert.ok(materials.includes('middleage_african_male'),'skin material keeps the name head fitting and styling expect');
  assert.ok(gltf.meshes.some(m=>m.extras?.targetNames?.includes('eyeBlinkLeft')&&m.extras.targetNames.includes('eyeBlinkRight')));
  assert.equal(gltf.skins.length,1);assert.ok(gltf.skins[0].joints.length>=53);
  const manifest=JSON.parse(fs.readFileSync('preview/public/assets/characters/prince-jev.sources.json'));
  assert.equal(manifest.bytes,file.length);assert.ok(file.length<12*1024*1024);
  const {createHash}=await import('node:crypto'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.equal(manifest.sha256,sha(file));
  assert.equal(manifest.appearance_reference.id,'local-11');
  assert.equal(manifest.appearance_reference.sha256,sha(fs.readFileSync('preview/public/assets/characters/man-workwear.glb')));
});

test('Jev keeps up with her brisk walking pace without entering her personal space',()=>{
 const body=createCompanionBody([.86,-1]);let player=[0,0],worst=0;
 for(let frame=0;frame<1200;frame++){player=[0,frame/60*3.2];const target=companionSlot(player,0,'beside',open.isFree).point;stepCompanion(body,target,open,1/60,{player,playerSpeed:3.2});if(frame>180)worst=Math.max(worst,Math.hypot(body.position[0]-player[0],body.position[1]-player[1]));}
 assert.ok(worst<1.3,`stays beside her at a brisk pace: ${worst}`);
 const before=[...body.position];stepCompanion(body,null,open,1/60,{player,playerSpeed:0});assert.ok(Math.hypot(body.position[0]-before[0],body.position[1]-before[1])<.07);
});

test('protective positioning chooses the street-facing side without controlling Jevica',async()=>{
 const {protectiveSide}=await import('../src/prince-companion.js');const world={roads:[{kind:'service',points:[[-4,-20],[-4,20]]}]};
 assert.equal(protectiveSide(world,[0,0],0),-1);
 assert.equal(protectiveSide(world,[0,0],Math.PI),1);
});
