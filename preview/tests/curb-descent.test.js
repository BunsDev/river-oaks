import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar} from '../src/avatars.js';
import {createFootPlacement} from '../src/foot-placement.js';

test('curb crossings preserve planned landings, foot reach and body height at navigation steps',async()=>{
  for(const profile of ['woman-casual','woman-daywear','woman-tailored','man-casual','man-tailored','man-workwear','jevica']) {
    const source=await loadCharacterRig(profile);
    for(const hz of [30,60,120]) {
      let descents=0,heightTransitions=0,landings=0;
      for(const ascending of [false,true])for(const edge of [.7,.8,1.1,1.2]) {
        const avatar=instantiateAvatar(source,{targetHeight:profile==='jevica'?1.685:profile.startsWith('woman')?1.66:1.78}),root=new THREE.Group();root.add(avatar.model);
        const placement=createFootPlacement(avatar.model,root),baseY=avatar.model.position.y,previousFeet=new Map();
        const ground=(_x,z)=>1.5+((z< -81+edge)!==ascending?.16:0);let distance=0,previousHeight=null,previousGround=null;
        for(let frame=0;frame<3*hz;frame++) {
          const speed=1.05;distance+=speed/hz;
          root.position.set(40,ground(40,-81+distance),-81+distance);
          avatar.model.position.y=baseY-.018+Math.cos(distance/1.1*Math.PI*4)*.008;
          for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
          placement.update(1/hz,{speed,distance},ground);
          const height=placement.legs[0].thigh.getWorldPosition(new THREE.Vector3()).y;
          if(previousGround!==null&&previousGround!==root.position.y) {
            heightTransitions++;
            assert.ok(Math.abs(height-previousHeight)*hz<2,`${profile} ${hz} Hz navigation step moves body at ${Math.abs(height-previousHeight)*hz} m/s`);
          }
          previousHeight=height;previousGround=root.position.y;
          assert.ok(placement.legs.some(leg=>leg.contact),'Retain planted support');
          for(const leg of placement.legs) {
            assert.ok(leg.error<.003,`${profile} edge ${edge} ${hz} Hz frame ${frame} ${leg.side}: target miss ${leg.error} m`);
            const before=previousFeet.get(leg.side);
            if(before&&!before.contact&&leg.contact) {
              landings++;
              assert.ok(Math.hypot(leg.target.x-before.end[0],leg.target.z-before.end[2])<1e-7,`${profile} ${hz} Hz: land at the planned point without final-frame body overshoot`);
            }
            previousFeet.set(leg.side,{contact:leg.contact,end:leg.swing?.end.toArray()});
            const hip=leg.thigh.getWorldPosition(new THREE.Vector3());
            assert.ok(hip.y-root.position.y>.45,'The body stays above the upper ground surface');
            if(ground(leg.ikTarget.x,leg.ikTarget.z)<root.position.y&&leg.contact)descents++;
          }
        }
        avatar.dispose();
      }
      assert.ok(landings>=24,'Exercise actual shoe landings on both sides of the curb');
      assert.equal(heightTransitions,8,'Exercise four ascent and four descent transitions');
      assert.ok(descents>0,`${profile} ${hz} Hz: exercise a planted foot below the navigation surface`);
    }
  }
});

test('relocating a walker clears the rendered body height transfer',async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig('woman-casual'),{targetHeight:1.66});
  const root=new THREE.Group();root.add(avatar.model);
  const placement=createFootPlacement(avatar.model,root),baseY=avatar.model.position.y;
  const update=(height,x,distance,speed)=>{
    root.position.set(x,height,0);avatar.model.position.y=baseY-.018;
    for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
    placement.update(1/60,{speed,distance},()=>height);
    return placement.legs[0].thigh.getWorldPosition(new THREE.Vector3()).y-height;
  };
  const standing=update(1.66,0,0,0);
  update(1.5,0,.018,1.05);
  assert.ok(avatar.model.position.y>baseY-.018,'Exercise an unfinished descent response');
  const relocated=update(2.5,10,0,0);
  assert.ok(Math.abs(relocated-standing)<1e-6,'A teleport starts at the new standing height, without stale vertical lag');
  avatar.dispose();
});

// A sharp 16 cm curb used to move the hip at up to 1.5 m/s: the step offset
// decayed at 12/s and the pelvis sprang back the instant leg reach freed.
test('a sharp curb descent moves the hip no faster than a person steps down',async()=>{
  for(const profile of ['woman-casual','man-tailored']) {
    const source=await loadCharacterRig(profile);
    for(const hz of [30,60,120])for(const edge of [.7,.8,1.1]) {
      const avatar=instantiateAvatar(source,{targetHeight:profile.startsWith('woman')?1.66:1.78}),root=new THREE.Group();root.add(avatar.model);
      const placement=createFootPlacement(avatar.model,root),baseY=avatar.model.position.y,ground=(_x,z)=>1.5+(z< -81+edge?.16:0);
      let distance=0,previous=null,peak=0;
      for(let frame=0;frame<3*hz;frame++) {
        distance+=1.05/hz;root.position.set(40,ground(40,-81+distance),-81+distance);
        avatar.model.position.y=baseY-.018+Math.cos(distance/1.1*Math.PI*4)*.008;
        for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
        placement.update(1/hz,{speed:1.05,distance},ground);
        const height=placement.legs[0].thigh.getWorldPosition(new THREE.Vector3()).y;
        if(previous!==null)peak=Math.max(peak,Math.abs(height-previous)*hz);
        previous=height;
        for(const leg of placement.legs)assert.ok(leg.error<.005,`${profile} ${hz} Hz: a foot is left out of reach`);
      }
      assert.ok(peak<1.4,`${profile} at ${hz} Hz, edge ${edge}: hip moved at ${peak.toFixed(2)} m/s`);
      avatar.dispose();
    }
  }
});
