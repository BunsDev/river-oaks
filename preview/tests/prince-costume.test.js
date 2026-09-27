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

test('Prince Jev retains the dedicated hero geometry and facial rig with isolated blonde, fair and pink materials',async()=>{
  const source=await loadCharacterRig('prince-jev'),rig=instantiateAvatar(source,{targetHeight:1.805}),object=new THREE.Group();object.add(rig.model);
  const geometry=new Map();rig.model.traverse(mesh=>{if(mesh.isMesh)geometry.set(mesh,mesh.geometry);});
  const donor=new THREE.Texture(),costume=createPrinceCostume({object,rig},{skinTexture:donor});
  try {
    const skin=[...rig.materials].find(([source])=>/^middleage_/.test(source.name))[1],hair=[...rig.materials].find(([source])=>/^short/.test(source.name))[1];
    assert.equal(skin.map,donor,'The young light-skin atlas replaces the older dark baked texture');
    assert.equal(hair.color.getHexString(),'d8b56a');
    assert.ok(costume.materials.some(material=>material.name==='Prince Jev rose tunic'&&material.color.getHexString()==='efa1c3'));
    for(const [mesh,original]of geometry)assert.equal(mesh.geometry,original,'Hero body, facial details and weights remain intact');
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

test('the coronet clears Owen hair and fine facial cards keep soft edges',async()=>{
  const source=await loadCharacterRig('prince-jev'),rig=instantiateAvatar(source,{targetHeight:1.86}),object=new THREE.Group();object.add(rig.model);
  const costume=createPrinceCostume({object,rig});
  try {
    costume.update();object.updateWorldMatrix(true,true);
    const crown=object.children.find(group=>group.children.some(mesh=>mesh.material?.name==='Prince Jev gold'));
    const gold=crown.children.find(mesh=>mesh.material?.name==='Prince Jev gold'),points=[];
    for(let i=0;i<gold.geometry.attributes.position.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(gold.geometry.attributes.position,i).applyMatrix4(gold.matrixWorld));
    const bottom=Math.min(...points.map(p=>p.y)),band=points.filter(p=>p.y<bottom+.0065),bounds=new THREE.Box3().setFromPoints(band),center=bounds.getCenter(new THREE.Vector3());
    const rx=(bounds.max.x-bounds.min.x)/2-.0064,rz=(bounds.max.z-bounds.min.z)/2-.0064;
    let samples=0,worst=0;
    rig.model.traverse(mesh=>{
      if(!mesh.isSkinnedMesh||!/^short02/.test(mesh.material?.name??''))return;
      mesh.skeleton.update();
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i);
        mesh.applyBoneTransform(i,point).applyMatrix4(mesh.matrixWorld);
        if(point.y<bottom||point.y>bottom+.026)continue;
        samples++;worst=Math.max(worst,Math.hypot((point.x-center.x)/rx,(point.z-center.z)/rz));
      }
    });
    assert.ok(samples>20,'Measure the hair where the gold band sits');
    assert.ok(worst<=1,`The hair must fit inside the band (${worst.toFixed(3)} normalized radius)`);
    for(const [original,material]of rig.materials)if(/^eyelashes|^eyebrow/.test(original.name)){
      assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);assert.ok(material.alphaTest<.1);
    }
  }finally{costume.dispose();rig.dispose();}
});
