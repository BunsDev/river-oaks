import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const smooth = t => t*t*(3-2*t);

// Analytic two-bone solve. A forward knee pole prevents the leg from flipping
// when the hip, knee and ankle start almost collinear in a neutral rig.
export function solveLeg(hip, target, pole, upperLength, lowerLength) {
  const direction = target.clone().sub(hip);
  const rawLength = direction.length();
  if (rawLength < 1e-7) direction.set(0, -1, 0); else direction.divideScalar(rawLength);
  const length = clamp(rawLength, Math.abs(upperLength-lowerLength)+1e-5, upperLength+lowerLength-1e-5);
  const along = (upperLength*upperLength-lowerLength*lowerLength+length*length)/(2*length);
  const bend = pole.clone().sub(hip);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend.set(Math.abs(direction.x) < 0.9 ? 1 : 0, Math.abs(direction.x) < 0.9 ? 0 : 1, 0);
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  return {
    knee: hip.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, upperLength*upperLength-along*along))),
    ankle: hip.clone().addScaledVector(direction, length),
  };
}

function rotateToward(bone, child, target) {
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const from = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const to = target.clone().sub(origin).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(world));
  bone.updateWorldMatrix(false, true);
}

export function applyLegIK(leg, target, pole) {
  const hip = leg.thigh.getWorldPosition(new THREE.Vector3());
  const solution = solveLeg(hip, target, pole, leg.upperLength, leg.lowerLength);
  // Retain the shoe's neutral orientation instead of inheriting knee flexion.
  const shoe = leg.orientation?.clone() ?? leg.foot.getWorldQuaternion(new THREE.Quaternion());
  rotateToward(leg.thigh, leg.calf, solution.knee);
  rotateToward(leg.calf, leg.foot, solution.ankle);
  leg.foot.quaternion.copy(leg.foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(shoe));
  leg.foot.updateWorldMatrix(false, true);
  return solution.ankle.distanceTo(target);
}

export function createFootPlacement(model, root) {
  root.updateWorldMatrix(true, true);
  const legs = ['l','r'].map((side, index) => {
    const thigh = model.getObjectByName(`thigh_${side}`), calf = model.getObjectByName(`calf_${side}`), foot = model.getObjectByName(`foot_${side}`);
    if (!thigh || !calf || !foot) return null;
    const hip = thigh.getWorldPosition(new THREE.Vector3()), knee = calf.getWorldPosition(new THREE.Vector3()), ankle = foot.getWorldPosition(new THREE.Vector3());
    const rest=root.worldToLocal(ankle.clone());
    rest.x=root.worldToLocal(hip.clone()).x; // Walk under the hips, rather than retaining the rig's wide bind stance.
    return {side, index, thigh, calf, foot, upperLength:hip.distanceTo(knee), lowerLength:knee.distanceTo(ankle), rest, target:null, swing:null, lastPhase:0, contact:true};
  }).filter(Boolean);
  let lastDistance = null, lastPosition = null, hasStepped = false;
  const swingTravel = 0.38, reach = 0.25;
  return {
    legs,
    update(delta, locomotion, groundAt) {
      if (legs.length !== 2) return;
      root.updateWorldMatrix(true, true);
      const origin = root.getWorldPosition(new THREE.Vector3());
      const rotation = root.getWorldQuaternion(new THREE.Quaternion());
      const forward = new THREE.Vector3(0,0,1).applyQuaternion(rotation);
      const travelForward = Number.isFinite(locomotion?.heading) ? new THREE.Vector3(Math.sin(locomotion.heading),0,Math.cos(locomotion.heading)) : forward;
      const distance = locomotion?.distance ?? 0, speed = locomotion?.speed ?? 0;
      const reset = lastDistance === null || distance < lastDistance || lastPosition.distanceTo(origin) > 1;
      const neutral = leg => {
        const point = root.localToWorld(leg.rest.clone());
        point.y = groundAt(point.x, point.z) + leg.rest.y;
        return point;
      };
      for (const leg of legs) {
        const shoe = leg.foot.getWorldQuaternion(new THREE.Quaternion());
        const sample = neutral(leg), epsilon = 0.12;
        const slopeX = (groundAt(sample.x+epsilon,sample.z)-groundAt(sample.x-epsilon,sample.z))/(2*epsilon);
        const slopeZ = (groundAt(sample.x,sample.z+epsilon)-groundAt(sample.x,sample.z-epsilon))/(2*epsilon);
        const normal = new THREE.Vector3(-slopeX,1,-slopeZ).normalize();
        shoe.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal));
        if (reset) {leg.target=neutral(leg);leg.swing=null;leg.orientation=shoe.clone();hasStepped=false;}
        const makeSwing = (end,settling) => ({start:leg.target.clone(), end, progress:0, settling, fromRotation:leg.orientation.clone(), toRotation:shoe.clone()});
        const moving = speed > 0.03;
        const trailing = leg.target.clone().sub(neutral(leg)).dot(forward) < -reach;
        if (moving && !legs.some(other=>other.swing) && (trailing || !hasStepped && leg.index===1)) {
          const end = neutral(leg).addScaledVector(travelForward, swingTravel+reach);
          end.y = groundAt(end.x,end.z)+leg.rest.y;
          leg.swing = makeSwing(end,false);hasStepped=true;
        }
        // Finish an interrupted step, then bring the trailing foot under the body.
        // The two feet never enter a settling step at the same time.
        if (!moving && leg.swing && !leg.swing.settling) {
          leg.swing = makeSwing(neutral(leg),true);
        }
        if (!moving && !leg.swing && !legs.some(other=>other.swing) && (leg.target.distanceTo(neutral(leg)) > 0.09 || leg.orientation.angleTo(shoe)>0.4)) {
          leg.swing = makeSwing(neutral(leg),true);
        }
        if (leg.swing) {
          const swing = leg.swing;
          swing.progress = swing.settling ? Math.min(1,swing.progress+delta/0.24) : Math.min(1,swing.progress+Math.max(0,distance-(lastDistance ?? distance))/swingTravel);
          if (!swing.settling) {
            swing.end.copy(neutral(leg)).addScaledVector(travelForward,swingTravel*(1-swing.progress)+reach);
            swing.end.y=groundAt(swing.end.x,swing.end.z)+leg.rest.y;
          }
          leg.target.copy(swing.start).lerp(swing.end,smooth(swing.progress));
          leg.orientation.slerpQuaternions(swing.fromRotation,swing.toRotation,smooth(swing.progress));
          leg.target.y += Math.sin(Math.PI*swing.progress) * (swing.settling ? 0.035 : 0.075);
          if (swing.progress >= 1) leg.swing = null;
        }
        leg.contact = !leg.swing;
      }
      // Let the pelvis yield to the support geometry on slopes and turns. The
      // caller restores the authored root height before each update, so this
      // correction never accumulates or changes the navigation position.
      let lower = 0;
      for (const leg of legs) {
        const hip = leg.thigh.getWorldPosition(new THREE.Vector3());
        const horizontal = (hip.x-leg.target.x)**2+(hip.z-leg.target.z)**2;
        const reach = leg.upperLength+leg.lowerLength-0.012;
        const vertical = Math.sqrt(Math.max(0,reach*reach-horizontal));
        lower = Math.max(lower,hip.y-leg.target.y-vertical);
      }
      model.position.y -= Math.min(0.18,lower)/root.getWorldScale(new THREE.Vector3()).y;
      root.updateWorldMatrix(true,true);
      for (const leg of legs) {
        const pole = leg.thigh.getWorldPosition(new THREE.Vector3()).addScaledVector(forward, 1);
        leg.error = applyLegIK(leg, leg.target, pole);
      }
      lastDistance = distance; lastPosition = origin.clone();
    },
  };
}
