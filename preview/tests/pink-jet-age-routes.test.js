import assert from 'node:assert/strict';
import test from 'node:test';
import { CAMPUS_BODY, campusLevels, campusSupportAt } from '../../shared/garden-campus-layout.js';
import { createCommonsLayout, insideRect } from '../../shared/east-garden-commons-layout.js';
import { composeCommonsDestination } from '../../shared/commons-destination.js';
import { BLANK_LUMA_SPREAD, ROUTE_HOURS, commonsCameras, gardensCameras, imageVerdict, routeOptions, scenePose, validateCameras, validateReport, viewName } from '../e2e/pink-jet-age-routes-plan.mjs';

// A synthetic District edge and flat edge heights: the same composition the client runs.
const layout = composeCommonsDestination(createCommonsLayout({ districtBounds: [-2920, -1457, -2666.3, -1167], edgeHeights: Array(13).fill(18.4) }));
const cameras = [...gardensCameras(), ...commonsCameras(layout)];
const levels = new Map(campusLevels().map(level => [level.id, level]));
const gap = ([u0, v0, u1, v1], [u, v]) => Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1));

test('both routes cover every stop the issue names, in walking order', () => {
  validateCameras(cameras);
  assert.deepEqual([...new Set(gardensCameras().map(camera => camera.stop))], ['arrival', 'facade', 'entrance', 'lift', 'skywalk', 'seated', 'social']);
  assert.deepEqual([...new Set(commonsCameras(layout).map(camera => camera.stop))], ['arrival', 'court', 'seated', 'tower', 'social']);
  assert.deepEqual(cameras.map(camera => camera.id), [...cameras.map(camera => camera.id)].sort());
});

test('Gardens eye-height cameras stand on public campus ground at their level, clear of obstacles', () => {
  for (const camera of gardensCameras().filter(item => item.levelId)) {
    const [u, v, z] = camera.source.position, support = campusSupportAt(camera.levelId, u, v);
    assert.equal(support?.access, 'public', `${camera.id} stands on public ground`);
    const eye = z - support.z;
    assert.ok(eye >= 1.1 && eye <= 1.75, `${camera.id} at seated or standing eye height (${eye})`);
    for (const obstacle of levels.get(camera.levelId).obstacles) assert.ok(gap(obstacle.rect, [u, v]) >= CAMPUS_BODY.bodyHalfWidth * 0.5, `${camera.id} clear of ${obstacle.id}`);
  }
});

test('Commons cameras follow the placed destination and stand inside its walkable bounds', () => {
  for (const camera of commonsCameras(layout)) {
    const [east, north, altitude] = camera.source.position;
    assert.ok(insideRect(layout.bounds, east, north), `${camera.id} inside the Commons bounds`);
    assert.ok(layout.surfaces.some(surface => insideRect(surface.rect, east, north)), `${camera.id} over a Commons surface`);
    assert.ok(altitude - layout.ground >= 1.1 && altitude - layout.ground <= 1.75, `${camera.id} at eye height`);
  }
  const tower = layout.destination.pieces.find(piece => piece.piece === 'landmark/water-tower').at;
  assert.deepEqual(commonsCameras(layout).find(camera => camera.id === 'b04-green-to-tower').source.target.slice(0, 2), tower, 'the tower view aims at the placed tower');
  assert.throws(() => commonsCameras({ ...layout, destination: { ...layout.destination, pieces: [] } }), /missing/);
});

test('scene poses map campus and source metres into Three.js [east, up, -north]', () => {
  const commons = scenePose(commonsCameras(layout)[0]), [east, north, up] = commonsCameras(layout)[0].source.position;
  assert.deepEqual(commons.position, [east, up, -north]);
  const gardens = scenePose(gardensCameras()[0]);
  assert.ok(gardens.position.every(Number.isFinite) && gardens.position[1] > 18, 'campus z is above the campus base altitude');
});

test('the camera table rejects malformed entries', () => {
  const good = gardensCameras()[1];
  for (const bad of [{ ...good, id: 'x01-bad' }, { ...good, route: 'commons' }, { ...good, fov: 120 }, { ...good, subject: '' },
    { ...good, source: { position: [1, 2, NaN], target: [5, 5, 5] } }, { ...good, source: { position: [1, 1, 1], target: [1, 1, 2] } }])
    assert.throws(() => validateCameras([bad]), Error, JSON.stringify(bad.id));
  assert.throws(() => validateCameras([good, good]), /duplicate/);
});

test('options pin graphics and hours, accept only finishes the live world can draw, and never default to output/playwright', () => {
  const now = new Date('2026-10-28T20:00:00.000Z');
  assert.deepEqual(routeOptions([], now), { graphics: 'sharp', hours: ['day', 'dusk', 'night'], cameras: null, finish: 'classic', out: '.runtime/pink-jet-age-r9/2026-10-28T20-00-00-000Z' });
  assert.deepEqual(routeOptions(['--graphics=smooth', '--hours=dusk', '--cameras=a01-arrival-e1', '--finish=classic', '--out=/tmp/x'], now),
    { graphics: 'smooth', hours: ['dusk'], cameras: ['a01-arrival-e1'], finish: 'classic', out: '/tmp/x' });
  assert.throws(() => routeOptions(['--finish=pink']), /not wired into the live world/);
  for (const args of [['--graphics=auto'], ['--hours=noon'], ['--graphics=sharp', '--graphics=smooth'], ['--fps=60']]) assert.throws(() => routeOptions(args), /Invalid or duplicate/, args.join(' '));
  assert.ok(ROUTE_HOURS.night <= 19 && ROUTE_HOURS.dusk < ROUTE_HOURS.night && ROUTE_HOURS.day < ROUTE_HOURS.dusk);
});

test('a flat frame is blank, a dim one dark, and the report needs one measured view per camera and hour', () => {
  assert.equal(imageVerdict({ mean: 0, spread: 0 }), 'blank');
  assert.equal(imageVerdict({ mean: 120, spread: BLANK_LUMA_SPREAD - 1 }), 'blank');
  assert.equal(imageVerdict({ mean: 8, spread: 20 }), 'dark');
  assert.equal(imageVerdict({ mean: 110, spread: 40 }), 'ok');
  const subset = cameras.slice(0, 2), hours = { day: 15, night: 19 };
  const views = subset.flatMap(camera => Object.entries(hours).map(([label, hour]) => ({ name: viewName(camera, label), route: camera.route, camera: camera.id, hour,
    calls: 400, triangles: 1e6, frameP50: 16.7, frameP95: 18, png: `${viewName(camera, label)}.png`, image: { mean: 100, spread: 40, verdict: 'ok' } })));
  const report = { status: 'passed', head: 'abc', revision: 'east-garden-commons-market-1', graphics: 'sharp', finish: 'classic', hours, cameras: subset, views };
  assert.equal(validateReport(report), report);
  assert.throws(() => validateReport({ ...report, views: views.slice(1) }), /missing view/);
  assert.throws(() => validateReport({ ...report, views: views.map((view, i) => i ? view : { ...view, image: { verdict: 'blank' } }) }), /image blank/);
  assert.throws(() => validateReport({ ...report, views: views.map((view, i) => i ? view : { ...view, calls: null }) }), /calls/);
  assert.throws(() => validateReport({ ...report, finish: '' }), /finish/);
});
