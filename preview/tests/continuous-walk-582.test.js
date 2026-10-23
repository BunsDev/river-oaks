import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { createSharedWorld } from '../../server/world.js';
import { createWalkingEnvironment, createWalkingState, stepWalking, steerWalkingToward } from '../src/walking.js';
import { createResidentNavigation } from '../src/navigation.js';
import { commonsAllows, createCommonsLayout } from '../../shared/east-garden-commons-layout.js';
import { thirdPersonPose } from '../src/third-person.js';

const world = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' });
const environment = createWalkingEnvironment(world), nav = createResidentNavigation(world);
const { edge } = world.eastGardenCommons;

test('two controllers walk from the original arrival to Commons and home under authority', () => {
  let time = 1000;
  let town = createSharedWorld(world, { now: () => time });
  for (const id of ['alice', 'bob']) assert.equal(town.join({ userId: id, name: id }).ok, true);
  assert.equal(town.command('alice', { type: 'appearance', appearance: 'woman-tailored' }).ok, true);
  const starts = town.snapshot().players;
  const walkers = starts.map(player => ({ id: player.id, state: createWalkingState(environment, player.position) }));
  const gate = [-2685, -1334], seam = [edge - 1, -1335], plaza = [edge + 80, -1335];
  const walk = (walker, points) => {
    assert.ok(points?.length, `${walker.id} has a pedestrian route`);
    let ticks = 0, previousCamera = null;
    for (const target of points) {
      let remaining = 12000;
      while (Math.hypot(walker.state.position[0] - target[0], walker.state.position[2] + target[1]) > .2) {
        assert.ok(--remaining > 0, `stalled: ${JSON.stringify({ target, position: walker.state.position })}`);
        time += 1000 / 60;
        const input = steerWalkingToward(walker.state, target, 1 / 60);
        stepWalking(walker.state, environment, input, 1 / 60);
        const [x, eye, z] = walker.state.position;
        assert.ok(environment.isFree(x, z), 'controller never enters a blocked footprint');
        const camera = thirdPersonPose(walker.state, environment);
        assert.ok(camera.position.every(Number.isFinite));
        if (previousCamera && Math.abs(x - edge) < 2) {
          assert.ok(Math.hypot(...camera.position.map((v, i) => v - previousCamera[i])) < .25, `camera discontinuity: ${JSON.stringify({position:walker.state.position,yaw:walker.state.yaw,previousCamera,camera:camera.position,target})}`);
        }
        previousCamera = camera.position;
        if (++ticks % 6 === 0 || remaining === 1) {
          const result = town.command(walker.id, { type: 'pose', position: [x, -z, eye - 1.68], yaw: walker.state.yaw, altitude: 0 });
          assert.equal(result.ok, true, `${walker.id}: ${JSON.stringify(result)}`);
        }
      }
    }
    const [x, eye, z] = walker.state.position;
    time += 100;
    assert.equal(town.command(walker.id, { type: 'pose', position: [x, -z, eye - 1.68], yaw: walker.state.yaw, altitude: 0 }).ok, true);
  };
  for (const walker of walkers) {
    const start = starts.find(p => p.id === walker.id).position;
    const approach = [start[0] + 2, start[1]];
    walk(walker, [approach, ...nav.route(approach, gate), seam, plaza]);
  }
  const arrived = town.snapshot().players;
  assert.ok(arrived.every(p => p.position[0] > edge + 79));
  const restored = createSharedWorld(world, { now: () => time });
  assert.equal(restored.restore(town.checkpoint()).ok, true);
  town = restored;
  for (const player of arrived) {
    const retained = town.snapshot().players.find(p => p.id === player.id);
    assert.deepEqual(retained.position, player.position);
    assert.deepEqual(retained.appearance, player.appearance);
  }
  for (const walker of walkers) {
    const home = starts.find(p => p.id === walker.id).position.slice(0, 2);
    walk(walker, [seam, gate, ...nav.route(gate, [home[0] + 2, home[1]]), home]);
    const player = town.snapshot().players.find(p => p.id === walker.id), start = starts.find(p => p.id === walker.id);
    assert.ok(Math.hypot(player.position[0] - start.position[0], player.position[1] - start.position[1]) < .3);
    assert.deepEqual(player.appearance, start.appearance);
  }
});

test('invalid seam poses cannot change an authoritative player or cross the empty reserve', () => {
  let time = 1000;
  const data = { ...world, walkSpawn: [edge - 1, -1335, environment.groundAt(edge - 1, 1335)] };
  const town = createSharedWorld(data, { now: () => time });
  town.join({ userId: 'alice', name: 'Alice' });
  const before = town.snapshot().players[0];
  for (const position of [[NaN, -1335, 0], [Infinity, -1335, 0], [edge + 15, -1280, 18], [edge + 80, -1335, 18], [edge, -1335, 200]]) {
    time += 100;
    const result = town.command('alice', { type: 'pose', position, yaw: 0, altitude: 0 });
    assert.equal(result.ok, false);
    const after = town.snapshot().players[0];
    assert.deepEqual(after.position, before.position);
    assert.deepEqual(after.appearance, before.appearance);
  }
});


test('the full camera clearance fits the physical join without allowing the empty reserve', () => {
  const layout = world.eastGardenCommons;
  for (let x = edge - 3; x <= edge + 3; x += .05) {
    assert.equal(commonsAllows(layout, x, -1335, 1.3), true, `seam camera clearance at ${x}`);
    assert.equal(environment.canFly(x, environment.groundAt(x, 1335) + 2, 1335), true);
  }
  const blockout = createCommonsLayout({districtBounds:layout.districtBounds,edgeHeights:layout.edgeHeights});
  for (let x = edge + 2; x < edge + 40; x += 1) {
    assert.equal(commonsAllows(layout, x, -1280, 1.3), false, 'unbuilt reserve beyond Market stays blocked');
    assert.equal(commonsAllows(blockout, x, -1330, 1.3), false, 'blockout off-route reserve stays blocked');
    assert.equal(commonsAllows(blockout, x, -1333, 1.3), false, 'blockout camera radius cannot overhang promenade');
  }
});

test('joined clearance never lets a body overhang the physical footprint at either junction', () => {
  const layout = world.eastGardenCommons;
  const rectangles = [layout.districtBounds, ...layout.surfaces.map(s => s.rect)];
  const covered = (x, y) => rectangles.some(([w, s, e, n]) => x >= w - 1e-8 && x <= e + 1e-8 && y >= s - 1e-8 && y <= n + 1e-8);
  for (const join of [edge, layout.surfaces[1].rect[0]]) for (const radius of [.35, 1.3, 2.9, 3.1]) {
    for (let x = join - 4; x <= join + 4; x += .25) for (let y = -1340; y <= -1330; y += .25) {
      if (!commonsAllows(layout, x, y, radius)) continue;
      for (let i = 0; i < 64; i++) {
        const angle = i * Math.PI / 32;
        assert.ok(covered(x + radius * Math.cos(angle), y + radius * Math.sin(angle)), `overhang at ${[x, y, radius]}`);
      }
    }
  }
});


test('the rendered District approach corner remains walkable when waypoints are reached within 15 cm', () => {
  const start = [-2714.9170724314704, -1321.6003302338634];
  const target = [-2714.280118916899, -1322.6085898216527];
  const roadNavigation = createResidentNavigation(world, { allowRoads: true });
  assert.equal(roadNavigation.canTravel(start, target), false, 'the captured early turn crosses a solid corner');
  const route = roadNavigation.route(start, target);
  assert.ok(route?.length > 1, 'the planner supplies a walkable corner');
  const state = createWalkingState(environment, [...start, environment.groundAt(start[0], -start[1])]);
  for (const point of route) {
    let remaining = 12000;
    while (Math.hypot(state.position[0] - point[0], state.position[2] + point[1]) >= .15) {
      assert.ok(--remaining > 0, `corner stalled: ${JSON.stringify(state.position)}`);
      stepWalking(state, environment, steerWalkingToward(state, point, 1 / 60), 1 / 60);
      assert.ok(environment.isFree(state.position[0], state.position[2]));
    }
  }
  assert.ok(Math.hypot(state.position[0] - target[0], state.position[2] + target[1]) < .15);
});
