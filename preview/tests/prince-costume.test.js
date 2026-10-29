import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {avatarProfile,instantiateAvatar} from '../src/avatars.js';
import {createPrinceCostume} from '../src/prince-costume.js';

test('Jev borrows Owen\'s actual head shape and hairstyle while keeping the dedicated prince rig',async()=>{
  assert.equal(avatarProfile(11),'man-workwear','Owen is local-11');
  const [jev,owen]=await Promise.all([loadCharacterRig('prince-jev'),loadCharacterRig(avatarProfile(11))]);
  const samples=source=>{
    const result=new Map(),origin=source.scene.getObjectByName('head').getWorldPosition(new THREE.Vector3());
    source.scene.traverse(mesh=>{
      if(!mesh.isSkinnedMesh||! /^(young|middleage|old)_/.test(mesh.material?.name??''))return;
      mesh.skeleton.update();const index=mesh.skeleton.bones.findIndex(bone=>bone.name==='head');
      const {position,uv,skinIndex,skinWeight}=mesh.geometry.attributes;
      for(let i=0;i<position.count;i++) {
        let weight=0;for(let k=0;k<4;k++)if(skinIndex.getComponent(i,k)===index)weight+=skinWeight.getComponent(i,k);
        if(weight<.999)continue;
        const vertex=new THREE.Vector3().fromBufferAttribute(position,i);
        mesh.applyBoneTransform(i,vertex).applyMatrix4(mesh.matrixWorld).sub(origin);
        result.set(`${uv.getX(i).toFixed(5)},${uv.getY(i).toFixed(5)}`,vertex);
      }
    });return result;
  };
  const prince=samples(jev),reference=samples(owen),pairs=[...prince].filter(([uv])=>reference.has(uv)).map(([uv,point])=>[point,reference.get(uv)]);
  assert.ok(pairs.length>300,'Compare shared face vertices, not a guessed bounding box');
  const scale=pairs.reduce((sum,[a,b])=>sum+a.dot(b),0)/pairs.reduce((sum,[,b])=>sum+b.lengthSq(),0);
  const rms=Math.sqrt(pairs.reduce((sum,[a,b])=>sum+a.distanceToSquared(b.clone().multiplyScalar(scale)),0)/pairs.length);
  assert.ok(rms<.0001,`Owen head shape is preserved after uniform hero sizing (${(rms*1000).toFixed(4)} mm RMS)`);
  let hair=false;jev.scene.traverse(mesh=>{if(mesh.isMesh&&/^short02/.test(mesh.material?.name??''))hair=true;});
  assert.equal(hair,true,'Jev uses Owen\'s short02 hairstyle');
});

test('Prince Jev retains the dedicated hero geometry and facial rig with isolated caramel, fair and cream-tunic materials',async()=>{
  const source=await loadCharacterRig('prince-jev'),rig=instantiateAvatar(source,{targetHeight:1.805}),object=new THREE.Group();object.add(rig.model);
  const geometry=new Map();rig.model.traverse(mesh=>{if(mesh.isMesh)geometry.set(mesh,mesh.geometry);});
  const donor=new THREE.Texture(),costume=createPrinceCostume({object,rig},{skinTexture:donor});
  try {
    const skin=[...rig.materials].find(([source])=>/^middleage_/.test(source.name))[1],hair=[...rig.materials].find(([source])=>/^short/.test(source.name))[1];
    assert.equal(skin.map,donor,'The young light-skin atlas replaces the older dark baked texture');
    assert.equal(hair.color.getHexString(),'9a6530','caramel curls (2026-10-29 reference)');
    assert.ok(costume.materials.some(material=>material.name==='Prince Jev cream tunic'&&material.color.getHexString()==='e9d4ad'));
    assert.ok(costume.materials.some(material=>material.name==='Prince Jev sandal feet'));
    // The suit, boots and hair are dressed on private clones (piece labels, a
    // little hair volume); the body, eyes, brows, lashes and every weight stay.
    const clones=new Set(costume.garmentClones);
    for(const [mesh,original]of geometry){
      if(!clones.has(mesh)){assert.equal(mesh.geometry,original,'Hero body, facial details and weights remain intact');continue;}
      assert.notEqual(mesh.geometry,original);assert.equal(mesh.geometry.attributes.position.count,original.attributes.position.count);
      assert.equal(original.attributes.garment,undefined,'the shared template geometry is never labelled');
      assert.deepEqual(mesh.geometry.attributes.skinWeight.array,original.attributes.skinWeight.array,'the donor skin weights carry over');
    }
    const suit=[...geometry.keys()].find(mesh=>/suit/i.test(mesh.material?.name)||mesh.material?.name==='Prince Jev cream tunic'),labels=suit.geometry.attributes.garment.array;
    assert.ok(labels.some(v=>v===1)&&labels.some(v=>v===0),'the one suit mesh is labelled tunic and trousers');
    assert.ok([...geometry.keys()].some(mesh=>mesh.morphTargetDictionary?.eyeBlinkLeft!==undefined));
    for(const [original]of rig.materials)assert.equal(original.color.getHexString(),'ffffff','Other residents keep their source materials');
  }finally{costume.dispose();rig.dispose();}
});

test('the shopping bag follows the animated hero hand at real scale and is released on disposal',async()=>{
  const source=await loadCharacterRig('prince-jev'),rig=instantiateAvatar(source,{targetHeight:1.805}),object=new THREE.Group();object.add(rig.model);
  const costume=createPrinceCostume({object,rig});
  try {
    assert.ok(costume.bag,'Companionship needs a rendered shopping bag');assert.equal(costume.bag.visible,false);
    object.position.set(12,.2,-4);object.rotation.y=.8;rig.model.getObjectByName('upperarm_r').rotation.x+=.2;costume.update({carrying:true});
    assert.equal(costume.bag.visible,true);
    assert.ok(costume.bag.getWorldPosition(new THREE.Vector3()).distanceTo(rig.model.getObjectByName('hand_r').getWorldPosition(new THREE.Vector3()))<1e-8);
    const size=new THREE.Box3().setFromObject(costume.bag).getSize(new THREE.Vector3());assert.ok(size.y>.3&&size.y<.6);
    costume.update({carrying:false});assert.equal(costume.bag.visible,false);
    let disposed=0;costume.bag.traverse(mesh=>mesh.geometry?.addEventListener('dispose',()=>disposed++));
    costume.dispose();assert.equal(costume.bag.parent,null);assert.ok(disposed>=3);
  }finally{rig.dispose();}
});

test('the belt, bracers and sandal straps are fitted to the garments, the dress uniform is gone, and fine facial cards keep soft edges',async()=>{
  const source=await loadCharacterRig('prince-jev'),rig=instantiateAvatar(source,{targetHeight:1.86}),object=new THREE.Group();object.add(rig.model);
  const costume=createPrinceCostume({object,rig});
  try {
    costume.update();object.updateWorldMatrix(true,true);
    const fitted=costume.fitted,vertex=new THREE.Vector3();
    // Clearance of a bone group's rose-gold vertices over the measured garment surface, in mm.
    const clearance=(limb,slot,low,high)=>{
      const u=new THREE.Vector3().crossVectors(limb.axis,Math.abs(limb.axis.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0)).normalize(),w=new THREE.Vector3().crossVectors(limb.axis,u);
      let min=Infinity,max=-Infinity,samples=0;
      for(const mesh of slot.group.children){
        if(!mesh.isMesh)continue;mesh.updateWorldMatrix(true,false);const {position}=mesh.geometry.attributes;
        for(let i=0;i<position.count;i++){
          vertex.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);object.worldToLocal(vertex).sub(limb.origin);
          const t=vertex.dot(limb.axis);if(t<low||t>high)continue;
          const radial=vertex.clone().addScaledVector(limb.axis,-t),gap=(radial.length()-limb.radiusAt(Math.atan2(radial.dot(w),radial.dot(u)),t))*1000;
          min=Math.min(min,gap);max=Math.max(max,gap);samples++;
        }
      }
      return {min,max,samples};
    };
    assert.equal(fitted.bracers.length,2);assert.equal(fitted.calves.length,2);assert.equal(fitted.feet.length,2);assert.ok(fitted.waist&&fitted.torso);
    for(const bracer of fitted.bracers){
      const gap=clearance(bracer.limb,bracer.slot,bracer.low-.01,bracer.high+.01);
      assert.ok(gap.samples>200&&gap.min>=2&&gap.max<=12,`${bracer.bone} bracer hugs the sleeve: ${JSON.stringify(gap)}`);
    }
    for(const calf of fitted.calves){
      const gap=clearance(calf.limb,calf.slot,calf.knee-.02,calf.ankle+.02);
      assert.ok(gap.samples>1000&&gap.min>=3&&gap.max<=12,`${calf.bone} straps hug the trouser leg: ${JSON.stringify(gap)}`);
    }
    // The belt band (away from the buckle at the front) sits on the tunic.
    {
      const {slot,height}=fitted.waist,torso=fitted.torso;let min=Infinity,max=-Infinity,samples=0;
      for(const mesh of slot.group.children){
        mesh.updateWorldMatrix(true,false);const {position}=mesh.geometry.attributes;
        for(let i=0;i<position.count;i++){
          vertex.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);object.worldToLocal(vertex);
          if(Math.abs(vertex.y-height)>.03||Math.abs(Math.atan2(vertex.x,vertex.z))<.5)continue;
          const seat=torso.project(vertex,0),gap=(Math.hypot(vertex.x-seat.x,vertex.z-seat.z))*1000;min=Math.min(min,gap);max=Math.max(max,gap);samples++;
        }
      }
      assert.ok(samples>300&&min>=6&&max<=20,`the belt band sits on the tunic: ${JSON.stringify({min,max,samples})}`);
    }
    const names=costume.materials.map(material=>material.name);
    for(const retired of ['Prince Jev gold','Prince Jev sapphires','Prince Jev royal sash'])assert.ok(!names.includes(retired),`${retired} is retired by the 2026-10-29 reference`);
    assert.ok(names.includes('Prince Jev rose gold')&&names.includes('Prince Jev engraved bracer'));
    for(const [original,material]of rig.materials)if(/^eyelashes|^eyebrow/.test(original.name)){
      assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);assert.ok(material.alphaTest<.1);
    }
  }finally{costume.dispose();rig.dispose();}
});
