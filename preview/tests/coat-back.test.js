import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {instantiateAvatar} from '../src/avatars.js';
import {createReferenceStyle} from '../src/reference-archetypes.js';
import {sharedAppearance} from '../src/shared-appearances.js';
import {COAT_BACK_NAME,COAT_BACK_TRIANGLES} from '../src/coat-back.js';
import {COAT_TAIL_NAME} from '../src/coat-tail-geometry.js';
import {loadCharacterRig} from './helpers/character-rig.js';

// The rear of the torso in model space, from the body's own skinned vertices.
const backAt=(body,y,band=.02)=>{
  const point=new THREE.Vector3();let back=Infinity;
  for(let i=0;i<body.geometry.attributes.position.count;i++){
    body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld);
    if(Math.abs(point.y-y)<band&&Math.abs(point.x)<.05)back=Math.min(back,point.z);
  }
  return back;
};

for(const id of ['man-workwear','kai-noir','man-tailored'])test(`${id}: the coat back rises from the tails to the shoulder blades without entering the body`,async()=>{
  const appearance=sharedAppearance(id),source=await loadCharacterRig(appearance.rig);
  const avatar=instantiateAvatar(source,{targetHeight:source.height,id});
  const model=avatar.model,look=createReferenceStyle(avatar,appearance);
  try{
    model.updateMatrixWorld(true);
    const back=model.getObjectByName(COAT_BACK_NAME),tails=model.getObjectByName(COAT_TAIL_NAME),body=model.getObjectByName('man-casualmale_casualsuit02');
    assert.ok(back?.isSkinnedMesh&&back.skeleton===body.skeleton,'the back is skinned to the body skeleton');
    assert.equal(back.geometry.index.count/3,COAT_BACK_TRIANGLES);
    const weights=back.geometry.attributes.skinWeight;
    for(let i=0;i<weights.count;i++){const sum=weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i);assert.ok(Math.abs(sum-1)<1e-6&&Number.isFinite(sum),`weight ${i}`);}
    // The lowest row overlaps the tails' waist ring, so no hard edge shows above it.
    const point=new THREE.Vector3(),ring=[],hem=[];
    for(let i=0;i<tails.geometry.attributes.position.count;i++)ring.push(tails.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(tails.matrixWorld).y);
    const waist=Math.max(...ring);
    for(let i=0;i<back.geometry.attributes.position.count;i++)hem.push(back.getVertexPosition(i,point).applyMatrix4(back.matrixWorld).y);
    assert.ok(Math.min(...hem)<waist-.005&&Math.max(...hem)>waist+.2,`back spans ${Math.min(...hem).toFixed(3)}..${Math.max(...hem).toFixed(3)} around waist ${waist.toFixed(3)}`);
    // At rest and with the spine bent both ways, the back stays behind the torso.
    const spine=['spine_01','spine_02','spine_03'].map(name=>model.getObjectByName(name));
    for(const angle of [0,-.18,.18]){
      for(const bone of spine)bone.quaternion.copy(avatar.rest.get(bone)).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone).x,angle));
      look.update();model.updateMatrixWorld(true);
      for(let i=0;i<back.geometry.attributes.position.count;i++){
        back.getVertexPosition(i,point).applyMatrix4(back.matrixWorld);
        if(Math.abs(point.x)>.05||point.y<waist+.01)continue;
        const surface=backAt(body,point.y);
        if(Number.isFinite(surface))assert.ok(point.z<surface-.002,`${angle}: vertex ${i} at y ${point.y.toFixed(3)} is ${(surface-point.z).toFixed(4)} behind the back`);
      }
    }
  }finally{look.dispose();avatar.dispose();}
});
