import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createReferenceStyle } from '../src/reference-archetypes.js';
import { sharedAppearance } from '../src/shared-appearances.js';

for(const appearanceId of ['sable-human','woman-casual'])test(`${appearanceId}: skirt covers actual upper thighs through opposing walking strides`,async()=>{
  const source=await loadCharacterRig('jevica'),avatar=instantiateAvatar(source,{targetHeight:1.685,id:'skirt-fixture'});
  const root=new THREE.Group();root.add(avatar.model);
  const look=createReferenceStyle(avatar,sharedAppearance(appearanceId)),model=avatar.model,body=model.getObjectByName('Jevica'),skirt=model.getObjectByName('Sable ivory mini dress');
  const point=new THREE.Vector3(),candidates=[];
  model.updateMatrixWorld(true);const pelvis=model.getObjectByName('pelvis');
  const restInverse=new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3())).invert();
  for(let i=0;i<body.geometry.attributes.position.count;i++){
    body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld).applyMatrix4(restInverse);
    if(point.y>-.075&&point.y<-.035&&Math.abs(point.x)>.04&&Math.abs(point.x)<.14&&point.z>.065)candidates.push(i);
  }
  assert.ok(candidates.length>20,`Actual thigh sample count: ${candidates.length}`);
  const left=model.getObjectByName('thigh_l'),right=model.getObjectByName('thigh_r');
  try{
    for(const transformed of [false,true])for(const angle of [0,.45,-.45,.75,-.75]){
      root.position.set(transformed?3:0,transformed?2:0,transformed?-5:0);root.rotation.y=transformed?.7:0;root.scale.setScalar(transformed?1.2:1);
      for(const [bone,sign] of [[left,1],[right,-1]])bone.quaternion.copy(avatar.rest.get(bone)).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone).x,angle*sign));
      root.updateMatrixWorld(true);skirt.computeBoundingSphere?.();let exposed=0;
      const forward=new THREE.Vector3(0,0,1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
      for(const i of candidates){
        body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld);
        const ray=new THREE.Raycaster(point.clone().add(forward),forward.clone().negate(),0,1.002);
        if(!ray.intersectObject(skirt,false).length)exposed++;
      }
      assert.equal(exposed,0,`Transformed ${transformed}, stride ${angle}: ${exposed}/${candidates.length} thigh samples penetrate garment`);
    }
  }finally{look.dispose();avatar.dispose();}
});
