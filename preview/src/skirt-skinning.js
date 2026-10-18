import * as THREE from 'three';

// Fit an owned skirt to the existing skeleton, keeping the waistband on the
// pelvis and letting the hem follow each thigh. No new skeleton or frame loop.
export function skinSkirt(skirt,body,{waist=.105,hem=-.17}={}){
  const skeleton=body?.skeleton,bones=skeleton?.bones;
  if(!body?.isSkinnedMesh||!bones)throw new TypeError('A fitted skirt requires a skinned body');
  const pelvis=bones.findIndex(b=>b.name==='pelvis'),left=bones.findIndex(b=>b.name==='thigh_l'),right=bones.findIndex(b=>b.name==='thigh_r');
  if([pelvis,left,right].some(i=>i<0))throw new TypeError('Skirt rig is incompatible');
  body.updateWorldMatrix(true,false);skirt.updateWorldMatrix(true,false);
  const toSkirt=skirt.matrixWorld.clone().invert(),hipX=i=>bones[i].getWorldPosition(new THREE.Vector3()).applyMatrix4(toSkirt).x;
  const lx=hipX(left),rx=hipX(right),position=skirt.geometry.attributes.position,indices=[],weights=[];
  for(let i=0;i<position.count;i++){
    const lower=THREE.MathUtils.clamp((waist-position.getY(i))/(waist-hem),0,1);
    const legWeight=Math.pow(lower,1.2)*.95;
    const side=THREE.MathUtils.smoothstep(position.getX(i),Math.min(lx,rx)*.5,Math.max(lx,rx)*.5),leftWeight=lx>rx?side:1-side;
    indices.push(pelvis,left,right,0);weights.push(1-legWeight,legWeight*leftWeight,legWeight*(1-leftWeight),0);
  }
  // Express authored local vertices in the body's bind coordinates, then reuse
  // its exact bind matrix and skeleton. This avoids double parent transforms.
  const toBody=body.matrixWorld.clone().invert().multiply(skirt.matrixWorld);
  const geometry=skirt.geometry;geometry.applyMatrix4(toBody);
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const fitted=new THREE.SkinnedMesh(geometry,skirt.material);fitted.name=skirt.name;fitted.userData={...skirt.userData};
  fitted.position.copy(body.position);fitted.quaternion.copy(body.quaternion);fitted.scale.copy(body.scale);fitted.bindMode=body.bindMode;fitted.bind(skeleton,body.bindMatrix);
  fitted.frustumCulled=false;fitted.castShadow=skirt.castShadow;fitted.receiveShadow=skirt.receiveShadow;
  const group=new THREE.Group();body.parent.add(group);group.add(fitted);skirt.removeFromParent();
  return {mesh:fitted,group};
}
