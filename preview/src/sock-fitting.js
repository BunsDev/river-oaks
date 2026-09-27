import * as THREE from 'three';

// shoes02 has two disconnected knitted sock islands in this UV rectangle.
// Select whole islands: a few leather vertices share the rectangle too.
function sockIslands(geometry) {
  const {index,attributes:{uv}}=geometry,links=new Map(),seen=new Set(),socks=[];
  for(let i=0;i<index.count;i+=3) {
    const tri=[0,1,2].map(j=>index.getX(i+j));
    for(const a of tri){if(!links.has(a))links.set(a,new Set());for(const b of tri)links.get(a).add(b);}
  }
  for(const first of links.keys()) {
    if(seen.has(first))continue;
    const stack=[first],island=[];seen.add(first);
    while(stack.length){const v=stack.pop();island.push(v);for(const next of links.get(v))if(!seen.has(next)){seen.add(next);stack.push(next);}}
    if(island.every(i=>uv.getX(i)>.78&&uv.getY(i)>.85))socks.push(...island);
  }
  return socks;
}

// Fit the layered casual outfit once, at bind pose, on an owned shoe geometry.
// The source socks intersect these trousers even before any animation. Keep
// the exposed cuff; fit and bind covered points to the covering garment.
export function fitSockCuffs(model,shoe) {
  if(shoe.material.name!=='shoes02')return;
  let trousers;model.traverse(m=>{if(m.isSkinnedMesh&&m.material.name==='female_casualsuit01')trousers=m;});
  if(!trousers)return;
  const scale=model.getWorldScale(new THREE.Vector3()).y,clearance=.003*scale;
  const {position,skinWeight,skinIndex}=shoe.geometry.attributes;
  const sides=['l','r'].map(side=>{
    const ankle=model.getObjectByName(`foot_${side}`).getWorldPosition(new THREE.Vector3());
    const knee=model.getObjectByName(`calf_${side}`).getWorldPosition(new THREE.Vector3());
    return {side,ankle,axis:knee.sub(ankle).normalize()};
  });
  const verts=Array.from({length:trousers.geometry.attributes.position.count},(_,i)=>trousers.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(trousers.matrixWorld));
  const triangles=[],index=trousers.geometry.index,ceiling=Math.max(...sides.map(s=>s.ankle.y))+.2*scale;
  for(let i=0;i<index.count;i+=3) {
    const tri=[0,1,2].map(j=>verts[index.getX(i+j)]);
    if(tri.some(p=>p.y<ceiling))triangles.push({points:tri,indices:[0,1,2].map(j=>index.getX(i+j))});
  }
  const ray=new THREE.Ray(),point=new THREE.Vector3(),center=new THREE.Vector3(),delta=new THREE.Vector3(),hit=new THREE.Vector3();
  const inverse=shoe.matrixWorld.clone().invert(),socks=new Set(sockIslands(shoe.geometry));let changed=false;
  for(const i of socks) {
    const left=[0,1,2,3].reduce((sum,j)=>sum+(shoe.skeleton.bones[skinIndex.getComponent(i,j)].name.endsWith('_l')?skinWeight.getComponent(i,j):0),0)>.5;
    const {ankle,axis}=sides[left?0:1];
    shoe.getVertexPosition(i,point).applyMatrix4(shoe.matrixWorld);
    center.copy(ankle).addScaledVector(axis,delta.subVectors(point,ankle).dot(axis));delta.subVectors(point,center);
    const radius=delta.length();if(radius<1e-6)continue;
    ray.set(center,delta.normalize());let surface=Infinity,closest;
    for(const tri of triangles)if(ray.intersectTriangle(...tri.points,false,hit)) {
      const distance=hit.distanceTo(center);if(distance<surface){surface=distance;closest=tri;}
    }
    if(surface>.15*scale)continue;
    if(radius>surface-clearance) {
      point.copy(center).addScaledVector(delta,Math.max(0,surface-clearance)).applyMatrix4(inverse);
      position.setXYZ(i,point.x,point.y,point.z);
    }
    // The independently auto-weighted sock and trousers otherwise separate as
    // the ankle bends. Match the covering triangle's interpolated influences.
    hit.copy(center).addScaledVector(delta,surface);
    const bary=THREE.Triangle.getBarycoord(hit,...closest.points,new THREE.Vector3()),influences=new Map();
    for(let corner=0;corner<3;corner++)for(let slot=0;slot<4;slot++) {
      const v=closest.indices[corner],weight=trousers.geometry.attributes.skinWeight.getComponent(v,slot)*bary.getComponent(corner);
      if(weight<=0)continue;
      const name=trousers.skeleton.bones[trousers.geometry.attributes.skinIndex.getComponent(v,slot)].name;
      const bone=shoe.skeleton.bones.findIndex(b=>b.name===name);
      influences.set(bone,(influences.get(bone)??0)+weight);
    }
    const entries=[...influences].sort((a,b)=>b[1]-a[1]).slice(0,4),total=entries.reduce((sum,[,weight])=>sum+weight,0);
    for(let slot=0;slot<4;slot++){skinIndex.setComponent(i,slot,entries[slot]?.[0]??0);skinWeight.setComponent(i,slot,(entries[slot]?.[1]??0)/total);}
    changed=true;
  }
  if(changed) {
    position.needsUpdate=skinIndex.needsUpdate=skinWeight.needsUpdate=true;
    const normals=shoe.geometry.attributes.normal,original=normals.array.slice();
    shoe.geometry.computeVertexNormals();
    for(let i=0;i<normals.count;i++)if(!socks.has(i))normals.setXYZ(i,original[i*3],original[i*3+1],original[i*3+2]);
    shoe.geometry.computeBoundingBox();shoe.geometry.computeBoundingSphere();
  }
}
