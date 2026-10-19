import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadResidentAvatar } from '../src/avatars.js';
import { cullAvatarMeshes, figureHeight, FIGURE_SPHERE } from '../src/avatar-culling.js';
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
