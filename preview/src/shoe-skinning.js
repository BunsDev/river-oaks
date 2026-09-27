import * as THREE from 'three';
import { fitSockCuffs } from './sock-fitting.js';

// Automatic skinning lets calf rotation compress the shoe's sole. Keep the
// lower shoe on the foot/ball joints, blending back to the original cuff above
// the ankle. Each avatar owns the changed attributes; cached assets stay intact.
export function stabilizeShoeSoles(model) {
  const owned=new Set(),point=new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!/^shoes\d/.test(mesh.material.name))return;
    const bones=mesh.skeleton.bones;
    const sides=['l','r'].map(side=>({
      calf:bones.findIndex(b=>b.name===`calf_${side}`),
      foot:bones.findIndex(b=>b.name===`foot_${side}`),
      ankle:bones.find(b=>b.name===`foot_${side}`)?.getWorldPosition(new THREE.Vector3()).y,
    })).filter(side=>side.calf>=0&&side.foot>=0);
    const geometry=mesh.geometry.clone();owned.add(geometry);mesh.geometry=geometry;
    const indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
    const blendHeight=.06*model.getWorldScale(new THREE.Vector3()).y;
    for(let vertex=0;vertex<indices.count;vertex++) {
      mesh.getVertexPosition(vertex,point).applyMatrix4(mesh.matrixWorld);
      for(const side of sides) {
        const amount=1-THREE.MathUtils.smoothstep(point.y,side.ankle,side.ankle+blendHeight);
        if(!amount)continue;
        const calfSlot=[0,1,2,3].find(slot=>indices.getComponent(vertex,slot)===side.calf&&weights.getComponent(vertex,slot)>0);
        if(calfSlot===undefined)continue;
        let footSlot=[0,1,2,3].find(slot=>indices.getComponent(vertex,slot)===side.foot);
        if(footSlot===undefined)footSlot=[0,1,2,3].find(slot=>weights.getComponent(vertex,slot)===0);
        if(footSlot===undefined) {
          if(amount===1){indices.setComponent(vertex,calfSlot,side.foot);}
          continue;
        }
        const transfer=weights.getComponent(vertex,calfSlot)*amount;
        indices.setComponent(vertex,footSlot,side.foot);
        weights.setComponent(vertex,footSlot,weights.getComponent(vertex,footSlot)+transfer);
        weights.setComponent(vertex,calfSlot,weights.getComponent(vertex,calfSlot)-transfer);
      }
    }
    indices.needsUpdate=weights.needsUpdate=true;
    fitSockCuffs(model,mesh);
  });
  return owned;
}
