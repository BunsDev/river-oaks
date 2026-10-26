import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { CRIME_RULES, CRIME_TARGETS } from '../crime.js';

// #640 increment 1: a strike is a server-timed action (windup, contact, recovery). Damage and
// stars wait for contact, which rechecks the town's own state; a struck rival telegraphs one
// counter at the participant who engaged it; an evade window makes contact miss. Every action has
// one stable identity and at most one outcome across retries, restores and writer replacement.
const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const OWNER = 'owner', ALICE = 'alice', BOB = 'bob';
const RIVAL = CRIME_TARGETS['river-oaks'][0];
const [RX, RN] = RIVAL.position;
const R = CRIME_RULES;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const seal = value => ({ ...value, checksum: digest({ version: value.version, worldId: value.worldId, worldFingerprint: value.worldFingerprint, payload: value.payload }) });

function town({ restore, time = 5_000_000 } = {}) {
  const clock = { time };
  const world = createSharedWorld(district, { now: () => clock.time, isAdmin: id => id === OWNER });
  if (restore) assert.deepEqual(world.restore(restore), { ok: true });
  for (const id of [OWNER, ALICE, BOB]) if (!world.players.has(id)) world.join({ userId: id, name: id });
  const ground = () => world.snapshot().crime.targets[0].position[2];
  const place = (id, [east, north]) => { world.players.get(id).position = [east, north, ground()]; };
  // Advance the clock and let the town step, in steps no larger than a memory tick.
  const later = ms => { while (ms > 0) { const step = Math.min(ms, 50);clock.time += step;ms -= step;world.step(step / 1000); } };
  const rules = violence => {
    clock.time += 1000;
    const reply = world.command(OWNER, { type: 'worldPolicy', action: 'update', expectedRevision: world.worldPolicy().revision, changes: { violence } });
    assert.equal(reply.ok, true, JSON.stringify(reply));
  };
  const attack = (id, extra = {}) => world.command(id, { type: 'attack', targetId: RIVAL.id, attackKind: 'melee', ...extra });
  const evade = (id, extra = {}) => world.command(id, { type: 'evade', ...extra });
  const rival = () => world.snapshot().crime.targets.find(item => item.id === RIVAL.id);
  const stars = id => world.snapshot().crime.wanted.find(([userId]) => userId === id)?.[1] ?? 0;
  const actions = (filter = {}) => world.snapshot().crime.actions.filter(action => Object.entries(filter).every(([key, value]) => action[key] === value));
  const action = id => world.snapshot().crime.actions.find(item => item.id === id);
  const health = id => world.snapshot().players.find(player => player.id === id).health;
  return { world, clock, place, later, rules, attack, evade, rival, stars, actions, action, health };
}
const open = f => { f.rules({ mode: 'forced', zones: ['westcreek-lane'] });f.place(ALICE, [RX + 1.2, RN]); };
// Strike, let it land, and return when the rival's counter is about to begin.
const health = (f, id) => f.health(id);
const landed = (f, extra) => { const reply = f.attack(ALICE, extra);assert.equal(reply.ok, true, JSON.stringify(reply));f.later(R.strikeWindupMs);return reply.action; };

test('a strike is admitted in windup and lands only at contact, from the positions at that moment', () => {
  const f = town();open(f);
  const reply = f.attack(ALICE, { attackId: 'alice-phase-0001' });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  assert.equal(reply.hit, undefined, 'no hit is confirmed at admission');
  const { action } = reply;
  assert.deepEqual([action.kind, action.actorId, action.targetId, action.phase, action.remainingMs, action.outcome], ['strike', ALICE, RIVAL.id, 'windup', R.strikeWindupMs, null]);
  assert.ok(Math.abs(action.direction[0] + 1) < 1e-9 && Math.abs(action.direction[1]) < 1e-9, 'alice stands east of the rival and swings west');
  assert.equal(action.id.includes('alice-phase-0001'), false, 'the public identity is the town\'s, not the private retry ID');
  assert.deepEqual([f.rival().health, f.stars(ALICE)], [100, 0], 'no damage or star before contact');
  assert.deepEqual(f.actions({ kind: 'strike' }).map(item => [item.id, item.phase]), [[action.id, 'windup']]);
  f.later(R.strikeWindupMs - 50);
  assert.deepEqual([f.rival().health, f.stars(ALICE), f.action(action.id).phase], [100, 0, 'windup']);
  f.later(50);
  assert.deepEqual([f.rival().health, f.rival().staggered, f.stars(ALICE)], [75, true, 1]);
  const done = f.action(action.id);
  assert.deepEqual([done.outcome, done.phase], ['hit', 'contact']);
  assert.deepEqual(done.effect, { damage: R.meleeDamage, health: 75, incapacitated: false, stars: 1 });
  f.later(R.contactMs);
  assert.equal(f.action(action.id).phase, 'recovery');
  f.later(R.cooldownMs - R.strikeWindupMs - R.contactMs);
  assert.equal(f.action(action.id).phase, 'done');
  f.later(R.actionKeepMs);
  assert.equal(f.action(action.id), undefined, 'finished actions leave the public snapshot');
  const text = JSON.stringify(f.world.snapshot().crime);
  for (const secret of ['alice-phase-0001', 'quietSince', 'receipt', 'hitAt', 'startedAt']) assert.equal(text.includes(secret), false, secret);
});

test('stepping out of reach or out of the strike\'s arc during the windup misses; a small sidestep still lands', () => {
  const f = town();open(f);
  let action = f.attack(ALICE).action;
  f.place(ALICE, [RX + 2.5, RN]);f.later(R.strikeWindupMs);
  assert.deepEqual([f.action(action.id).outcome, f.action(action.id).reason, f.rival().health, f.stars(ALICE)], ['miss', 'attack_out_of_reach', 100, 0]);
  f.later(R.cooldownMs);f.place(ALICE, [RX + 1.2, RN]);
  action = f.attack(ALICE).action;
  f.place(ALICE, [RX, RN + 1.2]);f.later(R.strikeWindupMs);
  assert.deepEqual([f.action(action.id).outcome, f.action(action.id).reason, f.rival().health], ['miss', 'attack_out_of_arc', 100], 'a swing west cannot hit a rival now to the south');
  f.later(R.cooldownMs);f.place(ALICE, [RX + 1.2, RN]);
  action = f.attack(ALICE).action;
  f.place(ALICE, [RX + 1.2, RN + 0.3]);f.later(R.strikeWindupMs);
  assert.deepEqual([f.action(action.id).outcome, f.rival().health, f.stars(ALICE)], ['hit', 75, 1]);
});

test('emergency off, a rule change and safe ground during the windup cancel the strike; earned stars stay', () => {
  const f = town();open(f);
  landed(f);f.later(R.cooldownMs);
  assert.deepEqual([f.rival().health, f.stars(ALICE)], [75, 1]);
  let action = f.attack(ALICE).action;
  assert.equal(f.world.command(OWNER, { type: 'worldPolicy', action: 'emergencyOff' }).ok, true);
  assert.deepEqual([f.action(action.id).outcome, f.action(action.id).reason, f.action(action.id).phase], ['cancelled', 'violence_off', 'done'], 'cancelled at once, not at the next step');
  f.later(R.strikeWindupMs + 100);
  assert.deepEqual([f.rival().health, f.stars(ALICE)], [75, 1], 'no damage; the earned star stays');
  f.rules({ mode: 'forced', zones: ['westcreek-lane'] });f.place(ALICE, [RX + 1.2, RN]);f.later(R.cooldownMs + 200);
  action = f.attack(ALICE).action;
  // A rule change inside the windup (no clock jump: due contacts settle before any rule change).
  const change = f.world.command(OWNER, { type: 'worldPolicy', action: 'update', expectedRevision: f.world.worldPolicy().revision, changes: { violence: { mode: 'forced', zones: ['westcreek-lane', 'south-service-lane'] } } });
  assert.equal(change.ok, true, JSON.stringify(change));
  assert.deepEqual([f.action(action.id).outcome, f.action(action.id).reason], ['cancelled', 'policy_changed']);
  f.later(R.strikeWindupMs);assert.equal(f.rival().health, 75);
  f.later(R.cooldownMs);f.place(ALICE, [RX + 1.2, RN]);
  action = f.attack(ALICE).action;
  f.place(ALICE, [-2790, -1300]);f.later(R.strikeWindupMs);
  assert.deepEqual([f.action(action.id).outcome, f.action(action.id).reason, f.rival().health, f.stars(ALICE)], ['cancelled', 'safe_zone', 75, 1]);
});

test('a retried attack ID returns the same action: never restarted, never landed twice, across a restore', () => {
  const f = town();open(f);
  const first = f.attack(ALICE, { attackId: 'alice-retry-0001' }).action;
  f.later(100);
  const again = f.attack(ALICE, { attackId: 'alice-retry-0001' });
  assert.deepEqual([again.ok, again.replayed, again.action.id, again.action.phase, again.action.remainingMs], [true, true, first.id, 'windup', R.strikeWindupMs - 100]);
  assert.equal(f.actions({ kind: 'strike' }).length, 1, 'a duplicate admits nothing new');
  f.later(R.strikeWindupMs);
  const after = f.attack(ALICE, { attackId: 'alice-retry-0001' });
  assert.deepEqual([after.replayed, after.action.outcome, f.rival().health, f.stars(ALICE)], [true, 'hit', 75, 1]);
  // Reordered: a fresh ID during the cooldown is refused and not kept; it may land later.
  assert.equal(f.attack(ALICE, { attackId: 'alice-retry-0002' }).error, 'attack_cooldown');
  f.later(R.cooldownMs);
  const second = f.attack(ALICE, { attackId: 'alice-retry-0002' });
  assert.deepEqual([second.ok, second.replayed ?? false], [true, false]);
  // Checkpoint mid-windup; the restored town resolves it once and replays it.
  const saved = f.world.checkpoint();
  assert.equal(saved.version, 17);
  const back = town({ restore: saved, time: f.clock.time });
  assert.deepEqual(back.world.snapshot().crime, f.world.snapshot().crime);
  assert.equal(back.attack(ALICE, { attackId: 'alice-retry-0002' }).action.id, second.action.id);
  back.later(R.strikeWindupMs);
  assert.deepEqual([back.rival().health, back.stars(ALICE)], [50, 2]);
  assert.deepEqual([back.attack(ALICE, { attackId: 'alice-retry-0001' }).action.outcome, back.attack(ALICE, { attackId: 'alice-retry-0002' }).action.outcome], ['hit', 'hit']);
  assert.equal(back.rival().health, 50, 'replays after restore change nothing');
  // A cancelled action retried after the town reopens stays cancelled.
  back.later(R.cooldownMs);
  const cancelled = back.attack(ALICE, { attackId: 'alice-retry-0003' }).action;
  back.world.command(OWNER, { type: 'worldPolicy', action: 'emergencyOff' });
  back.rules({ mode: 'forced', zones: ['westcreek-lane'] });back.place(ALICE, [RX + 1.2, RN]);
  const retried = back.attack(ALICE, { attackId: 'alice-retry-0003' });
  assert.deepEqual([retried.replayed, retried.action.id, retried.action.outcome], [true, cancelled.id, 'cancelled']);
  back.later(R.strikeWindupMs);assert.equal(back.rival().health, 50);
});

test('writer replacement mid-windup: the replacement resolves the contact exactly once', () => {
  const f = town();open(f);
  const strike = f.attack(ALICE, { attackId: 'alice-writer-0001' }).action;
  const saved = f.world.checkpoint();
  // The old writer is fenced out; whatever it would do next is never committed.
  const replacement = town({ restore: saved, time: f.clock.time });
  replacement.later(R.strikeWindupMs);
  assert.deepEqual([replacement.rival().health, replacement.stars(ALICE)], [75, 1]);
  const resaved = replacement.world.checkpoint();
  const third = town({ restore: resaved, time: replacement.clock.time });
  third.later(R.strikeWindupMs);
  assert.deepEqual([third.rival().health, third.stars(ALICE)], [75, 1], 'a resolved contact is never resolved again');
  assert.equal(third.attack(ALICE, { attackId: 'alice-writer-0001' }).action.id, strike.id);
});

test('a struck rival telegraphs one counter at its participant; an evade window makes it miss', () => {
  const f = town();open(f);
  f.place(BOB, [RX - 1.0, RN]);
  landed(f);
  assert.equal(f.actions({ kind: 'counter' }).length, 0, 'no counter while the rival is staggered');
  f.later(R.hitReactionMs);
  const [counter] = f.actions({ kind: 'counter' });
  assert.ok(counter, 'after the stagger the rival winds up');
  assert.deepEqual([counter.actorId, counter.targetId, counter.phase, counter.outcome], [RIVAL.id, ALICE, 'windup', null]);
  assert.ok(counter.remainingMs > R.counterWindupMs - 60 && counter.remainingMs <= R.counterWindupMs, `telegraph ${counter.remainingMs} ms`);
  assert.ok(Math.abs(counter.direction[0] - 1) < 1e-9, 'it swings toward alice, east');
  assert.equal(f.rival().engagedId, ALICE);
  assert.equal(health(f, ALICE), 100);
  f.later(R.counterWindupMs);
  assert.deepEqual([f.action(counter.id).outcome, health(f, ALICE)], ['hit', 100 - R.counterDamage]);
  assert.equal(health(f, BOB), undefined, 'the bystander in the swing is never a target');
  assert.equal(f.attack(ALICE).error, 'staggered', 'a hit participant steadies first');
  assert.equal(f.evade(ALICE).error, 'staggered');
  // The next counter comes after the rival's cooldown; evade into its contact.
  f.later(R.counterCooldownMs - R.counterWindupMs);
  const next = f.actions({ kind: 'counter', outcome: null })[0];
  assert.ok(next && next.id !== counter.id, 'a second telegraph');
  f.later(next.remainingMs - 200);
  const dodge = f.evade(ALICE, { direction: 'left', evadeId: 'alice-evade-0001' });
  assert.deepEqual([dodge.ok, dodge.evade.remainingMs, dodge.evade.direction], [true, R.evadeMs, 'left']);
  assert.equal(f.evade(ALICE, { direction: 'left', evadeId: 'alice-evade-0001' }).replayed, true, 'a retried evade does not extend the window');
  assert.equal(f.evade(ALICE, { direction: 'right' }).error, 'evade_cooldown');
  f.later(250);
  assert.deepEqual([f.action(next.id).outcome, health(f, ALICE)], ['evaded', 100 - R.counterDamage]);
  for (const action of f.world.snapshot().crime.actions) assert.notEqual(action.targetId, BOB);
});
test('a rival never counters a bystander and disengages when its participant steps away', () => {
  const f = town();open(f);
  f.place(BOB, [RX - 1.0, RN]);
  landed(f);
  f.place(ALICE, [RX, RN + 5]);
  f.later(R.hitReactionMs + 100);
  assert.equal(f.actions({ kind: 'counter' }).length, 0);
  assert.equal(f.rival().engagedId, null, 'beyond 3 m it disengages');
  f.later(10_000);
  assert.equal(f.actions({ kind: 'counter' }).length, 0);
  assert.equal(health(f, BOB), undefined);
  assert.equal(f.evade(BOB).error, 'evade_unavailable', 'a peaceful bystander has nothing to evade');
  f.place(BOB, [-2790, -1300]);assert.equal(f.evade(BOB).error, 'evade_unavailable');
});

test('a participant goes down at zero health, is held briefly, and recovers by time, get-up, policy off and lapse', () => {
  const f = town();open(f);
  landed(f);
  f.world.players.get(ALICE).health = R.counterDamage;
  f.later(R.hitReactionMs + R.counterWindupMs);
  assert.equal(health(f, ALICE), 0);
  const player = f.world.players.get(ALICE);
  assert.equal(f.world.command(ALICE, { type: 'pose', position: [player.position[0] + .1, player.position[1], player.position[2]], yaw: 0, altitude: 0 }).error, 'incapacitated');
  assert.equal(f.attack(ALICE).error, 'incapacitated');
  assert.equal(f.evade(ALICE).error, 'incapacitated');
  assert.equal(f.world.command(ALICE, { type: 'chat', text: 'ow' }).ok, true, 'chat stays open');
  f.later(R.counterCooldownMs * 2);
  assert.equal(f.actions({ kind: 'counter', outcome: null }).length, 0, 'nobody is hit while down');
  f.later(R.downMs);
  assert.equal(health(f, ALICE), R.maxHealth, 'gets up whole after the bounded hold');
  assert.equal(f.world.command(ALICE, { type: 'pose', position: [player.position[0] + .1, player.position[1], player.position[2]], yaw: 0, altitude: 0 }).ok, true, 'the hold is released');
  // Recovery 20 s after the last damage.
  const g = town();open(g);landed(g);g.later(R.hitReactionMs + R.counterWindupMs);
  assert.equal(health(g, ALICE), 80);
  g.place(ALICE, [RX, RN + 5]);g.later(R.recoveryMs);
  assert.equal(health(g, ALICE), 100);
  // Policy off ends participation at once.
  const h = town();open(h);landed(h);h.later(R.hitReactionMs + R.counterWindupMs);
  assert.equal(health(h, ALICE), 80);
  h.world.command(OWNER, { type: 'worldPolicy', action: 'emergencyOff' });
  assert.equal(health(h, ALICE), 100);
  assert.equal(h.evade(ALICE).error, 'evade_unavailable');
  // Leaving the danger zone, and thirty quiet seconds, both end participation.
  const k = town();open(k);landed(k);k.later(R.hitReactionMs + R.counterWindupMs);
  k.place(ALICE, [-2790, -1300]);k.later(100);
  assert.equal(health(k, ALICE), 100);
  // A strike that misses still makes a participant, without stars, so no officer comes to
  // capture her (#640 increment 2) while the lapse clock runs.
  const q = town();open(q);assert.equal(q.attack(ALICE).ok, true);q.place(ALICE, [RX, RN + 5]);q.later(R.strikeWindupMs + 100);
  assert.equal(q.stars(ALICE), 0);q.later(R.lapseMs - 1000 - R.strikeWindupMs - 100);
  assert.equal(q.evade(ALICE, { direction: 'back' }).ok, true, 'still a participant');
  q.later(R.lapseMs + 100);
  assert.equal(q.evade(ALICE).error, 'evade_unavailable', 'thirty quiet seconds end participation');
});

test('leaving the town cancels its pending actions and ends participation', () => {
  const f = town();open(f);
  const strike = f.attack(ALICE, { attackId: 'alice-leaves-0001' }).action;
  f.world.leave(ALICE);
  assert.deepEqual([f.action(strike.id).outcome, f.action(strike.id).reason], ['cancelled', 'attacker_left']);
  f.later(R.strikeWindupMs + R.hitReactionMs + R.counterWindupMs);
  assert.equal(f.rival().health, 100);
  assert.equal(f.actions({ kind: 'counter' }).length, 0);
});

test('v17 checkpoints keep pending actions, participants and evades; v16 towns restore with none; garbled actions are refused', () => {
  const f = town();open(f);landed(f);f.later(R.hitReactionMs + 100);
  f.evade(ALICE, { direction: 'right', evadeId: 'alice-saved-0001' });
  const saved = f.world.checkpoint();
  assert.equal(saved.version, 17);
  const back = town({ restore: saved, time: f.clock.time });
  assert.deepEqual(back.world.snapshot().crime, f.world.snapshot().crime);
  assert.equal(back.evade(ALICE, { direction: 'right', evadeId: 'alice-saved-0001' }).replayed, true);
  f.later(R.counterWindupMs);back.later(R.counterWindupMs);
  assert.deepEqual(back.world.snapshot().crime, f.world.snapshot().crime, 'the restored town continues identically');
  // A v16 town: rivals, wanted levels and legacy receipts only.
  const old = structuredClone(f.world.checkpoint());
  old.version = 16;
  old.payload.crime = { rivals: old.payload.crime.rivals.map(({ id, health, hitAt }) => ({ id, health, hitAt })), wanted: old.payload.crime.wanted, cooldowns: old.payload.crime.cooldowns,
    receipts: [[ALICE, [{ attackId: 'alice-legacy-0001', at: f.clock.time - 1000, result: { ok: true, hit: { targetId: RIVAL.id, damage: 25, health: 75, incapacitated: false, stars: 1 } } }]]] };
  for (const player of old.payload.players) delete player.health;
  // ...and police without grabs or subdued players (increment 2): a v16 envelope refuses them.
  old.payload.police = { units: old.payload.police.units.filter(unit => unit.state !== 'grab').map(({ grabDirection, recoverUntil, closeSince, ...unit }) => unit),
    surrendered: old.payload.police.surrendered, cursor: old.payload.police.cursor };
  const legacy = town({ restore: seal(old), time: f.clock.time });
  assert.deepEqual(legacy.world.snapshot().crime.actions, []);
  assert.equal(legacy.health(ALICE), undefined, 'no participants before v17');
  legacy.place(ALICE, [RX + 1.2, RN]);
  const replay = legacy.attack(ALICE, { attackId: 'alice-legacy-0001' });
  assert.deepEqual([replay.replayed, replay.hit.health], [true, 75], 'an instant-hit receipt still replays');
  // Garbled or mismatched state is refused and the live town is unchanged.
  const live = town(), was = live.world.checkpoint();
  const current = structuredClone(saved);
  const variants = [
    crime => { crime.actions[0].phase = 'windup'; },
    crime => { crime.actions[0].outcome = 'exploded'; },
    crime => { crime.actions[0].direction = [3, 4]; },
    crime => { crime.actions.push(structuredClone(crime.actions[0])); },
    crime => { crime.participants[0][1].health = 50; },
    crime => { crime.participants.push(['nobody-here', structuredClone(crime.participants[0][1])]); },
    crime => { crime.sequence = -1; },
    crime => { delete crime.evades; },
  ];
  for (const change of variants) {
    const bad = structuredClone(current);change(bad.payload.crime);
    assert.equal(live.world.restore(seal(bad)).ok, false, change.toString());
    assert.deepEqual(live.world.checkpoint(), was);
  }
  const misversioned = structuredClone(current);misversioned.version = 16;
  assert.equal(live.world.restore(seal(misversioned)).ok, false, 'v17 crime cannot ride in a v16 envelope');
});

test('evade and attack messages are exact: forged or extra fields change nothing', () => {
  const f = town();open(f);landed(f);
  const before = JSON.stringify(f.world.snapshot().crime);
  for (const message of [{ direction: 'up' }, { direction: 1 }, { evadeId: 'short' }, { evadeId: 'x'.repeat(65) }, { until: 99 }, { userId: BOB }, { position: [RX, RN] }])
    assert.equal(f.evade(ALICE, message).error, 'invalid_evade', JSON.stringify(message));
  assert.equal(JSON.stringify(f.world.snapshot().crime), before);
});

// #640 review: surrender is not a free evade, a snapshot never shows an unresolved contact as
// done, and a restored town neither lands a contact it slept through nor keeps stale health.
test('surrendering mid-fight does not cancel a telegraphed counter; a surrendered attacker lands nothing', () => {
  const f = town();open(f);landed(f);
  f.later(R.hitReactionMs + 100);
  const counter = f.actions({ kind: 'counter', outcome: null })[0];
  assert.ok(counter, 'the rival telegraphs');
  assert.equal(f.world.command(ALICE, { type: 'surrender' }).ok, true);
  f.later(R.counterWindupMs);
  // Surrender itself never cancels it. Police 4 m away may take hold of her first: then it ends
  // because she is being arrested, which costs her the arrest, not nothing.
  const outcome = f.action(counter.id);
  assert.notEqual(outcome.reason, 'surrendered');
  assert.ok(outcome.outcome === 'hit' || outcome.reason === 'captured', JSON.stringify(outcome));
  if (outcome.reason === 'captured') { f.later(2000); assert.equal(f.stars(ALICE), 0, 'the capture completed'); }
  // Wanted from a first hit, Alice strikes again and surrenders during the windup.
  const g = town();open(g);landed(g);g.later(R.cooldownMs);
  const second = g.attack(ALICE);
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(g.world.command(ALICE, { type: 'surrender' }).ok, true);
  g.later(R.strikeWindupMs + 50);
  assert.deepEqual([g.action(second.action.id).outcome, g.action(second.action.id).reason], ['cancelled', 'surrendered']);
  assert.equal(g.rival().health, 75, 'only the first hit counted');
});

test('a snapshot reports an unresolved contact as contact, never done', () => {
  const f = town();open(f);
  const strike = f.attack(ALICE).action;
  // The town has not stepped since: the clock alone runs past the action's end.
  f.clock.time += R.cooldownMs + 500;
  const shown = f.world.snapshot().crime.actions.find(action => action.id === strike.id);
  assert.equal(shown.outcome, null);
  assert.equal(shown.phase, 'contact', JSON.stringify(shown));
});

test('a restored town cancels contacts it slept through and heals anyone no longer fighting', () => {
  const f = town();open(f);landed(f);f.later(R.hitReactionMs + 100);
  const counter = f.actions({ kind: 'counter', outcome: null })[0];
  assert.ok(counter);
  // A writer outage longer than the telegraph: the replacement wakes after contact was due.
  const g = town({ restore: f.world.checkpoint(), time: f.clock.time + R.counterWindupMs + 5000 });
  assert.deepEqual([g.action(counter.id).outcome, g.action(counter.id).reason], ['cancelled', 'interrupted']);
  assert.equal(g.health(ALICE), 100, 'nobody is hit for a pause they could not react to');
  // A player record that kept health without a participant entry is whole again on restore.
  const h = town();open(h);landed(h);h.later(R.hitReactionMs + R.counterWindupMs + 100);
  assert.equal(h.health(ALICE), 80);
  const saved = structuredClone(h.world.checkpoint());
  saved.payload.crime.participants = saved.payload.crime.participants.filter(([id]) => id !== ALICE);
  const k = town({ restore: seal(saved), time: h.clock.time });
  assert.equal(k.health(ALICE), 100);
});
