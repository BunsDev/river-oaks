import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { loadResidentAvatar } from '../src/avatars.js';
import { DEFAULT_RECIPE, EYE_COLORS, FACE_CONTROLS, RECIPE_BODIES, RECIPE_BOTTOMS, RECIPE_FOOTWEAR, RECIPE_TOPS, SKIN_TONES, bodyClothes, rollCharacterRecipe } from '../src/character-recipe.js';
import { WARDROBE_MATERIALS, dressFromWardrobe, wardrobeMaterialOf } from '../src/character-wardrobe.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SKIN_TEXTURES, irisTexture, recipeSkinSource } from '../src/character-recipe-look.js';
import { HAIRSTYLES } from '../src/resident-hairstyle.js';
import { textureGain } from '../src/resident-style.js';

// Rigs as the browser loads them, with a stand-in texture per material named for
// it (the node helper drops images), so map swaps can be told apart. Templates
// are cached like avatars.js's, so a leak into them would show.
const templates = new Map();
async function withRigs(run) {
  const load = GLTFLoader.prototype.loadAsync, loadTexture = THREE.TextureLoader.prototype.loadAsync, document = globalThis.document, window = globalThis.window;
  // Wardrobe textures are stand-ins named for their file, like the rigs' maps.
  THREE.TextureLoader.prototype.loadAsync = async url => Object.assign(new THREE.Texture(), { name: url.split('/').at(-1).replace('.webp', '') });
  GLTFLoader.prototype.loadAsync = async url => {
    // A body (`woman-casual`) or its wardrobe (`wardrobe/woman-casual`).
    const profile = url.split('/assets/characters/').at(-1).replace('.glb', '');
    if (!templates.has(profile)) {
      const { scene } = await loadCharacterRig(profile);
      scene.traverse(mesh => { for (const material of [mesh.material ?? []].flat()) if (!material.map) { material.map = new THREE.Texture(); material.map.name = material.name.replace(/\.\d+$/, ''); } });
      templates.set(profile, scene);
    }
    return { scene: templates.get(profile) };
  };
  globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  try { await run(); } finally { GLTFLoader.prototype.loadAsync = load; THREE.TextureLoader.prototype.loadAsync = loadTexture; globalThis.document = document; globalThis.window = window; }
}
const seeded = seed => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const materials = avatar => new Map([...avatar.rig.materials].map(([original, material]) => [original.name.replace(/\.\d+$/, ''), material]));
const standing = avatar => { avatar.object.updateMatrixWorld(true); return avatar.rig.model.getObjectByName('head').getWorldPosition(new THREE.Vector3()).y; };

test('a recipe dresses its body: height, face, hairstyle, skin, eyes, hair, outfit and shoes, leaving the cached rig alone', async () => {
  await withRigs(async () => {
    const random = seeded(23);
    for (const body of Object.keys(RECIPE_BODIES)) {
      const plain = await loadResidentAvatar(0, 'remote-plain', body, { folk: false, recipe: { ...DEFAULT_RECIPE, ...bodyClothes(body), body } });
      let recipe;
      do recipe = rollCharacterRecipe({ from: { ...DEFAULT_RECIPE, ...bodyClothes(body), body }, categories: ['height', 'face', 'skin', 'eyes', 'hair', 'outfit', 'shoes'], random });
      while (recipe.outfitColor === 'natural' || recipe.shoeColor === 'natural' || recipe.hairStyle === HAIRSTYLES[body] || !Object.values(recipe.face).some(Boolean));
      const avatar = await loadResidentAvatar(0, 'remote-recipe', body, { folk: false, recipe });
      try {
        const label = `${body} ${JSON.stringify(recipe).slice(0, 120)}`;
        // Height scales the whole figure: the head stands in proportion.
        assert.ok(Math.abs(standing(avatar) / standing(plain) - recipe.height / DEFAULT_RECIPE.height) < .002, `${label}: height`);
        // Face sliders move the head's vertices; the default face keeps them.
        let moved = 0;
        const own = [], recipeMeshes = [];
        const isBody = mesh => mesh.isSkinnedMesh && Object.hasOwn(SKIN_TEXTURES, mesh.material.name.replace(/\.\d+$/, ''));
        plain.rig.model.traverse(mesh => { if (isBody(mesh)) own.push(mesh); });
        avatar.rig.model.traverse(mesh => { if (isBody(mesh)) recipeMeshes.push(mesh); });
        const a = own[0].geometry.attributes.position, b = recipeMeshes[0].geometry.attributes.position;
        for (let i = 0; i < a.count; i++) if (Math.abs(a.getX(i) - b.getX(i)) + Math.abs(a.getY(i) - b.getY(i)) + Math.abs(a.getZ(i) - b.getZ(i)) > 1e-5) moved++;
        assert.ok(moved > 50, `${label}: the face moved (${moved} vertices)`);
        // The chosen hairstyle replaces the body's own.
        const fitted = [];
        avatar.rig.model.traverse(mesh => { if (mesh.isSkinnedMesh && mesh.visible && /^(bob|short|ponytail)/.test(mesh.material.name)) fitted.push(mesh.material.name.replace(/\.\d+$/, '')); });
        assert.deepEqual([...new Set(fitted)], [recipe.hairStyle], `${label}: hairstyle`);
        const worn = materials(avatar), skin = [...worn].find(([name]) => Object.hasOwn(SKIN_TEXTURES, name))[1];
        assert.equal(skin.map.name, recipeSkinSource(recipe), `${label}: skin texture`);
        assert.equal(worn.get('brown').map.name, `iris-${recipe.eyes}`);
        assert.notDeepEqual(worn.get(RECIPE_BODIES[body].garment).color.toArray(), [1, 1, 1], `${label}: outfit tinted`);
        assert.notDeepEqual(worn.get(recipe.hairStyle).color.toArray(), [1, 1, 1], `${label}: hair tinted`);
        const shoes = [...worn].find(([name]) => /^shoes/.test(name))[1];
        assert.notDeepEqual(shoes.color.toArray(), [1, 1, 1], `${label}: shoes tinted`);
        assert.deepEqual(materials(plain).get(RECIPE_BODIES[body].garment).color.toArray(), [1, 1, 1], `${body}: natural outfit stays as made`);
      } finally { avatar.dispose(); plain.dispose(); }
      templates.get(body).traverse(mesh => {
        for (const material of [mesh.material ?? []].flat()) {
          assert.deepEqual(material.color.toArray(), [1, 1, 1], `${body}: the cached ${material.name} keeps its colour`);
          assert.equal(material.map.name, material.name.replace(/\.\d+$/, ''), `${body}: the cached ${material.name} keeps its texture`);
        }
      });
    }
  });
});

test('each body wears a light or deep skin texture by tone, gained toward the tone without stretching across clusters', async () => {
  await withRigs(async () => {
    for (const [body, skin, expected] of [['woman-casual', 'porcelain', 'young_asian_female'], ['woman-daywear', 'ebony', 'young_african_female'], ['man-tailored', 'fair', 'middleage_asian_male'], ['man-casual', 'deep', 'middleage_african_male'], ['man-tailored', 'deep', 'middleage_african_male']]) {
      const avatar = await loadResidentAvatar(0, 'remote-skin', body, { folk: false, recipe: { ...DEFAULT_RECIPE, ...bodyClothes(body), body, skin, hairStyle: HAIRSTYLES[body] } });
      try {
        const material = [...materials(avatar)].find(([name]) => Object.hasOwn(SKIN_TEXTURES, name))[1];
        assert.equal(material.map.name, expected, `${body} ${skin}`);
        for (const gain of material.color.toArray()) assert.ok(gain > .15 && gain < 4.01, `${body} ${skin}: gain ${gain.toFixed(2)} stays moderate`);
      } finally { avatar.dispose(); }
    }
  });
});

// A tone is drawn as a gain of a real skin texture. A gain that differs much between channels tints the skin, and a
// large one clips its highlights: Porcelain, a display colour, needed 2.9x in blue and rendered chalk-white.
test('every skin tone is a near-uniform gain of the texture each body wears for it, light to dark in even steps', () => {
  const luminance = color => .2126 * color.r + .7152 * color.g + .0722 * color.b;
  const tones = Object.values(SKIN_TONES).map(tone => new THREE.Color(tone.color));
  for (let i = 1; i < tones.length; i++) assert.ok(luminance(tones[i - 1]) / luminance(tones[i]) > 1.15, `tone ${i} is a distinct step darker`);
  for (const body of Object.keys(RECIPE_BODIES)) for (const [skin, tone] of Object.entries(SKIN_TONES)) {
    const source = recipeSkinSource({ ...DEFAULT_RECIPE, ...bodyClothes(body), body, skin }), gain = textureGain(SKIN_TEXTURES[source].mean, new THREE.Color(tone.color), 4);
    const label = `${body} ${skin} from ${source}: ${gain.map(value => value.toFixed(2)).join(' ')}`;
    assert.ok(Math.max(...gain) / Math.min(...gain) < 1.4, `${label} keeps the texture's hue`);
    assert.ok(Math.max(...gain) < 3.5 && Math.min(...gain) > .2, `${label} stays moderate`);
  }
});

test('a generated iris keeps the shipped eye layout: a dark pupil, the chosen iris colour, and the sclera around it', () => {
  for (const id of Object.keys(EYE_COLORS)) {
    const texture = irisTexture(id), { data, width } = texture.image, at = (u, v) => [...data.subarray((Math.floor(v * width) * width + Math.floor(u * width)) * 4).slice(0, 3)];
    assert.equal(irisTexture(id), texture, 'shared per colour');
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    for (const [u, v] of [[.7069, .2966], [.2907, .7087]]) {
      assert.ok(Math.max(...at(u, v)) < 20, `${id}: pupil`);
      const ring = [0, 1, 2].map(k => [0, 1, 2, 3, 4, 5, 6, 7].map(a => at(u + .075 * Math.cos(a * Math.PI / 4), v + .075 * Math.sin(a * Math.PI / 4))[k]).reduce((s, x) => s + x, 0) / 8);
      const target = new THREE.Color(EYE_COLORS[id].color).getHSL({}), seen = new THREE.Color().setRGB(...ring.map(x => x / 255), THREE.SRGBColorSpace).getHSL({});
      const hue = Math.min(Math.abs(target.h - seen.h), 1 - Math.abs(target.h - seen.h));
      assert.ok(hue < .04 || target.s < .15, `${id}: iris hue ${seen.h.toFixed(2)} against ${target.h.toFixed(2)}`);
      assert.ok(at(u + .15, v).every(x => x > 140), `${id}: sclera beside the iris`);
    }
  }
  assert.equal(FACE_CONTROLS.length, 16);
});

// The wardrobe (build_character_wardrobe.py), as shipped: what the Studio offers is
// what was built, with the receipt's hashes and texture means.
const WARDROBE = new URL('../public/assets/characters/wardrobe/', import.meta.url);
test('the wardrobe offers exactly what was built for each body, and its receipt matches the shipped files', () => {
  const receipt = JSON.parse(readFileSync(new URL('wardrobe.sources.json', WARDROBE)));
  const sha = url => createHash('sha256').update(readFileSync(url)).digest('hex');
  assert.deepEqual(receipt.bodies.map(body => body.body).sort(), Object.keys(RECIPE_BODIES).sort());
  for (const entry of receipt.bodies) {
    const frame = RECIPE_BODIES[entry.body].frame, built = new Set(entry.garments.map(garment => garment.id));
    assert.equal(sha(new URL(`${entry.body}.glb`, WARDROBE)), entry.sha256, entry.body);
    for (const id of [...Object.keys(RECIPE_TOPS).filter(id => RECIPE_TOPS[id].frame === frame), ...Object.keys(RECIPE_BOTTOMS).filter(id => RECIPE_BOTTOMS[id].frame === frame), ...Object.keys(RECIPE_FOOTWEAR)])
      assert.ok(built.has(id), `${entry.body} wears ${id}`);
    // The body's own clothes are in its wardrobe too.
    for (const id of Object.values(bodyClothes(entry.body))) assert.ok(built.has(id), `${entry.body} own ${id}`);
    for (const garment of entry.garments) {
      const material = WARDROBE_MATERIALS[wardrobeMaterialOf(garment.id)];
      assert.deepEqual(material.mean, garment.mean, garment.id);
      assert.equal(Boolean(material.normalMap), Boolean(garment.normalMap), garment.id);
    }
  }
  for (const [name, hash] of Object.entries(receipt.textures)) assert.equal(sha(new URL(`textures/${name}`, WARDROBE)), hash, name);
});

test('each wardrobe is fitted to its shipped rig: the same bones, bind pose and body below the head', async () => {
  for (const body of Object.keys(RECIPE_BODIES)) {
    const [shipped, wardrobe] = await Promise.all([loadCharacterRig(body), loadCharacterRig(`wardrobe/${body}`)]);
    const inverses = scene => { const found = new Map(); scene.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.bones.forEach((bone, i) => found.set(bone.name, mesh.skeleton.boneInverses[i])); }); return found; };
    const ours = inverses(shipped.scene), theirs = inverses(wardrobe.scene);
    assert.deepEqual([...theirs.keys()].sort(), [...ours.keys()].sort(), body);
    for (const [name, matrix] of theirs) assert.ok(matrix.elements.every((value, i) => Math.abs(value - ours.get(name).elements[i]) < 1e-5), `${body} ${name} bind`);
  }
});

// Visible triangles' vertices, by rest position to the tenth of a millimetre.
const drawnPositions = meshes => {
  const keys = new Set();
  for (const mesh of meshes) {
    const { position } = mesh.geometry.attributes, index = mesh.geometry.index;
    for (let i = 0; i < index.count; i++) { const v = index.getX(i); keys.add([position.getX(v), position.getY(v), position.getZ(v)].map(x => Math.round(x * 1e4)).join()); }
  }
  return keys;
};
test('worn from the wardrobe, the clothes a body is made in show the same skin as the shipped rig, and follow its pose', async () => {
  await withRigs(async () => {
    for (const body of Object.keys(RECIPE_BODIES)) {
      const recipe = { ...DEFAULT_RECIPE, ...bodyClothes(body), body, hairStyle: HAIRSTYLES[body] };
      const plain = await loadResidentAvatar(0, 'remote-own', body, { folk: false, recipe }), dressed = await loadResidentAvatar(0, 'remote-wardrobe', body, { folk: false, recipe });
      try {
        const skinName = Object.keys(SKIN_TEXTURES).find(name => SKIN_TEXTURES[name].body === body);
        const skins = avatar => { const found = []; avatar.rig.model.traverse(mesh => { if (mesh.isSkinnedMesh && mesh.visible && mesh.material.name.replace(/\.\d+$/, '') === skinName) found.push(mesh); }); return found; };
        const [suit] = (() => { const found = []; dressed.rig.model.traverse(mesh => { if (mesh.isSkinnedMesh && mesh.material.name.replace(/\.\d+$/, '') === RECIPE_BODIES[body].garment) found.push(mesh); }); return found; })();
        const worn = await dressFromWardrobe(dressed.rig, recipe);
        assert.deepEqual(worn, [RECIPE_BODIES[body].garment, RECIPE_BODIES[body].garment, RECIPE_BODIES[body].shoes]);
        assert.equal(suit.visible, false, `${body}: the shipped suit is hidden`);
        // MPFB deletes the same skin under the same clothes, so the skin drawn is the same.
        const before = drawnPositions(skins(plain)), after = drawnPositions(skins(dressed));
        const lost = [...before].filter(key => !after.has(key)).length, gained = [...after].filter(key => !before.has(key)).length;
        assert.ok(lost / before.size < .01 && gained / before.size < .01, `${body}: skin drawn differs (${lost} lost, ${gained} gained of ${before.size})`);
        // Posed, each wardrobe half lies on the shipped suit.
        dressed.rig.model.getObjectByName('thigh_l').rotation.x += .6; dressed.rig.model.getObjectByName('upperarm_r').rotation.z += .5;
        dressed.rig.model.updateMatrixWorld(true);
        const posed = (mesh, step) => { const out = []; for (let i = 0; i < mesh.geometry.attributes.position.count; i += step) out.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)); return out; };
        const target = posed(suit, 1);
        dressed.rig.model.traverse(mesh => {
          if (!mesh.name.endsWith('(wardrobe)') || !/suit/.test(mesh.material.name)) return;
          const worst = Math.max(...posed(mesh, 7).map(point => Math.min(...target.map(other => other.distanceTo(point)))));
          assert.ok(worst < .001, `${body} ${mesh.name}: ${(worst * 100).toFixed(1)} cm from the shipped suit`);
        });
      } finally { plain.dispose(); dressed.dispose(); }
    }
  });
});

test('wardrobe clothes swap without touching the cached wardrobe, tint by their own texture, and leave with the avatar', async () => {
  await withRigs(async () => {
    const recipe = { ...DEFAULT_RECIPE, top: 'female_sportsuit01-top', bottom: 'female_elegantsuit01-bottom', footwear: 'shoes05', outfitColor: 'navy', shoeColor: 'white' };
    const template = (await loadCharacterRig('wardrobe/woman-daywear')).scene, counts = new Map();
    const avatar = await loadResidentAvatar(0, 'remote-mix', recipe.body, { folk: false, recipe });
    const added = [];
    avatar.rig.model.traverse(mesh => { if (mesh.name.endsWith('(wardrobe)')) added.push(mesh); });
    assert.deepEqual(added.map(mesh => mesh.name).sort(), ['female_elegantsuit01-bottom (wardrobe)', 'female_sportsuit01-top (wardrobe)', 'shoes05 (wardrobe)', 'skin (wardrobe)']);
    const top = added.find(mesh => mesh.name.startsWith('female_sportsuit01'));
    assert.equal(top.material.map.name, 'female_sportsuit01-map');
    assert.ok(top.material.color.toArray().some(channel => Math.abs(channel - 1) > .05), 'the navy outfit tints the top');
    // The cached template is the test harness's own copy; avatars draw subsets of its attributes.
    template.traverse(mesh => { if (mesh.isSkinnedMesh) counts.set(mesh.name, mesh.geometry.index.count); });
    avatar.dispose();
    const after = (await loadCharacterRig('wardrobe/woman-daywear')).scene;
    after.traverse(mesh => { if (mesh.isSkinnedMesh) assert.equal(mesh.geometry.index.count, counts.get(mesh.name), mesh.name); });
  });
});
