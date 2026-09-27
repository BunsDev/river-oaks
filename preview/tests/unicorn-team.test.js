import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { stepCarriage } from '../src/carriage-motion.js';
import { createUnicornTeam } from '../src/unicorn-team.js';
import { carriageContains, carriageFootprint, findCarriageParking } from '../src/carriage-parking.js';

const bytes=readFileSync(new URL('../public/assets/unicorns/horse.glb',import.meta.url));
const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
gltf.materials=gltf.materials.map(({name})=>({name}));delete gltf.images;delete gltf.textures;
gltf.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+jsonLength).toString('base64');
globalThis.ProgressEvent??=class{};
const asset=await new GLTFLoader().parseAsync(JSON.stringify(gltf),'');
test('two independent unicorn rigs walk, stop and keep their rendered hooves above the road',()=>{
  const coach=new THREE.Group();coach.scale.setScalar(.9);coach.position.set(-2768,18.4,1292);coach.rotation.y=.4;
  const scene=new THREE.Scene();scene.add(coach);
  const groundAt=(x,z)=>18.4+.001*(x+2768)+.001*(z-1292);
  const team=createUnicornTeam({scene,coach,groundAt,asset});
  for(let i=0;i<90;i++)team.update(i/60,1/60,2,i/30);
  assert.equal(team.horses.length,2);
  assert.notEqual(team.horses[0].rig.getObjectByName('Head'),team.horses[1].rig.getObjectByName('Head'));
  for(const horse of team.horses){
    assert.ok(Math.abs(horse.holder.position.y-groundAt(horse.holder.position.x,horse.holder.position.z))<.3,'unicorn root stays at road height');
    let min=Infinity;
    horse.rig.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y-groundAt(p.x,p.z));
    }});
    assert.ok(min>=-.001&&min<.03,`rendered contact ${min}`);
  }
  for(let i=0;i<120;i++)team.update(1.5+i/60,1/60,0,3);
  assert.ok(team.inspect().every(h=>h.walkWeight<.01));
  assert.ok(team.inspect().every(h=>h.triangles<45000&&h.horn));
  team.dispose();assert.equal(scene.children.length,1);
  assert.ok(asset.scene.getObjectByName('Head'),'disposal retains the cached source rig');
});
test('unicorns extend the real collision and parking footprint ahead of the coach',()=>{
  const p={position:[0,0,0],yaw:0,scale:.9,team:true};
  assert.equal(carriageContains(p,-5,1,.7,.2),true);
  assert.equal(carriageContains(p,-9,1,0,.2),false);
  assert.ok(Math.min(...carriageFootprint(p).map(v=>v[0]))<=-7);
  const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
  const [x,north]=world.walkSpawn;
  const parked=findCarriageParking(world,{position:[x,1.68,-north]},[],.9,true);
  assert.ok(parked?.team,'the complete team fits near the actual starting point');
});

for(const hz of [30,60,120])test(`planted hooves stay fixed while the team advances at ${hz} Hz`,()=>{
 const scene=new THREE.Scene(),coach=new THREE.Group();coach.scale.setScalar(.9);scene.add(coach);
 const team=createUnicornTeam({scene,coach,groundAt:()=>0,asset}),prior=new Map();let maxSlip=0,minGap=Infinity,worst=null;
 for(let frame=0;frame<hz*5;frame++){
  const distance=frame/hz*1.4;coach.position.x=-distance;coach.updateMatrixWorld(true);team.update(frame/hz,1/hz,1.4,distance);
  for(const [i,h]of team.inspect().entries())for(const [j,foot]of h.hooves.entries()){
   const old=prior.get(`${i}:${j}`);
   if(frame>1&&!foot.swing&&old&&!old.swing&&Math.hypot(...foot.anchor.map((v,k)=>v-old.anchor[k]))<1e-6){const slip=Math.hypot(foot.foot[0]-old.foot[0],foot.foot[2]-old.foot[2]);if(slip>maxSlip){maxSlip=slip;worst={frame,i,j,foot,old};}}
   minGap=Math.min(minGap,foot.clearance);prior.set(`${i}:${j}`,foot);
  }
 }
 assert.ok(maxSlip<.002,`planted slip ${maxSlip} ${JSON.stringify(worst)}`);assert.ok(minGap>=-.003,`sole penetration ${minGap}`);team.dispose();
});

for(const mode of ['reverse','turn'])test(`${mode} preserves planted contacts and continuous swing`,()=>{
 const scene=new THREE.Scene(),coach=new THREE.Group();coach.scale.setScalar(.9);scene.add(coach);
 const team=createUnicornTeam({scene,coach,groundAt:()=>0,asset}),prior=new Map();let distance=0,maxSlip=0,maxJump=0,maxGap=0,worst,jumpWorst;
 for(let frame=0;frame<240;frame++){
  const speed=mode==='reverse'?-1.4:4,travel=speed/60;distance+=travel;
  if(mode==='turn')coach.rotation.y+=travel/3.4*.75;
  coach.position.x-=Math.cos(coach.rotation.y)*travel;coach.position.z+=Math.sin(coach.rotation.y)*travel;
  coach.updateMatrixWorld(true);team.update(frame/60,1/60,speed,distance);
  for(const [i,h]of team.inspect().entries())for(const [j,foot]of h.hooves.entries()){
   const old=prior.get(`${i}:${j}`);
   if(frame>5&&old){const jump=Math.hypot(...foot.foot.map((v,k)=>v-old.foot[k]));if(jump>maxJump){maxJump=jump;jumpWorst={frame,i,j,foot,old};}}
   if(!foot.swing)maxGap=Math.max(maxGap,foot.clearance);
   if(frame>5&&!foot.swing&&old&&!old.swing&&Math.hypot(...foot.anchor.map((v,k)=>v-old.anchor[k]))<1e-6){const slip=Math.hypot(foot.foot[0]-old.foot[0],foot.foot[2]-old.foot[2]);if(slip>maxSlip){maxSlip=slip;worst={frame,i,j,foot,old,hip:team.horses[i].gait.legs[j].upper.getWorldPosition(new THREE.Vector3()).toArray()};}}
   prior.set(`${i}:${j}`,foot);
  }
 }
 assert.ok(maxSlip<.004,`planted slip ${maxSlip} gap ${maxGap} jump ${maxJump} ${JSON.stringify(worst)}`);assert.ok(maxGap<.02,`planted clearance ${maxGap}`);assert.ok(maxJump<.3,`hoof jump ${maxJump} ${JSON.stringify(jumpWorst)}`);team.dispose();
});
test('a nearby summon explicitly clears old hoof anchors',()=>{
 const scene=new THREE.Scene(),coach=new THREE.Group();coach.scale.setScalar(.9);scene.add(coach);
 const team=createUnicornTeam({scene,coach,groundAt:()=>0,asset});
 for(let frame=0;frame<149;frame++){const distance=(frame+1)*1.4/60;coach.position.x=-distance;coach.updateMatrixWorld(true);team.update(frame/60,1/60,1.4,distance);}
 coach.position.x+=1.5;team.reset();coach.updateMatrixWorld(true);
 for(let frame=0;frame<120;frame++)team.update(3+frame/60,1/60,0,0);
 assert.ok(team.inspect().every(h=>h.hooves.every(f=>!f.swing&&Math.abs(f.clearance)<.02)));team.dispose();
});

test('production forward-to-reverse controls preserve walking support and smooth feet',()=>{
 const scene=new THREE.Scene(),coach=new THREE.Group();coach.scale.setScalar(.9);scene.add(coach);
 const team=createUnicornTeam({scene,coach,groundAt:()=>0,asset}),prior=new Map();
 const state={position:[0,0,0],yaw:0,scale:.9,speed:0,distance:0};let maxJump=0,unsupported=0,maxGap=0,maxSlip=0,worst;
 for(let frame=0;frame<600;frame++){
  stepCarriage(state,{groundAt:()=>0,canOccupy:()=>true},{forward:frame<180?1:-1},1/60);
  coach.position.fromArray(state.position);coach.rotation.y=state.yaw;coach.updateMatrixWorld(true);team.update(frame/60,1/60,state.speed,state.distance);
  for(const [i,h]of team.inspect().entries()){
   if(frame>180&&Math.abs(state.speed)<1.5&&h.hooves.every(f=>f.clearance>.02))unsupported++;
   for(const f of h.hooves)if(!f.swing)maxGap=Math.max(maxGap,f.clearance);
   for(const [j,f]of h.hooves.entries()){const key=`${i}:${j}`,old=prior.get(key);if(frame>5&&old){maxJump=Math.max(maxJump,Math.hypot(...f.foot.map((v,k)=>v-old.foot[k])));if(!f.swing&&!old.swing&&Math.hypot(...f.anchor.map((v,k)=>v-old.anchor[k]))<1e-6){const slip=Math.hypot(f.foot[0]-old.foot[0],f.foot[2]-old.foot[2]);if(slip>maxSlip){maxSlip=slip;worst={frame,i,j,f,old};}}}prior.set(key,f);}
  }
 }
 assert.equal(unsupported,0,'walking reversal must retain ground support');assert.ok(maxGap<.02,`stance clearance ${maxGap}`);assert.ok(maxSlip<.004,`stance slip ${maxSlip} ${JSON.stringify(worst)}`);assert.ok(maxJump<.3,`foot discontinuity ${maxJump}`);team.dispose();
});

test('standing unicorns carry their weight upright with foreknees aligned down each leg',()=>{
 const scene=new THREE.Scene(),coach=new THREE.Group();coach.scale.setScalar(.9);scene.add(coach);
 const team=createUnicornTeam({scene,coach,groundAt:()=>0,asset});
 for(let frame=0;frame<120;frame++)team.update(frame/60,1/60,0,0);
 for(const h of team.horses)for(const l of h.gait.legs.filter(l=>l.upper.name.startsWith('Front'))){
  const local=b=>h.rig.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
  const hip=local(l.upper),knee=local(l.lower),foot=local(l.foot),t=(hip.y-knee.y)/(hip.y-foot.y);
  const sideways=Math.abs(knee.x-THREE.MathUtils.lerp(hip.x,foot.x,t));
  assert.ok(sideways<.035,`${l.upper.name} splays sideways by ${sideways} m`);
  assert.ok(hip.y>1.10,`standing body crouches at ${hip.y} m`);
  assert.ok(Math.abs(l.clearance)<.015,`standing sole clearance ${l.clearance}`);
 }
 team.dispose();
});

test('the compact team fits its real street footprint and keeps planted feet grounded',()=>{
 const scene=new THREE.Scene(),coach=new THREE.Group();coach.scale.setScalar(.78);scene.add(coach);
 const team=createUnicornTeam({scene,coach,groundAt:()=>0,asset});
 for(let frame=0;frame<120;frame++)team.update(frame/60,1/60,0,0);
 for(const h of team.horses){
  let front=Infinity;h.rig.traverse(mesh=>{if(!mesh.isMesh)return;if(mesh.isSkinnedMesh)mesh.skeleton.update();
   for(let i=0;i<mesh.geometry.attributes.position.count;i++){
    const p=(mesh.isSkinnedMesh?mesh.getVertexPosition(i,new THREE.Vector3()):new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i)).applyMatrix4(mesh.matrixWorld);
    front=Math.min(front,p.x);
   }
  });
  assert.ok(front>=-8*.78,`unicorn nose extends beyond compact collision envelope: ${front}`);
  assert.ok(h.gait.legs.every(l=>Math.abs(l.clearance)<.015),'compact hooves contact the street');
 }
 const world={bounds_m:[-70,-30,70,30],buildings:[],roads:[{id:'narrow',width_m:5.2,points:[[-60,0,0],[60,0,0]]}]};
 assert.ok(findCarriageParking(world,{position:[0,1.68,-5],roomId:null,altitude:0},[],.78,true),'compact coach fits a 5.2 m street');
 team.dispose();
});
