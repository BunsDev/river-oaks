import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Object3D, Vector3 } from 'three';
import { AVATAR_PROFILES } from '../src/avatars.js';
import { relaxResidentArms } from '../src/avatar-stance.js';

for (const profile of AVATAR_PROFILES) test(`${profile} rests hands below shoulders without moving the feet`, () => {
  const bytes = readFileSync(new URL(`../public/assets/characters/${profile}.glb`, import.meta.url));
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const nodes = gltf.nodes.map(node => {
    const object = new Object3D(); object.name = node.name ?? '';
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    if (node.matrix) { object.matrix.fromArray(node.matrix); object.matrix.decompose(object.position, object.quaternion, object.scale); }
    return object;
  });
  gltf.nodes.forEach((node, i) => node.children?.forEach(child => nodes[i].add(nodes[child])));
  const root = new Object3D(); gltf.scenes[gltf.scene ?? 0].nodes.forEach(i => root.add(nodes[i]));
  root.updateWorldMatrix(true, true);
  const feet = ['foot_l', 'foot_r'].map(name => root.getObjectByName(name).getWorldPosition(new Vector3()));
  relaxResidentArms(root);
  for (const side of ['l', 'r']) {
    const arm = root.getObjectByName(`upperarm_${side}`).getWorldPosition(new Vector3());
    const hand = root.getObjectByName(`hand_${side}`).getWorldPosition(new Vector3());
    const delta = hand.sub(arm);
    assert.ok(delta.y < -0.35 && Math.abs(delta.x) < 0.15, `comfortable shoulder-to-hand vector ${delta.toArray()}`);
  }
  ['foot_l', 'foot_r'].forEach((name, i) => assert.ok(root.getObjectByName(name).getWorldPosition(new Vector3()).distanceTo(feet[i]) < 1e-8));
});
