import * as THREE from 'three';

// Jevica's tailored look from Val's 2026-10-29 reference
// (public/assets/characters/references/jevica-pink-suit-20261029.png): an
// iridescent pink satin blazer with rose-gold vine piping over a high-collared
// pale pink blouse, slim satin trousers with a front crease, a short peplum,
// pink pumps on a slim rose-gold heel, lily clusters at the temples, flower-drop
// earrings and espresso-to-rose ombré waves. Every garment is procedural over
// the shipped CC0 hero rig: the blazer and trousers are offset shells of her
// own skin, skinned to her skeleton, so they follow every pose the body takes.
// Shared template geometry and textures are never mutated; the caller owns and
// disposes everything created here.

export const SUIT = Object.freeze({
  satin: '#f29bc0', satinSheen: '#ffd6e6', roseGold: '#d9a07a', blouse: '#f6d0dc', shoe: '#ee86b4',
  hairRoot: '#1a0d0a', hairEnd: '#e8a0bf', petal: '#f3a8c6', petalTip: '#fff1e8', stamen: '#e6b35a',
});
// Offsets in the rig's own metres (its bind pose stands 1.55 m).
// The hem falls just below the hips (pelvis joint less hemBelow), where the peplum flares from.
const BLAZER = { torso: .016, arm: .008, hemBelow: .03, buttonAbove: .035, slope: .30, neckWidth: .015 };
const TROUSERS = { offset: .005, waistY: 1.075 };

const weightsOf = (body, test) => {
  const bones = new Set(body.skeleton.bones.flatMap((bone, i) => test.test(bone.name) ? [i] : []));
  const { skinIndex, skinWeight } = body.geometry.attributes, out = new Float32Array(skinIndex.count);
  for (let i = 0; i < skinIndex.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (bones.has(skinIndex.getComponent(i, k))) w += skinWeight.getComponent(i, k); out[i] = w; }
  return out;
};

// Rest-pose vertex positions of the skin in the mesh's own frame.
export function restPositions(body) {
  body.skeleton.update();
  const count = body.geometry.attributes.position.count, out = new Float32Array(count * 3), p = new THREE.Vector3();
  for (let i = 0; i < count; i++) { body.getVertexPosition(i, p); out.set([p.x, p.y, p.z], i * 3); }
  return out;
}

// Radial profile of a vertex set around a vertical axis: the largest radius per
// angle sector, for sewn pieces (collar, peplum) that must sit outside the skin.
export function radialProfile(points, indices, { centre = [0, 0], sectors = 48 } = {}) {
  const radii = new Float32Array(sectors);
  for (const i of indices) {
    const x = points[i * 3] - centre[0], z = points[i * 3 + 2] - centre[1];
    const a = ((Math.round(Math.atan2(x, z) / (Math.PI * 2) * sectors) % sectors) + sectors) % sectors;
    radii[a] = Math.max(radii[a], Math.hypot(x, z));
  }
  for (let pass = 0; pass < 3; pass++) for (let a = 0; a < sectors; a++) if (!radii[a]) radii[a] = Math.max(radii[(a + 1) % sectors], radii[(a + sectors - 1) % sectors]);
  return { sectors, radii, at: angle => radii[((Math.round(angle / (Math.PI * 2) * sectors) % sectors) + sectors) % sectors], max: Math.max(...radii) };
}

// A garment cut from the skin: the triangles touching `keep` vertices, pushed
// `offset(i)` along the bind normals and skinned with the skin's own weights.
export function createSkinShell(body, { name, keep, offset, material, attributes = {} }) {
  const geometry = body.geometry.clone(), p = geometry.attributes.position, n = geometry.attributes.normal;
  const indices = geometry.index?.array ?? Array.from({ length: p.count }, (_, i) => i), covered = [], used = new Set();
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
    if (triangle.some(keep)) { covered.push(...triangle); triangle.forEach(v => used.add(v)); }
  }
  geometry.setIndex(covered); geometry.clearGroups();
  for (const i of used) { const d = offset(i); p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d); }
  for (const [key, array] of Object.entries(attributes)) geometry.setAttribute(key, new THREE.BufferAttribute(array, 1));
  p.needsUpdate = true; geometry.computeBoundingSphere();
  const mesh = new THREE.SkinnedMesh(geometry, material); mesh.name = name;
  mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale);
  // bind() derives its inverse from the bind matrix; in 'attached' mode the skin's inverse is
  // its world matrix's, refreshed only by updateMatrixWorld. Start from the skin's own.
  mesh.bindMode = body.bindMode; mesh.bind(body.skeleton, body.bindMatrix); mesh.bindMatrixInverse.copy(body.bindMatrixInverse);
  mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true;
  body.parent.add(mesh);
  return { mesh, geometry, covered: used };
}

// Tailored cloth bridges the hollows a skin shell would copy (between and under
// the bust): Laplacian-smooth the front of the shell, then push any vertex that
// fell inside its minimum offset back out along the skin normal. Vertices split
// at UV seams move together.
function smoothFront({ geometry, covered }, body, eligible, minimum, iterations = 12) {
  const p = geometry.attributes.position, skin = body.geometry.attributes.position, n = body.geometry.attributes.normal, index = geometry.index.array;
  const key = i => `${skin.getX(i).toFixed(4)},${skin.getY(i).toFixed(4)},${skin.getZ(i).toFixed(4)}`;
  const groups = new Map(); for (const i of covered) { const k = key(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  const neighbours = new Map();
  for (let t = 0; t < index.length; t += 3) for (let a = 0; a < 3; a++) {
    const i = index[t + a]; if (!eligible(i)) continue;
    if (!neighbours.has(i)) neighbours.set(i, new Set());
    for (let b = 0; b < 3; b++) if (b !== a) neighbours.get(i).add(index[t + b]);
  }
  const next = new Float32Array(p.count * 3);
  for (let pass = 0; pass < iterations; pass++) {
    for (const [i, set] of neighbours) {
      let x = 0, y = 0, z = 0; for (const j of set) { x += p.getX(j); y += p.getY(j); z += p.getZ(j); }
      next.set([x / set.size, y / set.size, z / set.size], i * 3);
    }
    for (const i of neighbours.keys()) {
      let [x, y, z] = [next[i * 3], next[i * 3 + 1], next[i * 3 + 2]];
      // Never tighter than the garment's offset, and never pulled in toward the skin.
      const d = (x - skin.getX(i)) * n.getX(i) + (y - skin.getY(i)) * n.getY(i) + (z - skin.getZ(i)) * n.getZ(i), need = minimum(i) - d;
      if (need > 0) { x += n.getX(i) * need; y += n.getY(i) * need; z += n.getZ(i) * need; }
      for (const j of groups.get(key(i))) p.setXYZ(j, x, y, z);
    }
  }
  p.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
}

// Tailoring: a blazer front does not follow the body into its hollows. Across each half of
// the front (the V splits it) the cloth spans the upper convex hull of the body's horizontal
// profile, and down each column it hangs on the hull of the vertical one, so it falls
// straight from the bust to the button instead of tucking under it. Only depth (z) changes,
// only outward, approaching `reach` softly and scaled by `weight` (1 inside the panel, fading
// to 0 at its sides) so it meets the untailored cloth without a ledge. Returns the deepest
// lift, in metres.
export function upperHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0]), hull = [];
  for (const point of sorted) {
    while (hull.length >= 2) {
      const [a, b] = [hull.at(-2), hull.at(-1)];
      if ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= 0) hull.pop(); else break;
    }
    hull.push(point);
  }
  return u => {
    if (u <= hull[0][0]) return hull[0][1];
    for (let k = 1; k < hull.length; k++) if (u <= hull[k][0]) { const [a, b] = [hull[k - 1], hull[k]]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0] || 1); }
    return hull.at(-1)[1];
  };
}
export function tailorFront(geometry, front, { bin = .01, reach = .03, weight = () => 1 } = {}) {
  const p = geometry.attributes.position, ids = [...front];
  if (!ids.length) return 0;
  const groupBy = keyOf => { const groups = new Map(); for (const i of ids) { const k = keyOf(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); } return groups; };
  const target = new Map(ids.map(i => [i, p.getZ(i)]));
  // Horizontal: per 1 cm row and per side of the V.
  for (const group of groupBy(i => `${Math.round(p.getY(i) / bin)}${p.getX(i) > 0 ? 'l' : 'r'}`).values()) {
    if (group.length < 3) continue;
    const hull = upperHull(group.map(i => [p.getX(i), p.getZ(i)]));
    for (const i of group) target.set(i, Math.max(target.get(i), hull(p.getX(i))));
  }
  // Vertical: per 1 cm column, from the collar down to the button.
  for (const group of groupBy(i => Math.round(p.getX(i) / bin)).values()) {
    if (group.length < 3) continue;
    const hull = upperHull(group.map(i => [p.getY(i), p.getZ(i)]));
    for (const i of group) target.set(i, Math.max(target.get(i), hull(p.getY(i))));
  }
  let deepest = 0;
  for (const i of ids) { const lift = reach * Math.tanh((target.get(i) - p.getZ(i)) / reach) * weight(i); deepest = Math.max(deepest, lift); p.setZ(i, p.getZ(i) + lift); }
  p.needsUpdate = true;
  return deepest;
}

// Satin that turns rose-gold where a `piping` vertex attribute says so, without
// a second material or draw call. Iridescence gives the pink its pearl shift.
export function satinMaterial({ piping = false, iridescence = .75, color = SUIT.satin, roughness = .36 } = {}) {
  const material = new THREE.MeshPhysicalMaterial({ color, roughness, metalness: .05, clearcoat: .3, clearcoatRoughness: .25,
    sheen: .8, sheenColor: new THREE.Color(SUIT.satinSheen), sheenRoughness: .45, iridescence, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 420], side: THREE.DoubleSide });
  if (piping) {
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float piping;varying float vPiping;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPiping=piping;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPiping;')
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.85,.627,.478),vPiping);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.28,vPiping);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.9,vPiping);');
    };
    material.customProgramCacheKey = () => 'jevica-satin-piping-v1';
  }
  return material;
}

// A five-petal flower: flattened petals grading pink to cream at their tips
// around a gold stamen. `radius` is the petal reach.
export function createFlower(radius, { petals = 5, petalMaterial, stamenMaterial, owned }) {
  const group = new THREE.Group(); group.name = 'Jevica flower';
  const petal = new THREE.SphereGeometry(1, 10, 7); owned.add(petal);
  const colors = new Float32Array(petal.attributes.position.count * 3), base = new THREE.Color(SUIT.petal), tip = new THREE.Color(SUIT.petalTip), shade = new THREE.Color();
  for (let i = 0; i < petal.attributes.position.count; i++) { shade.copy(base).lerp(tip, Math.max(0, petal.attributes.position.getZ(i))); colors.set([shade.r, shade.g, shade.b], i * 3); }
  petal.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  for (let i = 0; i < petals; i++) {
    const mesh = new THREE.Mesh(petal, petalMaterial), angle = i / petals * Math.PI * 2;
    mesh.scale.set(radius * .42, radius * .14, radius * .62); mesh.position.set(Math.sin(angle) * radius * .5, radius * .06, Math.cos(angle) * radius * .5);
    mesh.rotation.set(-.35, angle, 0, 'YXZ'); mesh.castShadow = true; group.add(mesh);
  }
  const stamen = new THREE.SphereGeometry(radius * .22, 8, 6); owned.add(stamen);
  const centre = new THREE.Mesh(stamen, stamenMaterial); centre.position.y = radius * .12; group.add(centre);
  return group;
}

// Cut, sew and pin the whole look. `attach(bone)` returns the costume's bone
// group; `mesh(group, geometry, material, position)` adds a rigid piece to it.
export function createJevicaSuit(avatar, { surface, owned, attach, mesh }) {
  const { model } = avatar.rig, root = avatar.object;
  const body = model.getObjectByName('Jevica');
  const satin = satinMaterial({ piping: true }); satin.name = 'Jevica satin suit'; owned.add(satin);
  const blouse = surface({ color: SUIT.blouse, roughness: .42, metalness: .04, sheen: .6, sheenColor: new THREE.Color('#fff3f7'), sheenRoughness: .5, side: THREE.DoubleSide }); blouse.name = 'Jevica satin blouse';
  const roseGold = surface({ color: SUIT.roseGold, metalness: .9, roughness: .26, clearcoat: .3 }); roseGold.name = 'Jevica rose gold';
  const petal = surface({ color: '#ffffff', vertexColors: true, roughness: .55, sheen: .5, sheenColor: new THREE.Color('#ffd7e3'), side: THREE.DoubleSide }); petal.name = 'Jevica lily petals';
  const stamen = surface({ color: SUIT.stamen, metalness: .6, roughness: .4 });
  const pieces = { blazer: null, trousers: null, peplum: null, collar: null, lapels: [], flowers: [], earrings: [], heels: [], waist: null };
  model.updateMatrixWorld(true); root.updateMatrixWorld(true);
  const toRoot = point => root.worldToLocal(body ? body.localToWorld(point.clone()) : point.clone());
  const boneRest = name => root.worldToLocal(model.getObjectByName(name).getWorldPosition(new THREE.Vector3()));
  const unit = model.getWorldScale(new THREE.Vector3()).y;

  if (body?.isSkinnedMesh) {
    const rest = restPositions(body), count = rest.length / 3;
    const restAt = (i, out = new THREE.Vector3()) => out.set(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
    const localBone = name => body.worldToLocal(model.getObjectByName(name).getWorldPosition(new THREE.Vector3()));
    const torso = weightsOf(body, /^(spine_02|spine_03|clavicle_)/), arms = weightsOf(body, /^(upperarm_|lowerarm_)/);
    const hands = weightsOf(body, /^(hand_|thumb_|index_|middle_|ring_|pinky_)/), neck = weightsOf(body, /^(neck_01|head)$/), throat = weightsOf(body, /^neck_01$/);
    const lower = weightsOf(body, /^(pelvis|spine_01|thigh_|calf_|foot_|ball_)/);
    const waist = localBone('spine_02'), hemY = localBone('pelvis').y - BLAZER.hemBelow, buttonY = waist.y + BLAZER.buttonAbove, collarY = localBone('clavicle_l').y;
    const wrists = ['hand_l', 'hand_r'].map(localBone);
    // The blazer: torso and sleeves, open in a V from the button to the collar, cut at the wrists and the hem.
    const inV = (x, y, z) => z > .01 && y > buttonY && Math.abs(x) < BLAZER.neckWidth + (y - buttonY) * BLAZER.slope;
    const piping = new Float32Array(count);
    const blazerKeep = i => {
      const [x, y, z] = [rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]];
      // Torso and sleeves above the hem; below the waist it also takes the hips, whatever joint weights them.
      return (torso[i] + arms[i] >= .5 || lower[i] >= .5) && hands[i] < .75 && neck[i] < .3 && y >= hemY && !inV(x, y, z);
    };
    for (let i = 0; i < count; i++) {
      if (!blazerKeep(i)) continue;
      const [x, y, z] = [rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]];
      // Rose-gold piping: the V edges, the hem band, the cuffs and a vine spiralling down each sleeve.
      const edge = z > .01 && y > buttonY ? Math.abs(Math.abs(x) - (BLAZER.neckWidth + (y - buttonY) * BLAZER.slope)) : 1;
      const hem = y - hemY, cuff = Math.min(...wrists.map(w => Math.hypot(x - w.x, y - w.y, z - w.z)));
      let mask = Math.max(1 - edge / .009, 1 - Math.abs(hem - .012) / .006, 1 - Math.abs(cuff - .055) / .007);
      if (arms[i] > .6 && torso[i] < .2) {
        const shoulder = localBone(x > 0 ? 'upperarm_l' : 'upperarm_r'), wrist = x > 0 ? wrists[0] : wrists[1];
        const axis = wrist.clone().sub(shoulder), t = THREE.MathUtils.clamp(new THREE.Vector3(x, y, z).sub(shoulder).dot(axis) / axis.lengthSq(), 0, 1);
        const radial = new THREE.Vector3(x, y, z).sub(shoulder).addScaledVector(axis, -t), angle = Math.atan2(radial.y, radial.z);
        mask = Math.max(mask, 1 - Math.abs(Math.sin(angle * 1.5 + t * 9)) / .14 * (t > .12 && t < .88 ? 1 : 10));
      }
      piping[i] = THREE.MathUtils.clamp(mask, 0, 1);
    }
    pieces.blazer = createSkinShell(body, { name: 'Jevica satin blazer', keep: blazerKeep, material: satin, attributes: { piping },
      offset: i => arms[i] > .5 ? BLAZER.arm : BLAZER.torso });
    owned.add(pieces.blazer.geometry);
    const frontPanel = i => torso[i] > .5 && rest[i * 3 + 2] > 0 && rest[i * 3 + 1] > hemY + .05 && rest[i * 3 + 1] < collarY - .02;
    smoothFront(pieces.blazer, body, frontPanel, i => arms[i] > .5 ? BLAZER.arm : BLAZER.torso);
    {
      // From the collar to the button the front hangs on its hulls, then the seams are blended.
      const tailored = new Set([...pieces.blazer.covered].filter(i => frontPanel(i) && arms[i] < .3 && rest[i * 3 + 1] > buttonY - .02));
      const smooth = (a, b, v) => THREE.MathUtils.smoothstep(v, a, b);
      const weight = i => smooth(.5, .9, torso[i]) * (1 - smooth(0, .3, arms[i])) * smooth(buttonY - .02, buttonY, rest[i * 3 + 1]);
      pieces.blazer.tailoredDepth = tailorFront(pieces.blazer.geometry, tailored, { weight });
      smoothFront(pieces.blazer, body, frontPanel, i => arms[i] > .5 ? BLAZER.arm : BLAZER.torso, 8);
    }
    // The trousers: the lower body below the waist, with a front crease pressed down each leg.
    const crease = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const [x, y, z] = [rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]];
      if (lower[i] < .5 || y > TROUSERS.waistY - .12) continue;
      const thigh = localBone(x > 0 ? 'thigh_l' : 'thigh_r'), calf = localBone(x > 0 ? 'calf_l' : 'calf_r');
      const t = THREE.MathUtils.clamp((thigh.y - y) / (thigh.y - calf.y + .35), 0, 1), legX = THREE.MathUtils.lerp(thigh.x, calf.x + (calf.x - thigh.x) * .6, t);
      if (z > thigh.z + .02) crease[i] = THREE.MathUtils.clamp(1 - Math.abs(x - legX) / .012, 0, 1);
    }
    pieces.trousers = createSkinShell(body, { name: 'Jevica satin trousers', keep: i => lower[i] > .5 && rest[i * 3 + 1] < TROUSERS.waistY, material: satin,
      attributes: { piping: new Float32Array(count) }, offset: i => TROUSERS.offset + crease[i] * .004 });
    owned.add(pieces.trousers.geometry);
    // The peplum: a short satin flare from the waist over the hips, draped by jevica-drape.js.
    const hipIndices = [], hipCentre = localBone('spine_01');
    for (let i = 0; i < count; i++) if (lower[i] > .3 && arms[i] < .2 && hands[i] < .2 && Math.abs(rest[i * 3 + 1] - (hemY + .02)) < .03) hipIndices.push(i);
    const hips = radialProfile(rest, hipIndices, { centre: [hipCentre.x, hipCentre.z] });
    const waistGroup = attach('spine_01'), hipRadius = hips.max * unit + BLAZER.torso + .003; pieces.waist = waistGroup;
    // A short flare: from 3 cm above the hem, 10 cm long, widening by 9%.
    const top = (hemY - hipCentre.y + .03) * unit, length = .10;
    const rings = Array.from({ length: 16 }, (_, i) => { const t = i / 15; return new THREE.Vector2(hipRadius * (1 + .09 * Math.pow(t, 1.4)), top - t * length); });
    const peplum = new THREE.LatheGeometry(rings, 96), pv = peplum.attributes.position;
    for (let i = 0; i < pv.count; i++) {
      const x = pv.getX(i), z = pv.getZ(i), t = THREE.MathUtils.clamp((top - pv.getY(i)) / length, 0, 1), angle = Math.atan2(z, x);
      // Fitted to the hips sector by sector, then flaring and folding toward the hem.
      const phi = Math.atan2(x, z), radius = (hips.at(phi) * unit + BLAZER.torso + .003) * (1 + .09 * Math.pow(t, 1.4)) * (1 + (.001 + t * .006) * Math.sin(angle * 12 + t * .6));
      pv.setXYZ(i, Math.sin(phi) * radius, pv.getY(i) + Math.pow(t, 6) * .004 * Math.cos(angle * 12), Math.cos(phi) * radius);
    }
    peplum.setAttribute('piping', new THREE.BufferAttribute(Float32Array.from({ length: pv.count }, (_, i) => (top - pv.getY(i)) / length > .9 ? 1 : 0), 1));
    peplum.computeVertexNormals();
    pieces.peplum = mesh(waistGroup, peplum, satin, [0, 0, 0]);
    pieces.peplum.name = 'Jevica satin peplum'; pieces.peplum.userData.deformableCostume = true;
    // The single rose-gold button at the waist.
    const front = radialProfile(rest, Array.from({ length: count }, (_, i) => i).filter(i => torso[i] > .5 && Math.abs(rest[i * 3 + 1] - buttonY) < .02), { centre: [waist.x, waist.z] });
    const chest = attach('spine_02');
    const button = mesh(chest, new THREE.SphereGeometry(.0085, 14, 10), roseGold, [0, (buttonY - waist.y) * unit, (front.at(0) + BLAZER.torso + .004) * unit], [1, 1, .55]);
    button.name = 'Jevica blazer button';
    // Notched lapels: two ribbons folded back along the V, from the button to the collar.
    const upper = attach('spine_03'), chestOrigin = boneRest('spine_03');
    for (const side of [-1, 1]) {
      // Six columns across the lapel: the piped V edge (two columns 4 mm apart), the satin, and
      // the piped outer edge (as in the reference, so the lapel's shape reads), out to the
      // lapel's width, which peaks at the notch two thirds of the way up.
      const steps = 14, positions = [], indices = [], edge = [], columns = 6;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, y = THREE.MathUtils.lerp(buttonY, collarY - .01, t), xEdge = side * (BLAZER.neckWidth + (y - buttonY) * BLAZER.slope);
        let zFront = 0; for (let i = 0; i < count; i++) if (torso[i] > .4 && Math.abs(rest[i * 3 + 1] - y) < .012 && Math.abs(rest[i * 3] - xEdge) < .03) zFront = Math.max(zFront, rest[i * 3 + 2]);
        const width = .012 + .03 * Math.sin(Math.PI * Math.min(1, t / .7)) * (t < .7 ? 1 : .35);
        for (const [k, across] of [[0, 0], [1, .004], [2, .005], [3, width - .0045], [4, width - .0035], [5, width]]) {
          positions.push(...toRoot(new THREE.Vector3(xEdge + side * across, y, zFront + BLAZER.torso + .008 - across * .15)).sub(chestOrigin).toArray()); edge.push(k < 2 || k > 3 ? 1 : 0);
        }
        if (s < steps) for (let k = 0; k < columns - 1; k++) { const a = s * columns + k, b = a + columns; indices.push(a, a + 1, b, a + 1, b + 1, b); }
      }
      const lapel = new THREE.BufferGeometry(); lapel.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      lapel.setAttribute('piping', new THREE.Float32BufferAttribute(edge, 1)); lapel.setIndex(indices); lapel.computeVertexNormals();
      const ribbon = mesh(upper, lapel, satin, [0, 0, 0]); ribbon.name = `Jevica lapel ${side > 0 ? 'left' : 'right'}`; pieces.lapels.push(ribbon);
    }
    // The mandarin collar of the blouse, with its flower brooch at the front.
    const neckBone = localBone('neck_01'), neckIndices = [];
    for (let i = 0; i < count; i++) if (throat[i] > .6 && rest[i * 3 + 1] > neckBone.y + .01 && rest[i * 3 + 1] < neckBone.y + .05 && Math.abs(rest[i * 3]) < .07 && rest[i * 3 + 2] < neckBone.z + .08) neckIndices.push(i);
    const neckProfile = radialProfile(rest, neckIndices, { centre: [neckBone.x, neckBone.z] });
    const neckGroup = attach('neck_01'), collarPoints = [], collarIndices = [], collarEdge = [], sectors = 48;
    for (let s = 0; s <= sectors; s++) {
      const angle = s / sectors * Math.PI * 2, r = (neckProfile.at(angle) + .006) * unit;
      for (const [k, y] of [[0, .012], [1, .048]].map(([k, y]) => [k, y * unit])) { collarPoints.push(Math.sin(angle) * r * (k ? 1.04 : 1), y, Math.cos(angle) * r * (k ? 1.04 : 1)); collarEdge.push(k ? 1 : .0); }
      if (s < sectors) { const a = s * 2; collarIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const collar = new THREE.BufferGeometry(); collar.setAttribute('position', new THREE.Float32BufferAttribute(collarPoints, 3));
    collar.setAttribute('piping', new THREE.Float32BufferAttribute(collarEdge, 1)); collar.setIndex(collarIndices); collar.computeVertexNormals();
    const collarSatin = satinMaterial({ piping: true, color: SUIT.blouse, iridescence: .25, roughness: .42 }); collarSatin.name = 'Jevica collar satin'; owned.add(collarSatin);
    pieces.collar = mesh(neckGroup, collar, collarSatin, [0, 0, 0]); pieces.collar.name = 'Jevica mandarin collar';
    const brooch = createFlower(.016, { petalMaterial: petal, stamenMaterial: stamen, owned });
    brooch.name = 'Jevica collar brooch'; brooch.position.set(0, .03 * unit, (neckProfile.at(0) + .012) * unit); brooch.rotation.x = Math.PI / 2 - .2; neckGroup.add(brooch);
    // Pumps: the shoes turn glossy pink and gain a slim rose-gold heel that stays flush with the floor.
    for (const side of ['l', 'r']) {
      // The root's origin is the floor; the column runs from it to just under the ankle, behind the shoe's heel.
      const foot = attach(`foot_${side}`), origin = boneRest(`foot_${side}`), height = Math.max(.012, origin.y - .004);
      const heel = mesh(foot, new THREE.CylinderGeometry(.0065, .0045, height, 10), roseGold, [0, -origin.y + height / 2, -.05 * unit]);
      heel.name = `Jevica heel ${side}`; pieces.heels.push(heel);
    }
    // Blouse: the fitted bodice in pale satin, seen only through the blazer's V and at the collar.
    // The bodice's bind positions share the skin's frame, so the V is cut by the same rule.
    blouse.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind=position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if(!(vBind.y>${(collarY - .03).toFixed(4)}&&abs(vBind.x)<.07)&&!(vBind.z>.0&&vBind.y>${buttonY.toFixed(4)}&&abs(vBind.x)<${(BLAZER.neckWidth + .012).toFixed(4)}+(vBind.y-${buttonY.toFixed(4)})*${BLAZER.slope.toFixed(3)}))discard;`);
    };
    blouse.customProgramCacheKey = () => `jevica-blouse-v-${buttonY.toFixed(4)}-${collarY.toFixed(4)}`;
    model.traverse(item => { if (item.isMesh && item.name === 'Jevica_fitted_bodice') item.material = blouse; });
  }

  // Flowers and jewellery need only the head joint, so an empty test rig still wears them.
  const head = attach('head');
  for (const side of [-1, 1]) {
    const cluster = new THREE.Group(); cluster.name = `Jevica lily cluster ${side > 0 ? 'left' : 'right'}`;
    for (const [k, [r, dx, dy, dz]] of [[.022, 0, 0, 0], [.017, .012, .02, -.022], [.014, .008, -.012, .024]].entries()) {
      const flower = createFlower(r, { petalMaterial: petal, stamenMaterial: stamen, owned });
      flower.position.set(dx, dy, dz); flower.rotation.set(0, 0, side * (-Math.PI / 2 + .35), 'YXZ'); flower.rotation.y = k * .7; cluster.add(flower);
    }
    cluster.position.set(side * .112, .062, -.006); head.add(cluster); pieces.flowers.push(cluster);
    // Flower-drop earrings on a short chain; swing() moves them with the head.
    const earring = new THREE.Group(); earring.name = `Jevica earring ${side > 0 ? 'left' : 'right'}`; earring.position.set(side * .086, -.004, .018);
    const stud = new THREE.Mesh(new THREE.SphereGeometry(.004, 8, 6), roseGold); owned.add(stud.geometry); earring.add(stud);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(.0012, .0012, .02, 6), roseGold); owned.add(chain.geometry); chain.position.y = -.011; earring.add(chain);
    const drop = createFlower(.011, { petalMaterial: petal, stamenMaterial: stamen, owned }); drop.position.y = -.026; drop.rotation.x = Math.PI; earring.add(drop);
    head.add(earring); pieces.earrings.push({ group: earring, side, angle: new THREE.Vector2(), velocity: new THREE.Vector2() });
  }
  // Bangs: a straight fringe across the forehead, a sheet fitted to her skin a few millimetres
  // out, pinned to the head, ending just above the brows and a little longer at the sides.
  // Strands are a texture: dark roots, ragged tips cut by alpha.
  if (body) pieces.bangs = createJevicaBangs({ body, model, toRoot, boneRest, head, owned, surface });
  const headPosition = new THREE.Vector3(), lastHead = new THREE.Vector3(), lastVelocity = new THREE.Vector3(), velocity = new THREE.Vector3(), drive = new THREE.Vector3(), inverse = new THREE.Quaternion();
  let previous = null;
  return {
    pieces,
    get skirts() { return pieces.peplum ? [pieces.peplum] : []; },
    // Earrings swing as a damped pendulum driven by how the head accelerates.
    swing(now, reducedMotion = false) {
      const dt = previous === null ? 0 : Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
      head.getWorldPosition(headPosition);
      if (dt > 0) { velocity.copy(headPosition).sub(lastHead).divideScalar(dt); drive.copy(velocity).sub(lastVelocity).divideScalar(dt); lastVelocity.copy(velocity); } else drive.set(0, 0, 0);
      lastHead.copy(headPosition);
      head.getWorldQuaternion(inverse).invert(); drive.applyQuaternion(inverse);
      for (const earring of pieces.earrings) {
        const { angle, velocity: w } = earring;
        if (reducedMotion || !dt) { angle.set(0, 0); w.set(0, 0); earring.group.rotation.set(0, 0, 0); continue; }
        // A 3 cm pendulum: θ'' = -(g/L)θ - cθ' + a/L with g/L = 327 /s², c = 4 /s and the
        // head's horizontal acceleration clamped to ±4 m/s² so a teleport never whips it.
        const ax = THREE.MathUtils.clamp(-drive.z, -4, 4) * 33, az = THREE.MathUtils.clamp(drive.x, -4, 4) * 33;
        w.x += (-327 * angle.x - 4 * w.x + ax) * dt; w.y += (-327 * angle.y - 4 * w.y + az) * dt;
        angle.x = THREE.MathUtils.clamp(angle.x + w.x * dt, -.5, .5); angle.y = THREE.MathUtils.clamp(angle.y + w.y * dt, -.5, .5);
        earring.group.rotation.set(angle.x, 0, angle.y);
      }
    },
    dispose() { for (const piece of [pieces.blazer, pieces.trousers]) piece?.mesh.removeFromParent(); },
  };
}

// Espresso roots blending to rose below the ears: an `ombre` attribute (0 at
// the crown, 1 at the longest strand) on the hair's own cloned geometry. The
// blend runs from 16% to 36% of the hair's length (about the ear to the
// shoulder on her 69 cm of hair), where the reference turns pink.
// Pumps from the rig's ankle shoes (Jevica's feet end inside them at 16.5 cm, so the upper
// cannot be cut away): in bind space each shoe is slimmed and its toe tapered to a point
// below the ankle, the toe box lowered, and the upper above a pump's topline painted in the
// trouser satin with a rose-gold edge, so the hem seems to fall onto a low-cut pointed pump on
// the rose-gold heel column. The edge follows a signed distance, so it stays a clean line at
// the shoe's coarse mesh density. The top, where the shoe meets the leg, is left as it was.
export const PUMP = Object.freeze({ taperFrom: .55, point: .018, back: .072, front: .046, vampFrom: .6 });
export function shapeJevicaPumps(model, material, owned) {
  let shoe = null; model.traverse(item => { if (item.isMesh && item.material === material) shoe = item; });
  if (!shoe) return null;
  const geometry = shoe.geometry.clone(); owned.add(geometry); shoe.geometry = geometry;
  const p = geometry.attributes.position, vamp = new Float32Array(p.count), sides = {};
  for (let i = 0; i < p.count; i++) {
    const side = p.getX(i) < 0 ? 'r' : 'l', box = sides[side] ??= { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    box.x0 = Math.min(box.x0, p.getX(i)); box.x1 = Math.max(box.x1, p.getX(i)); box.z0 = Math.min(box.z0, p.getZ(i)); box.z1 = Math.max(box.z1, p.getZ(i));
  }
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) {
    const box = sides[p.getX(i) < 0 ? 'r' : 'l'], cx = (box.x0 + box.x1) / 2, half = (box.x1 - box.x0) / 2;
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (z - box.z0) / (box.z1 - box.z0), low = 1 - smooth(.11, .17, y), toe = smooth(PUMP.taperFrom, 1, t);
    const across = Math.min(1, Math.abs(x - cx) / half);
    x = cx + (x - cx) * (1 - low * (.12 + .5 * toe));
    z += low * PUMP.point * smooth(.75, 1, t) * (1 - across);
    y *= 1 - .3 * toe * smooth(.03, .09, y) * low;
    p.setXYZ(i, x, y, z);
    // Metres above the topline (heel counter to toe box); the toe box stays below it.
    const top = t < PUMP.vampFrom ? PUMP.back + (PUMP.front - PUMP.back) * t / PUMP.vampFrom : PUMP.back * 4;
    vamp[i] = y - top;
  }
  p.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.setAttribute('vamp', new THREE.BufferAttribute(vamp, 1));
  const hem = new THREE.Color(SUIT.satin), edge = new THREE.Color(SUIT.roseGold);
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float vamp;varying float vVamp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVamp=vamp;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vVamp;')
      .replace('#include <map_fragment>', `#include <map_fragment>
float above = smoothstep(0.0015, 0.004, vVamp), rim = 1.0 - smoothstep(0.0012, 0.0024, abs(vVamp));
diffuseColor.rgb = mix(mix(diffuseColor.rgb, vec3(${hem.r.toFixed(4)}, ${hem.g.toFixed(4)}, ${hem.b.toFixed(4)}), above), vec3(${edge.r.toFixed(4)}, ${edge.g.toFixed(4)}, ${edge.b.toFixed(4)}), rim * 0.9);`);
  };
  material.customProgramCacheKey = () => 'jevica-pumps-v2';
  return { sides, vamp };
}

// The ombré begins at the shoulders (fraction of the hair's height from its crown) and the
// strands below the ears stand out by up to `flare` for volume.
export const HAIR = Object.freeze({ pinkFrom: .2, pinkTo: .34, flare: .22, axisZ: .01 });
// Makeup from the reference: rose lips and a soft blush, painted as vertex colours on the
// costume's own copy of her skin (realism tiers leave vertex colours alone). Landmarks come
// from her midline profile: the nose tip is the profile's peak below the eyes, then the
// profile dips under the nose, peaks at the upper lip, dips at the mouth line and peaks at
// the lower lip. The lips are an ellipse about the mouth line, its half-width a fraction of
// half the pupils' spacing; the blush sits on each cheek, just outside the pupil line.
export const MAKEUP = Object.freeze({ lips: [1, .56, .68], blush: [1, .78, .81], mouthWidth: .78, blushRadius: .022 });
export function faceLandmarks(geometry, eyes) {
  const p = geometry.attributes.position, profile = new Map(), bin = .003;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (Math.abs(p.getX(i)) > .004 || y > eyes.y || y < eyes.y - .14) continue;
    const k = Math.round(y / bin); profile.set(k, Math.max(profile.get(k) ?? -Infinity, p.getZ(i)));
  }
  const rows = [...profile].sort((a, b) => b[0] - a[0]).map(([k, z]) => [k * bin, z]);
  const peakBelow = (from, rising) => { for (let j = from + 1; j < rows.length - 1; j++) if (rising ? rows[j][1] >= rows[j - 1][1] && rows[j][1] >= rows[j + 1][1] : rows[j][1] <= rows[j - 1][1] && rows[j][1] <= rows[j + 1][1]) return j; return -1; };
  let nose = -1; for (let j = 0; j < rows.length; j++) if (rows[j][0] < eyes.y - .02 && rows[j][0] > eyes.y - .06 && (nose < 0 || rows[j][1] > rows[nose][1])) nose = j;
  const under = nose < 0 ? -1 : peakBelow(nose, false), upper = under < 0 ? -1 : peakBelow(under, true);
  const line = upper < 0 ? -1 : peakBelow(upper, false), lower = line < 0 ? -1 : peakBelow(line, true);
  if (lower < 0) return null;
  const at = j => rows[j][0];
  return { noseTip: at(nose), noseZ: rows[nose][1], underNose: at(under), upperLip: at(upper), mouth: at(line), lowerLip: at(lower), mouthZ: rows[line][1] };
}
export function applyJevicaMakeup(model, owned) {
  const body = model.getObjectByName('Jevica'), eyes = model.getObjectByName('Jevicahigh-poly');
  if (!body || !eyes) return null;
  eyes.geometry.computeBoundingBox();
  // The eyes' box spans both eyeballs; less one eyeball's diameter it is the pupils' spacing.
  const box = eyes.geometry.boundingBox, centre = { y: (box.min.y + box.max.y) / 2 }, spacing = (box.max.x - box.min.x) - (box.max.y - box.min.y);
  const marks = faceLandmarks(body.geometry, centre);
  if (!marks) return null;
  const geometry = body.geometry.clone(); owned.add(geometry); body.geometry = geometry;
  const p = geometry.attributes.position, colour = new Float32Array(p.count * 3).fill(1);
  const halfWidth = spacing / 2 * MAKEUP.mouthWidth, top = marks.upperLip + (marks.upperLip - marks.mouth) * .9, bottom = marks.lowerLip - (marks.mouth - marks.lowerLip) * 1.1;
  const cheekY = marks.noseTip + .006, cheekX = spacing / 2 * 1.15;
  let lips = 0, blush = 0;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    let r = 1, g = 1, b = 1;
    // Lips: front surface only (the inside of the mouth sits behind the mouth line).
    const reach = y >= marks.mouth ? top - marks.mouth : marks.mouth - bottom, e = (x / halfWidth) ** 2 + ((y - marks.mouth) / reach) ** 2;
    if (e < 1 && z > marks.mouthZ - .012) {
      const k = THREE.MathUtils.smoothstep(1 - e, 0, .45); lips++;
      r *= 1 + (MAKEUP.lips[0] - 1) * k; g *= 1 + (MAKEUP.lips[1] - 1) * k; b *= 1 + (MAKEUP.lips[2] - 1) * k;
    }
    // Blush: a soft disc on each cheek, front-facing.
    const d = Math.hypot(Math.abs(x) - cheekX, y - cheekY) / MAKEUP.blushRadius;
    if (d < 2.5 && z > marks.noseZ - .06) {
      const k = Math.exp(-d * d); if (k > .05) blush++;
      r *= 1 + (MAKEUP.blush[0] - 1) * k; g *= 1 + (MAKEUP.blush[1] - 1) * k; b *= 1 + (MAKEUP.blush[2] - 1) * k;
    }
    colour[i * 3] = r; colour[i * 3 + 1] = g; colour[i * 3 + 2] = b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  body.material.vertexColors = true; body.material.needsUpdate = true;
  return { marks, lips, blush, halfWidth };
}

export const BANGS = Object.freeze({ halfWidth: .058, above: .05, gap: .006, sides: .014, offset: .005, columns: 40, rows: 14 });
export function bangsStrands(size = 128, seed = 7) {
  const pixels = new Uint8Array(size * size * 4);
  let r = seed; const random = () => (r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const tips = Array.from({ length: 48 }, () => .82 + random() * .18), roots = Array.from({ length: 48 }, () => random() * .14);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, strand = Math.floor(u * tips.length), k = (y * size + x) * 4;
    // Each strand has its own tone, lighter along its middle, like the hair cards' strands.
    // The roots darken toward the hair cap, so the fringe's top shows no light edge.
    const across = Math.abs((u * tips.length) % 1 - .5) * 2, root = .55 + .45 * Math.min(1, v / .3);
    const shade = (175 + 50 * ((strand * 37 % 11) / 10) + 30 * (1 - across)) * root;
    pixels[k] = pixels[k + 1] = pixels[k + 2] = Math.min(255, shade);
    // v runs from the roots (0) to the tips (1); each strand ends at its own length, tapered.
    const tip = tips[strand], edge = Math.abs((u * tips.length) % 1 - .5) * 2;
    // Each strand starts at its own height under the cap, so the top is no straight line.
    pixels[k + 3] = v >= roots[strand] && v < tip - .06 * edge ? 255 : 0;
  }
  const texture = new THREE.DataTexture(pixels, size, size); texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping; texture.repeat.set(2, 1);
  return texture;
}
export function createJevicaBangs({ body, model, toRoot, boneRest, head, owned, surface }) {
  const brows = model.getObjectByName('Jevicaeyebrow001');
  if (!brows) return null;
  brows.geometry.computeBoundingBox();
  const browTop = brows.geometry.boundingBox.max.y, top = browTop + BANGS.above;
  // The forehead's depth on a 4 mm grid (front skin only).
  const p = body.geometry.attributes.position, cell = .004, depth = new Map();
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    if (z < .02 || y < browTop - .01 || y > top + .02 || Math.abs(x) > BANGS.halfWidth + .02) continue;
    const k = `${Math.round(x / cell)},${Math.round(y / cell)}`; depth.set(k, Math.max(depth.get(k) ?? -Infinity, z));
  }
  const surfaceAt = (x, y) => {
    for (let r = 0; r < 4; r++) { let best = -Infinity; for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) best = Math.max(best, depth.get(`${Math.round(x / cell) + dx},${Math.round(y / cell) + dy}`) ?? -Infinity); if (best > -Infinity) return best; }
    return null;
  };
  const { columns, rows } = BANGS, positions = [], uvs = [], index = [], origin = boneRest('head');
  // Cloth does not follow the forehead's small bumps: the sampled depth is blurred across the
  // grid, and never below the skin plus the offset.
  const grid = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const u = i / columns * 2 - 1, v = j / rows, x = u * BANGS.halfWidth, bottom = browTop + BANGS.gap - BANGS.sides * u * u, y = top + (bottom - top) * v;
    grid.push(surfaceAt(x, y) ?? surfaceAt(x * .9, y) ?? 0);
  }
  const skinDepth = [...grid];
  for (let pass = 0; pass < 6; pass++) {
    const next = [...grid];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
      let sum = 0, n = 0;
      for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a > columns || b > rows) continue; sum += grid[b * (columns + 1) + a]; n++; }
      next[j * (columns + 1) + i] = Math.max(sum / n, skinDepth[j * (columns + 1) + i]);
    }
    grid.splice(0, grid.length, ...next);
  }
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const u = i / columns * 2 - 1, v = j / rows, x = u * BANGS.halfWidth;
    const bottom = browTop + BANGS.gap - BANGS.sides * u * u, y = top + (bottom - top) * v;
    // The top rows tuck in under the hair cap; lower down the fringe stands a little off the brow.
    const z = grid[j * (columns + 1) + i] + BANGS.offset * THREE.MathUtils.smoothstep(v, 0, .35) - .002 * (1 - THREE.MathUtils.smoothstep(v, 0, .35));
    const at = toRoot(new THREE.Vector3(x, y, z)).sub(origin);
    positions.push(at.x, at.y, at.z); uvs.push(i / columns, v);
    if (i < columns && j < rows) { const a = j * (columns + 1) + i; index.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index); geometry.computeVertexNormals(); owned.add(geometry);
  const strands = bangsStrands(); owned.add(strands);
  // Her hair's espresso roots as the ombré shader draws them (warm, not black).
  const material = surface({ color: '#4a2a20', map: strands, alphaTest: .5, roughness: .52, side: THREE.DoubleSide });
  material.name = 'Jevica bangs';
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Jevica bangs'; mesh.castShadow = true; head.add(mesh);
  return { mesh, browTop, top };
}

export function applyHairOmbre(model, material, owned) {
  let hair = null; model.traverse(item => { if (item.isMesh && item.material === material) hair = item; });
  if (!hair) return null;
  const geometry = hair.geometry.clone(); owned.add(geometry); hair.geometry = geometry;
  const p = geometry.attributes.position, ombre = new Float32Array(p.count);
  let top = -Infinity, bottom = Infinity; for (let i = 0; i < p.count; i++) { top = Math.max(top, p.getY(i)); bottom = Math.min(bottom, p.getY(i)); }
  for (let i = 0; i < p.count; i++) ombre[i] = (top - p.getY(i)) / (top - bottom);
  // Volume (the reference's long waves): below the ears the strands stand out from the head's
  // axis, most at the ends, so the hair falls fuller over the shoulders.
  const ears = top - (top - bottom) * .17, flare = HAIR.flare;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = Math.max(0, Math.min(1, (ears - y) / (ears - bottom)));
    if (k <= 0) continue;
    const grow = 1 + flare * Math.sqrt(k), dz = p.getZ(i) - HAIR.axisZ;
    p.setXYZ(i, p.getX(i) * grow, y, HAIR.axisZ + dz * grow);
  }
  p.needsUpdate = true; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.setAttribute('ombre', new THREE.BufferAttribute(ombre, 1));
  material.color.set('#ffffff'); material.roughness = .46; material.alphaTest = .35;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float ombre;varying float vOmbre;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOmbre=ombre;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vOmbre;')
      .replace('#include <map_fragment>', `#include <map_fragment>
float strand = clamp(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) * 3.5, 0.0, 1.0);
float pinkness = smoothstep(${HAIR.pinkFrom.toFixed(3)}, ${HAIR.pinkTo.toFixed(3)}, vOmbre);
vec3 shade = mix(vec3(0.102, 0.051, 0.039), vec3(0.929, 0.596, 0.757), pinkness);
// Dark strands keep their contrast; the pink ends stay bright enough to read as pink, not mauve.
diffuseColor.rgb = shade * mix(mix(0.45, 0.78, pinkness), 1.12, pow(strand, 0.65));`);
  };
  material.customProgramCacheKey = () => 'jevica-ombre-hair-v2';
  return { top, bottom, ombre };
}
