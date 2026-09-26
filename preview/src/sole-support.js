import * as THREE from 'three';

// Retain the lowest actual shoe vertex in each small footprint cell. These
// points follow the foot/ball hierarchy after sole skinning is stabilized.
// Sampling once avoids CPU skinning the whole shoe during every footstep.
export function measureFootSupport(model,foot,side) {
  const points=[],point=new THREE.Vector3(),ankle=foot.getWorldPosition(new THREE.Vector3());
  const inverse=foot.matrixWorld.clone().invert(),bounds=new THREE.Box3();
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!/^shoes\d/.test(mesh.material.name))return;
    const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    const belongs=mesh.skeleton.bones.map(bone=>bone.name.endsWith(`_${side}`));
    for(let i=0;i<indices.count;i++) {
      let influence=0;
      for(let j=0;j<4;j++)if(belongs[indices.getComponent(i,j)])influence+=weights.getComponent(i,j);
      if(influence<=.5)continue;
      mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
      if(point.y>ankle.y)continue;
      let toeWeight=0;
      for(let j=0;j<4;j++)if(mesh.skeleton.bones[indices.getComponent(i,j)].name===`ball_${side}`)toeWeight+=weights.getComponent(i,j);
      const sample=point.clone();points.push({point:sample,toeWeight,mesh,index:i});bounds.expandByPoint(sample);
    }
  });
  const columns=6,rows=16,cells=new Map(),size=bounds.getSize(new THREE.Vector3());
  for(const sample of points) {
    const p=sample.point;
    const x=Math.min(columns-1,Math.floor((p.x-bounds.min.x)/Math.max(size.x,1e-6)*columns));
    const z=Math.min(rows-1,Math.floor((p.z-bounds.min.z)/Math.max(size.z,1e-6)*rows));
    const key=z*columns+x,before=cells.get(key);
    if(!before||p.y<before.point.y)cells.set(key,sample);
  }
  const samples=[...cells.values()];
  return {points:samples.map(s=>s.point.applyMatrix4(inverse)),toeWeights:samples.map(s=>s.toeWeight),sources:samples.map(({mesh,index})=>({mesh,index}))};
}

export function measureSoleSupport(model,foot,side) {return measureFootSupport(model,foot,side).points;}
