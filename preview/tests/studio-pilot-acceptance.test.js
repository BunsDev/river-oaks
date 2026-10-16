import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpace, spaceAssessmentContext } from '../src/studio/space-templates.js';
import { assessSpace } from '../src/studio/space-assessment.js';
import { validateSpace } from '../src/studio/space-document.js';

// Synthetic occupied-use fixtures (#417, per template since #418): circulation evidence
// only, not seating or multiplayer behaviour. Every chair is pushed back from its desk or
// table and grows to a seated person's footprint; people stand where the template's work
// happens (counters, sinks), in front of the fixture.
const PEOPLE = {
  office: [['visitor-at-reception', -4, -5.25], ['person-at-sink', -5.2, 4.75]],
  house: [['person-at-kitchen-sink', -4, 4.95], ['person-at-vanity', 6, -1.05]],
};
function occupied(space, pushBack, people) {
  for (const item of space.objects.filter(object => object.kind === 'chair')) {
    const yaw = item.yaw * Math.PI / 180; // a chair's back points (-sin yaw, cos yaw) in (east, north)
    item.east += -Math.sin(yaw) * pushBack;item.north += Math.cos(yaw) * pushBack;
    item.width = Math.max(item.width, .6);item.depth = Math.max(item.depth, .75);
  }
  const standing = (id, east, north) => space.objects.push({ id, kind: 'cabinet', label: 'Standing person', east, north, width: .5, depth: .4, height: 1.75, yaw: 0, elevation: 0, finish: 'fabric' });
  for (const [id, east, north] of people) standing(id, east, north);
  return validateSpace(space);
}

for (const [templateId, name, destinations] of [['office', 'Garden Office', 4], ['house', 'Courtyard House', 5]])
  test(`${name} required routes stay passable with every seat occupied and people at its counters`, () => {
    for (const pushBack of [.25, .4]) {
      const result = assessSpace(occupied(createSpace(templateId), pushBack, PEOPLE[templateId]), spaceAssessmentContext(templateId));
      assert.equal(result.status, 'passed', `push-back ${pushBack} m: ${JSON.stringify(result.findings)}`);
      assert.equal(result.routes.length, destinations + 1, `exit and all ${destinations} destinations have routes`);
    }
  });
