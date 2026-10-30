import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { loadResidentAvatar } from '../src/avatars.js';
import { createCharacterFidelity } from '../src/character-fidelity-runtime.js';
import { createPlayerCostume } from '../src/player-costume.js';
import { REALISM_COMPONENTS } from '../src/character-realism.js';
import { DEFAULT_APPEARANCE_REALISM, defaultAppearanceRealism } from '../src/default-appearance-realism.js';
import { DEFAULT_GUEST_APPEARANCE, DEFAULT_SHARED_APPEARANCE, SHARED_APPEARANCES } from '../src/shared-appearances.js';

const DEFAULTS = [DEFAULT_SHARED_APPEARANCE, DEFAULT_GUEST_APPEARANCE];
// Jevica's roughness went past the +10% CPU bar for her ×8 crowd (timing-6), and
// then Sable's for her ×24 crowd (timing-7), so the trial lists only Sable and
// ships switched off; see the #517 acceptance doc.
const TRIAL = [DEFAULT_GUEST_APPEARANCE];
const on = {...DEFAULT_APPEARANCE_REALISM, enabled: true};

test('switched on, the trial lists only the guest default, and never the eyes, cards or the whole preset', () => {
  assert.deepEqual(Object.keys(on.appearances).sort(), [...TRIAL].sort());
  assert.equal(defaultAppearanceRealism(DEFAULT_SHARED_APPEARANCE, on), null, 'Jevica keeps imported materials');
  for (const {id} of SHARED_APPEARANCES) {
    const components = defaultAppearanceRealism(id, on);
    if (!TRIAL.includes(id)) { assert.equal(components, null, `${id} keeps imported materials`); continue; }
    assert.ok(components.length > 0, id);
    assert.ok(components.every(component => REALISM_COMPONENTS.includes(component)), id);
    // Uniform pores pebble the lips, coverage reshapes the brows and lashes, and
    // strand recolor changes Sable's palette.
    for (const excluded of ['cornea', 'scatter', 'sheen', 'pores', 'coverage', 'hairColor']) assert.ok(!components.includes(excluded), `${id} omits ${excluded}`);
  }
  assert.equal(defaultAppearanceRealism(undefined, on), null);
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

test('the shipped build draws both named defaults with imported materials', async t => {
  await shippedRig(t);
  // Jevica, Sable, another look on the same rig, and an explicit off.
  for (const [appearanceId, realism] of [[DEFAULT_SHARED_APPEARANCE, undefined], [DEFAULT_GUEST_APPEARANCE, undefined], ['woman-tailored', undefined], [DEFAULT_GUEST_APPEARANCE, 'off']]) {
    const avatar = await loadResidentAvatar(4, `remote-trial-${appearanceId}`, 'jevica', {folk: false, appearanceId, faceRecipe: {}, realism});
    try {
      assert.equal(avatar.realismReport.tier, 'off', `${appearanceId} ${realism}`);
      avatar.object.traverse(object => {
        if (object.isMesh && object.material.name === 'young_asian_female') assert.equal(object.material.roughnessMap, null, `${appearanceId} skin has no roughness map`);
      });
    } finally { avatar.dispose(); }
  }
});

test('switched on, Sable on the shipped rig takes only her trial components', async t => {
  await shippedRig(t);
  const appearanceId = DEFAULT_GUEST_APPEARANCE;
  const avatar = await loadResidentAvatar(4, `remote-trial-${appearanceId}`, 'jevica', {folk: false, appearanceId, faceRecipe: {}});
  // loadResidentAvatar builds this same layer on the rig when the switch is on.
  const fidelity = createCharacterFidelity(avatar.rig, {components: defaultAppearanceRealism(appearanceId, on)});
  try {
    const report = await fidelity.setTier('high');
    assert.equal(report.tier, 'high');
    assert.deepEqual(report.components, defaultAppearanceRealism(appearanceId, on));
    assert.equal(report.cornea, 0, 'no cornea shell');
    assert.ok(report.skin > 0 && !report.fallback && report.unsupported.length === 0, `upgrades skin: ${JSON.stringify(report)}`);
    assert.equal(report.hair + report.brows + report.lashes, 0, 'keeps its hair, brow and lash cards');
    let shells = 0;
    avatar.object.traverse(object => {
      if (/cornea$/.test(object.name)) shells++;
      if (object.isMesh && /eyebrow|eyelashes/i.test(object.name)) assert.equal(object.material.alphaToCoverage, false, object.name);
      if (object.isMesh && object.material.name === 'young_asian_female') {
        assert.equal(object.material.roughnessMap?.name, 'realism-skin-roughness', 'skin takes the roughness map');
        assert.notEqual(object.material.normalMap?.name, 'realism-pores', 'skin has no pore normals');
      }
    });
    assert.equal(shells, 0);
  } finally { fidelity.dispose(); avatar.dispose(); }
});

// The world applies the costume after loading, as player and remote avatars do.
async function costumedJevica(id, realism) {
  const avatar = await loadResidentAvatar(4, id, 'jevica', {folk: false, appearanceId: DEFAULT_SHARED_APPEARANCE, faceRecipe: {}, realism});
  const costume = createPlayerCostume(avatar, 'jevica');
  const material = pattern => [...avatar.rig.materials].find(([original]) => pattern.test(original.name))[1];
  const skin = material(/^young_/), hair = material(/^long01$/), brows = material(/^jevica_brows$/);
  // Her ombré hair (espresso to rose, 2026-10-29) and soft-brow shaders, and the costume's alpha and skin values.
  const shaders = () => {
    assert.equal(hair.customProgramCacheKey(), 'jevica-ombre-hair-v1');
    assert.equal(brows.customProgramCacheKey(), 'jevica-soft-brows-v1');
  };
  const costumed = () => {
    shaders();
    assert.equal(hair.alphaTest, .35);
    assert.equal(brows.alphaTest, .4);
    assert.equal(skin.roughnessMap, null);
    assert.equal(skin.roughness, .58, 'the costume skin');
  };
  return {avatar, skin, shaders, costumed, dispose() { costume.dispose(); avatar.dispose(); }};
}

test('Jevica keeps her costume, as shipped and beneath an applied realism tier', async t => {
  await shippedRig(t);
  // As shipped, the costume applies straight to her imported materials.
  const shipped = await costumedJevica('remote-trial-costume-shipped');
  try { assert.equal(shipped.avatar.realismReport.tier, 'off'); shipped.costumed(); } finally { shipped.dispose(); }
  // The costume edits materials beneath an applied tier, so re-tiers keep it. Jevica
  // is not in the trial, so an explicit tier (the whole preset) applies the layer
  // here; the order is the same for any component list.
  const tiered = await costumedJevica('remote-trial-costume', 'high');
  try {
    for (const tier of [undefined, 'standard', 'low', 'high']) {
      if (tier) await tiered.avatar.setRealismTier(tier);
      tiered.shaders();
      assert.equal(tiered.skin.roughnessMap?.name, 'realism-skin-roughness', `${tier} map`);
      assert.equal(tiered.skin.roughness, 1, `${tier} map is not scaled by the costume`);
    }
    await tiered.avatar.setRealismTier('off');
    tiered.costumed();
  } finally { tiered.dispose(); }
});
