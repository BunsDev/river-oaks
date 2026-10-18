import assert from 'node:assert/strict';
import test from 'node:test';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import {
  GARDEN_CAMPUS_LAYOUT as LAYOUT, CAMPUS_BODY, CAMPUS_HEADROOM, campusLevels, campusSupportAt, campusToSource,
  checkCampusCompatibility, validateGardenCampus,
} from '../../shared/garden-campus-layout.js';
import { loadDistrictData } from '../district-data.js';

// #506's runnable authority fixture for the campus support model, ahead of #508's
// world.js levels. It keeps world.js's walking rules: the server assigns the level,
// a pose sits within 0.2 m of its ground, a step is checked every 0.15 m for a
// 0.35 m body (walking.js RADIUS), one move covers at most a second at 3.4 m/s,
// and a level change lands on its paired portal within 1.3 m reach. Support comes
// only from campusSupportAt on the occupant's own level.
const L = index => `garden-campus/l${index}`;
const WALK_SPEED = 3.4, SUBSTEP = 0.15, GROUND_TOLERANCE = 0.2, WALK_RADIUS = 0.35, REACH = 1.3;
const distanceToRect = ([u0, v0, u1, v1], [u, v]) => Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1));

function createCampusAuthority(layout = LAYOUT) {
  const levels = new Map(campusLevels(layout).map(level => [level.id, level]));
  const occupants = new Map();
  // Public support under the body's centre, with the body clear of every shaft, guard and planter.
  const stand = (levelId, u, v) => {
    const support = campusSupportAt(levelId, u, v, layout);
    if (!support || levels.get(levelId).obstacles.some(item => distanceToRect(item.rect, [u, v]) < WALK_RADIUS)) return { error: 'blocked' };
    return support.access === 'public' ? { support } : { error: 'private_suite' };
  };
  const pose = id => { const { levelId, position, surfaceId } = occupants.get(id);return { ok: true, levelId, position: [...position], surfaceId, altitude: campusToSource(position)[2] }; };
  return {
    enter(id, levelId, [u, v]) {
      const { support, error } = stand(levelId, u, v);
      if (error) return { ok: false, error };
      occupants.set(id, { levelId, position: [u, v, support.z], surfaceId: support.surfaceId });
      return pose(id);
    },
    move(id, { position: [u, v, z], levelId }) {
      const occupant = occupants.get(id);
      if (levelId !== undefined && levelId !== occupant.levelId) return { ok: false, error: 'invalid_level' };
      const target = stand(occupant.levelId, u, v);
      if (target.support && Math.abs(z - target.support.z) > GROUND_TOLERANCE) return { ok: false, error: 'invalid_ground' };
      const [u0, v0] = occupant.position, length = Math.hypot(u - u0, v - v0);
      if (length > WALK_SPEED) return { ok: false, error: 'movement_too_fast' };
      for (let i = 1, steps = Math.max(1, Math.ceil(length / SUBSTEP)); i <= steps; i++) {
        const { error } = stand(occupant.levelId, u0 + (u - u0) * i / steps, v0 + (v - v0) * i / steps);
        if (error) return { ok: false, error };
      }
      Object.assign(occupant, { position: [u, v, target.support.z], surfaceId: target.support.surfaceId });
      return pose(id);
    },
    usePortal(id, portalId) {
      const occupant = occupants.get(id), portal = levels.get(occupant.levelId).portals.find(item => item.id === portalId);
      if (!portal) return { ok: false, error: 'invalid_level_portal' };
      if (Math.hypot(portal.position[0] - occupant.position[0], portal.position[1] - occupant.position[1]) > REACH) return { ok: false, error: 'level_portal_out_of_reach' };
      const paired = levels.get(portal.toLevel)?.portals.find(item => item.id === portal.toPortal && item.toPortal === portal.id);
      const landing = paired && stand(portal.toLevel, ...paired.position);
      if (!landing?.support) return { ok: false, error: 'level_landing_blocked' };
      Object.assign(occupant, { levelId: portal.toLevel, position: [...paired.position, landing.support.z], surfaceId: landing.support.surfaceId });
      return pose(id);
    },
    checkpoint() {
      return { versions: { id: layout.id, ...layout.versions }, occupants: [...occupants].map(([id, { levelId, position }]) => ({ id, levelId, position: [...position] })) };
    },
    restore({ versions, occupants: saved }) {
      const compatible = checkCampusCompatibility(versions, layout);
      if (!compatible.ok) return { ok: false, relocate: 'street', reason: compatible.reason };
      const restored = new Map();
      for (const { id, levelId, position: [u, v, z] } of saved) {
        const { support } = stand(levelId, u, v);
        if (!support || support.z !== z) return { ok: false, relocate: 'street', reason: `${id} has no support at ${levelId}` };
        restored.set(id, { levelId, position: [u, v, z], surfaceId: support.surfaceId });
      }
      occupants.clear();for (const [id, occupant] of restored) occupants.set(id, occupant);
      return { ok: true };
    },
  };
}

// Walks straight between waypoints in 0.25 m poses, as a client would send them, and
// returns the surfaces crossed in order.
function walk(authority, id, waypoints, z) {
  const surfaces = [];
  for (let i = 1; i < waypoints.length; i++) {
    const [a, b] = [waypoints[i - 1], waypoints[i]], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
    for (let s = 1; s <= steps; s++) {
      const result = authority.move(id, { position: [a[0] + (b[0] - a[0]) * s / steps, a[1] + (b[1] - a[1]) * s / steps, z] });
      assert.equal(result.ok, true, `${id} step ${s}/${steps} from ${a} to ${b}: ${result.error}`);
      if (surfaces.at(-1) !== result.surfaceId) surfaces.push(result.surfaceId);
    }
  }
  return surfaces;
}

test('the district the server loads validates the campus contract, and still walks the garage today', async () => {
  const district = await loadDistrictData();
  assert.deepEqual(validateGardenCampus(LAYOUT, { district }), { ok: true, findings: [] });
  const street = createWalkingEnvironment(district);
  const local = ([u, v]) => { const [east, north] = campusToSource([u, v]);return [east, -north]; };
  // Under B12 on P2 the garage collision still blocks the parcel until #507's revision
  // replaces it, and the street ground there is terrain, not the deck 13 m above.
  assert.equal(street.isFree(...local([16, 76])), false);
  const ground = street.groundAt(...local([16, 76])), deck = campusToSource([16, 76, 13])[2];
  assert.ok(ground > 17.5 && ground < 18.5, `street ground ${ground}`);
  assert.ok(deck - LAYOUT.bridges[0].deckZ + LAYOUT.bridges[0].underside - ground >= CAMPUS_BODY.height + CAMPUS_HEADROOM);
  assert.equal(street.isFree(...local([-3, 76])), true, 'the E2 lane beyond the parcel is open street');
});

test('a visitor climbs from the street to the skywalks by portals while a walker passes beneath', () => {
  const authority = createCampusAuthority();
  assert.equal(authority.enter('walker', L(0), [0.5, 76.8]).surfaceId, 'ground');
  assert.equal(authority.enter('visitor', L(0), [27, 58]).surfaceId, 'ground', 'on P9 outside the T1 entrance');
  // Through the T1 door to the core lobby, then the lift to Floor 4.
  assert.deepEqual(walk(authority, 'visitor', [[27, 58], [24, 58], [12, 56.3]], 0), ['ground', 'T1-F1-hall', 'T1-F1/lobby']);
  for (const [portal, level] of [['T1-F1/lift-up', L(1)], ['T1-F2/lift-up', L(2)], ['T1-F3/lift-up', L(3)]]) {
    const result = authority.usePortal('visitor', portal);
    assert.deepEqual([result.ok, result.levelId, result.position], [true, level, [11.6, 56.3, Number(level.at(-1)) === 3 ? 13 : Number(level.at(-1)) === 2 ? 9 : 5]]);
  }
  assert.deepEqual(walk(authority, 'visitor', [[11.6, 56.3], [12, 57.5], [16, 57.5], [16, 76]], 13), ['T1-F4/lobby', 'T1-F4-core-spur', 'T1-F4-public', 'B12']);
  assert.deepEqual(walk(authority, 'walker', [[0.5, 76.8], [16, 76]], 0), ['ground']);
  // One point, two levels: the walker keeps the ground and standing headroom below the deck.
  const below = authority.move('walker', { position: [16, 76, 0] }), above = authority.move('visitor', { position: [16, 76, 13] });
  assert.deepEqual([below.levelId, below.surfaceId, above.levelId, above.surfaceId], [L(0), 'ground', L(3), 'B12']);
  assert.ok(Math.abs(above.altitude - below.altitude - 13) < 1e-9);
  assert.ok(below.altitude + CAMPUS_BODY.height + CAMPUS_HEADROOM <= above.altitude - LAYOUT.bridges[0].deckZ + LAYOUT.bridges[0].underside);
  // Both skywalks to T3's gallery without a suite; the walker carries on along P2 to P1.
  assert.deepEqual(walk(authority, 'visitor', [[16, 76], [16, 140]], 13), ['B12', 'T2-terrace-4/1', 'T2-F4-public', 'B23', 'T3-F4-public']);
  assert.deepEqual(walk(authority, 'walker', [[16, 76], [31, 76]], 0), ['ground']);
});

test('the authority refuses a forged level or height, a step off the deck, a suite and an unusable portal', () => {
  const authority = createCampusAuthority();
  authority.enter('walker', L(0), [16, 76]);authority.enter('visitor', L(3), [16, 80]);
  const refused = (id, message) => authority.move(id, message).error;
  assert.equal(refused('walker', { position: [16, 76.2, 13], levelId: L(3) }), 'invalid_level', 'a street walker cannot claim the deck level');
  assert.equal(refused('walker', { position: [16, 76.2, 13] }), 'invalid_ground', 'nor the deck height on the ground level');
  assert.equal(refused('visitor', { position: [16, 80.2, 0] }), 'invalid_ground', 'a deck visitor cannot drop to the street');
  assert.equal(refused('visitor', { position: [17.4, 80, 13] }), 'blocked', "the body would overlap B12's east edge guard");
  assert.equal(refused('visitor', { position: [16, 84, 13] }), 'movement_too_fast');
  // Along T2's facade line, where the deck guard ends: a point would slip through, a body cannot.
  authority.move('visitor', { position: [16, 82.5, 13] });walk(authority, 'visitor', [[16, 82.5], [16, 93]], 13);
  assert.equal(refused('visitor', { position: [14.2, 93, 13] }), 'blocked');
  assert.equal(campusSupportAt(L(3), 14.2, 93).surfaceId, 'T2-terrace-4/1', 'the centre alone has terrace support there');
  // A suite is private: the gallery cannot walk into one.
  walk(authority, 'visitor', [[16, 93], [16, 99]], 13);
  const suiteDoor = LAYOUT.towers[1].levels[3].suites.find(suite => suite.door.opensTo === 'T2-F4-public' && Math.abs(suite.door.position[1] - 99) < 3);
  walk(authority, 'visitor', [[16, 99], [16, suiteDoor.door.position[1]], [suiteDoor.door.position[0] + Math.sign(16 - suiteDoor.door.position[0]) * 0.4, suiteDoor.door.position[1]]], 13);
  assert.equal(refused('visitor', { position: [...suiteDoor.door.inside, 13] }), 'private_suite');
  // Portals: on another level, out of reach, or landing inside the shaft.
  assert.equal(authority.usePortal('walker', 'T1-F4/lift-up').error, 'invalid_level_portal');
  assert.equal(authority.usePortal('walker', 'T1-F1/lift-up').error, 'level_portal_out_of_reach');
  const onFace = structuredClone(LAYOUT);for (const t of onFace.towers) t.core.lift.portal = [...t.core.lift.door];
  const old = createCampusAuthority(onFace);
  assert.equal(old.enter('visitor', L(0), [12, 56.3]).ok, true);
  assert.equal(old.usePortal('visitor', 'T1-F1/lift-up').error, 'level_landing_blocked', 'a portal on the shaft face lands the body inside the lift');
});

test('roof access lands outside the headhouse, and a checkpoint restores only on a compatible contract', () => {
  const authority = createCampusAuthority();
  authority.enter('visitor', L(5), [12, 56.3]);
  const roof = authority.usePortal('visitor', 'T1-F6/lift-up');
  assert.deepEqual([roof.ok, roof.levelId, roof.surfaceId, roof.position], [true, L(6), 'T1-roof', [13.6, 58, 25]]);
  assert.deepEqual(walk(authority, 'visitor', [[13.6, 58], [16, 62]], 25), ['T1-roof']);
  authority.enter('walker', L(0), [16, 76]);
  const saved = authority.checkpoint();
  assert.deepEqual(saved.versions, { id: LAYOUT.id, ...LAYOUT.versions });
  const restored = createCampusAuthority();
  assert.deepEqual(restored.restore(structuredClone(saved)), { ok: true });
  assert.deepEqual(restored.move('visitor', { position: [16, 62.2, 25] }).surfaceId, 'T1-roof');
  // A major support change, a renumbered floor set or a position with no support relocates to the street.
  for (const change of [{ support: 2 }, { floors: 2 }, { layout: '4.0' }]) {
    const result = createCampusAuthority().restore({ ...structuredClone(saved), versions: { ...saved.versions, ...change } });
    assert.deepEqual([result.ok, result.relocate], [false, 'street'], JSON.stringify(change));
  }
  assert.equal(createCampusAuthority().restore({ ...saved, versions: { ...saved.versions, layout: '3.9' } }).ok, true, 'a minor layout revision restores');
  const lost = structuredClone(saved);lost.occupants[0].position = [9, 56, 25];
  assert.match(createCampusAuthority().restore(lost).reason, /no support/);
});
