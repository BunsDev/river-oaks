import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_MS, GAMEPLAY_ZONES, MINUTE_MS, advanceClock, clockMinute, dangerActive, defaultWorldPolicy, evaluateViolence, proposePolicy, riskAt, validateWorldPolicy, withinSchedule, zoneAt } from '../src/world-policy.js';
import { createWalkingEnvironment } from '../src/walking.js';

const W = 'river-oaks';
const district = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const street = (east, north) => ({ position: [east, north, 18], levelId: null, indoors: false });
const player = (east, north, extra = {}) => ({ type: 'player', ...street(east, north), ...extra });
const resident = (east, north, extra = {}) => ({ type: 'resident', ...street(east, north), ...extra });
const policy = (violence = {}, clock = {}) => {
  const value = defaultWorldPolicy();
  Object.assign(value.violence, { mode: 'forced', zones: ['westcreek-lane', 'south-service-lane'] }, violence);
  Object.assign(value.clock, clock);
  return value;
};
const at = minute => ({ dayMs: minute * MINUTE_MS });
const verdict = (value, attacker, target) => evaluateViolence({ worldId: W, policy: value, attacker, target });
// Inside Westcreek Lane and the south service lane, well clear of their edges.
const lane = [-2910, -1300], service = [-2800, -1440];

test('the default policy is peaceful and every place reads as peaceful', () => {
  const value = defaultWorldPolicy();
  assert.deepEqual(value.violence, { mode: 'off', schedule: { start: 1080, end: 360 }, zones: [], pvp: false });
  assert.deepEqual(validateWorldPolicy(value, W), value);
  assert.deepEqual(verdict(value, player(...lane), resident(...lane)), { allowed: false, reason: 'violence_off' });
  assert.equal(riskAt(W, value, street(...lane)).level, 'peaceful');
});

test('schedule windows wrap past midnight, are half-open and an equal start and end is never open', () => {
  const night = { start: 1080, end: 360 };
  assert.deepEqual([1079, 1080, 1439, 0, 359, 360, 720].map(minute => withinSchedule(minute, night)), [false, true, true, true, true, false, false]);
  const day = { start: 540, end: 1020 };
  assert.deepEqual([539, 540, 1019, 1020].map(minute => withinSchedule(minute, day)), [false, true, true, false]);
  assert.equal(withinSchedule(600, { start: 600, end: 600 }), false);
  for (const minute of [-1, 1440, 1.5, NaN, '600', null]) assert.equal(withinSchedule(minute, night), false, String(minute));
  for (const schedule of [null, {}, { start: 0 }, { start: 0, end: 1440 }, { start: -1, end: 5 }]) assert.equal(withinSchedule(10, schedule), false);
});

test('the clock advances by whole milliseconds at its rate and wraps at midnight', () => {
  assert.deepEqual(advanceClock({ dayMs: DAY_MS - 30_000, rate: 1 }, 60), { dayMs: 30_000, rate: 1 });
  assert.deepEqual(advanceClock({ dayMs: 0, rate: 60 }, 60), { dayMs: 60 * MINUTE_MS, rate: 60 });
  assert.deepEqual(advanceClock({ dayMs: 1000, rate: 0 }, 1000), { dayMs: 1000, rate: 0 }, 'rate 0 holds the time');
  for (const bad of [0, -1, NaN, Infinity]) assert.deepEqual(advanceClock({ dayMs: 5, rate: 1 }, bad), { dayMs: 5, rate: 1 });
  // Many small steps equal one large one: integer milliseconds do not drift.
  let clock = { dayMs: 23 * 60 * MINUTE_MS, rate: 7 };
  for (let i = 0; i < 4000; i++) clock = advanceClock(clock, 0.05);
  assert.deepEqual(clock, advanceClock({ dayMs: 23 * 60 * MINUTE_MS, rate: 7 }, 200));
  assert.equal(clockMinute({ dayMs: 61 * MINUTE_MS - 1 }), 60);
});

test('zone edges are half-open, safe zones win, and indoors or upper levels are safe', () => {
  const [minEast, minNorth, maxEast, maxNorth] = GAMEPLAY_ZONES[W].find(zone => zone.id === 'westcreek-lane').rect;
  assert.equal(zoneAt(W, street(minEast, minNorth)).id, 'westcreek-lane', 'min edges are inside');
  assert.notEqual(zoneAt(W, street(maxEast, -1300)).id, 'westcreek-lane', 'the max east edge is outside');
  assert.notEqual(zoneAt(W, street(-2910, maxNorth)).id, 'westcreek-lane', 'the max north edge is outside');
  // The two lanes meet at east -2902 without sharing a point.
  assert.equal(zoneAt(W, street(-2902.0001, -1440)).id, 'westcreek-lane');
  assert.equal(zoneAt(W, street(-2902, -1440)).id, 'south-service-lane');
  assert.deepEqual(zoneAt(W, street(-2790, -1300)), { kind: 'safe', id: 'plaza', name: 'Plaza' });
  assert.equal(zoneAt(W, { ...street(...lane), indoors: true }).kind, 'safe');
  assert.equal(zoneAt(W, { ...street(...lane), levelId: 'garage/l2' }).kind, 'safe');
  assert.equal(zoneAt(W, street(-2765, -1295)).kind, 'none', 'the walk spawn is ordinary street');
  assert.equal(zoneAt('starter-world', street(...lane)).kind, 'none', 'other worlds have no authored zones');
  for (const place of [null, { position: [NaN, 0], levelId: null, indoors: false }, { position: [0, 0], indoors: false }, { position: [0, 0], levelId: null }])
    assert.equal(zoneAt(W, place).kind, 'safe', 'an unreadable place is treated as safe');
});

test('authored zones match the district: danger zones avoid every footprint and room, safe zones sit where they say', () => {
  const environment = createWalkingEnvironment(district);
  const footprints = district.buildings.map(building => building.ring);
  const contains = (ring, [x, y]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  for (const zone of GAMEPLAY_ZONES[W].filter(item => item.kind === 'danger')) {
    const [minEast, minNorth, maxEast, maxNorth] = zone.rect;
    let open = 0;
    for (let east = minEast; east < maxEast; east += 1) for (let north = minNorth; north < maxNorth; north += 1) {
      assert.equal(footprints.some(ring => contains(ring, [east, north])), false, `${zone.id} reaches a building at ${east},${north}`);
      assert.equal(environment.roomAt(east, -north), null, `${zone.id} reaches a room at ${east},${north}`);
      if (environment.isFree(east, -north)) open++;
    }
    assert.ok(open > 100, `${zone.id} is walkable street (${open} free samples)`);
  }
  const plaza = GAMEPLAY_ZONES[W].find(zone => zone.id === 'plaza').rect;
  assert.ok(plaza[0] < -2797 && plaza[2] > -2781 && plaza[1] < -1304 && plaza[3] > -1296, 'the plaza zone holds the salon furniture');
});

test('one fail-closed rule decides violence: hours, zones, boundaries, PvP and safe ground', () => {
  const night = policy({ mode: 'scheduled' }, at(23 * 60));
  assert.deepEqual(verdict(night, player(...lane), resident(...lane)), { allowed: true, reason: 'allowed', zoneId: 'westcreek-lane' });
  assert.equal(verdict({ ...night, clock: { ...night.clock, ...at(12 * 60) } }, player(...lane), resident(...lane)).reason, 'outside_hours');
  assert.equal(verdict(night, player(...lane), player(...lane)).reason, 'pvp_off');
  assert.equal(verdict(policy({ pvp: true }), player(...lane), player(...lane)).allowed, true);
  assert.equal(verdict(night, player(...lane), resident(...service)).reason, 'zone_boundary', 'across two danger zones');
  assert.equal(verdict(night, player(-2765, -1295), resident(...lane)).reason, 'not_danger_zone', 'from ordinary street into a zone');
  assert.equal(verdict(night, player(...lane), resident(-2790, -1300)).reason, 'safe_zone', 'never into a safe zone');
  assert.equal(verdict(night, player(-2790, -1300), resident(...lane)).reason, 'safe_zone', 'never out of a safe zone');
  assert.equal(verdict(night, player(...lane, { indoors: true }), resident(...lane)).reason, 'safe_zone');
  assert.equal(verdict(policy({ zones: ['south-service-lane'] }), player(...lane), resident(...lane)).reason, 'zone_disabled');
  for (const attacker of [null, resident(...lane), { ...player(...lane), type: 'admin' }, player(NaN, 0), { type: 'player', position: lane, indoors: false }])
    assert.equal(verdict(night, attacker, resident(...lane)).reason, 'invalid_attacker');
  for (const target of [null, { ...resident(...lane), type: 'building' }, resident(0, Infinity)])
    assert.equal(verdict(night, player(...lane), target).reason, 'invalid_target');
  for (const bad of [null, { ...night, extra: 1 }, { ...night, violence: { ...night.violence, mode: 'riot' } },
    { ...night, violence: { ...night.violence, zones: ['plaza'] } }, { ...night, violence: { ...night.violence, zones: ['westcreek-lane', 'westcreek-lane'] } },
    { ...night, violence: { ...night.violence, pvp: 'no' } }, { ...night, clock: { dayMs: DAY_MS, rate: 1 } }, { ...night, clock: { dayMs: 0, rate: 61 } },
    { ...night, revision: -1 }, { ...night, lastChange: { kind: 'update', revision: night.revision + 1, at: 0 } }])
    assert.equal(verdict(bad, player(...lane), resident(...lane)).reason, 'invalid_policy', JSON.stringify(bad));
  // Another world has no zones, so nothing there is dangerous even when forced.
  assert.equal(evaluateViolence({ worldId: 'starter-world', policy: { ...policy(), violence: { ...policy().violence, zones: [] } }, attacker: player(...lane), target: resident(...lane) }).reason, 'not_danger_zone');
});

test('players are told the risk where they stand, including a zone that wakes later', () => {
  const night = policy({ mode: 'scheduled', zones: ['westcreek-lane'] }, at(23 * 60));
  assert.equal(riskAt(W, night, street(...lane)).level, 'danger');
  assert.equal(riskAt(W, { ...night, clock: { ...night.clock, ...at(9 * 60) } }, street(...lane)).level, 'danger_later');
  assert.equal(riskAt(W, night, street(...service)).level, 'peaceful', 'a zone the owner did not enable');
  assert.equal(riskAt(W, night, street(-2790, -1300)).level, 'safe');
  assert.equal(riskAt(W, { garbage: true }, street(...lane)).level, 'peaceful');
});

test('owner proposals change only clock and violence fields and are validated as a whole', () => {
  const current = defaultWorldPolicy();
  const next = proposePolicy(current, { clock: { minute: 1439, rate: 0 }, violence: { mode: 'scheduled', zones: ['south-service-lane', 'westcreek-lane'] } }, W);
  assert.deepEqual(next.clock, { dayMs: 1439 * MINUTE_MS, rate: 0 });
  assert.deepEqual(next.violence.zones, ['westcreek-lane', 'south-service-lane'], 'zones keep their authored order');
  assert.deepEqual(current, defaultWorldPolicy(), 'the current policy is not mutated');
  for (const changes of [null, {}, [], { revision: 9 }, { lastChange: {} }, { clock: {} }, { clock: { minute: 1440 } }, { clock: { minute: 1.5 } },
    { clock: { dayMs: 5 } }, { clock: { rate: -1 } }, { violence: {} }, { violence: { mode: 'riot' } }, { violence: { zones: ['nowhere'] } },
    { violence: { schedule: { start: 60 } } }, { violence: { pvp: 1 } }, JSON.parse('{"__proto__":{"pvp":true}}'), JSON.parse('{"violence":{"__proto__":{"mode":"forced"}}}')])
    assert.equal(proposePolicy(current, changes, W), null, JSON.stringify(changes));
  assert.equal(dangerActive(next, 1300), true);
});
