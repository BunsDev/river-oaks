import * as THREE from 'three';

// Measure skin once in the attachment's rest frame, following the existing
// head/costume fitting convention. Runtime animation still follows its bone.
export function measureLimbProfile(model, piece) {
  model.updateMatrixWorld(true);piece.updateWorldMatrix(true,false);
  const length=piece.userData.length,points=[],vertex=new THREE.Vector3();
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||! /^(young|middleage|old)_/.test(mesh.material?.name??''))return;
    const bone=mesh.skeleton.bones.indexOf(piece.parent);if(bone<0)return;
    mesh.skeleton.update();
    const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
    for(let i=0;i<position.count;i++){
      let weight=0;for(let k=0;k<4;k++)if(skinIndex.getComponent(i,k)===bone)weight+=skinWeight.getComponent(i,k);
      if(weight<.25)continue;
      vertex.fromBufferAttribute(position,i);mesh.applyBoneTransform(i,vertex).applyMatrix4(mesh.matrixWorld);piece.worldToLocal(vertex);
      if(vertex.y<-.02||vertex.y>length+.02||Math.hypot(vertex.x,vertex.z)>.2)continue;
      points.push(vertex.clone());
    }
  });
  if(points.length<20)return null;
  const bands=Array.from({length:13},(_,i)=>{
    const y=length*i/12,near=points.filter(p=>Math.abs(p.y-y)<=length/12);
    if(near.length<3)return null;
    const box=new THREE.Box3().setFromPoints(near),cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
    return {y,cx,cz,rx:(box.max.x-box.min.x)/2,rz:(box.max.z-box.min.z)/2};
  }).filter(Boolean);
  return bands.length>=2?bands:null;
}
export function limbSurfacePoint(profile,y,angle,fallback,clearance=.006) {
  if(!profile)return [Math.cos(angle)*fallback,y,Math.sin(angle)*fallback];
  const upper=profile.findIndex(b=>b.y>=y),a=profile[Math.max(0,upper<0?profile.length-1:upper-1)],b=profile[upper<0?profile.length-1:upper];
  const t=Math.max(0,Math.min(1,(y-a.y)/(b.y-a.y||1))),mix=key=>a[key]+(b[key]-a[key])*t;
  return [mix('cx')+Math.cos(angle)*(mix('rx')+clearance),y,mix('cz')+Math.sin(angle)*(mix('rz')+clearance)];
}
