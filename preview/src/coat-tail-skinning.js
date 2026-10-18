import * as THREE from 'three';
import {skinSkirt} from './skirt-skinning.js';
import {COAT_WAIST} from './coat-tail-geometry.js';

// Long split tails need knee articulation. Each half stays on its
// own leg, while the existing skirt fit supplies the pinned pelvis transition
// and exact body bind transform. All fitting happens once at construction.
export function skinCoatTails(tails,body){
  tails.updateWorldMatrix(true,false);
  const inverse=tails.matrixWorld.clone().invert(),bones=body.skeleton.bones;
  const sides=['l','r'].map(side=>{
    const indices=['pelvis',`thigh_${side}`,`calf_${side}`,'pelvis'].map(name=>bones.findIndex(bone=>bone.name===name));
    if(indices.some(i=>i<0))throw new TypeError('Coat tails require pelvis, thigh and calf bones');
    const points=indices.map(i=>bones[i].getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse));
    return {indices,hipX:points[1].x,knee:points[2].y};
  });
  const authored=tails.geometry.attributes.position.array.slice();
  const fitted=skinSkirt(tails,body,{waist:COAT_WAIST,hem:-.17});
  const {skinIndex,skinWeight}=fitted.mesh.geometry.attributes;
  for(let i=0;i<skinWeight.count;i++){
    const x=authored[i*3],y=authored[i*3+1],side=x*sides[0].hipX>=0?sides[0]:sides[1];
    const knee=THREE.MathUtils.smoothstep(side.knee-y,-.05,.12);
    const pelvis=skinWeight.getX(i)*(1-knee),leg=1-pelvis;
    // The cutaway hem clears the foot and follows the calf. Ankle rotation
    // must not drag the rear vent into the opposing boot.
    skinIndex.setXYZW(i,...side.indices);
    skinWeight.setXYZW(i,pelvis,leg*(1-knee),leg*knee,0);
  }
  return fitted;
}
