import test from 'node:test';
import * as THREE from 'three';
import { buildGardenCampusFitout } from '../src/garden-campus-fitout-render.js';
import { loadDistrictData } from '../../server/district-data.js';
import assert from 'node:assert/strict';
import { FITOUT_VERSION, campusFitout, campusFitoutObstacles, campusFitoutSeat, campusUnitSeats, validateCampusFitout } from '../../shared/garden-campus-fitout.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusSupportAt, campusUnitInventory, rectsOverlap } from '../../shared/garden-campus-layout.js';

const fitout = campusFitout(), levels = new Map(campusLevels().map(level => [level.id, level]));
const mutate = edit => { const copy = structuredClone(fitout);edit(copy);return validateCampusFitout(CAMPUS, copy); };
const rules = result => [...new Set(result.findings.map(item => item.rule))].sort();

test('every advertised suite has a private desk whose stand point is on that suite', () => {
  assert.equal(FITOUT_VERSION, 1);
  assert.deepEqual(validateCampusFitout(), { ok: true, findings: [] });
  for (const unit of campusUnitInventory()) {
    const seats = campusUnitSeats(unit.id);
    assert.ok(seats.some(seat => seat.kind === 'desk' && seat.primary), `${unit.id} has a primary desk`);
    for (const seat of seats) {
      assert.equal(campusSupportAt(seat.levelId, ...seat.stand)?.surfaceId, unit.id, `${seat.id} stands on its suite`);
      assert.equal(campusSupportAt(seat.levelId, ...seat.stand)?.access, 'private-suite');
      assert.ok(seat.workstation, `${seat.id} is a workstation`);
      assert.equal(campusFitoutSeat(seat.id), seat);
    }
  }
  const seats = fitout.levels.flatMap(level => level.seats);
  assert.equal(new Set(seats.map(seat => seat.id)).size, seats.length, 'seat ids are unique');
  assert.deepEqual(campusFitout(), fitout, 'deterministic');
});

test('no suite furniture enters a public route, a landing, a core or a door threshold', () => {
  for (const entry of fitout.levels) {
    const level = levels.get(entry.levelId);
    for (const item of entry.obstacles) {
      for (const zone of level.keepClear) assert.equal(rectsOverlap(item.rect, zone.rect), false, `${item.id} in ${zone.id}`);
      const surface = campusSupportAt(entry.levelId, (item.rect[0] + item.rect[2]) / 2, (item.rect[1] + item.rect[3]) / 2);
      assert.equal(surface?.surfaceId, item.unitId, `${item.id} stands in its own suite`);
    }
    assert.deepEqual(campusFitoutObstacles(entry.levelId), entry.obstacles);
  }
});

test('the validator rejects furniture in the spine, a cramped stand point, a blocked route and a seat off its floor', () => {
  // A desk pushed into the public spine of its floor.
  assert.ok(rules(mutate(copy => { const desk = copy.levels[1].obstacles.find(item => item.kind === 'desk');desk.rect = [14, desk.rect[1], 15.6, desk.rect[3]]; })).includes('blocked'));
  // A stand point moved against the suite wall.
  assert.ok(rules(mutate(copy => { const seat = copy.levels[1].seats[0], suite = CAMPUS.towers.flatMap(t => t.levels.flatMap(f => f.suites)).find(s => s.id === seat.unitId);seat.stand = [suite.rect[0] + 0.2, seat.stand[1]]; })).includes('clear'));
  // A storage wall across the suite between the door and the desks.
  assert.ok(rules(mutate(copy => {
    const seat = copy.levels[1].seats[0], suite = CAMPUS.towers.flatMap(t => t.levels.flatMap(f => f.suites)).find(s => s.id === seat.unitId);
    const u = (seat.stand[0] + suite.door.inside[0]) / 2;
    copy.levels[1].obstacles.push({ id: 'wall', unitId: suite.id, kind: 'storage', rect: [u - 0.2, suite.rect[1], u + 0.2, suite.rect[3]], height: 2 });
  })).includes('route'));
  // A hall table dropped into the door-to-lobby route, and a café chair on its table.
  assert.ok(rules(mutate(copy => { copy.ground[0].obstacles[0].rect = [18, 57, 21, 59]; })).includes('blocked'));
  assert.ok(rules(mutate(copy => { const cafe = copy.ground.find(room => room.roomId === 'C-hall');cafe.seats[0].position = [...cafe.obstacles[0].rect.slice(0, 2)].map(n => n + 0.2); })).includes('support'));
});

test('the halls and the café offer real seats: free floor, approach clear, workstation or not by design', () => {
  for (const room of fitout.ground) {
    assert.ok(room.seats.length >= 8, `${room.roomId} seats`);
    for (const seat of room.seats) assert.ok(seat.approach && seat.workstation, `${seat.id}`);
  }
  assert.deepEqual(fitout.ground.map(room => room.roomId), ['T1-F1-hall', 'T2-F1-hall', 'T3-F1-hall', 'C-hall']);
});

test('the fit-out draws every desk with one neutral screen and every seat, and releases what it owns', async () => {
  assert.equal(buildGardenCampusFitout(await loadDistrictData()), null, 'nothing without the campus');
  const group = buildGardenCampusFitout(await loadDistrictData({ districtRevision: 'river-oaks-gardens-3' }));
  const desks = fitout.levels.flatMap(level => level.obstacles).filter(item => item.kind === 'desk').length;
  const seats = fitout.levels.flatMap(level => level.seats).length + fitout.ground.flatMap(room => room.seats).length;
  assert.equal(group.userData.counts.screen, desks, 'one dark screen per desk');
  // A chair is a seat cushion, a back and a post, in two finishes.
  assert.equal(group.userData.counts.fabric, seats * 2);
  const owned = [];group.traverse(item => { if (item.material) owned.push(item.material);if (item.geometry) owned.push(item.geometry); });
  let released = 0;for (const item of new Set(owned)) item.addEventListener('dispose', () => released++);
  group.userData.dispose();
  assert.equal(released, new Set(owned).size);
  assert.ok(group instanceof THREE.Group);
});
