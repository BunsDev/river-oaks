import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COMBAT_KINDS, COMBAT_TIMING, COMBAT_TURN_RATE, advanceCombat, applyCombatPose, combatFacing, combatFocusFor, combatStateFor,
  createCombatBlend, createCombatReader, createLocalCombat, facingYaw } from '../src/combat-motion.js';
import { CRIME_RULES } from '../../server/crime.js';
import { POLICE_RULES } from '../../server/police.js';
import { AVATAR_PROFILES, instantiateAvatar } from '../src/avatars.js';
import { createFootPlacement } from '../src/foot-placement.js';
import { localLocomotion } from '../src/locomotion-handoff.js';
import { stepWalking } from '../src/walking.js';
import { turnToward } from '../src/gait.js';
import { loadCharacterRig } from './helpers/character-rig.js';

// #640 presentation: the client animates only phases the town's snapshot reports. Town
// coordinates are [east, north, elevation]; scene x = east, z = -north.
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sameVector = (a, b, eps = 1e-9) => a && b && a.length === b.length && a.every((value, i) => near(value, b[i], eps));
const rival = (change = {}) => ({ id: 'rival:westcreek', name: 'Westcreek rival', appearance: 'sable-human', position: [-2908, -1320, 17.8], yaw: Math.PI / 2,
  health: 100, maxHealth: 100, incapacitated: false, staggered: false, engagedId: null, ...change });
// A player 1.2 m east of the rival; the town turns an engaged rival to face them (camera-style yaw).
const ENGAGED_YAW = -Math.PI / 2;
const strike = (change = {}) => ({ id: 'strike:1', kind: 'strike', actorId: 'a', targetId: 'rival:westcreek', phase: 'windup', remainingMs: 300, outcome: null, reason: null, direction: [-1, 0], ...change });
const counter = (change = {}) => ({ id: 'counter:2', kind: 'counter', actorId: 'rival:westcreek', targetId: 'a', phase: 'windup', remainingMs: 750, outcome: null, reason: null, direction: [1, 0], ...change });
const officer = (change = {}) => ({ id: 'police:0', position: [-2905.4, -1320, 17.8], yaw: -Math.PI / 2, targetId: 'a', state: 'pursue', ...change });
const crimeOf = (actions = [], targets = [rival()]) => ({ targets, wanted: [], actions });
const policeOf = (units = [], change = {}) => ({ units, surrendered: [], subdued: [], eligible: [], ...change });
const HIT = { damage: 25, health: 75, incapacitated: false, stars: 1 };
const S = COMBAT_TIMING.strike, C = COMBAT_TIMING.counter;

test('display timing mirrors the town\'s proposed tuning; the snapshot phase stays the authority', () => {
  assert.deepEqual([S.windup, S.contact, S.length], [CRIME_RULES.strikeWindupMs, CRIME_RULES.contactMs, CRIME_RULES.cooldownMs]);
  assert.deepEqual([C.windup, C.contact, C.length], [CRIME_RULES.counterWindupMs, CRIME_RULES.contactMs, CRIME_RULES.counterMs]);
  assert.equal(COMBAT_TIMING.grab, POLICE_RULES.grabWindupMs);
  assert.equal(COMBAT_TIMING.rivalStagger, CRIME_RULES.hitReactionMs);
  assert.equal(COMBAT_TIMING.playerStagger, CRIME_RULES.staggerMs);
  assert.equal(COMBAT_TIMING.evade, CRIME_RULES.evadeMs);
  assert.deepEqual([...COMBAT_KINDS].sort(), ['arrest', 'counter', 'down', 'evade', 'flinch', 'grab', 'strike', 'surrender']);
  assert.ok(C.windup >= 2 * S.windup, 'a rival\'s telegraph is clearly slower than a strike');
});

test('a strike reads its phase from the snapshot; a late snapshot advances to the current phase and never replays an earlier one', () => {
  const start = combatStateFor('a', { crime: crimeOf([strike()]) });
  assert.equal(start.kind, 'strike'); assert.equal(start.id, 'strike:1'); assert.ok(near(start.progress, 0));
  assert.ok(sameVector(start.facing, [-1, 0]), 'the swing faces where the town fixed it'); assert.equal(start.durationMs, S.length);
  const mid = combatStateFor('a', { crime: crimeOf([strike({ remainingMs: 100 })]) });
  assert.ok(near(mid.progress, (S.windup - 100) / S.length));
  // The same windup snapshot, 250 ms after it arrived, is already past contact.
  const late = combatStateFor('a', { crime: crimeOf([strike({ remainingMs: 100 })]), ageMs: 250 });
  assert.ok(near(late.progress, (S.windup - 100 + 250) / S.length));
  assert.ok(late.progress > (S.windup + S.contact) / S.length);
  // A recovery snapshot never reads as windup or contact, whatever its age or remainder.
  for (const [remainingMs, ageMs] of [[480, 0], [5000, 0], [200, 100], [0, 0]]) {
    const state = combatStateFor('a', { crime: crimeOf([strike({ phase: 'recovery', remainingMs, outcome: 'hit', effect: HIT })]), ageMs });
    if (state?.kind) assert.ok(state.progress >= (S.windup + S.contact) / S.length - 1e-9, `${remainingMs}/${ageMs}: ${state.progress}`);
  }
  // Past its end the swing is over: nothing replays.
  assert.equal(combatStateFor('a', { crime: crimeOf([strike({ phase: 'recovery', remainingMs: 100, outcome: 'miss', reason: 'attack_out_of_reach' })]), ageMs: 150 })?.kind ?? null, null);
  // Ageing one snapshot only moves forward.
  let before = -1;
  for (let ageMs = 0; ageMs < S.length; ageMs += 25) {
    const progress = combatStateFor('a', { crime: crimeOf([strike()]), ageMs })?.progress ?? 1;
    assert.ok(progress >= before); before = progress;
  }
  // Cancelled or finished actions show nothing.
  assert.equal(combatStateFor('a', { crime: crimeOf([strike({ phase: 'done', remainingMs: 0, outcome: 'cancelled', reason: 'violence_off' })]) }), null);
  assert.equal(combatStateFor('a', { crime: crimeOf([strike({ phase: 'done', remainingMs: 0, outcome: 'hit', effect: HIT })]) }), null);
});

test('a rival telegraphs its counter, flinches when hit, goes down and faces the player it is engaged with', () => {
  const engaged = rival({ engagedId: 'a', yaw: ENGAGED_YAW });
  const telegraph = combatStateFor('rival:westcreek', { crime: crimeOf([counter({ remainingMs: 375 })], [engaged]) });
  assert.equal(telegraph.kind, 'counter'); assert.ok(near(telegraph.progress, 375 / C.length));
  assert.ok(sameVector(telegraph.facing, [1, 0]), 'faces the participant it swings at');
  const evaded = combatStateFor('rival:westcreek', { crime: crimeOf([counter({ phase: 'recovery', remainingMs: 300, outcome: 'evaded' })], [engaged]) });
  assert.equal(evaded.kind, 'counter', 'an evaded counter still finishes its swing');
  // A strike that landed staggers it, timed from the contact.
  const landed = strike({ phase: 'contact', remainingMs: 60, outcome: 'hit', effect: HIT });
  const flinch = combatStateFor('rival:westcreek', { crime: crimeOf([landed], [rival({ health: 75, staggered: true, engagedId: 'a', yaw: ENGAGED_YAW })]) });
  assert.equal(flinch.kind, 'flinch'); assert.ok(near(flinch.progress, (S.contact - 60) / COMBAT_TIMING.rivalStagger));
  assert.ok(sameVector(flinch.facing, [1, 0]));
  // Staggered while winding up: the flinch shows first.
  assert.equal(combatStateFor('rival:westcreek', { crime: crimeOf([landed, counter()], [rival({ staggered: true, engagedId: 'a', yaw: ENGAGED_YAW })]) }).kind, 'flinch');
  const down = combatStateFor('rival:westcreek', { crime: crimeOf([], [rival({ health: 0, incapacitated: true })]) });
  assert.equal(down.kind, 'down'); assert.equal(down.progress, 1);
  // Engaged between counters: no pose, but it keeps facing the player.
  const waiting = combatStateFor('rival:westcreek', { crime: crimeOf([], [engaged]) });
  assert.equal(waiting.kind, null); assert.ok(sameVector(waiting.facing, [1, 0]));
});

test('a struck rival whose strike has finished but who is still staggered keeps a facing-only state, not a legacy pose', () => {
  // The town's strike ends at 900 ms and the stagger at 1000 ms (contact + 700): in between the
  // action is gone from the snapshot. The state stays an object (kind null, facing kept) so the
  // caller drops the old stagger gesture instead of popping into it as the flinch fades.
  const after = combatStateFor('rival:westcreek', { crime: crimeOf([strike({ phase: 'done', remainingMs: 0, outcome: 'hit', effect: HIT })], [rival({ staggered: true, engagedId: 'a', yaw: ENGAGED_YAW })]) });
  assert.equal(after.kind, null); assert.ok(sameVector(after.facing, [1, 0], 1e-6));
  const gone = combatStateFor('rival:westcreek', { crime: crimeOf([], [rival({ staggered: true, engagedId: 'a', yaw: ENGAGED_YAW })]) });
  assert.equal(gone.kind, null); assert.ok(gone.facing, 'engaged: still an object for the caller');
});

test('a participant flinches from a counter that lands, goes down at zero health, and evades only after the town admits it', () => {
  const landed = counter({ phase: 'contact', remainingMs: 100, outcome: 'hit', effect: { damage: 20, health: 80, down: false } });
  const flinch = combatStateFor('a', { crime: crimeOf([landed]) });
  assert.equal(flinch.kind, 'flinch'); assert.ok(near(flinch.progress, 20 / COMBAT_TIMING.playerStagger));
  assert.ok(sameVector(flinch.facing, [-1, 0]), 'recoils facing the rival that hit them');
  const players = [{ id: 'a', position: [-2906.8, -1320, 17.8], health: 0 }];
  assert.equal(combatStateFor('a', { crime: crimeOf([]), players }).kind, 'down');
  assert.equal(combatStateFor('a', { crime: crimeOf([counter({ phase: 'contact', remainingMs: 100, outcome: 'hit', effect: { damage: 20, health: 0, down: true } })]) }).kind, 'down');
  const evading = combatStateFor('a', { crime: crimeOf([]), evade: { id: 'e1', remainingMs: 350, direction: 'left' } });
  assert.equal(evading.kind, 'evade'); assert.equal(evading.side, 'left'); assert.ok(near(evading.progress, 0));
  assert.equal(combatStateFor('a', { crime: crimeOf([strike()]), evade: { id: 'e1', remainingMs: 200, direction: 'back' } }).kind, 'evade');
  assert.equal(combatStateFor('a', { crime: crimeOf([]), players, evade: { id: 'e1', remainingMs: 200, direction: 'back' } }).kind, 'down', 'down outranks everything');
  // The evade is this client's own reply, kept current by the HUD: a stale snapshot does not age it.
  const stale = combatStateFor('a', { crime: crimeOf([]), evade: { id: 'e1', remainingMs: 200, direction: 'back' }, ageMs: 190 });
  assert.ok(near(stale.progress, (COMBAT_TIMING.evade - 200) / COMBAT_TIMING.evade), `snapshot age is not added to the evade: ${stale.progress}`);
  // Engaged without an action of their own: no pose, facing the rival.
  const facing = combatStateFor('a', { crime: crimeOf([], [rival({ engagedId: 'a', yaw: ENGAGED_YAW })]), players: [{ ...players[0], health: 100 }] });
  assert.equal(facing.kind, null); assert.ok(sameVector(facing.facing, [-1, 0], 1e-6));
});

test('officers telegraph a grab and arrest; the player they hold surrenders; a late grab holds its reach instead of replaying', () => {
  const grab = combatStateFor('police:0', { police: policeOf([officer({ state: 'grab', remainingMs: 450 })]) });
  assert.equal(grab.kind, 'grab'); assert.ok(near(grab.progress, .5)); assert.ok(sameVector(grab.facing, [-1, 0], 1e-9));
  const late = combatStateFor('police:0', { police: policeOf([officer({ state: 'grab', remainingMs: 450 })]), ageMs: 600 });
  assert.equal(late.kind, 'grab'); assert.equal(late.progress, 1);
  assert.equal(combatStateFor('police:0', { police: policeOf([officer({ state: 'arrest' })]) }).kind, 'arrest');
  assert.equal(combatStateFor('a', { police: policeOf([officer({ state: 'arrest' })]) }).kind, 'surrender');
  assert.equal(combatStateFor('a', { police: policeOf([], { surrendered: ['a'] }) }).kind, 'surrender');
  assert.equal(combatStateFor('a', { police: policeOf([officer()], { subdued: ['a'] }) }).kind, 'surrender');
  assert.equal(combatStateFor('a', { police: policeOf([officer({ state: 'arrest' })]), players: [{ id: 'a', position: [0, 0, 0], health: 0 }] }).kind, 'down');
});

test('peaceful bystanders, idle rivals and patrolling officers get no combat state or focus', () => {
  const busy = { crime: crimeOf([strike(), counter()], [rival({ engagedId: 'a', yaw: ENGAGED_YAW })]), police: policeOf([officer({ state: 'grab', remainingMs: 450 })]),
    players: [{ id: 'a', position: [-2906.8, -1320, 17.8], health: 100 }, { id: 'b', position: [-2907, -1321, 17.8], health: 100 }] };
  assert.equal(combatStateFor('b', busy), null);
  assert.equal(combatFocusFor('b', busy), null);
  assert.equal(combatStateFor('rival:service-lane', { crime: crimeOf([], [rival({ id: 'rival:service-lane' })]) }), null);
  for (const state of ['pursue', 'search', 'return']) assert.equal(combatStateFor('police:1', { police: policeOf([officer({ id: 'police:1', state, targetId: state === 'return' ? null : 'b' })]) }), null);
  assert.equal(combatStateFor('a', {}), null);
  assert.equal(combatStateFor('a', { crime: null, police: null }), null);
});

test('the engaged focus is the rival a player fights, or an officer reaching for them first', () => {
  assert.deepEqual(combatFocusFor('a', { crime: crimeOf([], [rival({ engagedId: 'a' })]) }), [-2908, -1320, 17.8]);
  assert.deepEqual(combatFocusFor('a', { crime: crimeOf([strike()]) }), [-2908, -1320, 17.8], 'a first strike engages before it lands');
  assert.deepEqual(combatFocusFor('a', { crime: crimeOf([counter()]) }), [-2908, -1320, 17.8]);
  assert.deepEqual(combatFocusFor('a', { crime: crimeOf([], [rival({ engagedId: 'a' })]), police: policeOf([officer({ state: 'grab', remainingMs: 400 })]) }), [-2905.4, -1320, 17.8]);
  assert.deepEqual(combatFocusFor('a', { police: policeOf([officer()], { subdued: ['a'] }) }), [-2905.4, -1320, 17.8]);
  assert.equal(combatFocusFor('a', { crime: crimeOf([strike({ phase: 'done', remainingMs: 0, outcome: 'cancelled', reason: 'policy_changed' })]) }), null);
});

test('between snapshots a timed state advances with time and ends; held states and a grab\'s reach hold', () => {
  const state = combatStateFor('a', { crime: crimeOf([strike()]) });
  assert.ok(near(advanceCombat(state, 450).progress, 450 / S.length));
  assert.equal(advanceCombat(state, S.length)?.kind ?? null, null);
  assert.equal(advanceCombat(null, 100), null);
  assert.equal(advanceCombat({ kind: 'grab', progress: 0, durationMs: 0, facing: null }, 0).progress, 0, 'a zero-length grab never carries NaN');
  const down = combatStateFor('rival:westcreek', { crime: crimeOf([], [rival({ health: 0, incapacitated: true })]) });
  assert.deepEqual(advanceCombat(down, 10_000), down);
  const grab = combatStateFor('police:0', { police: policeOf([officer({ state: 'grab', remainingMs: 450 })]) });
  assert.equal(advanceCombat(grab, 10_000).progress, 1);
  const flinch = combatStateFor('rival:westcreek', { crime: crimeOf([strike({ phase: 'contact', remainingMs: 60, outcome: 'hit', effect: HIT })], [rival({ staggered: true, engagedId: 'a', yaw: ENGAGED_YAW })]) });
  const over = advanceCombat(flinch, COMBAT_TIMING.rivalStagger);
  assert.equal(over.kind, null); assert.ok(sameVector(over.facing, [1, 0]), 'an engaged rival keeps facing after its flinch');
});

test('in a fight the body turns toward the focus at a bounded rate while the feet keep the travel heading (30, 60, 120 Hz)', () => {
  const focus = 2.5, travel = -Math.PI / 2;
  for (const hz of [30, 60, 120]) {
    let yaw = 0, reached = null;
    for (let frame = 1; frame <= hz; frame++) {
      const next = combatFacing(travel, yaw, focus, { dt: 1 / hz });
      assert.equal(next.heading, travel, 'foot placement keeps the travel heading');
      assert.equal(next.engaged, true);
      assert.ok(Math.abs(wrap(next.yaw - yaw)) <= COMBAT_TURN_RATE / hz + 1e-9, `${hz} Hz: turned ${wrap(next.yaw - yaw)} in one frame`);
      yaw = next.yaw;
      if (reached === null && Math.abs(wrap(yaw - focus)) < .02) reached = frame / hz;
    }
    assert.ok(reached !== null && reached < .75, `${hz} Hz: faces the focus after ${reached} s`);
  }
  const after = hz => { let yaw = 0; for (let i = 0; i < hz / 4; i++) yaw = combatFacing(undefined, yaw, focus, { dt: 1 / hz }).yaw; return yaw; };
  assert.ok(Math.abs(after(30) - after(120)) < .06, `refresh-rate independent: ${after(30)} vs ${after(120)}`);
  assert.ok(combatFacing(undefined, 3, -3, { dt: 1 / 60 }).yaw > 3, 'turns the short way across the seam');
  for (const [target, options] of [[null, { dt: 1 / 60 }], [undefined, { dt: 1 / 60 }], [focus, { dt: 1 / 60, seated: true }], [focus, { dt: 1 / 60, flying: true }], [focus, { dt: 0 }]]) {
    const same = combatFacing(.4, 1, target, options);
    assert.equal(same.yaw, 1); assert.equal(same.heading, .4);
  }
  // [east, north] facing to the scene yaw a body uses: east is +x, north is -z.
  assert.ok(near(facingYaw([1, 0]), Math.PI / 2)); assert.ok(near(Math.abs(facingYaw([0, 1])), Math.PI)); assert.ok(near(facingYaw([0, -1]), 0));
  assert.equal(facingYaw(null), null); assert.equal(facingYaw([0, 0]), null);
});

test('strafing and backpedalling in a fight: the body faces the opponent while steps land along travel (30, 60, 120 Hz)', async () => {
  const environment = { isFree: () => true, groundAt: () => 0 }, opponent = [0, -4];
  for (const profile of ['jevica', 'woman-casual']) {
    const source = await loadCharacterRig(profile);
    for (const [name, input] of Object.entries({ strafe: { strafe: 1 }, backpedal: { forward: -1 }, circle: { strafe: -1, forward: .4 } })) for (const hz of [30, 60, 120]) {
      const avatar = instantiateAvatar(source, { targetHeight: 1.7 }), body = new THREE.Group(); body.add(avatar.model);
      const baseY = avatar.model.position.y, placement = createFootPlacement(avatar.model, body);
      const state = { position: [0, 1.6, 0], yaw: 0, pitch: 0, distance: 0, speed: 0, velocity: [0, 0], acceleration: [0, 0] };
      let steps = 0, worst = 0;
      for (let frame = 0; frame < 2.5 * hz; frame++) {
        stepWalking(state, environment, input, 1 / hz);
        body.position.set(state.position[0], 0, state.position[2]);
        const locomotion = localLocomotion({ ...state, flying: false });
        const focus = Math.atan2(opponent[0] - body.position.x, opponent[1] - body.position.z);
        const facing = combatFacing(locomotion.heading, body.rotation.y, focus, { dt: 1 / hz });
        body.rotation.y = facing.yaw;
        avatar.model.position.y = baseY; for (const [bone, rest] of avatar.rest) bone.quaternion.copy(rest);
        const before = placement.legs.map(leg => ({ contact: leg.contact, target: leg.target?.clone() }));
        placement.update(1 / hz, { ...locomotion, heading: facing.heading }, () => 0);
        placement.legs.forEach((leg, i) => {
          if (before[i].contact && leg.contact && before[i].target) assert.ok(leg.target.distanceTo(before[i].target) < 1e-9, `${profile} ${name}: a planted foot slides`);
          if (before[i].contact && !leg.contact) steps++;
          assert.ok(leg.target.distanceTo(body.localToWorld(leg.rest.clone())) < .65, `${profile} ${name} ${hz} Hz: a foot is stranded`);
        });
        assert.ok(placement.legs.some(leg => leg.contact), `${profile} ${name}: a supporting foot remains`);
        if (frame / hz > .6) worst = Math.max(worst, Math.abs(wrap(body.rotation.y - focus)));
      }
      avatar.dispose();
      assert.ok(worst < .1, `${profile} ${name} ${hz} Hz: the body drifts ${worst.toFixed(3)} rad off the opponent`);
      assert.ok(steps > 6, `${profile} ${name} ${hz} Hz: keeps stepping (${steps})`);
    }
  }
});

// The pose layer, applied after the rig is posed, on every shipped rig.
const RIGS = [...AVATAR_PROFILES, 'jevica'];
let shipped;
async function shippedRigs() {
  if (shipped) return shipped;
  shipped = [];
  for (const profile of RIGS) {
    const source = await loadCharacterRig(profile), avatar = instantiateAvatar(source, { targetHeight: profile === 'jevica' ? 1.685 : 1.75 });
    const root = new THREE.Group(); root.add(avatar.model);
    shipped.push({ profile, rig: avatar, root, baseY: avatar.model.position.y });
  }
  return shipped;
}
const pose = (item, state, options) => {
  for (const [bone, rest] of item.rig.rest) bone.quaternion.copy(rest);
  item.rig.model.position.y = item.baseY;
  const applied = applyCombatPose(item.rig, state, options);
  item.root.updateMatrixWorld(true);
  return applied;
};
const at = (item, name) => item.rig.model.getObjectByName(name).getWorldPosition(new THREE.Vector3());
// Shipped rest quaternions are not all unit length (woman-casual), so compare normalized copies.
const turned = item => Math.max(...item.rig.bones.map(bone => bone.quaternion.clone().normalize().angleTo(item.rig.rest.get(bone).clone().normalize())));
const quaternions = item => item.rig.bones.map(bone => bone.quaternion.toArray());
const state = (kind, progress, extra = {}) => ({ kind, progress, durationMs: 1000, facing: null, ...extra });
const STRIKE_CONTACT = (S.windup + S.contact / 2) / S.length, STRIKE_WINDUP = S.windup / S.length, COUNTER_WINDUP = C.windup / C.length;

test('the combat layer is bounded, deterministic and returns exactly to the posed rig', async () => {
  for (const item of await shippedRigs()) {
    assert.equal(pose(item, null), false); assert.ok(turned(item) < 1e-6, `${item.profile}: no state, no change`);
    for (const kind of COMBAT_KINDS) for (let progress = 0; progress <= 1.0001; progress += .05) {
      pose(item, state(kind, progress));
      assert.ok(turned(item) <= 1.75, `${item.profile} ${kind} ${progress.toFixed(2)}: a bone turned ${turned(item).toFixed(2)} rad`);
      assert.ok(Math.abs(item.rig.model.position.y - item.baseY) <= .3, `${item.profile} ${kind}: the body drops ${item.baseY - item.rig.model.position.y} m`);
      const first = quaternions(item); pose(item, state(kind, progress));
      assert.deepEqual(quaternions(item), first, `${item.profile} ${kind}: deterministic`);
    }
    // Timed actions start and end on the posed rig, so they ease in and out by themselves.
    for (const kind of ['strike', 'counter', 'evade', 'flinch']) for (const progress of [0, 1]) {
      pose(item, state(kind, progress));
      assert.ok(turned(item) < 1e-6, `${item.profile} ${kind} at ${progress}: ${turned(item)}`);
      assert.equal(item.rig.model.position.y, item.baseY);
    }
    // Weight scales the layer and zero weight is exactly the posed rig.
    pose(item, state('down', 1, { weight: 0 })); assert.ok(turned(item) < 1e-6); assert.equal(item.rig.model.position.y, item.baseY);
    pose(item, state('down', 1)); const full = turned(item);
    pose(item, state('down', 1, { weight: .5 })); assert.ok(turned(item) < .6 * full && turned(item) > .4 * full, `${item.profile}: half weight ${turned(item)} of ${full}`);
    assert.equal(pose(item, state('surrender', 1), {}), true);
    assert.equal(pose(item, { kind: null, progress: 0, facing: [1, 0] }), false); assert.ok(turned(item) < 1e-6, 'facing alone poses nothing');
  }
});

test('each pose reads as what the town decided on every shipped rig: strike, counter, evade, flinch, down, grab, arrest, surrender', async () => {
  for (const item of await shippedRigs()) {
    const name = item.profile;
    pose(item, null);
    const rest = { hand_r: at(item, 'hand_r'), hand_l: at(item, 'hand_l'), head: at(item, 'head'), foot_l: at(item, 'foot_l'), foot_r: at(item, 'foot_r') };
    const chest = at(item, 'spine_03'), shoulder = at(item, 'upperarm_r').y, neck = at(item, 'neck_01').y;
    // Strike: the arm draws back, then drives forward of the chest at contact.
    pose(item, state('strike', STRIKE_WINDUP)); const drawn = at(item, 'hand_r');
    pose(item, state('strike', STRIKE_CONTACT)); const struck = at(item, 'hand_r');
    assert.ok(struck.z - drawn.z > .3, `${name}: the strike travels forward ${(struck.z - drawn.z).toFixed(2)} m`);
    assert.ok(struck.z - chest.z > .3, `${name}: contact reaches ${(struck.z - chest.z).toFixed(2)} m ahead of the chest`);
    // Counter: a readable, raised windup held into the telegraph.
    for (const progress of [.3, COUNTER_WINDUP - .01]) {
      pose(item, state('counter', progress));
      assert.ok(at(item, 'hand_r').y > shoulder, `${name}: the counter's fist is raised above the shoulder at ${progress}`);
    }
    // Evade: leans away, back by default and to a side when asked.
    pose(item, state('evade', .5)); assert.ok(rest.head.z - at(item, 'head').z > .06, `${name}: evade leans back`);
    pose(item, state('evade', .5, { side: 'left' })); assert.ok(at(item, 'head').x - rest.head.x > .06, `${name}: evade leans left`);
    pose(item, state('evade', .5, { side: 'right' })); assert.ok(rest.head.x - at(item, 'head').x > .06, `${name}: evade leans right`);
    // Flinch: a short recoil away from the hit.
    pose(item, state('flinch', .15)); assert.ok(rest.head.z - at(item, 'head').z > .04, `${name}: flinch recoils`);
    // Down: crouched and winded, feet still where they stood.
    pose(item, state('down', 1));
    assert.ok(rest.head.y - at(item, 'head').y > .3, `${name}: down lowers the head ${(rest.head.y - at(item, 'head').y).toFixed(2)} m`);
    for (const foot of ['foot_l', 'foot_r']) {
      const moved = at(item, foot).sub(rest[foot]);
      assert.ok(Math.hypot(moved.x, moved.z) < .06 && Math.abs(moved.y) < .05, `${name}: ${foot} moved ${moved.toArray().map(v => v.toFixed(3))}`);
    }
    // Grab: both arms reach forward at contact.
    pose(item, state('grab', 1));
    for (const hand of ['hand_l', 'hand_r']) assert.ok(at(item, hand).z - chest.z > .3, `${name}: grab reaches with ${hand}`);
    // Arrest: hands forward and low, holding the subject.
    pose(item, state('arrest', 1));
    for (const hand of ['hand_l', 'hand_r']) { const p = at(item, hand); assert.ok(p.z - chest.z > .15 && p.y < shoulder, `${name}: arrest holds with ${hand}`); }
    // Surrender: hands raised.
    pose(item, state('surrender', 1));
    for (const hand of ['hand_l', 'hand_r']) assert.ok(at(item, hand).y > neck, `${name}: surrender raises ${hand}`);
  }
});

test('reduced motion shows no swings, only a static readable key pose for held states and telegraphs', async () => {
  const reducedMotion = true;
  for (const item of await shippedRigs()) {
    for (const kind of ['strike', 'evade', 'flinch']) for (const progress of [.1, .4, .8]) {
      pose(item, state(kind, progress), { reducedMotion }); assert.ok(turned(item) < 1e-6, `${item.profile} ${kind}: no swing`);
    }
    for (const kind of ['down', 'surrender', 'arrest', 'grab']) {
      pose(item, state(kind, .2), { reducedMotion }); const early = quaternions(item);
      assert.ok(turned(item) > .2, `${item.profile} ${kind}: a readable key pose`);
      pose(item, state(kind, .9), { reducedMotion }); assert.deepEqual(quaternions(item), early, `${item.profile} ${kind}: static`);
    }
    pose(item, state('counter', .1), { reducedMotion }); const windup = quaternions(item); assert.ok(turned(item) > .2);
    pose(item, state('counter', COUNTER_WINDUP - .01), { reducedMotion }); assert.deepEqual(quaternions(item), windup, 'the telegraph is one static pose');
    pose(item, state('counter', .8), { reducedMotion }); assert.ok(turned(item) < 1e-6, 'no swing after the telegraph');
  }
});

test('the blend eases each state in and out, crossfades a change, never runs an action backwards, and clears exactly', () => {
  const down = state('down', 1), weights = [];
  const blend = createCombatBlend();
  for (let t = 0; t <= 600; t += 16) { const layers = blend.step(down, t); weights.push(layers.at(-1)?.weight ?? 0); }
  assert.equal(weights[0], 0); assert.equal(weights.at(-1), 1);
  assert.ok(weights.every((weight, i) => !i || weight >= weights[i - 1]), 'eases in');
  assert.ok(weights.findIndex(weight => weight === 1) * 16 <= 500, 'within half a second');
  const fading = [];
  for (let t = 616; t <= 1300; t += 16) fading.push(blend.step(null, t));
  assert.ok(fading[0].length === 1 && fading[0][0].kind === 'down' && fading[0][0].weight < 1, 'eases out of the last pose');
  assert.equal(fading.at(-1).length, 0, 'and clears exactly');
  assert.ok(fading.findIndex(layers => !layers.length) * 16 <= 500);
  // A change crossfades between at most two layers.
  const swap = createCombatBlend();
  for (let t = 0; t <= 400; t += 16) swap.step(state('strike', .3, { id: 'strike:1' }), t);
  const both = swap.step(state('flinch', .1, { id: 'counter:2' }), 416);
  assert.deepEqual(both.map(layer => layer.kind), ['strike', 'flinch']);
  assert.ok(both[0].weight < 1 && both[1].weight > 0);
  assert.ok(both.reduce((sum, layer) => sum + layer.weight, 0) <= 1 + 1e-9, 'the two layers never add up to more than one pose');
  let end = both; for (let t = 432; t <= 1000; t += 16) end = swap.step(state('flinch', .3, { id: 'counter:2' }), t);
  assert.deepEqual(end.map(layer => layer.kind), ['flinch']);
  // A snapshot that would run the same action back is held at the furthest progress shown.
  const forward = createCombatBlend();
  forward.step(state('strike', .5, { id: 'strike:1' }), 0); forward.step(state('strike', .5, { id: 'strike:1' }), 16);
  assert.equal(forward.step(state('strike', .4, { id: 'strike:1' }), 32)[0].progress, .5);
  assert.equal(forward.step(state('strike', .1, { id: 'strike:9' }), 48).at(-1).progress, .1, 'a new action starts fresh');
  // Reduced motion: no easing, on and off.
  const still = createCombatBlend();
  assert.equal(still.step(down, 0, { reducedMotion: true })[0].weight, 1);
  assert.equal(still.step(null, 16, { reducedMotion: true }).length, 0);
  still.step(down, 32); still.reset(); assert.equal(still.step(null, 48).length, 0);
});

test('the local player reads the HUD\'s published state, faces the focus while engaged and returns to travel facing after', () => {
  const read = createCombatReader();
  const dataset = { combatState: JSON.stringify({ kind: 'strike', id: 'strike:1', progress: 0, durationMs: S.length, facing: [-1, 0] }), combatFocus: JSON.stringify([-2908, -1320, 17.8]) };
  let view = read(dataset, 1000);
  assert.equal(view.state.kind, 'strike'); assert.equal(view.state.progress, 0); assert.deepEqual(view.focus, [-2908, -1320, 17.8]);
  view = read(dataset, 1000 + S.length / 2); assert.ok(near(view.state.progress, .5), 'advances from when it was first seen');
  assert.equal(read(dataset, 1000 + S.length).state?.kind ?? null, null, 'and ends');
  for (const bad of ['{"kind":"explode","progress":0,"durationMs":1}', '{"kind":"down","progress":"x","durationMs":0}', 'nope', '{"kind":"down","progress":1,"durationMs":0,"facing":[1]}',
    '{"kind":"strike","progress":0,"durationMs":0}', '{"kind":"grab","progress":0,"durationMs":0}']) {
    assert.equal(read({ ...dataset, combatState: bad }, 2000).state, null, bad);
  }
  for (const bad of ['[1,2]', '[1,2,"x"]', '{}', 'nope']) assert.equal(read({ ...dataset, combatFocus: bad }, 2000).focus, null, bad);
  assert.deepEqual(read({}, 2000), { state: null, focus: null }); assert.deepEqual(read(null, 2000), { state: null, focus: null });

  const local = createLocalCombat(), engaged = { combatFocus: JSON.stringify([10, 0, 0]) }, position = { x: 0, z: 0 };
  let yaw = 0, now = 0;
  const frame = (data, options = {}) => { now += 1000 / 60; return local.update({ dataset: data, now, dt: 1 / 60, position, yaw, heading: undefined, seated: false, flying: false, ...options }); };
  for (let i = 0; i < 60; i++) { const out = frame(engaged); assert.notEqual(out.yaw, null); yaw = out.yaw; }
  assert.ok(Math.abs(wrap(yaw - Math.PI / 2)) < .02, `faces the focus to the east: ${yaw}`);
  assert.equal(frame(engaged, { seated: true }).yaw, null, 'never while seated');
  assert.equal(frame(engaged, { flying: true }).yaw, null, 'never while flying');
  // The HUD clears the focus: the caller's travel turn takes over at once and faces travel within half a second.
  const travel = Math.PI;
  for (let i = 0; i < 30; i++) { const out = frame({}); assert.equal(out.yaw, null); yaw = turnToward(yaw, travel, 1 / 60); }
  assert.ok(Math.abs(wrap(yaw - travel)) < .02, `faces travel again: ${yaw}`);
  // player-avatar.js order: the travel turn stands down while the combat yaw is in force. Backpedalling
  // (travel west, focus east) the body stays on the opponent; with both turns running each frame it settles far off.
  for (const [order, bound, label] of [['stands down', .05, 'the travel turn stands down while engaged'], ['stacked', .5, 'both turns every frame fight each other']]) {
    const body = createLocalCombat(); let heading = 0;
    for (let i = 0; i < 120; i++) {
      if (order === 'stacked') heading = turnToward(heading, -Math.PI / 2, 1 / 60);
      const out = body.update({ dataset: engaged, now: i * 1000 / 60, dt: 1 / 60, position, yaw: heading, heading: -Math.PI / 2 });
      if (out.yaw !== null) heading = out.yaw; else heading = turnToward(heading, -Math.PI / 2, 1 / 60);
    }
    const off = Math.abs(wrap(heading - Math.PI / 2));
    assert.ok(order === 'stacked' ? off > bound : off < bound, `${label}: ${off.toFixed(3)} rad off the opponent`);
  }
  assert.ok(Math.abs(wrap(yaw - travel)) < .05, `back to travel facing: ${yaw}`);
  // Its own pose is shown while published and gone, exactly, once cleared.
  const posed = { combatState: JSON.stringify({ kind: 'surrender', progress: 1, durationMs: 0, facing: null }) };
  let out; for (let i = 0; i < 30; i++) out = frame(posed);
  assert.equal(out.active, true);
  for (let i = 0; i < 40; i++) out = frame({});
  assert.equal(out.active, false);
});
