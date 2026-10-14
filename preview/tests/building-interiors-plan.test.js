import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBuildingInteriorPlan, buildingLocalToWorld, worldToBuildingLocal } from '../src/building-interiors-plan.js';

function fixture({ yaw = 0, ring = null, size = [16, 12, 10] } = {}) {
  const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
  const convert = ([x, y]) => [40 + x * c - y * s, -20 + x * s + y * c];
  const local = ring ?? [[-8, -6], [8, -6], [8, 6], [-8, 6]];
  const points = [...local, local[0]].map(convert);
  const entrance = { id: 'front', position: convert([0, -6]), outward: [s, -c] };
  return { building: { id: 'gallery-hall', center: [40, -20, 5], size, yaw_deg: yaw, ring: points, kind: 'retail' }, entrance };
}

const input = ({ yaw = 0, ring, seed = 'gallery-seed', levels = 2, size } = {}) => ({
  worldId: 'moon-garden', ...fixture({ yaw, ring, size }), seed, levels, baseElevation: 5,
});

test('a building plan is deterministic, serializable, and independent of input mutation', () => {
  const request = input({ yaw: 31 });
  const before = structuredClone(request);
  const first = generateBuildingInteriorPlan(request);
  assert.deepEqual(first, generateBuildingInteriorPlan(structuredClone(request)));
  assert.deepEqual(request, before);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(first.generatorVersion, 1);
  assert.equal(first.buildingId, 'gallery-hall');
  assert.equal(first.anchor.origin[0], 40);
  assert.deepEqual(first.levels.map(level => level.id), ['gallery-hall/l0', 'gallery-hall/l1']);
  assert.equal(new Set(first.levels.flatMap(level => level.rooms.map(room => room.id))).size, 2);
  assert.ok(first.levels[0].portals.some(portal => portal.kind === 'entrance'));
  assert.ok(first.levels[0].portals.some(portal => portal.kind === 'stairs' && portal.toLevelId === 'gallery-hall/l1'));
  assert.ok(first.levels[1].portals.some(portal => portal.kind === 'stairs' && portal.toLevelId === 'gallery-hall/l0'));
  for (const level of first.levels) {
    assert.ok(level.floorElevation >= 5 && level.floorElevation + level.clearHeight < 15);
    assert.deepEqual(Object.keys(level.layers), ['shell', 'partitions', 'fixtures', 'finishes', 'authoredOverrides']);
    assert.ok(level.rooms[0].footprint.length >= 4);
    for (let i = 0; i < level.rooms[0].footprint.length; i++) {
      const worldPoint = buildingLocalToWorld(first.anchor, level.rooms[0].localFootprint[i]);
      const expected = level.rooms[0].footprint[i];
      assert.ok(Math.hypot(worldPoint[0] - expected[0], worldPoint[1] - expected[1]) < 1e-9);
      const local = worldToBuildingLocal(first.anchor, expected);
      assert.ok(Math.hypot(local[0] - level.rooms[0].localFootprint[i][0], local[1] - level.rooms[0].localFootprint[i][1]) < 1e-9);
    }
  }
});

test('seed changes decoration while stable IDs and hard geometry stay put', () => {
  const first = generateBuildingInteriorPlan(input());
  const other = generateBuildingInteriorPlan(input({ seed: 'another-seed' }));
  assert.notDeepEqual(first.levels[0].layers.finishes, other.levels[0].layers.finishes);
  assert.deepEqual(first.levels.map(level => level.id), other.levels.map(level => level.id));
  assert.deepEqual(first.levels.map(level => level.rooms[0].footprint), other.levels.map(level => level.rooms[0].footprint));
  assert.deepEqual(first.levels.map(level => level.portals), other.levels.map(level => level.portals));
});

test('rotated and concave building plans keep every room and stair corner inside the footprint', () => {
  const ring = [[-8, -6], [8, -6], [8, 6], [2, 6], [2, 2], [-2, 2], [-2, 6], [-8, 6]];
  const request = input({ yaw: 27, ring });
  const plan = generateBuildingInteriorPlan(request);
  const contains = ([x, y]) => {
    const polygon = request.building.ring;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  for (const level of plan.levels) {
    for (const point of level.rooms[0].footprint) assert.ok(contains(point), `room corner ${point} escaped`);
    for (const portal of level.portals.filter(portal => portal.kind === 'stairs')) assert.ok(contains(portal.position), 'stair landing escaped');
  }
});

test('reserved neighbor rooms cannot be claimed and fixtures leave the entrance-to-stair route open', () => {
  const reservedFootprints = [[[2.9, -5.5], [7, -5.5], [7, 3], [2.9, 3]].map(([x, y]) => [x + 40, y - 20])];
  const plan = generateBuildingInteriorPlan({ ...input(), reservedFootprints });
  const room = plan.levels[0].rooms[0];
  assert.ok(Math.max(...room.footprint.map(point => point[0])) < 42.9, 'the generated room claimed its neighbor');
  for (const level of plan.levels) {
    assert.ok(level.layers.fixtures.length > 0);
    for (const fixture of level.layers.fixtures) {
      assert.match(fixture.id, /gallery-hall\/l\d+\/object\//);
      assert.ok(fixture.footprint.every(([x]) => x < 39.4), 'fixture blocks the central route');
    }
  }
  assert.throws(() => generateBuildingInteriorPlan({ ...input(), reservedFootprints: [
    [[-8, -6], [8, -6], [8, 6], [-8, 6]].map(([x, y]) => [x + 40, y - 20]),
  ] }), /footprint/i);
});

test('impossible entrances, inadequate building height and unbounded requests fail closed', () => {
  assert.throws(() => generateBuildingInteriorPlan(input({ size: [16, 12, 6] })), /height/i);
  assert.throws(() => generateBuildingInteriorPlan({ ...input(), entrance: { id: 'front', position: [100, 100], outward: [0, -1] } }), /entrance/i);
  assert.throws(() => generateBuildingInteriorPlan(input({ levels: 9 })), /level/i);
  assert.throws(() => generateBuildingInteriorPlan(input({ seed: 'x'.repeat(129) })), /seed/i);
  assert.throws(() => generateBuildingInteriorPlan(input({ seed: '<script>' })), /seed/i);
  assert.throws(() => generateBuildingInteriorPlan({ ...input(), building: { ...input().building, ring: [[0, 0], [1, 0], [1, 1]] } }), /footprint/i);
});

test('self-touching and doubled-back building rings cannot produce an interior plan', () => {
  const doubledBack = [[-8, -6], [8, -6], [8, 6], [0, 6], [0, 2], [0, 6], [-8, 6]];
  const vertexTouch = [[-8, -6], [8, -6], [8, 6], [0, 6], [0, 4], [4, 4], [4, 5], [0, 4], [-8, 6]];
  for (const ring of [doubledBack, vertexTouch]) {
    assert.throws(() => generateBuildingInteriorPlan(input({ ring })), /footprint/);
  }
});

test('authored furnishing positions and finishes use stable slots across rotated plans and reject blocked routes', () => {
  for (const yaw of [0, 31, 90]) {
    const request = input({ yaw }), before = generateBuildingInteriorPlan(request);
    const targetId = before.levels[0].layers.fixtures[0].id;
    const overrides = [{ targetId, position: [-4.45, -1], material: 'oak' },
      { targetId: before.levels[0].layers.finishes[0].id, material: 'terracotta' }];
    const edited = generateBuildingInteriorPlan({ ...request, overrides });
    assert.deepEqual(edited.levels[1], before.levels[1]);
    assert.deepEqual(edited.levels[0].portals, before.levels[0].portals);
    assert.deepEqual(edited.levels[0].layers.shell, before.levels[0].layers.shell);
    assert.equal(edited.levels[0].layers.fixtures[0].id, targetId);
    assert.equal(edited.levels[0].layers.fixtures[0].material, 'oak');
    assert.equal(edited.levels[0].layers.finishes[0].material, 'terracotta');
    assert.deepEqual(edited.levels[0].layers.authoredOverrides.map(item => item.id),
      [...overrides].sort((a,b) => a.targetId.localeCompare(b.targetId)).map(item => `${item.targetId}/override`));
    const center = edited.levels[0].layers.fixtures[0].footprint.reduce((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
    const expected = buildingLocalToWorld(before.anchor, [-4.45, -1]);
    assert.ok(Math.hypot(center[0] - expected[0], center[1] - expected[1]) < 1e-8);
    for (const position of [[0, -3], [3.65, 1.2], [20, 20]])
      assert.throws(() => generateBuildingInteriorPlan({ ...request, overrides: [{ targetId, position }] }), /placement/);
  }
});

test('override and level-seed inputs fail closed and unedited plans remain byte-identical', () => {
  const request = input(), baseline = generateBuildingInteriorPlan(request);
  assert.equal(JSON.stringify(baseline), JSON.stringify(generateBuildingInteriorPlan({ ...request, overrides: [], levelSeeds: {} })));
  const targetId = baseline.levels[0].layers.fixtures[0].id;
  for (const overrides of [null, [{ targetId }], [{ targetId, material: 'script' }],
    [{ targetId, position: [0, Infinity] }], [{ targetId, position: [0, 1, 2] }],
    [{ targetId, material: 'oak', script: 'x' }], [{ targetId: 'other/l0/object/wall-display', material: 'oak' }],
    [{ targetId: targetId.replace('/l0/', '/l7/'), material: 'oak' }],
    [{ targetId: baseline.levels[0].layers.finishes[0].id, position: [0, 1] }],
    [{ targetId, material: 'oak' }, { targetId, material: 'concrete' }]])
    assert.throws(() => generateBuildingInteriorPlan({ ...request, overrides }), /Invalid building interior/);
  for (const levelSeeds of [[], null, { '01': 'one' }, { 2: 'two' }, { 1: '<script>' }])
    assert.throws(() => generateBuildingInteriorPlan({ ...request, levelSeeds }), /generation edits/);
  const rerolled = generateBuildingInteriorPlan({ ...request, levelSeeds: { 1: 'fresh-floor' } });
  assert.deepEqual(rerolled.levels[0], baseline.levels[0]);
  assert.notDeepEqual(rerolled.levels[1].layers.finishes, baseline.levels[1].layers.finishes);
  assert.deepEqual(rerolled.levels[1].rooms, baseline.levels[1].rooms);
});
