import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { createWalkingEnvironment, createWalkingState, guardedStepEnvironment, stepWalking } from '../src/walking.js';
import { createCommonsStream } from '../src/commons-stream.js';
const world = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' });
const edge = world.eastGardenCommons.edge;
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 20)); };

test('real destination resources load and dispose through twenty crossings without changing world data', async () => {
  const parent = new THREE.Group(), before = structuredClone(world);
  const stream = createCommonsStream({ world, parent });
  const counts = [];
  for (let i = 0; i < 20; i++) {
    stream.update([[edge - 10, -1335]]);
    for (let j = 0; j < 50 && !stream.ready(); j++) await flush();
    assert.equal(stream.ready(), true); assert.equal(parent.children.length, 1);
    const geometries = new Set(), materials = new Set(); let disposed = 0;
    parent.traverse(item => { if (item.geometry && !item.isSprite) geometries.add(item.geometry); if (item.material) materials.add(item.material); });
    for (const item of [...geometries, ...materials]) item.addEventListener('dispose', () => disposed++);
    counts.push([geometries.size, materials.size, stream.debug().residentBytes]);
    stream.update([[edge - 200, -1335]]);
    assert.equal(parent.children.length, 0); assert.equal(disposed, geometries.size + materials.size);
  }
  assert.ok(counts.every(count => JSON.stringify(count) === JSON.stringify(counts[0])));
  stream.dispose(); assert.deepEqual(world, before);
});

test('missing presentation vetoes crossing without changing authoritative collision; loaded crossing preserves motion', async () => {
  let release;
  const parent = new THREE.Group();
  const stream = createCommonsStream({ world, parent, loadModule: () => new Promise(resolve => { release = resolve; }) });
  const authority = createWalkingEnvironment(world);
  const walker = createWalkingState(authority, [edge - 2, -1335, 0], -Math.PI / 2);
  const local = createWalkingEnvironment(world, [{ contains: (x, _y, z) => !stream.allowsStep([walker.position[0], -walker.position[2]], [x, -z]) }]);
  stream.update([[edge - 2, -1335]]); await flush();
  for (let i = 0; i < 100; i++) stepWalking(walker, local, { forward: 1 }, .04);
  assert.ok(walker.position[0] <= edge - .35); assert.equal(authority.isFree(edge + 5, 1335), true);
  assert.equal(stream.allowsStep([edge + 5, -1335], [edge + 4, -1335]), true, 'reconnected player can retreat');
  assert.equal(stream.allowsStep([edge + 5, -1335], [edge + 6, -1335]), false);
  release(await import('../src/east-garden-commons.js')); await flush();
  const yaw = walker.yaw, distance = walker.distance;
  for (let i = 0; i < 100; i++) stepWalking(walker, local, { forward: 1 }, .04);
  assert.ok(walker.position[0] > edge + 5); assert.equal(walker.yaw, yaw); assert.ok(walker.distance > distance); assert.ok(walker.speed > 0);
  stream.dispose();
});

test('failed imports announce recovery and retry, while world teardown fences late geometry', async () => {
  let time = 0, attempts = 0; const notices = [], parent = new THREE.Group();
  const stream = createCommonsStream({ world, parent, now: () => time, onStatus: text => notices.push(text),
    loadModule: async () => { if (++attempts === 1) throw new Error('offline'); return import('../src/east-garden-commons.js'); } });
  stream.update([[edge - 1, -1335]]); await flush(); stream.update([[edge - 1, -1335]]);
  assert.match(notices.at(-1), /retry/i); assert.equal(parent.children.length, 0);
  time = 1001; stream.update([[edge - 1, -1335]]); await flush(); stream.update([[edge - 1, -1335]]);
  assert.equal(stream.ready(), true); assert.match(notices.at(-1), /Commons/); stream.dispose();
  let release; const late = createCommonsStream({ world, parent, loadModule: () => new Promise(resolve => { release = resolve; }) });
  late.update([[edge + 5, -1335]]); await flush(); late.dispose(); release(await import('../src/east-garden-commons.js')); await flush();
  assert.equal(parent.children.length, 0);
});

test('a restored player deep in Commons receives recovery status and a distant camera view retains presentation', async () => {
  const parent = new THREE.Group(), notices = [];
  const failed = createCommonsStream({ world, parent, loadModule: async () => { throw new Error('offline'); }, onStatus: text => notices.push(text) });
  failed.update([[edge + 80, -1335]]); await flush(); failed.update([[edge + 80, -1335]]);
  assert.match(notices.at(-1), /retry/i, 'restored player must not be silently blocked'); failed.dispose();
  const stream = createCommonsStream({ world, parent });
  const camera = new THREE.PerspectiveCamera(55, 1.5, .1, 6000);
  camera.position.set(edge - 200, 30, 1335); camera.lookAt(edge + 80, 20, 1335); camera.updateMatrixWorld();
  stream.update([[edge - 200, -1335]], camera); await flush();
  assert.equal(stream.ready(), true, 'looking back keeps the destination visible beyond distance hysteresis');
  camera.lookAt(edge - 500, 20, 1335); camera.updateMatrixWorld();
  stream.update([[edge - 200, -1335]], camera); assert.equal(stream.ready(), false); stream.dispose();
});

test('noncooperative import timeout explains a stall instead of promising a retry that cannot start', async () => {
  let time = 0; const notices = [];
  const stream = createCommonsStream({ world, parent: new THREE.Group(), now: () => time,
    loadModule: () => new Promise(() => {}), onStatus: text => notices.push(text) });
  stream.update([[edge - 1, -1335]]); await flush(); time = 15001; stream.update([[edge - 1, -1335]]);
  assert.match(notices.at(-1), /stalled/i); assert.doesNotMatch(notices.at(-1), /retry/i); stream.dispose();
});

test('readiness vetoes only the local mover; shared occupancy of a peer on the unloaded Commons is unchanged', async () => {
  let release;
  const stream = createCommonsStream({ world, parent: new THREE.Group(), loadModule: () => new Promise(resolve => { release = resolve; }) });
  const shared = createWalkingEnvironment(world), authority = createWalkingEnvironment(world);
  const outdoor = (environment, [east, north]) => environment.isFree(east, -north) && !environment.roomAt(east, -north);
  const peer = [edge + 80, -1335];
  stream.update([[edge - 200, -1335]]); await flush();
  assert.equal(stream.ready(), false);
  // World map, encounters and carriages read the shared environment: readiness must not hide the peer.
  assert.equal(outdoor(shared, peer), outdoor(authority, peer)); assert.equal(outdoor(shared, peer), true);
  const walker = createWalkingState(shared, [edge - 2, -1335, 0], -Math.PI / 2);
  const guards = [(from, to) => stream.allowsStep(from, to)];
  stream.update([[edge - 2, -1335]]); await flush();
  for (let i = 0; i < 100; i++) stepWalking(walker, guardedStepEnvironment(shared, [walker.position[0], -walker.position[2]], guards), { forward: 1 }, .04);
  assert.ok(walker.position[0] <= edge - .35, 'local entry still waits for presentation');
  assert.equal(outdoor(shared, peer), true);
  release(await import('../src/east-garden-commons.js')); await flush(); stream.update([[edge - 2, -1335]]); await flush();
  for (let i = 0; i < 100; i++) stepWalking(walker, guardedStepEnvironment(shared, [walker.position[0], -walker.position[2]], guards), { forward: 1 }, .04);
  assert.ok(walker.position[0] > edge + 5, 'loaded crossing proceeds');
  assert.equal(guardedStepEnvironment(shared, [0, 0], []), shared);
  stream.dispose();
});

test('scene hooks attach only after landscape readiness and clear on eviction', async () => {
  let finish; const changes = [], parent = new THREE.Group(), group = new THREE.Group();
  group.userData.ready = new Promise(resolve => { finish = resolve; });
  let disposed = 0; group.userData.dispose = () => { disposed++; };
  const stream = createCommonsStream({world, parent, onScene: scene => changes.push(scene),
    loadModule: async () => ({buildEastGardenCommons: () => group})});
  stream.update([[edge - 1,-1335]]); await flush();
  assert.equal(stream.ready(), false, 'the complete resource is measured before readiness');
  assert.equal(parent.children.length, 0);
  finish(); await flush();
  assert.equal(stream.ready(), true); assert.deepEqual(changes, [group]);
  stream.update([[edge-300,-1335]]);
  assert.deepEqual(changes, [group,null]); assert.equal(disposed, 1);
  stream.dispose(); assert.equal(disposed, 1);
});

test('teardown during landscape loading releases the scene and fences late completion', async () => {
  let finish, disposed = 0; const parent = new THREE.Group(), group = new THREE.Group();
  group.userData.ready = new Promise(resolve => { finish = resolve; });
  group.userData.dispose = () => { disposed++; };
  const stream = createCommonsStream({world,parent,loadModule:async()=>({buildEastGardenCommons:()=>group})});
  stream.update([[edge-1,-1335]]); await flush(); stream.dispose();
  assert.equal(disposed,1,'abort releases allocated scene immediately');
  finish(); await flush(); assert.equal(disposed,1); assert.equal(parent.children.length,0);
});

test('a restored player can retreat around the rain garden while presentation is unavailable', () => {
  const planter = world.eastGardenCommons.solids.find(item => item.id.endsWith('/rain-garden'));
  const [west,,east,north] = planter.rect;
  const environment = createWalkingEnvironment(world);
  const walker = createWalkingState(environment,[east+.36,-1356,0],0);
  const stream = createCommonsStream({world,parent:new THREE.Group()});
  const guards = [(from,to)=>stream.allowsStep(from,to)];
  const walkTo = target => {
    for (let i=0;i<1200;i++) {
      const dx=target[0]-walker.position[0], dz=-target[1]-walker.position[2];
      if (Math.hypot(dx,dz)<.2) return;
      walker.yaw=Math.atan2(-dx,-dz);
      stepWalking(walker,guardedStepEnvironment(environment,[walker.position[0],-walker.position[2]],guards),{forward:1},.04);
    }
    assert.fail(`retreat stalled at ${JSON.stringify(walker.position)} toward ${JSON.stringify(target)}`);
  };
  assert.equal(environment.isFree(walker.position[0],walker.position[2]),true);
  walkTo([east+.36,north+1]);
  walkTo([west-1,north+1]);
  assert.ok(walker.position[0]<west);
  assert.equal(stream.allowsStep([edge-1,-1335],[edge+1,-1335]),false,'unloaded entry remains blocked');
  assert.equal(stream.allowsStep([east,-1356],[east+1,-1356]),false,'retreat does not advance farther east');
  stream.dispose();
});
