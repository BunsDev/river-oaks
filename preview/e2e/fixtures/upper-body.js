import * as THREE from 'three';

export function inspectUpperBody(avatar) {
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(avatar.object.getWorldQuaternion(new THREE.Quaternion()));
  const position=name=>avatar.rig.model.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  const arms={},legs={};
  for(const side of ['l','r']) {
    const shoulder=position(`upperarm_${side}`),elbow=position(`lowerarm_${side}`),wrist=position(`hand_${side}`);
    const offset=part=>{
      const bone=avatar.rig.model.getObjectByName(`${part}_${side}`),q=avatar.rig.rest.get(bone).clone().invert().multiply(bone.quaternion);
      return 2*Math.atan2(new THREE.Vector3(q.x,q.y,q.z).dot(avatar.rig.axes.get(bone).x),q.w);
    };
    arms[side]={lead:elbow.clone().sub(shoulder).normalize().dot(forward),wrist:wrist.toArray(),elbowFlex:offset('lowerarm'),wristFlex:offset('hand')};
    legs[side]=position(`foot_${side}`).sub(position(`thigh_${side}`)).dot(forward);
  }
  return {arms,legs,armDifference:arms.l.lead-arms.r.lead,legDifference:legs.l-legs.r};
}
