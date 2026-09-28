import * as THREE from 'three';

// An additive layer above gait and below action/contact poses. Rest-frame axes
// on the shipped rigs: negative x brings the arm forward and flexes the elbow;
// positive left / negative right z opens the upper arm away from the torso.
export function createConversationBody(avatar) {
 const joints=new Map(avatar.bones.map(bone=>[bone.name,bone]));
 const rotation=new THREE.Quaternion(),neckWorld=new THREE.Quaternion(),parentWorld=new THREE.Quaternion();
 const neck=joints.get('neck_01');
 const rotate=(name,axis,angle)=>{
  const bone=joints.get(name);if(!bone||!angle)return;
  bone.quaternion.multiply(rotation.setFromAxisAngle(avatar.axes.get(bone)[axis],angle));
 };
 return {
  apply(pose,{hands=true}={}) {
   if(!pose)return;
   if(pose.lean||pose.turn||pose.tilt) {
    neck?.getWorldQuaternion(neckWorld).normalize();
    rotate('spine_02','x',pose.lean);
    rotate('spine_03','y',pose.turn);
    rotate('spine_02','z',pose.tilt);
    // Retain the actual gaze under rotated/scaled parents, including nods.
    if(neck)neck.quaternion.copy(neck.parent.getWorldQuaternion(parentWorld).normalize().invert().multiply(neckWorld));
   }
   if(!hands)return;
   for(const side of ['l','r']) {
    const amount=side==='l'?pose.left:pose.right,beat=side==='l'?pose.leftBeat:pose.rightBeat,sign=side==='l'?1:-1;
    rotate(`clavicle_${side}`,'z',sign*.018*amount);
    rotate(`upperarm_${side}`,'x',-.28*amount-.3*beat);
    rotate(`upperarm_${side}`,'z',sign*.09*amount);
    rotate(`lowerarm_${side}`,'x',-.52*amount-beat);
    rotate(`hand_${side}`,'x',.10*amount+.5*beat);
    rotate(`hand_${side}`,'y',-sign*.16*amount);
   }
  },
 };
}
