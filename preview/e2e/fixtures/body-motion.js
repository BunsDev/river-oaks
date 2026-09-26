import * as THREE from 'three';

export function inspectBodyPose(avatar) {
  const origin=avatar.object.getWorldPosition(new THREE.Vector3());
  const legs=avatar.feet.map(leg=>{
    const hip=leg.thigh.getWorldPosition(new THREE.Vector3()),knee=leg.calf.getWorldPosition(new THREE.Vector3()),ankle=leg.foot.getWorldPosition(new THREE.Vector3());
    return {side:leg.side,contact:leg.contact,swingProgress:leg.swing?.progress??null,hipHeight:hip.y-origin.y,horizontal:Math.hypot(hip.x-ankle.x,hip.z-ankle.z),extension:hip.distanceTo(ankle)/(leg.upperLength+leg.lowerLength),knee:Math.PI-hip.clone().sub(knee).angleTo(ankle.clone().sub(knee))};
  });
  const height=legs.reduce((sum,l)=>sum+l.hipHeight,0)/legs.length;
  return {height,worldHeight:height+origin.y,legs};
}
