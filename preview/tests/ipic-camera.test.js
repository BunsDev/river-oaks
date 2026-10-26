// The walking camera inside IPIC stays under the ceilings the visitor sees (Val, 2026-10-26). On main c6eba6a3 its
// boom rose through reception's ceiling on the first run, the landing's on the second, and the lounge's and the
// Tuck Room's upstairs, so the view was the top of a ceiling: a roof across the escalator, or nothing at all.
// Real camera poses (third-person.js) in the real walking environment, against the built meshes (no textures).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWalkingEnvironment } from '../src/walking.js';
import { buildIpicInterior } from '../src/ipic-interior.js';
import { ipicCeiling, ipicFloor } from '../src/ipic-plan.js';
import { thirdPersonPose } from '../src/third-person.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(world);
const room = environment.rooms.find(r => r.interior === 'ipic-photo-v1');
const group = buildIpicInterior(room, { textures: false, local: true });
group.updateMatrixWorld(true);
const meshes = [];
group.traverse(item => { if (item.isMesh && !item.isInstancedMesh) meshes.push(item); });
// Hanging lamps, plants and glassware are not ceilings: a camera may look down on them.
const hanging = /rattan|glow|pothos|leaf|stemware|greenery/;

// Where a visitor stands on the way up and through the venue, as the browser walk-through measured it.
const STOPS = [['reception', -1.4, 4.8], ['first run', -1.4, 9], ['landing', -1.4, 13], ['landing bay', 4, 13], ['second run', -1.4, 16.5],
  ['top of the second run', -1.4, 20.7], ['lounge', -1.4, 22.6], ['Tuck Room', 1.9, 21.2], ['cinema doorway', -4.85, 26.7], ['cross aisle', -4.4, 27.4]];
const poses = [];
for (const [name, a, d] of STOPS) {
  const [east, north] = room.toWorld(a, d), x = east, z = -north;
  for (let k = 0; k < 8; k++) for (const pitch of [-.6, -.3, 0, .5]) {
    const state = { position: [x, environment.groundAt(x, z) + 1.68, z], yaw: k * Math.PI / 4, pitch };
    poses.push({ name, a, d, pitch, yaw: state.yaw, pose: thirdPersonPose(state, environment) });
  }
}
const local = ([x, , z]) => room.toLocal(x, -z);

test('the walking camera stays under the drawn ceiling all the way up and through the venue', () => {
  const above = poses.filter(({ pose }) => {
    const [a, d] = local(pose.position);
    return pose.position[1] - room.floor > ipicCeiling(d, a) - .3 + 1e-9;
  }).map(({ name, yaw, pitch, pose }) => `${name} yaw ${yaw.toFixed(2)} pitch ${pitch}: ${(pose.position[1] - room.floor).toFixed(2)} m`);
  assert.deepEqual(above.slice(0, 6), [], `${above.length} camera poses are above the ceiling`);
});

test('below the camera is the floor it stands over and what stands on it, never the top of a ceiling', () => {
  const raycaster = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), wrong = [];
  for (const { name, yaw, pitch, pose } of poses) {
    const [a, d] = local(pose.position), from = new THREE.Vector3(a, pose.position[1] - room.floor, -d);
    raycaster.set(from, down);
    const hit = raycaster.intersectObjects(meshes, false).find(h => !hanging.test(h.object.material.name));
    // The tallest things that stand on a floor here are the bar's back shelves and the recliners' backs; a
    // ceiling's top is at least 3.6 m over the floor beneath it.
    if (!hit || hit.point.y - ipicFloor(d, a) > 2.6) wrong.push(`${name} yaw ${yaw.toFixed(2)} pitch ${pitch}: ${hit ? `${hit.object.name} ${(hit.point.y - ipicFloor(d, a)).toFixed(2)} m up` : 'nothing'}`);
  }
  assert.deepEqual(wrong.slice(0, 6), [], `${wrong.length} camera poses look down on something other than the floor`);
});

// Kept under the ceilings, the boom still frames the visitor riding up or down, on the landing and upstairs. (Across
// a lane the rails a step away collapse any boom, as before.)
test('looking up or down the escalators, the camera keeps the visitor in view at every stop and pitch', () => {
  const up = Math.atan2(-room.inward[0], room.inward[1]), hidden = [];
  for (const [name, a, d] of STOPS.filter(([name]) => !/bay|doorway|aisle/.test(name))) {
    const [east, north] = room.toWorld(a, d), x = east, z = -north;
    for (const yaw of [up, up + Math.PI]) for (const pitch of [-.6, -.3, 0, .5]) {
      if (!thirdPersonPose({ position: [x, environment.groundAt(x, z) + 1.68, z], yaw, pitch }, environment).showBody) hidden.push(`${name} yaw ${yaw.toFixed(2)} pitch ${pitch}`);
    }
  }
  assert.deepEqual(hidden, []);
});

test.after(() => group.userData.dispose());
