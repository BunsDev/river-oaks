import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadResidentAvatar } from '../src/avatars.js';
import { cullAvatarMeshes, figureHeight, figureInView, FIGURE_SPHERE, SHADOW_DROP } from '../src/avatar-culling.js';
import { createPlayerCostume } from '../src/player-costume.js';
import { SHARED_APPEARANCES } from '../src/shared-appearances.js';
import { characterFidelityContract } from '../src/character-fidelity-contract.js';
import { loadCharacterRig } from './helpers/character-rig.js';

const GESTURES = ['acknowledge', 'amazed', 'bow', 'dance', 'enchanted', 'greet', 'handshake', 'perform', 'startled', 'water', 'wave'];

// Every pose a remote player can be driven into by remote-players.js.
function* poses(avatar) {
  let clock = 0;
  const run = function* (label, frames, action, motion, place = () => {}, every = 12) {
    for (let frame = 0; frame < frames; frame++) {
      clock += 1000 / 60; place(frame);
      avatar.update(clock, action, false, motion(frame), () => avatar.object.position.y);
      if (frame % every === every - 1) yield label;
    }
  };
  const still = () => ({ speed: 0, distance: 0 });
  yield* run('idle', 48, 'continue', still);
  for (const speed of [1.4, 3.4]) yield* run(`gait ${speed}`, 96, 'continue', frame => ({ speed, distance: frame / 60 * speed }), frame => { avatar.object.position.z = frame / 60 * speed; });
  avatar.object.position.z = 0;
  for (const gesture of GESTURES) yield* run(gesture, 120, gesture, () => ({ speed: 0, distance: 0, gestureTime: 0 }), undefined, 24);
  yield* run('hover', 48, 'continue', () => ({ speed: 0, distance: 0, flying: true, flightSpeed: 0 }));
  yield* run('flight', 48, 'continue', () => ({ speed: 0, distance: 0, flying: true, flightSpeed: 14 }));
  avatar.object.position.y = .46 - avatar.rig.hipHeight + .025;
  yield* run('seated', 96, 'continue', () => ({ speed: 0, distance: 0, riding: true, ridingKind: 'seat', seatToFloor: .46 }));
  avatar.object.position.y = 0;
}

// Largest |vertex - centre| / radius over every vertex of the skinned meshes,
// after the world update a render performs (attached skins re-read their frame).
function reach(root, meshes) {
  const vertex = new THREE.Vector3();
  let worst = 0;
  root.updateMatrixWorld(true);
  for (const mesh of meshes) {
    if (!mesh.visible) continue;
    mesh.skeleton.update();
    const { center, radius } = mesh.boundingSphere, count = mesh.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) worst = Math.max(worst, mesh.getVertexPosition(i, vertex).distanceTo(center) / radius);
  }
  return worst;
}

for (const look of SHARED_APPEARANCES) test(`${look.id}: the figure sphere contains every skinned vertex in every remote pose`, async t => {
  const rig = look.rig ?? look.id, source = await loadCharacterRig(rig);
  const previousLoad = GLTFLoader.prototype.loadAsync, previousWindow = globalThis.window, previousDocument = globalThis.document;
  GLTFLoader.prototype.loadAsync = async () => ({ scene: source.scene });
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) };
  t.after(() => { GLTFLoader.prototype.loadAsync = previousLoad; globalThis.window = previousWindow; globalThis.document = previousDocument; });
  const avatar = await loadResidentAvatar(0, `remote-cull-${look.id}`, rig, { folk: false, appearanceId: look.id });
  const outfit = look.costume === 'jevica' ? createPlayerCostume(avatar, 'jevica') : null;
  try {
    const height = figureHeight(avatar), meshes = cullAvatarMeshes(avatar.object, height);
    const expectedHeight = characterFidelityContract(rig)?.targetHeightM ?? (look.rig === 'jevica' || look.id === 'jevica' ? 1.685 : 1.78);
    assert.ok(Math.abs(height - expectedHeight) < 1e-9, `${look.id}: standing height ${height}`);
    assert.ok(meshes.length >= 4, `${look.id}: body, hair and garment skins are culled (${meshes.length})`);
    assert.ok(meshes.every(mesh => mesh.frustumCulled && mesh.boundingSphere.radius > 0));
    assert.deepEqual(cullAvatarMeshes(avatar.object, height), [], 'a second pass changes nothing');
    let worst = { reach: reach(avatar.object, meshes), pose: 'rest' };
    for (const pose of poses(avatar)) {
      outfit?.update(false, 0, false);
      const value = reach(avatar.object, meshes);
      if (value > worst.reach) worst = { reach: value, pose };
    }
    t.diagnostic(`${look.id}: ${meshes.length} meshes, worst reach ${worst.reach.toFixed(3)} of the radius (${worst.pose}); radius ${(FIGURE_SPHERE.radius * height).toFixed(2)} m`);
    assert.ok(worst.reach <= .97, `${look.id}: ${worst.pose} reaches ${worst.reach.toFixed(3)} of the figure sphere`);
  } finally { outfit?.dispose(); avatar.dispose(); }
});

function viewFrom(position, target, fov = 60, aspect = 1.6) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, .1, 300);
  camera.position.set(...position); camera.lookAt(...target); camera.updateMatrixWorld();
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}

test('a figure behind the camera is out of view unless its shadow can reach the view', () => {
  const frustum = viewFrom([0, 1.6, 0], [0, 1.6, -10]), height = 1.7, radius = FIGURE_SPHERE.radius * height;
  const at = z => new THREE.Vector3(0, FIGURE_SPHERE.center * height, z);
  assert.equal(figureInView(frustum, at(-10), radius, 0, null), true, 'in front');
  // 1.5 m behind the eye. A 27° sun ahead lays the head's shadow about 3.1 m in
  // front, where the ground is in view (it is from 2.8 m); a 45° sun lays it behind.
  assert.equal(figureInView(frustum, at(1.5), radius, 0, null), false, 'behind, no sun shadows');
  assert.equal(figureInView(frustum, at(1.5), radius, 0, new THREE.Vector3(0, -1, 1).normalize()), false, 'behind, shadow cast away');
  assert.equal(figureInView(frustum, at(1.5), radius, 0, new THREE.Vector3(0, -.5, -1).normalize()), true, 'behind, shadow cast into view');
  assert.equal(figureInView(frustum, at(1.5), radius, 0, new THREE.Vector3(0, -.01, 1).normalize()), true, 'a grazing sun keeps every figure');
});

test('a hidden figure never has a sampled shadow point inside the view', () => {
  let seed = 442;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32, span = (a, b) => a + (b - a) * random();
  const point = new THREE.Vector3(), offset = new THREE.Vector3();
  let hidden = 0, sampled = 0;
  for (let n = 0; n < 300; n++) {
    const eye = [span(-20, 20), span(1, 8), span(-20, 20)];
    const frustum = viewFrom(eye, [eye[0] + span(-10, 10), span(-2, 4), eye[2] + span(-10, 10)], span(35, 80), span(.45, 2));
    const height = span(1.6, 1.9), radius = FIGURE_SPHERE.radius * height, floor = span(-.5, 1.5);
    const center = new THREE.Vector3(eye[0] + span(-25, 25), floor + FIGURE_SPHERE.center * height, eye[2] + span(-25, 25));
    const light = new THREE.Vector3(span(-1, 1), -span(.2, 1), span(-1, 1)).normalize();
    if (figureInView(frustum, center, radius, floor, light)) continue;
    hidden++;
    // Points of the figure, each marched along the light to the shadow floor.
    for (let k = 0; k < 48; k++) {
      do offset.set(span(-1, 1), span(-1, 1), span(-1, 1)); while (offset.lengthSq() > 1);
      const start = offset.multiplyScalar(radius).add(center), reach = (start.y - floor + SHADOW_DROP) / -light.y;
      for (let s = 0; s <= reach; s += .25, sampled++)
        assert.equal(frustum.containsPoint(point.copy(start).addScaledVector(light, s)), false, `case ${n}: a shadow point is in view`);
    }
  }
  assert.ok(hidden > 60, `the test hides enough figures to matter (${hidden})`);
  assert.ok(sampled > 100000);
});
