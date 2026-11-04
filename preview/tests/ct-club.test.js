// The CT Club underground techno club room (Val, 2026-11-04): the plan in the
// store-room frame hosts need to place and walk it, and the interior renderer
// produces the shell, the edge-glow bar and seating, the edge-lit dancefloor tiles,
// the corner strobes and RGB spots, and the disco ball whose lasers burst briefly.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CLUB, CLUB_INTERIOR, CLUB_SPOTS, CLUB_STROBES, DISCO_BALL, CLUB_LASERS,
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

function materials(root) {
  const out = [];
  root.traverse(item => { if (item.material) out.push(...[item.material].flat()); });
  return out;
}
function meshesNamed(root, materialName) {
  return materials(root).filter(mat => mat.name === materialName);
}