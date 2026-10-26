import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { localLocomotion } from '../src/locomotion-handoff.js';
import { stepWalking, WALK_SPEED } from '../src/walking.js';
import { turnToward } from '../src/gait.js';
import { createFootPlacement } from '../src/foot-placement.js';
import { instantiateAvatar } from '../src/avatars.js';
import { loadCharacterRig } from './helpers/character-rig.js';

// #637, local player: walking.js already measures horizontal travel. The payload
// must carry the travel heading so steps land along it while the body turns.
test('the local payload hands foot placement the travel heading, the presented heading, or none when standing', () => {
  const walking = { speed: 1.65, distance: 12, velocity: [1.65, 0], flying: false };
  assert.deepEqual(localLocomotion(walking), { speed: 1.65, distance: 12, heading: Math.PI / 2, platform: undefined });
  assert.equal(localLocomotion({ ...walking, velocity: [0, -1.65] }).heading, Math.PI);
  assert.equal(localLocomotion({ ...walking, heading: .3, platform: [1, 2, 3] }).heading, .3, 'a presentation pose names its own heading');
  assert.deepEqual(localLocomotion({ ...walking, platform: [1, 2, 3] }).platform, [1, 2, 3]);
  assert.equal(localLocomotion({ ...walking, speed: .04 }).heading, undefined, 'standing keeps the body heading');
  assert.equal(localLocomotion(walking, { seated: true }).speed, 0);
  assert.equal(localLocomotion({ ...walking, flying: true }).speed, 0);
  assert.equal(localLocomotion({ ...walking, flying: true }).heading, undefined);
});

test('local reversals, strafes and restarts land steps along travel at 30, 60 and 120 Hz', async () => {
  const scripts = { reverse: t => t < 1.2 ? { forward: 1 } : { forward: -1 }, strafe: t => t < 1.2 ? { forward: 1 } : { strafe: 1 }, restart: t => t < 1.2 ? { forward: 1 } : t < 2 ? {} : { forward: 1 } };
  const environment = { isFree: () => true, groundAt: () => 0 };
  for (const profile of ['jevica', 'woman-casual']) {
    const source = await loadCharacterRig(profile);
    for (const [name, script] of Object.entries(scripts)) for (const key of ['normal', 'fast', 'jevicaFast']) for (const hz of [30, 60, 120]) {
      const avatar = instantiateAvatar(source, { targetHeight: 1.7 }), body = new THREE.Group(); body.add(avatar.model);
      const baseY = avatar.model.position.y, placement = createFootPlacement(avatar.model, body);
      const state = { position: [0, 1.6, 0], yaw: 0, pitch: 0, distance: 0, speed: 0, velocity: [0, 0], acceleration: [0, 0] };
      let lateral = 0, steps = 0;
      for (let frame = 0; frame < 3.2 * hz; frame++) {
        stepWalking(state, environment, { ...script(frame / hz), fast: key !== 'normal', fastSpeed: WALK_SPEED[key] }, 1 / hz);
        // player-avatar.js turns the body toward travel from the velocity, whatever the payload says.
        const pose = { ...state, flying: false }, locomotion = localLocomotion(pose);
        const travel = state.speed > .05 ? Math.atan2(state.velocity[0], state.velocity[1]) : undefined;
        if (travel !== undefined) body.rotation.y = turnToward(body.rotation.y, travel, 1 / hz);
        body.position.set(state.position[0], 0, state.position[2]);
        avatar.model.position.y = baseY; for (const [bone, rest] of avatar.rest) bone.quaternion.copy(rest);
        const before = placement.legs.map(leg => ({ contact: leg.contact, target: leg.target?.clone() }));
        placement.update(1 / hz, locomotion, () => 0);
        placement.legs.forEach((leg, i) => {
          if (travel !== undefined) {
            const side = new THREE.Vector3(Math.cos(travel), 0, -Math.sin(travel));
            lateral = Math.max(lateral, Math.abs(leg.target.clone().sub(body.position).dot(side)));
          }
          if (before[i].contact && leg.contact && before[i].target) assert.ok(leg.target.distanceTo(before[i].target) < 1e-9, `${profile} ${name}: a planted foot slides`);
          if (before[i].contact && !leg.contact) steps++;
        });
        assert.ok(placement.legs.some(leg => leg.contact), `${profile} ${name}: a supporting foot remains`);
      }
      avatar.dispose();
      // Measured at e17fd94d without the heading: 0.21-0.32 m. With it: 0.10-0.18 m
      // (hip half-width plus the strafe turn). 0.2 m separates the two.
      assert.ok(lateral < .2, `${profile} ${name} ${WALK_SPEED[key]} m/s ${hz} Hz: feet land ${lateral.toFixed(3)} m off the travel line`);
      assert.ok(steps > 8, `${profile} ${name}: keeps stepping`);
    }
  }
});
