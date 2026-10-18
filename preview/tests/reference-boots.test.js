import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {instantiateAvatar} from '../src/avatars.js';
import {createReferenceStyle} from '../src/reference-archetypes.js';
import {SHARED_APPEARANCES} from '../src/shared-appearances.js';
import {loadCharacterRig} from './helpers/character-rig.js';

for (const appearance of SHARED_APPEARANCES.filter(look => ['rowan','kai','lyra','vesper','aurel'].includes(look.character))) {
  test(`${appearance.id}: boot shafts follow the shin while soles follow the ankle`, async () => {
    const source = await loadCharacterRig(appearance.rig), avatar = instantiateAvatar(source, {targetHeight: source.height, id: appearance.id});
    const model = avatar.model, look = createReferenceStyle(avatar, appearance);
    try {
      model.position.set(2, .4, -3); model.rotation.y = .7; model.updateWorldMatrix(true, true);
      for (const side of ['l','r']) {
        const calf = model.getObjectByName(`calf_${side}`), foot = model.getObjectByName(`foot_${side}`);
        const footMeshes = new Set(foot.getObjectsByProperty('isMesh', true));
        const shafts = calf.getObjectsByProperty('isMesh', true).filter(mesh => !footMeshes.has(mesh));
        assert(shafts.length > 0 && footMeshes.size > 0, 'both shaft and foot geometry must exist');
        const samples = meshes => [...meshes].flatMap(mesh => Array.from({length: mesh.geometry.attributes.position.count}, (_, i) =>
          ({mesh, i, point: mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)})));
        const upper = samples(shafts), lower = samples(footMeshes);
        const at = sample => sample.mesh.getVertexPosition(sample.i, new THREE.Vector3()).applyMatrix4(sample.mesh.matrixWorld);
        const rest = foot.quaternion.clone();
        for (const angle of [-.5, .6]) {
          foot.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(foot).x, angle));
          model.updateWorldMatrix(true, true);
          assert(upper.every(sample => at(sample).distanceTo(sample.point) < 1e-6), 'ankle flex cannot swing the boot shaft away from the shin');
          assert(lower.some(sample => at(sample).distanceTo(sample.point) > .01), 'sole and last still follow ankle flex');
        }
        foot.quaternion.copy(rest); model.updateWorldMatrix(true, true);
      }
    } finally { look.dispose(); avatar.dispose(); }
  });
}
