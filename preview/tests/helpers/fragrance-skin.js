import * as THREE from 'three';

export function skinInStripFrame(model,strip) {
  model.updateWorldMatrix(true,true);strip.updateWorldMatrix(true,false);
  const samples={index:[],thumb:[],hand:[]};
  const bounds=strip.geometry.boundingBox.clone().expandByScalar(-0.00005);
  let triangles=0,intersections=0;
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||! /^(young|middleage|old)_/.test(mesh.material?.name??''))return;
    const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
    const handIndices=new Set(),points=new Map();
    const pointAt=i=>{
      if(!points.has(i))points.set(i,strip.worldToLocal(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
      return points.get(i);
    };
    for(let i=0;i<position.count;i++) {
      const weight={index:0,thumb:0,hand:0};
      for(let k=0;k<4;k++) {
        const name=mesh.skeleton.bones[skinIndex.getComponent(i,k)].name,w=skinWeight.getComponent(i,k);
        if(name==='index_03_r')weight.index+=w;
        if(name==='thumb_03_r')weight.thumb+=w;
        if(/^(hand|thumb_0[123]|index_0[123]|middle_0[123]|ring_0[123]|pinky_0[123])_r$/.test(name))weight.hand+=w;
      }
      if(weight.hand<0.5)continue;
      handIndices.add(i);const p=pointAt(i);
      for(const kind of Object.keys(samples))if(weight[kind]>=0.5)samples[kind].push(p);
    }
    // Vertex containment alone misses a thin sheet cutting through the interior
    // of a skin triangle. Include every triangle touching the weighted hand.
    const index=mesh.geometry.index,count=index?.count??position.count;
    for(let i=0;i<count;i+=3) {
      const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
      if(!ids.some(id=>handIndices.has(id)))continue;
      triangles++;
      if(bounds.intersectsTriangle(new THREE.Triangle(...ids.map(pointAt))))intersections++;
    }
  });return {...samples,triangles,intersections};
}

