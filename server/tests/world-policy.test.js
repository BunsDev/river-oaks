import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSharedWorld, migrateWorldCheckpoint } from '../world.js';
import { MINUTE_MS } from '../../preview/src/world-policy.js';

// World rules (#596) inside the authoritative town: owner-only changes through the command
// dispatcher, the server clock, one violence decision, and the v14 checkpoint.
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const OWNER = 'owner', VISITOR = 'visitor', OTHER = 'other';
const LANE = [-2910, -1300], SERVICE = [-2800, -1440], PLAZA = [-2790, -1300];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function town({ restore } = {}) {
  const clock = { time: 1_000_000 };
  const world = createSharedWorld(data, { now: () => clock.time, isAdmin: id => id === OWNER });
  if (restore) assert.deepEqual(world.restore(restore), { ok: true });
  for (const id of [OWNER, VISITOR, OTHER]) if (!world.players.has(id)) world.join({ userId: id, name: id });
  const send = (id, message) => world.command(id, message);
  const update = (id, changes, expectedRevision = world.worldPolicy().revision) => send(id, { type: 'worldPolicy', action: 'update', expectedRevision, changes });
  // Trusted geometry fixture: the server's own record of where someone stands.
  const place = (id, [east, north]) => { const player = world.players.get(id);player.position = [east, north, player.position[2]]; };
  const later = ms => { clock.time += ms; };
  return { world, clock, send, update, place, later };
}
const violence = (f, target) => f.world.violenceFor(VISITOR, target);

test('a new town is peaceful, and its rules reach every snapshot', () => {
  const f = town();
  const rules = f.world.snapshot().worldPolicy;
  assert.deepEqual(rules.violence, { mode: 'off', schedule: { start: 1080, end: 360 }, zones: [], pvp: false });
  assert.deepEqual([rules.revision, rules.minute, rules.active, rules.clock.rate], [0, 720, false, 1]);
  f.place(VISITOR, LANE);f.place(OTHER, LANE);
  assert.deepEqual(violence(f, { type: 'player', id: OTHER }), { allowed: false, reason: 'violence_off' });
});

test('only the owner changes the rules; forged identity, time or position fields are refused', () => {
  const f = town();
  const before = f.world.worldPolicy();
  for (const id of [VISITOR, OTHER]) {
    assert.equal(f.update(id, { violence: { mode: 'forced', zones: ['westcreek-lane'] } }).error, 'world_policy_owner_only');
    assert.equal(f.send(id, { type: 'worldPolicy', action: 'emergencyOff' }).error, 'world_policy_owner_only');
  }
  // Claiming to be the owner inside the message changes nothing: identity is the transport's.
  assert.equal(f.send(VISITOR, { type: 'worldPolicy', action: 'update', expectedRevision: 0, userId: OWNER, changes: { violence: { mode: 'forced' } } }).error, 'world_policy_owner_only');
  for (const message of [
    { type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { violence: { mode: 'forced' } }, userId: OWNER },
    { type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { clock: { minute: 60 } }, at: 5 },
    { type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { clock: { dayMs: 0 } } },
    { type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { revision: 9 } },
    { type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { lastChange: { kind: 'initial', revision: 0, at: 0 } } },
    { type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { violence: { zones: ['plaza'] } } },
    { type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { violence: { mode: 'riot' } } },
    { type: 'worldPolicy', action: 'update', expectedRevision: '0', changes: { violence: { mode: 'forced' } } },
    { type: 'worldPolicy', action: 'update', expectedRevision: 0 },
    { type: 'worldPolicy', action: 'emergencyOff', position: [0, 0] },
    { type: 'worldPolicy', action: 'reset' },
  ]) assert.equal(f.send(OWNER, message).error, 'invalid_world_policy', JSON.stringify(message));
  assert.deepEqual(f.world.worldPolicy(), before, 'refusals change nothing');
});

test('owner updates are revisioned, conflict-checked and rate limited; emergency off is not', () => {
  const f = town();
  const first = f.update(OWNER, { violence: { mode: 'forced', zones: ['westcreek-lane'] } });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.deepEqual([first.worldPolicy.revision, first.worldPolicy.lastChange.kind, first.worldPolicy.active], [1, 'update', true]);
  assert.equal(f.update(OWNER, { violence: { pvp: true } }).error, 'world_policy_cooldown');
  f.later(1000);
  const stale = f.update(OWNER, { violence: { pvp: true } }, 0);
  assert.equal(stale.error, 'world_policy_conflict');
  assert.equal(stale.worldPolicy.revision, 1, 'a conflict returns the rules to review');
  // Emergency off lands at once, inside the cooldown, without a revision.
  assert.equal(f.update(OWNER, { violence: { pvp: true } }).ok, true);
  const off = f.send(OWNER, { type: 'worldPolicy', action: 'emergencyOff' });
  assert.deepEqual([off.ok, off.worldPolicy.violence.mode, off.worldPolicy.violence.pvp, off.worldPolicy.lastChange.kind, off.worldPolicy.revision], [true, 'off', false, 'emergency_off', 3]);
  assert.deepEqual(off.worldPolicy.violence.zones, ['westcreek-lane'], 'zones stay configured for later');
  assert.equal(f.send(OWNER, { type: 'worldPolicy', action: 'emergencyOff' }).worldPolicy.revision, 3, 'repeating it is harmless');
  // Even an empty command budget cannot hold emergency off back.
  f.later(1000);f.update(OWNER, { violence: { mode: 'forced' } });
  for (let i = 0; i < 20; i++) f.send(OWNER, { type: 'chat', text: `spam ${i}` });
  assert.equal(f.update(OWNER, { violence: { pvp: true } }).error, 'rate_limited');
  assert.equal(f.send(OWNER, { type: 'worldPolicy', action: 'emergencyOff' }).worldPolicy.violence.mode, 'off');
});

test('violence uses server positions and clock: zones, edges, PvP, safe ground and emergency off', () => {
  const f = town();
  f.place(VISITOR, LANE);f.place(OTHER, LANE);
  const resident = f.world.state.locals.find(local => !local.indoor);
  resident.position = [LANE[0], LANE[1] + 2, resident.position[2]];
  const other = { type: 'player', id: OTHER }, local = { type: 'resident', id: resident.id };
  assert.equal(f.update(OWNER, { violence: { mode: 'scheduled', zones: ['westcreek-lane'] }, clock: { minute: 17 * 60 + 59, rate: 0 } }).ok, true);
  assert.equal(violence(f, local).reason, 'outside_hours', '17:59 is before the 18:00 window');
  f.later(1000);assert.equal(f.update(OWNER, { clock: { minute: 18 * 60 } }).ok, true);
  assert.deepEqual(violence(f, local), { allowed: true, reason: 'allowed', zoneId: 'westcreek-lane' });
  assert.equal(violence(f, other).reason, 'pvp_off');
  f.place(OTHER, SERVICE);f.later(1000);f.update(OWNER, { violence: { pvp: true } });
  assert.equal(violence(f, other).reason, 'zone_boundary', 'no attack across a zone boundary');
  f.place(OTHER, PLAZA);assert.equal(violence(f, other).reason, 'safe_zone');
  f.place(OTHER, LANE);assert.equal(violence(f, other).allowed, true);
  f.place(VISITOR, [-2902, LANE[1]]);assert.equal(violence(f, other).reason, 'not_danger_zone', 'the max edge is outside the lane');
  f.place(VISITOR, LANE);
  assert.equal(violence(f, { type: 'player', id: VISITOR }).reason, 'invalid_target');
  assert.equal(violence(f, { type: 'player', id: 'nobody' }).reason, 'invalid_target');
  assert.equal(violence(f, { type: 'building', id: 'x' }).reason, 'invalid_target');
  assert.equal(f.world.violenceFor('nobody', other).reason, 'invalid_attacker');
  // Emergency off takes effect before the very next decision.
  f.send(OWNER, { type: 'worldPolicy', action: 'emergencyOff' });
  assert.equal(violence(f, local).reason, 'violence_off');
  assert.equal(violence(f, other).reason, 'violence_off');
});

test('the clock advances only with server steps, wraps at midnight, and does not move resident routines', () => {
  const f = town();
  assert.equal(f.update(OWNER, { clock: { minute: 23 * 60 + 59, rate: 60 } }).ok, true);
  f.world.step(0.25);f.world.step(0.25);f.world.step(0.25);f.world.step(0.25);
  const rules = f.world.worldPolicy();
  assert.deepEqual([rules.clock.dayMs, rules.minute], [0, 0], '1 s at 60x is one world minute, past midnight');
  // A step larger than the transport's bound advances the clock no further than the town.
  f.world.step(10);assert.equal(f.world.worldPolicy().clock.dayMs, 15_000);
  // The same town at noon and at 23:00 walks its residents identically: routines ignore the clock.
  const noon = town(), night = town();
  night.update(OWNER, { clock: { minute: 23 * 60, rate: 0 } });
  for (let i = 0; i < 40; i++) { noon.world.step(0.25);night.world.step(0.25); }
  const walk = f => f.world.snapshot().locals.map(local => [local.id, local.position, local.life?.action ?? null]);
  assert.deepEqual(walk(night), walk(noon));
  assert.ok(noon.world.snapshot().locals.some(local => local.life && local.life.action !== 'pause'), 'residents keep moving at night');
});

test('v14 checkpoints keep the rules; v13 towns restore peaceful with everything else intact', () => {
  const f = town();
  f.update(OWNER, { violence: { mode: 'scheduled', zones: ['south-service-lane'], pvp: true }, clock: { minute: 300, rate: 5 } });
  f.send(VISITOR, { type: 'chat', text: 'still here' });
  const saved = f.world.checkpoint();
  assert.equal(saved.version, 16);
  const back = town({ restore: saved });
  assert.deepEqual(back.world.worldPolicy(), f.world.worldPolicy());
  // A v13 town, as an older writer committed it: no rules at all.
  const { worldPolicy, ...payload } = structuredClone(saved.payload);
  const envelope = { version: 13, worldId: saved.worldId, worldFingerprint: saved.worldFingerprint, payload };
  const legacy = { ...envelope, checksum: digest(envelope) };
  const old = town({ restore: legacy });
  assert.deepEqual(old.world.worldPolicy().violence, { mode: 'off', schedule: { start: 1080, end: 360 }, zones: [], pvp: false });
  assert.deepEqual(old.world.snapshot().chat.map(entry => entry.text), ['still here'], 'unrelated state survives');
  assert.deepEqual(old.world.snapshot().locals.map(local => local.id), f.world.snapshot().locals.map(local => local.id));
  // Mismatched or malformed rules never restore, and a refused restore changes nothing.
  const seal = value => ({ ...value, checksum: digest({ version: value.version, worldId: value.worldId, worldFingerprint: value.worldFingerprint, payload: value.payload }) });
  const live = town();
  const before = live.world.checkpoint();
  for (const bad of [
    seal({ ...envelope, payload: { ...payload, worldPolicy } }),
    seal({ ...envelope, version: 14 }),
    seal({ ...envelope, version: 14, payload: { ...payload, worldPolicy: { ...worldPolicy, violence: { ...worldPolicy.violence, mode: 'riot' } } } }),
    seal({ ...envelope, version: 14, payload: { ...payload, worldPolicy: { ...worldPolicy, clock: { dayMs: -1, rate: 1 } } } }),
  ]) {
    assert.deepEqual(live.world.restore(bad), { ok: false, error: 'invalid_checkpoint', message: 'invalid_checkpoint' });
    assert.deepEqual(live.world.checkpoint(), before);
  }
});

test('moving the town to a new geography keeps its rules', () => {
  const f = town();
  f.update(OWNER, { violence: { mode: 'forced', zones: ['westcreek-lane'] } });
  const moved = migrateWorldCheckpoint({ fromData: data, toData: { ...data, walkSurfaceOffset: data.walkSurfaceOffset }, checkpoint: f.world.checkpoint(), isAdmin: id => id === OWNER });
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.checkpoint.payload.worldPolicy, f.world.checkpoint().payload.worldPolicy);
});

test('rules change no social behaviour: chat, gestures and travel work with violence on and after emergency off', () => {
  const f = town();
  f.update(OWNER, { violence: { mode: 'forced', zones: ['westcreek-lane', 'south-service-lane'], pvp: true } });
  assert.equal(f.send(VISITOR, { type: 'chat', text: 'hello' }).ok, true);
  assert.equal(f.send(VISITOR, { type: 'gesture', kind: 'wave' }).ok, true);
  f.send(OWNER, { type: 'worldPolicy', action: 'emergencyOff' });
  f.later(2000);
  assert.equal(f.send(OTHER, { type: 'chat', text: 'still peaceful' }).ok, true);
  assert.equal(f.send(OTHER, { type: 'gesture', kind: 'bow' }).ok, true);
  assert.equal(f.send(VISITOR, { type: 'atmosphere', hour: 23 }).error, 'invalid_command', 'there is no command for the local light');
  assert.equal(f.world.worldPolicy().minute, 720, 'only the owner moves the shared clock');
  assert.equal(MINUTE_MS, 60_000);
});
