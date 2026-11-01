import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { VENUE_IDS, FIVE_ROOMS_RULES } from '../../shared/city-kit/five-rooms-layout.js';
import { PINK_JET_AGE } from '../../shared/city-kit/pink-jet-age.js';
import { buildFiveRoomsShells, VENUE_BUILDERS } from '../src/five-rooms/index.js';
import { FRONT, SHELL_MATERIALS, createShellKit, shellMaterials, venueFrame } from '../src/five-rooms/shells.js';
import { buildRibbon } from '../src/ribbon-finish.js';
import { findDepthFights } from '../src/depth-layer-audit.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const contract = read('../../config/ribbon/five-rooms.json'), world = read('../public/data/district.json');
const PINK = 'pink-jet-age';
const scan = (...objects) => { const root = new THREE.Group(); for (const object of objects) root.add(object); root.updateMatrixWorld(true); return findDepthFights(root); };
const named = fight => `${fight.a} × ${fight.b} ${Math.round(fight.gap * 1000)} mm facing [${fight.normal}] at ${fight.at.map(v => v.toFixed(1))}`;

// One venue on its own: its parts per material, before any merge, in scene metres.
function buildVenue(venue) {
  const materials = shellMaterials(), kit = createShellKit(materials);
  VENUE_BUILDERS[venue.id](kit, venueFrame(venue));
  const { merged, venues } = kit.finish(), result = { materials: [...merged.keys()].sort(), record: venues[0], merged };
  return result;
}
const vertices = geometry => { const p = geometry.attributes.position, out = []; for (let i = 0; i < p.count; i++) out.push([p.getX(i), p.getY(i), p.getZ(i)]); return out; };

test('classic builds nothing; pink-jet-age builds all five rooms', () => {
  for (const finish of ['classic', undefined, 'unknown']) {
    const group = buildFiveRoomsShells(contract, { finish });
    assert.equal(group.children.length, 0, `${finish}: no meshes`);
    assert.deepEqual(group.userData, {}, `${finish}: nothing recorded`);
  }
  const group = buildFiveRoomsShells(contract, { finish: PINK }), { fiveRooms } = group.userData;
  assert.deepEqual(fiveRooms.venues.map(venue => venue.id), [...VENUE_IDS]);
  assert.equal(fiveRooms.version, contract.version);
  assert.ok(fiveRooms.venues.every(venue => venue.parts > 0));
  group.userData.dispose();
});

test('one mesh per material across all five rooms: a bounded number of draw calls', () => {
  const group = buildFiveRoomsShells(contract, { finish: PINK }), { fiveRooms } = group.userData;
  assert.equal(fiveRooms.drawCalls, group.children.length);
  assert.ok(group.children.length <= Object.keys(SHELL_MATERIALS).length, `${group.children.length} draw calls`);
  assert.equal(new Set(group.children.map(mesh => mesh.material)).size, group.children.length, 'no material drawn twice');
  let triangles = 0;
  group.traverse(item => { if (item.isMesh) triangles += item.geometry.attributes.position.count / 3; });
  assert.ok(triangles < 30000, `${triangles} triangles`);
  group.userData.dispose();
});

test('each room reads as a different building: roof form, entrance and glazing all differ, one material family', () => {
  const { venues } = buildFiveRoomsShells(contract, { finish: PINK }).userData.fiveRooms;
  for (const key of ['roof', 'entrance', 'glazing']) {
    const values = venues.map(venue => venue.form[key]);
    assert.equal(new Set(values).size, venues.length, `${key}: ${values.join(', ')}`);
  }
  // The family: pink, ivory, mint glass, chrome and ink, plus a warm lamp.
  const palette = new Set([PINK_JET_AGE.pink, PINK_JET_AGE.ivory, PINK_JET_AGE.mintGlass, PINK_JET_AGE.chrome, PINK_JET_AGE.ink, '#f6e7c4'].map(c => c.toLowerCase()));
  for (const spec of Object.values(SHELL_MATERIALS)) assert.ok(palette.has(spec.color.toLowerCase()), spec.color);
  // Distinct geometry too, not only labels: each venue's own material set or part count differs.
  const signatures = contract.venues.map(venue => { const { materials, record } = buildVenue(venue); return `${materials.join('+')}#${record.parts}`; });
  assert.equal(new Set(signatures).size, signatures.length, signatures.join(' | '));
});

test('every shell is built from its contract record: a moved venue moves its shell and nothing else', () => {
  const shift = [5, -3], rise = 0.5;
  const moveSite = p => [p[0] + shift[0], p[1] + shift[1], ...(p.length === 3 ? [p[2] + rise] : [])];
  for (const venue of contract.venues) {
    const moved = structuredClone(venue);
    moved.footprint = moved.footprint.map(moveSite);
    moved.floor = { ...moved.floor, height: moved.floor.height + rise, at: moveSite(moved.floor.at) };
    moved.entrances = moved.entrances.map(entrance => ({ ...entrance, centre: moveSite(entrance.centre) }));
    if (moved.interior) moved.interior = { ...moved.interior, floor: moved.interior.floor.map(moveSite) };
    // Campus-frame anchors (the Overlook lanterns) belong to the Gardens contract and stay put.
    moved.attachments = moved.attachments.map(item => item.frame === 'campus' ? item : { ...item, position: moveSite(item.position) });
    const before = buildVenue(venue), after = buildVenue(moved);
    assert.deepEqual(after.materials, before.materials, venue.id);
    for (const [key, geometry] of before.merged) {
      const a = vertices(geometry), b = vertices(after.merged.get(key));
      assert.equal(b.length, a.length, `${venue.id} ${key}: same parts`);
      // Scene: x east, y up, z = -north. Lanterns (campus frame) do not move.
      const movedCount = a.filter((p, i) => Math.abs(b[i][0] - p[0] - shift[0]) < 2e-3 && Math.abs(b[i][1] - p[1] - rise) < 2e-3 && Math.abs(b[i][2] - p[2] + shift[1]) < 2e-3).length;
      const stillCount = a.filter((p, i) => Math.abs(b[i][0] - p[0]) < 2e-3 && Math.abs(b[i][1] - p[1]) < 2e-3 && Math.abs(b[i][2] - p[2]) < 2e-3).length;
      assert.equal(movedCount + stillCount, a.length, `${venue.id} ${key}: every vertex follows its anchor`);
      if (venue.id !== 'venue:studios-overlook') assert.equal(movedCount, a.length, `${venue.id} ${key}: all moved`);
    }
  }
});

test('shells stay on their own footprint and frontage, out of the doors and short of the Ribbon walk', () => {
  for (const venue of contract.venues) {
    const frame = venueFrame(venue), { merged } = buildVenue(venue), lanterns = venue.attachments.filter(item => item.frame === 'campus');
    const inverse = frame.matrix.clone().invert(), local = new THREE.Vector3();
    for (const [key, geometry] of merged) for (const p of vertices(geometry)) {
      local.set(...p).applyMatrix4(inverse);
      if (lanterns.length && local.y > 6) continue; // the Overlook lanterns stand on the roof decks
      const slack = 0.16; // a wall's thickness behind the interior ring, the bullnose round
      assert.ok(local.x >= frame.x0 - slack && local.x <= frame.x1 + slack, `${venue.id} ${key}: x ${local.x.toFixed(2)} in [${frame.x0.toFixed(2)}, ${frame.x1.toFixed(2)}]`);
      assert.ok(local.z >= -frame.depth - slack && local.z <= frame.front + FRONT.reach + 1e-3, `${venue.id} ${key}: z ${local.z.toFixed(2)}`);
      // The door zone (contract width, 2 m out) stays clear up to head height.
      const door = FIVE_ROOMS_RULES.doorway;
      if (Math.abs(local.x) < door.width / 2 - 0.01 && local.z > 0.01 && local.z < door.depth && local.y > 0.01) assert.ok(local.y > 2.6, `${venue.id} ${key}: ${local.toArray().map(v => v.toFixed(2))} in the door zone`);
    }
  }
  // Nothing from any shell below the canopy top stands within a post's width of a Ribbon walk.
  const group = buildFiveRoomsShells(contract, { finish: PINK }), runs = contract.ribbon.segments.flatMap(segment => segment.points.slice(1).map((to, i) => ({ id: segment.id, from: segment.points[i], to, half: segment.width / 2 + 0.3 })));
  const distance = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  for (const mesh of group.children) for (const [x, , z] of vertices(mesh.geometry)) {
    const p = [x, -z];
    for (const run of runs) assert.ok(distance(p, run.from, run.to) > run.half, `${mesh.name} at ${p.map(v => v.toFixed(2))} inside ${run.id}`);
  }
  group.userData.dispose();
});

test('by day nothing glows; at night pink lights only usable things and the landmarks', () => {
  const group = buildFiveRoomsShells(contract, { finish: PINK }), meshes = group.children;
  const intensity = () => Object.fromEntries(meshes.map(mesh => [mesh.material.userData.fiveRooms.key, mesh.material.emissive.getHex() ? mesh.material.emissiveIntensity : 0]));
  assert.ok(Object.values(intensity()).every(value => value === 0), 'day: every emissive off');
  group.userData.relight({ twilight: 1 });
  const night = intensity();
  for (const mesh of meshes) {
    const { key, role } = mesh.material.userData.fiveRooms, lit = night[key] > 0;
    assert.equal(lit, ['usable', 'landmark', 'lamp'].includes(role), `${key} (${role}) lit=${lit}`);
    if (lit && role === 'lamp') assert.notEqual(`#${mesh.material.emissive.getHexString()}`, PINK_JET_AGE.pink.toLowerCase(), 'porch lights are warm, not pink');
  }
  group.userData.relight({ twilight: 0 });
  assert.ok(Object.values(intensity()).every(value => value === 0), 'back to day');
  // The landmark light belongs to the Starlight marquee and the Overlook lanterns only.
  const landmarks = contract.venues.filter(venue => buildVenue(venue).materials.includes('glow-landmark')).map(venue => venue.id);
  assert.deepEqual(landmarks, ['venue:starlight-screen', 'venue:studios-overlook']);
  // Every bay has a lit door (a door that will open); the open threshold has none.
  const doors = contract.venues.filter(venue => buildVenue(venue).materials.includes('glow-usable')).map(venue => venue.id);
  assert.deepEqual(doors, ['venue:counter', 'venue:atelier', 'venue:starlight-screen', 'venue:shade-garden']);
  group.userData.dispose();
});

test('no shell surface fights another, nor the finished Ribbon, for depth', () => {
  const shells = buildFiveRoomsShells(contract, { finish: PINK }), ribbon = buildRibbon({ world, groundAt: () => 18.5 });
  assert.deepEqual(scan(shells).map(named), [], 'shells alone');
  assert.deepEqual(scan(shells, ribbon).map(named), [], 'shells and Ribbon');
  shells.userData.dispose(); ribbon.userData.dispose();
});

test('the floor each venue stands on is recorded against the ground given, and teardown frees everything', () => {
  const group = buildFiveRoomsShells(contract, { finish: PINK, groundAt: () => 18.4 });
  for (const venue of group.userData.fiveRooms.venues) {
    const record = contract.venues.find(item => item.id === venue.id);
    assert.equal(venue.floor, record.floor.height);
    assert.ok(Math.abs(venue.floorDelta - (record.floor.height - 18.4)) < 1e-3, venue.id);
  }
  let geometries = 0, materials = 0;
  for (const mesh of group.children) { mesh.geometry.addEventListener('dispose', () => geometries++); mesh.material.addEventListener('dispose', () => materials++); }
  group.userData.dispose(); group.userData.dispose();
  assert.equal(geometries, group.children.length);
  assert.equal(materials, group.children.length, 'each drawn material once (the unused ones too, silently)');
});

test('a contract at another version is refused', () => {
  assert.throws(() => buildFiveRoomsShells({ ...contract, version: 'five-rooms-v1' }, { finish: PINK }), /five-rooms-v2|Invalid five rooms layout/);
});
