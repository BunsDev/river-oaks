import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpace, spaceAssessmentContext } from '../src/studio/space-templates.js';
import { assessSpace } from '../src/studio/space-assessment.js';
import { validateSpace } from '../src/studio/space-document.js';

// Synthetic occupied-use fixtures (#417): circulation evidence only, not seating or
// multiplayer behaviour. Every chair is pushed back from its desk or table and grows to
// a seated person's footprint; people stand at the reception counter and the sink.
function occupied(space, pushBack) {
  for (const item of space.objects.filter(object => object.kind === 'chair')) {
    const yaw = item.yaw * Math.PI / 180; // a chair's back points (-sin yaw, cos yaw) in (east, north)
    item.east += -Math.sin(yaw) * pushBack;item.north += Math.cos(yaw) * pushBack;
    item.width = Math.max(item.width, .6);item.depth = Math.max(item.depth, .75);
  }
  const standing = (id, east, north) => space.objects.push({ id, kind: 'cabinet', label: 'Standing person', east, north, width: .5, depth: .4, height: 1.75, yaw: 0, elevation: 0, finish: 'fabric' });
  standing('visitor-at-reception', -4, -5.25);standing('person-at-sink', -5.2, 4.75);
  return validateSpace(space);
}

test('Garden Office required routes stay passable with every seat occupied and people at the counters', () => {
  for (const pushBack of [.25, .4]) {
    const result = assessSpace(occupied(createSpace('office'), pushBack), spaceAssessmentContext('office'));
    assert.equal(result.status, 'passed', `push-back ${pushBack} m: ${JSON.stringify(result.findings)}`);
    assert.equal(result.routes.length, 5, 'exit and all four destinations have routes');
  }
});
