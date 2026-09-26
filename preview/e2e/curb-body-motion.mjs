import * as THREE from 'three';
import {loadCharacterRig} from '../tests/helpers/character-rig.js';
import {instantiateAvatar} from '../src/avatars.js';
import {createFootPlacement} from '../src/foot-placement.js';

// Diagnostic, not a passing realism gate: the contact regression can pass
// while the pelvis still changes height too abruptly at a sharp curb edge.
const runs=[];
for(const profile of ['woman-casual','woman-daywear','woman-tailored','man-casual','man-tailored','man-workwear','jevica']) {
  const source=await loadCharacterRig(profile);
  for(const hz of [30,60,120])for(const edge of [.7,.8,1.1,1.2]) {
    const avatar=instantiateAvatar(source,{targetHeight:profile==='jevica'?1.685:profile.startsWith('woman')?1.66:1.78});
    const root=new THREE.Group();root.add(avatar.model);
    const placement=createFootPlacement(avatar.model,root),baseY=avatar.model.position.y;
    const ground=(_x,z)=>1.5+(z< -81+edge?.16:0);
    let distance=0,previousHeight=null,previousGround=null,previousFeet=null,maxWorldSpeed=0,maxNavigationStepSpeed=0,maxFootError=0,peak=null;
    for(let frame=0;frame<3*hz;frame++) {
      distance+=1.05/hz;root.position.set(40,ground(40,-81+distance),-81+distance);
      avatar.model.position.y=baseY-.018+Math.cos(distance/1.1*Math.PI*4)*.008;
      for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);
      placement.update(1/hz,{speed:1.05,distance},ground);
      const height=placement.legs[0].thigh.getWorldPosition(new THREE.Vector3()).y;
      const feet=placement.legs.map(leg=>({side:leg.side,contact:leg.contact,swingProgress:leg.swing?.progress??null,target:leg.ikTarget.toArray()}));
      if(previousHeight!==null&&Math.abs(height-previousHeight)*hz>maxWorldSpeed) {
        maxWorldSpeed=Math.abs(height-previousHeight)*hz;peak={frame,height,previousHeight,navigationHeight:root.position.y,feet,previousFeet};
      }
      if(previousGround!==null&&previousGround!==root.position.y)maxNavigationStepSpeed=Math.max(maxNavigationStepSpeed,Math.abs(height-previousHeight)*hz);
      for(const leg of placement.legs)maxFootError=Math.max(maxFootError,leg.error);
      previousHeight=height;previousGround=root.position.y;previousFeet=feet;
    }
    runs.push({profile,hz,edge,maxWorldSpeed,maxNavigationStepSpeed,maxFootError,peak});avatar.dispose();
  }
}
console.log(JSON.stringify({runs,scope:'Sharp 16 cm curb descent at four gait phases on seven production rigs. Hip world speed is a diagnostic of unresolved body-height discontinuities, not a passing motion-quality assertion.'}));
