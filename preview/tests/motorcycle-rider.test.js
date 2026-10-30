import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { loadResidentAvatar } from '../src/avatars.js';
import { createRoadVehicle } from '../src/road-vehicles.js';
import { VEHICLES } from '../src/vehicle-config.js';

// Val, 2026-10-29: the player drives the rose motorcycle, not Jev, with realistic
// riding. The rider sits in the driver seat (remote-players.js rideSeat, parked-carriage.js
// seat()) and motorcycle-rider.js puts the feet on the pegs, the hands on the grips
// that turn with the bars, and the left foot on the road at a stop.
const SPEC = VEHICLES.motorcycle, SEAT = SPEC.driverSeat, PEG = [-.36, .32, .30], PEG_RADIUS = .022;

async function withRigs(reducedMotion, run) {
  const load = GLTFLoader.prototype.loadAsync, document = globalThis.document, window = globalThis.window;
  GLTFLoader.prototype.loadAsync = async url => ({ scene: (await loadCharacterRig(url.split('/').at(-1).replace('.glb', ''))).scene });
  globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) };
  globalThis.window = { matchMedia: () => ({ matches: reducedMotion }) };
  try { await run(); } finally { GLTFLoader.prototype.loadAsync = load; globalThis.document = document; globalThis.window = window; }
}

// A rider's arrangement (remote-players.js): the bike under a turned holder with its
// driver seat at the holder's origin, the avatar root rotated to face the bike's front.
async function rider(profile, { driver = true } = {}) {
  const avatar = await loadResidentAvatar(0, `motorcycle-${profile}`, profile, { folk: false, faceRecipe: {}, realism: 'off' });
  const holder = new THREE.Group(), bike = createRoadVehicle('motorcycle', { pedalling: true });
  const seat = driver ? SEAT : SPEC.passengerSeat;
  holder.rotation.y = .7; holder.position.set(3, 0, -2);
  bike.object.position.set(-seat[0], 0, -seat[2]); holder.add(bike.object);
  avatar.object.position.set(0, seat[1] - avatar.rig.hipHeight + .025, 0); avatar.object.rotation.y = -Math.PI / 2; holder.add(avatar.object);
  let now = 0;
  const ride = (frames, { speed = 4, steering = 0 } = {}) => {
    for (let i = 0; i < frames; i++) {
      now += 16; bike.updateSteering(steering);
      avatar.update(now, 'continue', false, { speed: 0, riding: true, ridingKind: 'motorcycle', ridingDriver: driver, seatToFloor: seat[1] - (driver ? SPEC.driverFloor : SPEC.passengerFloor), ridingDistance: now * speed / 1000, ridingSpeed: speed, ridingSteering: steering }, () => 0);
    }
    holder.updateWorldMatrix(true, true);
  };
  return { avatar, holder, bike, ride, dispose: () => { bike.dispose(); avatar.dispose(); } };
}

const world = object => object.getWorldPosition(new THREE.Vector3());
// The ball of a foot in the bike's frame, and the lowest sole point near it.
function pegContact(avatar, bike, side) {
  const leg = avatar.feet.find(entry => entry.side === side);
  const local = point => bike.object.worldToLocal(point.clone());
  const ball = local(world(avatar.rig.model.getObjectByName(`ball_${side}`)));
  const sole = Math.min(...leg.sole.map(point => local(leg.foot.localToWorld(point.clone())).y));
  return { ball, sole, error: leg.error };
}
function palm(avatar, side) {
  return world(avatar.rig.model.getObjectByName(`middle_01_${side}`)).lerp(world(avatar.rig.model.getObjectByName(`hand_${side}`)), .28);
}
function grip(bike, index) {
  const pivot = new THREE.Vector3(-.75, 1.08, 0);
  return bike.steering.localToWorld(new THREE.Vector3(...SPEC.grips[index]).sub(pivot));
}
const groundSole = leg => Math.min(...leg.sole.map(point => leg.foot.localToWorld(point.clone()).y));

test('every body drives the motorcycle: feet on the pegs, palms on the grips as the bars turn, leaning with speed', async () => {
  await withRigs(false, async () => {
    for (const profile of ['woman-daywear', 'woman-casual', 'man-tailored', 'man-casual', 'jevica']) {
      const { avatar, bike, ride, dispose } = await rider(profile);
      try {
        ride(120);
        const sign = { l: 1, r: -1 };
        for (const side of ['l', 'r']) {
          const contact = pegContact(avatar, bike, side), label = `${profile} ${side}`;
          assert.ok(contact.error < .015, `${label}: the foot reaches its peg (${contact.error.toFixed(3)} m short)`);
          assert.ok(Math.abs(contact.ball.x - PEG[0]) < .03 && Math.abs(contact.ball.z - sign[side] * PEG[2]) < .03, `${label}: the ball of the foot is over the peg (${contact.ball.x.toFixed(3)}, ${contact.ball.z.toFixed(3)})`);
          assert.ok(Math.abs(contact.sole - (PEG[1] + PEG_RADIUS)) < .02, `${label}: the sole rests on the peg top (${contact.sole.toFixed(3)} m)`);
        }
        const spine = avatar.rig.model.getObjectByName('spine_01'), upright = new THREE.Quaternion();
        for (const [index, side] of [[0, 'r'], [1, 'l']]) assert.ok(palm(avatar, side).distanceTo(grip(bike, index)) < .02, `${profile} ${side}: the palm holds its grip (${palm(avatar, side).distanceTo(grip(bike, index)).toFixed(3)} m)`);
        for (const steering of [SPEC.steeringLimit, -SPEC.steeringLimit, .3]) {
          ride(30, { steering });
          for (const [index, side] of [[0, 'r'], [1, 'l']]) assert.ok(palm(avatar, side).distanceTo(grip(bike, index)) < .02, `${profile} ${side}: the palm follows the bars turned to ${steering}`);
          for (const side of ['l', 'r']) assert.ok(pegContact(avatar, bike, side).error < .015, `${profile} ${side}: the foot stays on its peg through a turn`);
        }
        // Speed deepens the forward lean a little; a turn banks the body into it.
        ride(30, { speed: 1 }); const slow = spine.quaternion.clone();
        ride(30, { speed: SPEC.maxSpeed }); const fast = spine.quaternion.clone();
        assert.ok(fast.angleTo(upright) > slow.angleTo(upright), `${profile}: the rider leans further forward at speed`);
        ride(30, { speed: SPEC.maxSpeed, steering: .4 }); const banked = spine.quaternion.clone();
        assert.ok(banked.angleTo(fast) > .01, `${profile}: the body banks into a turn`);
      } finally { dispose(); }
    }
  });
});

test('at a stop the left foot goes flat to the road beside the bike and comes back to its peg riding off', async () => {
  await withRigs(false, async () => {
    for (const profile of ['woman-casual', 'man-tailored', 'jevica']) {
      const { avatar, bike, ride, dispose } = await rider(profile);
      try {
        ride(120); ride(90, { speed: 0 });
        const down = avatar.feet.find(leg => leg.side === 'l');
        const sole = groundSole(down);
        assert.ok(Math.abs(sole) < .015, `${profile}: the left shoe stands on the road (${sole.toFixed(3)} m)`);
        assert.ok(down.error < .015, `${profile}: the stance leg reaches the road`);
        const other = pegContact(avatar, bike, 'r');
        assert.ok(other.error < .015 && Math.abs(other.sole - (PEG[1] + PEG_RADIUS)) < .02, `${profile}: the right foot waits on its peg`);
        for (const [index, side] of [[0, 'r'], [1, 'l']]) assert.ok(palm(avatar, side).distanceTo(grip(bike, index)) < .025, `${profile} ${side}: the hands stay on the grips`);
        ride(90);
        const back = pegContact(avatar, bike, 'l');
        assert.ok(back.error < .015 && Math.abs(back.sole - (PEG[1] + PEG_RADIUS)) < .02, `${profile}: riding off puts the left foot back on its peg`);
      } finally { dispose(); }
    }
  });
});

test('reduced motion still rides with the hands on the grips, and they open after the ride; a pillion passenger keeps the seated pose', async () => {
  await withRigs(true, async () => {
    const { avatar, bike, ride, dispose } = await rider('woman-daywear');
    try {
      const finger = avatar.rig.model.getObjectByName('index_02_l'), rest = finger.quaternion.clone();
      ride(60);
      for (const [index, side] of [[0, 'r'], [1, 'l']]) assert.ok(palm(avatar, side).distanceTo(grip(bike, index)) < .02, `${side}: the palm holds its grip`);
      assert.ok(finger.quaternion.angleTo(rest) > .3, 'the fingers close on the grip');
      avatar.update(1e6, 'continue', false, { speed: 0 }, () => 0);
      assert.ok(finger.quaternion.angleTo(rest) < 1e-6, 'the fingers open when the ride ends');
    } finally { dispose(); }
    const passenger = await rider('woman-daywear', { driver: false });
    try {
      const finger = passenger.avatar.rig.model.getObjectByName('index_02_l'), rest = finger.quaternion.clone();
      passenger.ride(60);
      assert.ok(finger.quaternion.angleTo(rest) < 1e-6, 'a passenger does not reach for the grips');
      assert.ok(palm(passenger.avatar, 'l').distanceTo(grip(passenger.bike, 1)) > .1, 'a passenger sits back from the bars');
    } finally { passenger.dispose(); }
  });
});
