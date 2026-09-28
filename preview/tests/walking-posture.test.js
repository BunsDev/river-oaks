import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar, AVATAR_PROFILES} from '../src/avatars.js';
import {createFootPlacement} from '../src/foot-placement.js';
import {createUpperBodyGait} from '../src/upper-body-gait.js';
import {createAngelWings, WING_SCALE} from '../src/angel-wings.js';
import {glideAmount, HOVER_LEAN, GLIDE_PITCH} from '../src/prince-flight.js';

const P=(avatar,name)=>avatar.model.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const reset=avatar=>{for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);};
const knee=(avatar,side)=>{const hip=P(avatar,`thigh_${side}`),joint=P(avatar,`calf_${side}`),ankle=P(avatar,`foot_${side}`);return 180-hip.sub(joint).angleTo(ankle.sub(joint))*180/Math.PI;};

// Natural walking straightens the stance knee near midstance (about 5–15°);
// a crouched walk keeps it bent 30–40° throughout. Arms swing about 25–35°.
test('walkers straighten the stance knee and swing their arms like people, on every rig',async()=>{
  for(const profile of [...AVATAR_PROFILES,'jevica']) {
    const avatar=instantiateAvatar(await loadCharacterRig(profile),{targetHeight:1.7}),root=new THREE.Group();root.add(avatar.model);
    const feet=createFootPlacement(avatar.model,root),motion=createUpperBodyGait(avatar,root,{armSwing:profile==='jevica'?.34:.42});
    const baseY=avatar.model.position.y;let stanceMin=Infinity,swingMax=0;const hand={min:Infinity,max:-Infinity};
    for(let frame=0;frame<240;frame++) {
      reset(avatar);avatar.model.position.y=baseY-.004;root.position.z=frame*1.1/60;
      feet.update(1/60,{speed:1.1,distance:root.position.z},()=>0);motion.update(1/60,1.1,feet.legs);
      if(frame<90)continue;
      avatar.model.updateMatrixWorld(true);
      for(const leg of feet.legs){const angle=knee(avatar,leg.side);if(leg.contact)stanceMin=Math.min(stanceMin,angle);else swingMax=Math.max(swingMax,angle);}
      const offset=P(avatar,'hand_l').z-P(avatar,'thigh_l').z;hand.min=Math.min(hand.min,offset);hand.max=Math.max(hand.max,offset);
    }
    assert.ok(stanceMin<16,`${profile}: the stance knee straightens near midstance (${stanceMin.toFixed(1)}°)`);
    assert.ok(swingMax>40,`${profile}: the swing knee still clears the ground (${swingMax.toFixed(1)}°)`);
    assert.ok(hand.max-hand.min>.1,`${profile}: the hand travels with the stride (${(hand.max-hand.min).toFixed(3)} m)`);
    motion.dispose();avatar.dispose();
  }
});

test('Jev’s wings are 12–25% smaller than the original 7.6 m span',()=>{
  const wings=createAngelWings({reducedMotion:true});
  try {
    for(let i=0;i<120;i++)wings.update(i*16,1/60,{amount:1});
    wings.object.updateMatrixWorld(true);
    // Measure every feather instance, not the group's loose bounds.
    let min=Infinity,max=-Infinity;const matrix=new THREE.Matrix4(),box=new THREE.Box3();
    wings.object.traverse(mesh=>{if(!mesh.isInstancedMesh)return;mesh.geometry.computeBoundingBox();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);box.copy(mesh.geometry.boundingBox).applyMatrix4(matrix.premultiply(mesh.matrixWorld));min=Math.min(min,box.min.x);max=Math.max(max,box.max.x);}});
    const span=max-min,original=7.58;
    assert.equal(WING_SCALE,.8);
    assert.ok(span<original*.88&&span>original*.75,`wingspan ${span.toFixed(2)} m is ${Math.round((1-span/original)*100)}% smaller`);
  }finally{wings.dispose();}
});

test('flight blends from a leaning hover to a horizontal glide by body pitch',()=>{
  assert.equal(glideAmount(HOVER_LEAN),0);assert.equal(glideAmount(GLIDE_PITCH),1);
  assert.equal(glideAmount(0),0,'upright is still the hover pose');
  assert.ok(Math.abs(glideAmount((HOVER_LEAN+GLIDE_PITCH)/2)-.5)<1e-9);
});
