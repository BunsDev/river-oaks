import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { createCommonsStream } from '../src/commons-stream.js';
import { createPlazaBicycle } from '../src/plaza-bicycle.js';
import { plazaSalonRack } from '../src/plaza-salon-plan.js';

// Riding bypasses stepWalking, so the bike must consult the same local readiness
// guard: under a failed or slow destination load a rider waits at the District edge.
const world = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' });
const edge = world.eastGardenCommons.edge;
const flush = () => new Promise(resolve => setTimeout(resolve, 20));

test('a bicycle cannot ride into an unloaded Commons and crosses once it is ready', async () => {
  let release;
  const stream = createCommonsStream({ world, parent: new THREE.Group(), loadModule: () => new Promise(resolve => { release = resolve; }) });
  const environment = createWalkingEnvironment(world), approach = plazaSalonRack(world)[0].approach;
  const guards = [(from, to) => stream.allowsStep(from, to)];
  const walking = {
    environment, riding: false, mounted: null,
    getPose() { return { position: [approach[0], 0, -approach[1]], riding: null, sitting: null, flying: false, roomId: null }; },
    mount(controller) { this.mounted = controller; this.riding = true; return true; },
    dismount() { this.mounted = null; this.riding = false; },
    allowsStep: (from, to) => guards.every(guard => guard(from, to)),
    setYaw() {}, notify() {}, applyServerPose() {},
  };
  const multiplayer = { connected: true, snapshot: { cycling: { taken: [] } },
    async command(message) { return { ok: true, player: message.type === 'cycle' ? { position: [approach[0], approach[1], 0], vehicle: 'bicycle' } : undefined }; } };
  const bicycle = createPlazaBicycle({ scene: new THREE.Group(), host: { addEventListener() {}, removeEventListener() {} }, walking, getMultiplayer: () => multiplayer });
  bicycle.load(world);
  assert.equal(await bicycle.take(), true);
  // Put the mounted bike on the promenade, facing east, eight metres short of the seam.
  Object.assign(bicycle.placement, { position: [edge - 8, environment.groundAt(edge - 8, 1335), 1335], yaw: Math.PI, speed: 0 });
  stream.update([[edge - 8, -1335]]); await flush();
  assert.equal(stream.ready(), false);
  for (let i = 0; i < 300; i++) walking.mounted.step({ forward: 1 }, 1 / 30);
  assert.ok(bicycle.placement.position[0] <= edge - .35, `rider waits at the District edge (${(bicycle.placement.position[0] - edge).toFixed(2)} m)`);
  release(await import('../src/east-garden-commons.js')); await flush(); stream.update([[edge - 1, -1335]]); await flush();
  assert.equal(stream.ready(), true);
  for (let i = 0; i < 300; i++) walking.mounted.step({ forward: 1 }, 1 / 30);
  assert.ok(bicycle.placement.position[0] > edge + 5, 'loaded crossing proceeds on the bike');
  stream.dispose();
});
