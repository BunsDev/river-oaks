import * as THREE from 'three';
import {createArmContacts,placePalm} from './arm-contact.js';

// Use measured arm lengths and palm frames: wrists stay aligned with forearms.
export function createFlightHands(model,holder) {
  const arms=createArmContacts(model,holder),fingers=[];
  model.traverse(bone=>{if(bone.isBone&&/^(index|middle|ring|pinky)_0[123]_[lr]$/.test(bone.name))fingers.push({bone,rest:bone.quaternion.clone()});});
  const reset=()=>{for(const {bone,rest}of fingers)bone.quaternion.copy(rest);};
  return {reset,
    update({amount=1,speed=0,bank=0}={}) {
      const glide=THREE.MathUtils.smoothstep(speed, .4,4.5),rotation=holder.getWorldQuaternion(new THREE.Quaternion());
      for(const arm of arms) {
        const right=arm.side==='r',side=right?-1:1;
        const hover=new THREE.Vector3(side*.30,1.08,.22);
        const reach=right?new THREE.Vector3(-.23,1.94,.12):new THREE.Vector3(.28,1.23,.30);
        const target=holder.localToWorld(hover.lerp(reach,glide));
        const old=[arm.thigh,arm.calf,arm.foot].map(bone=>bone.quaternion.clone());
        const forward=new THREE.Vector3(0,right?1:-1,0),normal=new THREE.Vector3(0,0,1),across=new THREE.Vector3().crossVectors(normal,forward);
        const frame=rotation.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,normal,forward)));
        const pole=holder.localToWorld(new THREE.Vector3(side*(.48+Math.abs(bank)*.1),right?1.50:1.13,.13));
        placePalm(arm,target,frame,pole);
        for(const [i,bone]of [arm.thigh,arm.calf,arm.foot].entries())bone.quaternion.slerp(old[i],1-amount);
      }
      for(const {bone,rest}of fingers) {
        const right=bone.name.endsWith('_r'),curl=(right?.62:.38)*amount;
        bone.quaternion.copy(rest);bone.updateWorldMatrix(true,false);
        // Curl around the palm's across axis, leaving a relaxed rather than clenched fist.
        const axis=new THREE.Vector3(right?-1:1,0,0).applyQuaternion(rotation).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
        bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis,curl));
      }
      holder.updateWorldMatrix(true,true);
    },
    get contacts(){return arms;},
  };
}
