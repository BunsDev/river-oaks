import { Quaternion, Vector3 } from 'three';

// Retarget the shipped rest poses in world space; their bone-local axes differ.
export function relaxResidentArms(model, spread = 0.18) {
  model.updateWorldMatrix(true, true);
  for (const side of ['l', 'r']) {
    const arm = model.getObjectByName(`upperarm_${side}`), hand = model.getObjectByName(`hand_${side}`);
    if (!arm || !hand) continue;
    const shoulder = arm.getWorldPosition(new Vector3());
    const direction = hand.getWorldPosition(new Vector3()).sub(shoulder).normalize();
    const desired = new Vector3(Math.sign(direction.x) * spread, -Math.sqrt(1-spread*spread), 0.04).normalize();
    const world = arm.getWorldQuaternion(new Quaternion());
    const parent = arm.parent.getWorldQuaternion(new Quaternion());
    const adjustment = new Quaternion().setFromUnitVectors(direction, desired);
    arm.quaternion.copy(parent.invert().multiply(adjustment).multiply(world));
    arm.updateWorldMatrix(false, true);
  }
}
