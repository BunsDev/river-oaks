import * as THREE from 'three';

// Share the hero skeleton, never the mutable geometry. Coverage follows every
// seated leg pose rather than relying on the decorative skirt to bridge knees.
export function createRidingClothes(model) {
  const body=model.getObjectByName('Jevica');
  if(!body?.isSkinnedMesh)return {object:null,update(){},dispose(){}};
  const geometry=body.geometry.clone(),p=geometry.attributes.position,n=geometry.attributes.normal;
  const indices=geometry.index?.array??Array.from({length:p.count},(_,i)=>i),covered=[];
  const {skinIndex,skinWeight}=geometry.attributes;
  const lowerBody=new Set(body.skeleton.bones.flatMap((bone,i)=>/^(pelvis|spine_01|thigh_|calf_|foot_|ball_)/.test(bone.name)?[i]:[]));
  const clothed=i=>{
    let weight=0;
    for(let k=0;k<4;k++)if(lowerBody.has(skinIndex.getComponent(i,k)))weight+=skinWeight.getComponent(i,k);
    return p.getY(i)<1.075&&weight>.5;
  };
  for(let i=0;i<indices.length;i+=3) {
    const triangle=[indices[i],indices[i+1],indices[i+2]];
    if(triangle.some(clothed))covered.push(...triangle);
  }
  geometry.setIndex(covered);geometry.clearGroups();
  for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)+n.getX(i)*.005,p.getY(i)+n.getY(i)*.005,p.getZ(i)+n.getZ(i)*.005);
  p.needsUpdate=true;geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({color:'#934564',roughness:.92,side:THREE.DoubleSide});
  material.name='Opaque rose riding trousers';
  const clothes=new THREE.SkinnedMesh(geometry,material);clothes.name='Jevica riding trousers';
  clothes.position.copy(body.position);clothes.quaternion.copy(body.quaternion);clothes.scale.copy(body.scale);
  clothes.bindMode=body.bindMode;clothes.bind(body.skeleton,body.bindMatrix);
  clothes.frustumCulled=false;clothes.castShadow=clothes.receiveShadow=true;clothes.visible=false;
  body.parent.add(clothes);
  return {object:clothes,update(riding){clothes.visible=Boolean(riding);},dispose(){clothes.removeFromParent();geometry.dispose();material.dispose();}};
}
