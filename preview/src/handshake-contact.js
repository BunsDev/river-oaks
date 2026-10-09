import * as THREE from 'three';
import { placePalm } from './arm-contact.js';

const palmFrame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0,-1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)));

// Both renderers receive the same world-space contact and phase from the town.
// Ease the contact in and out; the existing solver preserves limb lengths.
export function applyHandshakeContact(arm,holder,{target,elapsed,duration=4.2}){
  if(!arm||!target)return;
  const weight=Math.max(0,Math.min(1,elapsed/.55,(duration-elapsed)/.4));
  if(!weight)return;
  holder.updateWorldMatrix(true,true);
  const rotation=holder.getWorldQuaternion(new THREE.Quaternion());
  const point=new THREE.Vector3(...target);point.y+=Math.sin(elapsed*7)*.022;
  const current=arm.foot.getWorldPosition(new THREE.Vector3()).add(arm.palmOffset.clone().applyQuaternion(arm.foot.getWorldQuaternion(new THREE.Quaternion())));
  point.copy(current.lerp(point,weight));
  const frame=rotation.clone().multiply(palmFrame);
  const currentFrame=arm.foot.getWorldQuaternion(new THREE.Quaternion()).multiply(arm.frameToHand.clone().invert());
  currentFrame.slerp(frame,weight);
  const pole=holder.localToWorld(new THREE.Vector3(-.42,1.03,.15));
  placePalm(arm,point,currentFrame,pole);
}
