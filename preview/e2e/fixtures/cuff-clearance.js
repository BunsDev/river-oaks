import * as THREE from 'three';

// Independent clearance probe for the two shipped shoes02 sock islands. Select
// whole UV-connected islands so adjacent leather vertices stay out of the check.
export function sockVertices(mesh) {
  const {index,attributes:{uv}}=mesh.geometry,links=new Map(),seen=new Set(),result=[];
  for(let i=0;i<index.count;i+=3) {
    const tri=[0,1,2].map(j=>index.getX(i+j));
    for(const a of tri){if(!links.has(a))links.set(a,new Set());for(const b of tri)links.get(a).add(b);}
  }
  for(const first of links.keys()) {
    if(seen.has(first))continue;
    const stack=[first],island=[];seen.add(first);
    while(stack.length){const v=stack.pop();island.push(v);for(const next of links.get(v))if(!seen.has(next)){seen.add(next);stack.push(next);}}
    if(island.every(i=>uv.getX(i)>.78&&uv.getY(i)>.85))result.push(...island);
  }
  return result;
}

export function createCuffProbe(model) {
  let shoe,pants;model.updateMatrixWorld(true);
  model.traverse(m=>{if(m.isSkinnedMesh&&m.material.name==='shoes02')shoe=m;if(m.isSkinnedMesh&&m.material.name==='female_casualsuit01')pants=m;});
  if(!shoe||!pants)throw new Error('Expected the shipped casual trousers and socks');
  const scale=model.getWorldScale(new THREE.Vector3()).y;
  const points=sockVertices(shoe).map(i=>{
    const weights=shoe.geometry.attributes.skinWeight,indices=shoe.geometry.attributes.skinIndex;
    const left=[0,1,2,3].reduce((sum,j)=>sum+(shoe.skeleton.bones[indices.getComponent(i,j)].name.endsWith('_l')?weights.getComponent(i,j):0),0)>.5;
    const side=left?'l':'r',foot=model.getObjectByName(`foot_${side}`),calf=model.getObjectByName(`calf_${side}`);
    const rest=shoe.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(shoe.matrixWorld);
    return {i,foot,calf,covered:rest.y>foot.getWorldPosition(new THREE.Vector3()).y+.04*scale};
  }).filter(v=>v.covered);
  const covered=new Map(points.map(p=>[p.i,p])),samples=points.map(p=>({...p,vertices:[p.i]}));
  const shoeIndex=shoe.geometry.index;
  for(let i=0;i<shoeIndex.count;i+=3) {
    const vertices=[0,1,2].map(j=>shoeIndex.getX(i+j));
    if(vertices.every(v=>covered.has(v)))samples.push({...covered.get(vertices[0]),vertices});
  }
  const ray=new THREE.Raycaster(),point=new THREE.Vector3(),vertex=new THREE.Vector3(),ankle=new THREE.Vector3(),knee=new THREE.Vector3(),axis=new THREE.Vector3(),center=new THREE.Vector3(),direction=new THREE.Vector3();
  // Snapshot the actual posed cloth once per sample frame. Ray tests then use
  // those same triangles without reskinning all trousers for every sock point.
  const target=new THREE.Mesh(pants.geometry.clone(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  return ()=>{
    model.updateMatrixWorld(true);
    const positions=target.geometry.attributes.position;
    for(let i=0;i<positions.count;i++) {
      pants.getVertexPosition(i,vertex).applyMatrix4(pants.matrixWorld);positions.setXYZ(i,vertex.x,vertex.y,vertex.z);
    }
    target.geometry.computeBoundingBox();target.geometry.computeBoundingSphere();
    let worst=-Infinity,checked=0,uncovered=0,worstVertex;
    for(const {i,vertices,foot,calf}of samples) {
      point.set(0,0,0);
      for(const v of vertices)point.add(shoe.getVertexPosition(v,vertex).applyMatrix4(shoe.matrixWorld));point.divideScalar(vertices.length);
      foot.getWorldPosition(ankle);calf.getWorldPosition(knee);
      axis.subVectors(knee,ankle).normalize();center.copy(ankle).addScaledVector(axis,direction.subVectors(point,ankle).dot(axis));direction.subVectors(point,center);
      const radius=direction.length();ray.set(center,direction.normalize());ray.far=.15*scale;
      const hit=ray.intersectObject(target,false)[0];
      if(!hit){uncovered++;continue;}
      const protrusion=radius-hit.distance;if(protrusion>worst){worst=protrusion;worstVertex=i;}checked++;
    }
    return {checked,uncovered,worst,worstVertex};
  };
}
