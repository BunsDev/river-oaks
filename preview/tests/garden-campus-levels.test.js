import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';
import { campusFacadeGlass, campusInteriorPlan, campusLevelRoom, interiorLevelFor, registerCampusLevelObstacles } from '../src/garden-campus-levels.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusSupportAt, campusToSource, sourceToCampus } from '../../shared/garden-campus-layout.js';

const garage = await loadDistrictData(), campus = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS });
const levels = campusLevels(), upper = levels.slice(1), STEP = 0.25;
const environment = levelId => createWalkingEnvironment(campus, [], levelId);
const freeAt = (env, [u, v]) => { const [e, n] = campusToSource([u, v]);return env.isFree(e, -n); };

// The grid cells a body can walk to from the seeds, moving 0.25 m at a time through free ground.
function reachable(env, level, seeds) {
  const us = level.surfaces.flatMap(s => [s.rect[0], s.rect[2]]), vs = level.surfaces.flatMap(s => [s.rect[1], s.rect[3]]);
  const u0 = Math.min(...us), v0 = Math.min(...vs), cols = Math.ceil((Math.max(...us) - u0) / STEP) + 1, rows = Math.ceil((Math.max(...vs) - v0) / STEP) + 1;
  const point = (i, j) => [u0 + i * STEP, v0 + j * STEP], seen = new Uint8Array(cols * rows), queue = [];
  for (const [u, v] of seeds) { const i = Math.round((u - u0) / STEP), j = Math.round((v - v0) / STEP);if (freeAt(env, point(i, j)) && !seen[j * cols + i]) { seen[j * cols + i] = 1;queue.push([i, j]); } }
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || seen[nj * cols + ni]) continue;
      const [a, b] = point(i, j), [c, d] = point(ni, nj);
      if (!freeAt(env, [c, d]) || !freeAt(env, [(a + c) / 2, (b + d) / 2])) continue;
      seen[nj * cols + ni] = 1;queue.push([ni, nj]);
    }
  }
  return ([u, v]) => { const i = Math.round((u - u0) / STEP), j = Math.round((v - v0) / STEP);return i >= 0 && j >= 0 && i < cols && j < rows && Boolean(seen[j * cols + i]); };
}

test('the campus floors are one interior plan with paired portals, and only on the campus', () => {
  assert.equal(campusInteriorPlan(garage), null);
  assert.equal(campusLevelRoom(garage, 'garden-campus/l3'), null);
  const plan = campusInteriorPlan(campus), portals = plan.levels.flatMap(level => level.portals.map(portal => ({ ...portal, levelId: level.id })));
  assert.deepEqual(plan.levels.map(level => [level.id, level.index]), levels.map((level, index) => [level.id, index]));
  for (const portal of portals) {
    const pair = portals.find(item => item.id === portal.toPortal && item.levelId === portal.toLevelId);
    assert.ok(pair, `${portal.id} has its pair`);
    assert.deepEqual([pair.toPortal, pair.toLevelId, pair.kind], [portal.id, portal.levelId, portal.kind], `${portal.id} pairs both ways, lift to lift and stairs to stairs`);
  }
  assert.equal(interiorLevelFor(campus, 'garden-campus/l3').plan, plan);
  assert.equal(interiorLevelFor(garage, 'garden-campus/l3'), null);
});

test('a free body never overhangs the edge of its floor: walls, glass, guards and shafts close every level', () => {
  for (const level of upper) {
    const env = environment(level.id), us = level.surfaces.flatMap(s => [s.rect[0], s.rect[2]]), vs = level.surfaces.flatMap(s => [s.rect[1], s.rect[3]]);
    let free = 0;
    for (let u = Math.min(...us) - 1; u <= Math.max(...us) + 1; u += 0.5) for (let v = Math.min(...vs) - 1; v <= Math.max(...vs) + 1; v += 0.5) {
      if (!freeAt(env, [u, v])) continue;
      free++;
      for (let k = 0; k < 12; k++) {
        const a = k / 6 * Math.PI, support = campusSupportAt(level.id, u + Math.cos(a) * 0.35, v + Math.sin(a) * 0.35);
        assert.ok(support && support.access !== 'service', `${level.id}: a body at [${u}, ${v}] overhangs ${support ? 'a service room' : 'the edge'}`);
      }
    }
    assert.ok(free > 500, `${level.id} has walkable floor`);
  }
});

test('Floor 4 is one walk from T1’s lift through both skywalks to T3, and every public floor, terrace and roof is reached from its cores', () => {
  const l3 = levels[3], t1Lift = campusInteriorPlan(campus).levels[3].portals.find(p => p.id === 'T1-F4/lift-down');
  const fromT1 = reachable(environment(l3.id), l3, [sourceToCampus(t1Lift.position)]);
  for (const [point, label] of [[[16, 60], 'T1 gallery'], [[16, 80], 'B12'], [[16, 104], 'T2 gallery'], [[23.5, 104.5], 'T2 terrace'], [[16, 123], 'B23'], [[16, 140], 'T3 gallery']]) assert.ok(fromT1(point), `${label} from T1's lift`);
  for (const level of upper) {
    const landings = campusInteriorPlan(campus).levels[level.index ?? levels.indexOf(level)].portals.map(p => sourceToCampus(p.position));
    for (const [u, v] of landings) assert.ok(freeAt(environment(level.id), [u, v]), `${level.id}: a landing at [${u}, ${v}] is free`);
    const reach = reachable(environment(level.id), level, landings);
    for (const surface of level.surfaces.filter(s => s.access === 'public')) {
      const [u0, v0, u1, v1] = surface.rect;let found = false;
      for (let u = u0 + 0.125; u < u1 && !found; u += STEP) for (let v = v0 + 0.125; v < v1 && !found; v += STEP) found = reach([u, v]);
      assert.ok(found, `${level.id}: ${surface.id} is reached from its cores`);
    }
  }
});

test('facade glass stops exactly at each skywalk portal and terrace door', () => {
  for (const level of upper) {
    const glass = campusFacadeGlass(level.id);
    for (const opening of level.openings.filter(o => o.kind === 'skywalk-portal' || o.kind === 'terrace-door')) {
      const [u, v] = opening.position;
      assert.ok(!glass.some(({ rect: [a, b, c, d] }) => u >= a - 1e-6 && u <= c + 1e-6 && v >= b - 1e-6 && v <= d + 1e-6), `${opening.id} is open`);
    }
    const plates = CAMPUS.towers.flatMap(tower => tower.levels.filter(floor => floor.z0 === level.z));
    for (const floor of plates) for (const side of ['south', 'north', 'west', 'east']) assert.ok(glass.some(item => item.id === `${floor.id}/glass-${side}`), `${floor.id} is glazed on its ${side} side`);
  }
});

test('registered obstacles (#510’s furniture) block bodies on their own level only', () => {
  const env = environment('garden-campus/l3'), spot = [16, 60];
  assert.ok(freeAt(env, spot));
  registerCampusLevelObstacles(levelId => levelId === 'garden-campus/l3' ? [{ id: 'test/table', rect: [15.8, 59.8, 16.2, 60.2] }] : []);
  assert.equal(freeAt(env, spot), false);
  assert.ok(freeAt(environment('garden-campus/l1'), [16, 60]) || !campusSupportAt('garden-campus/l1', 16, 60), 'other levels unaffected');
});
