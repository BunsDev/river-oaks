import * as THREE from 'three';

// Fit the owned garment geometry in bind space. Smoothing the source shell
// moved some shoulder points inside the skin while retaining their old weights.
// Project only points needing clearance; keep the authored bust and silhouette.
export function fitJevicaBodice(model,cloth) {
  const body=model.getObjectByName('Jevica');
  if(!body?.isSkinnedMesh)return;
  const {position,skinIndex,skinWeight}=cloth.geometry.attributes;
  const source=body.geometry.attributes,index=body.geometry.index;
  const transform=new THREE.Matrix4().copy(cloth.bindMatrix).invert().multiply(body.bindMatrix);
  const bounds=new THREE.Box3().setFromBufferAttribute(position).expandByScalar(.03);
  const cells=new Map(),size=.03,key=(x,y,z)=>`${x},${y},${z}`;
  const vertices=Array.from({length:source.position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(source.position,i).applyMatrix4(transform));
  for(let i=0;i<index.count;i+=3) {
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],points=ids.map(id=>vertices[id]);
    const box=new THREE.Box3().setFromPoints(points);if(!box.intersectsBox(bounds))continue;
    const tri=new THREE.Triangle(...points),face={tri,ids,normal:tri.getNormal(new THREE.Vector3())};
    for(let x=Math.floor(box.min.x/size);x<=Math.floor(box.max.x/size);x++)
      for(let y=Math.floor(box.min.y/size);y<=Math.floor(box.max.y/size);y++)
        for(let z=Math.floor(box.min.z/size);z<=Math.floor(box.max.z/size);z++) {
          const k=key(x,y,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(face);
        }
  }
  const boneMap=body.skeleton.bones.map(bone=>cloth.skeleton.bones.findIndex(other=>other.name===bone.name));
  const point=new THREE.Vector3(),hit=new THREE.Vector3(),closest=new THREE.Vector3(),delta=new THREE.Vector3(),bary=new THREE.Vector3(),seen=new Set();
  let changed=false;
  for(let i=0;i<position.count;i++) {
    point.fromBufferAttribute(position,i);seen.clear();
    const x=Math.floor(point.x/size),y=Math.floor(point.y/size),z=Math.floor(point.z/size);
    let distance=size*size,nearest=null;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++) {
      for(const face of cells.get(key(x+dx,y+dy,z+dz))??[]) {
        if(seen.has(face))continue;seen.add(face);
        face.tri.closestPointToPoint(point,hit);const d=point.distanceToSquared(hit);
        if(d<distance){distance=d;nearest=face;closest.copy(hit);}
      }
    }
    if(!nearest||delta.subVectors(point,closest).dot(nearest.normal)>=.006)continue;
    nearest.tri.getBarycoord(closest,bary);
    const influences=new Map();
    for(let corner=0;corner<3;corner++)for(let slot=0;slot<4;slot++) {
      const vertex=nearest.ids[corner],weight=source.skinWeight.getComponent(vertex,slot)*bary.getComponent(corner);
      const bone=boneMap[source.skinIndex.getComponent(vertex,slot)];
      if(weight>0&&bone>=0)influences.set(bone,(influences.get(bone)??0)+weight);
    }
    const entries=[...influences].sort((a,b)=>b[1]-a[1]).slice(0,4),total=entries.reduce((sum,[,weight])=>sum+weight,0);
    if(!total)continue;
    point.copy(closest).addScaledVector(nearest.normal,.006);position.setXYZ(i,point.x,point.y,point.z);
    for(let slot=0;slot<4;slot++) {
      skinIndex.setComponent(i,slot,entries[slot]?.[0]??0);
      skinWeight.setComponent(i,slot,(entries[slot]?.[1]??0)/total);
    }
    changed=true;
  }
  if(changed) {
    position.needsUpdate=skinIndex.needsUpdate=skinWeight.needsUpdate=true;
    cloth.geometry.computeVertexNormals();cloth.geometry.computeBoundingBox();cloth.geometry.computeBoundingSphere();
  }
}
