import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyPeople } from '../src/nearby-people.js';

const person = (id, x, y, z = 0) => ({ id, name: id, position: [x, y, z] });
test('nearby encounters follow walking distance and stay on the same level', () => {
  const people = [person('far', 80, 0), person('next', 8, 0), person('nearest', 3, 4), person('upstairs', 0, 0, 10)];
  assert.deepEqual(nearbyPeople(people, [0, 0, 1.68]).map(item => [item.local.id, item.distance]), [['nearest', 5], ['next', 8]]);
  assert.equal(people[0].id, 'far');
  assert.deepEqual(nearbyPeople(people, [80, 0, 1.68]).map(item => item.local.id), ['far']);
});
test('missing positions and an empty street do not offer unreachable encounters', () => {
  assert.deepEqual(nearbyPeople([person('invalid', NaN, 0), person('far', 80, 0)], [0, 0, 0]), []);
  assert.deepEqual(nearbyPeople([person('local', 0, 0)], null), []);
});
