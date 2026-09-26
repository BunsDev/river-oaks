import * as THREE from 'three';

const cache=new WeakMap();
// Use the rendered convex mesh's face planes, including the polygonal cylinder
// sides. Shrink by 50 micrometres so touching a surface is not penetration.
export function convexSolid(mesh) {
  let shape=cache.get(mesh.geometry);
  if(!shape){
    const geometry=mesh.geometry,p=geometry.attributes.position,index=geometry.index,planes=[];
    geometry.computeBoundingBox();
    for(let i=0;i<(index?.count??p.count);i+=3){
      const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k));
      const plane=new THREE.Plane().setFromCoplanarPoints(...points);
      if(plane.normal.lengthSq()<.5)continue;
      if(!planes.some(other=>other.normal.distanceToSquared(plane.normal)<1e-10&&Math.abs(other.constant-plane.constant)<1e-8))planes.push(plane);
    }
    shape={planes,bounds:geometry.boundingBox.clone()};cache.set(geometry,shape);
  }
  mesh.updateWorldMatrix(true,false);
  return {...shape,inverse:mesh.matrixWorld.clone().invert(),name:mesh.name};
}

export function pointInConvex(point,solid) {
  return solid.planes.every(plane=>plane.distanceToPoint(point)<-.00005);
}

export function triangleInConvex(points,solid) {
  if(!solid.bounds.intersectsTriangle(new THREE.Triangle(...points)))return false;
  let polygon=points;
  for(const plane of solid.planes){
    const output=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],da=plane.distanceToPoint(a)+.00005,db=plane.distanceToPoint(b)+.00005;
      if(da<=0)output.push(a);
      if((da<0)!==(db<0))output.push(a.clone().lerp(b,da/(da-db)));
    }
    if(!output.length)return false;
    polygon=output;
  }
  return polygon.length>=3;
}

export function handConvexIntersections(model,meshes) {
  model.updateWorldMatrix(true,true);
  const solids=meshes.map(convexSolid);let triangles=0,intersections=0;
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!/^(young|middleage|old)_/.test(mesh.material?.name??''))return;
    const {position,skinIndex,skinWeight}=mesh.geometry.attributes,hand=new Set(),points=new Map();
    for(let i=0;i<position.count;i++){
      let weight=0;
      for(let k=0;k<4;k++)if(/^(hand|thumb_0[123]|index_0[123]|middle_0[123]|ring_0[123]|pinky_0[123])_[lr]$/.test(mesh.skeleton.bones[skinIndex.getComponent(i,k)].name))weight+=skinWeight.getComponent(i,k);
      if(weight>=.5)hand.add(i);
    }
    const pointAt=i=>{if(!points.has(i))points.set(i,mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));return points.get(i);};
    const index=mesh.geometry.index;
    for(let i=0;i<(index?.count??position.count);i+=3){
      const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
      if(!ids.some(id=>hand.has(id)))continue;
      triangles++;
      for(const solid of solids)if(triangleInConvex(ids.map(id=>pointAt(id).clone().applyMatrix4(solid.inverse)),solid))intersections++;
    }
  });return {triangles,intersections};
}
