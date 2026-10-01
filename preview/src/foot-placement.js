import * as THREE from 'three';
import { measureFootSupport } from './sole-support.js';
import { createFootRoll } from './foot-roll.js';

const clamp = THREE.MathUtils.clamp;
const smooth = t => t*t*(3-2*t);
// Swing fraction at which body height starts transferring toward the landing.
const TRANSFER_START = .25, REACH_KNEE = .01;
// Pelvis release: critically damped return (1/s) and its speed cap (m/s).
const RISE_RESPONSE = 20, RISE_CAP = .5;
// Decay rate (1/s) of the body height offset after an abrupt navigation step.
const STEP_TRANSFER = 8;
// A hinge with a C1 onset: zero below -knee, the identity above +knee, and a
// quadratic blend between, never less than the hard limit it softens.
const softLimit = (want, knee) => want <= -knee ? 0 : want >= knee ? want : (want+knee)*(want+knee)/(4*knee);

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
  const shoe = (leg.ikOrientation??leg.orientation)?.clone() ?? leg.foot.getWorldQuaternion(new THREE.Quaternion());
  rotateToward(leg.thigh, leg.calf, solution.knee);
  rotateToward(leg.calf, leg.foot, solution.ankle);
  leg.foot.quaternion.copy(leg.foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(shoe));
  leg.foot.updateWorldMatrix(false, true);
  return solution.ankle.distanceTo(target);
}

export function createFootPlacement(model, root) {
  root.updateWorldMatrix(true, true);model.updateMatrixWorld(true);
  const legs = ['l','r'].map((side, index) => {
    const thigh = model.getObjectByName(`thigh_${side}`), calf = model.getObjectByName(`calf_${side}`), foot = model.getObjectByName(`foot_${side}`);
    if (!thigh || !calf || !foot) return null;
    const hip = thigh.getWorldPosition(new THREE.Vector3()), knee = calf.getWorldPosition(new THREE.Vector3()), ankle = foot.getWorldPosition(new THREE.Vector3());
    const rest=root.worldToLocal(ankle.clone());
    rest.x=root.worldToLocal(hip.clone()).x; // Walk under the hips, rather than retaining the rig's wide bind stance.
    const {points:sole,toeWeights,sources:soleSources}=measureFootSupport(model,foot,side);
    const roll=createFootRoll(foot,model.getObjectByName(`ball_${side}`),sole,toeWeights);
    return {side, index, thigh, calf, foot, sole, soleSources, roll, bindScale:foot.getWorldScale(new THREE.Vector3()).y, baseUpperLength:hip.distanceTo(knee), baseLowerLength:knee.distanceTo(ankle), upperLength:hip.distanceTo(knee), lowerLength:knee.distanceTo(ankle), rest, target:null, swing:null, lastPhase:0, contact:true};
  }).filter(Boolean);
  let lastDistance = null, lastPosition = null, hasStepped = false, pelvisLower = 0, bodyHeight = 0, bodyRise = 0, bodyRootHeight = null;
  const swingTravel = 0.38, reach = 0.25;
  return {
    legs,
    update(delta, locomotion, groundAt) {
      if (legs.length !== 2) return;
      root.updateWorldMatrix(true, false);
      const origin = root.getWorldPosition(new THREE.Vector3());
      const rotation = root.getWorldQuaternion(new THREE.Quaternion());
      const forward = new THREE.Vector3(0,0,1).applyQuaternion(rotation);
      const travelForward = Number.isFinite(locomotion?.heading) ? new THREE.Vector3(Math.sin(locomotion.heading),0,Math.cos(locomotion.heading)) : forward;
      const distance = locomotion?.distance ?? 0, speed = locomotion?.speed ?? 0;
      const reset = lastDistance === null || distance < lastDistance || lastPosition.distanceTo(origin) > 1;
      if(reset)pelvisLower=0;
      if(speed<=.03&&!legs.some(leg=>leg.swing))hasStepped=false;
      const scale=root.getWorldScale(new THREE.Vector3()).y,epsilon=.12;
      // Navigation must follow the exact collision surface, but the rendered
      // body transfers height over time when crossing a curb. Continuous slopes
      // follow navigation directly; only height jumps faster than 1.2 m/s add
      // a decaying offset. Keep the state in world space, clear it on relocation,
      // and leave shoe targets on the actual terrain below.
      const heightStep=reset?0:origin.y-lastPosition.y;
      const abruptStep=Math.abs(heightStep)>1.2*delta;
      bodyRootHeight=reset?origin.y:origin.y+(bodyRootHeight-lastPosition.y-(abruptStep?heightStep:0))*Math.exp(-STEP_TRANSFER*delta);
      const heightLag=bodyRootHeight-origin.y;
      model.position.y+=heightLag/scale;
      root.updateWorldMatrix(true,true);
      const surfaceNormal=point=>{
        const slopeX=(groundAt(point.x+epsilon,point.z)-groundAt(point.x-epsilon,point.z))/(2*epsilon);
        const slopeZ=(groundAt(point.x,point.z+epsilon)-groundAt(point.x,point.z-epsilon))/(2*epsilon);
        return new THREE.Vector3(-slopeX,1,-slopeZ).normalize();
      };
      const offset=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
      const supportHeight=(point,leg,orientation,normal=surfaceNormal(point),samples=leg.sole)=>{
        if(!leg.sole.length)return groundAt(point.x,point.z)+leg.rest.y*scale/normal.y;
        let height=-Infinity;
        for(const [index,sample] of samples.entries()) {
          offset.copy(sample).multiply(leg.soleScale).applyQuaternion(orientation);
          const candidate=groundAt(point.x+offset.x,point.z+offset.z)-offset.y;
          if(candidate>height){height=candidate;if(samples===leg.roll?.points)leg.supportIndex=index;}
        }
        return height;
      };
      const poseAt=(point,leg,base)=>{
        const normal=surfaceNormal(point);
        const orientation=base.clone().premultiply(new THREE.Quaternion().setFromUnitVectors(up,normal));
        point.y=supportHeight(point,leg,orientation,normal);
        return orientation;
      };
      for (const leg of legs) {
        const base=leg.foot.getWorldQuaternion(new THREE.Quaternion());
        leg.soleScale=leg.foot.getWorldScale(new THREE.Vector3());
        leg.upperLength=leg.baseUpperLength*leg.soleScale.y/leg.bindScale;
        leg.lowerLength=leg.baseLowerLength*leg.soleScale.y/leg.bindScale;
        const sample=root.localToWorld(leg.rest.clone()),shoe=poseAt(sample,leg,base);
        if (reset) {leg.roll?.reset();leg.target=sample.clone();leg.swing=null;leg.orientation=shoe.clone();hasStepped=false;}
        const makeSwing = (end,settling,travel=swingTravel,turning=false) => ({turning,start:leg.target.clone(), end, progress:0, settling, travel, fromRotation:leg.orientation.clone(), toRotation:poseAt(end,leg,base)});
        const moving = speed > 0.03;
        const trailing = leg.target.clone().sub(sample).dot(travelForward) < -reach;
        if (moving && !legs.some(other=>other.swing) && (trailing || !hasStepped && leg.index===1)) {
          // From standing, the support foot starts under the hip rather than
          // ahead of it. A half-length first swing avoids leaving it far behind.
          const travel=hasStepped?swingTravel:swingTravel/2;
          const end = sample.clone().addScaledVector(travelForward, travel+reach);
          leg.swing = makeSwing(end,false,travel);hasStepped=true;
        }
        // Finish an interrupted step, then bring the trailing foot under the body.
        // The two feet never enter a settling step at the same time.
        if (!moving && leg.swing && !leg.swing.settling) {
          leg.swing = makeSwing(sample.clone(),true);
        }
        const turning=leg.orientation.angleTo(shoe)>.25;
        if (!moving && !leg.swing && !legs.some(other=>other.swing) && (leg.target.distanceTo(sample) > 0.09 || turning)) {
          leg.swing = makeSwing(sample.clone(),true,swingTravel,turning);
        }
        if (leg.swing) {
          const swing = leg.swing;
          swing.progress = swing.settling ? Math.min(1,swing.progress+delta/0.24) : Math.min(1,swing.progress+Math.max(0,distance-(lastDistance ?? distance))/swing.travel);
          // A turning body's natural stance keeps moving during the step.
          // Follow it only while airborne; the supporting shoe stays planted.
          if(swing.turning) {
            swing.end.copy(sample);
            swing.toRotation.copy(poseAt(swing.end,leg,base));
          }
          // The navigation frame can overshoot the exact landing time. Keep
          // the already-planned endpoint at touchdown rather than moving it
          // past the curb with the remaining body travel in that frame.
          if (!swing.settling && swing.progress < 1) {
            swing.end.copy(sample).addScaledVector(travelForward,swing.travel*(1-swing.progress)+reach);
            swing.toRotation.copy(poseAt(swing.end,leg,base));
          }
          leg.target.copy(swing.start).lerp(swing.end,smooth(swing.progress));
          leg.orientation.slerpQuaternions(swing.fromRotation,swing.toRotation,smooth(swing.progress));
          // Zero vertical arc velocity at lift-off and landing.
          leg.target.y += Math.sin(Math.PI*swing.progress)**2 * (swing.settling ? 0.035 : 0.075);
          leg.target.y=Math.max(leg.target.y,supportHeight(leg.target,leg,leg.orientation));
          if (swing.progress >= 1) leg.swing = null;
        }
        leg.contact = !leg.swing;
        leg.ikTarget=leg.target.clone();leg.ikOrientation=leg.orientation.clone();
        if(leg.roll) {
          const stanceForward=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
          const rolled=leg.roll.update({target:leg.target,orientation:leg.orientation,lead:leg.target.clone().sub(sample).dot(stanceForward),swing:leg.swing,speed,delta,scale:leg.soleScale});
          const support=supportHeight(rolled.target,leg,rolled.orientation,undefined,leg.roll.points);
          // The swing arc is clearance above the neutral shoe footprint. Add
          // it to the rotated footprint, so heel landing does not snap down
          // from a different ankle height when stance begins.
          const clearance=leg.contact?0:Math.max(0,leg.target.y-supportHeight(leg.target,leg,leg.orientation));
          rolled.target.y=support+clearance;
          rolled.pivotId=leg.supportIndex;rolled.pivot=leg.roll.points[leg.supportIndex];
          leg.roll.commit(rolled.target,rolled.orientation,leg.soleScale,rolled.pivotId,leg.contact);
          leg.ikTarget.copy(rolled.target);leg.ikOrientation.copy(rolled.orientation);leg.rollPose=rolled;
          leg.supportPoint=rolled.pivot.clone().multiply(leg.soleScale).applyQuaternion(rolled.orientation).add(rolled.target);
        }
      }
      // Let the pelvis yield to the support geometry on slopes and turns. The
      // caller restores the authored root height before each update, so this
      // correction never accumulates or changes the navigation position.
      let lower = 0, descent = 0;
      const navigationHeight=groundAt(origin.x,origin.z);
      for (const leg of legs) {
        descent=Math.max(descent,navigationHeight-groundAt(leg.ikTarget.x,leg.ikTarget.z));
        const hip = leg.thigh.getWorldPosition(new THREE.Vector3());
        const horizontal = (hip.x-leg.ikTarget.x)**2+(hip.z-leg.ikTarget.z)**2;
        // A 3 mm reserve keeps the stance knee near-straight (about 10°) without IK snapping.
        const reach = leg.upperLength+leg.lowerLength-0.003;
        const vertical = Math.sqrt(Math.max(0,reach*reach-horizontal));
        // The reach limit yields through a 1 cm soft knee rather than binding
        // at once: the stance leg nearing full extension on a downhill used to
        // take over from the landing forecast with a step in descent rate.
        lower = Math.max(lower,softLimit(hip.y-leg.ikTarget.y-vertical,REACH_KNEE));
        if(leg.swing&&!leg.swing.settling) {
          descent=Math.max(descent,navigationHeight-groundAt(leg.swing.end.x,leg.swing.end.z));
          // Begin transferring body height before the descending foot reaches
          // its extension limit. Forecast the hip and heel at the planned landing.
          const remaining=leg.swing.travel*(1-leg.swing.progress);
          const future=origin.clone().addScaledVector(travelForward,remaining);
          const futureHip=hip.clone().addScaledVector(travelForward,remaining);
          futureHip.y+=groundAt(future.x,future.z)-groundAt(origin.x,origin.z);
          const landing=leg.roll?.landing(leg.swing.end,leg.swing.toRotation,leg.soleScale,speed)
            ??{target:leg.swing.end.clone(),orientation:leg.swing.toRotation};
          landing.target.y=supportHeight(landing.target,leg,landing.orientation);
          const separation=(futureHip.x-landing.target.x)**2+(futureHip.z-landing.target.z)**2;
          const landingLower=futureHip.y-landing.target.y-Math.sqrt(Math.max(0,reach*reach-separation));
          // Spread the transfer over the swing's last three quarters: a 7 cm
          // downhill drop squeezed into the final tenth of a second read as a dive.
          lower=Math.max(lower,landingLower*smooth(clamp((leg.swing.progress-TRANSFER_START)/(.95-TRANSFER_START),0,1)));
        }
      }
      // A leading foot can reach the road while the navigation root is still
      // on the curb. Allow that height difference in addition to normal stance
      // compression, bounded to a 20 cm step so a drop cannot sink the body.
      // Bound the requested lowering before release, preserving a smooth rise
      // after the navigation root has crossed onto the lower surface.
      // The body may still be transferring down from the upper surface. Its
      // temporary height offset must not consume the leg's compression budget.
      lower=Math.min(.18+Math.min(.2,descent)+Math.max(0,heightLag),lower);
      // Leg reach sets a hard ceiling on the body's world height, and the body
      // drops to it at once so no planted foot is left out of reach. Rising
      // back is a motion the body makes, so it eases toward the ceiling as a
      // critically damped return with a speed cap. The state is world height:
      // continuous terrain carries the body with it, an abrupt step is already
      // transferred by heightLag, and a ceiling that merely re-expresses that
      // transfer (the root dropped, the planted foot did not) is not a release.
      // The old exp(-16 t) release let a 9 cm uphill crouch spring back at
      // 1.4 m/s the instant the trailing foot lifted.
      const ceiling = origin.y + heightLag - lower;
      if (reset) { bodyHeight = ceiling; bodyRise = 0; }
      else {
        if (!abruptStep) bodyHeight += heightStep;
        if (ceiling <= bodyHeight) { bodyHeight = ceiling; bodyRise = 0; }
        else {
          bodyRise += (-2*RISE_RESPONSE*bodyRise + RISE_RESPONSE*RISE_RESPONSE*(ceiling-bodyHeight))*delta;
          bodyRise = clamp(bodyRise, 0, RISE_CAP);
          bodyHeight = Math.min(ceiling, bodyHeight + bodyRise*delta);
        }
      }
      pelvisLower = origin.y + heightLag - bodyHeight;
      model.position.y -= pelvisLower/scale;
      root.updateWorldMatrix(true,true);
      for (const leg of legs) {
        const pole = leg.thigh.getWorldPosition(new THREE.Vector3()).addScaledVector(forward, 1);
        leg.error = applyLegIK(leg, leg.ikTarget, pole);
        if(leg.rollPose)leg.roll.applyToes(leg.rollPose.flex);
      }
      lastDistance = distance; lastPosition = origin.clone();
    },
  };
}
