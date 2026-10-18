import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { attachGardenCampus } from '../src/garden-campus-district.js';
import { buildGardenCampus } from '../src/garden-campus.js';
import { PARTITION_THICKNESS, SUITE_DOOR_HEIGHT, campusPartitions } from '../../shared/garden-campus-partitions.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusUnitInventory } from '../../shared/garden-campus-layout.js';

const { walls, doors } = campusPartitions(), levels = campusLevels(), EPS = 1e-6;
const crosses = ([a0, b0, a1, b1], [c0, d0, c1, d1]) => a0 < c1 - EPS && a1 > c0 + EPS && b0 < d1 - EPS && b1 > d0 + EPS;
const plateOf = (level, surface) => CAMPUS.towers.find(tower => tower.id === surface.tower).levels.find(floor => floor.z0 === level.z);

test('every suite and service room is closed off; a suite opens only at its contract door', () => {
  let checked = 0;
  for (const level of levels) for (const room of level.surfaces.filter(s => s.access === 'private-suite' || s.access === 'service')) {
    const floor = plateOf(level, room), [p0, q0, p1, q1] = floor.rect, [u0, v0, u1, v1] = room.rect;
    const shafts = level.obstacles.filter(o => o.kind === 'lift' || o.kind === 'stair'), mine = walls.filter(w => w.levelId === level.id);
    const own = level.openings.filter(o => o.kind === 'suite-door' && o.to === room.id);
    for (const [axis, at, lo, hi, facade] of [[1, v0, u0, u1, q0], [1, v1, u0, u1, q1], [0, u0, v0, v1, p0], [0, u1, v0, v1, p1]]) {
      if (Math.abs(at - facade) < EPS) continue;
      const gaps = [];
      for (let t = lo + 0.025; t < hi; t += 0.05) {
        const on = rect => axis === 0 ? rect[0] <= at + EPS && rect[2] >= at - EPS && rect[1] <= t && rect[3] >= t : rect[1] <= at + EPS && rect[3] >= at - EPS && rect[0] <= t && rect[2] >= t;
        // Full height from the floor to the ceiling slab, or a shaft, or a door below its transom.
        const walled = mine.some(w => on(w.rect) && w.z0 <= level.z + EPS && w.z1 >= floor.z1 - CAMPUS.bridges[0].slab - EPS);
        if (!walled && !shafts.some(s => on(s.rect))) gaps.push(t);
      }
      const doorAt = own.filter(o => Math.abs(o.position[axis] - at) < EPS).map(o => [o.position[1 - axis] - o.width / 2, o.position[1 - axis] + o.width / 2]);
      for (const t of gaps) assert.ok(doorAt.some(([a, b]) => t > a && t < b), `${room.id}: open at ${axis ? 'u' : 'v'} ${t.toFixed(2)} on ${axis ? 'v' : 'u'} = ${at}`);
      for (const [a, b] of doorAt) for (let t = a + 0.03; t < b - 0.03; t += 0.05) assert.ok(gaps.some(g => Math.abs(g - t) < 0.026), `${room.id}: its door is open at ${t.toFixed(2)} across ${a.toFixed(2)}–${b.toFixed(2)}`);
      checked++;
    }
  }
  assert.ok(checked > 200, `${checked} interior edges checked`);
});

test('walls stay out of every public route and shaft, inside the plate and under the ceiling slab', () => {
  for (const wall of walls) {
    const level = levels.find(l => l.id === wall.levelId), room = level.surfaces.find(s => s.id === wall.room), floor = plateOf(level, room);
    for (const surface of level.surfaces.filter(s => s.access === 'public')) assert.ok(!crosses(wall.rect, surface.rect), `${wall.room} wall enters ${surface.id}`);
    for (const shaft of level.obstacles.filter(o => o.kind === 'lift' || o.kind === 'stair')) assert.ok(!crosses(wall.rect, shaft.rect), `${wall.room} wall enters ${shaft.id}`);
    const [p0, q0, p1, q1] = floor.rect;
    assert.ok(wall.rect[0] >= p0 - EPS && wall.rect[1] >= q0 - EPS && wall.rect[2] <= p1 + EPS && wall.rect[3] <= q1 + EPS, `${wall.room} wall inside its plate`);
    assert.ok(Math.abs(wall.z1 - (floor.z1 - CAMPUS.bridges[0].slab)) < EPS, `${wall.room} wall meets the slab`);
    const thickness = Math.min(wall.rect[2] - wall.rect[0], wall.rect[3] - wall.rect[1]);
    assert.ok(Math.abs(thickness - PARTITION_THICKNESS) < EPS, `${wall.room} wall is ${thickness} thick`);
  }
  // The Floor 4 galleries keep the contract's 3 m between their walls.
  for (const gallery of levels[3].surfaces.filter(s => s.kind === 'gallery')) assert.equal(gallery.rect[2] - gallery.rect[0], 3);
});

test('each of the 43 suites has one closed door in its contract opening, framed and under a transom', () => {
  const units = campusUnitInventory();
  assert.equal(units.length, 43);
  assert.deepEqual(doors.map(d => d.room).sort(), units.map(u => u.id).sort());
  for (const door of doors) {
    const opening = levels.find(l => l.id === door.levelId).openings.find(o => o.id === door.id);
    const centre = opening.position[1 - door.axis];
    assert.deepEqual(door.span.map(n => Number(n.toFixed(6))), [centre - opening.width / 2, centre + opening.width / 2].map(n => Number(n.toFixed(6))));
    assert.ok(Math.abs(door.head - (door.z0 + SUITE_DOOR_HEIGHT)) < EPS);
    const along = rect => door.axis === 0 ? [rect[1], rect[3]] : [rect[0], rect[2]], across = rect => door.axis === 0 ? [rect[0], rect[2]] : [rect[1], rect[3]];
    assert.deepEqual(along(door.leaf), door.span, `${door.id}: the leaf fills the opening`);
    for (const jamb of door.jambs) assert.ok(along(jamb)[1] <= door.span[0] + EPS || along(jamb)[0] >= door.span[1] - EPS, `${door.id}: jambs outside the clear width`);
    const transom = walls.find(w => w.room === door.room && Math.abs(w.z0 - door.headTop) < EPS && along(w.rect)[0] <= door.span[0] + EPS && along(w.rect)[1] >= door.span[1] - EPS);
    assert.ok(transom, `${door.id}: wall above the door head`);
    const [a, b] = across(transom.rect), [c, d] = across(door.leaf);
    assert.ok(c >= a - EPS && d <= b + EPS, `${door.id}: the leaf sits in the wall's own line`);
  }
});

test('the campus renderer draws every wall and door, and the garage draws none', async () => {
  const garage = await loadDistrictData(), group = buildGardenCampus(attachGardenCampus(garage));
  assert.equal(group.userData.counts.partition, walls.length);
  assert.equal(buildGardenCampus(garage), null);
  group.userData.dispose();
});
