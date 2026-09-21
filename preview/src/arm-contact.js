import * as THREE from 'three';
import { applyLegIK } from './foot-placement.js';

// The same analytic two-segment solve works for elbows and knees. Capture the
// actual rig lengths and palm frame rather than assuming imported joint axes.
export function createArmContacts(model, holder) {
  holder.updateWorldMatrix(true,true);
  return ['l','r'].map(side=>{
    const upper=model.getObjectByName(`upperarm_${side}`),lower=model.getObjectByName(`lowerarm_${side}`),hand=model.getObjectByName(`hand_${side}`);
    const middle=model.getObjectByName(`middle_01_${side}`),index=model.getObjectByName(`index_01_${side}`),pinky=model.getObjectByName(`pinky_01_${side}`);
    if(!upper||!lower||!hand||!middle||!index||!pinky)return null;
    const wrist=hand.getWorldPosition(new THREE.Vector3()),palm=middle.getWorldPosition(new THREE.Vector3()).lerp(wrist,0.28);
    const forward=middle.getWorldPosition(new THREE.Vector3()).sub(wrist).normalize();
    const across=pinky.getWorldPosition(new THREE.Vector3()).sub(index.getWorldPosition(new THREE.Vector3())).normalize();
    const normal=new THREE.Vector3().crossVectors(forward,across).multiplyScalar(side==='l'?-1:1).normalize();
    const x=new THREE.Vector3().crossVectors(normal,forward).normalize();
    const palmFrame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,normal,forward));
    const orientation=hand.getWorldQuaternion(new THREE.Quaternion());
    return {side,thigh:upper,calf:lower,foot:hand,upperLength:upper.getWorldPosition(new THREE.Vector3()).distanceTo(lower.getWorldPosition(new THREE.Vector3())),lowerLength:lower.getWorldPosition(new THREE.Vector3()).distanceTo(wrist),
      frameToHand:palmFrame.invert().multiply(orientation),palmOffset:palm.sub(wrist).applyQuaternion(orientation.clone().invert()),target:new THREE.Vector3(),error:0};
  }).filter(Boolean);
}

export function placePalm(arm, point, frame, pole) {
  arm.orientation=frame.clone().multiply(arm.frameToHand);
  const offset=arm.palmOffset.clone().applyQuaternion(arm.orientation);
  arm.target.copy(point);
  const wrist=point.clone().sub(offset);
  applyLegIK(arm,wrist,pole);
  const actual=arm.foot.getWorldPosition(new THREE.Vector3()).add(arm.palmOffset.clone().applyQuaternion(arm.foot.getWorldQuaternion(new THREE.Quaternion())));
  arm.error=actual.distanceTo(point);
  return actual;
}
