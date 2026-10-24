// The Gardens' public traversal (#508) on the authoritative world: a resident takes T1's
// lift from the street to Floor 4, walks the gallery, B12, T2's terrace and gallery and B23
// into T3 with plain poses, and comes back down T3's stairs to the street; a street walker
// under B12 and a visitor on it share one x/z at their own heights; every forged level,
// height, portal, edge and suite move is refused by the server; landings never barricade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { campusInteriorPlan } from '../../preview/src/garden-campus-levels.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusToSource } from '../../shared/garden-campus-layout.js';

const campus = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS });
const BASE = CAMPUS.frame.baseAltitude, L = index => `garden-campus/l${index}`;
const source = ([u, v]) => campusToSource([u, v]).slice(0, 2);
const environments = new Map();
const environmentFor = levelId => { if (!environments.has(levelId ?? '')) environments.set(levelId ?? '', createWalkingEnvironment(campus, [], levelId ?? null));return environments.get(levelId ?? ''); };

function town(options = {}) {
  let time = 1000;
  const world = createSharedWorld(campus, { now: () => time, ...options });
  const command = (userId, message) => { time += 150;return world.command(userId, message); };
  const player = userId => world.snapshot().players.find(p => p.id === userId);
  // Straight poses in campus metres, 0.12 m apart, each on the walker's own level.
  function walk(userId, points) {
    let at = player(userId).position;
    for (const point of points) {
      const [x, n] = source(point), count = Math.max(1, Math.ceil(Math.hypot(x - at[0], n - at[1]) / 0.12));
      for (let i = 1; i <= count; i++) {
        const self = player(userId), environment = environmentFor(self.levelId), e = at[0] + (x - at[0]) * i / count, m = at[1] + (n - at[1]) * i / count;
        const moved = command(userId, { type: 'pose', position: [e, m, environment.groundAt(e, -m)], yaw: 0, altitude: 0, ...(self.levelId ? { levelId: self.levelId } : {}) });
        if (!moved.ok) return { ok: false, error: moved.error, at: point };
      }
      at = [x, n];
    }
    return { ok: true };
  }
  const portal = (userId, portalId) => command(userId, { type: 'interiorLevel', portalId });
  return { world, command, player, walk, portal, advance: ms => { time += ms; } };
}
const plan = campusInteriorPlan(campus), portalAt = id => plan.levels.flatMap(level => level.portals).find(item => item.id === id);

// Into T1's hall and up its lift to Floor 4, one level per portal.
function upToFloor4(t, userId) {
  assert.equal(t.command(userId, { type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'enter' }).ok, true);
  t.advance(1500);
  assert.deepEqual(t.walk(userId, [[11.6, 56.3]]), { ok: true }, 'to the T1 lift');
  for (const [id, level] of [['T1-F1/lift-up', 1], ['T1-F2/lift-up', 2], ['T1-F3/lift-up', 3]]) {
    const moved = t.portal(userId, id);
    assert.equal(moved.ok, true, `${id}: ${moved.error}`);
    assert.deepEqual([moved.player.levelId, moved.player.buildingId], [L(level), 'garden-campus']);
    assert.ok(Math.abs(moved.player.position[2] - (BASE + campusLevels()[level].z)) < 1e-9, `${id} lands at the floor's height`);
    t.advance(400);
  }
}

test('a resident rides T1 up, walks Floor 4 through both skywalks into T3 and returns to the street by T3’s stairs', () => {
  const t = town();
  t.world.join({ userId: 'alice', name: 'alice' });
  upToFloor4(t, 'alice');
  // The continuous public route: spur, T1 gallery, B12, T2's terrace and gallery, B23, T3's gallery and spur.
  const route = [[12, 57.5], [16, 57.5], [16, 70], [16, 92], [16, 104], [16, 116], [16, 131], [16, 140], [12.4, 140]];
  assert.deepEqual(t.walk('alice', route), { ok: true });
  const onDeck = t.player('alice');
  assert.deepEqual([onDeck.levelId, onDeck.position[2]], [L(3), BASE + 13]);
  // Down T3's stairs, one level at a time: each flight's foot is the next flight's head.
  assert.deepEqual(t.walk('alice', [[11.6, 140.3]]), { ok: true }, 'to T3’s stairs');
  for (const [id, level] of [['T3-F4/stairs-down', 2], ['T3-F3/stairs-down', 1], ['T3-F2/stairs-down', 0]]) {
    const moved = t.portal('alice', id);
    assert.equal(moved.ok, true, `${id}: ${moved.error}`);
    assert.ok(Math.abs(moved.player.position[2] - (BASE + campusLevels()[level].z)) < 1e-9);
    t.advance(400);
  }
  const street = t.player('alice');
  assert.deepEqual([street.levelId, street.buildingId, street.position[2]], [null, null, BASE], 'back on the street, in T3’s hall');
  assert.equal(environmentFor(null).roomAt(street.position[0], -street.position[1])?.storeId, 'campus:T3-F1-hall');
});

test('a walker under B12 and a visitor on it stand at one x/z, each at their own height and level', () => {
  const t = town();
  for (const id of ['walker', 'visitor']) t.world.join({ userId: id, name: id });
  assert.equal(t.command('walker', { type: 'travel', position: source([31, 76.8]) }).ok, true);
  t.advance(1500);
  assert.deepEqual(t.walk('walker', [[20, 76.8], [16, 76.8]]), { ok: true });
  upToFloor4(t, 'visitor');
  assert.deepEqual(t.walk('visitor', [[12, 57.5], [16, 57.5], [16, 76.8]]), { ok: true });
  const below = t.player('walker'), above = t.player('visitor');
  assert.ok(Math.hypot(below.position[0] - above.position[0], below.position[1] - above.position[1]) < 1e-9, 'one x/z');
  assert.deepEqual([below.levelId, below.position[2], above.levelId, above.position[2]], [null, BASE, L(3), BASE + 13]);
  // Both keep walking across that point: neither body is the other's obstacle, neither is corrected.
  assert.deepEqual(t.walk('walker', [[16, 80], [16, 74]]), { ok: true });
  assert.deepEqual(t.walk('visitor', [[16, 74], [16, 80]]), { ok: true });
  assert.deepEqual([t.player('walker').position[2], t.player('visitor').position[2]], [BASE, BASE + 13]);
});

test('forged levels, heights, portals, edges, walls, suites, flight and travel are refused by the server', () => {
  const t = town();
  for (const id of ['walker', 'visitor']) t.world.join({ userId: id, name: id });
  assert.equal(t.command('walker', { type: 'travel', position: source([31, 76.8]) }).ok, true);
  t.advance(1500);
  assert.deepEqual(t.walk('walker', [[20, 76.8], [16, 76.8]]), { ok: true });
  const [x, n] = source([16, 77]), pose = (id, extra) => t.command(id, { type: 'pose', position: [x, n, BASE], yaw: 0, altitude: 0, ...extra });
  assert.equal(pose('walker', { position: [x, n, BASE + 13], levelId: L(3) }).error, 'invalid_level', 'a street walker cannot claim the deck');
  assert.equal(pose('walker', { position: [x, n, BASE + 13] }).error, 'invalid_ground', 'nor its height');
  upToFloor4(t, 'visitor');
  assert.deepEqual(t.walk('visitor', [[12, 57.5], [16, 57.5], [16, 76.8]]), { ok: true });
  assert.equal(pose('visitor', { levelId: L(3) }).error, 'invalid_ground', 'a deck visitor cannot drop to the street');
  assert.equal(pose('visitor', {}).error, 'invalid_level', 'a late street pose never pulls a visitor off the deck');
  assert.equal(pose('visitor', { position: [x, n, BASE + 9], levelId: L(2) }).error, 'invalid_level', 'nor names another level');
  assert.equal(t.walk('visitor', [[17.3, 76.8]]).error, 'blocked', 'the body would meet B12’s edge guard');
  assert.equal(t.command('visitor', { type: 'pose', position: [x, n, BASE + 13], yaw: 0, altitude: 1, levelId: L(3) }).error, 'flight_not_allowed');
  assert.equal(t.command('visitor', { type: 'travel', position: source([31, 76.8]) }).error, 'return_to_ground_level', 'the way down is the lift or stairs');
  assert.equal(t.portal('visitor', 'T1-F4/lift-down').error, 'level_portal_out_of_reach');
  assert.equal(t.portal('visitor', 'T1-F2/lift-up').error, 'invalid_level_portal', 'only this level’s portals');
  assert.equal(t.portal('visitor', 'nowhere').error, 'invalid_level_portal');
  // A suite wall is solid; a suite door admits only whom #509 admits (fail closed by default).
  assert.deepEqual(t.walk('visitor', [[16, 60]]), { ok: true });
  assert.equal(t.walk('visitor', [[13.5, 60]]).error, 'blocked', 'through T1-402’s wall');
  assert.deepEqual(t.walk('visitor', [[16, 52.25]]), { ok: true });
  assert.equal(t.walk('visitor', [[13.5, 52.25]]).error, 'private_suite', 'T1-401’s door without a lease');
});

test('a suite door admits the resident #509 admits, and only into that suite', () => {
  const t = town({ campusAdmission: (userId, unitId) => userId === 'tenant' && unitId === 'T1-F4-W-S' });
  for (const id of ['tenant', 'neighbour']) t.world.join({ userId: id, name: id });
  for (const id of ['tenant', 'neighbour']) { upToFloor4(t, id);assert.deepEqual(t.walk(id, [[12, 57.5], [16, 57.5], [16, 52.25]]), { ok: true }); }
  assert.deepEqual(t.walk('tenant', [[13.5, 52.25], [10, 52]]), { ok: true }, 'through T1-401’s door to its desk area');
  assert.equal(t.walk('neighbour', [[13.5, 52.25]]).error, 'private_suite');
  assert.deepEqual(t.walk('tenant', [[13.5, 52.25], [16, 52.25], [16, 65.5]]), { ok: true }, 'back out to the gallery');
  assert.equal(t.walk('tenant', [[13.5, 65.5]]).error, 'private_suite', 'T1-402 is not the tenant’s');
});

test('someone on a landing never keeps a resident off a floor; a checkpoint restores the level and place', () => {
  const t = town();
  for (const id of ['first', 'second']) t.world.join({ userId: id, name: id });
  upToFloor4(t, 'first');
  upToFloor4(t, 'second');
  const [first, second] = [t.player('first'), t.player('second')];
  assert.equal(second.levelId, L(3));
  assert.ok(Math.hypot(first.position[0] - second.position[0], first.position[1] - second.position[1]) >= 0.7, 'arrived beside, not onto, the resident on the landing');
  const again = createSharedWorld(campus, { now: () => 1e9 });
  assert.deepEqual(again.restore(t.world.checkpoint()), { ok: true });
  const restored = again.snapshot().players.find(p => p.id === 'second');
  assert.deepEqual([restored.levelId, restored.buildingId, restored.position], [L(3), 'garden-campus', second.position]);
});


test('a valid lift portal refuses client-supplied destinations without moving the resident', () => {
  const t = town();
  t.world.join({ userId: 'visitor', name: 'visitor' });
  upToFloor4(t, 'visitor');
  const before = t.player('visitor');
  for (const forged of [
    { position: [...source([16, 123]), BASE + 13] },
    { toLevelId: L(7) },
    { levelId: L(7) },
    { buildingId: 'other-tower' },
    { altitude: 29 },
  ]) {
    const result = t.command('visitor', { type: 'interiorLevel', portalId: 'T1-F4/lift-up', ...forged });
    assert.equal(result.error, 'invalid_level_portal', JSON.stringify(forged));
    assert.deepEqual(t.player('visitor'), before, 'refusal preserves the authoritative resident');
  }
  const valid = t.portal('visitor', 'T1-F4/lift-up');
  assert.equal(valid.ok, true, valid.error);
  assert.deepEqual([valid.player.levelId, valid.player.position[2]], [L(4), BASE + 17]);
});

test('neither bridge admits lateral entry from below or lets an upper visitor walk off its side', () => {
  const t = town();
  for (const id of ['walker', 'visitor']) t.world.join({ userId: id, name: id });
  upToFloor4(t, 'visitor');
  assert.deepEqual(t.walk('visitor', [[12, 57.5], [16, 57.5]]), { ok: true });
  for (const v of [76.8, 123]) {
    assert.equal(t.command('walker', { type: 'travel', position: source([31, v]) }).ok, true);
    t.advance(1500);
    assert.deepEqual(t.walk('walker', [[20, v], [18, v]]), { ok: true });
    const before = t.player('walker'), [x, n] = source([16, v]);
    for (const extra of [{ levelId: L(3) }, {}]) {
      const result = t.command('walker', { type: 'pose', position: [x, n, BASE + 13], yaw: 0, altitude: 0, ...extra });
      assert.equal(result.error, extra.levelId ? 'invalid_level' : 'invalid_ground');
      assert.deepEqual(t.player('walker'), before, 'lateral deck claim cannot alter street support');
    }
    assert.deepEqual(t.walk('visitor', [[16, v]]), { ok: true });
    const onDeck = t.player('visitor');
    for (const [u, error] of [[14.7, 'blocked'], [17.3, 'blocked'], [13.8, 'invalid_ground'], [18.2, 'invalid_ground']]) {
      const result = t.command('visitor', { type: 'pose', position: [...source([u, v]), BASE + 13], yaw: 0, altitude: 0, levelId: L(3) });
      assert.equal(result.error, error, `bridge at v=${v}, side u=${u}`);
      assert.deepEqual(t.player('visitor'), onDeck, 'off-edge refusal preserves the valid deck pose');
    }
  }
});
