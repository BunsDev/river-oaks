import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { loadResidentAvatar } from '../src/avatars.js';
import { REALISM_COMPONENTS } from '../src/character-realism.js';
import { DEFAULT_APPEARANCE_REALISM, defaultAppearanceRealism } from '../src/default-appearance-realism.js';
import { DEFAULT_GUEST_APPEARANCE, DEFAULT_SHARED_APPEARANCE, SHARED_APPEARANCES } from '../src/shared-appearances.js';

const DEFAULTS = [DEFAULT_SHARED_APPEARANCE, DEFAULT_GUEST_APPEARANCE];

test('only the owner and guest defaults take the trial, and never the eyes, cards or the whole preset', () => {
  assert.deepEqual(Object.keys(DEFAULT_APPEARANCE_REALISM.appearances).sort(), [...DEFAULTS].sort());
  for (const {id} of SHARED_APPEARANCES) {
    const components = defaultAppearanceRealism(id);
    if (!DEFAULTS.includes(id)) { assert.equal(components, null, `${id} keeps imported materials`); continue; }
    assert.ok(components.length > 0, id);
    assert.ok(components.every(component => REALISM_COMPONENTS.includes(component)), id);
    // Uniform pores pebble the lips, coverage reshapes the brows and lashes, and
    // strand recolor changes Sable's palette.
    for (const excluded of ['cornea', 'scatter', 'sheen', 'pores', 'coverage', 'hairColor']) assert.ok(!components.includes(excluded), `${id} omits ${excluded}`);
  }
  assert.equal(defaultAppearanceRealism(undefined), null);
});

test('the rollback switch returns both named defaults to imported materials', () => {
  const off = {...DEFAULT_APPEARANCE_REALISM, enabled: false};
  for (const id of DEFAULTS) assert.equal(defaultAppearanceRealism(id, off), null, id);
});

test('the shipped rig loads Jevica and Sable with only their trial components', async t => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  globalThis.window = {matchMedia: () => ({matches: false})};
  globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}})})};
  t.after(() => { globalThis.window = previousWindow; globalThis.document = previousDocument; });
  const source = await loadCharacterRig('jevica');
  // The shipped skin uses KHR_materials_specular, so the browser loader makes it
  // physical; the stripped test rig does not, so restore that here.
  source.scene.traverse(object => {
    if (object.isMesh && object.material.name === 'young_asian_female') object.material = new THREE.MeshPhysicalMaterial({name: object.material.name});
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async url => {
    if (url.endsWith('/jevica.glb')) return source;
    throw new Error(`unexpected load ${url}`);
  });
  for (const appearanceId of DEFAULTS) {
    const avatar = await loadResidentAvatar(4, `remote-trial-${appearanceId}`, 'jevica', {folk: false, appearanceId, faceRecipe: {}});
    try {
      const report = avatar.realismReport;
      assert.notEqual(report.tier, 'off', appearanceId);
      assert.deepEqual(report.components, defaultAppearanceRealism(appearanceId), appearanceId);
      assert.equal(report.cornea, 0, `${appearanceId} has no cornea shell`);
      assert.ok(report.skin > 0, `${appearanceId} upgrades skin: ${JSON.stringify(report)}`);
      assert.equal(report.hair + report.brows + report.lashes, 0, `${appearanceId} keeps its hair, brow and lash cards`);
      avatar.object.traverse(object => {
        if (object.isMesh && /eyebrow|eyelashes/i.test(object.name)) assert.equal(object.material.alphaToCoverage, false, object.name);
        if (object.isMesh && object.material.name === 'young_asian_female') assert.notEqual(object.material.normalMap?.name, 'realism-pores', 'skin has no pore normals');
      });
      let shells = 0; avatar.object.traverse(object => { if (/cornea$/.test(object.name)) shells++; });
      assert.equal(shells, 0);
    } finally { avatar.dispose(); }
  }
  // Another look on the same rig, and an explicit off, keep imported materials.
  for (const [appearanceId, realism] of [['woman-tailored', undefined], [DEFAULT_SHARED_APPEARANCE, 'off']]) {
    const avatar = await loadResidentAvatar(4, `remote-trial-${appearanceId}`, 'jevica', {folk: false, appearanceId, faceRecipe: {}, realism});
    try { assert.equal(avatar.realismReport.tier, 'off', `${appearanceId} ${realism}`); } finally { avatar.dispose(); }
  }
});
