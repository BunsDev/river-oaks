import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCommunity } from '../src/community.js';
import { REACTION_RULES, alarmResidents, createResidentLife, stepResidentLife } from '../src/resident-life.js';

// #640 increment 3, the rule on its own: who an alarm reaches, how many, how often, and where a
// fleeing resident goes. The world decides sight; here it is a stub.
const district = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const RR = REACTION_RULES;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ALARM = [-2800, -1440];

function street(routeProvider = null) {
  const life = createResidentLife(district, createCommunity(district, [], { carriage: false }), routeProvider);
  const outdoor = life.state.locals.filter(local => !local.indoor && !local.stationary);
  const park = (index, [east, north]) => {
    const local = outdoor[index];
    local.position = [east, north, life.navigation.ground([east, north])];
    Object.assign(local.life, { route: [], destination: null, waitUntil: Infinity, seat: null });
    return local;
  };
  outdoor.forEach((local, index) => park(index, [-2700 + index % 6 * 3, -1200 - Math.floor(index / 6) * 3]));
  const step = seconds => { for (let t = 0; t < seconds - 1e-9; t += .05) stepResidentLife(life, .05); };
  return { life, outdoor, park, step };
}

test('an alarm reaches the nearest residents in range and in sight, at most the cap, once per cool-off', () => {
  const { life, park } = street();
  const near = Array.from({ length: 8 }, (_, i) => park(i, [ALARM[0] + (i % 2 ? 1 : -1) * .8, ALARM[1] + 3 + i * 2]));
  const far = park(8, [ALARM[0], ALARM[1] + RR.radiusM + 5]);
  const hidden = near[1];
  const sees = (from, to) => from !== hidden.position;
  const reacted = alarmResidents(life, { kind: 'contact', position: [...ALARM, 18] }, { sees });
  assert.deepEqual(reacted, [near[0], near[2], near[3], near[4], near[5], near[6]].map(local => local.id), 'six nearest who can see');
  assert.equal(hidden.life.reaction ?? null, null, 'no line of sight, no reaction');
  assert.equal(far.life.reaction ?? null, null, 'out of range');
  assert.equal(near[7].life.reaction ?? null, null, 'beyond the cap');
  for (const local of reacted.map(id => near.find(item => item.id === id))) {
    assert.equal(local.life.reaction.kind, 'startle'); assert.deepEqual(local.life.reaction.from, ALARM);
    assert.equal(local.life.action, 'stop'); assert.equal(local.life.source, 'safety_override');
  }
  // With six reacting the cap is full: the same alarm again reaches nobody, and the residents
  // already startled are not restarted.
  assert.deepEqual(alarmResidents(life, { kind: 'contact', position: [...ALARM, 18] }, { sees }), [], 'the cap is full');
  for (const local of near.slice(0, 7)) if (local !== hidden) assert.equal(local.life.reaction?.kind, 'startle');
  // Once they have calmed down, the cool-off keeps them from reacting again; the one who was beyond the cap can.
  for (const local of near) if (local.life.reaction) { local.life.reaction = null; }
  assert.deepEqual(alarmResidents(life, { kind: 'contact', position: [...ALARM, 18] }, { sees }), [near[7].id], 'the one who was beyond the cap');
  assert.deepEqual(alarmResidents(life, { kind: 'contact', position: [...ALARM, 18] }, { sees }), []);
  // No alarm during a storm: everyone is already heading for shelter.
  stepResidentLife(life, .05, { storm: true });
  for (const local of near) { local.life.reaction = null; local.life.reactionCooldownUntil = 0; }
  assert.deepEqual(alarmResidents(life, { kind: 'contact', position: [...ALARM, 18] }, { sees }), [], 'a storm');
  stepResidentLife(life, .05, { storm: false });
  // A wanted player alarms only at close range.
  const { life: life2, park: park2 } = street();
  const close = park2(0, [ALARM[0], ALARM[1] + RR.wantedRadiusM - 1]), notClose = park2(1, [ALARM[0], ALARM[1] + RR.wantedRadiusM + 1]);
  assert.deepEqual(alarmResidents(life2, { kind: 'wanted', position: [...ALARM, 18] }, { sees: () => true }), [close.id]);
  assert.equal(notClose.life.reaction ?? null, null);
});

test('a resident waiting for the help they asked for keeps waiting, and does not take a reaction slot', () => {
  // A resident who has just told Jevica what would help waits for it (held). The alarm must not
  // startle them: the step would drop the reaction at once, and the slot and cool-off it used
  // would shut out a farther bystander who can react (review of #708).
  const { life, park, step } = street();
  const waiting = park(0, [ALARM[0], ALARM[1] + 2]);
  Object.assign(waiting, { priority: true, status: 'needs_help', needKnown: true, lastInteraction: 'talk' });
  step(.1);
  const bystanders = Array.from({ length: RR.cap }, (_, i) => park(i + 1, [ALARM[0] + (i % 2 ? 1 : -1), ALARM[1] + 4 + i * 2]));
  const reacted = alarmResidents(life, { kind: 'contact', position: [...ALARM, 18] }, { sees: () => true });
  assert.equal(waiting.life.reaction ?? null, null, 'the waiting resident is not startled');
  assert.equal(waiting.life.reactionCooldownUntil ?? 0, 0, 'and starts no cool-off');
  assert.deepEqual(reacted, bystanders.map(local => local.id), 'every slot goes to a bystander who can react');
  // Once help has arrived the wait is over, and the same resident can be startled.
  for (const local of bystanders) { local.life.reaction = null; }
  waiting.lastInteraction = 'supply';
  assert.deepEqual(alarmResidents(life, { kind: 'contact', position: [...ALARM, 18] }, { sees: () => true }), [waiting.id]);
});

test('after the startle a resident runs to clear ground away from the alarm, or cowers when there is nowhere to go', () => {
  const { life, park, step } = street();
  const runner = park(0, [ALARM[0], ALARM[1] + 8]);
  alarmResidents(life, { kind: 'contact', position: [...ALARM, 18] }, { sees: () => true });
  step(RR.startleMs / 1000 + .1);
  assert.equal(runner.life.reaction.kind, 'flee');
  step(.3);
  assert.ok(runner.life.route.length, 'a flight has a route');
  const goal = runner.life.route.at(-1);
  assert.ok(distance(goal, ALARM) >= RR.fleeMinM - .5 && distance(goal, ALARM) <= RR.fleeMaxM + 8, `the goal is ${distance(goal, ALARM)} m from the alarm`);
  assert.ok(distance(goal, ALARM) > distance([ALARM[0], ALARM[1] + 8], ALARM) + 4, 'and further from it than the start');
  assert.ok(life.navigation.free(goal) && life.navigation.pedestrian.classify(goal) !== 'road', 'on clear ground off the road');
  step(2);
  assert.ok(runner.life.speed > 1.6, `runs: ${runner.life.speed} m/s`);
  assert.equal(runner.life.status, 'fleeing');
  step(RR.fleeMs / 1000);
  assert.equal(runner.life.reaction, null);
  assert.ok(runner.life.waitUntil > life.elapsed && runner.life.waitUntil < life.elapsed + 10, 'rests briefly, then the routine resumes');
  // Already near the edge of the alarm's reach: the flight still ends farther away than they stood.
  const edge = park(1, [ALARM[0], ALARM[1] + 17]);
  alarmResidents(life, { kind: 'contact', position: [...ALARM, 18] }, { sees: () => true });
  step(RR.startleMs / 1000 + .4);
  assert.equal(edge.life.reaction.kind, 'flee');
  assert.ok(edge.life.route.length, 'a flight from the edge has a route');
  assert.ok(distance(edge.life.route.at(-1), ALARM) >= 19, `never nearer: ${distance(edge.life.route.at(-1), ALARM)} m`);
  // Engaged by the visitor mid-flight: the reaction drops, the cool-off stays.
  life.state.selectedId = edge.id;
  step(.1);
  assert.equal(edge.life.reaction, null); assert.equal(edge.life.status, 'chatting');
  assert.ok(edge.life.reactionCooldownUntil > life.elapsed);
  life.state.selectedId = null;
  // No route anywhere: cower in place.
  const { life: boxed, park: park2, step: step2 } = street(() => null);
  const cowering = park2(0, [ALARM[0], ALARM[1] + 8]);
  alarmResidents(boxed, { kind: 'contact', position: [...ALARM, 18] }, { sees: () => true });
  step2(RR.startleMs / 1000 + .4);
  assert.equal(cowering.life.reaction.kind, 'cower');
  assert.equal(cowering.life.status, 'cowering');
  const where = [...cowering.position];
  step2(RR.cowerMs / 1000 - .3);
  assert.deepEqual(cowering.position, where, 'does not move');
  step2(.5);
  assert.equal(cowering.life.reaction, null);
});
