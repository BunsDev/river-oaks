import * as THREE from 'three';
import { bodyClothes } from './character-recipe.js';
import { createAssetGLTFLoader } from './gltf-image-decoder.js';
import { stabilizeShoeSoles } from './shoe-skinning.js';

// The wardrobe (scripts/build_character_wardrobe.py) dresses a recipe's body in
// clothes it was not made in. Each body's wardrobe GLB is fitted to that very
// rig: the same skeleton and rest pose, a top and a bottom from every suit of its
// frame, every shoe pair, and the body's skin below the head with nothing deleted.
// Each skin vertex's `_cover` bits name the garments that hide it, as MPFB
// deletes the skin under a garment. Worn, the shipped head stays (it carries the
// face targets) and the wardrobe skin replaces the rest of the body.
// Garment textures are shared by every body and fetched on first wear. Means are
// the sRGB mean of each diffuse map's opaque texels, for tinting by gain.
export const WARDROBE_MATERIALS = Object.freeze({
  female_casualsuit01: { mean: [118, 138, 161], normalMap: true },
  female_casualsuit02: { mean: [128, 143, 168], normalMap: true },
  female_elegantsuit01: { mean: [69, 64, 62], normalMap: true },
  female_sportsuit01: { mean: [113, 125, 141], normalMap: true },
  male_casualsuit01: { mean: [63, 74, 96], normalMap: true },
  male_casualsuit02: { mean: [55, 90, 134], normalMap: true },
  male_casualsuit03: { mean: [45, 46, 56], normalMap: true },
  male_casualsuit04: { mean: [63, 95, 123], normalMap: true },
  male_casualsuit05: { mean: [30, 34, 38], normalMap: true },
  male_casualsuit06: { mean: [168, 177, 184], normalMap: true },
  male_elegantsuit01: { mean: [39, 39, 39], normalMap: false },
  male_worksuit01: { mean: [66, 86, 116], normalMap: true },
  shoes01: { mean: [98, 62, 44], normalMap: true },
  shoes02: { mean: [62, 60, 57], normalMap: false },
  shoes03: { mean: [8, 7, 8], normalMap: false },
  shoes04: { mean: [33, 33, 34], normalMap: true },
  shoes05: { mean: [62, 60, 61], normalMap: false },
  shoes06: { mean: [52, 55, 63], normalMap: false },
});
const ROOT = '/assets/characters/wardrobe';
const loader = createAssetGLTFLoader();
const wardrobes = new Map(), textures = new Map();
const named = material => (material?.name ?? '').replace(/\.\d+$/, '');
export const wardrobeMaterialOf = garment => garment.replace(/-(top|bottom)$/, '');

// Whether a recipe wears anything its body was not made in.
export function wearsWardrobe(recipe) {
  const own = bodyClothes(recipe.body);
  return recipe.top !== own.top || recipe.bottom !== own.bottom || recipe.footwear !== own.footwear;
}

function wardrobe(body) {
  if (!wardrobes.has(body)) {
    const promise = loader.loadAsync(`${ROOT}/${body}.glb`).then(gltf => {
      const meshes = new Map();
      gltf.scene.traverse(mesh => { if (mesh.isSkinnedMesh) meshes.set(mesh.name, mesh); });
      if (!meshes.has('skin')) throw new Error(`Wardrobe without skin: ${body}`);
      return { meshes, remapped: new WeakMap() };
    }).catch(error => { wardrobes.delete(body); throw error; });
    wardrobes.set(body, promise);
  }
  return wardrobes.get(body);
}

function texture(path, color) {
  if (!textures.has(path)) {
    const promise = new THREE.TextureLoader().loadAsync(`${ROOT}/textures/${path}`).then(map => {
      // glTF UVs: no flip.
      map.flipY = false; map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; map.anisotropy = 4; map.needsUpdate = true;
      return map;
    }).catch(error => { textures.delete(path); throw error; });
    textures.set(path, promise);
  }
  return textures.get(path);
}

// The wardrobe mesh's joints as indices into the avatar's skeleton, by bone
// name. The same body's rigs share bone order, so it is computed once per pair.
function skinIndexFor(entry, mesh, skeleton) {
  let byMesh = entry.remapped.get(skeleton.bones[0]);
  if (!byMesh) entry.remapped.set(skeleton.bones[0], byMesh = new Map());
  if (byMesh.has(mesh)) return byMesh.get(mesh);
  const index = new Map(skeleton.bones.map((bone, i) => [bone.name, i])), source = mesh.geometry.attributes.skinIndex;
  const joints = mesh.skeleton.bones.map(bone => index.get(bone.name));
  if (joints.some(joint => joint === undefined)) throw new Error('Wardrobe bone missing from the avatar');
  const remapped = new Uint16Array(source.count * 4);
  for (let i = 0; i < source.count; i++) for (let k = 0; k < 4; k++) remapped[i * 4 + k] = joints[source.getComponent(i, k)];
  const attribute = new THREE.BufferAttribute(remapped, 4);
  byMesh.set(mesh, attribute);
  return attribute;
}

// A geometry over `source`'s attributes drawing only the triangles `keep` accepts.
function subset(source, keep) {
  const geometry = new THREE.BufferGeometry(), index = source.index, kept = [];
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.morphAttributes = source.morphAttributes; geometry.morphTargetsRelative = source.morphTargetsRelative;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (keep(a, b, c)) kept.push(a, b, c);
  }
  geometry.setIndex(kept);
  return geometry;
}

// Dresses `avatar` (an instance of the recipe's body) from its wardrobe, before
// the recipe's colours are applied. Returns the worn garment material names.
export async function dressFromWardrobe(avatar, recipe) {
  const entry = await wardrobe(recipe.body), worn = [recipe.top, recipe.bottom, recipe.footwear];
  const pieces = worn.map(name => entry.meshes.get(name));
  if (pieces.some(piece => !piece)) throw new Error('Garment missing from the wardrobe');
  const maps = await Promise.all(worn.map(async name => {
    const id = wardrobeMaterialOf(name), info = WARDROBE_MATERIALS[id];
    return { map: await texture(`${id}-map.webp`, true), normalMap: info.normalMap ? await texture(`${id}-normalMap.webp`, false) : null };
  }));
  // The shipped body wears the same skin material as the wardrobe's skin.
  const skinName = named(entry.meshes.get('skin').material);
  let body = null, head = -1;
  const shipped = [];
  avatar.model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const name = named(mesh.material);
    if (name === skinName) body = mesh;
    else if (/suit\d|^shoes\d/.test(name)) shipped.push(mesh);
  });
  if (!body) throw new Error('Recipe body mesh not found');
  head = body.skeleton.bones.findIndex(bone => bone.name === 'head');
  const owned = [], added = [];
  // The shipped body keeps only the head: every triangle touching a vertex mostly
  // weighted to the head bone (the wardrobe skin holds every other triangle).
  const { skinIndex, skinWeight } = body.geometry.attributes, isHead = new Uint8Array(skinIndex.count);
  for (let i = 0; i < skinIndex.count; i++) {
    let best = 0, bone = -1;
    for (let k = 0; k < 4; k++) if (skinWeight.getComponent(i, k) > best) { best = skinWeight.getComponent(i, k); bone = skinIndex.getComponent(i, k); }
    isHead[i] = bone === head;
  }
  const headOnly = subset(body.geometry, (a, b, c) => isHead[a] || isHead[b] || isHead[c]);
  owned.push(headOnly); body.geometry = headOnly;
  for (const mesh of shipped) mesh.visible = false;
  const cover = worn.reduce((bits, name) => bits | 2 ** entry.meshes.get(name).userData.wardrobeSlot, 0);
  const place = (piece, geometry, material) => {
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = `${piece.name} (wardrobe)`; mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.userData.localId = avatar.model.userData.localId;
    mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale);
    body.parent.add(mesh); mesh.bind(body.skeleton, body.bindMatrix); added.push(mesh);
    return mesh;
  };
  // The skin below the head, less what the worn garments cover; it wears the body's own material.
  const skin = entry.meshes.get('skin'), covered = skin.geometry.attributes._cover;
  const hidden = i => (covered.getX(i) & cover) !== 0;
  const skinGeometry = subset(skin.geometry, (a, b, c) => !hidden(a) && !hidden(b) && !hidden(c));
  skinGeometry.setAttribute('skinIndex', skinIndexFor(entry, skin, body.skeleton)); owned.push(skinGeometry);
  place(skin, skinGeometry, body.material);
  pieces.forEach((piece, i) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(piece.geometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(piece.geometry.index); geometry.setAttribute('skinIndex', skinIndexFor(entry, piece, body.skeleton)); owned.push(geometry);
    const material = new THREE.MeshStandardMaterial({ name: wardrobeMaterialOf(worn[i]), map: maps[i].map, normalMap: maps[i].normalMap, roughness: .88, metalness: 0, alphaTest: .4 });
    // glTF's normal scale (0.55, as the shipped garments) with three's tangent-free y flip.
    if (material.normalMap) material.normalScale.set(.55, -.55);
    material.envMapIntensity = .8;
    // A bottom draws just behind a top where the two overlap at the waist.
    if (piece.name.endsWith('-bottom')) { material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1; }
    const mesh = place(piece, geometry, material);
    avatar.materials.set(piece.material, material);
    if (/^shoes\d/.test(material.name)) for (const resoled of stabilizeShoeSoles(mesh)) owned.push(resoled);
  });
  const dispose = avatar.dispose;
  avatar.dispose = () => { for (const geometry of owned) geometry.dispose(); dispose.call(avatar); };
  avatar.model.userData.wardrobe = worn;
  return worn.map(wardrobeMaterialOf);
}
