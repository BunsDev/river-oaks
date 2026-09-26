import * as THREE from 'three';

// Inspect the actual rendered shoe surface, not the IK ankle target.
export function createShoeProbe(avatar,{contactPatch=false}={}) {
  const meshes=[];
  avatar.rig.model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!/^shoes\d/.test(mesh.material.name))return;
    const index=mesh.geometry.attributes.skinIndex,weight=mesh.geometry.attributes.skinWeight;
    const sides={l:[],r:[]};
    for(let vertex=0;vertex<index.count;vertex++)for(const side of ['l','r']) {
      let influence=0;
      for(let slot=0;slot<4;slot++)if(mesh.skeleton.bones[index.getComponent(vertex,slot)].name.endsWith(`_${side}`))influence+=weight.getComponent(vertex,slot);
      if(influence>.5)sides[side].push(vertex);
    }
    meshes.push({mesh,sides});
  });
  if(!meshes.length)throw new Error(`No shoes for ${avatar.profile}`);
  const point=new THREE.Vector3();
  return ground=>avatar.feet.map(leg=>{
    let min=Infinity,count=0,lowest=null;const patch=[];
    for(const {mesh,sides} of meshes)for(const index of sides[leg.side]) {
      mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld);
      const height=point.y-ground(point.x,point.z);
      if(contactPatch&&Math.abs(height)<=.001)patch.push({id:`${mesh.name}:${index}`,position:point.toArray()});
      if(height<min){min=height;lowest={mesh:mesh.name,index,weights:[0,1,2,3].map(slot=>({bone:mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(index,slot)].name,weight:mesh.geometry.attributes.skinWeight.getComponent(index,slot)}))};}
      count++;
    }
    return {side:leg.side,contact:leg.contact,minHeight:min,vertices:count,lowest,...(contactPatch?{patch}:{})};
  });
}
