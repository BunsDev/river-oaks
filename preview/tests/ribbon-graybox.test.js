import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { expandRibbon } from '../../shared/city-kit/ribbon-layout.js';
import { districtRibbonPlan } from '../src/ribbon-district.js';
import { buildRibbonGraybox, ribbonAppliesTo, RIBBON_GRAYBOX, DISTRICT_RIBBON_LANE } from '../src/ribbon-graybox.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const world = read('../public/data/district.json'), spine = read('../../config/ribbon/district-spine.json');
const instance = (mesh, i) => { const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); mesh.getMatrixAt(i, m); m.decompose(p, q, s); return { p, q, s }; };
// Instance matrices are Float32: at x ≈ -2760 m one step is ~0.24 mm, and the plan is in mm.
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-3, `${label}: ${a} vs ${b}`);

test('the Ribbon draws only under pink-jet-age, and only in a world with the District lane', () => {
  assert.equal(world.roads.some(road => road.id === DISTRICT_RIBBON_LANE), true);
  assert.equal(ribbonAppliesTo(world, 'pink-jet-age'), true);
  assert.equal(ribbonAppliesTo(world, 'classic'), false);
  assert.equal(ribbonAppliesTo(world, undefined), false);
  assert.equal(ribbonAppliesTo({ ...world, roads: world.roads.filter(road => road.id !== DISTRICT_RIBBON_LANE) }, 'pink-jet-age'), false, 'a creator world without the lane');
});

test('the graybox is the spine expanded against the District: one grey material, four draw calls', () => {
  const plan = districtRibbonPlan(world), group = buildRibbonGraybox({ world });
  assert.deepEqual(group.children.map(mesh => [mesh.name, mesh.isInstancedMesh, mesh.count]), [
    ['Ribbon posts', true, 61], ['Ribbon canopy', true, 30], ['Ribbon fans', true, 30], ['Ribbon lamp heads', true, 16],
  ]);
  const materials = new Set(group.children.map(mesh => mesh.material));
  assert.equal(materials.size, 1);
  const [material] = materials;
  assert.equal(`#${material.color.getHexString()}`, RIBBON_GRAYBOX.color);
  assert.equal(material.emissive.getHex(), 0, 'graybox gives off no light');
  assert.deepEqual(group.userData.ribbon, { id: 'district-spine', hash: plan.hash, stats: plan.stats, skipped: ['ribbon:spine:post:015:l'], drawCalls: 4 });
});

test('instances stand where the plan puts them, north at -z, on the ground given', () => {
  const plan = districtRibbonPlan(world), ground = 17.5, group = buildRibbonGraybox({ plan, groundAt: () => ground });
  const [posts, canopy, fans, lamps] = group.children;
  plan.posts.forEach((post, i) => {
    const { p, s } = instance(posts, i);
    near(p.x, post.position[0], `${post.id} x`); near(p.z, -post.position[1], `${post.id} z`);
    near(p.y, ground + post.height / 2, `${post.id} y`); near(s.y, post.height, `${post.id} height`);
  });
  // A slab spans its module: its long axis carries +x onto the module's direction.
  plan.modules.forEach((module, i) => {
    const { p, q, s } = instance(canopy, i), axis = new THREE.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(s.x / 2);
    near(p.x + axis.x, module.to[0], `${module.id} end x`); near(p.z + axis.z, -module.to[1], `${module.id} end z`);
    near(p.y, ground + module.clearHeight + RIBBON_GRAYBOX.canopyDepth / 2, `${module.id} y`); near(s.z, module.width, `${module.id} width`);
  });
  near(instance(fans, 0).p.y, ground + plan.fans[0].height, 'fan height');
  near(instance(lamps, 0).p.x, plan.lamps[0].position[0], 'lamp x');
  // The post left out over the Van Cleef & Arpels bench has no instance anywhere near its spot.
  const left = expandRibbon(spine).posts.find(post => post.id === 'ribbon:spine:post:015:l');
  const drawn = Array.from({ length: posts.count }, (_, i) => instance(posts, i).p);
  assert.ok(drawn.every(p => Math.hypot(p.x - left.position[0], p.z + left.position[1]) > 0.5), 'no post drawn over the bench');
});

test('a world that leaves the spine no valid post draws no Ribbon and says why', () => {
  // A store whose door sits on the spine's first post: an end post cannot be left out.
  const start = districtRibbonPlan(world).posts.find(post => post.id === 'ribbon:spine:post:000:r');
  const blocked = { ...world, stores: [...world.stores, { id: 'probe-store', name: 'Probe', facade: [start.position[0] + 1, start.position[1]], outward: [-1, 0] }] };
  const group = buildRibbonGraybox({ world: blocked });
  assert.equal(group.children.length, 0);
  assert.equal(group.userData.ribbon.drawCalls, 0);
  assert.match(group.userData.ribbon.refused, /ribbon:spine:post:000:r lands in doorway door-probe-store/);
});

test('the canopy clears head height and posts keep the walk open', () => {
  const plan = districtRibbonPlan(world);
  assert.ok(plan.modules.every(module => module.clearHeight >= 3), 'at least 3 m clear under the canopy');
  // Facing posts are a walk's width apart, so the clear walk between them is that minus one post.
  const pairs = new Map();
  for (const post of plan.posts) { if (!pairs.has(post.boundary)) pairs.set(post.boundary, []); pairs.get(post.boundary).push(post); }
  for (const [boundary, pair] of pairs) if (pair.length === 2) {
    const apart = Math.hypot(pair[0].position[0] - pair[1].position[0], pair[0].position[1] - pair[1].position[1]);
    assert.ok(apart - RIBBON_GRAYBOX.postSize >= 1.2 - 1e-6, `boundary ${boundary}: ${apart} m between posts`);
  }
});
