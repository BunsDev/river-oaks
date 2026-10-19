import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAMPUS_BODY, GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusSupportAt } from '../../shared/garden-campus-layout.js';
import { EYE, PLANS, circulationCameras, planPoint } from '../e2e/garden-campus-circulation-views.mjs';

const cameras = circulationCameras(), levels = new Map(campusLevels().map(level => [level.id, level]));
const gap = ([u0, v0, u1, v1], [u, v]) => Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1));

test('every gallery, skywalk, terrace and roof the contract makes public has a view', () => {
  const surfaces = [...levels.values()].flatMap(level => level.surfaces.filter(surface => surface.access === 'public'));
  const expected = [
    ...surfaces.filter(surface => surface.kind === 'gallery' || surface.kind === 'deck' || surface.kind === 'roof').map(surface => surface.id),
    ...surfaces.filter(surface => surface.kind === 'terrace' && surface.id.endsWith('/0')).map(surface => surface.id),
  ].sort();
  assert.deepEqual(cameras.map(camera => camera.surfaceId).sort(), expected);
  assert.equal(cameras.length, 3 + 2 + 6 + 3, 'three galleries, two skywalks, six terraces, three roofs');
  assert.equal(new Set(cameras.map(camera => camera.id)).size, cameras.length);
});

test('each view stands where a resident can stand: public support of its own level, eye height, clear of obstacles', () => {
  for (const camera of cameras) {
    const [u, v, z] = camera.position, support = campusSupportAt(camera.levelId, u, v), level = levels.get(camera.levelId);
    assert.ok(support, `${camera.id} has support`);
    assert.deepEqual([support.surfaceId, support.access], [camera.surfaceId, 'public'], camera.id);
    assert.ok(Math.abs(z - (support.z + EYE)) < 1e-9, `${camera.id} at eye height`);
    for (const obstacle of level.obstacles) assert.ok(gap(obstacle.rect, [u, v]) >= CAMPUS_BODY.bodyHalfWidth, `${camera.id} clear of ${obstacle.id}`);
    // Looking along walkable ground, not into a wall or down a shaft.
    const reach = Math.hypot(camera.target[0] - u, camera.target[1] - v);
    assert.ok(reach >= 10, `${camera.id} looks at least 10 m ahead`);
    assert.ok(campusSupportAt(camera.levelId, u + (camera.target[0] - u) * 4 / reach, v + (camera.target[1] - v) * 4 / reach)?.access === 'public', `${camera.id} looks along public ground`);
  }
});

test('Floor 4 views read against the Floor 4 plan and the rest against the site plan, in their own frame', async () => {
  assert.deepEqual([...new Set(cameras.map(camera => `${camera.levelId.endsWith('l3')}:${camera.plan}`))].sort(), ['false:site-plan', 'true:floor-4']);
  for (const [plan, { file }] of Object.entries(PLANS)) {
    const svg = await readFile(file, 'utf8'), [x, y] = planPoint(plan, CAMPUS.parcel.polygon[0]);
    assert.ok(svg.includes(`<polygon points="${Number(x.toFixed(2))},${Number(y.toFixed(2))} `), `${plan}: the parcel's first corner is where the frame puts it`);
  }
});
