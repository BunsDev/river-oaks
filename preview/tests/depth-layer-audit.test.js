import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEPTH_MODEL, fightMetres, findDepthFights, safeGap, visibleMetres } from '../src/depth-layer-audit.js';

const material = (name, options = {}) => Object.assign(new THREE.MeshStandardMaterial(options), { name });
// A box from [east, up, north] to [east, up, north], in world metres (three's z is south).
const box = (surface, [e0, u0, n0], [e1, u1, n1]) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(e1 - e0, u1 - u0, n1 - n0), surface);
  mesh.position.set((e0 + e1) / 2, (u0 + u1) / 2, -(n0 + n1) / 2); mesh.name = surface.name;
  return mesh;
};
const scene = (...meshes) => { const group = new THREE.Group(); group.add(...meshes); return group; };
// Material pairs that fight, once each (one pair of boxes can fight on several faces).
const pairs = (root, options) => [...new Set(findDepthFights(root, options).map(fight => [fight.a.split('|')[1], fight.b.split('|')[1]].sort().join(' / ')))].sort();

test('the depth model: faces 1.5 mm apart part ways about 19 m out, and a larger patch needs a larger gap', () => {
  assert.ok(Math.abs(fightMetres(0.0015) - 19.4) < 0.1, `${fightMetres(0.0015)}`);
  assert.equal(fightMetres(0), 0);
  assert.equal(visibleMetres(100), DEPTH_MODEL.maxMetres);
  assert.ok(safeGap(0.3) < safeGap(1) && safeGap(1) <= safeGap(10));
  assert.ok(fightMetres(safeGap(1)) >= visibleMetres(1) - 1e-6);
});

test('a planter whose mulch lies 1.5 mm over a brass slab fights; a brass frame around mulch well above the body does not', () => {
  const brass = material('brass'), soil = material('soil'), porcelain = material('porcelain');
  // Before: a porcelain body, a full brass slab on it, the mulch a hair above the slab.
  const before = scene(box(porcelain, [0, .12, 0], [6, .6, 4]), box(brass, [-.01, .5875, -.01], [6.01, .6125, 4.01]), box(soil, [.05, .602, .05], [5.95, .614, 3.95]));
  const fights = findDepthFights(before);
  const mulch = fights.find(fight => /brass/.test(fight.a + fight.b) && /soil/.test(fight.a + fight.b));
  assert.ok(mulch, 'the mulch and the slab under it are reported');
  assert.ok(Math.abs(mulch.gap - .0015) < 1e-6 && mulch.fightMetres < 20 && mulch.visibleMetres > 100, JSON.stringify(mulch));
  // After: the body stops below the bed, porcelain walls hold the mulch, and the rim is a frame.
  const after = scene(box(porcelain, [0, .12, 0], [6, .5, 4]),
    box(porcelain, [0, .5, 0], [6, .6, .06]), box(porcelain, [0, .5, 3.94], [6, .6, 4]), box(porcelain, [0, .5, .06], [.06, .6, 3.94]), box(porcelain, [5.94, .5, .06], [6, .6, 3.94]),
    box(brass, [-.01, .6, -.01], [6.01, .625, .07]), box(brass, [-.01, .6, 3.93], [6.01, .625, 4.01]), box(brass, [-.01, .6, .07], [.07, .625, 3.93]), box(brass, [5.93, .6, .07], [6.01, .625, 3.93]),
    box(soil, [.06, .48, .06], [5.94, .59, 3.94]));
  assert.deepEqual(pairs(after), []);
});

test('faces sealed inside a solid or below the paving never reach the screen', () => {
  const stone = material('stone'), steel = material('steel'), paving = material('paving');
  // Two storeys' worth: a stone box and a steel band set into it share a top at 4.6 m...
  const lower = [box(stone, [0, 0, 0], [10, 4.6, 8]), box(steel, [.5, 4.3, .5], [9.5, 4.6, 7.5])];
  assert.deepEqual(pairs(scene(...lower)), ['steel / stone'], 'an exposed shared roof fights');
  // ...and the next storey sits on it, sealing that plane inside the building.
  assert.deepEqual(pairs(scene(...lower, box(stone, [0, 4.6, 0], [10, 8.1, 8]))), []);
  // A curb box and a footing share a top 20 cm under a draped paving sheet.
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), paving); sheet.name = 'paving';
  const buried = [box(stone, [0, -3, 0], [4, -.2, 4]), box(steel, [2, -1, 2], [6, -.2, 6])];
  assert.deepEqual(pairs(scene(...buried)), ['steel / stone'], 'without the paving above them they would show');
  assert.deepEqual(pairs(scene(sheet, ...buried)), [], 'under the paving');
  assert.deepEqual(pairs(scene(...buried), { groundAt: () => 0 }), [], 'below the terrain');
  // A planter sunk under paving that stands 6.4 cm above the terrain: the two undersides lie
  // 2.8 cm apart, where only a camera under the street could see them (2026-10-27, Street pavers).
  const slab = box(paving, [-10, .054, -10], [10, .064, 10]), planter = box(steel, [1, .026, 1], [2, .6, 2]);
  assert.deepEqual(pairs(scene(slab, planter), { groundAt: () => 0 }), [], 'undersides beside the ground');
  // A bench seat's underside is another matter: 45 cm up, it fights a board 3 mm under it.
  const seat = box(stone, [0, .45, 0], [2, .5, .5]), board = box(steel, [.2, .447, .1], [1.8, .45, .4]);
  assert.deepEqual(pairs(scene(seat, board), { groundAt: () => 0 }), ['steel / stone'], 'a raised underside still counts');
});

test('polygon offset settles a pair only when it pulls the front layer forward', () => {
  const lawn = material('lawn'), stone = material('stone', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const plain = material('stone-plain'), pulledBack = material('lawn-pulled', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  // A stone overlay 4 mm above the lawn, pulled forward: settled.
  assert.deepEqual(pairs(scene(box(lawn, [0, -.1, 0], [8, 0, 8]), box(stone, [2, -.1, 2], [4, .004, 4]))), []);
  // The same overlay without offset, and with the lawn beneath pulled forward instead: both fight.
  assert.deepEqual(pairs(scene(box(lawn, [0, -.1, 0], [8, 0, 8]), box(plain, [2, -.1, 2], [4, .004, 4]))), ['lawn / stone-plain']);
  assert.deepEqual(pairs(scene(box(pulledBack, [0, -.1, 0], [8, 0, 8]), box(plain, [2, -.1, 2], [4, .004, 4]))), ['lawn-pulled / stone-plain']);
});

test('one material, or faces back to back, never fight; a gap that holds out to the horizon is fine', () => {
  const stone = material('stone'), steel = material('steel');
  assert.deepEqual(pairs(scene(box(stone, [0, 0, 0], [4, 1, 4]), box(stone, [2, 0, 2], [6, 1, 6]))), []);
  // Two walls back to back on one plane: each is only seen from its own side.
  assert.deepEqual(pairs(scene(box(stone, [0, 0, 0], [4, 3, 4]), box(steel, [4, 0, 0], [8, 3, 4]))), []);
  // A 4 m slab 10 cm over another separates beyond the model's horizon.
  assert.ok(fightMetres(.1) > DEPTH_MODEL.maxMetres);
  assert.deepEqual(pairs(scene(box(stone, [0, 0, 0], [4, 1, 4]), box(steel, [-1, 1.1, -1], [5, 1.2, 5]), box(stone, [0, 1, 0], [4, 1.1, 4]))), []);
});

test('on one plane, whichever layer polygon offset pulls further forward wins', () => {
  const pavers = material('pavers', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const warnings = material('warnings', { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), plain = material('plain');
  // Tactile warnings laid on the paving plane itself, drawn either order.
  assert.deepEqual(pairs(scene(box(pavers, [0, -.1, 0], [8, 0, 8]), box(warnings, [2, -.2, 2], [4, 0, 4]))), []);
  assert.deepEqual(pairs(scene(box(warnings, [2, -.2, 2], [4, 0, 4]), box(pavers, [0, -.1, 0], [8, 0, 8]))), []);
  assert.deepEqual(pairs(scene(box(plain, [0, -.1, 0], [8, 0, 8]), box(material('plain-2'), [2, -.2, 2], [4, 0, 4]))), ['plain / plain-2']);
});
