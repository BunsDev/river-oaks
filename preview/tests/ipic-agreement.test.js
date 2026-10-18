// #364: the IPIC that players see and the IPIC the server collides with agree.
// Raycasts and triangle distances against the real built meshes (no textures),
// in the room frame: x = a, y = height above the street floor, z = -d.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWalkingEnvironment } from '../src/walking.js';
import { buildIpicInterior } from '../src/ipic-interior.js';
import { IPIC_FLIGHTS, IPIC_SCREEN, ipicFloor } from '../src/ipic-plan.js';
import { ipicClearance } from '../src/ipic-circulation.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(world);
const room = environment.rooms.find(r => r.interior === 'ipic-photo-v1');
const group = buildIpicInterior(room, { textures: false, local: true });
group.updateMatrixWorld(true);
const meshes = [];
// Instanced darts are placed at runtime by a match, not part of the room.
group.traverse(item => { if (item.isMesh && !item.isInstancedMesh) meshes.push(item); });
const serverFree = (a, d) => { const [x, n] = room.toWorld(a, d); return environment.isFree(x, -n); };
const serverGround = (a, d) => { const [x, n] = room.toWorld(a, d); return environment.groundAt(x, -n) - room.floor; };

// Every walkable point on a 0.25 m grid, by the server's own collision.
const walkable = [];
for (let a = room.aMin; a <= room.aMax; a += .25) for (let d = .25; d < room.depth; d += .25) if (serverFree(a, d)) walkable.push([a, d]);

// Triangles in a 0.5 m plan hash, for body-sized distance queries.
const CELL = .5, hash = new Map(), triangles = [];
for (const mesh of meshes) {
  const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, count = index ? index.count : p.count;
  const corner = k => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(k) : k).applyMatrix4(mesh.matrixWorld);
  for (let k = 0; k < count; k += 3) {
    const t = new THREE.Triangle(corner(k), corner(k + 1), corner(k + 2)), box = new THREE.Box3().setFromPoints([t.a, t.b, t.c]);
    const item = { t, box, mesh: mesh.name }; triangles.push(item);
    for (let i = Math.floor(box.min.x / CELL); i <= Math.floor(box.max.x / CELL); i++)
      for (let j = Math.floor(-box.max.z / CELL); j <= Math.floor(-box.min.z / CELL); j++) {
        const key = `${i},${j}`; if (!hash.has(key)) hash.set(key, []); hash.get(key).push(item);
      }
  }
}
// The nearest rendered surface to an upright body of `radius` standing at
// [a, d], from 0.12 m above its support to `top`. Surfaces within 0.12 m of
// the support beneath themselves are floor (a tread ahead on a flight is too).
function nearestSurface(a, d, radius, top = 1.9) {
  const ground = serverGround(a, d), seen = new Set(), point = new THREE.Vector3(), closest = new THREE.Vector3();
  let best = { distance: Infinity, mesh: null };
  for (let i = Math.floor((a - radius) / CELL); i <= Math.floor((a + radius) / CELL); i++)
    for (let j = Math.floor((d - radius) / CELL); j <= Math.floor((d + radius) / CELL); j++) for (const item of hash.get(`${i},${j}`) ?? []) {
      if (seen.has(item) || item.box.max.y < ground - .5 || item.box.min.y > ground + top) continue; seen.add(item);
      for (let y = ground + .12; y <= ground + top; y += .1) {
        item.t.closestPointToPoint(point.set(a, y, -d), closest);
        if (closest.y < ipicFloor(-closest.z) + .12 || closest.y > ground + top) continue;
        const flat = Math.hypot(closest.x - a, closest.z + d);
        if (flat < best.distance) best = { distance: flat, mesh: item.mesh, at: [closest.x, closest.y, -closest.z] };
      }
    }
  return best;
}

// The runtime-vs-photo review (docs/ipic-review/photo-review.md, P1) found open sky above the escalator
// runs from the mural landing: no ceiling covered either flight. Everywhere a body can stand indoors,
// looking straight up must meet the interior, never the district's sky.
// Photo review P18: from the mural landing the street showed past the landing's open side bays, and
// the district's ground showed under both escalator runs. From anywhere a body stands on the runs or
// the landing, every sight line at eye height must meet an opaque part of the interior (glass is seen
// through, so it does not count).
test('from the escalator runs and the mural landing every sight line meets the interior', () => {
  const raycaster = new THREE.Raycaster(), open = [];
  const opaque = hit => !(hit.object.material?.transparent && hit.object.material.opacity < 1);
  const directions = [];
  for (let k = 0; k < 16; k++) directions.push(new THREE.Vector3(Math.cos(k * Math.PI / 8), 0, Math.sin(k * Math.PI / 8)));
  for (let k = 0; k < 8; k++) directions.push(new THREE.Vector3(Math.cos(k * Math.PI / 4), -.7, Math.sin(k * Math.PI / 4)).normalize());
  for (const [a, d] of walkable.filter(([, d]) => d > 6.2 && d < 19.8)) {
    const eye = new THREE.Vector3(a, serverGround(a, d) + 1.6, -d);
    for (const direction of directions) {
      raycaster.set(eye, direction);
      if (raycaster.intersectObjects(meshes, false).some(opaque)) continue;
      // Looking back down the runs, the street shows through the glass frontage at d = 0, as it does
      // in the building; any other way out (a side, the floor, the back) is a hole in the interior.
      const toFacade = direction.z > 0 ? -eye.z / direction.z : Infinity, toSide = direction.x ? Math.max((room.aMin - eye.x) / direction.x, (room.aMax - eye.x) / direction.x) : Infinity;
      const toFloor = direction.y < 0 ? (eye.y + 1) / -direction.y : Infinity, toBack = direction.z < 0 ? (room.depth + eye.z) / -direction.z : Infinity;
      const exit = Math.min(toFacade, toSide, toFloor, toBack), leftAt = -(eye.z + direction.z * exit);
      // Only the runs' and the landing's own enclosure (d 6 to 20) is under test here; the reception's
      // and the lounge's outer sides face the neighbouring buildings in the world.
      if (exit === toFacade || leftAt < 6 || leftAt > 20) continue;
      open.push(`${a.toFixed(2)},${d.toFixed(2)} by ${exit === toSide ? 'side' : exit === toFloor ? 'floor' : 'back'}`);
    }
  }
  const where = {}; for (const line of open) { const [at, , face] = line.split(' '), [a, d] = at.split(',').map(Number), key = `${face} d${Math.floor(d)} a${a < -2.6 ? 'W' : a > 2.6 ? 'E' : 'lanes'}`; where[key] = (where[key] ?? 0) + 1; }
  assert.deepEqual(open.slice(0, 6), [], `${open.length} sight lines leave the interior: ${JSON.stringify(where)}`);
});

test('every walkable point has a rendered ceiling above it', () => {
  const raycaster = new THREE.Raycaster(), up = new THREE.Vector3(0, 1, 0), open = [];
  for (const [a, d] of walkable) {
    raycaster.set(new THREE.Vector3(a, serverGround(a, d) + 1.8, -d), up);
    if (!raycaster.intersectObjects(meshes, false).length) open.push(`${a.toFixed(2)},${d.toFixed(2)}`);
  }
  assert.deepEqual(open.slice(0, 6), [], `${open.length} walkable points see the sky`);
});

test('rendered floors, landings and treads sit on the server support height everywhere a body can stand', () => {
  const raycaster = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let flat = 0, treads = 0, worst = 0;
  for (const [a, d] of walkable) {
    const ground = serverGround(a, d);
    assert.ok(Math.abs(ground - ipicFloor(d)) < 1e-6, 'client and server share one support function');
    raycaster.set(new THREE.Vector3(a, ground + 1.2, -d), down);
    // The lowest surface under the ray is the floor; anything above it is furniture.
    const hit = raycaster.intersectObjects(meshes, false).filter(h => h.point.y > ground - .5).at(-1);
    assert.ok(hit, `no rendered floor under ${a},${d}`);
    const lift = hit.point.y - ground;
    const onFlight = IPIC_FLIGHTS.some(f => d > f.start && d < f.end);
    // Static treads rise 0.1 m at a time above the continuous ramp the server walks.
    if (onFlight) { treads++; assert.ok(lift >= -.002 && lift <= .102, `tread at ${a.toFixed(2)},${d.toFixed(2)} is ${lift.toFixed(3)} from support`); }
    else { flat++; assert.ok(Math.abs(lift) < .01, `floor at ${a.toFixed(2)},${d.toFixed(2)} is ${lift.toFixed(3)} from support (${hit.object.name})`); }
    worst = Math.max(worst, Math.abs(lift));
  }
  assert.ok(flat > 1000 && treads > 100, `${flat} flat and ${treads} tread samples`);
});

// Parts drawn without collision that a 0.35 m server body can touch, each with
// its region and closest approach measured on this revision. Seat zones stay
// walkable for the sit/stand protocol (a cushion centre must be free); the
// rest are reported art defects (docs/ipic-interior.md, "Circulation").
// Anything else in walkable space, or closer than recorded, fails.
const DRAWN_WITHOUT_COLLISION = [
  // Footrests and base ends collide since 2026-10-15 (Val); only the base under each cushion centre is left.
  { mesh: 'Auditorium: ipic-black-rubber', a: [-2.7, 3.5], d: [27.95, 31.05], closest: 0, why: 'recliner bases under the cushion centres (seat zone)' },
  { mesh: 'Upper lounge: ipic-olive-brown-sofa', a: [-4.85, -3.25], d: [20.7, 21.3], closest: 0, why: 'sofa cushions (seat zone)' },
  { mesh: 'Auditorium: ipic-weathered-timber', a: [4.4, 4.5], d: [27.7, 31.6], closest: .17, why: 'recliner side tables' },
  { mesh: 'Escalators: ipic-smoked-glass', a: [-2.35, 2.5], d: [5.45, 20.55], closest: .27, why: 'pitched glass balustrades overhang their rail colliders at the lane ends' },
  { mesh: 'Escalators: ipic-taupe-stacked-stone', a: [-2.85, 3], d: [12.45, 20.55], closest: .27, why: 'split-face stone courses run past the flight walls onto the landing' },
  { mesh: 'Upper lounge: ipic-cognac-leather', a: [-4.6, -1], d: [21.7, 23.3], closest: .29, why: 'tub chair shells overhang their colliders' },
  { mesh: 'Reception: ipic-hanging-greenery', a: [-5.6, 6], d: [.95, 2.3], closest: .25, why: 'planter foliage' },
  { mesh: 'Upper lounge: ipic-hanging-greenery', a: [-5.85, 1.75], d: [24.7, 25.8], closest: .13, why: 'planter foliage; the west planter moved 5 cm to widen the passage (2026-10-15)' },
  { mesh: 'Auditorium: ipic-cinema-screen', a: [-4.6, 5.25], d: [33.45, 33.55], closest: .28, why: 'the screen is 0.13 m in front of the wall the room edge stops a body at' },
];

test('the space the server lets a body walk through is visually empty, apart from recorded parts', () => {
  const intrusions = walkable.map(([a, d]) => ({ a, d, ...nearestSurface(a, d, .35) })).filter(s => s.distance < .35 - .01);
  const unexplained = intrusions.filter(s => !DRAWN_WITHOUT_COLLISION.some(k => k.mesh === s.mesh && s.a >= k.a[0] && s.a <= k.a[1]
    && s.d >= k.d[0] && s.d <= k.d[1] && s.distance >= k.closest - .005));
  assert.deepEqual(unexplained.map(s => `${s.a.toFixed(2)},${s.d.toFixed(2)} ${s.mesh} ${s.distance.toFixed(3)}`), []);
});

test('every collision box has rendered geometry inside it at walking height', () => {
  const invisible = room.obstacles.filter((o, index) => {
    const fixture = room.fixtures[index], bottom = fixture.y, top = fixture.y + Math.min(fixture.h, 2);
    const box = new THREE.Box3(new THREE.Vector3(o.a0, bottom, -o.d1), new THREE.Vector3(o.a1, top, -o.d0));
    return !triangles.some(item => item.box.intersectsBox(box) && item.t.intersectsBox(box));
  }).map((o, index) => room.fixtures[room.obstacles.indexOf(o)].kind);
  assert.deepEqual(invisible, []);
});

test('the screen material plane matches the shared screen bounds', () => {
  const screen = meshes.find(mesh => mesh.material === group.userData.screen);
  const box = new THREE.Box3().setFromObject(screen);
  assert.deepEqual([box.min.x, box.max.x, box.min.y, box.max.y, -box.max.z].map(v => +v.toFixed(3)),
    [IPIC_SCREEN.a - IPIC_SCREEN.width / 2, IPIC_SCREEN.a + IPIC_SCREEN.width / 2, 6 + IPIC_SCREEN.y - IPIC_SCREEN.height / 2, 6 + IPIC_SCREEN.y + IPIC_SCREEN.height / 2, IPIC_SCREEN.d].map(v => +v.toFixed(3)));
  assert.equal(group.userData.screenAspect, IPIC_SCREEN.width / IPIC_SCREEN.height);
  assert.ok(ipicClearance(room, [IPIC_SCREEN.a, IPIC_SCREEN.d - .5]) > 0);
});

test.after(() => group.userData.dispose());
