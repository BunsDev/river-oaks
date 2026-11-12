import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FIVE_ROOMS_VERSION } from '../../shared/city-kit/five-rooms-layout.js';
import { RIBBON_FINISH } from '../src/ribbon-finish.js';

// The boundary the next map increment builds against (#740). It is a published promise, so it must
// keep agreeing with the contract and name only files that exist.
const read = path => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const boundary = read('config/ribbon/district-spine-boundary.json'), contract = read('config/ribbon/five-rooms.json');
const segment = id => contract.ribbon.segments.find(item => item.id === id);

test('the published spine matches the contract', () => {
  assert.equal(boundary.basis, FIVE_ROOMS_VERSION);
  const spine = segment('spine');
  assert.deepEqual([boundary.spine.start, boundary.spine.bend, boundary.spine.end], spine.points);
  assert.deepEqual([boundary.spine.width, boundary.spine.clearHeight, boundary.spine.status], [spine.width, spine.clearHeight, spine.status]);
  assert.equal(spine.status, 'clear');
  assert.equal(boundary.spine.canopyTop, spine.clearHeight + RIBBON_FINISH.slab);
  assert.equal(boundary.spine.canopyEdgeBeyondWalk, RIBBON_FINISH.overhang + RIBBON_FINISH.bullnose);
});

test('the crossing and every connection anchor are the contract\'s', () => {
  const join = contract.ribbon.joins.find(item => item.kind === 'crossing');
  assert.equal(boundary.crossing.road, join.road);
  assert.deepEqual(boundary.crossing.between, [join.from, join.to]);
  assert.deepEqual(boundary.crossing.spineLanding, segment('spine').points[0]);
  assert.deepEqual(boundary.crossing.southLanding, segment('south').points.at(-1));
  const spineLinks = contract.links.filter(link => link.segment === 'spine');
  assert.deepEqual(boundary.connections.map(item => item.id).sort(), spineLinks.map(link => link.id).sort());
  for (const connection of boundary.connections) {
    const link = spineLinks.find(item => item.id === connection.id);
    const entrance = contract.venues.find(venue => venue.id === link.venue).entrances[0];
    assert.deepEqual([connection.entrance, connection.side, connection.at], [link.entrance, link.side, entrance.centre]);
  }
});

test('south and link-studios are reported apart, as the contract still has them', () => {
  assert.deepEqual(boundary.notBuilt.map(item => item.segment), contract.ribbon.segments.filter(item => item.id !== 'spine').map(item => item.id));
  for (const item of boundary.notBuilt) {
    assert.equal(item.status, segment(item.segment).status);
    assert.deepEqual(item.carries, contract.links.filter(link => link.segment === item.segment).map(link => link.id));
  }
});

test('every named input exists', () => {
  for (const path of Object.values(boundary.inputs).flat()) assert.ok(existsSync(new URL(`../../${path}`, import.meta.url)), path);
});
