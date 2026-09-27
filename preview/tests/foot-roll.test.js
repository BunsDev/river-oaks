import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar} from '../src/avatars.js';
import {createFootPlacement} from '../src/foot-placement.js';

test('walking rolls from heel contact to a flexed toe push-off, then settles flat',async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig('woman-casual'),{targetHeight:1.66});
  const root=new THREE.Group();root.add(avatar.model);const placement=createFootPlacement(avatar.model,root);
  const foot=avatar.model.getObjectByName('foot_l'),ball=avatar.model.getObjectByName('ball_l');
  const footRest=foot.getWorldQuaternion(new THREE.Quaternion()),ballRest=ball.quaternion.clone();
  const shoeAxis=new THREE.Vector3(0,0,1).applyQuaternion(footRest.clone().invert());
  let heel=0,toe=0,flex=0,distance=0;
  for(let frame=0;frame<300;frame++) {
    const moving=frame<210;distance+=moving?1.1/60:0;root.position.z=distance;
    avatar.model.position.y=-avatar.source.floor*1.66/avatar.source.height-.16;
    for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
    placement.update(1/60,{speed:moving?1.1:0,distance},()=>0);
    if(placement.legs[0].contact&&moving) {
      const direction=shoeAxis.clone().applyQuaternion(foot.getWorldQuaternion(new THREE.Quaternion()));
      heel=Math.max(heel,Math.atan2(direction.y,direction.z));toe=Math.max(toe,-Math.atan2(direction.y,direction.z));flex=Math.max(flex,ball.quaternion.angleTo(ballRest));
    }
  }
  assert.ok(heel>.10,`Expected a heel-first landing, measured ${heel}rad`);
  assert.ok(toe>.15,`Expected heel lift before toe-off, measured ${toe}rad`);
  assert.ok(flex>.15,`Expected toe articulation, measured ${flex}rad`);
  assert.ok(foot.getWorldQuaternion(new THREE.Quaternion()).angleTo(footRest)<.005,'Stopped shoes settle flat');
  assert.ok(ball.quaternion.angleTo(ballRest)<.005,'Stopped toes return to neutral');
  avatar.dispose();
});

test('rocking contact matches actual skinned sole vertices under translated, rotated and scaled parents',async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig('woman-casual'),{targetHeight:1.66});
  const root=new THREE.Group();root.add(avatar.model);const placement=createFootPlacement(avatar.model,root),previous=new Map();
  root.rotation.y=.7;root.scale.setScalar(1.2);
  const ground=(_x,z)=>.08*z;
  let checked=0;
  for(let frame=0;frame<180;frame++) {
    const distance=frame*1.1/60;root.position.set(20+Math.sin(.7)*distance,0,-10+Math.cos(.7)*distance);root.position.y=ground(root.position.x,root.position.z);
    avatar.model.position.y=-avatar.source.floor*1.66/avatar.source.height-.16;
    for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
    placement.update(1/60,{speed:1.1,distance},ground);root.updateMatrixWorld(true);
    for(const leg of placement.legs) {
      const {mesh,index}=leg.soleSources[leg.rollPose.pivotId],actual=mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),before=previous.get(leg.side);
      assert.ok(actual.distanceTo(leg.supportPoint)<2e-6,`Cached support error ${actual.distanceTo(leg.supportPoint)}m at frame ${frame} / ${leg.side}`);
      if(leg.contact&&before?.contact&&before.pivot===leg.rollPose.pivotId) {
        assert.ok(Math.hypot(actual.x-before.actual.x,actual.z-before.actual.z)<.003,'A planted support point must not slide');checked++;
      }
      previous.set(leg.side,{contact:leg.contact,pivot:leg.rollPose.pivotId,actual});
    }
  }
  assert.ok(checked>100);avatar.dispose();
});

test('relocating a paused walker clears its previous foot roll and toe flex',async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig('woman-casual'),{targetHeight:1.66});
  const root=new THREE.Group();root.add(avatar.model);const placement=createFootPlacement(avatar.model,root);
  for(let frame=0;frame<80;frame++) {
    root.position.z=frame*1.1/60;avatar.model.position.y=-.14;
    for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
    placement.update(1/60,{speed:1.1,distance:frame*1.1/60},()=>0);
  }
  assert.ok(placement.legs.some(leg=>Math.abs(leg.rollPose.angle)>.01));
  root.position.x+=10;avatar.model.position.y=-.14;
  for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
  placement.update(0,{speed:0,distance:80*1.1/60},()=>0);
  for(const leg of placement.legs){assert.equal(leg.rollPose.angle,0);assert.equal(leg.rollPose.flex,0);}
  avatar.dispose();
});

test('heel landings finish the swing without a downward ankle snap',async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig('woman-casual'),{targetHeight:1.66});
  const root=new THREE.Group();root.add(avatar.model);const placement=createFootPlacement(avatar.model,root),previous=new Map();
  let landings=0;
  for(let frame=0;frame<480;frame++) {
    root.position.z=frame*1.1/120;avatar.model.position.y=-.14;
    for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
    placement.update(1/120,{speed:1.1,distance:frame*1.1/120},()=>0);root.updateMatrixWorld(true);
    for(const leg of placement.legs) {
      const position=leg.foot.getWorldPosition(new THREE.Vector3()),before=previous.get(leg.side);
      if(before&&!before.contact&&leg.contact) {landings++;assert.ok(Math.abs(position.y-before.position.y)<.01,`Landing drops ${before.position.y-position.y}m in one frame`);}
      previous.set(leg.side,{position,contact:leg.contact});
    }
  }
  assert.ok(landings>=6);avatar.dispose();
});

test('starting and restarting on uneven ground preserve support without a deep body dip',async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig('woman-casual'),{targetHeight:1.66});
  const root=new THREE.Group();root.add(avatar.model);
  const placement=createFootPlacement(avatar.model,root),baseY=avatar.model.position.y;
  const ground=(_x,z)=>.07*Math.sin(z*Math.PI/1.2);
  let distance=0,previousHeight=null,baseHeight=null;
  for(let frame=0;frame<=900;frame++) {
    const speed=frame<240||frame>=420&&frame<660?1.1:0;
    distance+=speed/120;root.position.set(0,ground(0,distance),distance);avatar.model.position.y=baseY-.018;
    for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
    placement.update(1/120,{speed,distance},ground);
    const height=placement.legs[0].thigh.getWorldPosition(new THREE.Vector3()).y-root.position.y;
    if(baseHeight===null)baseHeight=height;
    assert.ok(baseHeight-height<.12,`Body drops ${baseHeight-height}m during a start or restart`);
    if(previousHeight!==null)assert.ok(Math.abs(height-previousHeight)*120<1,`Body speed ${Math.abs(height-previousHeight)*120}m/s`);
    assert.ok(placement.legs.some(leg=>leg.contact),'Retain planted support');
    for(const leg of placement.legs)assert.ok(leg.error<.005);
    previousHeight=height;
  }
  assert.ok(Math.abs(previousHeight-baseHeight)<.01,'Return to standing height');
  avatar.dispose();
});
