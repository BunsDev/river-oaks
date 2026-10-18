import * as THREE from 'three';

// Tuck the authored trousers into rigid boot shafts at rest. Covered fabric
// follows the calf; a short blend above the cuff retains the original drape.
// Each look owns its fitted geometry and restores the prior mesh on disposal.
export function fitBootTrousers(model, shafts) {
  const cloth=model.getObjectsByProperty('isSkinnedMesh',true).find(mesh=>/^male_(elegantsuit01|casualsuit02)$/.test(mesh.material?.name));
  if(!cloth||!shafts.length)return ()=>{};
  model.updateMatrixWorld(true);cloth.skeleton.update();
  const original=cloth.geometry,geometry=original.clone();cloth.geometry=geometry;
  const {position,skinIndex,skinWeight}=geometry.attributes,point=new THREE.Vector3();
  const inverse=cloth.matrixWorld.clone().invert(),changed=new Set();
  for(const {shaft,calf} of shafts){
    const bone=cloth.skeleton.bones.indexOf(calf);if(bone<0)continue;
    const frame=shaft.matrixWorld.clone().invert(),{height,radiusTop,radiusBottom,radialSegments}=shaft.geometry.parameters;
    const top=height/2,bottom=-height/2;
    for(let i=0;i<position.count;i++){
      let weight=0;for(let slot=0;slot<4;slot++)if(skinIndex.getComponent(i,slot)===bone)weight+=skinWeight.getComponent(i,slot);
      if(weight<.5)continue;
      cloth.getVertexPosition(i,point).applyMatrix4(cloth.matrixWorld).applyMatrix4(frame);
      if(point.y<bottom-.025||point.y>top+.045)continue;
      const blend=1-THREE.MathUtils.smoothstep(point.y,top,top+.045);
      const radius=THREE.MathUtils.lerp(radiusBottom,radiusTop,THREE.MathUtils.clamp((point.y-bottom)/height,0,1))*Math.cos(Math.PI/radialSegments)-.004;
      const distance=Math.hypot(point.x,point.z),factor=distance>radius?THREE.MathUtils.lerp(1,radius/distance,blend):1;
      point.x*=factor;point.z*=factor;
      point.applyMatrix4(shaft.matrixWorld).applyMatrix4(inverse);
      position.setXYZ(i,point.x,point.y,point.z);changed.add(i);
      const influences=new Map([[bone,blend]]);
      for(let slot=0;slot<4;slot++){
        const index=skinIndex.getComponent(i,slot);
        influences.set(index,(influences.get(index)??0)+skinWeight.getComponent(i,slot)*(1-blend));
      }
      const entries=[...influences].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=entries.reduce((n,[,w])=>n+w,0);
      for(let slot=0;slot<4;slot++){skinIndex.setComponent(i,slot,entries[slot]?.[0]??0);skinWeight.setComponent(i,slot,(entries[slot]?.[1]??0)/sum);}
    }
  }
  position.needsUpdate=skinIndex.needsUpdate=skinWeight.needsUpdate=true;
  const normals=geometry.attributes.normal,previous=normals.array.slice();
  geometry.computeVertexNormals();
  for(let i=0;i<normals.count;i++)if(!changed.has(i))normals.setXYZ(i,previous[i*3],previous[i*3+1],previous[i*3+2]);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return ()=>{if(cloth.geometry===geometry)cloth.geometry=original;geometry.dispose();};
}
