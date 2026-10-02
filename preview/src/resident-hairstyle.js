import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { measureHead } from './head-fit.js';

// Residents share six rigs, each with one authored hairstyle. A hairstyle can
// move between rigs: the donor's hair is resolved through its bind pose into a
// world-aligned frame on the head joint (the frame head-fit.js measures in),
// refitted from the donor's skull to the recipient's by their measured width,
// depth and height, and skinned to the recipient's skeleton with the donor's own
// weights (matched by bone name). Like the authored hair, it bends with the head,
// neck and upper back, so a ponytail stays on the back when the head nods.
export const HAIRSTYLES = { 'woman-casual': 'bob01', 'man-casual': 'short01', 'woman-tailored': 'bob02', 'man-tailored': 'short04', 'woman-daywear': 'ponytail01', 'man-workwear': 'short02' };
const isHair = name => /^(bob|short|ponytail|long|afro|curly)/.test(name);
// Hair sits a little proud of the scalp it is refitted to, so no skin shows through.
const CLEARANCE = 1.03;

const baked = new WeakMap();
// The donor's hair, once per template, in its head frame plus its skull measurements.
function bake(source) {
  if (baked.has(source)) return baked.get(source);
  const model = cloneSkinned(source.scene);
  model.updateMatrixWorld(true);
  const head = model.getObjectByName('head');
  const fit = measureHead({ model, source: { scene: source.scene } });
  const origin = head.getWorldPosition(new THREE.Vector3()), vertex = new THREE.Vector3();
  const parts = [];
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh || !isHair(mesh.material?.name ?? '')) return;
    mesh.skeleton.update();
    const { position } = mesh.geometry.attributes, points = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      mesh.applyBoneTransform(i, vertex).applyMatrix4(mesh.matrixWorld).sub(origin).toArray(points, i * 3);
    }
    parts.push({ points, geometry: mesh.geometry, material: mesh.material, bones: mesh.skeleton.bones.map(bone => bone.name) });
  });
  const result = parts.length ? { parts, fit } : null;
  baked.set(source, result);
  return result;
}

// Replace the avatar's own hair with the donor template's hairstyle.
// Returns the new hair material(s), already registered for styling and disposal.
export function transplantHairstyle(avatar, donor) {
  const style = bake(donor), head = avatar.model.getObjectByName('head');
  if (!style || !head) return null;
  avatar.model.updateMatrixWorld(true);
  const target = measureHead(avatar), from = style.fit.skull, to = target.skull;
  // Width, depth and height ratios between the two skulls, measured the same way.
  const sx = to.radius / from.radius * CLEARANCE, sz = (to.front - to.back) / (from.front - from.back) * CLEARANCE, sy = to.top / from.top * CLEARANCE;
  // The recipient's own hair (or any skinned part) supplies the skeleton, bind
  // matrix and parent the fitted hair is bound with.
  let anchor = null, fallback = null;
  avatar.model.traverse(mesh => { if (!mesh.isSkinnedMesh) return; if (isHair(mesh.material?.name ?? '')) anchor ??= mesh; else fallback ??= mesh; });
  anchor ??= fallback;
  if (!anchor) return null;
  const skeleton = anchor.skeleton, boneIndex = new Map(skeleton.bones.map((bone, index) => [bone.name, index])), headIndex = boneIndex.get('head');
  skeleton.update();
  const origin = head.getWorldPosition(new THREE.Vector3()), point = new THREE.Vector3();
  const boneMatrices = skeleton.bones.map((bone, index) => new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, skeleton.boneInverses[index]));
  const unbind = anchor.bindMatrix.clone().invert(), blend = new THREE.Matrix4(), weighted = new THREE.Matrix4();
  const owned = [], added = [];
  for (const part of style.parts) {
    const count = part.points.length / 3, positions = new Float32Array(count * 3);
    const donorIndex = part.geometry.attributes.skinIndex, donorWeight = part.geometry.attributes.skinWeight;
    const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // Weights carry over by bone name; a bone the recipient lacks falls to the head.
      blend.elements.fill(0);
      for (let k = 0; k < 4; k++) {
        const weight = donorWeight.getComponent(i, k), index = boneIndex.get(part.bones[donorIndex.getComponent(i, k)]) ?? headIndex;
        skinIndex[i * 4 + k] = index; skinWeight[i * 4 + k] = weight;
        if (weight) { weighted.copy(boneMatrices[index]).multiplyScalar(weight); for (let e = 0; e < 16; e++) blend.elements[e] += weighted.elements[e]; }
      }
      const x = part.points[i * 3], y = part.points[i * 3 + 1], z = part.points[i * 3 + 2];
      // Skinning maps bind space to world as blend * bindMatrix; invert it so the
      // vertex lands on its refitted position in the current (rest) pose.
      point.set((x - from.centre[0]) * sx + to.centre[0], y * sy, (z - from.centre[1]) * sz + to.centre[1]).add(origin)
        .applyMatrix4(blend.invert()).applyMatrix4(unbind).toArray(positions, i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    for (const name of ['uv', 'normal']) if (part.geometry.attributes[name]) geometry.setAttribute(name, part.geometry.attributes[name].clone());
    if (part.geometry.index) geometry.setIndex(part.geometry.index.clone());
    // Normals follow the refitted surface, not the donor's.
    geometry.computeVertexNormals();
    // The same adaptation instantiateAvatar gives every material: cutout hair, two-sided.
    const material = part.material.clone();
    material.envMapIntensity = 0.8;
    if (material.transparent) { material.alphaTest = 0.4; material.transparent = false; material.depthWrite = true; material.side = THREE.DoubleSide; }
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = `${part.material.name} (fitted)`;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.localId = avatar.model.userData.localId;
    mesh.position.copy(anchor.position); mesh.quaternion.copy(anchor.quaternion); mesh.scale.copy(anchor.scale);
    anchor.parent.add(mesh);
    mesh.bind(skeleton, anchor.bindMatrix);
    avatar.materials.set(part.material, material);
    owned.push(geometry); added.push(mesh);
  }
  avatar.model.traverse(mesh => { if (mesh.isSkinnedMesh && isHair(mesh.material?.name ?? '') && !added.includes(mesh)) mesh.visible = false; });
  const dispose = avatar.dispose;
  avatar.dispose = () => { for (const geometry of owned) geometry.dispose(); dispose.call(avatar); };
  avatar.model.userData.hairstyle = style.parts[0].material.name;
  return added.map(mesh => mesh.material);
}

// About half the residents wear their rig's own hairstyle; the rest wear one of
// the other five. Stable per resident; ids are bit-mixed so neighbours differ.
const PROFILES = Object.keys(HAIRSTYLES);
const mixed = text => { let h = [...text].reduce((hash, c) => (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0, 0); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return (h ^ (h >>> 16)) >>> 0; };
export function residentHairstyleFor(id, profile) {
  if (!HAIRSTYLES[profile] || id == null) return null;
  const roll = mixed(`style:${id}`), others = PROFILES.filter(other => other !== profile);
  return roll % 2 ? others[(roll >>> 1) % others.length] : null;
}

// Give a resident their hairstyle; call before styling so the new hair is tinted too.
export async function applyResidentHairstyle(avatar, id, profile, loadTemplate) {
  const donor = residentHairstyleFor(id, profile);
  if (!donor) return null;
  transplantHairstyle(avatar, await loadTemplate(donor));
  return donor;
}
