import * as THREE from 'three';

// Residents share six rigs. Each rig now carries MPFB's face-shape targets as
// sparse morphs (build_facial_candidates.py --faces), and every resident gets a
// stable recipe of a few traits. The recipe is baked once into a per-resident
// copy of the affected positions and normals, then the face morphs are stripped,
// so a different face costs nothing per frame: the vertex shader still sees only
// the blink pair. Left/right pairs are driven together.
export const FACE_SHAPES = [
  'head-square', 'head-triangular',
  'nose-hump-incr', 'nose-scale-horiz-incr', 'nose-scale-horiz-decr', 'nose-scale-vert-incr', 'nose-point-up',
  'mouth-scale-horiz-incr', 'mouth-scale-horiz-decr', 'mouth-upperlip-volume-incr', 'mouth-lowerlip-volume-incr',
  'chin-prominent-incr', 'chin-width-incr', 'chin-width-decr', 'chin-height-incr',
  'l-cheek-bones-incr', 'r-cheek-bones-incr', 'l-cheek-volume-incr', 'r-cheek-volume-incr',
  'l-eye-scale-incr', 'r-eye-scale-incr', 'l-eye-trans-out', 'r-eye-trans-out',
  'eyebrows-trans-up', 'eyebrows-trans-down',
];
const FACE_SET = new Set(FACE_SHAPES);

// Each trait is a choice between alternatives (or none), at a weight range that
// reads as a different person without caricature.
const TRAITS = [
  { options: ['head-square', 'head-triangular', null, null], weight: [0.3, 0.55] },
  { options: ['nose-hump-incr', 'nose-point-up', null, null], weight: [0.3, 0.6] },
  { options: ['nose-scale-horiz-incr', 'nose-scale-horiz-decr', 'nose-scale-vert-incr', null], weight: [0.3, 0.6] },
  { options: ['mouth-scale-horiz-incr', 'mouth-scale-horiz-decr', null], weight: [0.3, 0.55] },
  { options: ['mouth-upperlip-volume-incr', 'mouth-lowerlip-volume-incr', null], weight: [0.3, 0.7] },
  { options: ['chin-prominent-incr', 'chin-width-incr', 'chin-width-decr', 'chin-height-incr', null], weight: [0.3, 0.6] },
  { options: [['l-cheek-bones-incr', 'r-cheek-bones-incr'], ['l-cheek-volume-incr', 'r-cheek-volume-incr'], null], weight: [0.3, 0.6] },
  { options: [['l-eye-scale-incr', 'r-eye-scale-incr'], ['l-eye-trans-out', 'r-eye-trans-out'], null], weight: [0.25, 0.5] },
  { options: ['eyebrows-trans-up', 'eyebrows-trans-down', null], weight: [0.3, 0.6] },
];

const mixed = text => { let h = [...text].reduce((hash, c) => (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0, 0); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return (h ^ (h >>> 16)) >>> 0; };

// The recipe for a resident: morph name -> weight. Stable per id; the player's
// own characters keep their authored faces.
export function residentFaceFor(id) {
  if (id == null || id === 'player' || String(id).startsWith('remote-')) return {};
  const face = {};
  TRAITS.forEach((trait, index) => {
    const roll = mixed(`face:${index}:${id}`), choice = trait.options[roll % trait.options.length];
    if (!choice) return;
    const weight = trait.weight[0] + ((roll >>> 8) % 1000) / 1000 * (trait.weight[1] - trait.weight[0]);
    for (const name of [choice].flat()) face[name] = Math.round(weight * 100) / 100;
  });
  return face;
}

// Face targets ship position deltas only. Normals are re-derived for the moved
// vertices from the faces around them; vertices split along UV seams share one
// normal (grouped by position), so no seam shows on the skin.
function recomputeNormals(geometry, moved) {
  const position = geometry.attributes.position, normal = geometry.attributes.normal, index = geometry.index;
  const affected = new Set(), triangles = index ? index.count / 3 : position.count / 3, corner = i => index ? index.getX(i) : i;
  const touching = [];
  for (let t = 0; t < triangles; t++) {
    const a = corner(t * 3), b = corner(t * 3 + 1), c = corner(t * 3 + 2);
    if (moved.has(a) || moved.has(b) || moved.has(c)) { touching.push(t); affected.add(a); affected.add(b); affected.add(c); }
  }
  const key = i => `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
  const groups = new Map();
  for (let i = 0; i < position.count; i++) { const k = key(i); const group = groups.get(k); if (group) group.push(i); else groups.set(k, [i]); }
  const sums = new Map(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), cb = new THREE.Vector3(), ab = new THREE.Vector3();
  // Every triangle around an affected vertex contributes (weighted by area), so a
  // vertex at the edge of the moved region blends into its unmoved neighbours.
  const around = new Set();
  for (let t = 0; t < triangles; t++) {
    const a = corner(t * 3), b = corner(t * 3 + 1), c = corner(t * 3 + 2);
    if (!(affected.has(a) || affected.has(b) || affected.has(c))) continue;
    pa.fromBufferAttribute(position, a); pb.fromBufferAttribute(position, b); pc.fromBufferAttribute(position, c);
    cb.subVectors(pc, pb); ab.subVectors(pa, pb); cb.cross(ab);
    for (const i of [a, b, c]) { const k = key(i); const sum = sums.get(k) ?? new THREE.Vector3(); sum.add(cb); sums.set(k, sum); around.add(k); }
  }
  for (const k of around) {
    const group = groups.get(k), sum = sums.get(k);
    if (!group || !group.some(i => affected.has(i))) continue;
    if (sum.lengthSq() === 0) continue;
    sum.normalize();
    for (const i of group) normal.setXYZ(i, sum.x, sum.y, sum.z);
  }
}

// Bake the recipe into every mesh that carries face morphs, then strip those
// morphs so the vertex shader sees only the live ones (eye blinks, speech
// shapes). Every instance is stripped, even with an empty recipe, so the posed
// shop figures carry no idle targets. Runs before eye tracking, which takes
// each eye's pivot from the baked eye mesh. Returns the geometries it made,
// which the avatar disposes.
export function bakeResidentFace(model, face = {}) {
  const names = Object.keys(face), made = [];
  model.traverse(mesh => {
    if (!mesh.isMesh || !mesh.morphTargetDictionary) return;
    const source = mesh.geometry, used = names.filter(name => mesh.morphTargetDictionary[name] !== undefined);
    if (!Object.keys(mesh.morphTargetDictionary).some(name => FACE_SET.has(name))) return;
    const geometry = new THREE.BufferGeometry();
    geometry.index = source.index;
    // Only moved attributes are copied; an untouched face shares every buffer.
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, used.length && (name === 'position' || name === 'normal') ? attribute.clone() : attribute);
    geometry.morphTargetsRelative = source.morphTargetsRelative;
    geometry.boundingBox = source.boundingBox; geometry.boundingSphere = source.boundingSphere;
    const position = geometry.attributes.position, normal = geometry.attributes.normal, moved = new Set();
    for (const name of used) {
      const index = mesh.morphTargetDictionary[name], weight = face[name], delta = source.morphAttributes.position?.[index];
      if (!delta) continue;
      for (let i = 0; i < position.count; i++) {
        const dx = delta.getX(i), dy = delta.getY(i), dz = delta.getZ(i);
        if (dx === 0 && dy === 0 && dz === 0) continue;
        position.setXYZ(i, position.getX(i) + dx * weight, position.getY(i) + dy * weight, position.getZ(i) + dz * weight);
        moved.add(i);
      }
    }
    if (moved.size) { if (normal) recomputeNormals(geometry, moved); position.needsUpdate = true; if (normal) normal.needsUpdate = true; geometry.boundingBox = null; geometry.boundingSphere = null; }
    // Keep only the non-face morphs, in their original order, so blink and speech bindings still resolve by name.
    const kept = Object.entries(mesh.morphTargetDictionary).filter(([name]) => !FACE_SET.has(name)).sort((a, b) => a[1] - b[1]);
    // An empty morph list still counts as "has morphs" to the renderer and breaks the
    // shader, so a mesh whose only morphs were face shapes gets none at all.
    if (kept.length) for (const [attribute, list] of Object.entries(source.morphAttributes)) geometry.morphAttributes[attribute] = kept.map(([, index]) => list[index]);
    // The glTF loader keeps morph names on the mesh, not on the attributes, so rebuild the dictionary by hand.
    mesh.geometry = geometry;
    mesh.morphTargetInfluences = kept.length ? kept.map(([, index]) => mesh.morphTargetInfluences?.[index] ?? 0) : undefined;
    mesh.morphTargetDictionary = kept.length ? Object.fromEntries(kept.map(([name], position) => [name, position])) : undefined;
    made.push(geometry);
  });
  if (names.length) model.userData.face = face;
  return made;
}
