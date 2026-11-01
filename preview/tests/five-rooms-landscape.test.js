import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { expandFiveRooms, siteFromDistrict } from '../../shared/city-kit/five-rooms-layout.js';
import { RIBBON_RULES } from '../../shared/city-kit/ribbon-layout.js';
import { laneFixtures, storefrontBenchSpots } from '../src/street-fixtures.js';
import { treePits } from '../src/street-furniture.js';
import { matureTreePlacements, planterPlacements } from '../src/landscape-models.js';
import { buildProceduralPlants } from '../src/procedural-plants.js';
import { winstonBed } from '../src/reference-planting.js';
import { storeRoomsFor } from '../src/store-rooms.js';
import { groundSurfaceHeight } from '../src/world-surface.js';
import { validateVegetation } from '../src/vegetation.js';
import { FIVE_ROOMS_LANDSCAPE_FLAGS, FIVE_ROOMS_LANDSCAPE_RULES, buildFiveRoomsLandscape, corridorBox, fiveRoomsLandscapeAppliesTo, fiveRoomsLandscapePlan, overlaps } from '../src/five-rooms/landscape.js';
import { PAVING_LIFT, buildFiveRoomsGround, fiveRoomsGroundPieces } from '../src/five-rooms/ground.js';

// Five Rooms landscape (#840) from the #838 contract. The site is rebuilt from the live District
// exactly as five-rooms-layout.test.js does, so a moved door, fixture, tree or bench moves or
// drops planting here instead of planting it in someone's way.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const contract = read('../../config/ribbon/five-rooms.json');
const world = read('../public/data/district.json');
world.vegetation = validateVegetation(world, read('../public/data/district-vegetation.json'));
const groundAt = (x, north) => groundSurfaceHeight(world, x, -north);
const tenants = storeRoomsFor(world).filter(room => world.stores.some(store => store.id === room.storeId));
const site = siteFromDistrict(world, { fixtures: laneFixtures(world), benches: storefrontBenchSpots(world), treePits: treePits(world), trees: matureTreePlacements(world), beds: [winstonBed(world)], tenants, groundAt });
const expanded = expandFiveRooms(contract, site);
const ALL = Object.freeze({ shadeGardenOpenCourt: true, blockedSegmentPlanting: true });
const landscape = (flags = FIVE_ROOMS_LANDSCAPE_FLAGS, plan = expanded) => fiveRoomsLandscapePlan(plan, { groundAt, flags });
const corners = r => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
const shapeOf = m => { const d = [Math.cos(m.yaw), Math.sin(m.yaw)], n = [-d[1], d[0]], c = [(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2]; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [c[0] + i * d[0] * m.length / 2 + j * n[0] * m.width / 2, c[1] + i * d[1] * m.length / 2 + j * n[1] * m.width / 2]); };
const insideConvex = (p, ring, tolerance = 1e-3) => { const s = ring.map((a, i) => { const b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / l; }); return s.every(v => v >= -tolerance) || s.every(v => v <= tolerance); };

test('the landscape is built from the contract: aprons always, the court and blocked planting behind named flags', () => {
  assert.deepEqual(FIVE_ROOMS_LANDSCAPE_FLAGS, { shadeGardenOpenCourt: false, blockedSegmentPlanting: false });
  const plan = landscape();
  assert.equal(plan.hash, expanded.hash);
  assert.deepEqual(plan.stats, { paving: 5, courts: 0, beds: 0, dropped: 8, pending: 35 });
  assert.deepEqual(plan.paving.map(item => item.id), ['paving:counter', 'paving:atelier', 'paving:starlight-screen', 'paving:shade-garden', 'paving:studios-overlook']);
  // The Shade Garden court waits on Val's decision 6; every segment is blocked (#838), so its planted edge waits too.
  const court = plan.pending.find(item => item.id === 'court:shade-garden');
  assert.equal(court.flag, 'shadeGardenOpenCourt');
  assert.match(court.decision, /decision 6/);
  assert.ok(plan.pending.filter(item => item.kind === 'edge').every(item => item.flag === 'blockedSegmentPlanting' && item.status === 'blocked'));
  assert.deepEqual(landscape(ALL).stats, { paving: 5, courts: 1, beds: 34, dropped: 8, pending: 0 });
  assert.deepEqual(landscape(ALL), landscape(ALL), 'deterministic');
});

test('a contract change moves what it places', () => {
  const moved = structuredClone(contract), bed = moved.venues.find(venue => venue.id === 'venue:shade-garden').attachments.find(item => item.role === 'bed');
  bed.position[0] += 0.5;
  const before = landscape(ALL).beds.find(item => item.id === 'bed:shade-garden:bed'), after = landscape(ALL, expandFiveRooms(moved, site)).beds.find(item => item.id === 'bed:shade-garden:bed');
  assert.deepEqual([mmDiff(after.centre[0], before.centre[0]), after.centre[1]], [0.5, before.centre[1]]);
  // Every edge bed stands on its module's normal, beyond its posts: move a module and its bed moves.
  for (const item of landscape(ALL).beds.filter(b => b.kind === 'edge')) {
    const module = expanded.modules.find(m => m.id === item.source), d = [Math.cos(module.yaw), Math.sin(module.yaw)], sign = item.side === 'left' ? 1 : -1;
    const offset = module.width / 2 + RIBBON_RULES.post / 2 + FIVE_ROOMS_LANDSCAPE_RULES.plantedEdge.gap + FIVE_ROOMS_LANDSCAPE_RULES.bed.depth / 2;
    const expect = [(module.from[0] + module.to[0]) / 2 - d[1] * sign * offset, (module.from[1] + module.to[1]) / 2 + d[0] * sign * offset];
    assert.ok(Math.hypot(expect[0] - item.centre[0], expect[1] - item.centre[1]) < 0.002, item.id);
  }
});
const mmDiff = (a, b) => Math.round((a - b) * 1000) / 1000;

test('no planting envelope enters a doorway, seat access, step-free route, no-go zone, camera corridor, walk or post', () => {
  const plan = landscape(ALL), cameras = expanded.cameras.map(corridorBox);
  for (const bed of plan.beds) {
    const host = bed.kind === 'court' ? plan.courts.find(court => court.id === bed.court).ring : null;
    for (const zone of expanded.exclusions) {
      if (host && zone.id.startsWith('building-') && host.every(([x, y]) => x >= zone.rect[0] && x <= zone.rect[2] && y >= zone.rect[1] && y <= zone.rect[3])) continue;
      assert.equal(overlaps(bed.shape, corners(zone.rect)), false, `${bed.id} in ${zone.kind} ${zone.id}`);
    }
    for (const module of expanded.modules) assert.equal(overlaps(bed.shape, shapeOf(module)), false, `${bed.id} on the walk ${module.id}`);
    for (const post of expanded.posts) assert.equal(overlaps(bed.shape, corners([post.position[0] - 0.15, post.position[1] - 0.15, post.position[0] + 0.15, post.position[1] + 0.15])), false, `${bed.id} on ${post.id}`);
    for (const [i, box] of cameras.entries()) assert.ok(!(overlaps(bed.shape, box.shape) && bed.bottom < box.top && bed.top > box.bottom), `${bed.id} in ${expanded.cameras[i].id}`);
    // Planting stays far below the 3.6 m canopy it stands beside.
    assert.ok(bed.top - bed.bottom < RIBBON_RULES.minClearHeight, bed.id);
  }
  // What the District displaced, by name: side-lane carriageway, tree pits, a bench, a bin and a lamp.
  assert.deepEqual(plan.dropped.map(item => `${item.id} <- ${item.conflicts.join(' | ')}`), [
    'bed:spine:edge:002:l <- no-go road-625330795-8', 'bed:spine:edge:004:l <- no-go road-625330795-8',
    'bed:spine:edge:006:l <- no-go tree-pit-103', 'bed:spine:edge:008:l <- no-go tree-pit-76',
    'bed:spine:edge:018:l <- seat-access bench-5 | no-go bin-3', 'bed:spine:edge:026:l <- no-go tree-pit-126',
    'bed:south:edge:012:l <- no-go tree-pit-3', 'bed:south:edge:016:l <- no-go lamp-11',
  ]);
  // The Shade Garden bed is planted in the court floor, under its interior camera's sight line.
  const courtBed = plan.beds.find(item => item.id === 'bed:shade-garden:bed'), camera = cameras[expanded.cameras.findIndex(c => c.id === 'camera:shade-garden:interior')];
  assert.equal(courtBed.shell, 0);
  assert.ok(courtBed.top < camera.bottom, `bed top ${courtBed.top} below the corridor ${camera.bottom}`);
});

test('a bed moved into a door, or raised into the camera corridor, is refused by name', () => {
  const intoDoor = structuredClone(contract), venue = intoDoor.venues.find(v => v.id === 'venue:shade-garden');
  venue.attachments.find(item => item.role === 'bed').position = [...venue.entrances[0].centre.map((v, i) => v + venue.entrances[0].outward[i] * -0.3), venue.floor.height];
  const refused = landscape(ALL, expandFiveRooms(intoDoor, site)).dropped.find(item => item.id === 'bed:shade-garden:bed');
  assert.ok(refused?.conflicts.some(c => c.startsWith('doorway door-entrance-shade-garden')), JSON.stringify(refused));
  const tall = { ...expanded, cameras: expanded.cameras.map(c => c.id === 'camera:shade-garden:interior' ? { ...c, from: [c.from[0], c.from[1], c.from[2] - 0.8], to: [c.to[0], c.to[1], c.to[2] - 0.8] } : c) };
  assert.deepEqual(landscape(ALL, tall).dropped.find(item => item.id === 'bed:shade-garden:bed')?.conflicts, ['camera camera:shade-garden:interior']);
});

test('the street trees the #828 ledger flagged are declared in each segment\'s blocked record', () => {
  const through = Object.fromEntries(expanded.segments.map(segment => [segment.id, [...new Set(segment.crowns.filter(c => c.through).map(c => c.tree))].sort()]));
  assert.deepEqual(through, { spine: ['tree-104', 'tree-127', 'tree-153', 'tree-37', 'tree-77', 'tree-84', 'tree-85'], south: ['tree-108'], 'link-studios': ['tree-118', 'tree-48'] });
  for (const segment of expanded.segments) for (const tree of through[segment.id]) assert.ok(segment.blocked.blockers.includes(tree), `${segment.id} declares ${tree}`);
  // No bed is planted under a crown that passes through the canopy's height band.
  for (const bed of landscape(ALL).beds) for (const tree of site.trees) {
    if (Math.min(...bed.shape.map(p => Math.hypot(p[0] - tree.x, p[1] - tree.y))) > tree.radius) continue;
    assert.ok(tree.crownBase > bed.top - bed.bottom, `${bed.id} planting reaches ${tree.id}'s crown`);
  }
});

test('the court floor lies within its venue and its bed within the court', () => {
  const plan = landscape(ALL), shade = expanded.venues.find(v => v.id === 'venue:shade-garden');
  for (const court of plan.courts) for (const p of court.ring) assert.ok(insideConvex(p, shade.footprint), `${court.id} corner ${p}`);
  const bed = plan.beds.find(item => item.kind === 'court');
  for (const p of bed.shape) assert.ok(insideConvex(p, plan.courts[0].ring), `bed corner ${p}`);
  // Each apron joins its entrance's doorway zone to its walk.
  for (const piece of plan.paving) {
    const link = expanded.links.find(l => l.id === piece.link), venue = expanded.venues.find(v => v.id === piece.venue), door = venue.entrances.find(e => e.id === piece.entrance).doorway;
    for (const p of [...corners(door), ...link.reach]) assert.ok(insideConvex(p, piece.ring), `${piece.id} holds ${p}`);
  }
});

test('aprons cross a road only where the contract lists a lane-end crossing (#838 links[].crossesLaneEnd)', () => {
  const rect = r => corners(r), within = (p, r) => p[0] >= r[0] - 1e-3 && p[0] <= r[2] + 1e-3 && p[1] >= r[1] - 1e-3 && p[1] <= r[3] + 1e-3;
  for (const piece of landscape().paving) {
    const link = expanded.links.find(l => l.id === piece.link), listed = new Set(link.crossesLaneEnd);
    const roads = expanded.exclusions.filter(zone => zone.id.startsWith('road-') && overlaps(piece.ring, rect(zone.rect)));
    assert.deepEqual(roads.map(zone => zone.id).filter(id => !listed.has(id)), [], `${piece.id} crosses an unlisted road piece`);
    // The apron stays inside its reach plus the listed pieces (river-oaks-c2, 2026-11-01).
    if (listed.size) for (const p of piece.ring) assert.ok(insideConvex(p, link.reach) || roads.some(zone => within(p, zone.rect)), `${piece.id} corner ${p} outside its reach and listed pieces`);
  }
  assert.deepEqual(expanded.links.filter(l => l.crossesLaneEnd.length).map(l => [l.id, l.crossesLaneEnd]), [['link:studios-overlook', ['road-625330795-0']]]);
});

test('ground pieces follow groundSurfaceHeight within 1 cm and face up, ready for registerGroundSurfaces', () => {
  const plan = landscape(ALL), pieces = fiveRoomsGroundPieces(plan, { groundAt });
  assert.deepEqual(pieces.map(p => p.id), [...plan.paving, ...plan.courts].map(p => p.id));
  for (const piece of [...plan.paving, ...plan.courts]) for (const [x, north] of piece.ring) {
    const triangles = pieces.find(p => p.id === piece.id).triangles.flat(), corner = triangles.find(v => Math.abs(v[0] - x) < 1e-9 && Math.abs(v[2] + north) < 1e-9);
    assert.ok(corner && Math.abs(corner[1] - groundAt(x, north)) <= 0.01, `${piece.id} corner ${x}, ${north}`);
  }
  let worst = 0;
  for (const piece of pieces) for (const t of piece.triangles) {
    const c = [0, 1, 2].map(k => (t[0][k] + t[1][k] + t[2][k]) / 3);
    worst = Math.max(worst, Math.abs(c[1] - groundAt(c[0], -c[2])));
    const up = (t[1][2] - t[0][2]) * (t[2][0] - t[0][0]) - (t[1][0] - t[0][0]) * (t[2][2] - t[0][2]);
    assert.ok(up > 0, `${piece.id} triangle faces up`);
  }
  assert.ok(worst <= 0.01, `worst centroid ${worst}`);
  assert.equal(PAVING_LIFT, 0.008);
  // The drawn mesh is the registered one: same triangles, one draw call.
  const group = buildFiveRoomsGround(plan, { groundAt }), meshes = [];
  group.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 1);
  assert.equal(meshes[0].geometry.attributes.position.count, pieces.reduce((n, p) => n + p.triangles.length * 3, 0));
});

test('classic builds nothing; pink-jet-age builds the aprons, with bounded draw calls', t => {
  assert.equal(fiveRoomsLandscapeAppliesTo(world, 'classic', expanded), false);
  assert.equal(fiveRoomsLandscapeAppliesTo(world, undefined, expanded), false);
  assert.equal(fiveRoomsLandscapeAppliesTo(world, 'pink-jet-age', expanded), true);
  assert.equal(fiveRoomsLandscapeAppliesTo({ ...world, scene: 'creator' }, 'pink-jet-age', expanded), false, 'a creator world');
  assert.equal(fiveRoomsLandscapeAppliesTo({ ...world, buildings: world.buildings.filter(b => b.id !== 'osm-way-625330792') }, 'pink-jet-age', expanded), false, 'a District without the host buildings');
  const draws = group => { let n = 0; group.traverse(o => { if (o.isMesh) n++; }); return n; };
  // The asset-loading half of buildPlanterPlanting needs a browser; the procedural planting it draws first is measured here.
  const planting = planters => { const g = new THREE.Group(); g.add(...buildProceduralPlants(planterPlacements(planters).procedural)); g.userData.planters = planters.length; return g; };
  const today = buildFiveRoomsLandscape(landscape(), { groundAt, planting });
  assert.equal(draws(today), 1, 'today: the five aprons in one mesh');
  const full = buildFiveRoomsLandscape(landscape(ALL), { groundAt, planting });
  const procedural = draws(full) - 3;
  // buildProceduralPlants batches each plant part per 24 m cell: about seven parts over the ~200 m Ribbon.
  assert.equal(procedural, 60, `procedural planting draw calls ${procedural}`);
  assert.deepEqual(full.userData.fiveRoomsLandscape.stats, landscape(ALL).stats);
  t.diagnostic(`five rooms landscape draw calls: default flags ${draws(today)}; all flags ${draws(full)} (paving 1, bed shells 1, mulch 1, procedural planting ${procedural}; buildPlanterPlanting adds its boxwood and grass model batches once loaded)`);
});
