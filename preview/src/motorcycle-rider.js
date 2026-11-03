import * as THREE from 'three';
import { applyLegIK } from './foot-placement.js';
import { createDrivingHands } from './driving-hands.js';
import { VEHICLES } from './vehicle-config.js';

// The rider who drives the rose motorcycle (Val, 2026-10-29: the player, never
// Jev): palms on the grips turning with the bars, the balls of both feet on the
// rider pegs with the knees out around the tank, a cruiser's easy forward lean
// that deepens a little with speed, shoulders turning with the bars and the body
// leaning into a turn, and at a stop the left foot flat on the road beside the
// bike. Everything is solved in the avatar root's frame, the same frame as the
// bicycle rider (bicycle-rider.js): the driver seat sits at the root's origin
// with the hips SEAT_LIFT above it (player-avatar.js, remote-players.js), the
// root facing the bike's front.
const SPEC = VEHICLES.motorcycle, SEAT = SPEC.driverSeat, SEAT_LIFT = .025;
// The rider pegs (road-vehicles.js: the chrome tubes at x −0.36, y 0.32, out to
// z ±0.37); the ball of each foot rests on the tube at ±0.30.
const PEG = [-.36, .32, .30], PEG_RADIUS = .022;
// A cruiser sits nearly upright: a little hinge at the hips and a little curve
// of the spine bring the shoulders toward the grips; speed adds a touch more.
const LEAN = { spine_01: .05, spine_02: .045, spine_03: .035 }, SPEED_LEAN = .018, LIFT = { neck_01: -.10, head: -.12 };
// The shoulders turn with the bars and the torso hinges forward with the lock,
// since the outer grip swings ahead of the rider at full lock; the body leans
// into a turn as speed builds.
const TWIST = .35, REACH = .15, BANK = .045, MAX_BANK = .13;
// The stance foot: flat on the road beside the bike, under a soft knee.
const STANCE = { stop: .3, go: .6, seconds: .3, foot: [-.18, .44], lift: .07 };
const X_AXIS = new THREE.Vector3(1, 0, 0);

const smooth = x => x * x * (3 - 2 * x);

// Bike-frame point to root frame. The root faces the bike's -X; +X is its +Z.
function fromBike([x, y, z], hipHeight, out = new THREE.Vector3()) {
  return out.set(z - SEAT[2], y - SEAT[1] + hipHeight - SEAT_LIFT, SEAT[0] - x);
}

export function createMotorcycleRider({ model, root, feet, arms, seatedShoes, axes, hipHeight }) {
  const hands = createDrivingHands(model, root, arms);
  // An invisible motorcycle frame under the root, so the hands follow the grips
  // and the steering exactly as driving-hands.js does for Jev in the car.
  let frame = null;
  const bikeFrame = () => {
    if (!frame) {
      frame = new THREE.Object3D(); frame.name = 'Motorcycle rider frame';
      fromBike([0, 0, 0], hipHeight, frame.position); frame.rotation.y = Math.PI / 2; root.add(frame);
    }
    return frame;
  };
  // Each shoe at rest in the root frame: the ankle-to-ball offset and the
  // heights of the ball and the ankle above the sole.
  const legs = feet.legs.map(leg => {
    const ball = model.getObjectByName(`ball_${leg.side}`), scale = leg.foot.getWorldScale(new THREE.Vector3()), shoe = seatedShoes.get(leg);
    const ankle = leg.foot.getWorldPosition(new THREE.Vector3());
    const toBall = (ball ? ball.getWorldPosition(new THREE.Vector3()) : ankle.clone()).sub(ankle);
    const sole = Math.min(...leg.sole.map(point => point.clone().multiply(scale).applyQuaternion(shoe).y), 0);
    return { leg, sign: leg.side === 'l' ? 1 : -1, shoe, toBall, ballHeight: toBall.y - sole, ankleHeight: -sole, thigh: leg.thigh.getWorldPosition(new THREE.Vector3()) };
  });
  // The hip drop that lets the stance foot reach the road under a soft knee.
  for (const entry of legs) {
    const { leg, thigh } = entry, foot = fromBike([STANCE.foot[0], 0, entry.sign * STANCE.foot[1]], hipHeight);
    foot.y += entry.ankleHeight;
    entry.drop = Math.max(0, thigh.distanceTo(foot) - .985 * (leg.upperLength + leg.lowerLength));
  }
  const pitch = new THREE.Quaternion(), local = new THREE.Quaternion(), ground = new THREE.Quaternion();
  const point = new THREE.Vector3(), ankle = new THREE.Vector3(), pole = new THREE.Vector3(), adjustment = new THREE.Quaternion();
  let stance = 1, stopped = true, gripping = false, time = 0;
  const down = 'l';

  return {
    // Adds the cruiser lean, the bar twist and the turn bank to the seated spine
    // angles, and drops the body for the stance. Call after the riding block
    // resets model.position and before it applies the seated angles.
    posture(seated, locomotion, dt, reducedMotion) {
      const speed = Math.abs(locomotion.ridingSpeed ?? 0), steering = locomotion.ridingSteering ?? 0;
      if (!stopped && speed < STANCE.stop) stopped = true; else if (stopped && speed > STANCE.go) stopped = false;
      stance += ((stopped ? 1 : 0) - stance) * (1 - Math.exp(-dt / STANCE.seconds));
      time += dt;
      const e = smooth(stance), drop = legs.find(entry => entry.leg.side === down)?.drop ?? 0;
      model.position.y -= drop * e;
      // Speed brings the shoulders forward a little; a turn twists them with the
      // bars and banks the whole spine into it. The idle engine is a faint tremor.
      const motion = Math.min(1, speed / SPEC.maxSpeed), twist = steering * TWIST;
      const bank = reducedMotion ? 0 : THREE.MathUtils.clamp(-steering * speed * BANK, -MAX_BANK, MAX_BANK);
      const tremor = reducedMotion || !stopped ? 0 : Math.sin(time * 21) * .0025;
      const bones = Object.keys(LEAN);
      const reach = Math.abs(steering) / SPEC.steeringLimit * REACH;
      bones.forEach((name, i) => { seated[name] = [LEAN[name] + motion * SPEED_LEAN + reach + (i === 0 ? tremor : 0), twist * (i === 2 ? .5 : .25), bank * (.5 - i * .1)]; });
    },
    // Lifts the head, then places the feet on the pegs (or the stance foot on the
    // road) and the hands on the grips. Call after the seated angles.
    place(locomotion) {
      const e = smooth(stance);
      for (const [name, angle] of Object.entries(LIFT)) {
        const bone = model.getObjectByName(name); if (!bone) continue;
        adjustment.setFromAxisAngle(axes.get(bone).x, angle); bone.quaternion.multiply(adjustment);
      }
      root.updateWorldMatrix(true, true);
      const rotation = root.getWorldQuaternion(new THREE.Quaternion());
      for (const entry of legs) {
        const { leg, sign, shoe } = entry, side = leg.side;
        // The ball of the foot on top of the peg, the shoe pitched a touch toe-down.
        fromBike([PEG[0], PEG[1] + PEG_RADIUS, sign * PEG[2]], hipHeight, point);
        pitch.setFromAxisAngle(X_AXIS, .12); local.copy(pitch).multiply(shoe);
        ankle.set(0, Math.cos(.12), Math.sin(.12)).multiplyScalar(entry.ballHeight).add(point).sub(entry.toBall.clone().applyQuaternion(pitch));
        let lift = 0;
        if (side === down && e > 0) {
          // The stance foot, flat on the road beside the bike, lifted clear of the peg on its way.
          fromBike([STANCE.foot[0], 0, sign * STANCE.foot[1]], hipHeight, point).y += entry.ankleHeight;
          ankle.lerp(point, e); local.slerp(ground.copy(shoe), e); lift = Math.sin(Math.PI * e) * STANCE.lift;
        }
        ankle.y += lift;
        leg.ikOrientation = rotation.clone().multiply(local);
        const thigh = root.worldToLocal(leg.thigh.getWorldPosition(new THREE.Vector3()));
        // Knees out around the tank; the stance knee opens further over its foot.
        pole.set(thigh.x + sign * (.34 + .2 * (side === down ? e : 0)), thigh.y + .15, thigh.z + .9);
        leg.error = applyLegIK(leg, root.localToWorld(ankle.clone()), root.localToWorld(pole));
      }
      bikeFrame().userData.driveSteeringAngle = locomotion.ridingSteering ?? 0;
      hands(frame, SPEC); gripping = true;
    },
    // Opens the hands again after a ride.
    release() {
      if (gripping) { hands.reset(); gripping = false; }
      stance = 1; stopped = true;
    },
    get stance() { return stance; },
    get down() { return down; },
  };
}
