import * as THREE from 'three';
import {subdivideSkirtGeometry} from '../../preview/src/skirt-geometry.js';
// Offline fitting only. This module is never imported by the browser client.
export function prepareSeatedSkirtFit(skirt,model){
 const pelvis=model.getObjectByName('pelvis'),bones=skirt.skeleton.bones;
 model.updateWorldMatrix(true,true);
 const frame=new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3()));
 const offset=pelvis.matrixWorld.clone().invert().multiply(frame),inverse=frame.clone().invert();
 subdivideSkirtGeometry(skirt.geometry);
 const triangles=Array.from(skirt.geometry.index.array);
 const body=model.getObjectByName('Jevica'),bodyIndices=[],bodyRest=Array.from({length:body.geometry.attributes.position.count},(_,i)=>body.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(body.matrixWorld).applyMatrix4(inverse));
 const {skinIndex,skinWeight}=body.geometry.attributes;
 const thighSkin=i=>{let weight=0;for(let c=0;c<4;c++)if(/^(pelvis|thigh_[lr]|calf_[lr])$/.test(body.skeleton.bones[skinIndex.getComponent(i,c)].name))weight+=skinWeight.getComponent(i,c);return weight>.5;};
 for(let n=0;n<body.geometry.index.count;n+=3){const tri=[0,1,2].map(c=>body.geometry.index.getX(n+c));if(tri.every(i=>bodyRest[i].y<.02&&bodyRest[i].y>-.45&&thighSkin(i)))bodyIndices.push(...tri);}
 const attribute=skirt.geometry.attributes.position,rest=attribute.array.slice();
 const authored=Array.from({length:attribute.count},(_,i)=>skirt.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(skirt.matrixWorld).applyMatrix4(inverse));
 const weights=skirt.geometry.attributes.skinWeight,indices=skirt.geometry.attributes.skinIndex;
 return ()=>{
  attribute.array.set(rest);model.updateWorldMatrix(true,true);
  const current=pelvis.matrixWorld.clone().multiply(offset),toFrame=current.clone().invert();
  const flexion=['l','r'].map(side=>{const hip=model.getObjectByName(`thigh_${side}`).getWorldPosition(new THREE.Vector3()).applyMatrix4(toFrame),knee=model.getObjectByName(`calf_${side}`).getWorldPosition(new THREE.Vector3()).applyMatrix4(toFrame);return Math.atan2(knee.z-hip.z,hip.y-knee.y);});
  const activation=THREE.MathUtils.smoothstep(Math.min(...flexion),.8,1.4);
  if(!activation){attribute.needsUpdate=true;skirt.geometry.computeVertexNormals();return {activation,flexion};}
  const boneTransforms=bones.map((bone,i)=>bone.matrixWorld.clone().multiply(skirt.skeleton.boneInverses[i]));
  const colliderGeometry=new THREE.BufferGeometry();colliderGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bodyRest.flatMap((_,i)=>body.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(body.matrixWorld).toArray()),3));colliderGeometry.setIndex(bodyIndices);
  const collider=new THREE.Mesh(colliderGeometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));collider.updateMatrixWorld(true);
  const up=new THREE.Vector3(0,1,0).transformDirection(current),ray=new THREE.Raycaster(),direction=up.clone().negate();let contacts=0;
  // Reserve cloth clearance for the small thigh-roll differences between the
  // seated IK solution and direct symmetric/asymmetric hip bends.
  const clearance=.028,surfaceClearance=.020;
  const skinTransforms=[];let corrected=0;
  for(let i=0;i<attribute.count;i++){
   const p=authored[i],t=THREE.MathUtils.clamp((.105-p.y)/.275,0,1);
   const rz=p.y<-.07?.145:p.y<.025?THREE.MathUtils.lerp(.145,.135,(p.y+.07)/.095):THREE.MathUtils.lerp(.135,.11,(p.y-.025)/.08);
   const front=THREE.MathUtils.smoothstep(p.z/rz,0,.7),blend=front*activation;
   if(t<1e-6||!blend)continue;
   const boneBlend=new THREE.Matrix4();boneBlend.elements.fill(0);
   for(let c=0;c<4;c++){const w=weights.getComponent(i,c),matrix=boneTransforms[indices.getComponent(i,c)];for(let e=0;e<16;e++)boneBlend.elements[e]+=w*matrix.elements[e];}
   const transform=skirt.matrixWorld.clone().multiply(skirt.bindMatrixInverse).multiply(boneBlend).multiply(skirt.bindMatrix);
   skinTransforms[i]=transform.clone();const original=new THREE.Vector3().fromArray(rest,i*3).applyMatrix4(transform);
   const desired=new THREE.Vector3(p.x,.105-.275*t+.235*t-.06*THREE.MathUtils.smoothstep(t,.8,1),p.z+.17*t).applyMatrix4(current);
   original.lerp(desired,blend);
   ray.set(original.clone().addScaledVector(up,.3),direction);ray.far=.3+clearance;
   const hit=ray.intersectObject(collider,false)[0];if(hit){original.copy(hit.point).addScaledVector(up,clearance);contacts++;}
   original.applyMatrix4(transform.invert());attribute.setXYZ(i,original.x,original.y,original.z);corrected++;
  }
  const posed=Array.from({length:attribute.count},(_,i)=>skirt.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(skirt.matrixWorld));
  let surfaceCorrections=0;
  // Offline fitting only: constrain triangle interiors as well as vertices.
  // The seam and waistband remain pinned; no iterative solver runs in the client.
  for(let iteration=0;iteration<4;iteration++)for(let n=0;n<triangles.length;n+=3){
   const ids=triangles.slice(n,n+3);if(!ids.every(i=>authored[i].z>.03))continue;
   for(const bary of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){
    const point=new THREE.Vector3();for(let j=0;j<3;j++)point.addScaledVector(posed[ids[j]],bary[j]);
    ray.set(point.clone().addScaledVector(up,.5),direction);ray.far=1;const hit=ray.intersectObject(collider,false)[0];if(!hit)continue;
    const clearance=point.clone().sub(hit.point).dot(up);if(clearance>=surfaceClearance)continue;
    const denominator=bary.reduce((total,w,j)=>total+(skinTransforms[ids[j]]?w*w:0),0);if(!denominator)continue;
    for(let j=0;j<3;j++)if(skinTransforms[ids[j]])posed[ids[j]].addScaledVector(up,bary[j]*(surfaceClearance-clearance)/denominator);
    surfaceCorrections++;
   }
  }
  for(let i=0;i<posed.length;i++)if(skinTransforms[i]){const p=posed[i].clone().applyMatrix4(skinTransforms[i].invert());attribute.setXYZ(i,p.x,p.y,p.z);}
  const failures=[];let tested=0,penetrating=0,minimumClearance=Infinity,maximumStretch=0,minimumAreaRatio=Infinity;
  const restWorld=authored.map(p=>p.clone().applyMatrix4(frame));
  const area=(v,a,b,c)=>v[b].clone().sub(v[a]).cross(v[c].clone().sub(v[a])).length();
  for(let n=0;n<triangles.length;n+=3){
   const ids=triangles.slice(n,n+3);minimumAreaRatio=Math.min(minimumAreaRatio,area(posed,...ids)/area(restWorld,...ids));
   for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3];maximumStretch=Math.max(maximumStretch,posed[a].distanceTo(posed[b])/restWorld[a].distanceTo(restWorld[b]));}
   if(!ids.every(i=>authored[i].z>.03))continue;
   for(const bary of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){
    const point=new THREE.Vector3();for(let j=0;j<3;j++)point.addScaledVector(posed[ids[j]],bary[j]);
    ray.set(point.clone().addScaledVector(up,.5),direction);ray.far=1;
    const hit=ray.intersectObject(collider,false)[0];if(hit){const clearance=point.clone().sub(hit.point).dot(up);tested++;minimumClearance=Math.min(minimumClearance,clearance);if(clearance<-.001){penetrating++;if(failures.length<8)failures.push({ids,authored:ids.map(i=>authored[i].toArray()),point:point.toArray(),hit:hit.point.toArray(),clearance});}}
   }
  }
  attribute.needsUpdate=true;skirt.geometry.computeVertexNormals();skirt.computeBoundingSphere();colliderGeometry.dispose();collider.material.dispose();return {activation,flexion,corrected,contacts,tested,penetrating,minimumClearance,maximumStretch,minimumAreaRatio,failures,surfaceCorrections};
 };
}
