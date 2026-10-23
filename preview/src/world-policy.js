// The world's gameplay policy (#596): a server-owned clock and the rule that says
// where and when violence may happen. Shared by the town (server/world.js), which
// alone decides, and the browser, which only shows the status it was sent.
// See docs/world-policy.md. Pure: no time, randomness or I/O of its own.
//
// Positions are [east, north, height] metres, as in the town. A level ID of null is
// the street. Peace is the default: violence is off until the owner turns it on, and
// every malformed input is refused rather than guessed at.

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;
export const MINUTES_PER_DAY = 1440;
export const MAX_CLOCK_RATE = 60;
export const VIOLENCE_MODES = Object.freeze(['off', 'scheduled', 'forced']);
export const ATTACKER_TYPES = Object.freeze(['player']);
export const TARGET_TYPES = Object.freeze(['resident', 'player']);
export const POLICY_CHANGES = Object.freeze(['initial', 'update', 'emergency_off']);

// Authored gameplay zones, by world. Rectangles are [minEast, minNorth, maxEast, maxNorth]
// and half-open: a point on a min edge is inside, on a max edge outside, so neighbouring
// zones never share a point. Measured from preview/public/data/district.json:
// - Westcreek Lane: the residential lane along the district's west edge (centreline
//   east -2911..-2897), stopping short of the west building (footprint from east -2901.4).
// - South service lane: the back-of-house access lane along the south edge (centreline
//   north -1436..-1430), south of the south and west footprints (from north -1423.5).
// - Plaza: the salon plaza's tables, stage and bench (east -2797..-2781, north -1304..-1296).
// - The Gardens: the campus ground plates and grounds (east -2718..-2692, north -1359..-1199).
// Safe zones always win; indoors and every upper level are safe as well.
export const GAMEPLAY_ZONES = Object.freeze({
  'river-oaks': Object.freeze([
    Object.freeze({ id: 'westcreek-lane', name: 'Westcreek Lane', kind: 'danger', levelId: null, rect: Object.freeze([-2920, -1458, -2902, -1181]) }),
    Object.freeze({ id: 'south-service-lane', name: 'South service lane', kind: 'danger', levelId: null, rect: Object.freeze([-2902, -1458, -2689, -1425]) }),
    Object.freeze({ id: 'plaza', name: 'Plaza', kind: 'safe', levelId: null, rect: Object.freeze([-2803, -1308, -2778, -1292]) }),
    Object.freeze({ id: 'gardens', name: 'The Gardens', kind: 'safe', levelId: null, rect: Object.freeze([-2719, -1360, -2691, -1198]) }),
  ]),
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactly = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const minuteOfDay = value => Number.isSafeInteger(value) && value >= 0 && value < MINUTES_PER_DAY;
const count = value => Number.isSafeInteger(value) && value >= 0;

export const zonesFor = worldId => GAMEPLAY_ZONES[worldId] ?? [];
export const dangerZoneIds = worldId => zonesFor(worldId).filter(zone => zone.kind === 'danger').map(zone => zone.id);

/** Peaceful by default: violence off, no zones enabled, no PvP; the clock at noon, real time. */
export function defaultWorldPolicy() {
  return {
    revision: 0,
    clock: { dayMs: 12 * 60 * MINUTE_MS, rate: 1 },
    violence: { mode: 'off', schedule: { start: 18 * 60, end: 6 * 60 }, zones: [], pvp: false },
    lastChange: { kind: 'initial', revision: 0, at: 0 },
  };
}

/** Strictly validates a stored or proposed policy for a world. Returns a fresh copy, or null. */
export function validateWorldPolicy(value, worldId) {
  if (!exactly(value, ['revision', 'clock', 'violence', 'lastChange']) || !count(value.revision)) return null;
  const { clock, violence, lastChange } = value;
  if (!exactly(clock, ['dayMs', 'rate']) || !Number.isSafeInteger(clock.dayMs) || clock.dayMs < 0 || clock.dayMs >= DAY_MS
    || !Number.isSafeInteger(clock.rate) || clock.rate < 0 || clock.rate > MAX_CLOCK_RATE) return null;
  if (!exactly(violence, ['mode', 'schedule', 'zones', 'pvp']) || !VIOLENCE_MODES.includes(violence.mode)
    || typeof violence.pvp !== 'boolean' || !exactly(violence.schedule, ['start', 'end'])
    || !minuteOfDay(violence.schedule.start) || !minuteOfDay(violence.schedule.end)) return null;
  const known = dangerZoneIds(worldId);
  if (!Array.isArray(violence.zones) || violence.zones.length > known.length
    || !violence.zones.every((id, index) => known.includes(id) && violence.zones.indexOf(id) === index)) return null;
  if (!exactly(lastChange, ['kind', 'revision', 'at']) || !POLICY_CHANGES.includes(lastChange.kind)
    || !count(lastChange.revision) || lastChange.revision > value.revision || !Number.isFinite(lastChange.at) || lastChange.at < 0) return null;
  return {
    revision: value.revision,
    clock: { dayMs: clock.dayMs, rate: clock.rate },
    // Zones keep the authored order, so equal policies serialize equally.
    violence: { mode: violence.mode, schedule: { start: violence.schedule.start, end: violence.schedule.end }, zones: known.filter(id => violence.zones.includes(id)), pvp: violence.pvp },
    lastChange: { kind: lastChange.kind, revision: lastChange.revision, at: lastChange.at },
  };
}

/** Advances the clock by real seconds at its rate, wrapping at midnight. Integer milliseconds keep it exact. */
export function advanceClock(clock, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return { ...clock };
  const step = Math.round(seconds * 1000) * clock.rate;
  return { dayMs: (clock.dayMs + step % DAY_MS) % DAY_MS, rate: clock.rate };
}

export const clockMinute = clock => Math.floor(clock.dayMs / MINUTE_MS);

/** A schedule window [start, end) in minutes of the day; it may wrap past midnight. Equal ends are empty. */
export function withinSchedule(minute, schedule) {
  if (!minuteOfDay(minute) || !record(schedule) || !minuteOfDay(schedule.start) || !minuteOfDay(schedule.end)) return false;
  const { start, end } = schedule;
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Whether the policy permits violence anywhere at this moment (zones still decide where). */
export function dangerActive(policy, minute = clockMinute(policy.clock)) {
  if (policy.violence.mode === 'forced') return true;
  return policy.violence.mode === 'scheduled' && withinSchedule(minute, policy.violence.schedule);
}

const validPlace = place => record(place) && Array.isArray(place.position) && place.position.length >= 2
  && Number.isFinite(place.position[0]) && Number.isFinite(place.position[1])
  && (place.levelId === null || typeof place.levelId === 'string') && typeof place.indoors === 'boolean';
const inside = (rect, [east, north]) => east >= rect[0] && north >= rect[1] && east < rect[2] && north < rect[3];

/** The zone a place stands in: safe (indoors, an upper level or an authored safe zone), danger, or none. */
export function zoneAt(worldId, place) {
  if (!validPlace(place)) return { kind: 'safe', id: null, name: null };
  if (place.indoors) return { kind: 'safe', id: 'indoors', name: 'Indoors' };
  const here = zonesFor(worldId).filter(zone => zone.levelId === place.levelId && inside(zone.rect, place.position));
  const zone = here.find(item => item.kind === 'safe') ?? here.find(item => item.kind === 'danger');
  if (zone) return { kind: zone.kind, id: zone.id, name: zone.name };
  // Interior and upper levels are never dangerous unless a zone names them.
  return place.levelId === null ? { kind: 'none', id: null, name: null } : { kind: 'safe', id: 'level', name: 'Indoors' };
}

/**
 * The one rule (#596): may this attacker harm this target now? Both must stand in the same
 * enabled danger zone, during an active window, outside every safe zone; a player target also
 * needs PvP. Everything the server cannot vouch for refuses. Callers pass server state only.
 */
export function evaluateViolence({ worldId, policy, attacker, target }) {
  const valid = validateWorldPolicy(policy, worldId);
  if (!valid) return { allowed: false, reason: 'invalid_policy' };
  if (!record(attacker) || !ATTACKER_TYPES.includes(attacker.type) || !validPlace(attacker)) return { allowed: false, reason: 'invalid_attacker' };
  if (!record(target) || !TARGET_TYPES.includes(target.type) || !validPlace(target)) return { allowed: false, reason: 'invalid_target' };
  if (valid.violence.mode === 'off') return { allowed: false, reason: 'violence_off' };
  if (!dangerActive(valid)) return { allowed: false, reason: 'outside_hours' };
  if (target.type === 'player' && !valid.violence.pvp) return { allowed: false, reason: 'pvp_off' };
  const from = zoneAt(worldId, attacker), to = zoneAt(worldId, target);
  if (from.kind === 'safe' || to.kind === 'safe') return { allowed: false, reason: 'safe_zone' };
  if (from.kind !== 'danger' || to.kind !== 'danger') return { allowed: false, reason: 'not_danger_zone' };
  if (from.id !== to.id) return { allowed: false, reason: 'zone_boundary' };
  if (!valid.violence.zones.includes(from.id)) return { allowed: false, reason: 'zone_disabled' };
  return { allowed: true, reason: 'allowed', zoneId: from.id };
}

/** What a player is told about where they stand: peaceful, safe, or in an active danger zone. */
export function riskAt(worldId, policy, place) {
  const valid = validateWorldPolicy(policy, worldId);
  const zone = zoneAt(worldId, place);
  if (!valid || valid.violence.mode === 'off') return { level: 'peaceful', zone };
  if (zone.kind === 'safe') return { level: 'safe', zone };
  const enabled = zone.kind === 'danger' && valid.violence.zones.includes(zone.id);
  return { level: enabled && dangerActive(valid) ? 'danger' : enabled ? 'danger_later' : 'peaceful', zone };
}

/**
 * Applies an owner's proposed changes to the current policy, or explains the refusal.
 * Only these fields may change; identity, time stamps and revisions belong to the server.
 */
export function proposePolicy(current, changes, worldId) {
  if (!record(changes) || !Object.keys(changes).length
    || !Object.keys(changes).every(key => ['clock', 'violence'].includes(key))) return null;
  const next = structuredClone(current);
  if (Object.hasOwn(changes, 'clock')) {
    const clock = changes.clock;
    if (!record(clock) || !Object.keys(clock).length || !Object.keys(clock).every(key => ['minute', 'rate'].includes(key))) return null;
    if (Object.hasOwn(clock, 'minute')) {
      if (!minuteOfDay(clock.minute)) return null;
      next.clock.dayMs = clock.minute * MINUTE_MS;
    }
    if (Object.hasOwn(clock, 'rate')) next.clock.rate = clock.rate;
  }
  if (Object.hasOwn(changes, 'violence')) {
    const violence = changes.violence;
    if (!record(violence) || !Object.keys(violence).length || !Object.keys(violence).every(key => ['mode', 'schedule', 'zones', 'pvp'].includes(key))) return null;
    Object.assign(next.violence, structuredClone(violence));
  }
  return validateWorldPolicy(next, worldId);
}
