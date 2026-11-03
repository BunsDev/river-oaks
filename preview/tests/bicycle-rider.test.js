import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { AVATAR_PROFILES, loadResidentAvatar } from '../src/avatars.js';
import { createRoadVehicle } from '../src/road-vehicles.js';
import { VEHICLES } from '../src/vehicle-config.js';
import { BICYCLE_CRANK, bicycleCrankAngle, bicyclePedal } from '../src/bicycle-crank.js';

const SPEC = VEHICLES.bicycle, SEAT = SPEC.passengerSeat, TURN = BICYCLE_CRANK.development;

async function withRigs(reducedMotion, run) {
  const load = GLTFLoader.prototype.loadAsync, document = globalThis.document, window = globalThis.window;
  GLTFLoader.prototype.loadAsync = async url => ({ scene: (await loadCharacterRig(url.split('/').at(-1).replace('.glb', ''))).scene });
  globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) };
  globalThis.window = { matchMedia: () => ({ matches: reducedMotion }) };
  try { await run(); } finally { GLTFLoader.prototype.loadAsync = load; globalThis.document = document; globalThis.window = window; }
}

// A remote rider's arrangement (remote-players.js): the bike under a turned holder
// with its saddle at the holder's origin, the avatar root rotated to face its front.
async function rider(profile) {
  const avatar = await loadResidentAvatar(0, `bicycle-${profile}`, profile, { folk: false, faceRecipe: {}, realism: 'off' });
  const holder = new THREE.Group(), bike = createRoadVehicle('bicycle', { pedalling: true });
  holder.rotation.y = .7; holder.position.set(3, 0, -2);
  bike.object.position.set(-SEAT[0], 0, -SEAT[2]); bike.setSaddle(avatar.bicycleSaddle); holder.add(bike.object);
  avatar.object.position.set(0, SEAT[1] - avatar.rig.hipHeight + .025, 0); avatar.object.rotation.y = -Math.PI / 2; holder.add(avatar.object);
  let now = 0, distance = 0;
  const ride = (frames, { speed = 5, steering = 0 } = {}) => {
    for (let i = 0; i < frames; i++) {
      now += 16; distance += speed * .016;
      bike.setCrank(bicycleCrankAngle(distance)); bike.updateSteering(steering);
      avatar.update(now, 'continue', false, { speed: 0, riding: true, ridingKind: 'bicycle', seatToFloor: SEAT[1] - SPEC.passengerFloor, ridingDistance: distance, ridingSpeed: speed, ridingSteering: steering }, () => 0);
    }
    holder.updateWorldMatrix(true, true);
  };
  // Move to a crank angle without pedalling past it: a whole number of turns plus the angle.
  const crankTo = angle => { distance = (Math.ceil(distance / TURN) + angle / (Math.PI * 2)) * TURN; };
  return { avatar, holder, bike, ride, crankTo, dispose: () => { bike.dispose(); avatar.dispose(); } };
}

const world = object => object.getWorldPosition(new THREE.Vector3());
// The ball of each foot, its sole beneath it, and how far its shoe sits from the pedal top.
function pedalContact(avatar, bike, side) {
  const leg = avatar.feet.find(entry => entry.side === side), pedal = bike.pedals[side];
  const local = point => pedal.worldToLocal(point.clone());
  const ball = local(world(avatar.rig.model.getObjectByName(`ball_${side}`)));
  const near = leg.sole.map(point => local(leg.foot.localToWorld(point.clone()))).filter(point => Math.abs(point.x) < .07 && Math.abs(point.z) < .08);
  return { ball, lowest: near.length ? Math.min(...near.map(point => point.y)) : Infinity, error: leg.error };
}
function palm(avatar, side) {
  return world(avatar.rig.model.getObjectByName(`middle_01_${side}`)).lerp(world(avatar.rig.model.getObjectByName(`hand_${side}`)), .28);
}
function grip(bike, index) {
  const pivot = new THREE.Vector3(...SPEC.steeringPivot);
  return bike.steering.localToWorld(new THREE.Vector3(...SPEC.grips[index]).sub(pivot));
}
const kneeBend = leg => {
  const hip = world(leg.thigh), knee = world(leg.calf), ankle = world(leg.foot);
  return 180 - hip.sub(knee).angleTo(ankle.sub(knee)) * 180 / Math.PI;
};

test('every rig pedals: the ball of each foot stays on its turning pedal and the palms on the grips', async () => {
  await withRigs(false, async () => {
    for (const profile of [...AVATAR_PROFILES, 'jevica']) {
      const { avatar, bike, ride, crankTo, dispose } = await rider(profile);
      try {
        ride(120);
        let bottom = null, top = null;
        for (let step = 0; step < 12; step++) {
          const angle = step / 12 * Math.PI * 2;
          crankTo(angle); ride(1);
          for (const side of ['l', 'r']) {
            const contact = pedalContact(avatar, bike, side), label = `${profile} ${side} at ${(angle * 180 / Math.PI).toFixed(0)}°`;
            assert.ok(contact.error < .015, `${label}: the foot reaches its pedal (${contact.error.toFixed(3)} m short)`);
            assert.ok(Math.hypot(contact.ball.x, contact.ball.z) < .03, `${label}: the ball of the foot is over the spindle (${contact.ball.x.toFixed(3)}, ${contact.ball.z.toFixed(3)})`);
            assert.ok(Math.abs(contact.lowest - .01) < .015, `${label}: the sole is on the pedal top (${contact.lowest.toFixed(3)} m)`);
          }
          const right = avatar.feet.find(leg => leg.side === 'r');
          if (step === 9) bottom = kneeBend(right); // the right crank points down at 270°
          if (step === 3) top = kneeBend(right);
          for (const [index, side] of [[0, 'r'], [1, 'l']]) assert.ok(palm(avatar, side).distanceTo(grip(bike, index)) < .02, `${profile} ${side}: the palm holds its grip (${palm(avatar, side).distanceTo(grip(bike, index)).toFixed(3)} m)`);
        }
        assert.ok(bottom > 20 && bottom < 42, `${profile}: a soft knee at the bottom of the stroke (${bottom.toFixed(0)}°, saddle +${(avatar.bicycleSaddle * 100).toFixed(1)} cm)`);
        assert.ok(top > bottom + 40, `${profile}: the knee folds over the top (${top.toFixed(0)}° against ${bottom.toFixed(0)}°)`);
        for (const steering of [SPEC.steeringLimit, -SPEC.steeringLimit, .3]) {
          ride(30, { steering });
          for (const [index, side] of [[0, 'r'], [1, 'l']]) assert.ok(palm(avatar, side).distanceTo(grip(bike, index)) < .02, `${profile} ${side}: the palm follows the bars turned to ${steering}`);
        }
      } finally { dispose(); }
    }
  });
});

test('at a stop the rider comes off the saddle onto the lower pedal side, and rides off again', async () => {
  await withRigs(false, async () => {
    for (const profile of ['woman-casual', 'man-tailored', 'jevica']) {
      const { avatar, bike, ride, crankTo, dispose } = await rider(profile);
      try {
        ride(120);
        crankTo(Math.PI * 1.6); ride(1); // the right pedal is low
        ride(90, { speed: 0 });
        const down = avatar.feet.find(leg => leg.side === 'r'), up = avatar.feet.find(leg => leg.side === 'l');
        const sole = Math.min(...down.sole.map(point => down.foot.localToWorld(point.clone()).y));
        assert.ok(Math.abs(sole) < .015, `${profile}: the right shoe stands on the ground (${sole.toFixed(3)} m)`);
        assert.ok(down.error < .015, `${profile}: the stance leg reaches the ground`);
        const contact = pedalContact(avatar, bike, 'l');
        assert.ok(contact.error < .015 && Math.abs(contact.lowest - .01) < .015, `${profile}: the other foot waits on its pedal`);
        for (const leg of avatar.feet) {
          const hip = bike.object.worldToLocal(world(leg.thigh));
          assert.ok(hip.x < -.015 - .08, `${profile}: the hips are clear of the saddle nose (${hip.x.toFixed(3)})`);
        }
        for (const [index, side] of [[0, 'r'], [1, 'l']]) assert.ok(palm(avatar, side).distanceTo(grip(bike, index)) < .025, `${profile} ${side}: the hands stay on the bars`);
        ride(90);
        const back = pedalContact(avatar, bike, 'r');
        assert.ok(back.error < .015 && Math.abs(back.lowest - .01) < .015, `${profile}: riding off puts the foot back on its pedal`);
        assert.ok(bike.object.worldToLocal(world(down.thigh)).x > 0, `${profile}: and the rider back on the saddle`);
      } finally { dispose(); }
    }
  });
});

test('reduced motion still pedals with the bike, and the hands open after the ride', async () => {
  await withRigs(true, async () => {
    const { avatar, bike, ride, crankTo, dispose } = await rider('woman-daywear');
    try {
      const finger = avatar.rig.model.getObjectByName('index_02_l'), rest = finger.quaternion.clone();
      ride(120); crankTo(1); ride(1);
      for (const side of ['l', 'r']) assert.ok(Math.abs(pedalContact(avatar, bike, side).lowest - .01) < .015, `${side}: the foot follows the pedal`);
      assert.ok(finger.quaternion.angleTo(rest) > .3, 'the fingers close on the grip');
      avatar.update(1e6, 'continue', false, { speed: 0 }, () => 0);
      assert.ok(finger.quaternion.angleTo(rest) < 1e-6, 'the fingers open when the ride ends');
    } finally { dispose(); }
  });
});

test('a ridden bicycle turns its crank; a parked one keeps it in the frame batch', () => {
  const ridden = createRoadVehicle('bicycle', { pedalling: true }), parked = createRoadVehicle('bicycle');
  try {
    const meshes = model => { let count = 0; model.object.traverse(node => { count += node.isMesh ? 1 : 0; }); return count; };
    assert.equal(meshes(parked), 11, 'parked bikes keep their draw count');
    for (const angle of [0, 1, 2.5, 4]) {
      ridden.setCrank(angle); ridden.object.updateMatrixWorld(true);
      for (const side of ['l', 'r']) assert.ok(ridden.pedals[side].position.distanceTo(new THREE.Vector3(...bicyclePedal(side, angle))) < 1e-9, `the ${side} pedal turns to ${angle}`);
    }
    assert.deepEqual(Object.keys(parked.pedals), [], 'a parked bike has no free pedals');
    parked.setCrank(2);
    assert.equal(meshes(parked), 11);
  } finally { ridden.dispose(); parked.dispose(); }
});
