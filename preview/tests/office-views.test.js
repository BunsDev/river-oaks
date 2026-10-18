import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';
import { OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeSeats, officeView, officeViews } from '../src/office-layouts.js';

// #363 bounded views: fixed camera eye/target pairs in the office frame ([x, height above the
// level's floor, d]). They move only the camera, so they need only stay inside the shell.
const legacy = officeLayout(OFFICE_LAYOUT_LEGACY), penthouse = officeLayout(OFFICE_LAYOUT_PENTHOUSE);

test('the penthouse offers six named views; the legacy room offers none', () => {
  assert.deepEqual(officeViews(legacy), []);
  assert.deepEqual(officeViews(penthouse).map(view => view.id), ['overview', 'main-floor', 'workstations', 'library', 'terrace', 'roof-gardens']);
  for (const view of officeViews(penthouse)) assert.equal(officeView(penthouse, view.id), view);
  assert.equal(officeView(penthouse, 'roof'), null);
  assert.equal(officeView(penthouse, '__proto__'), null);
  assert.equal(officeView(legacy, 'overview'), null);
});

test('every view\'s eye stays inside its floor: within the bounds and headroom, clear of walls, the stair and furniture', () => {
  for (const view of officeViews(penthouse)) {
    const level = penthouse.levels.find(item => item.id === view.levelId);
    assert.ok(level, `${view.id} names a level`);
    const [x, h, d] = view.eye, { x0, x1, d0, d1 } = level.bounds;
    assert.ok(x >= x0 + 0.3 && x <= x1 - 0.3 && d >= d0 + 0.3 && d <= d1 - 0.3, `${view.id} eye is inside ${level.id}'s bounds`);
    const main = level.rooms.find(room => room.kind === 'primary');
    const underMezzanine = level.index === 0 && main.clearUnderMezzanine && x >= main.x0 && x <= main.x1 && d >= 14;
    const headroom = underMezzanine ? main.clearUnderMezzanine : level.clearHeight;
    assert.ok(h >= 0.5 && h <= headroom - 0.3, `${view.id} eye height ${h} is under the ${headroom} m ceiling`);
    for (const o of level.obstacles) assert.ok(x < o.x0 - 0.2 || x > o.x1 + 0.2 || d < o.d0 - 0.2 || d > o.d1 + 0.2, `${view.id} eye is clear of ${o.id}`);
    for (const chair of level.chairs) assert.ok(Math.hypot(x - chair.position[0], d - chair.position[1]) > 0.6, `${view.id} eye is clear of ${chair.id}`);
    assert.ok(Math.hypot(...view.target.map((n, i) => n - view.eye[i])) > 3, `${view.id} looks somewhere`);
    // Views draw the visitor's own body, so an eye at standing height keeps away from where people
    // arrive or stand: the spawn, stair and lift landings, anchors and seat stand points.
    if (h < 3) {
      const places = [
        ...(level.id === penthouse.spawn.levelId ? [['spawn', penthouse.spawn.position]] : []),
        ...level.portals.filter(item => item.kind !== 'entrance').map(item => [item.id, item.position]),
        ...penthouse.anchors.filter(item => item.levelId === level.id).map(item => [item.id, item.position]),
        ...officeSeats(penthouse).filter(item => item.levelId === level.id).map(item => [`${item.id} stand`, item.stand]),
      ];
      for (const [name, [px, pd]] of places) assert.ok(Math.hypot(x - px, d - pd) >= 1.5, `${view.id} eye is clear of ${name}`);
    }
    assert.equal(typeof view.label, 'string');
  }
  assert.ok(AVATAR_ENVELOPE.height < penthouse.levels[0].clearHeight);
});

test('roof gardens outlook looks over the terrace parapet without moving the visitor', () => {
  const view = officeView(penthouse, 'roof-gardens');
  assert.ok(view, 'a supported roof outlook is available');
  const terrace = penthouse.levels[0].rooms.find(room => room.kind === 'terrace');
  const [x, h, d] = view.eye, [tx, th, td] = view.target;
  assert.ok(x > terrace.x0 && x < terrace.x1 && d > terrace.d0 && d < terrace.d1);
  // Cross the front parapet before the ray could enter the indoor room.
  const t = (terrace.d0 - d) / (td - d);
  assert.ok(t > 0 && t < 1);
  assert.ok(x + (tx - x) * t < terrace.x1 - .3);
  assert.ok(h + (th - h) * t > 1.2, 'eye ray clears the 1.2m parapet');
  assert.ok(th < h && td < terrace.d0, 'look down toward the neighbouring roofs');
});
