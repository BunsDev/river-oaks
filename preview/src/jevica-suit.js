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
    smoothFront(pieces.blazer, body, i => torso[i] > .5 && rest[i * 3 + 2] > 0 && rest[i * 3 + 1] > hemY + .05 && rest[i * 3 + 1] < collarY - .02, i => arms[i] > .5 ? BLAZER.arm : BLAZER.torso);
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
      // Four columns across the lapel: the piped V edge (two columns 4 mm apart), then the
      // satin out to the lapel's width, which peaks at the notch two thirds of the way up.
      const steps = 14, positions = [], indices = [], edge = [], columns = 4;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, y = THREE.MathUtils.lerp(buttonY, collarY - .01, t), xEdge = side * (BLAZER.neckWidth + (y - buttonY) * BLAZER.slope);
        let zFront = 0; for (let i = 0; i < count; i++) if (torso[i] > .4 && Math.abs(rest[i * 3 + 1] - y) < .012 && Math.abs(rest[i * 3] - xEdge) < .03) zFront = Math.max(zFront, rest[i * 3 + 2]);
        const width = .012 + .03 * Math.sin(Math.PI * Math.min(1, t / .7)) * (t < .7 ? 1 : .35);
        for (const [k, across] of [[0, 0], [1, .004], [2, .005], [3, width]]) {
          positions.push(...toRoot(new THREE.Vector3(xEdge + side * across, y, zFront + BLAZER.torso + .008 - across * .15)).sub(chestOrigin).toArray()); edge.push(k < 2 ? 1 : 0);
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
export function applyHairOmbre(model, material, owned) {
  let hair = null; model.traverse(item => { if (item.isMesh && item.material === material) hair = item; });
  if (!hair) return null;
  const geometry = hair.geometry.clone(); owned.add(geometry); hair.geometry = geometry;
  const p = geometry.attributes.position, ombre = new Float32Array(p.count);
  let top = -Infinity, bottom = Infinity; for (let i = 0; i < p.count; i++) { top = Math.max(top, p.getY(i)); bottom = Math.min(bottom, p.getY(i)); }
  for (let i = 0; i < p.count; i++) ombre[i] = (top - p.getY(i)) / (top - bottom);
  geometry.setAttribute('ombre', new THREE.BufferAttribute(ombre, 1));
  material.color.set('#ffffff'); material.roughness = .46; material.alphaTest = .35;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float ombre;varying float vOmbre;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOmbre=ombre;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vOmbre;')
      .replace('#include <map_fragment>', `#include <map_fragment>
float strand = clamp(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) * 3.5, 0.0, 1.0);
vec3 shade = mix(vec3(0.102, 0.051, 0.039), vec3(0.910, 0.627, 0.749), smoothstep(0.16, 0.36, vOmbre));
diffuseColor.rgb = shade * mix(0.45, 1.12, pow(strand, 0.65));`);
  };
  material.customProgramCacheKey = () => 'jevica-ombre-hair-v1';
  return { top, bottom, ombre };
}
