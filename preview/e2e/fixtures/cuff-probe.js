import * as THREE from 'three';

export function inspectCuffPixels(fixture,pixels) {
  const model=fixture.avatars[0].rig.model,ray=new THREE.Raycaster();
  model.traverse(mesh=>{if(mesh.isSkinnedMesh){mesh.computeBoundingBox();mesh.computeBoundingSphere();}});
  return pixels.map(([x,y])=>{
    ray.setFromCamera(new THREE.Vector2(x/1600*2-1,1-y/900*2),fixture.camera);
    return {pixel:[x,y],hits:ray.intersectObject(model,true).slice(0,4).map(hit=>({name:hit.object.name,material:hit.object.material.name,face:hit.faceIndex,uv:hit.uv.toArray(),position:hit.point.toArray()}))};
  });
}
