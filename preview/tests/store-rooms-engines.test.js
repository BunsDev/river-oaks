import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planStoreRooms } from '../src/store-rooms.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { stableHypot } from '../src/stable-math.js';

const district = () => JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const plan = world => JSON.stringify(planStoreRooms(world).map(({ toWorld, toLocal, contains, ...room }) => room));
// JavaScriptCore's Math.hypot rounds these lengths correctly; V8's can be one unit in the last place away.
const correctlyRounded = (x, y) => Math.sqrt(x * x + y * y);
const withHypot = (hypot, run) => { const original = Math.hypot; Math.hypot = hypot; try { return run(); } finally { Math.hypot = original; } };

test('stableHypot returns the authoritative (V8) length bit for bit', () => {
  const world = district();
  const pairs = [[0, 0], [-0, 0], [3, 4], [1e308, 1e308], [5e-324, 5e-324], [Infinity, NaN], [NaN, 1], [-2, 1e-12]];
  for (const building of world.buildings) for (let i = 1; i < (building.ring?.length ?? 0); i++) pairs.push([building.ring[i][0] - building.ring[i - 1][0], building.ring[i][1] - building.ring[i - 1][1]]);
  for (let i = 0; i < 20000; i++) pairs.push([(i % 97 - 48) * 10 ** (i % 9 - 4) / 7, (i % 89 - 44) * 10 ** (i % 7 - 3) / 3]);
  for (const [x, y] of pairs) assert.ok(Object.is(stableHypot(x, y), Math.hypot(x, y)), `${x}, ${y}`);
});

test('every engine plans the same shop rooms as the town', () => {
  // Amorino is the Counter. Under a correctly rounded hypot, six shops used to move one bay,
  // so a Safari visitor met walls the server does not have.
  const town = plan(district()), safari = withHypot(correctlyRounded, () => plan(district()));
  assert.equal(safari, town);
  const rooms = withHypot(correctlyRounded, () => planStoreRooms(district()));
  const amorino = rooms.find(room => room.storeId === 'osm-node-8172495006');
  assert.deepEqual([amorino.aMin, amorino.aMax].map(v => +v.toFixed(4)), [-5.5676, 7.4635]);
});

test('a Safari walker can round the Counter\'s serving counter, as the town allows', () => {
  const free = world => { const environment = createWalkingEnvironment(world); return [[-2753.1, -1219.4], [-2753.1, -1219.65], [-2752.6, -1219.9]].map(([x, north]) => environment.isFree(x, -north)); };
  assert.deepEqual(withHypot(correctlyRounded, () => free(district())), free(district()));
  assert.deepEqual(free(district()), [true, true, true]);
});
