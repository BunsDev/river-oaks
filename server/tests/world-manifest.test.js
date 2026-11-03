import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { attachDistrictGalleryPlan } from '../../preview/src/district-interior-contract.js';
import { attachGardenCampus, DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { validateWorldManifest, localToWorld } from '../../preview/src/world-manifest.js';

const read = name => JSON.parse(readFileSync(new URL(`../../preview/public/data/${name}.json`, import.meta.url)));
const legacyData = () => ({ ...read('district'), vegetation: read('district-vegetation'),
  buildingInteriors: [read('building-interiors/river-oaks-gallery-v2')] });

test('the shared browser/server gallery seam rejects a District frame outside its registration', () => {
  const data = read('district'); data.bounds_m[0] -= 1;
  assert.throws(() => attachDistrictGalleryPlan(data, read('building-interiors/river-oaks-gallery-v2')), /District bounds mismatch/);
});

for (const revision of [undefined, DISTRICT_REVISION_GARDENS]) {
  test(`manifest validation preserves every composed entity and legacy checkpoint: ${revision ?? 'default'}`, async () => {
    const legacy = revision ? attachGardenCampus(legacyData()) : legacyData();
    const loaded = await loadDistrictData({ districtRevision: revision });
    assert.deepEqual(loaded, legacy, 'all geometry, IDs, vegetation, overlay revisions and spawn remain unchanged');
    const options = { now: () => 100000 };
    const before = createSharedWorld(legacy, options);
    assert.equal(before.join({ userId: 'manifest-visitor', name: 'Manifest Visitor' }).ok, true);
    const saved = before.checkpoint();
    const after = createSharedWorld(loaded, options);
    assert.equal(after.restore(JSON.parse(JSON.stringify(saved))).ok, true, 'no checkpoint migration is necessary for unchanged world content');
    assert.deepEqual(after.snapshot().players, before.snapshot().players);
  });
}

test('a registered location cannot grant movement or expand authoritative bounds in a revision that does not compose it', async () => {
  const manifest = validateWorldManifest(read('world-manifest'));
  // No reserved land remains (the Bayou Terraces authored the last strips), so this uses an
  // authored location the default revision does not compose: registration alone grants nothing.
  const reservation = manifest.locations.find(location => location.status === 'reserved') ?? manifest.locations.find(location => location.id === 'bayou-terrace-north');
  const data = await loadDistrictData();
  const world = createSharedWorld(data, { now: () => 100000 });
  const joined = world.join({ userId: 'manifest-visitor', name: 'Manifest Visitor' });
  const position = localToWorld(reservation, [(reservation.bounds_m[0] + reservation.bounds_m[2]) / 2,
    (reservation.bounds_m[1] + reservation.bounds_m[3]) / 2, joined.player.position[2]]);
  const environment = createWalkingEnvironment(data);
  assert.equal(environment.isFree(position[0], -position[1]), false, 'reservation stays outside authoritative walking surfaces');
  assert.equal(environment.canFly(position[0], environment.groundAt(position[0], -position[1]) + 1, -position[1]), false, 'reservation stays outside authoritative flight bounds');
  const before = structuredClone(world.snapshot().players);
  assert.equal(world.command('manifest-visitor', { type: 'pose', position, yaw: 0, altitude: 0 }).ok, false);
  assert.deepEqual(world.snapshot().players, before, 'rejected movement does not relocate the player');
  assert.deepEqual(data.bounds_m, read('district').bounds_m);
});
