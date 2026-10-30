import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFootPlacement } from '../src/foot-placement.js';
import { instantiateAvatar, loadResidentAvatar } from '../src/avatars.js';
import { OFFICE_LAYOUT_PENTHOUSE, officeElevationAt, officeLayout } from '../src/office-layouts.js';
import { WALK_SPEED } from '../src/walking.js';
import { loadCharacterRig } from './helpers/character-rig.js';

// #637 follow-up: stairs, seated transitions and vertical motion on the shipped
// rigs. Each threshold separates a measurement on main 163c204a from this fix;
// the measurements are in the plan
// (docs/superpowers/plans/2026-10-30-locomotion-qualify-637.md).
const RIGS = ['jevica', 'man-tailored'];

// The avatar loop (avatars.js update): restore the authored pose, then place the feet.
function walker(source) {
  const avatar = instantiateAvatar(source, { targetHeight: 1.7 }), body = new THREE.Group();
  body.add(avatar.model); body.updateMatrixWorld(true);
  const baseY = avatar.model.position.y, placement = createFootPlacement(avatar.model, body);
  const hip = () => placement.legs[0].thigh.getWorldPosition(new THREE.Vector3()).y - body.position.y, standing = hip();
  return {
    avatar, body, placement,
    hipDrop: () => standing - hip(),
    frame(delta, locomotion, groundAt) {
      avatar.model.position.y = baseY;
      for (const [bone, rest] of avatar.rest) bone.quaternion.copy(rest);
      placement.update(delta, locomotion, groundAt);
    },
  };
}

// Accelerate at the walk's response (walking.js WALK_RESPONSE), hold, then stop.
function drive(rig, { speed: top, hz, seconds, stop = 1, groundAt = () => 0, from = 0, heading = 0 }, observe) {
  let speed = 0, distance = 0;
  const forward = [Math.sin(heading), Math.cos(heading)];
  rig.body.rotation.y = heading;
  for (let frame = 0; frame < (seconds + stop) * hz; frame++) {
    const time = frame / hz, wanted = time < seconds ? top : 0;
    speed += (wanted - speed) * (1 - Math.exp(-16 / hz)); if (!wanted && speed < .01) speed = 0;
    distance += speed / hz;
    const x = forward[0] * distance, z = from + forward[1] * distance;
    rig.body.position.set(x, groundAt(x, z), z); rig.body.updateMatrixWorld(true);
    const before = rig.placement.legs.map(leg => ({ contact: leg.contact, target: leg.target?.clone() }));
    rig.frame(1 / hz, { speed, distance, heading }, groundAt);
    observe({ time, speed, distance, before, holding: time > 1.5 && time < seconds });
  }
}

test('the office stair: walking, fast walking and sprinting up and down keep the feet reached and the body over them', async () => {
  const layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE), { stair } = layout;
  // The penthouse stair rises along its nosing line, the walkable stair's real ground.
  const groundAt = (x, z) => officeElevationAt(layout, 'jevica-office/l0', [11.8, z]);
  const length = stair.d[1] - stair.d[0] + 1.5;
  for (const profile of RIGS) {
    const source = await loadCharacterRig(profile);
    for (const speed of [WALK_SPEED.normal, WALK_SPEED.fast, WALK_SPEED.jevicaFast]) for (const up of [true, false]) {
      const rig = walker(source);
      let drop = 0, reach = 0;
      drive(rig, { speed, hz: 60, seconds: length / speed, stop: 0, groundAt, from: up ? stair.d[0] - .8 : stair.d[1] + .4, heading: up ? 0 : Math.PI }, () => {
        drop = Math.max(drop, rig.hipDrop());
        for (const leg of rig.placement.legs) if (leg.contact) reach = Math.max(reach, leg.error);
      });
      rig.avatar.dispose();
      // Main sank the body 2.5 m into the stair running up it at 3.2 m/s (3.2 m at
      // 6.4) with a planted foot 0.9 m out of reach: each frame's rise counted as a
      // curb whose transfer the 0.5 m/s release cap could not keep up with.
      const label = `${profile} ${speed} m/s ${up ? 'up' : 'down'}: pelvis ${drop.toFixed(2)} m below standing, planted foot ${reach.toFixed(3)} m out of reach`;
      assert.ok(drop < .45 && reach < .02, label);
    }
  }
});

test('a stepped stair taken at walking and fast-walking speeds keeps every planted foot on its tread', async () => {
  // Riser-by-riser ground (a stepped fixture with the office stair's 22 risers).
  const tread = 8.4 / 22, riser = 3.8 / 22, groundAt = (x, z) => z < 0 ? 0 : z >= 22 * tread ? 3.8 : Math.floor(z / tread + 1) * riser;
  for (const profile of RIGS) {
    const source = await loadCharacterRig(profile);
    for (const speed of [WALK_SPEED.normal, 2.4, WALK_SPEED.fast]) {
      const rig = walker(source);
      let drop = 0, reach = 0;
      drive(rig, { speed, hz: 60, seconds: (22 * tread + 2) / speed, stop: 0, groundAt, from: -1 }, () => {
        drop = Math.max(drop, rig.hipDrop());
        for (const leg of rig.placement.legs) if (leg.contact) reach = Math.max(reach, leg.error);
      });
      rig.avatar.dispose();
      // Main: the body fell 1.4 m behind at 1.65 m/s (2.6 m at 3.2) and a planted
      // foot 0.6-1.0 m out of reach at 2.4-3.2. Now the body trails its reach
      // ceiling by at most 0.2 m (foot-placement.js RISE_DEFICIT): 0.38-0.44 m here.
      assert.ok(drop < .45 && reach < .01, `${profile} ${speed} m/s: pelvis ${drop.toFixed(2)} m below standing, planted foot ${reach.toFixed(3)} m out of reach`);
    }
  }
});

test('stepping up a single curb still rises at the capped release, as on main', async () => {
  for (const profile of RIGS) {
    const source = await loadCharacterRig(profile);
    for (const height of [.15, .2]) for (const [speed, hz] of [[WALK_SPEED.normal, 60], [WALK_SPEED.fast, 60], [WALK_SPEED.jevicaFast, 30]]) {
      const rig = walker(source), groundAt = (x, z) => z > 1.5 ? height : 0;
      let rise = 0, last = null;
      drive(rig, { speed, hz, seconds: 3.5 / speed, groundAt }, ({ time }) => {
        const hip = rig.placement.legs[0].thigh.getWorldPosition(new THREE.Vector3()).y;
        if (last !== null && time > .1) rise = Math.max(rise, (hip - last) * hz);
        last = hip;
      });
      rig.avatar.dispose();
      // Carrying every abrupt rise with the body (a first version of the stair fix)
      // sprang the hip up a curb at 1.2-1.9 m/s; the release is capped at 0.5.
      assert.ok(rise < .55, `${profile} ${height} m curb at ${speed} m/s, ${hz} Hz: hip rose at ${rise.toFixed(2)} m/s`);
    }
  }
});

async function withRigs(run) {
  const load = GLTFLoader.prototype.loadAsync, document = globalThis.document, window = globalThis.window;
  GLTFLoader.prototype.loadAsync = async url => ({ scene: (await loadCharacterRig(url.split('/').at(-1).replace('.glb', ''))).scene });
  globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  try { await run(); } finally { GLTFLoader.prototype.loadAsync = load; globalThis.document = document; globalThis.window = window; }
}

test('standing from a seat or landing a short flight stands the feet under the body at once', async () => {
  await withRigs(async () => {
    for (const profile of RIGS) for (const away of ['seat', 'flight']) for (const offset of [.4, .6, .9]) {
      const avatar = await loadResidentAvatar(0, `qualify-${profile}`, profile, { folk: false, faceRecipe: {}, realism: 'off' });
      const root = avatar.object, ground = () => 0;
      let now = 0, distance = 0;
      const frame = locomotion => { now += 1000 / 60; root.updateMatrixWorld(true); avatar.update(now, 'continue', false, locomotion, ground); };
      for (let i = 0; i < 120; i++) { distance += 1.65 / 60; root.position.set(0, 0, distance); frame({ speed: 1.65, distance, heading: 0 }); }
      for (let i = 0; i < 30; i++) frame({ speed: 0, distance });
      // The seat (or the landing spot) is beside where the walk ended; the town
      // stands a sitter up around the seat (server/world.js stand).
      root.position.set(offset, away === 'seat' ? .45 - avatar.rig.hipHeight + .025 : 1.2, distance); root.rotation.y = Math.PI / 2;
      for (let i = 0; i < 60; i++) frame(away === 'seat' ? { speed: 0, distance, riding: true, ridingKind: 'seat', seatToFloor: .45 } : { speed: 0, distance, flying: true, flightSpeed: 0 });
      root.position.set(offset, 0, distance + .2);
      frame({ speed: 0, distance });
      for (const leg of avatar.feet) {
        const off = leg.target.distanceTo(root.localToWorld(leg.rest.clone()));
        // Main kept the footprints from before sitting: 0.54-1.04 m off with the leg 0.4 m short of them.
        assert.ok(off < .09 && leg.error < .01 && leg.contact, `${profile} after ${away} ${offset} m away: foot ${off.toFixed(3)} m from its stance, ${leg.error.toFixed(3)} m out of reach`);
      }
      avatar.dispose();
    }
  });
});
