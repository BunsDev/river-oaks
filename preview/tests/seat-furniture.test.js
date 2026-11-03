import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSeatFurniture } from '../src/five-rooms/seat-furniture.js';
import { seatClusters } from '../src/seat-clusters.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const groundAt = () => 18.5;

for (const finish of ['classic', 'pink-jet-age']) test(`${finish} draws a bench under every seat, in two draw calls, and lights only the seats at night`, () => {
  const group = buildSeatFurniture(world, { finish, groundAt });
  assert.equal(group.children.length, 2, 'two draw calls for all clusters');
  const [benches, strips] = group.children;
  benches.geometry.computeBoundingBox();
  const position = benches.geometry.attributes.position;
  for (const seat of seatClusters(world).flatMap(cluster => cluster.seats)) {
    let under = false;
    for (let i = 0; i < position.count && !under; i++) under = Math.hypot(position.getX(i) - seat.x, -position.getZ(i) - seat.north) < 0.95 && Math.abs(position.getY(i) - (18.5 + seat.height)) < 0.01;
    assert.ok(under, `${seat.id} has a drawn seat surface at its height`);
  }
  assert.equal(strips.material.emissiveIntensity, 0, 'unlit by day');
  group.userData.relight({ twilight: 1 });
  assert.ok(strips.material.emissiveIntensity > 0, 'lit at night');
  assert.equal(benches.material.emissive.getHex(), 0, 'the bench body has no light of its own');
  group.userData.dispose();
});

test('a world without the District lane builds nothing', () => {
  assert.equal(buildSeatFurniture({ roads: [] }, { groundAt }), null);
});
