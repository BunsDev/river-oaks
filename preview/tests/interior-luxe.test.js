import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planStoreRooms } from '../src/store-rooms.js';
import { LUXE_SUITES, FLUTED_THEMES, WALL_FACE, luxeSuiteFor, luxeShellPlan, flutedPanels, wallWash } from '../src/interior-luxe.js';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const rooms = planStoreRooms(world);

test('every boutique gets a deterministic palette suite, and neighbouring fashion floors differ', () => {
  assert.equal(rooms.length, 30);
  for (const room of rooms) {
    const suite = luxeSuiteFor(room);
    assert.ok(LUXE_SUITES[suite.id], `${room.name} has a known suite`);
    assert.deepEqual(luxeSuiteFor(room), suite, `${room.name} keeps its suite between builds`);
    assert.ok(suite.floor, `${room.name} has a floor`);
  }
  assert.equal(luxeSuiteFor(rooms.find(room => room.theme === 'cinema')).floor, 'carpet');
  const fashion = rooms.filter(room => room.theme === 'fashion');
  assert.ok(new Set(fashion.map(room => luxeSuiteFor(room).id)).size >= 4, 'twelve fashion boutiques do not share one look');
  assert.ok(new Set(rooms.map(room => luxeSuiteFor(room).floor)).size >= 7, 'the district uses the whole floor range');
});

test('shell details hug the floor, walls or ceiling, so circulation and fixtures are untouched', () => {
  for (const room of rooms) {
    const before = JSON.stringify({ fixtures: room.fixtures, obstacles: room.obstacles, people: room.people, lights: room.lights });
    const west = room.aMin + WALL_FACE, east = room.aMax - WALL_FACE, back = room.depth - WALL_FACE;
    for (const part of luxeShellPlan(room)) {
      const label = `${room.name}: ${part.role} ${part.material}`;
      if (part.role === 'halo') {
        assert.ok(part.y - 0.03 >= AVATAR_ENVELOPE.height + 0.1, `${label} hangs above the tallest look`);
        assert.ok(part.a - part.radius > west && part.a + part.radius < east && part.d + part.radius < back, `${label} fits the room`);
        continue;
      }
      const [w, h, l] = part.size, a0 = part.a - w / 2, a1 = part.a + w / 2, d0 = part.d - l / 2, d1 = part.d + l / 2, y0 = part.y - h / 2, y1 = part.y + h / 2;
      assert.ok(a0 >= room.aMin - 1e-9 && a1 <= room.aMax + 1e-9 && d0 >= 0 && d1 <= room.depth + 1e-9 && y0 >= 0 && y1 <= room.height + 1e-9, `${label} stays inside the room`);
      const flush = y1 <= 0.02, overhead = y0 >= AVATAR_ENVELOPE.height + 0.1;
      // Anything at body height sits within 4 cm of a wall face.
      const onWall = a1 <= west + 0.04 || a0 >= east - 0.04 || d0 >= back - 0.04;
      assert.ok(flush || overhead || onWall, `${label} intrudes into the room at ${part.a.toFixed(2)},${part.d.toFixed(2)},${part.y.toFixed(2)}`);
      if (part.role === 'inlay') assert.ok(d0 >= 1.6, `${label} keeps clear of the door mat`);
    }
    assert.equal(JSON.stringify({ fixtures: room.fixtures, obstacles: room.obstacles, people: room.people, lights: room.lights }), before, `${room.name}: the plan is not mutated`);
  }
});

test('fluted back walls frame the feature display instead of covering it', () => {
  for (const room of rooms) {
    const panels = flutedPanels(room), feature = room.fixtures.find(fixture => fixture.kind === 'feature');
    if (!FLUTED_THEMES.has(room.theme)) { assert.deepEqual(panels, []); continue; }
    assert.ok(panels.length > 0, `${room.name} has fluting`);
    for (const panel of panels) {
      assert.ok(panel.a0 >= room.aMin + WALL_FACE - 1e-9 && panel.a1 <= room.aMax - WALL_FACE + 1e-9 && panel.a1 - panel.a0 > 0.3, `${room.name}: panel inside the back wall`);
      assert.ok(Math.abs(panel.d - (room.depth - WALL_FACE)) < 0.01, `${room.name}: panel on the back wall face`);
      if (feature) assert.ok(panel.a1 <= feature.a - feature.w / 2 || panel.a0 >= feature.a + feature.w / 2, `${room.name}: panel overlaps the feature frame`);
    }
  }
});

test('the wall wash brightens towards the crown light and never goes dark', () => {
  let previous = -Infinity;
  for (let v = 0; v <= 0.86; v += 0.02) { const value = wallWash(v); assert.ok(value >= previous - 1e-9 && value >= 0.3 && value <= 1); previous = value; }
  assert.ok(wallWash(0.84) > 2 * wallWash(0.05));
});
