// The runtime-vs-photo fixes Val chose on 2026-10-15 (docs/ipic-review/photo-review.md P5, P7, P9,
// P12, P17): finishes and the reception view, checked against the built meshes (no textures) and
// the pure layout and palette data the textures are painted from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWalkingEnvironment } from '../src/walking.js';
import { buildIpicInterior } from '../src/ipic-interior.js';
import { IPIC_CAMERAS, ipicFloor } from '../src/ipic-plan.js';
import { IPIC_LOUNGE_CARPET, districtSignLayout } from '../src/ipic-materials.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const room = createWalkingEnvironment(world).rooms.find(r => r.interior === 'ipic-photo-v1');
const group = buildIpicInterior(room, { textures: false, local: true });
group.updateMatrixWorld(true);
const meshes = []; group.traverse(item => { if (item.isMesh && !item.isInstancedMesh) meshes.push(item); });
// The first surface met looking straight down from 1.5 m above the floor at [a, d].
const below = (a, d) => {
  const ray = new THREE.Raycaster(new THREE.Vector3(a, ipicFloor(d) + 1.5, -d), new THREE.Vector3(0, -1, 0));
  return ray.intersectObjects(meshes, false)[0]?.object.name ?? null;
};

test('P9: the lounge coffee table has a radial sunburst timber top', () => {
  assert.equal(below(-2.8, 23.3), 'Upper lounge: ipic-sunburst-timber');
});

test('P12: the Tuck Room stands on timber; the lounge keeps its carpet', () => {
  for (const [a, d] of [[3, 21], [3, 24.6], [5.3, 20.4]]) assert.equal(below(a, d), 'Tuck Room: ipic-bar-floor-timber', `${a},${d}`);
  for (const [a, d] of [[-1, 21.5], [-4.9, 25.4], [1.8, 22]]) assert.equal(below(a, d), 'Upper lounge: ipic-red-swirl-carpet', `${a},${d}`);
});

test('P12: the lounge carpet is dark and its red pattern restrained, as in IMG_9758', () => {
  const lum = ([r, g, b]) => .2126 * r + .7152 * g + .0722 * b;
  const sat = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
  assert.ok(lum(IPIC_LOUNGE_CARPET.pattern) < 70 && sat(IPIC_LOUNGE_CARPET.pattern) < .6, JSON.stringify(IPIC_LOUNGE_CARPET));
  assert.ok(lum(IPIC_LOUNGE_CARPET.base) < 40, JSON.stringify(IPIC_LOUNGE_CARPET));
});

test('P17: the auditorium floor is a dark confetti carpet, aisles and rows alike', () => {
  for (const [a, d] of [[-4.85, 29.4], [-1.6, 29.4], [4.6, 32.4]]) assert.equal(below(a, d), 'Auditorium: ipic-confetti-carpet', `${a},${d}`);
});

test('P5: the reception sign stacks RIVER OAKS small beside a large DISTRICT', () => {
  const runs = districtSignLayout(1024, 256), [river, oaks, district] = ['RIVER', 'OAKS', 'DISTRICT'].map(t => runs.find(r => r.text === t));
  assert.ok(river && oaks && district, JSON.stringify(runs));
  assert.ok(district.size >= 2 * river.size && river.size === oaks.size, 'DISTRICT is at least twice the stacked words');
  assert.ok(river.y < oaks.y && Math.abs(river.x - oaks.x) < 1 && district.x > river.x, 'RIVER over OAKS, left of DISTRICT');
});

test('P7: the reception review camera faces the desk from its front, as IMG_9738 does', () => {
  const camera = IPIC_CAMERAS.find(c => c.name === 'reception');
  const desk = { a: 3.4, d: 3.5 }, [ea, , ed] = camera.eye, [ta, , td] = camera.target;
  assert.ok(ed < desk.d - 1.5, `eye ${camera.eye} is in front of the desk`);
  // The view direction passes within half a metre of the desk centre.
  const da = ta - ea, dd = td - ed, t = ((desk.a - ea) * da + (desk.d - ed) * dd) / (da * da + dd * dd);
  assert.ok(t > 0 && Math.hypot(ea + t * da - desk.a, ed + t * dd - desk.d) < .5, `view ${camera.eye} -> ${camera.target}`);
});
