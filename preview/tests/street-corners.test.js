import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { STREET, sidewalkOffset, streetOffset, streetSection, crossingDistance } from '../src/street-profile.js';
import { buildRoads } from '../src/street-roads.js';
import { buildDesignatedSidewalks } from '../src/sidewalks.js';
import { createPedestrianNetwork } from '../src/pedestrian-network.js';
import { streetCorners, cornerCurbDistance, junctionClearance, CORNER_RADIUS } from '../src/street-corners.js';
import { registerGroundSurfaces, groundSurfaceHeight } from '../src/world-surface.js';

// A through street along x with a side street leaving it northward at x=0.
const tee = () => ({ bounds_m: [-60, -30, 60, 60], collisionPolygons: [], roads: [
  { id: 'main', kind: 'service', width_m: 8.4, points: [[-50, 0, 0], [0, 0, 0], [50, 0, 0]] },
  { id: 'side', kind: 'service', width_m: 8.4, points: [[0, 0, 0], [0, 50, 0]] },
] });
const half = 4.2, sw = STREET.sidewalkWidth;

// Every triangle of a mesh that contains [east, north], with its height there.
function hits(mesh, [x, y]) {
  const p = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv, found = [];
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map(k => [p.getX(i + k), -p.getZ(i + k), p.getY(i + k)]);
    const d = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const area = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]);
    if (Math.abs(area) < 1e-9) continue;
    const w0 = d(v[1], v[2]) / area, w1 = d(v[2], v[0]) / area, w2 = 1 - w0 - w1;
    if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
    found.push({ height: w0 * v[0][2] + w1 * v[1][2] + w2 * v[2][2], u: uv ? w0 * uv.getX(i) + w1 * uv.getX(i + 1) + w2 * uv.getX(i + 2) : null });
  }
  return found;
}
const corners = world => { const network = createPedestrianNetwork(world); return streetCorners(network.segments, network.crossings); };
const build = world => { const sidewalks = buildDesignatedSidewalks(world), roads = buildRoads(world); registerGroundSurfaces(world, [roads, sidewalks]); return { sidewalks, roads }; };

test('a T junction gets two curb returns and one paving layer across each corner', t => {
  t.mock.method(THREE.TextureLoader.prototype, 'load', () => new THREE.Texture());
  const world = tee(), { sidewalks } = build(world), pavers = sidewalks.getObjectByName('Street pavers');
  assert.equal(sidewalks.userData.streetProfile.corners, 2, 'only the two corners beside the side street');
  // Inside the north-east corner square, where both sidewalks used to overlap.
  for (const point of [[half + 1, half + 2.5], [half + 2.5, half + 1], [half + 3.4, half + 3.1], [half + 0.8, half + 3.6]]) {
    assert.equal(hits(pavers, point).length, 1, `exactly one paver layer at ${point}`);
  }
  // The old square corner is now roadway: no paving and no curb inside the return.
  const mouth = [half + 0.25, half + 0.25];
  assert.equal(hits(pavers, mouth).length, 0);
  // It is ordinary road edge, as low as the asphalt beside a straight curb.
  const edge = streetSection({ width_m: 8.4 }).asphaltHalf;
  assert.ok(Math.abs(groundSurfaceHeight(world, mouth[0], -mouth[1]) - streetOffset(8.4, edge)) < 0.003, 'the mouth is roadway');
});

test('the corner paving meets both sidewalks and the plaza without a step', t => {
  t.mock.method(THREE.TextureLoader.prototype, 'load', () => new THREE.Texture());
  const world = tee(); build(world);
  const corner = corners(world).find(c => c.center[0] > 0);
  for (const arm of corner.arms) for (let lateral = STREET.curbWidth + 0.05; lateral < sw - 0.05; lateral += 0.37) {
    const at = s => [corner.node[0] + arm.away[0] * s + arm.normal[0] * (half + lateral), corner.node[1] + arm.away[1] * s + arm.normal[1] * (half + lateral)];
    const before = at(arm.seam - 0.02), after = at(arm.seam + 0.02);
    const step = groundSurfaceHeight(world, before[0], -before[1]) - groundSurfaceHeight(world, after[0], -after[1]);
    assert.ok(Math.abs(step) < 0.003, `seam step ${step.toFixed(4)} m at lateral ${lateral.toFixed(2)}`);
    // And the grade there is the ordinary sidewalk grade.
    assert.ok(Math.abs(groundSurfaceHeight(world, before[0], -before[1]) - sidewalkOffset(8.4, lateral)) < 0.003);
  }
  // Across the return the walk rises a curb reveal at the curb face.
  const radial = corner.center.map((v, k) => (corner.curb[k] - v) / Math.hypot(corner.curb[0] - corner.center[0], corner.curb[1] - corner.center[1]));
  const outside = corner.center.map((v, k) => v + radial[k] * (CORNER_RADIUS + 0.05)), inside = corner.center.map((v, k) => v + radial[k] * (CORNER_RADIUS - STREET.curbWidth - 0.05));
  const rise = groundSurfaceHeight(world, inside[0], -inside[1]) - groundSurfaceHeight(world, outside[0], -outside[1]);
  // The same measurement across the straight curb, far from the junction.
  const straight = groundSurfaceHeight(world, -30, -(half + STREET.curbWidth + 0.05)) - groundSurfaceHeight(world, -30, -(half - 0.05));
  assert.ok(straight > STREET.curbReveal * 0.8 && Math.abs(rise - straight) < 0.003, `curb return reveal ${rise.toFixed(4)} m vs straight ${straight.toFixed(4)} m`);
  assert.ok(Math.abs(cornerCurbDistance(corner, inside) - (STREET.curbWidth + 0.05)) < 1e-6);
});

test('the corner continues the through street brick courses', t => {
  t.mock.method(THREE.TextureLoader.prototype, 'load', () => new THREE.Texture());
  const world = tee(), { sidewalks } = build(world), pavers = sidewalks.getObjectByName('Street pavers');
  const corner = corners(world).find(c => c.center[0] > 0);
  const main = corner.arms.find(arm => arm.segment.road === 'main');
  const point = s => [corner.node[0] + main.away[0] * s, half + 2];
  const [inside] = hits(pavers, point(main.seam - 0.05)), [outside] = hits(pavers, point(main.seam + 0.05));
  assert.ok(Math.abs(Math.abs(inside.u - outside.u) - 0.1) < 1e-6, 'courses run on across the seam');
});

test('crossings keep clear of junction corners and mapped footways', () => {
  const world = tee();
  world.roads.push({ id: 'walk', kind: 'footway', width_m: 3, points: [[30, -12, 0], [30, 12, 0]] });
  const network = createPedestrianNetwork(world), clear = junctionClearance(half);
  const side = network.crossings.filter(c => c.road === 'side');
  assert.ok(side.length >= 1);
  for (const crossing of side) assert.ok(crossing.center[1] >= clear - 1e-6, `side crossing at ${crossing.center[1].toFixed(2)} m`);
  for (const crossing of network.crossings.filter(c => c.road === 'main')) {
    assert.ok(Math.abs(crossing.center[0]) >= clear - 1e-6, 'main crossings stay out of the junction');
    assert.ok(Math.abs(crossing.center[0] - 30) >= 1.5 + STREET.crossingWidth / 2 + STREET.flareRun - 1e-6, 'and out from under the footway');
  }
  // Pedestrians can still cross the side street on a marked crossing.
  assert.equal(network.classify([side[0].center[0], side[0].center[1]]), 'crossing');
});

test('a stub street too short to clear its crossing keeps square corners', t => {
  t.mock.method(THREE.TextureLoader.prototype, 'load', () => new THREE.Texture());
  const world = tee();
  world.roads[1].points = [[0, 0, 0], [0, 9, 0]];
  const network = createPedestrianNetwork(world), crossing = network.crossings.find(c => c.road === 'side');
  assert.ok(crossing && crossing.center[1] < junctionClearance(half), 'the stub keeps its crossing near the junction');
  assert.equal(corners(world).length, 0);
  const { sidewalks } = build(world);
  assert.equal(sidewalks.userData.streetProfile.corners, 0);
  assert.equal(network.classify(crossing.center), 'crossing');
});

test('district corners meet their sidewalks and never pave a carriageway', t => {
  t.mock.method(THREE.TextureLoader.prototype, 'load', () => new THREE.Texture());
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  const { sidewalks } = build(world), pavers = sidewalks.getObjectByName('Street pavers'), network = createPedestrianNetwork(world);
  const corners = streetCorners(network.segments, network.crossings);
  assert.ok(corners.length >= 20, `${corners.length} curb returns`);
  assert.equal(sidewalks.userData.streetProfile.corners, corners.length);
  const carriageway = ([x, y]) => network.segments.some(s => {
    if (s.walkway) return false;
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (y - s.a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - s.a[0] - dx * t, y - s.a[1] - dy * t) < s.width / 2 - 0.02;
  });
  // Away from crossings the seams differ only by terrain interpolation (about
  // a paver joint). Inside a ramp flare both sides interpolate the flare over
  // their own panels; that lip stays a few millimetres.
  const worst = { plain: 0, flare: 0 };
  for (const corner of corners) {
    for (const arm of corner.arms) for (const lateral of [0.5, 1.5, 2.5, 3.5]) {
      const at = s => [corner.node[0] + arm.away[0] * s + arm.normal[0] * (arm.half + lateral), corner.node[1] + arm.away[1] * s + arm.normal[1] * (arm.half + lateral)];
      const [a, b] = [at(arm.seam - 0.002), at(arm.seam + 0.002)], step = Math.abs(groundSurfaceHeight(world, a[0], -a[1]) - groundSurfaceHeight(world, b[0], -b[1]));
      const kind = crossingDistance(network, arm.segment.road, b) < STREET.crossingWidth / 2 + STREET.flareRun + 1.4 ? 'flare' : 'plain';
      worst[kind] = Math.max(worst[kind], step);
    }
    const probe = corner.center;
    assert.ok(!carriageway(probe) && hits(pavers, probe).length >= 1, `corner at ${corner.node.map(v => v.toFixed(1))} is paved off the road`);
  }
  assert.ok(worst.plain < 0.003, `largest seam step ${worst.plain.toFixed(4)} m`);
  assert.ok(worst.flare < 0.008, `largest seam step in a ramp flare ${worst.flare.toFixed(4)} m`);
});
