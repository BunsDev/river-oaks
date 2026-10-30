import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createJevicaCostume } from '../src/jevica-costume.js';
import { SUIT } from '../src/jevica-suit.js';

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
    // At least the sleeve offset everywhere; the smoothed front bridges the hollows between and under the bust by up to 5 cm.
    assert.ok(min >= .0079 && max <= .05, `blazer offset ${min}..${max}`);
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
    assert.equal(hair.material.customProgramCacheKey(), 'jevica-ombre-hair-v1');
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
