import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { COMBAT_TIMING, advanceCombat, combatStateFor, createCombatBlend, createCombatReader } from '../src/combat-motion.js';
import { CRIME_RULES } from '../../server/crime.js';

// #640 increment 5 evidence: how late the strike, its contact and the rival's flinch show on the
// striker's own screen and on another player's, at 30/60/120 Hz under the proposed network
// profiles (#637: RTT 0/100/200 ms, one-way jitter, TCP head-of-line stalls; 3 seeds). The town
// is simulated exactly as the server times it (server/crime.js phases, a 50 ms loop that
// broadcasts at most every 200 ms, server/app.js); the clients run the shipped combat-motion
// code the way crime-ui.js, player-avatar.js, main.js and remote-players.js call it. Numbers are
// measurements of this model, not budgets. Set RIVER_OAKS_COMBAT_EVIDENCE=<path> to write them.
const PROFILES = {
  rtt0: { rtt: 0, jitter: 0, stall: 0, stallMs: 0 },
  rtt100: { rtt: 100, jitter: 15, stall: .01, stallMs: 250 },
  rtt200: { rtt: 200, jitter: 40, stall: .03, stallMs: 400 },
};
const random = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const R = CRIME_RULES, S = COMBAT_TIMING.strike;
const RIVAL = { id: 'rival:service-lane', name: 'Service lane rival', appearance: 'sable-human', position: [-2800, -1440, 17.8], yaw: 0, health: 100, maxHealth: 100, incapacitated: false, staggered: false, engagedId: null };
const PLAYER = { id: 'a', position: [-2798.8, -1440, 17.8], health: 100 };

/** The town's crime snapshot at server time `at` for a strike admitted at `admittedAt` (ms). */
function townAt(at, admittedAt) {
  const elapsed = at - admittedAt;
  if (admittedAt === null || elapsed < 0) return { targets: [RIVAL], wanted: [], actions: [] };
  const landed = elapsed >= R.strikeWindupMs;
  const phase = elapsed < R.strikeWindupMs ? 'windup' : elapsed < R.strikeWindupMs + R.contactMs ? 'contact' : elapsed < R.cooldownMs ? 'recovery' : 'done';
  const ends = phase === 'windup' ? R.strikeWindupMs : phase === 'contact' ? R.strikeWindupMs + R.contactMs : R.cooldownMs;
  const action = { id: 'strike:1', kind: 'strike', actorId: 'a', targetId: RIVAL.id, phase, remainingMs: Math.max(0, ends - elapsed), outcome: landed ? 'hit' : null, reason: null, direction: [-1, 0],
    ...(landed ? { effect: { damage: 25, health: 75, incapacitated: false, stars: 1 } } : {}) };
  const rival = { ...RIVAL, health: landed ? 75 : 100, staggered: landed && elapsed - R.strikeWindupMs < R.hitReactionMs, engagedId: landed ? 'a' : null, yaw: -Math.PI / 2 };
  return { targets: [rival], wanted: landed ? [['a', 1]] : [], actions: [action] };
}

/**
 * One strike seen at `hz` by the striker (local: the HUD publishes at each snapshot and the
 * reader plays it forward from the next frame) and by another player (remote: main.js attaches
 * the state at sync, remote-players.js plays it forward from the snapshot's arrival).
 */
function observe({ hz, network, seed, inputAt = 1000, seconds = 3 }) {
  const jitter = random(seed);
  const oneWay = () => network.rtt / 2 + (jitter() * 2 - 1) * network.jitter;
  // The attack message reaches the town after one way; the reply comes back after another.
  const admittedAt = inputAt + oneWay(), replyAt = admittedAt + oneWay();
  // The town's loop: 50 ms steps with a little jitter, a broadcast at most every 200 ms, in order per socket.
  const broadcasts = [];
  let tick = 0, broadcastAt = -Infinity;
  while (tick < inputAt + seconds * 1000) {
    tick += 50 + jitter() * 6;
    if (tick - broadcastAt >= 200) { broadcastAt = tick; broadcasts.push(tick); }
  }
  const deliver = () => { let deliveredAt = 0; return broadcasts.map(at => { const stall = jitter() < network.stall ? network.stallMs : 0; deliveredAt = Math.max(deliveredAt, at + oneWay() + stall); return { at, deliveredAt }; }); };
  const toLocal = deliver(), toRemote = deliver();
  const contactAt = admittedAt + R.strikeWindupMs;
  const frames = Math.ceil((inputAt + seconds * 1000) * hz / 1000), dtMs = 1000 / hz;
  // Local: crime-ui.js publishes combatState at sync (age 0); player-avatar.js reads it each frame.
  const read = createCombatReader(), localBlend = createCombatBlend();
  const dataset = {};
  let local = { pose: null, contact: null, replyPose: null, progress: [] }, li = 0;
  // Remote: main.js computes the state at sync; remote-players.js advances it by the snapshot's age.
  const remoteBlend = createCombatBlend(), rivalBlend = createCombatBlend();
  let remote = { pose: null, contact: null, flinch: null, progress: [] }, ri = 0, synced = null, syncedAt = 0;
  for (let frame = 0; frame <= frames; frame++) {
    const now = frame * dtMs;
    while (li < toLocal.length && toLocal[li].deliveredAt <= now) {
      const crime = townAt(toLocal[li].at, admittedAt);
      const state = combatStateFor('a', { crime, players: [PLAYER], ageMs: 0 });
      if (state?.kind) dataset.combatState = JSON.stringify(state); else delete dataset.combatState;
      li++;
    }
    const { state } = read(dataset, now);
    const layers = localBlend.step(state, now);
    // What is shown is the blend's layer: it never runs an action backwards when a snapshot's own
    // progress (one way behind the town) is less than what the frame before played forward to.
    const localStrike = layers.find(layer => layer.kind === 'strike' && !layer.fading);
    if (local.pose === null && localStrike && localStrike.weight > 0) local.pose = now;
    if (local.contact === null && localStrike && localStrike.progress >= S.windup / S.length) local.contact = now;
    if (local.replyPose === null && now >= replyAt) local.replyPose = now;
    if (localStrike) local.progress.push(localStrike.progress);
    while (ri < toRemote.length && toRemote[ri].deliveredAt <= now) {
      const crime = townAt(toRemote[ri].at, admittedAt);
      synced = { player: combatStateFor('a', { crime, players: [PLAYER] }), rival: combatStateFor(RIVAL.id, { crime }) }; syncedAt = toRemote[ri].deliveredAt;
      ri++;
    }
    const player = synced ? advanceCombat(synced.player, Math.max(0, now - syncedAt)) : null, rival = synced ? advanceCombat(synced.rival, Math.max(0, now - syncedAt)) : null;
    const shown = remoteBlend.step(player, now); rivalBlend.step(rival, now);
    const remoteStrike = shown.find(layer => layer.kind === 'strike' && !layer.fading);
    if (remote.pose === null && remoteStrike && remoteStrike.weight > 0) remote.pose = now;
    if (remote.contact === null && remoteStrike && remoteStrike.progress >= S.windup / S.length) remote.contact = now;
    if (remote.flinch === null && rival?.kind === 'flinch') remote.flinch = now;
    if (remoteStrike) remote.progress.push(remoteStrike.progress);
  }
  return { inputAt, admittedAt, replyAt, contactAt, local, remote };
}

const stats = values => ({ p50: Math.round(quantile(values, .5)), max: Math.round(Math.max(...values)), min: Math.round(Math.min(...values)) });
const quantile = (values, fraction) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]; };
const monotonic = values => values.every((value, i) => i === 0 || value >= values[i - 1] - 1e-9);

test('input to pose and contact alignment at 30/60/120 Hz under the proposed network profiles (measurements, not budgets)', () => {
  const report = { at: new Date().toISOString(), seeds: [3, 11, 29], model: 'simulated town (server/crime.js phases, 50 ms loop, 200 ms broadcasts) and shipped combat-motion.js clients; ms after the key press (input) or the town\'s contact instant', rows: [] };
  for (const [name, network] of Object.entries(PROFILES)) for (const hz of [30, 60, 120]) {
    const samples = { localInputToPose: [], localIfFromReply: [], localContactLate: [], remoteInputToPose: [], remoteContactLate: [], remoteFlinchLate: [] };
    for (const seed of report.seeds) {
      const run = observe({ hz, network, seed });
      assert.ok(run.local.pose !== null && run.local.contact !== null && run.remote.pose !== null && run.remote.contact !== null && run.remote.flinch !== null, `${name} ${hz} Hz seed ${seed}: every event is shown`);
      // Nothing is shown before the town admits it, and no client runs the swing backwards.
      assert.ok(run.local.pose >= run.admittedAt && run.remote.pose >= run.admittedAt, `${name} ${hz} Hz seed ${seed}: the pose never leads the town`);
      assert.ok(monotonic(run.local.progress) && monotonic(run.remote.progress), `${name} ${hz} Hz seed ${seed}: progress never runs backwards`);
      samples.localInputToPose.push(run.local.pose - run.inputAt); samples.localIfFromReply.push(run.local.replyPose - run.inputAt);
      samples.localContactLate.push(run.local.contact - run.contactAt);
      samples.remoteInputToPose.push(run.remote.pose - run.inputAt); samples.remoteContactLate.push(run.remote.contact - run.contactAt); samples.remoteFlinchLate.push(run.remote.flinch - run.contactAt);
    }
    const row = { profile: name, ...network, hz, ...Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, stats(values)])) };
    report.rows.push(row);
    // Structural bounds of the model (not budgets): the pose appears within the round trip, one broadcast
    // interval, one stall and one frame of the input; contact shows within one way, jitter, a stall and a frame.
    const frameMs = 1000 / hz;
    assert.ok(row.localInputToPose.max <= network.rtt + 2 * network.jitter + 200 + 6 + network.stallMs + frameMs + 1, `${name} ${hz} Hz: local pose within the model's bound (${row.localInputToPose.max} ms)`);
    assert.ok(row.remoteContactLate.max <= network.rtt / 2 + 2 * network.jitter + network.stallMs + frameMs + 1, `${name} ${hz} Hz: remote contact within one way, jitter, a stall and a frame (${row.remoteContactLate.max} ms)`);
    assert.ok(row.localContactLate.min >= -frameMs - 1 && row.remoteContactLate.min >= -1, `${name} ${hz} Hz: contact is never shown before the town lands it`);
  }
  if (process.env.RIVER_OAKS_COMBAT_EVIDENCE) writeFileSync(process.env.RIVER_OAKS_COMBAT_EVIDENCE, JSON.stringify(report, null, 2) + '\n');
});
