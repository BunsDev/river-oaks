import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { loadResidentAvatar } from '../src/avatars.js';
import { createPlayerCostume } from '../src/player-costume.js';
import { REALISM_COMPONENTS } from '../src/character-realism.js';
import { DEFAULT_APPEARANCE_REALISM, defaultAppearanceRealism } from '../src/default-appearance-realism.js';
import { DEFAULT_GUEST_APPEARANCE, DEFAULT_SHARED_APPEARANCE, SHARED_APPEARANCES } from '../src/shared-appearances.js';

const DEFAULTS = [DEFAULT_SHARED_APPEARANCE, DEFAULT_GUEST_APPEARANCE];
// Jevica's roughness went past the +10% CPU bar for her crowds (timing-3 at ×1,
// timing-6 at ×8), so only Sable takes the trial; see the #517 acceptance doc.
const TRIAL = [DEFAULT_GUEST_APPEARANCE];

test('only the guest default takes the trial, and never the eyes, cards or the whole preset', () => {
  assert.deepEqual(Object.keys(DEFAULT_APPEARANCE_REALISM.appearances).sort(), [...TRIAL].sort());
  assert.equal(defaultAppearanceRealism(DEFAULT_SHARED_APPEARANCE), null, 'Jevica keeps imported materials');
  for (const {id} of SHARED_APPEARANCES) {
    const components = defaultAppearanceRealism(id);
    if (!TRIAL.includes(id)) { assert.equal(components, null, `${id} keeps imported materials`); continue; }
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

// Loads the shipped Jevica rig the way the world does, with the roughness map
// served, so the trial's map actually attaches.
async function shippedRig(t) {
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
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async url => {
    if (url.endsWith('/skin-roughness.webp')) return new THREE.Texture();
    throw new Error(`unexpected texture ${url}`);
  });
}

test('the shipped rig loads Sable with only her trial components and Jevica as imported', async t => {
  await shippedRig(t);
  for (const appearanceId of TRIAL) {
    const avatar = await loadResidentAvatar(4, `remote-trial-${appearanceId}`, 'jevica', {folk: false, appearanceId, faceRecipe: {}});
    try {
      const report = avatar.realismReport;
      assert.notEqual(report.tier, 'off', appearanceId);
      assert.deepEqual(report.components, defaultAppearanceRealism(appearanceId), appearanceId);
      assert.equal(report.cornea, 0, `${appearanceId} has no cornea shell`);
      assert.ok(report.skin > 0 && !report.fallback && report.unsupported.length === 0, `${appearanceId} upgrades skin: ${JSON.stringify(report)}`);
      assert.equal(report.hair + report.brows + report.lashes, 0, `${appearanceId} keeps its hair, brow and lash cards`);
      avatar.object.traverse(object => {
        if (object.isMesh && /eyebrow|eyelashes/i.test(object.name)) assert.equal(object.material.alphaToCoverage, false, object.name);
        if (object.isMesh && object.material.name === 'young_asian_female') {
          assert.equal(object.material.roughnessMap?.name, 'realism-skin-roughness', 'skin takes the roughness map');
          assert.notEqual(object.material.normalMap?.name, 'realism-pores', 'skin has no pore normals');
        }
      });
      let shells = 0; avatar.object.traverse(object => { if (/cornea$/.test(object.name)) shells++; });
      assert.equal(shells, 0);
    } finally { avatar.dispose(); }
  }
  // Jevica, another look on the same rig, and an explicit off keep imported materials.
  for (const [appearanceId, realism] of [[DEFAULT_SHARED_APPEARANCE, undefined], ['woman-tailored', undefined], [DEFAULT_GUEST_APPEARANCE, 'off']]) {
    const avatar = await loadResidentAvatar(4, `remote-trial-${appearanceId}`, 'jevica', {folk: false, appearanceId, faceRecipe: {}, realism});
    try {
      assert.equal(avatar.realismReport.tier, 'off', `${appearanceId} ${realism}`);
      avatar.object.traverse(object => {
        if (object.isMesh && object.material.name === 'young_asian_female') assert.equal(object.material.roughnessMap, null, `${appearanceId} skin has no roughness map`);
      });
    } finally { avatar.dispose(); }
  }
});

// While Jevica is out of the trial her costume applies straight to imported
// materials. If she is listed again, the costume must stay beneath every re-tier.
test('Jevica keeps her costume through the realism policy', async t => {
  await shippedRig(t);
  const avatar = await loadResidentAvatar(4, 'remote-trial-costume', 'jevica', {folk: false, appearanceId: DEFAULT_SHARED_APPEARANCE, faceRecipe: {}});
  // The world applies the costume after loading, as player and remote avatars do.
  const costume = createPlayerCostume(avatar, 'jevica');
  const material = pattern => [...avatar.rig.materials].find(([original]) => pattern.test(original.name))[1];
  const skin = material(/^young_/), hair = material(/^long01$/), brows = material(/^jevica_brows$/);
  const costumed = () => {
    assert.equal(hair.customProgramCacheKey(), 'jevica-rose-gold-hair-v2');
    assert.equal(hair.alphaTest, .35);
    assert.equal(brows.customProgramCacheKey(), 'jevica-soft-brows-v1');
    assert.equal(brows.alphaTest, .4);
  };
  try {
    if (!defaultAppearanceRealism(DEFAULT_SHARED_APPEARANCE)) {
      assert.equal(avatar.realismReport.tier, 'off');
      costumed();
      assert.equal(skin.roughnessMap, null);
      assert.equal(skin.roughness, .58, 'the costume skin is unchanged');
      return;
    }
    // The trial sits on top of the costume, as in the hero and the trial captures.
    for (const tier of [undefined, 'standard', 'low', 'high']) {
      if (tier) await avatar.setRealismTier(tier);
      costumed();
      assert.equal(skin.roughnessMap?.name, 'realism-skin-roughness', `${tier} map`);
      assert.equal(skin.roughness, 1, `${tier} map is not scaled by the costume`);
    }
    await avatar.setRealismTier('off');
    costumed();
    assert.equal(skin.roughnessMap, null);
    assert.equal(skin.roughness, .58, 'off returns the costume skin');
  } finally { costume.dispose(); avatar.dispose(); }
});
