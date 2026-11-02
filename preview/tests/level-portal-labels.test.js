import test from 'node:test';
import assert from 'node:assert/strict';
import { levelArrivalNotice, levelFloorName, portalActionLabel } from '../src/level-portal-labels.js';
import { campusLevels, GARDEN_CAMPUS_LAYOUT } from '../../shared/garden-campus-layout.js';

test('every Gardens lift names the floor it goes to; stairs keep their wording', () => {
  for (const level of campusLevels(GARDEN_CAMPUS_LAYOUT)) for (const portal of level.portals) {
    const from = Number(level.id.slice(-1)), to = Number(portal.toLevel.slice(-1)), up = to > from;
    const label = portalActionLabel({ kind: portal.kind, toLevelId: portal.toLevel }, up);
    if (portal.kind === 'lift') {
      assert.equal(label, to === 0 ? 'Take the lift to the ground floor' : `Take the lift ${up ? 'up' : 'down'} to Floor ${to + 1}`, portal.id);
      // The readiness journey and fixtures look for this prefix.
      if (up) assert.match(label, /^Take the lift up/);
    } else assert.equal(label, up ? 'Go up one level' : to === 0 ? 'Go down to ground floor' : 'Go down one level', portal.id);
  }
});
test('a landed stair or lift announces the floor', () => {
  assert.equal(levelArrivalNotice('garden-campus/l0'), 'Now on the ground floor.');
  assert.equal(levelArrivalNotice('garden-campus/l3'), 'Now on Floor 4.');
  assert.equal(levelFloorName('osm-way-625333006/l1'), 'Floor 2');
  assert.equal(levelFloorName(undefined), 'the next floor');
});
test('every Gardens floor is reachable from the street by lift alone, and every lift has a lift back', () => {
  const levels = campusLevels(GARDEN_CAMPUS_LAYOUT);
  for (const tower of new Set(levels.flatMap(level => level.portals.map(portal => portal.tower)))) {
    const seen = new Set(['garden-campus/l0']), queue = ['garden-campus/l0'];
    while (queue.length) {
      const id = queue.shift(), level = levels.find(item => item.id === id);
      for (const portal of level.portals.filter(item => item.kind === 'lift' && item.tower === tower)) {
        const back = levels.find(item => item.id === portal.toLevel)?.portals.find(item => item.id === portal.toPortal);
        assert.equal(back?.kind, 'lift', `${portal.id} returns by lift`);
        if (!seen.has(portal.toLevel)) { seen.add(portal.toLevel);queue.push(portal.toLevel); }
      }
    }
    const served = levels.filter(level => level.portals.some(portal => portal.tower === tower)).map(level => level.id);
    assert.deepEqual(served.filter(id => !seen.has(id)), [], `${tower}: every floor its core serves is step-free`);
  }
});
