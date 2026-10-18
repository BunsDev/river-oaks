import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRegionPackage } from '../region-package.js';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { buildRoads } from '../../preview/src/street-roads.js';
import { buildDesignatedSidewalks } from '../../preview/src/sidewalks.js';
import { buildPlazaSurface } from '../../preview/src/plaza-surface.js';
import { registerGroundSurfaces, groundSurfaceHeight } from '../../preview/src/world-surface.js';

// #491: in a creator region, what the browser stands on (main.js registers the plaza,
// roads and sidewalks it draws) must stay within the server's 0.2 m pose tolerance of
// the server's own ground, or visitors can't walk across a street.
const POSE_TOLERANCE = 0.2, MARGIN = 0.05;
const sample = JSON.parse(readFileSync(new URL('../../preview/public/data/sample-region.json', import.meta.url)));
// Synthetic fixture: flat ground with one residential street between the spawn and a venue.
const flat = {
  schema_version: 1, bounds_m: [-60, -60, 60, 60],
  terrain: { width: 5, height: 5, heights_m: Array(25).fill(0) }, spawn: [0, -40],
  roads: [{ id: 'harbour-street', name: 'Harbour Street', kind: 'residential', width_m: 8.4, points: [[-50, -24], [50, -24]] },
    { id: 'garden-walk', name: 'Garden Walk', kind: 'footway', width_m: 3, points: [[-30, -20], [-30, 40]] }],
  buildings: [{ id: 'corner-shop', center: [0, -5], size: [18, 14, 6], yaw_deg: 0, kind: 'retail', interior: { name: 'Corner Shop', category: 'restaurant', entrance: 'south' } }],
  trees: [], places: [['steps', [0, -50]], ['east', [40, -40]], ['west', [-40, -40]], ['garden', [-30, 44]]].map(([id, position]) => ({ id, name: id, position })),
};

function grounds(world) {
  const server = createWalkingEnvironment(world);
  const client = structuredClone(world), street = createWalkingEnvironment(client);
  const streetSpace = (x, z) => street.isFree(x, z) && !street.roomAt(x, z);
  registerGroundSurfaces(client, [buildPlazaSurface(client), buildRoads(client), ...buildDesignatedSidewalks(client, streetSpace).children]);
  return { server, at: (x, north) => ({ server: server.groundAt(x, -north), client: groundSurfaceHeight(client, x, -north), free: server.isFree(x, -north) }) };
}

for (const [name, region] of [['flat fixture', flat], ['sample region', sample]]) {
  test(`${name}: the drawn street stays within the server's pose tolerance across every road`, () => {
    const world = compileRegionPackage(region, 'Street Ground', { worldId: 'street-ground' }), { at } = grounds(world);
    let worst = { gap: 0 };
    for (const road of world.roads) for (let index = 1; index < road.points.length; index++) {
      const [a, b] = [road.points[index - 1], road.points[index]], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const across = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      for (let along = 2; along < length - 2; along += 4) for (let offset = -14; offset <= 14; offset += 0.25) {
        const x = a[0] + (b[0] - a[0]) * along / length + across[0] * offset, north = a[1] + (b[1] - a[1]) * along / length + across[1] * offset;
        const ground = at(x, north);
        if (!ground.free) continue;
        const gap = Math.abs(ground.client - ground.server);
        if (gap > worst.gap) worst = { gap, x, north, road: road.id, ...ground };
      }
    }
    assert.ok(worst.gap <= POSE_TOLERANCE - MARGIN, `drawn ground ${worst.client?.toFixed(3)} m vs server ${worst.server?.toFixed(3)} m at ${worst.x?.toFixed(1)}, ${worst.north?.toFixed(1)} on ${worst.road}`);
  });
}

test('a visitor walks across a creator street at the heights the browser draws', () => {
  const world = compileRegionPackage(flat, 'Street Ground', { worldId: 'street-ground' }), { at } = grounds(world);
  let time = 1000;
  const shared = createSharedWorld(world, { worldId: 'street-ground', now: () => time });
  assert.equal(shared.join({ userId: 'visitor', name: 'Visitor' }).ok, true);
  // From the spawn south of Harbour Street, over its sidewalks and crown, to the north side.
  for (let north = -40 + 0.25; north <= -14; north += 0.25) {
    time += 150;
    const result = shared.command('visitor', { type: 'pose', position: [0, north, at(0, north).client], yaw: 0, altitude: 0 });
    assert.equal(result.ok, true, `refused at north ${north.toFixed(2)}: ${result.error}`);
  }
});

test('creator venue floors sit on the walking datum, as in the district', () => {
  const world = compileRegionPackage(flat, 'Street Ground', { worldId: 'street-ground' }), { server, at } = grounds(world);
  const room = server.rooms.find(item => item.storeId === 'venue-corner-shop');
  const doorstep = room.toWorld(0, -1);
  // A shop floor stands no lower than the paving in front of it, and within a step of it.
  assert.ok(room.floor >= at(...doorstep).client - 1e-9 && room.floor - at(...doorstep).client <= 0.05,
    `floor ${room.floor} m vs paving ${at(...doorstep).client} m`);
});

test('a world published before the street datum carries its creations into its next revision', async () => {
  const { migrateWorldCheckpoint } = await import('../world.js');
  // A creator world compiled before #491 walked on bare terrain.
  const before = { ...compileRegionPackage(flat, 'Street Ground', { worldId: 'street-ground' }), walkSurfaceOffset: 0 };
  const after = compileRegionPackage(flat, 'Street Ground', { worldId: 'street-ground' });
  let time = 1000;
  const options = { worldId: 'street-ground', now: () => time, isAdmin: id => id === 'owner' };
  const live = createSharedWorld(before, options);
  assert.equal(live.join({ userId: 'owner', name: 'Owner' }).ok, true);
  time += 2000;
  const spawn = live.snapshot().players[0].position;
  const placed = live.command('owner', { type: 'build', action: 'place', kind: 'seat', finish: 'rose', position: [spawn[0] + 2, spawn[1] + 1], yaw: 0 });
  assert.equal(placed.ok, true, placed.error);
  assert.ok(Math.abs(placed.item.ground - 0) < 0.05, 'placed on the old, bare-terrain ground');
  const migrated = migrateWorldCheckpoint({ fromData: before, toData: after, checkpoint: live.checkpoint(), ...options });
  assert.equal(migrated.ok, true, migrated.error);
  const next = createSharedWorld(after, options);
  assert.equal(next.restore(migrated.checkpoint).ok, true);
  const carried = next.snapshot().builds.find(item => item.id === placed.item.id);
  assert.ok(Math.abs(carried.ground - 0.2) < 0.02, `the creation moves with the datum, to ${carried.ground}`);
  // A world already on the datum is unchanged by a revision.
  const again = migrateWorldCheckpoint({ fromData: after, toData: after, checkpoint: next.checkpoint(), ...options });
  assert.equal(again.ok, true);
  assert.equal(again.checkpoint.payload.builds[0].ground, carried.ground);
});

test('creations in a built-in home move with the datum; those on a generated level stay on its floor', async () => {
  const { migrateWorldCheckpoint } = await import('../world.js');
  const region = { ...flat, buildings: [...flat.buildings,
    { id: 'lane-house', center: [28, 12], size: [14, 12, 6], yaw_deg: 0, kind: 'residential', interior: { name: 'Lane House', category: 'home', entrance: 'south' } },
    { id: 'tower-house', center: [28, -48], size: [14, 12, 9], yaw_deg: 0, kind: 'residential', interior: { name: 'Tower House', category: 'home', entrance: 'north', generation: { version: 1, levels: 1 } } }] };
  const before = { ...compileRegionPackage(region, 'Street Ground', { worldId: 'street-ground' }), walkSurfaceOffset: 0 };
  const after = compileRegionPackage(region, 'Street Ground', { worldId: 'street-ground' });
  let time = 1000;
  const options = { worldId: 'street-ground', now: () => time, isAdmin: id => id === 'owner' };
  const live = createSharedWorld(before, options);
  assert.equal(live.join({ userId: 'owner', name: 'Owner' }).ok, true);
  const placeInside = storeId => {
    time += 2000;
    const entered = live.command('owner', { type: 'travel', storeId, mode: 'enter' });
    assert.equal(entered.ok, true, `${storeId}: ${entered.error}`);
    time += 2000;
    const [x, north] = entered.player.position;
    // Rooms extend away from their entrance, whichever face it is on: try both sides.
    for (const [dx, dn] of [[0, 1.2], [0, -1.2], [1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]]) {
      const placed = live.command('owner', { type: 'build', action: 'place', kind: 'side-table', finish: 'rose', position: [x + dx, north + dn], yaw: 0 });
      if (placed.ok) return placed.item;
    }
    assert.fail(`no clear spot in ${storeId}`);
  };
  const builtIn = placeInside('venue-lane-house'), generated = placeInside('venue-tower-house');
  const migrated = migrateWorldCheckpoint({ fromData: before, toData: after, checkpoint: live.checkpoint(), ...options });
  assert.equal(migrated.ok, true, migrated.error);
  const carried = new Map(migrated.checkpoint.payload.builds.map(item => [item.id, item.ground]));
  assert.ok(Math.abs(carried.get(builtIn.id) - builtIn.ground - 0.2) < 1e-9, 'the built-in home floor rises with the datum');
  assert.equal(carried.get(generated.id), generated.ground, 'a generated level keeps its own floor');
});
