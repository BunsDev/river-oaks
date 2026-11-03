import * as THREE from 'three';
import { applyLegIK } from './foot-placement.js';
import { createDrivingHands } from './driving-hands.js';
import { VEHICLES } from './vehicle-config.js';
import { BICYCLE_SEATPOST, bicycleCrankAngle, bicyclePedal, bicyclePedalPitch } from './bicycle-crank.js';

// A rider on the plaza bicycle: the ball of each foot on its pedal, the palms on
// the grips, a city-bike lean, and at a stop one foot down. Everything is solved in
// the avatar root's frame. Both the player and remote riders put the saddle at the
// root's origin with the hips SEAT_LIFT above it (player-avatar.js,
// remote-players.js), facing the bike's front. Each rider raises the saddle on its
// seat post until the knee keeps KNEE of bend at the bottom of the stroke; the
// spec saddle (0.92 m) left every rig's knee bent 53–79° there.
const SPEC = VEHICLES.bicycle, SEAT = SPEC.passengerSeat, SEAT_LIFT = .025, PEDAL_TOP = .01, KNEE = 30 * Math.PI / 180;
// The seat post's axis in the root frame.
const POST = new THREE.Vector3(0, BICYCLE_SEATPOST.axis[1], -BICYCLE_SEATPOST.axis[0]), X_AXIS = new THREE.Vector3(1, 0, 0);
// A forward lean brings the hands to the grips (0.64–0.66 m from an upright
// shoulder, against 0.46–0.52 m of arm): half a hinge at the hips, the pelvis
// rolling forward on the saddle, and half a curve of the spine. Each rig's lean is
// scaled at load so its elbows rest at ELBOW, leaving reach for the outer hand in
// a turn, when the shoulders also turn with the bars (TWIST of the bars' angle).
// The neck and head lift so the eyes stay on the road.
const LEAN = { spine_01: .07, spine_02: .07, spine_03: .06 }, HINGE = .2, LIFT = { neck_01: -.12, head: -.16 };
const ELBOW = 55 * Math.PI / 180, TWIST = .8, BARS = .6;
// No rig reaches the ground from the saddle (0.945 m or more below the hips). At a stop the
// rider comes forward off the saddle, clear of its nose, onto the foot on the
// lower pedal's side, standing beside the bottom bracket.
const STANCE = { forward: .25, stop: .3, go: .6, seconds: .3, foot: [-.08, .26], knee: .96 };

const smooth = x => x * x * (3 - 2 * x);
const bent = (upper, lower, angle) => Math.sqrt(upper ** 2 + lower ** 2 + 2 * upper * lower * Math.cos(angle));

// Bike-frame point to root frame. The root faces the bike's -X; +X is its +Z.
function fromBike([x, y, z], hipHeight, out = new THREE.Vector3()) {
  return out.set(z - SEAT[2], y - SEAT[1] + hipHeight - SEAT_LIFT, SEAT[0] - x);
}

// Leans the body by `scale` at the saddle height `saddle`: the spine bones from
// their rest, and the model hinged forward about the hips (both in the root frame).
function leanBody({ model, axes, spine, rest, base, hips }, scale, saddle, stance = 0, hinge = new THREE.Quaternion()) {
  const turn = new THREE.Quaternion(), lean = 1 - .3 * stance;
  spine.forEach((bone, i) => bone.quaternion.copy(rest[i]).multiply(turn.setFromAxisAngle(axes.get(bone).x, LEAN[bone.name] * scale * lean)));
  hinge.setFromAxisAngle(X_AXIS, HINGE * scale * lean);
  model.quaternion.copy(base.quaternion).premultiply(hinge);
  model.position.copy(base.position).sub(hips).applyQuaternion(hinge).add(hips).addScaledVector(POST, saddle);
}

// The lean scale that rests both elbows at ELBOW on the straight bars, found at load
// while the body is at rest. Leaning brings the shoulders toward the grips.
function fitLean(body, { root, arms, hipHeight }, saddle) {
  if (!body.spine.length || arms.length !== 2) return 1;
  const reach = arms.map(arm => bent(arm.upperLength, arm.lowerLength, ELBOW));
  // The palm frame on handlebars is the root's own orientation (driving-hands.js).
  const wrists = arms.map(arm => fromBike(SPEC.grips[arm.side === 'l' ? 1 : 0], hipHeight).sub(arm.palmOffset.clone().applyQuaternion(arm.frameToHand)));
  const gap = scale => {
    leanBody(body, scale, saddle); root.updateWorldMatrix(true, true);
    return arms.reduce((sum, arm, i) => sum + root.worldToLocal(arm.thigh.getWorldPosition(new THREE.Vector3())).distanceTo(wrists[i]) - reach[i], 0);
  };
  let low = .3, high = 2.4;
  for (let step = 0; step < 16; step++) { const middle = (low + high) / 2; if (gap(middle) > 0) low = middle; else high = middle; }
  body.spine.forEach((bone, i) => bone.quaternion.copy(body.rest[i]));
  body.model.position.copy(body.base.position); body.model.quaternion.copy(body.base.quaternion); root.updateWorldMatrix(true, true);
  return (low + high) / 2;
}

export function createBicycleRider({ model, root, feet, arms, seatedShoes, axes, hipHeight }) {
  const hands = createDrivingHands(model, root, arms);
  // An invisible bicycle frame under the root, so the hands follow the grips and
  // the steering exactly as driving-hands.js does for the carriage driver.
  let frame = null;
  const bikeFrame = () => {
    if (!frame) {
      frame = new THREE.Object3D(); frame.name = 'Bicycle rider frame';
      fromBike([0, 0, 0], hipHeight, frame.position); frame.rotation.y = Math.PI / 2; root.add(frame);
    }
    return frame;
  };
  // Each shoe at rest in the root frame (the root is unmoved while loading): the
  // ankle-to-ball offset and the heights of the ball and the ankle above the sole.
  const legs = feet.legs.map(leg => {
    const ball = model.getObjectByName(`ball_${leg.side}`), scale = leg.foot.getWorldScale(new THREE.Vector3()), shoe = seatedShoes.get(leg);
    const ankle = leg.foot.getWorldPosition(new THREE.Vector3());
    const toBall = (ball ? ball.getWorldPosition(new THREE.Vector3()) : ankle.clone()).sub(ankle);
    const sole = Math.min(...leg.sole.map(point => point.clone().multiply(scale).applyQuaternion(shoe).y), 0);
    return { leg, sign: leg.side === 'l' ? 1 : -1, shoe, toBall, ballHeight: toBall.y - sole, ankleHeight: -sole, thigh: leg.thigh.getWorldPosition(new THREE.Vector3()) };
  });
  const pitch = new THREE.Quaternion(), local = new THREE.Quaternion(), ground = new THREE.Quaternion();
  const pedal = [0, 0, 0], point = new THREE.Vector3(), ankle = new THREE.Vector3(), pole = new THREE.Vector3(), adjustment = new THREE.Quaternion();
  // The ankle (root frame) that puts the ball of the foot on its pedal's top, with
  // the shoe pitched with the pedal; leaves the shoe's orientation in `local`.
  const pedalAnkle = (entry, angle, out) => {
    const side = entry.leg.side, toe = bicyclePedalPitch(side, angle);
    fromBike(bicyclePedal(side, angle, pedal), hipHeight, point);
    pitch.setFromAxisAngle(X_AXIS, toe); local.copy(pitch).multiply(entry.shoe);
    return out.set(0, Math.cos(toe), Math.sin(toe)).multiplyScalar(PEDAL_TOP + entry.ballHeight).add(point).sub(entry.toBall.clone().applyQuaternion(pitch));
  };
  // The seat post lift that leaves the knee KNEE bent with the pedal at the bottom.
  const saddle = legs.reduce((sum, entry) => {
    const { leg } = entry, bottom = pedalAnkle(entry, leg.side === 'l' ? Math.PI / 2 : Math.PI * 1.5, new THREE.Vector3());
    const goal = bent(leg.upperLength, leg.lowerLength, KNEE), reach = lift => entry.thigh.clone().addScaledVector(POST, lift).distanceTo(bottom) - goal;
    let low = 0, high = BICYCLE_SEATPOST.reach;
    if (reach(low) >= 0) return sum;
    if (reach(high) <= 0) return sum + high;
    for (let step = 0; step < 16; step++) { const middle = (low + high) / 2; if (reach(middle) < 0) low = middle; else high = middle; }
    return sum + (low + high) / 2;
  }, 0) / legs.length;
  // The standing hip height over the stance foot: a soft knee, reaching across to
  // it from the raised saddle, plus the ankle's height above the sole.
  for (const entry of legs) {
    const { leg, thigh } = entry, hips = thigh.clone().addScaledVector(POST, saddle);
    const across = Math.hypot(STANCE.foot[1] - Math.abs(hips.x), SEAT[0] - STANCE.foot[0] - STANCE.forward - hips.z);
    const standing = Math.sqrt(Math.max(0, (STANCE.knee * (leg.upperLength + leg.lowerLength)) ** 2 - across ** 2)) + entry.ankleHeight;
    entry.drop = Math.max(0, hips.y - fromBike([0, 0, 0], hipHeight).y - standing);
  }
  // The body as loaded, and its hips (the hinge), in the root frame.
  const spine = Object.keys(LEAN).map(name => model.getObjectByName(name)).filter(Boolean);
  const body = { model, axes, spine, rest: spine.map(bone => bone.quaternion.clone()), base: { position: model.position.clone(), quaternion: model.quaternion.clone() },
    hips: legs.reduce((sum, entry) => sum.add(entry.thigh), new THREE.Vector3()).divideScalar(legs.length) };
  const scale = fitLean(body, { root, arms, hipHeight }, saddle);
  let hinged = false;
  let stance = 1, stopped = true, down = 'l', crank = 0, gripping = false;

  return {
    // Adds the lean to the seated spine angles and moves the body for the stance.
    // Call after the riding block resets model.position and before it applies the
    // seated angles.
    posture(seated, locomotion, dt, reducedMotion) {
      crank = bicycleCrankAngle(locomotion.ridingDistance);
      const speed = Math.abs(locomotion.ridingSpeed ?? 0);
      if (!stopped && speed < STANCE.stop) {
        stopped = true;
        // The foot on the lower pedal comes down; the other stays ready on its pedal.
        down = bicyclePedal('l', crank)[1] <= bicyclePedal('r', crank)[1] ? 'l' : 'r';
      } else if (stopped && speed > STANCE.go) stopped = false;
      stance += ((stopped ? 1 : 0) - stance) * (1 - Math.exp(-dt / STANCE.seconds));
      const e = smooth(stance), drop = legs.find(entry => entry.leg.side === down)?.drop ?? 0;
      // The hip hinge and the saddle height; avatars.js has just reset model.position.
      body.base.position.copy(model.position); leanBody(body, scale, saddle, e); hinged = true;
      model.position.z += STANCE.forward * e; model.position.y -= drop * e;
      const steering = locomotion.ridingSteering ?? 0, turn = THREE.MathUtils.clamp(steering * .12, -.06, .06), twist = steering * BARS * TWIST / 3;
      const rock = reducedMotion ? 0 : Math.sin(crank) * .012 * (1 - e);
      for (const [name, angle] of Object.entries(LEAN)) seated[name] = [angle * scale * (1 - .3 * e), twist, name === 'spine_01' ? rock - turn * .4 : -turn * .3];
    },
    // Lifts the head, then places the feet and hands. Call after the seated angles.
    place(locomotion) {
      const e = smooth(stance);
      for (const [name, angle] of Object.entries(LIFT)) {
        const bone = model.getObjectByName(name); if (!bone) continue;
        adjustment.setFromAxisAngle(axes.get(bone).x, angle * (1 - .3 * e)); bone.quaternion.multiply(adjustment);
      }
      root.updateWorldMatrix(true, true);
      const rotation = root.getWorldQuaternion(new THREE.Quaternion());
      for (const entry of legs) {
        const { leg, sign, shoe } = entry, side = leg.side;
        pedalAnkle(entry, crank, ankle);
        let lift = 0;
        if (side === down && e > 0) {
          // The stance foot, flat beside the bike, lifted clear of the pedal on its way.
          fromBike([STANCE.foot[0], 0, sign * STANCE.foot[1]], hipHeight, point).y += entry.ankleHeight;
          ankle.lerp(point, e); local.slerp(ground.copy(shoe), e); lift = Math.sin(Math.PI * e) * .08;
        }
        ankle.y += lift;
        leg.ikOrientation = rotation.clone().multiply(local);
        const thigh = root.worldToLocal(leg.thigh.getWorldPosition(new THREE.Vector3()));
        pole.set(thigh.x + sign * (side === down ? .08 + .27 * e : .08), thigh.y + .3, thigh.z + 1);
        leg.error = applyLegIK(leg, root.localToWorld(ankle.clone()), root.localToWorld(pole));
      }
      bikeFrame().userData.driveSteeringAngle = locomotion.ridingSteering ?? 0;
      hands(frame, SPEC); gripping = true;
    },
    // Opens the hands again after a ride.
    release() {
      if (gripping) { hands.reset(); gripping = false; }
      if (hinged) { model.quaternion.copy(body.base.quaternion); hinged = false; }
      stance = 1; stopped = true;
    },
    get stance() { return stance; },
    get down() { return down; },
    get crank() { return crank; },
    get lean() { return scale; },
    // How far this rider raises the saddle (BICYCLE_SEATPOST); the bike shows it.
    get saddle() { return saddle; },
  };
}
