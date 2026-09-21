import * as THREE from 'three';

const isHair = name => /^(bob|short|ponytail|long|afro|curly)/.test(name);
const isSkin = name => /^(young|middleage|old)_/.test(name);
const unitFits = new WeakMap();
// Used when a rig has no skinned head (test fixtures): an adult skull under short hair.
export const DEFAULT_HEAD_FIT = { skull: { top: 0.2, radius: 0.1, front: 0.11, back: -0.09, centre: [0, 0.01] }, hair: { top: 0.225, radius: 0.115, centre: [0, 0.01] } };

// Measure the skull and hair around the head joint at rest, in a world-aligned
// frame centred on the joint (y up, z forward). Skinned vertices are resolved
// through the bind pose, so the result is the rig's true shape rather than a
// guess; it is cached per source template and scaled per instance.
function measure(model) {
  const head = model.getObjectByName('head');
  if (!head) return null;
  model.updateMatrixWorld(true);
  const origin = head.getWorldPosition(new THREE.Vector3()), vertex = new THREE.Vector3();
  const skull = { top: -Infinity, radius: 0, front: -Infinity, back: Infinity, centre: [0, 0] }, hair = { top: -Infinity, radius: 0, centre: [0, 0] };
  const bounds = new Map([[skull, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }], [hair, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }]]);
  let found = false;
  model.traverse(item => {
    if (!item.isSkinnedMesh) return;
    const name = item.material?.name ?? '', target = isSkin(name) ? skull : isHair(name) ? hair : null;
    if (!target) return;
    const index = item.skeleton.bones.indexOf(head);
    if (index < 0) return;
    item.skeleton.update();
    const { position, skinIndex, skinWeight } = item.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === index) weight += skinWeight.getComponent(i, k);
      if (weight < 0.5) continue;
      vertex.fromBufferAttribute(position, i);
      item.applyBoneTransform(i, vertex).applyMatrix4(item.matrixWorld).sub(origin);
      found = true;
      if (vertex.y > target.top) target.top = vertex.y;
      if (target === skull) { if (vertex.z > skull.front) skull.front = vertex.z; if (vertex.z < skull.back) skull.back = vertex.z; }
    }
    // The upper head (where a brim or band sits) is centred on its own extents,
    // not on the joint, which sits at the back of the skull.
    const box = bounds.get(target);
    for (let i = 0; i < position.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === index) weight += skinWeight.getComponent(i, k);
      if (weight < 0.5) continue;
      vertex.fromBufferAttribute(position, i);
      item.applyBoneTransform(i, vertex).applyMatrix4(item.matrixWorld).sub(origin);
      if (vertex.y <= target.top - 0.12) continue;
      box.minX = Math.min(box.minX, vertex.x); box.maxX = Math.max(box.maxX, vertex.x); box.minZ = Math.min(box.minZ, vertex.z); box.maxZ = Math.max(box.maxZ, vertex.z);
    }
  });
  for (const target of [skull, hair]) {
    const box = bounds.get(target);
    if (!Number.isFinite(box.minX)) continue;
    target.centre = [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
    target.radius = Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2;
  }
  if (!found || !Number.isFinite(skull.top)) return null;
  if (!Number.isFinite(hair.top)) { hair.top = skull.top; hair.radius = skull.radius; hair.centre = [...skull.centre]; }
  hair.top = Math.max(hair.top, skull.top); hair.radius = Math.max(hair.radius, skull.radius);
  const scale = model.getWorldScale(new THREE.Vector3()).y || 1;
  const unit = value => value / scale;
  return { skull: { top: unit(skull.top), radius: unit(skull.radius), front: unit(skull.front), back: unit(skull.back), centre: skull.centre.map(unit) }, hair: { top: unit(hair.top), radius: unit(hair.radius), centre: hair.centre.map(unit) } };
}

export function measureHead(avatar) {
  const model = avatar.model, key = avatar.source?.scene ?? model;
  let unit = unitFits.get(key);
  if (!unit) { unit = measure(model) ?? DEFAULT_HEAD_FIT; unitFits.set(key, unit); }
  const scale = model.getWorldScale(new THREE.Vector3()).y || 1;
  const times = part => Object.fromEntries(Object.entries(part).map(([k, v]) => [k, Array.isArray(v) ? v.map(n => n * scale) : v * scale]));
  return { skull: times(unit.skull), hair: times(unit.hair) };
}
