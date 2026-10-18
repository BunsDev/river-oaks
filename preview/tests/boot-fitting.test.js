import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {instantiateAvatar} from '../src/avatars.js';
import {createReferenceStyle} from '../src/reference-archetypes.js';
import {SHARED_APPEARANCES} from '../src/shared-appearances.js';
import {loadCharacterRig} from './helpers/character-rig.js';

for(const id of ['rowan-human','man-casual','kai-explorer','kai-explorer-beast'])test(`${id}: trousers stay inside boot shafts through calf and ankle bends`,async()=>{
  const appearance=SHARED_APPEARANCES.find(a=>a.id===id),source=await loadCharacterRig(appearance.rig);
  const avatar=instantiateAvatar(source,{targetHeight:source.height,id}),model=avatar.model;
  const cloth=model.getObjectsByProperty('isSkinnedMesh',true).find(m=>/^male_(elegantsuit01|casualsuit02)$/.test(m.material?.name));
  const original=cloth.geometry,positions=original.attributes.position.array.slice();
  const look=createReferenceStyle(avatar,appearance);
  try{
    model.position.set(2,.4,-3);model.rotation.y=.7;model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
    for(const side of ['l','r']){
      const calf=model.getObjectByName(`calf_${side}`),foot=model.getObjectByName(`foot_${side}`),footMeshes=new Set(foot.getObjectsByProperty('isMesh',true));
      const shaft=calf.getObjectsByProperty('isMesh',true).find(m=>!footMeshes.has(m)&&m.geometry.type==='CylinderGeometry');
      const {height,radiusTop,radiusBottom}=shaft.geometry.parameters;
      const at=i=>{cloth.skeleton.update();return cloth.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(cloth.matrixWorld).applyMatrix4(shaft.matrixWorld.clone().invert());};
      const bone=cloth.skeleton.bones.indexOf(calf),{skinIndex,skinWeight}=cloth.geometry.attributes;
      const selected=[];
      for(let i=0;i<skinIndex.count;i++){
        let weight=0;for(let c=0;c<4;c++)if(skinIndex.getComponent(i,c)===bone)weight+=skinWeight.getComponent(i,c);
        if(weight>.5&&Math.abs(at(i).y)<height/2-.01)selected.push(i);
      }
      assert(selected.length>60,'exercise actual trouser geometry on each leg');
      const calfRest=calf.quaternion.clone(),footRest=foot.quaternion.clone();
      for(const [knee,ankle]of [[0,0],[1.2,-.5],[-.4,.6]]){
        calf.quaternion.copy(calfRest).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(calf).x,knee));
        foot.quaternion.copy(footRest).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(foot).x,ankle));
        model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
        for(const i of selected){const p=at(i),radius=THREE.MathUtils.lerp(radiusBottom,radiusTop,(p.y+height/2)/height);
          assert(Math.hypot(p.x,p.z)<radius*Math.cos(Math.PI/16)-.001,`trouser vertex ${i} must remain under the actual faceted shaft`);
        }
      }
      calf.quaternion.copy(calfRest);foot.quaternion.copy(footRest);model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
    }
    assert.notEqual(cloth.geometry,original,'fit must own its geometry');
    assert.deepEqual(original.attributes.position.array,positions,'cached asset stays unchanged');
  }finally{look.dispose();assert.equal(cloth.geometry,original,'dispose restores the previous geometry');avatar.dispose();}
});
