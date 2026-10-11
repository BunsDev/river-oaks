import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { planWorkplaceRoom, validateRoomPlan, findRoute, buildWorkplaceGraybox, AVATAR_ENVELOPE, CIRCULATION_WIDTH, FIXTURE_SITE } from '../src/workplace-room.js';
import { STATION_IDS } from '../src/workplace-contract.js';
import { ROOM_HEIGHT } from '../src/store-rooms.js';

const envelope = JSON.parse(readFileSync(new URL('../../docs/level-design/workplace-coworking-fixture/avatar-envelope.json', import.meta.url)));

test('the room envelope comes from the measured widest playable looks', () => {
  assert.equal(AVATAR_ENVELOPE.bodyHalfWidth >= envelope.widestBody.widthM / 2, true);
  assert.equal(AVATAR_ENVELOPE.turningRadius >= envelope.widestTurning.radiusM, true);
  assert.equal(CIRCULATION_WIDTH >= 2 * envelope.widestTurning.radiusM, true, 'the primary lane fits the widest turning body');
  assert.equal(Object.keys(envelope.looks).length, 22);
});

test('the fixture studio fits, keeps its stations unique and reuses the interior height', () => {
  const room = planWorkplaceRoom();
  assert.equal(room.site.id, FIXTURE_SITE.id);assert.match(room.site.label, /fixture/);
  assert.equal(room.height, ROOM_HEIGHT);
  assert.deepEqual(room.stations.map(station => station.id), [...STATION_IDS]);
  assert.deepEqual(validateRoomPlan(room), []);
});

test('the player can reach each desk, the review table and the street with the other desk occupied', () => {
  const room = planWorkplaceRoom();
  const [first, second] = room.stations;
  const seated = [[...first.seat, AVATAR_ENVELOPE.seatedRadius], [...second.seat, AVATAR_ENVELOPE.seatedRadius]];
  // Both companions seated, a second resident standing at the review table.
  const reviewer = [...room.review.socket, AVATAR_ENVELOPE.bodyHalfWidth];
  const out = findRoute(room, room.entrance, room.outside, {blockers: [...seated, reviewer]});
  assert.ok(out, 'the exit stays open with every seat and the review spot taken');
  for (const [x, d] of out) for (const [bx, bd, br] of seated) assert.ok(Math.hypot(x - bx, d - bd) >= br + AVATAR_ENVELOPE.bodyHalfWidth - 1e-9);
  assert.ok(findRoute(room, room.outside, second.approach, {blockers: [seated[0]]}));
});

test('the validator rejects a blocked door, a crowded socket and a wall-crossing route', () => {
  const room = planWorkplaceRoom();
  const blocked = {...room, obstacles: [...room.obstacles, {id: 'crate', kind: 'storage', x0: -0.6, x1: 0.6, d0: 0.4, d1: 1.0, height: 1}]};
  assert.ok(validateRoomPlan(blocked).some(problem => problem.startsWith('no route') || problem.startsWith('no turning')));
  const crowded = {...room, review: {...room.review, socket: [room.width / 2 - 2.2, 3.4]}};
  assert.ok(validateRoomPlan(crowded).some(problem => problem.startsWith('no turning circle')));
  // From inside the west wall's edge to outside: only the door counts.
  const route = findRoute(room, [-3.2, 0.8], [-3.5, -1.5]);
  assert.ok(route);
  assert.ok(route.every(([x, d]) => d >= AVATAR_ENVELOPE.bodyHalfWidth || d <= -AVATAR_ENVELOPE.bodyHalfWidth || Math.abs(x) <= room.door.halfWidth - AVATAR_ENVELOPE.bodyHalfWidth + 1e-9), 'no point crosses the wall beside the door');
});

test('the graybox builds from the plan and releases its GPU resources', () => {
  const room = planWorkplaceRoom();
  const scene = new THREE.Scene();
  const graybox = buildWorkplaceGraybox(THREE, room);scene.add(graybox.object);
  const bounds = new THREE.Box3().setFromObject(graybox.object);
  assert.ok(bounds.max.y >= ROOM_HEIGHT - 1e-6 && bounds.max.y <= ROOM_HEIGHT + 0.01);
  assert.ok(bounds.min.z <= -room.depth);
  let disposed = 0;
  graybox.object.traverse(node => { if (node.geometry) node.geometry.addEventListener('dispose', () => disposed++); });
  graybox.dispose();
  assert.equal(scene.children.length, 0);
  assert.ok(disposed > room.obstacles.length);
});
