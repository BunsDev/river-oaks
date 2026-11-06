import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createJevicaCostume } from '../src/jevica-costume.js';
import { SUIT, PUMP, MAKEUP, BANGS, upperHull } from '../src/jevica-suit.js';

// Val's 2026-10-29 reference look on the real hero rig: a blazer and trousers cut
// from her own skin, a peplum, a collar with its brooch, lilies, earrings, heels
// and ombré hair, all skinned or pinned to her skeleton and all released on dispose.
async function dressed() {
  const source = await loadCharacterRig('jevica'), rig = instantiateAvatar(source, { targetHeight: 1.685 });
  const object = new THREE.Group(); object.add(rig.model); object.updateMatrixWorld(true);
  const costume = createJevicaCostume({ object, rig });
  costume.update(false, 1000);
  return { object, rig, costume, body: rig.model.getObjectByName('Jevica') };
}

test('the blazer and trousers are shells of the actual skin, skinned to its skeleton', async () => {
  const { rig, costume, body } = await dressed();
  try {
    const { blazer, trousers } = costume.suit;
    for (const shell of [blazer, trousers]) {
      assert.equal(shell.mesh.skeleton, body.skeleton, `${shell.mesh.name} poses with the skin`);
      assert.notEqual(shell.geometry, body.geometry);
      assert.ok(shell.geometry.index.count > 3000, `${shell.mesh.name} has cloth: ${shell.geometry.index.count / 3} triangles`);
      assert.ok(shell.geometry.attributes.piping, 'the satin shader reads a piping attribute');
    }
    const p = body.geometry.attributes.position, { skinIndex, skinWeight } = body.geometry.attributes;
    const weight = (i, test) => { let w = 0; for (let k = 0; k < 4; k++) if (test.test(body.skeleton.bones[skinIndex.getComponent(i, k)].name)) w += skinWeight.getComponent(i, k); return w; };
    let legs = 0, chest = 0, hands = 0, neck = 0;
    for (let i = 0; i < p.count; i++) {
      if (weight(i, /^(thigh|calf)/) > .99) { legs++; assert.ok(trousers.covered.has(i), 'every leg vertex is under the trousers'); }
      if (weight(i, /^(spine_02|spine_03)$/) > .99 && p.getZ(i) < 0) { chest++; assert.ok(blazer.covered.has(i), 'the back of the chest is under the blazer'); }
      if (weight(i, /^hand_/) > .99) { hands++; assert.ok(!blazer.covered.has(i), 'the blazer stops at the wrists'); }
      if (weight(i, /^head$/) > .99) { neck++; assert.ok(!blazer.covered.has(i), 'the blazer does not climb the head'); }
    }
    assert.ok(legs > 100 && chest > 50 && hands > 10 && neck > 100, `sampled ${legs} leg, ${chest} chest, ${hands} hand and ${neck} head vertices`);
    const sp = blazer.geometry.attributes.position; let min = Infinity, max = 0;
    for (const i of blazer.covered) { const d = Math.hypot(p.getX(i) - sp.getX(i), p.getY(i) - sp.getY(i), p.getZ(i) - sp.getZ(i)); min = Math.min(min, d); max = Math.max(max, d); }
    // At least the sleeve offset everywhere; the smoothed, tailored front bridges the hollow
    // under the bust (it hangs from the bust to the button), standing off by up to 6 cm there.
    assert.ok(min >= .0079 && max <= .06, `blazer offset ${min}..${max}`);
    const tp = trousers.geometry.attributes.position; let tMin = Infinity;
    for (const i of trousers.covered) tMin = Math.min(tMin, Math.hypot(p.getX(i) - tp.getX(i), p.getY(i) - tp.getY(i), p.getZ(i) - tp.getZ(i)));
    assert.ok(tMin >= .0049, `trousers offset ${tMin}`);
    // Open in a V from the button up to the collar: front vertices on the centre line above the button are bare.
    let open = 0; for (const i of blazer.covered) if (p.getZ(i) > .06 && Math.abs(p.getX(i)) < .01 && p.getY(i) > 1.1) open++;
    assert.equal(open, 0, 'the V shows the blouse');
    let gold = 0; for (const v of blazer.geometry.attributes.piping.array) if (v > .5) gold++;
    assert.ok(gold > 150, `rose-gold piping is painted on the blazer (${gold} vertices)`);
    assert.ok(blazer.mesh.material.iridescence > .5 && blazer.mesh.material.name === 'Jevica satin suit');
  } finally { costume.dispose(); rig.dispose(); }
});

test('the peplum, collar, brooch, button, lapels, lilies, earrings and heels are pinned to their joints; no crown or gown remains', async () => {
  const { object, rig, costume } = await dressed();
  try {
    const { peplum, collar, lapels, flowers, earrings, heels } = costume.suit, at = name => object.getObjectByName(name)?.getWorldPosition(new THREE.Vector3());
    assert.ok(peplum.userData.deformableCostume, 'the peplum is draped by jevica-drape.js');
    const hips = rig.model.getObjectByName('spine_01').getWorldPosition(new THREE.Vector3());
    const box = new THREE.Box3().setFromObject(peplum);
    assert.ok(box.max.y <= hips.y + .05 && box.min.y >= hips.y - .26, `the peplum is a short flare over the hips: ${box.min.y}..${box.max.y}`);
    assert.ok(collar && at('Jevica mandarin collar').y > rig.model.getObjectByName('neck_01').getWorldPosition(new THREE.Vector3()).y - .01);
    assert.ok(at('Jevica collar brooch').z > .05, 'the brooch sits at the front of the collar');
    assert.ok(at('Jevica blazer button').z > .1 && Math.abs(at('Jevica blazer button').y - 1.04) < .06, 'one button at the waist');
    assert.equal(lapels.length, 2); assert.equal(flowers.length, 2); assert.equal(earrings.length, 2); assert.equal(heels.length, 2);
    const ear = at('Jevica earring left'), lily = at('Jevica lily cluster left'), head = rig.model.getObjectByName('head').getWorldPosition(new THREE.Vector3());
    assert.ok(ear.x > .07 && ear.y < head.y && lily.x > .1 && lily.y > head.y + .04, 'earrings hang below the head joint and lilies sit above the ears');
    for (const heel of heels) { const b = new THREE.Box3().setFromObject(heel); assert.ok(b.min.y > -.002 && b.min.y < .006 && b.max.y < .09, `the heel column stands on the floor: ${b.min.y}..${b.max.y}`); }
    const names = []; object.traverse(item => names.push(item.name));
    assert.ok(!names.some(name => /crown|gown|riding trousers/i.test(name)), 'no crown, gown or riding-only trousers');
    let crystal = null; object.traverse(item => { if (item.material?.transmission > 0) crystal = item.material; });
    assert.equal(crystal?.name, 'Jevica jewel crystals');
    // The wand is kept for spell emission but hidden unless casting.
    const hand = rig.model.getObjectByName('hand_r').getWorldPosition(new THREE.Vector3()), tip = new THREE.Vector3();
    costume.getWandTip(tip); assert.ok(tip.distanceTo(hand) > .5);
    let wandVisible = null; object.traverse(item => { if (item.isSprite) wandVisible = item.parent.visible; });
    assert.equal(wandVisible, false); costume.update(false, 1016, false, { casting: true });
    object.traverse(item => { if (item.isSprite) wandVisible = item.parent.visible; }); assert.equal(wandVisible, true);
  } finally { costume.dispose(); rig.dispose(); }
});

test('the hair fades from espresso roots to rose ends and the pumps turn glossy pink', async () => {
  const { rig, costume } = await dressed();
  try {
    const hair = rig.model.getObjectByName('Jevicalong01'), ombre = hair.geometry.attributes.ombre;
    assert.ok(ombre, 'the hair owns an ombre attribute');
    let min = Infinity, max = -Infinity; for (const v of ombre.array) { min = Math.min(min, v); max = Math.max(max, v); }
    assert.equal(min, 0); assert.equal(max, 1);
    assert.equal(hair.material.customProgramCacheKey(), 'jevica-ombre-hair-v2');
    const shoes = rig.model.getObjectByName('Jevicashoes01').material;
    assert.equal(`#${shoes.color.getHexString()}`, SUIT.shoe); assert.ok(shoes.roughness < .3);
  } finally { costume.dispose(); rig.dispose(); }
});

test('earrings swing with head motion and settle; reduced motion holds them still', async () => {
  const { object, rig, costume } = await dressed();
  try {
    const earring = object.getObjectByName('Jevica earring left');
    let time = 1000;
    for (let i = 0; i < 20; i++) { object.position.z += .05; object.updateMatrixWorld(true); costume.update(false, time += 16); }
    object.position.z -= .5; object.updateMatrixWorld(true); costume.update(false, time += 16); costume.update(false, time += 16);
    const swung = Math.hypot(earring.rotation.x, earring.rotation.z);
    assert.ok(swung > .01 && swung <= .71, `a stop swings the drop: ${swung}`);
    for (let i = 0; i < 200; i++) costume.update(false, time += 16);
    assert.ok(Math.hypot(earring.rotation.x, earring.rotation.z) < .002, 'the swing dies out at rest');
  } finally { costume.dispose(); rig.dispose(); }
});

test('every suit resource is released on dispose and the budget stays within the hero allowance', async () => {
  const source = await loadCharacterRig('jevica'), rig = instantiateAvatar(source, { targetHeight: 1.685 });
  const object = new THREE.Group(); object.add(rig.model); object.updateMatrixWorld(true);
  // Sprites share Three's one static sprite geometry; only their material is the costume's.
  const collect = () => { const set = new Set(); object.traverse(item => { if (item.isMesh) set.add(item.geometry); if (item.isMesh || item.isSprite) set.add(item.material); }); return set; };
  const rigOwn = collect();
  const costume = createJevicaCostume({ object, rig });
  try {
    costume.update(false, 1000);
    let triangles = 0; object.traverse(item => { if (item.isMesh) triangles += (item.geometry.index?.count ?? item.geometry.attributes.position.count) / 3; });
    assert.ok(triangles < 160000, `hero with suit: ${triangles} triangles`);
    const suitOwn = [...collect()].filter(resource => !rigOwn.has(resource));
    assert.ok(suitOwn.length > 10);
    let disposed = 0; for (const resource of suitOwn) resource.addEventListener('dispose', () => disposed++);
    costume.dispose();
    assert.equal(object.children.length, 1, 'only the rig remains under the avatar');
    assert.equal(disposed, suitOwn.length, 'every suit geometry and material is released');
  } finally { rig.dispose(); }
});

// Measures each shoe below the ankle and its top where it meets the leg, in bind space.
function shoeShape(geometry) {
  const p = geometry.attributes.position, sides = { l: { low: [Infinity, -Infinity], toe: -Infinity, top: [] }, r: { low: [Infinity, -Infinity], toe: -Infinity, top: [] } };
  for (let i = 0; i < p.count; i++) {
    const side = sides[p.getX(i) < 0 ? 'r' : 'l'], y = p.getY(i);
    side.toe = Math.max(side.toe, p.getZ(i));
    if (y < .06) { side.low[0] = Math.min(side.low[0], p.getX(i)); side.low[1] = Math.max(side.low[1], p.getX(i)); }
    if (y > .18) side.top.push([p.getX(i), y, p.getZ(i)]);
  }
  return sides;
}

test('the shoes become slim pointed pumps under the trouser hem, unchanged where they meet the leg', async () => {
  const source = await loadCharacterRig('jevica'), bare = instantiateAvatar(source, { targetHeight: 1.685 });
  const { rig, costume } = await dressed();
  try {
    const before = bare.model.getObjectByName('Jevicashoes01').geometry, shoe = rig.model.getObjectByName('Jevicashoes01');
    assert.notEqual(shoe.geometry, before, 'the costume reshapes its own copy, never the shared rig');
    const a = shoeShape(before), b = shoeShape(shoe.geometry);
    for (const side of ['l', 'r']) {
      const widthBefore = a[side].low[1] - a[side].low[0], widthAfter = b[side].low[1] - b[side].low[0];
      assert.ok(widthAfter < widthBefore * .92, `${side} sole narrower: ${widthAfter.toFixed(3)} vs ${widthBefore.toFixed(3)} m`);
      assert.ok(b[side].toe > a[side].toe + PUMP.point * .5, `${side} toe drawn to a point`);
      assert.deepEqual(b[side].top, a[side].top, `${side} unchanged where it meets the leg (her feet end inside the shoe)`);
    }
    const vamp = shoe.geometry.attributes.vamp.array;
    assert.ok(vamp.some(v => v < -.01) && vamp.some(v => v > .01), 'shoe below the topline, hem satin above it');
    assert.equal(shoe.material.customProgramCacheKey(), 'jevica-pumps-v2');
    // The hair stands fuller below the ears than the rig's own.
    const hairBefore = bare.model.getObjectByName('Jevicalong01').geometry.attributes.position, hairAfter = rig.model.getObjectByName('Jevicalong01').geometry.attributes.position;
    let wider = 0, lower = 0;
    for (let i = 0; i < hairBefore.count; i++) if (hairBefore.getY(i) < 1.1) { lower++; if (Math.hypot(hairAfter.getX(i), hairAfter.getZ(i)) > Math.hypot(hairBefore.getX(i), hairBefore.getZ(i)) + .005) wider++; }
    assert.ok(lower > 0 && wider / lower > .9, `${wider}/${lower} low strands stand out further`);
  } finally { costume.dispose(); rig.dispose(); bare.dispose(); }
});

// The deepest dip of the blazer front below the straight line from each central column's
// highest point down to its lowest, between the bust and the button (bind space, metres).
function frontTuck(geometry, covered) {
  const p = geometry.attributes.position, columns = new Map();
  for (const i of covered) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    if (z < .05 || y < 1 || y > 1.25 || Math.abs(x) > .09) continue;
    const k = Math.round(x * 100); if (!columns.has(k)) columns.set(k, []); columns.get(k).push([y, z]);
  }
  let worst = 0;
  for (const points of columns.values()) {
    const apex = points.reduce((m, q) => q[1] > m[1] ? q : m), below = points.filter(q => q[0] < apex[0]).sort((a, b) => b[0] - a[0]);
    if (!below.length) continue; const last = below.at(-1);
    for (const [y, z] of below) worst = Math.max(worst, apex[1] + (last[1] - apex[1]) * (apex[0] - y) / (apex[0] - last[0] || 1) - z);
  }
  return worst;
}

test('the blazer front bridges the hollow under the bust instead of following the skin into it', async () => {
  const { rig, costume, body } = await dressed();
  try {
    const { blazer } = costume.suit, skinTuck = frontTuck(body.geometry, blazer.covered), clothTuck = frontTuck(blazer.geometry, blazer.covered);
    assert.ok(skinTuck > .015, `the body dips ${(skinTuck * 1000).toFixed(1)} mm under the bust`);
    assert.ok(clothTuck < .007, `the blazer front dips only ${(clothTuck * 1000).toFixed(1)} mm`);
    assert.ok(blazer.tailoredDepth > .01 && blazer.tailoredDepth <= .03 + 1e-6, `lifted up to ${(blazer.tailoredDepth * 1000).toFixed(1)} mm, never past 3 cm`);
    // Never inside the skin anywhere the shell covers.
    const p = blazer.geometry.attributes.position, skin = body.geometry.attributes.position, n = body.geometry.attributes.normal;
    for (const i of blazer.covered) {
      const d = (p.getX(i) - skin.getX(i)) * n.getX(i) + (p.getY(i) - skin.getY(i)) * n.getY(i) + (p.getZ(i) - skin.getZ(i)) * n.getZ(i);
      assert.ok(d > .004, `vertex ${i} stands ${(d * 1000).toFixed(1)} mm off the skin`);
    }
  } finally { costume.dispose(); rig.dispose(); }
});

test('the upper hull spans hollows and passes through peaks', () => {
  const hull = upperHull([[0, 0], [1, 2], [2, 0], [3, -1], [4, 1]]);
  assert.equal(hull(1), 2); assert.equal(hull(4), 1);
  assert.ok(Math.abs(hull(2.5) - 1.5) < 1e-9, 'the hollow between the two peaks is bridged');
  assert.equal(hull(-1), 0); assert.equal(hull(9), 1);
});

test('makeup: rose lips about the mouth line and a soft blush, on her own copy of the skin', async () => {
  const source = await loadCharacterRig('jevica'), bare = instantiateAvatar(source, { targetHeight: 1.685 });
  const { rig, costume, body } = await dressed();
  try {
    const { marks, halfWidth } = costume.makeup;
    // Her profile, top to bottom: nose tip, the dip under it, upper lip, mouth line, lower lip.
    assert.ok(marks.noseTip > marks.underNose && marks.underNose > marks.upperLip && marks.upperLip > marks.mouth && marks.mouth > marks.lowerLip, JSON.stringify(marks));
    assert.ok(marks.noseTip - marks.lowerLip > .02 && marks.noseTip - marks.lowerLip < .06, 'nose to lower lip is a face, not a stray bump');
    assert.ok(halfWidth > .015 && halfWidth < .03, `mouth half-width ${halfWidth.toFixed(3)} m`);
    assert.notEqual(body.geometry, bare.model.getObjectByName('Jevica').geometry, 'the shared rig keeps its own skin');
    assert.equal(bare.model.getObjectByName('Jevica').geometry.attributes.color, undefined);
    assert.equal(body.material.vertexColors, true);
    const p = body.geometry.attributes.position, c = body.geometry.attributes.color;
    let lips = 0, elsewhere = 0, blush = 0;
    for (let i = 0; i < p.count; i++) {
      // The lip tint pulls green well below blue; the blush pulls them about equally.
      const [x, y] = [p.getX(i), p.getY(i)], tinted = c.getZ(i) - c.getY(i) > .05;
      if (!tinted) { if (c.getX(i) - c.getY(i) > .05) blush++; continue; }
      if (Math.abs(x) < halfWidth && y < marks.upperLip + .01 && y > marks.lowerLip - .012) lips++; else elsewhere++;
    }
    assert.ok(lips > 200, `${lips} lip vertices take the rose tint`);
    assert.equal(elsewhere, 0, 'the lip tint stays on the lips');
    assert.ok(blush > 200, `${blush} cheek vertices take a light blush`);
    // Pinker than skin: red kept, green pulled down more than blue.
    assert.ok(MAKEUP.lips[0] === 1 && MAKEUP.lips[1] < MAKEUP.lips[2]);
  } finally { costume.dispose(); rig.dispose(); bare.dispose(); }
});

test('bangs: a fringe in front of her forehead, ending just above the brows, moving with her head', async () => {
  const { object, rig, costume, body } = await dressed();
  try {
    const { mesh, browTop } = costume.suit.bangs;
    assert.equal(mesh.name, 'Jevica bangs');
    assert.equal(mesh.material.alphaTest, .5, 'strand tips are cut by alpha');
    // Every fringe point, brought back into the skin's frame, stands in front of the forehead and above the brows.
    object.updateMatrixWorld(true);
    const p = mesh.geometry.attributes.position, skin = body.geometry.attributes.position, point = new THREE.Vector3();
    let lowest = Infinity, behind = 0;
    for (let i = 0; i < p.count; i++) {
      body.worldToLocal(mesh.localToWorld(point.fromBufferAttribute(p, i)));
      lowest = Math.min(lowest, point.y);
      // The nearest skin vertex in front of the forehead must not be in front of the fringe.
      for (let k = 0; k < skin.count; k += 7) if (Math.abs(skin.getX(k) - point.x) < .003 && Math.abs(skin.getY(k) - point.y) < .003 && skin.getZ(k) > point.z + .001) { behind++; break; }
    }
    assert.ok(lowest > browTop - BANGS.sides - .001 && lowest < browTop + BANGS.gap + .001, `the fringe ends at ${lowest.toFixed(3)} m, brows top at ${browTop.toFixed(3)} m`);
    assert.ok(behind < p.count * .05, `${behind} of ${p.count} fringe points sit behind the skin (only the tucked top row may)`);
    // Pinned to the head: turning the head carries the fringe.
    const head = rig.model.getObjectByName('head'), before = mesh.getWorldQuaternion(new THREE.Quaternion());
    head.rotation.y += .5; rig.model.updateMatrixWorld(true); costume.update(false, 2000);
    const turned = mesh.getWorldQuaternion(new THREE.Quaternion()).angleTo(before);
    assert.ok(Math.abs(turned - .5) < .05, `the fringe turns ${turned.toFixed(3)} rad with a 0.5 rad head turn`);
  } finally { costume.dispose(); rig.dispose(); }
});
