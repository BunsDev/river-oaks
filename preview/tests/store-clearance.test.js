import test from 'node:test';
import assert from 'node:assert/strict';
import { clearStandingStations } from '../src/store-clearance.js';

const room = people => ({ aMin: -2, aMax: 2, depth: 4, fixtures: [{ kind: 'table', a: 0, d: 2, w: 1, l: 1 }], people });

test('a blocked standing station picks the closest clear position and preserves equal-distance candidate order', () => {
  const person = { role: 'guest', a: 0, d: 2 };
  const layout = room([person]);
  layout.fixtures[0].w = 0.37; layout.fixtures[0].l = 0.37;
  clearStandingStations(layout);
  // The four expanded table edges are equally near. The left edge is authored first.
  assert.deepEqual(person, { role: 'guest', a: -0.5, d: 2 });
});

test('clear stations and seated people keep their authored positions', () => {
  const people = [{ role: 'guest', a: -1.2, d: 2 }, { role: 'guest', pose: 'seated', a: 0, d: 2 }, { role: 'mannequin', a: 0, d: 2 }];
  const before = structuredClone(people);
  clearStandingStations(room(people));
  assert.deepEqual(people, before);
});

test('a relocated attendant faces its nearest counter', () => {
  const person = { role: 'staff', pose: 'attend', a: 0, d: 2 };
  const layout = room([person]); layout.fixtures[0].kind = 'counter';
  clearStandingStations(layout);
  assert.ok(Math.hypot(person.a, person.d - 2) > 0.6);
  assert.ok(Math.abs(Math.hypot(...person.facing) - 1) < 1e-12);
  const towards = [-person.a, 2 - person.d], distance = Math.hypot(...towards);
  for (const [index, value] of towards.entries()) assert.ok(Math.abs(person.facing[index] - value / distance) < 1e-12);
});
