// The CT Club underground techno club room (Val, 2026-11-04): the plan in the
// store-room frame hosts need to place and walk it, and the interior renderer
// produces the shell, the edge-glow bar and seating, the edge-lit dancefloor tiles,
// the corner strobes and RGB spots, and the disco ball whose lasers burst briefly.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CLUB, CLUB_INTERIOR, CLUB_SPOTS, CLUB_STROBES, DISCO_BALL, CLUB_LASERS, CLUB_AMBIENTS,
  planCtClub, configureCtClub, atClubBar, atClubDancefloor, atClubLounge,
} from '../src/ct-club-plan.js';
import { buildCtClubInterior } from '../src/ct-club-interior.js';

const room = planCtClub();

test('the plan is 40 m long and 6 m tall (20 and 3 bodies stacked), in the store-room shape', () => {
  assert.equal(room.id, 'ct-club');
  assert.equal(room.storeId, 'venue:ct-club');
  assert.equal(room.width, 16);
  assert.equal(room.depth, 40);
  assert.equal(room.height, 6);
  assert.equal(room.interior, CLUB_INTERIOR);
  assert.equal(CLUB.depth, 40);
  assert.equal(CLUB.height, 6);
  assert.ok(room.contains(...room.toWorld(0, 5), 0), 'a centre point is inside');
  assert.equal(room.contains(...room.toWorld(0, -1), 0), false, 'the pavement outside is not inside');
  assert.equal(room.contains(...room.toWorld(9, 20), 0), false, 'beyond the side wall is not inside');
  assert.deepEqual(room.toLocal(...room.toWorld(3, 11)), [3, 11]);
  assert.equal(room.footprint.length, 4);
});

test('the zones lay out entry, bar, dancefloor and lounge on the 40 m axis', () => {
  assert.ok(atClubDancefloor(0, 24), 'the ball sits on the dancefloor');
  assert.equal(atClubBar(0, 24), false);
  assert.ok(atClubBar(-6, 10), 'the bar occupies the left wall');
  assert.ok(atClubLounge(5, 14), 'the couches sit on the right');
  assert.equal(atClubDancefloor(5, 14), false);
  // The DJ booth and speakers sit behind the dancefloor, inside the room.
  const dj = room.fixtures.find(f => f.kind === 'dj-booth');
  assert.ok(dj && dj.d >= 33 && dj.d <= 34.6);
});

test('the four corner strobes, the four RGB corner spots and the ball are fixtures', () => {
  const strobes = room.fixtures.filter(f => f.kind === 'club-strobe');
  const spots = room.fixtures.filter(f => f.kind === 'club-spot-rgb');
  assert.deepEqual(strobes.map(s => [s.a, s.d]), CLUB_STROBES.map(s => [s.a, s.d]));
  assert.deepEqual(spots.map(s => [s.a, s.d]), CLUB_SPOTS.map(s => [s.a, s.d]));
  const ball = room.fixtures.find(f => f.kind === 'disco-ball');
  assert.deepEqual([ball.a, ball.d, ball.y], [DISCO_BALL.a, DISCO_BALL.d, DISCO_BALL.y]);
  assert.ok(strobes.every(s => Math.abs(Math.abs(s.a) - 7.3) < 1e-9 && (s.d < 2 || s.d > 38)), 'strobes hug the corners');
  // Ceiling-mounted lights are not collision, but the furniture and speakers are.
  assert.equal(room.obstacles.some(o => o.a0 < -0.4 && o.a1 > 0.4 && o.d0 < 24.5 && o.d1 > 23.5), false, 'the dancefloor stays walkable under the ball');
  assert.ok([12].includes(room.obstacles.length), `speaker wall, DJ booth, bar, couches, chairs, tables (${room.obstacles.length})`);
});

test('light positions cover the room and map back into it', () => {
  assert.ok(room.lights.length >= 10, `a hall this long needs several positions (${room.lights.length})`);
  for (const light of room.lights) {
    assert.ok(light.a > -8 + 0.2 && light.a < 8 - 0.2 && light.d > 0.2 && light.d < 40 - 0.2, `light inside the room at ${light.a},${light.d}`);
    assert.ok(light.y > 4 && light.y <= 6, 'lights hang from the ceiling');
  }
  assert.ok(room.lights.some(light => light.accent && light.d < 4), 'the entry has an accent light');
});

test('configure is stable and the plan frame round-trips through any facade', () => {
  const second = planCtClub({ east: 120, north: -40, yaw: Math.PI / 3 });
  assert.equal(second.floor, 0, 'position undecided: floor stays 0 until placed');
  const local = second.toLocal(...second.toWorld(0, 5));
  assert.ok(Math.abs(local[0]) < 1e-9 && Math.abs(local[1] - 5) < 1e-9, 'planFrame round-trips through any facade');
  assert.deepEqual(configureCtClub({ ...room, fixtures: [], obstacles: [], lights: [] }), room, 'configure only fills room data');
});

test('the interior builds under node without canvas, instanced and disposed', () => {
  const root = buildCtClubInterior(room, { local: true });
  let meshes = 0, instances = 0, sprites = 0;
  root.traverse(item => {
    if (item.isInstancedMesh) { meshes += 1; instances += item.count; }
    else if (item.isMesh) meshes += 1;
    if (item.isSprite) sprites += 1;
  });
  assert.ok(meshes > 10, `a whole interior was built (${meshes} meshes)`);
  assert.ok(instances > 600, `tiles, bottles, columns and drivers are instanced (${instances})`);
  assert.equal(sprites, 0, 'no sprites: cheap, deterministic glows only');
  assert.equal(root.userData.room, room);
  assert.equal(root.userData.lightPositions.length, room.lights.length);
  assert.ok(root.userData.ready instanceof Promise);

  // The mirrored ball, its ring and the lasers exist.
  assert.ok(root.getObjectByName('Discoball mirror facets'));
  assert.ok(root.children.some(group => group.name === 'Disco ball'));
  const laserMats = materials(root).filter(mat => mat.name === 'club-laser');
  assert.equal(laserMats.length, CLUB_LASERS.length);
  const strobeLenses = meshesNamed(root, 'club-strobe-lens');
  const spots = meshesNamed(root, 'club-spot-rgb');
  assert.equal(strobeLenses.length, 4);
  assert.equal(spots.length, 4);

  root.userData.tick(0.5);   // inside a laser burst
  assert.notEqual(laserMats[0].opacity, 0, 'a laser shows during a burst');
  root.userData.tick(5);     // between bursts
  assert.equal(laserMats.every(mat => mat.opacity === 0), true, 'lasers rest between bursts');
  const before = laserMats[0].color.getHex();
  root.userData.tick(1.5);    // still inside the next burst window
  assert.notEqual(laserMats[0].color.getHex(), before, 'beam colours cycle RGB');
  assert.doesNotThrow(() => root.userData.dispose());
});

test('the interior is placed by the plan frame and its pools map home', () => {
  const placed = buildCtClubInterior(planCtClub({ east: 40, north: 20, yaw: 0.6 }));
  const placedRoom = placed.userData.room;
  assert.ok(Math.abs(placed.position.x - 40) < 1e-6, 'root sits on the facade');
  for (const item of placed.userData.lightPositions) {
    const [a, d] = placedRoom.toLocal(item.position.x, -item.position.z);
    assert.ok(a > -8 && a < 8 && d > 0 && d < 40, `position ${item.position.toArray()} maps into the room`);
  }
  placed.userData.dispose();
});

test('reduced motion keeps the room still', () => {
  const root = buildCtClubInterior(room, { local: true, reducedMotion: true });
  const ball = root.getObjectByName('Disco ball');
  ball.rotation.set(0, 0, 0);
  root.userData.tick(2);
  assert.deepEqual([ball.rotation.x, ball.rotation.y, ball.rotation.z], [0, 0, 0], 'no spin under reduced motion');
  const laser = materials(root).find(mat => mat.name === 'club-laser');
  assert.equal(laser.opacity, 0, 'no laser bursts under reduced motion');
  root.userData.dispose();
});

test('instances are placed individually and their culling spheres cover the hall (culling regression)', () => {
  const root = buildCtClubInterior(room, { local: true });
  const instanced = root.children.filter(item => item.isInstancedMesh);
  assert.ok(instanced.length > 5, `several instanced batches exist (${instanced.length})`);
  const scratch = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const mesh of instanced) {
    const points = [];
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, scratch); points.push(point.setFromMatrixPosition(scratch).clone()); }
    if (points.length < 2) continue;
    // Instances must not collapse onto one point (the old shared-matrix bug).
    const xs = points.map(v => v.x), ys = points.map(v => v.y), zs = points.map(v => v.z);
    const span = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) + Math.max(...zs) - Math.min(...zs);
    assert.ok(span > 2, `${mesh.name} spans > 2 m (${span.toFixed(1)} m)`);
    // The culling sphere must contain every instance, or a far view culls the batch.
    mesh.computeBoundingSphere();
    for (const p of points) {
      const dx = p.x - mesh.boundingSphere.center.x, dy = p.y - mesh.boundingSphere.center.y, dz = p.z - mesh.boundingSphere.center.z;
      assert.ok(dx * dx + dy * dy + dz * dz <= mesh.boundingSphere.radius * mesh.boundingSphere.radius + 1e-6, `${mesh.name} sphere covers ${p.toArray()}`);
    }
  }
  // The dancefloor's near-black tile base alone must be one instanced slab grid.
  const tiles = root.children.find(item => item.isInstancedMesh && item.material?.name === 'club-black');
  assert.ok(tiles && tiles.count > 200, `the dancefloor dark tile base is instanced (${tiles?.count})`);
  root.userData.dispose();
});

test('the interior carries ten named ambient lights across the zones, automation-ready', () => {
  const root = buildCtClubInterior(room, { local: true });
  assert.equal(room.ambients.length, 10);
  const { group, list, byName } = root.userData.lights;
  assert.ok(group, 'a lights group is exposed');
  assert.equal(group.name, 'CT Club lights');
  assert.equal(list.length, 10, 'exactly ten ambient lights');
  assert.equal(group.children.length, 10);
  for (const light of list) {
    assert.ok(light.isAmbientLight, `${light.name} is an AmbientLight`);
    assert.ok(byName[light.name] === light, `${light.name} is reachable by name`);
    assert.ok(light.userData.zone && light.userData.role, `${light.name} carries zone/role metadata`);
    // Anchored inside the hall, one per CLUB_AMBIENTS spec, for a later swap.
    const spec = CLUB_AMBIENTS.find(s => `light.ambient.${s.key}` === light.name);
    assert.ok(spec, `spec exists for ${light.name}`);
    assert.deepEqual([light.position.x, light.position.y, light.position.z], [spec.a, spec.y, -spec.d]);
    assert.ok(spec.a > -8 && spec.a < 8 && spec.d > 0 && spec.d < 40 && spec.y > 0 && spec.y <= 6, `${spec.key} sits inside the hall`);
    light.intensity = spec.intensity + 1;   // an automation can drive it by name
  }
  const boosted = byName['light.ambient.dancefloor.center'].intensity;
  assert.ok(Math.abs(boosted - (0.14 + 1)) < 1e-9, `automation by name reaches the light (${boosted})`);
  root.userData.dispose();
  assert.equal(root.children.length, 0, 'dispose clears the interior (lights group included)');
});

test('near-black fixtures get thin bright outlines in the zone colours', () => {
  const root = buildCtClubInterior(room, { local: true });
  const outlineGroups = root.children.filter(child => child.isLineSegments && /^club-outlines:/.test(child.name));
  assert.ok(outlineGroups.length >= 3, `yellow, green and purple outline batches exist (${outlineGroups.length})`);
  const names = outlineGroups.map(g => g.name);
  for (const color of ['yellow', 'green', 'purple']) {
    assert.ok(names.some(n => n.endsWith(color)), `${color} outline batch exists`);
  }
  // The dancefloor grid alone must produce a large shared yellow line batch.
  const yellow = outlineGroups.find(g => g.name.endsWith('yellow'));
  assert.ok(yellow.geometry.attributes.position.count > 500, `tile grid outline has many vertices (${yellow.geometry.attributes.position.count})`);
  // One shared basic material per outline colour, tone-mapped off (unlit bright).
  for (const orange of outlineGroups) assert.ok(orange.material.toneMapped === false, `${orange.name} is an unlit bright line`);
  root.userData.dispose();
});

test('each wall uses its own brightened tint and the lounge seating glows', () => {
  const root = buildCtClubInterior(room, { local: true });
  const mats = new Map(materials(root).map(mat => [mat.name, mat]));
  const lum = hex => (((hex >> 16) & 255) * 0.2126 + ((hex >> 8) & 255) * 0.7152 + (hex & 255) * 0.0722);
  const base = lum(mats.get('club-concrete').color.getHex());
  for (const name of ['club-concrete-back', 'club-concrete-left', 'club-concrete-right', 'club-concrete-front', 'club-concrete-ceil']) {
    assert.ok(mats.has(name), `${name} exists`);
    assert.ok(lum(mats.get(name).color.getHex()) > base + 6, `${name} is brighter than neutral concrete`);
  }
  // The couches/chairs/tables spill violet: one shared additive material, instanced.
  assert.ok(mats.has('club-seat-spill'), 'the violet light-spill material exists');
  const spill = materials(root).filter(mat => mat.name === 'club-seat-spill').length;
  assert.equal(spill, 1, 'one spill material serves all lounge seating');
  const spillMeshes = root.children.filter(item => item.isInstancedMesh && item.material?.name === 'club-seat-spill');
  assert.ok(spillMeshes.length === 1 && spillMeshes[0].count >= 6, `six light pads under couches/chairs/tables (${spillMeshes[0]?.count})`);
  assert.equal(spillMeshes[0].material.blending, THREE.AdditiveBlending, 'spill adds light, never occludes');
  root.userData.dispose();
});

function materials(root) {
  const out = [];
  root.traverse(item => { if (item.material) out.push(...[item.material].flat()); });
  return out;
}
function meshesNamed(root, materialName) {
  return materials(root).filter(mat => mat.name === materialName);
}