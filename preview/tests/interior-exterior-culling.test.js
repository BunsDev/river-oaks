import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { IPIC_AUDITORIUM, canCullExterior, canCullIpicAuditorium, renderOnly, renderWithoutExterior } from '../src/interior-exterior-culling.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { IPIC_AUDITORIUM_ROWS, IPIC_SCREEN } from '../src/ipic-plan.js';

function cameraAt(position, look) {
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 100);
  camera.position.set(...position);
  camera.lookAt(...look);
  return camera;
}

function room(rotated = false) {
  return { generatedPlan: {}, floor: 0, height: 4, aMin: -5, aMax: 5,
    contains: rotated ? (east, north) => east < 0 && east > -9 && Math.abs(north) < 5
      : (east, north) => north > 0 && north < 9 && Math.abs(east) < 5,
    toWorld: rotated ? (a, d) => [-d, a] : (a, d) => [a, d] };
}

test('opaque interior view culls outdoors but frontage and exterior views retain it', () => {
  const straight = room();
  assert.equal(canCullExterior(cameraAt([0, 1.7, -4], [0, 1.7, -8]), straight), true);
  assert.equal(canCullExterior(cameraAt([0, 1.7, -0.6], [0, 1.7, -8]), straight), true);
  assert.equal(canCullExterior(cameraAt([0, 1.7, -4], [0, 1.7, 0]), straight), false);
  assert.equal(canCullExterior(cameraAt([0, 1.7, 2], [0, 1.7, -4]), straight), false);
  assert.equal(canCullExterior(cameraAt([0, 7, -4], [0, 1.7, -8]), straight), false);
  assert.equal(canCullExterior(cameraAt([0, 1.7, -4], [0, 1.7, -8]), { ...straight, generatedPlan: null }), false);
  const turned = room(true);
  assert.equal(canCullExterior(cameraAt([-4, 1.7, 0], [-8, 1.7, 0]), turned), true);
  assert.equal(canCullExterior(cameraAt([-4, 1.7, 0], [0, 1.7, 0]), turned), false);
});

test('one render hides only exterior children and restores all visibility on failure', () => {
  const world = new THREE.Group(), exterior = new THREE.Group(), interior = new THREE.Group(), userHidden = new THREE.Group();
  userHidden.visible = false;
  world.add(exterior, interior, userHidden);
  assert.throws(() => renderWithoutExterior(world, interior, () => {
    assert.equal(exterior.visible, false);
    assert.equal(interior.visible, true);
    assert.equal(userHidden.visible, false);
    throw new Error('render failed');
  }), /render failed/);
  assert.equal(exterior.visible, true);
  assert.equal(interior.visible, true);
  assert.equal(userHidden.visible, false);
});

test('one render keeps only the named branches, opening the groups that hold them', () => {
  // world > [district, layer > [interiors > [ipic, otherBatch], people > [ipicPeople, otherPeople], shell], userHidden]
  const node = name => Object.assign(new THREE.Group(), { name });
  const world = node('world'), district = node('district'), layer = node('layer'), interiors = node('interiors'), ipic = node('ipic'), otherBatch = node('other');
  const people = node('people'), ipicPeople = node('ipic people'), otherPeople = node('other people'), shell = node('shell'), userHidden = node('user hidden');
  userHidden.visible = false;
  interiors.add(ipic, otherBatch); people.add(ipicPeople, otherPeople); layer.add(interiors, people, shell); world.add(district, layer, userHidden);
  const all = [district, layer, interiors, ipic, otherBatch, people, ipicPeople, otherPeople, shell];
  assert.throws(() => renderOnly(world, [ipic, ipicPeople], () => {
    assert.deepEqual(all.filter(item => item.visible).map(item => item.name), ['layer', 'interiors', 'ipic', 'people', 'ipic people']);
    assert.equal(userHidden.visible, false);
    throw new Error('render failed');
  }), /render failed/);
  assert.ok(all.every(item => item.visible), 'every hidden branch is restored');
  assert.equal(userHidden.visible, false, 'a branch hidden beforehand stays hidden');
});

// The real IPIC room, as the walking environment and the renderer see it.
const ipic = createWalkingEnvironment(JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)))).rooms.find(r => r.interior === 'ipic-photo-v1');
// Room frame [a, h, d] (h above the street floor) to Three.js [east, up, -north].
const at = ([a, h, d]) => { const [east, north] = ipic.toWorld(a, d); return [east, ipic.floor + h, -north]; };
const ipicCamera = (eye, target) => { const camera = new THREE.PerspectiveCamera(67, 1.6, 0.1, 500); camera.position.set(...at(eye)); camera.lookAt(...at(target)); return camera; };

test('the IPIC auditorium partition in the plan is the plane the culling test keeps in view', () => {
  const walls = ipic.fixtures.filter(item => item.kind === 'ipic-cinema-wall');
  assert.equal(walls.length, 2);
  for (const wall of walls) assert.deepEqual([wall.d, wall.y], [IPIC_AUDITORIUM.back, IPIC_AUDITORIUM.base]);
  // The two walls and the doorway between them span the room, and reach its top.
  const spans = walls.map(wall => [wall.a - wall.w / 2, wall.a + wall.w / 2]).sort((x, y) => x[0] - y[0]);
  assert.ok(Math.abs(spans[0][0] - ipic.aMin) < 1e-9 && Math.abs(spans[1][1] - ipic.aMax) < 1e-9);
  for (const wall of walls) assert.ok(Math.abs(wall.y + wall.h - ipic.height) < 1e-9);
});

test('inside the IPIC auditorium, facing away from its partition, the district is not drawn', () => {
  // A front-row recliner's eye on the screen, and a look along the cross aisle behind the back row.
  const front = IPIC_AUDITORIUM_ROWS.at(-1), screen = [IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d];
  assert.equal(canCullIpicAuditorium(ipicCamera([front.a, 6 + front.floor + 1.22, 30], screen), ipic), true);
  assert.equal(canCullIpicAuditorium(ipicCamera([-4.7, 7.65, 27.3], [-3.2, 8.2, 33.7]), ipic), true);
  // Any view that can reach the partition plane keeps the district: back to the doorway,
  // or sideways from the back of the room.
  assert.equal(canCullIpicAuditorium(ipicCamera([-4.7, 7.65, 27.3], [-4.7, 7.5, 20]), ipic), false);
  assert.equal(canCullIpicAuditorium(ipicCamera([-3.3, 7.6, 30], [-6, 7.6, 27.5]), ipic), false);
  // Past the wing's end wall is back of house, not the auditorium.
  assert.equal(canCullIpicAuditorium(ipicCamera([0, 7.6, 30], [-6, 7.6, 30]), ipic), false);
  // Outside the auditorium: the lounge, the reception, above its top.
  assert.equal(canCullIpicAuditorium(ipicCamera([-2, 7.6, 24], [.3, 8.5, 33.79]), ipic), false);
  assert.equal(canCullIpicAuditorium(ipicCamera([0, 1.65, 3], [0, 1.65, 9]), ipic), false);
  assert.equal(canCullIpicAuditorium(ipicCamera([0, 10.6, 31], [.3, 8.5, 33.79]), ipic), false);
  // Other rooms never qualify, and generated rooms keep their own test.
  assert.equal(canCullIpicAuditorium(ipicCamera([-.6, 7.22, 31], [.3, 8.5, 33.79]), { ...ipic, interior: null }), false);
  assert.equal(canCullExterior(ipicCamera([-.6, 7.22, 31], [.3, 8.5, 33.79]), ipic), false);
});
