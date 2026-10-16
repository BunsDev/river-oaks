import * as THREE from 'three';
import { subdivideSkirtGeometry } from './skirt-geometry.js';
import { SKIRT_SEAT_MORPH } from './skirt-seat-morph-data.js';

// Contact fitting is baked offline. Runtime changes only GPU morph influences;
// the existing skirt geometry, skeleton, material and disposal owner stay intact.
export function createSkirtSeatMorph(skirt, model, data = SKIRT_SEAT_MORPH) {
  const geometry = skirt.geometry;
  for (const [name, expected] of [['position', data.sourcePositions], ['skinWeight', data.sourceWeights]]) {
    const actual = geometry.attributes[name].array;
    if (actual.length !== expected.length || actual.some((value, i) => Math.abs(value - expected[i]) > 1e-5)) throw new TypeError('Seated skirt bake does not match the authored garment');
  }
  const pelvis = model.getObjectByName('pelvis');
  const legs = ['l', 'r'].map(side => ({thigh: model.getObjectByName(`thigh_${side}`), calf: model.getObjectByName(`calf_${side}`)}));
  if (!pelvis || legs.some(({thigh, calf}) => thigh?.parent !== pelvis || calf?.parent !== thigh)) throw new TypeError('Seated skirt requires the supported pelvis/thigh rig');
  model.updateWorldMatrix(true, true);
  const frame = new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()), model.getWorldQuaternion(new THREE.Quaternion()), model.getWorldScale(new THREE.Vector3()));
  const toAuthored = new THREE.Matrix3().setFromMatrix4(frame.invert().multiply(pelvis.matrixWorld));
  if (data.subdivide !== false) subdivideSkirtGeometry(geometry);
  // Details use the cloth's interpolated joint weights, baked offline together
  // with their corrective so trim cannot lag behind the garment it decorates.
  if (data.fittedWeights) geometry.attributes.skinWeight.array.set(data.fittedWeights);
  if (geometry.attributes.position.array.length !== data.positionDelta.length || data.normalDelta.length !== data.positionDelta.length) throw new TypeError('Seated skirt topology differs from its bake');
  geometry.morphTargetsRelative = true;
  // Split the full seated shape using the garment's existing thigh weights.
  // Both targets sum to the baked shape; each leg can reach it independently.
  const weights = geometry.attributes.skinWeight;
  for (const [name, delta] of [['position', data.positionDelta], ['normal', data.normalDelta]]) {
    const left = new Float32Array(delta.length), right = new Float32Array(delta.length);
    for (let i = 0; i < weights.count; i++) {
      const total = weights.getY(i) + weights.getZ(i);
      const share = total > 0 ? weights.getY(i) / total : .5;
      for (let axis = 0; axis < 3; axis++) {
        const index = i * 3 + axis;
        left[index] = delta[index] * share;
        right[index] = delta[index] * (1 - share);
      }
    }
    geometry.morphAttributes[name] = [new THREE.BufferAttribute(left, 3), new THREE.BufferAttribute(right, 3)];
  }
  skirt.updateMorphTargets();
  const direction = new THREE.Vector3(), flexions = [0, 0];
  return () => {
    for (let i = 0; i < legs.length; i++) {
      const {thigh, calf} = legs[i];
      direction.copy(calf.position).multiply(thigh.scale).applyQuaternion(thigh.quaternion).applyMatrix3(toAuthored);
      flexions[i] = Math.atan2(direction.z, -direction.y);
    }
    // Opposing walking strides keep the rest silhouette.
    const seated = THREE.MathUtils.smoothstep(Math.min(flexions[0], flexions[1]), 0, .4);
    for (let i = 0; i < legs.length; i++) skirt.morphTargetInfluences[i] = seated * THREE.MathUtils.smoothstep(flexions[i], .4, 1.4);
  };
}
