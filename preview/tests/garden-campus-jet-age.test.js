import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { PINK_JET_AGE } from '../../shared/city-kit/pink-jet-age.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels } from '../../shared/garden-campus-layout.js';
import { campusPartitions } from '../../shared/garden-campus-partitions.js';
import { attachGardenCampus } from '../src/garden-campus-district.js';
import { buildGardenCampus } from '../src/garden-campus.js';
import { FINISH } from '../src/garden-campus-finish.js';
import { CAMPUS_JET_AGE, campusJetAgeParts } from '../src/garden-campus-jet-age.js';

// Pink Jet-Age architecture on the Gardens (#741 under #738): new shapes, same contract.
const campus = attachGardenCampus(await loadDistrictData());
const levels = campusLevels(CAMPUS), EPS = 1e-6, CLEAR = FINISH.clearance, PINK = 'pink-jet-age';
const parts = campusJetAgeParts(CAMPUS, levels);
const meshesOf = group => { const out = [];group.traverse(item => { if (item.isMesh) out.push(item); });return out; };
const inside = ([u0, v0, u1, v1], [u, v], e = EPS) => u >= u0 - e && u <= u1 + e && v >= v0 - e && v <= v1 + e;
function inPolygon([u, v], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length - 1; j = i++) {
    const [ui, vi] = polygon[i], [uj, vj] = polygon[j];
    if ((vi > v) !== (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui) hit = !hit;
  }
  return hit;
}

// Sample points of every triangle of a part, in campus metres [u, v, z]: corners, centroid and,
// for large triangles, a barycentric grid, so nothing wide slips between samples.
function* samples(geometry) {
  const position = geometry.attributes.position, index = geometry.index, count = index ? index.count : position.count;
  const vertex = i => { const k = index ? index.getX(i) : i;return [position.getX(k), -position.getZ(k), position.getY(k)]; };
  for (let t = 0; t < count; t += 3) {
    const [a, b, c] = [vertex(t), vertex(t + 1), vertex(t + 2)];
    const size = Math.max(...[0, 1, 2].map(axis => Math.max(a[axis], b[axis], c[axis]) - Math.min(a[axis], b[axis], c[axis])));
    const n = Math.min(12, Math.max(1, Math.ceil(size / 0.1)));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const k = n - i - j;
      yield [0, 1, 2].map(axis => (a[axis] * i + b[axis] * j + c[axis] * k) / n);
    }
  }
}
const sampled = parts.map(part => ({ ...part, points: [...samples(part.geometry)] }));

test('pink jet-age builds the shapes; classic and the colour-only switch never do', () => {
  const classic = buildGardenCampus(campus), colour = buildGardenCampus(campus, { kitFinish: PINK, jetAgeForms: false }), shaped = buildGardenCampus(campus, { kitFinish: PINK });
  const named = group => meshesOf(group).filter(mesh => mesh.name.startsWith('campus:jet-age:')).map(mesh => mesh.name).sort();
  assert.deepEqual(named(classic), []);assert.deepEqual(named(colour), []);
  assert.deepEqual(named(shaped), ['campus:jet-age:chrome', 'campus:jet-age:ivory', 'campus:jet-age:luminaire', 'campus:jet-age:pink']);
  assert.deepEqual(Object.keys(shaped.userData.counts.jetAge).sort(), ['band', 'canopy', 'hall', 'pergola', 'roof', 'skywalk']);
  // Every place the forms reshape is visibly reshaped, per tower, bridge, canopy and post.
  const ids = id => parts.filter(part => part.id.endsWith(id)).length;
  assert.equal(ids('/saucer'), CAMPUS.towers.length);assert.equal(ids('/headhouse'), CAMPUS.towers.length);assert.equal(ids('/chandelier'), CAMPUS.towers.length);
  assert.equal(ids('/wing'), CAMPUS.towers.length + CAMPUS.groundBuildings.filter(item => item.kind === 'cafe').length);
  assert.equal(ids('/pilotis'), CAMPUS.groundBuildings.flatMap(item => item.posts ?? []).length);
  assert.equal(ids('/bullnose'), 4 * CAMPUS.towers.reduce((sum, tower) => sum + tower.levels.length, 0));
  for (const bridge of CAMPUS.bridges) assert.ok(parts.filter(part => part.id === `${bridge.id}/hoop`).length >= 4, bridge.id);
  // The replaced boxes go: headhouse limestone and cap, flat canopies and their lights, slats, timber posts.
  const counts = [classic, colour, shaped].map(group => group.userData.counts);
  assert.equal(counts[2].accent, 0,'no flat canopy inlay under forms');
  assert.ok(counts[2].stone < counts[1].stone && counts[2].timber < counts[1].timber && counts[2].bronze < counts[1].bronze && counts[2].luminaire < counts[1].luminaire);
  // Everything else is the colour build, untouched (same glass, slabs, partitions, doors, guards).
  for (const key of ['glass', 'slab', 'core', 'partition', 'door', 'guard', 'interior', 'soil', 'water', 'planting']) assert.equal(counts[2][key], counts[1][key], key);
  const pink = meshesOf(shaped).find(mesh => mesh.name === 'campus:jet-age:pink').material.color.getHexString();
  assert.equal(pink, new THREE.Color(PINK_JET_AGE.pink).getHexString());
  // The glow parts share the campus luminaire, so the time of day relights them too.
  const glow = meshesOf(shaped).find(mesh => mesh.name === 'campus:jet-age:luminaire').material;
  shaped.userData.relight({ twilight: 1 });assert.equal(glow.name, 'campus:luminaire');assert.ok(glow.emissiveIntensity > 2);
  for (const group of [classic, colour, shaped]) group.userData.dispose();
});

// Same allowance as garden-campus-finish.test.js: published obstacles, suite partitions and the
// facade line. Anything else at body height over a walkable surface is a failure.
const FACADE_LINE = FINISH.glassInset + 0.09 + 0.01;
const PARTITIONS = (({ walls, doors }) => [...walls.map(wall => [wall.levelId, wall.rect]), ...doors.flatMap(door => [door.leaf, door.headRect, ...door.jambs].map(rect => [door.levelId, rect]))])(campusPartitions());
test('no jet-age triangle stands in a walkable surface below body clearance outside an obstacle or the facade line', () => {
  const failures = [];
  for (const level of levels) {
    const plates = CAMPUS.towers.flatMap(tower => tower.levels).filter(floor => floor.z0 === level.z).map(floor => floor.rect);
    const ground = level.surfaces.find(surface => surface.polygon), rects = level.surfaces.filter(surface => surface.rect && surface.access !== 'service');
    const walkable = point => (ground && inPolygon(point, ground.polygon) && !ground.holes.some(hole => inside(hole, point, -1e-4))) || rects.some(surface => inside(surface.rect, point, -1e-4));
    const partitions = PARTITIONS.filter(([levelId]) => levelId === level.id).map(([, rect]) => rect);
    const allowed = point => level.obstacles.some(item => inside(item.rect, point, 1e-4)) || partitions.some(rect => inside(rect, point, 1e-4))
      || plates.some(([u0, v0, u1, v1]) => inside([u0, v0, u1, v1], point) && Math.min(point[0] - u0, u1 - point[0], point[1] - v0, v1 - point[1]) <= FACADE_LINE);
    for (const part of sampled) {
      const bad = part.points.find(([u, v, z]) => z > level.z + 0.05 && z < level.z + CLEAR - EPS && walkable([u, v]) && !allowed([u, v]));
      if (bad) failures.push(`${part.id} at ${level.id} [${bad.map(n => n.toFixed(2)).join(', ')}]`);
    }
  }
  assert.deepEqual(failures.slice(0, 12), [], `${failures.length} jet-age parts stand in a walkable surface`);
});

test('roofs keep their silhouette: nothing over the headhouse top, the saucer overhead and clear of the beds', () => {
  for (const tower of CAMPUS.towers) {
    const [u0, v0, u1, v1] = tower.tiers[0].rect, head = tower.roof.headhouse.rect, top = tower.silhouette;
    const beds = levels.find(level => level.z === tower.roof.z).obstacles.filter(item => item.kind === 'planter' && item.id.startsWith(`${tower.id}-`)).map(item => item.rect);
    for (const part of sampled) for (const [u, v, z] of part.points) {
      if (!inside([u0 - 1, v0 - 1, u1 + 1, v1 + 1], [u, v]) || z <= top.parapetTop + EPS) continue;
      assert.ok(z <= top.headhouseTop + 1e-5, `${part.id} reaches ${z} over ${tower.id}, headhouse top ${top.headhouseTop}`);
      // Outside the headhouse only the saucer brim and its ring, in the air over the roof garden.
      if (!inside(head, [u, v], 1e-4)) {
        assert.ok(z >= tower.roof.z + CLEAR - 1e-5, `${part.id} at ${[u, v, z]} under body clearance on ${tower.id}'s roof`);
        assert.ok(!beds.some(bed => inside(bed, [u, v])), `${part.id} over ${tower.id}'s roof bed at ${[u, v]}`);
      }
    }
  }
});

test('openings stay open and every shape stays inside the flight volumes it rises over', () => {
  const blocked = [];
  for (const level of levels) for (const opening of level.openings.filter(item => ['skywalk-portal', 'terrace-door', 'entrance'].includes(item.kind))) {
    const [u, v] = opening.position, half = opening.width / 2, height = opening.clearHeight ?? 2.6;
    const zone = opening.kind === 'skywalk-portal' ? [u - half, v - 0.3, u + half, v + 0.3] : [u - 0.3, v - half, u + 0.3, v + half];
    for (const part of sampled) if (part.points.some(([pu, pv, z]) => z > level.z + 0.05 && z < level.z + height - EPS && inside(zone, [pu, pv], -1e-4))) blocked.push(`${opening.id}: ${part.id}`);
  }
  assert.deepEqual(blocked, []);
  // Ground buildings keep their declared height (the café and pergola flight volumes); towers their cap.
  for (const part of sampled) for (const [u, v, z] of part.points) {
    for (const item of CAMPUS.groundBuildings.filter(entry => entry.height > 0)) if (inside(item.rect, [u, v], -1e-4)) assert.ok(z <= item.height + 1e-5, `${part.id} over ${item.id} at ${z}`);
    for (const tower of CAMPUS.towers) if (inside(tower.tiers[0].rect, [u, v], -1e-4)) assert.ok(z <= tower.silhouette.capZ + 1e-5, `${part.id} over ${tower.id} at ${z}`);
  }
  // Canopies stay under the first slab band of the facade they spring from and under the café roof slab.
  const band = Math.min(...CAMPUS.towers.map(tower => tower.levels[0].z1)) - CAMPUS.bridges[0].slab - FINISH.fasciaDrop;
  const cafeSlab = Math.min(...CAMPUS.groundBuildings.filter(item => item.kind === 'cafe').map(item => item.height - 0.3));
  for (const part of sampled.filter(item => /-canopy\/(wing|edge|glow)$/.test(item.id))) for (const [, , z] of part.points)
    assert.ok(z < Math.min(band, cafeSlab) - 0.05, `${part.id} at ${z} meets the slab band or café roof`);
  // Skywalk hoops stand only in the edge zones and never over a tower plate.
  const H = CAMPUS_JET_AGE.hoop;
  for (const bridge of CAMPUS.bridges) for (const part of sampled.filter(item => item.id === `${bridge.id}/hoop`)) for (const [u, v, z] of part.points) {
    if (z < bridge.deckZ + CLEAR) assert.ok(u <= bridge.clear[0] + EPS || u >= bridge.clear[2] - EPS, `${part.id} leg in the clear deck at ${u}`);
    assert.ok(z <= bridge.deckZ + H.legHeight + H.crownRise + H.radius + 1e-5);
    assert.ok(!CAMPUS.towers.flatMap(tower => tower.levels).some(floor => inside(floor.rect, [u, v], -0.5)), `${part.id} over a plate at ${[u, v]}`);
  }
});

test('the forms are deterministic, bounded and released with the campus', () => {
  const again = campusJetAgeParts(CAMPUS, levels), digest = list => list.map(part => [part.id, part.material, part.geometry.attributes.position.count, [...part.geometry.attributes.position.array].reduce((sum, n, i) => sum + n * ((i % 7) + 1), 0).toFixed(3)]);
  assert.deepEqual(digest(again), digest(parts));
  for (const part of again) part.geometry.dispose();
  const triangles = parts.reduce((sum, part) => sum + (part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count) / 3, 0);
  assert.ok(triangles > 10000 && triangles < 45000, `${triangles} jet-age triangles`);
  const classic = buildGardenCampus(campus), shaped = buildGardenCampus(campus, { kitFinish: PINK });
  const materials = group => new Set(meshesOf(group).map(mesh => mesh.material)).size;
  assert.equal(meshesOf(shaped).length - meshesOf(classic).length, 4 - 1, 'four merged draws in, the flat canopy inlay out');
  assert.equal(materials(shaped) - materials(classic), 3 - 1, 'three form materials, the accent inlay unused');
  const released = new Set();
  for (const mesh of meshesOf(shaped).filter(item => item.name.startsWith('campus:jet-age:'))) {
    mesh.geometry.addEventListener('dispose', () => released.add(mesh.geometry));mesh.material.addEventListener('dispose', () => released.add(mesh.material));
  }
  shaped.userData.dispose();classic.userData.dispose();
  assert.equal(released.size, 4 + 4, 'every merged geometry and material (the luminaire is the campus\'s own) is disposed');
});
