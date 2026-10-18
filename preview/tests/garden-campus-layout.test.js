import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GARDEN_CAMPUS_LAYOUT as LAYOUT, GARDEN_CAMPUS_VERSIONS, CAMPUS_BODY, CAMPUS_ELEVATIONS, validateGardenCampus, checkCampusCompatibility,
  campusLevels, campusSupportAt, campusSurfacesAt, campusRoute, campusGraph, campusUnitInventory, campusToSource, campusToScene, sourceToCampus,
} from '../../shared/garden-campus-layout.js';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';
import { generateBuildingInteriorPlan } from '../src/building-interiors-plan.js';

const district = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(LAYOUT);
const rules = result => result.findings.map(finding => finding.rule);
const tower = (layout, id) => layout.towers.find(item => item.id === id);
const floor = (layout, id, level) => tower(layout, id).levels.find(item => item.level === level);
const L = index => `garden-campus/l${index}`;

test('the accepted contract validates against the pinned district with no findings', () => {
  const result = validateGardenCampus(LAYOUT, { district });
  assert.deepEqual(result.findings, []);
  assert.equal(LAYOUT.source.buildingId, 'osm-way-625330790');
  assert.equal(LAYOUT.source.districtBlob, '566d7c52295f8811b50890c23f448261bbf9a0a7');
  assert.deepEqual(LAYOUT.versions, GARDEN_CAMPUS_VERSIONS);
  assert.ok(Object.isFrozen(LAYOUT) && Object.isFrozen(LAYOUT.towers[0].levels[0].rect));
});

test('the parcel is the garage polygon, not a rectangle, in the shared datum', () => {
  const garage = district.buildings.find(item => item.id === 'osm-way-625330790');
  assert.deepEqual(LAYOUT.source.ring, garage.ring);
  assert.equal(LAYOUT.frame.baseAltitude, garage.center[2]);
  const polygon = LAYOUT.parcel.polygon;
  let area = 0;for (let i = 0; i < polygon.length - 1; i++) area += polygon[i][0] * polygon[i + 1][1] - polygon[i + 1][0] * polygon[i][1];
  assert.ok(Math.abs(Math.abs(area) / 2 - 6838.982905168) < 1e-6);
  assert.ok(Math.abs(polygon[2][1] - 181.2216357447) < 1e-9, 'west length');
  assert.ok(Math.abs(polygon[0][0] - 37.71956706) < 1e-8 && Math.abs(polygon[7][0] - 37.75888242) < 1e-8, 'north and south widths differ');
  // The garage still blocks walking: #507 must remove exactly this collision polygon.
  assert.equal(district.collisionPolygons.filter(ring => JSON.stringify(ring) === JSON.stringify(garage.ring)).length, 1);
  // A changed district ring is refused, not silently reused.
  const moved = structuredClone(district);moved.buildings.find(item => item.id === garage.id).ring[0][0] += 0.01;
  assert.ok(rules(validateGardenCampus(LAYOUT, { district: moved })).includes('provenance'));
});

test('local, source and scene frames round-trip; the renderer maps [east, north, altitude] to [east, altitude, -north]', () => {
  for (const point of [[0, 0, 0], [16, 76, 13], [37.7, 181.2, 29]]) {
    const [east, north, altitude] = campusToSource(point), back = sourceToCampus([east, north]);
    assert.ok(Math.hypot(back[0] - point[0], back[1] - point[1]) < 1e-9);
    assert.ok(Math.abs(altitude - (18.25939189446673 + point[2])) < 1e-12);
    assert.deepEqual(campusToScene(point), [east, altitude, -north]);
  }
  assert.ok(Math.hypot(...campusToSource([0, 0]).slice(0, 2).map((v, i) => v - LAYOUT.source.ring[5][i])) < 1e-9, 'u,v origin is the garage southwest vertex');
});

test('6/7/6 floors on 5 m and 4 m storeys, roofs 25/29/25, parapets and caps below the office roof', () => {
  assert.deepEqual(LAYOUT.towers.map(t => t.tierLevelCounts), [[2, 2, 2], [3, 2, 2], [2, 2, 2]]);
  assert.deepEqual(LAYOUT.towers.map(t => t.levels.length), [6, 7, 6]);
  assert.deepEqual(tower(LAYOUT, 'T2').levelElevations, [0, 5, 9, 13, 17, 21, 25, 29]);
  assert.deepEqual(LAYOUT.towers.map(t => [t.roof.z, t.silhouette.parapetTop, t.silhouette.headhouseTop, t.silhouette.capZ]), [[25, 26, 28, 28.1], [29, 30, 32, 32.1], [25, 26, 28, 28.1]]);
  const officeRoof = LAYOUT.context.office.nominalRoofAltitude;
  assert.ok(Math.abs(officeRoof - (LAYOUT.frame.baseAltitude + 32.1) - 0.924436) < 1e-6, 'T2 foliage cap about 0.92 m below the office roof');
  assert.ok(floor(LAYOUT, 'T1', 4).z0 === 13 && floor(LAYOUT, 'T2', 4).z0 === 13 && floor(LAYOUT, 'T3', 4).z0 === 13);
  // The generic interior recipe stacks 4.2/3.5 m storeys; it must not generate these towers.
  const generic = generateBuildingInteriorPlan({ worldId: 'w', building: { id: 'b', center: [0, 0, 0], size: [20, 24, 30], yaw_deg: 0, kind: 'office', ring: [[-10, -12], [10, -12], [10, 12], [-10, 12], [-10, -12]] },
    entrance: { id: 'e', position: [0, -12], outward: [0, -1] }, seed: 'b', levels: 4, baseElevation: 0 });
  assert.notDeepEqual(generic.levels.map(level => level.floorElevation), [0, 5, 9, 13]);
});

test('both skywalks span facade to facade at Floor 4: 23 m and 15 m, 4 m overall with a 3 m clear route', () => {
  const [b12, b23] = LAYOUT.bridges;
  assert.deepEqual([b12.from.v, b12.to.v, b12.to.v - b12.from.v], [70, 93, 23]);
  assert.deepEqual([b23.from.v, b23.to.v, b23.to.v - b23.from.v], [116, 131, 15]);
  assert.equal(floor(LAYOUT, 'T1', 4).rect[3], 70, 'T1 north F4 facade');
  assert.equal(floor(LAYOUT, 'T2', 4).rect[1], 93, "T2's stepped south F4 facade, not its v 90 base");
  assert.equal(floor(LAYOUT, 'T3', 4).rect[1], 131, "T3's stepped south F4 facade");
  for (const bridge of LAYOUT.bridges) {
    assert.deepEqual([bridge.deckZ, bridge.underside, bridge.guard, bridge.grossWidth, bridge.clearWidth], [13, 12.65, 1.25, 4, 3]);
    for (const portal of bridge.portals) assert.deepEqual([portal.opening, portal.position[2], portal.clearHeight >= CAMPUS_BODY.height + 0.3], [[14.5, 17.5], 13, true]);
    for (const landing of bridge.landings) assert.equal(landing.rect[3] - landing.rect[1], 3);
  }
  assert.deepEqual(LAYOUT.bridges.flatMap(b => b.landings.map(l => l.id)), ['T1-F4-north', 'T2-F4-south', 'T2-F4-north', 'T3-F4-south']);
});

test('one public Floor 4 route joins all three galleries through both skywalks, never through a suite', () => {
  const route = campusRoute('T1-F4-public', 'T3-F4-public', { walkOnly: true });
  assert.deepEqual(route, ['T1-F4-public', 'T1-F4-north', 'B12-from', 'B12', 'B12-to', 'T2-F4-south', 'T2-F4-public', 'T2-F4-north', 'B23-from', 'B23', 'B23-to', 'T3-F4-south', 'T3-F4-public']);
  const { nodes } = campusGraph();
  for (const id of route) assert.equal(nodes.get(id).access, 'public');
  for (const t of ['T1', 'T2', 'T3']) assert.ok(campusRoute(`${t}-F4/lobby`, `${t}-F4-public`, { walkOnly: true }).includes(`${t}-F4-core-spur`));
  // The street reaches every gallery by a core, and every public roof and terrace.
  for (const id of ['T1-F4-public', 'T2-roof', 'T3-terrace-5', 'T2-terrace-4', 'S', 'C']) assert.ok(campusRoute('E1', id), id);
  // A suite is not a way across: with private nodes allowed the shortest path still uses the gallery.
  assert.ok(!campusRoute('T1-F4-public', 'T3-F4-public', { publicOnly: false, walkOnly: true }).some(id => nodes.get(id).kind === 'suite'));
});

test('support resolves against the occupant level: ground below a skywalk, deck above, never the highest surface', () => {
  // Under B12 on the P2 cross-route.
  assert.deepEqual(campusSurfacesAt(16, 76).map(s => [s.levelId, s.surfaceId, s.z]), [[L(0), 'ground', 0], [L(3), 'B12', 13]]);
  assert.equal(campusSupportAt(L(0), 16, 76).z, 0, 'a street walker under the bridge stays on the ground');
  assert.equal(campusSupportAt(L(3), 16, 76).surfaceId, 'B12');
  // Under B23 above T3's z 9 terrace, which is the roof of T3's own first two floors.
  assert.deepEqual(campusSurfacesAt(16, 129.5).map(s => [s.levelId, s.surfaceId]), [[L(0), 'T3-F1-hall'], [L(1), 'T3-F2-spine'], [L(2), 'T3-terrace-3/1'], [L(3), 'B23']]);
  assert.ok(LAYOUT.bridges[1].underside - 9 >= CAMPUS_BODY.height + 0.3, 'standing headroom on the terrace below B23');
  // Off the deck at deck level, inside a lift shaft, or inside a guard: no support.
  assert.equal(campusSupportAt(L(3), 10, 80), null);
  assert.equal(campusSupportAt(L(3), 9, 56), null, 'T1 lift shaft');
  assert.equal(campusSupportAt(L(3), 14.2, 80), null, 'B12 edge zone');
  assert.equal(campusSupportAt('garden-campus/l9', 16, 76), null);
  // B12 meets T2's z 13 terrace at the same level before the facade.
  assert.equal(campusSupportAt(L(3), 16, 91.5).z, 13);
  assert.ok(campusSupportAt(L(3), 20, 91.5).surfaceId.startsWith('T2-terrace-4'));
});

test('levels are keyed by elevation campus-wide with portals, openings and reachable roofs and terraces', () => {
  const levels = campusLevels();
  assert.deepEqual(levels.map(level => [level.id, level.z]), CAMPUS_ELEVATIONS.map((z, i) => [L(i), z]));
  const l3 = levels[3];
  for (const id of ['T1-F4-public', 'T2-F4-public', 'T3-F4-public', 'B12', 'B23', 'T2-terrace-4/0']) assert.ok(l3.surfaces.some(s => s.id === id), id);
  for (const level of levels) for (const portal of level.portals) {
    const target = levels.find(item => item.id === portal.toLevel);
    assert.ok(target.portals.some(other => other.id === portal.toPortal && other.toPortal === portal.id), portal.id);
  }
  for (const level of levels) for (const surface of level.surfaces.filter(s => s.kind === 'roof')) assert.ok(surface.reachedBy.length >= 2, surface.id);
  assert.deepEqual(levels[7].surfaces.map(s => s.id), ['T2-roof']);
  // The pergola's posts are authoritative ground obstacles; its keep-clear interior excludes them.
  const posts = levels[0].obstacles.filter(o => o.kind === 'post');
  assert.equal(posts.length, 11);
  assert.deepEqual(levels[0].keepClear.find(k => k.id === 'S-below').rect, [4.3, 154.3, 23.7, 167.7]);
  const noAccess = clone();delete tower(noAccess, 'T3').roof.headhouse;
  const result = validateGardenCampus(noAccess);
  assert.ok(result.findings.some(f => f.rule === 'reach' && f.id === 'T3-roof'));
});

test('units are real net suites with stable ids, a door from public circulation and a seated desk', () => {
  const units = campusUnitInventory();
  assert.equal(units.length, new Set(units.map(u => u.id)).size);
  assert.ok(units.every(u => u.level >= 2 && u.terms === 'unset (#509)'));
  assert.ok(units.some(u => u.id === 'T1-F2-W-S' && u.number === 'T1-201'));
  const gross = LAYOUT.towers.flatMap(t => t.levels.filter(l => l.level > 1)).reduce((sum, l) => sum + (l.rect[2] - l.rect[0]) * (l.rect[3] - l.rect[1]), 0);
  const net = units.reduce((sum, u) => sum + u.netArea, 0);
  assert.ok(net > 0.4 * gross && net < 0.8 * gross, `net ${net} of gross ${gross}`);
  for (const level of campusLevels()) for (const opening of level.openings.filter(o => o.kind === 'suite-door')) {
    const from = level.surfaces.find(s => s.id === opening.from), into = level.surfaces.find(s => s.id === opening.to);
    assert.equal(from.access, 'public', opening.id);assert.equal(into.access, 'private-suite', opening.id);
  }
  for (const t of LAYOUT.towers) for (const l of t.levels) for (const suite of l.suites) {
    const [u0, v0, u1, v1] = suite.rect, [du, dv] = suite.desk.anchor;
    assert.ok(du - u0 >= CAMPUS_BODY.seatedRadius && u1 - du >= CAMPUS_BODY.seatedRadius && dv - v0 >= CAMPUS_BODY.seatedRadius && v1 - dv >= CAMPUS_BODY.seatedRadius, suite.id);
  }
  // Top-tier east strips (1.5 m) are recorded as residual, never counted as a suite.
  assert.ok(floor(LAYOUT, 'T1', 6).residual.some(r => r.id === 'T1-F6-E' && /below the 3 m suite minimum/.test(r.reason)));
});

test('the body envelope is the current conservative AVATAR_ENVELOPE', () => {
  assert.deepEqual({ ...AVATAR_ENVELOPE }, { ...CAMPUS_BODY });
});

test('versions: an incompatible floor, support or units version is refused', () => {
  assert.equal(checkCampusCompatibility({ id: LAYOUT.id, floors: 1, support: 1, units: 1 }).ok, true);
  for (const required of [{ id: LAYOUT.id, floors: 2 }, { id: LAYOUT.id, support: 2 }, { id: LAYOUT.id, units: 0 }, { id: 'other' }])
    assert.equal(checkCampusCompatibility(required).ok, false, JSON.stringify(required));
  assert.ok(rules(validateGardenCampus(LAYOUT, { required: { id: LAYOUT.id, floors: 2 } })).includes('version'));
});

test('defects fail: shifted endpoint, wrong height, offsite volume, overlap, blocked landing and route, roof object off its support', () => {
  const shifted = clone();Object.assign(shifted.bridges[0].to, { v: 94 });shifted.bridges[0].rect[3] = 94;shifted.bridges[0].portals[1].position[1] = 94;
  assert.ok(['endpoint', 'span'].every(rule => rules(validateGardenCampus(shifted)).includes(rule)));

  const low = clone();low.bridges[1].deckZ = 12.5;low.bridges[1].portals.forEach(p => { p.position[2] = 12.5; });
  assert.ok(rules(validateGardenCampus(low)).includes('elevation'));

  const offsite = clone();tower(offsite, 'T3').tiers[0].rect[2] = 40;
  assert.ok(rules(validateGardenCampus(offsite)).includes('offsite'));

  const overlap = clone();floor(overlap, 'T2', 4).suites[0].rect[2] = 16;
  assert.ok(rules(validateGardenCampus(overlap)).includes('overlap'));

  const landing = clone();landing.obstacles.push({ id: 'planter', kind: 'planter', rect: [15, 94, 17, 95] });
  const blockedLanding = validateGardenCampus(landing);
  assert.ok(blockedLanding.findings.some(f => f.rule === 'blocked' && f.id === 'planter/T2-F4-south'));
  assert.ok(rules(blockedLanding).includes('route'), 'the gallery route is cut');

  const moved = clone();moved.bridges[0].landings[0].rect = [14.5, 63, 17.5, 66];
  assert.ok(validateGardenCampus(moved).findings.some(f => f.rule === 'landing' && f.id === 'T1-F4-north'), 'a landing moved away from its portal');

  const gallery = clone();gallery.obstacles.push({ id: 'screen', kind: 'furniture', rect: [14.5, 104, 17.5, 105] });
  assert.equal(campusRoute('T1-F4-public', 'T3-F4-public', { layout: gallery, walkOnly: true }), null);
  assert.equal(campusRoute('T1-F4-public', 'T3-F4-public', { layout: gallery, walkOnly: true, publicOnly: false }), null, 'suites cannot replace the public crossing');

  const deck = clone();deck.obstacles.push({ id: 'kiosk', kind: 'furniture', rect: [15, 122, 17, 123] });
  assert.equal(campusRoute('T2-F4-public', 'T3-F4-public', { layout: deck, walkOnly: true }), null);
  assert.ok(rules(validateGardenCampus(deck)).includes('route'));

  const roof = clone();tower(roof, 'T1').roof.planting.beds[0].rect[0] = 4;
  assert.ok(validateGardenCampus(roof).findings.some(f => f.rule === 'support' && f.id === 'T1-roof-bed-west'));

  const post = clone();post.groundBuildings.find(b => b.id === 'S').posts.push({ id: 'S-post-x', rect: [23.7, 160, 24, 160.3] });
  assert.ok(validateGardenCampus(post).findings.some(f => f.rule === 'blocked' && f.id === 'S-post-x/P7'));

  const tall = clone();tower(tall, 'T2').silhouette.headhouseTop = 33;
  assert.ok(rules(validateGardenCampus(tall)).includes('silhouette'));

  // A ground/bridge support mix-up: a deck registered on the ground level would lift street walkers.
  const mixed = campusLevels();const ground = mixed[0];
  ground.surfaces.push({ ...mixed[3].surfaces.find(s => s.id === 'B12') });
  const highestFirst = ground.surfaces.filter(s => s.rect && s.rect[0] <= 16 && s.rect[2] >= 16 && s.rect[1] <= 76 && s.rect[3] >= 76);
  assert.equal(highestFirst.length, 1, 'only the injected deck matches by rect on the ground level');
  assert.equal(campusSupportAt(L(0), 16, 76).surfaceId, 'ground', 'the contract itself keeps the deck off the ground level');
});

test('the retained IPIC wall stays closed and entries connect through explicit seams', () => {
  const wall = LAYOUT.context.ipic.wall;
  assert.ok(Math.abs(wall.length - 98.67781685) < 1e-6 && Math.abs(wall.from[1] - 82.5438188994) < 1e-9);
  const opened = clone();opened.paths.find(p => p.id === 'P5').rect[0] = 0;
  assert.ok(rules(validateGardenCampus(opened)).includes('ipic'));
  assert.deepEqual(LAYOUT.entries.map(e => e.id), ['E1', 'E2', 'E3']);
  for (const seam of LAYOUT.seams) assert.ok(seam.polygon.length >= 5, seam.id);
  assert.deepEqual(LAYOUT.entries.map(e => Math.round(e.threshold * 1000)), [-31, -11, 59]);
  const gap = clone();gap.seams[0].polygon = [null];
  assert.ok(rules(validateGardenCampus(gap)).includes('seam'));
});

test('the envelope bounds every current human appearance (fresh measurement, not the stale 22-look comment)', async () => {
  const { SHARED_APPEARANCES } = await import('../src/shared-appearances.js');
  const receipt = JSON.parse(readFileSync(new URL('../../docs/design/garden-campus/avatar-envelope.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(receipt.looks).sort(), SHARED_APPEARANCES.map(look => look.id).sort(), 'remeasure when the catalog changes');
  for (const [id, look] of Object.entries(receipt.looks)) {
    assert.ok(look.widthM / 2 <= CAMPUS_BODY.bodyHalfWidth + 1e-9 && look.heightM <= CAMPUS_BODY.height + 1e-9, id);
    assert.ok(look.turningRadiusM <= CAMPUS_BODY.turningRadius && look.seated.footprintRadiusM <= CAMPUS_BODY.seatedRadius, id);
  }
});

test('published contract, manifest and views are generated from the module and current', async () => {
  const { renderCampusArtifacts } = await import('../../scripts/garden-campus-views.mjs');
  for (const [name, text] of Object.entries(renderCampusArtifacts()))
    assert.equal(readFileSync(new URL(`../../docs/design/garden-campus/${name}`, import.meta.url), 'utf8'), text, `${name} is stale: run node scripts/garden-campus-views.mjs`);
});
