import * as THREE from 'three';
import {createArmContacts,placePalm} from './arm-contact.js';

// Palms on a vehicle's grips. Pass the avatar's arms when it already measured
// them at rest; handlebars (motorcycle, bicycle) take the palms down.
export function createDrivingHands(model,holder,arms=createArmContacts(model,holder)) {
 const fingers=[];model.traverse(bone=>{if(bone.isBone&&/^(index|middle|ring|pinky)_0[123]_[lr]$/.test(bone.name))fingers.push({bone,rest:bone.quaternion.clone()});});
 const pose=(vehicle,spec)=>{
  const orientation=vehicle.getWorldQuaternion(new THREE.Quaternion());
  const localFrame=spec.kind!=='rolls'?new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2):new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,1),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,-1,0)));
  const steering=vehicle.userData.driveSteeringAngle??0;
  // The car's wheel turns about the vehicle's X axis and handlebars about Y; the
  // Ribbonwing's side stick tilts about X under the right palm only, while the
  // left palm stays on the throttle (grips[1]).
  const wheel=spec.kind==='rolls',stick=spec.kind==='hover';
  const steeringRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(wheel||stick?1:0,wheel||stick?0:1,0),steering*(wheel?-2.2:stick?.6:.6));
  const pivot=new THREE.Vector3(...(spec.steeringPivot??(spec.kind==='rolls'?[-.48,1.03,.43]:[-.75,1.08,0])));
  const frame=orientation.clone().multiply(steeringRotation).multiply(localFrame);
  for(const arm of arms){const side=arm.side==='l'?1:-1,index=arm.side==='l'?1:0;
   const turned=!stick||index===0;
   placePalm(arm,vehicle.localToWorld(turned?new THREE.Vector3(...spec.grips[index]).sub(pivot).applyQuaternion(steeringRotation).add(pivot):new THREE.Vector3(...spec.grips[index])),turned?frame:orientation.clone().multiply(localFrame),vehicle.localToWorld(new THREE.Vector3(spec.driverSeat[0]-.06,spec.driverSeat[1]+.18,spec.driverSeat[2]+side*.32)));
  }
  for(const {bone,rest} of fingers){bone.quaternion.copy(rest);bone.updateWorldMatrix(true,false);const axis=new THREE.Vector3(1,0,0).applyQuaternion(frame).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis,.85));bone.updateWorldMatrix(false,true);}
 };
 pose.reset=()=>{for(const {bone,rest} of fingers)bone.quaternion.copy(rest);};
 return pose;
}
