import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PINK_JET_AGE } from '../../shared/city-kit/pink-jet-age.js';
import { districtRibbonPlan } from '../src/ribbon-district.js';
import { buildRibbonGraybox } from '../src/ribbon-graybox.js';
import { buildRibbon, ribbonAppliesTo, RIBBON_FINISH } from '../src/ribbon-finish.js';
import { findDepthFights } from '../src/depth-layer-audit.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const instance = (mesh, i) => { const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); mesh.getMatrixAt(i, m); m.decompose(p, q, s); return { m, p, q, s }; };
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-3, `${label}: ${a} vs ${b}`);
const byName = (group, name) => group.children.find(mesh => mesh.name === name);

test('the finished Ribbon draws the graybox placements in five instanced draw calls', () => {
  const plan = districtRibbonPlan(world), finished = buildRibbon({ world }), grey = buildRibbonGraybox({ world });
  assert.deepEqual(finished.children.map(mesh => [mesh.name, mesh.isInstancedMesh, mesh.count]), [
    ['Ribbon posts', true, 61], ['Ribbon canopy', true, 30], ['Ribbon edges', true, 60], ['Ribbon fans', true, 30], ['Ribbon lamp heads', true, 16],
  ]);
  assert.deepEqual(finished.userData.ribbon, { id: 'district-spine', hash: plan.hash, finish: 'pink-jet-age', stats: plan.stats, skipped: ['ribbon:spine:post:015:l'], drawCalls: 5 });
  // Same footprint as the graybox: every post, fan and lamp where the graybox puts it.
  for (const name of ['Ribbon posts', 'Ribbon fans', 'Ribbon lamp heads']) {
    const a = byName(finished, name), b = byName(grey, name);
    assert.equal(a.count, b.count, name);
    for (let i = 0; i < a.count; i++) { near(instance(a, i).p.x, instance(b, i).p.x, `${name} ${i} x`); near(instance(a, i).p.z, instance(b, i).p.z, `${name} ${i} z`); }
  }
  finished.userData.dispose(); assert.ok(ribbonAppliesTo(world, 'pink-jet-age')); assert.equal(ribbonAppliesTo(world, 'classic'), false);
});

test('the canopy spans each module at the clear height, its top at the contract slab, a pink bullnose on each edge', () => {
  const plan = districtRibbonPlan(world), ground = 17.5, group = buildRibbon({ plan, groundAt: () => ground }), canopy = byName(group, 'Ribbon canopy'), edges = byName(group, 'Ribbon edges');
  canopy.geometry.computeBoundingBox();
  plan.modules.forEach((module, i) => {
    const { m, p } = instance(canopy, i), box = canopy.geometry.boundingBox.clone().applyMatrix4(m);
    near(box.min.y, ground + module.clearHeight, `${module.id} underside`);
    near(box.max.y, ground + module.clearHeight + 0.4, `${module.id} top`);
    // Its long axis reaches the module's end, north at -z.
    const end = new THREE.Vector3(0.5, 0, 0).applyMatrix4(m);
    near(end.x, module.to[0], `${module.id} end x`); near(end.z, -module.to[1], `${module.id} end z`);
    for (const k of [0, 1]) {
      const edge = instance(edges, i * 2 + k).p;
      near(Math.hypot(edge.x - p.x, edge.z - p.z), module.width / 2 + RIBBON_FINISH.overhang, `${module.id} edge ${k}`);
    }
  });
  assert.ok(plan.modules.every(module => module.clearHeight >= 3), 'at least 3 m clear');
  group.userData.dispose();
});

test('pink is a material by day; at dusk only the lamp heads light, warm', () => {
  const group = buildRibbon({ world });
  const material = name => byName(group, name).material;
  assert.equal(`#${material('Ribbon edges').color.getHexString()}`, PINK_JET_AGE.pink.toLowerCase());
  assert.equal(`#${material('Ribbon canopy').color.getHexString()}`, PINK_JET_AGE.ivory.toLowerCase());
  assert.equal(`#${material('Ribbon fans').color.getHexString()}`, PINK_JET_AGE.chrome.toLowerCase());
  for (const mesh of group.children) assert.equal(mesh.material.emissiveIntensity * mesh.material.emissive.getHex(), 0, `${mesh.name} dark by day`);
  group.userData.relight({ twilight: 1 });
  for (const mesh of group.children) {
    const lit = mesh.material.emissiveIntensity > 0 && mesh.material.emissive.getHex() !== 0;
    assert.equal(lit, mesh.name === 'Ribbon lamp heads', `${mesh.name} lit=${lit}`);
  }
  assert.notEqual(`#${material('Ribbon lamp heads').emissive.getHexString()}`, PINK_JET_AGE.pink.toLowerCase());
  group.userData.dispose();
});

test('the finished Ribbon holds its depth, refuses like the graybox, and frees what it made', () => {
  const group = buildRibbon({ world, groundAt: () => 18.5 }), root = new THREE.Group(); root.add(group); root.updateMatrixWorld(true);
  assert.deepEqual(findDepthFights(root).map(fight => `${fight.a} × ${fight.b} ${fight.gap}`), []);
  let freed = 0;
  for (const mesh of group.children) { mesh.geometry.addEventListener('dispose', () => freed++); mesh.material.addEventListener('dispose', () => freed++); }
  group.userData.dispose(); group.userData.dispose();
  assert.equal(freed, group.children.length * 2);
  const start = districtRibbonPlan(world).posts.find(post => post.id === 'ribbon:spine:post:000:r');
  const blocked = buildRibbon({ world: { ...world, stores: [...world.stores, { id: 'probe-store', name: 'Probe', facade: [start.position[0] + 1, start.position[1]], outward: [-1, 0] }] } });
  assert.equal(blocked.children.length, 0);
  assert.match(blocked.userData.ribbon.refused, /ribbon:spine:post:000:r lands in doorway door-probe-store/);
});
