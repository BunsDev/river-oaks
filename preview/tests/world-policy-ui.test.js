import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorldPolicy, riskAt } from '../src/world-policy.js';
import { describeChange, describePolicy, describeRisk, formatMinute, parseTime } from '../src/world-policy-ui.js';

const W = 'river-oaks';
const rules = violence => { const value = defaultWorldPolicy();Object.assign(value.violence, violence);return value; };

test('times read and write as 24-hour hours and minutes', () => {
  assert.deepEqual([0, 59, 360, 1080, 1439].map(formatMinute), ['00:00', '00:59', '06:00', '18:00', '23:59']);
  assert.deepEqual(['00:00', '06:00', '23:59'].map(parseTime), [0, 360, 1439]);
  for (const bad of ['24:00', '12:60', '6:00', '', null, undefined, '12:00:00']) assert.equal(parseTime(bad), null, String(bad));
});

test('players are told the rules, why they changed and their risk in plain words', () => {
  assert.equal(describePolicy(defaultWorldPolicy(), W), 'The town is peaceful everywhere.');
  assert.equal(describePolicy(rules({ mode: 'scheduled', zones: [] }), W), 'The town is peaceful everywhere.', 'no zones is peaceful');
  const night = rules({ mode: 'scheduled', zones: ['westcreek-lane', 'south-service-lane'] });
  assert.equal(describePolicy(night, W), 'Danger is on in Westcreek Lane and South service lane from 18:00 to 06:00. Everywhere else stays safe.');
  assert.match(describePolicy(rules({ mode: 'forced', zones: ['westcreek-lane'], pvp: true }), W), /at all hours, including between players/);
  assert.match(describeChange({ ...night, lastChange: { kind: 'update', revision: 1, at: 1 } }, W), /^Jevica changed the world rules\. Danger is on/);
  assert.equal(describeChange({ ...night, lastChange: { kind: 'emergency_off', revision: 2, at: 2 } }, W), 'Jevica turned danger off everywhere. The town is peaceful.');
  const place = (east, north) => ({ position: [east, north, 18], levelId: null, indoors: false });
  const atNight = { ...night, clock: { dayMs: 23 * 3_600_000, rate: 1 } };
  assert.equal(describeRisk(riskAt(W, atNight, place(-2910, -1300)), atNight), 'Danger zone: Westcreek Lane until 06:00. Head to a safe place to stay out of trouble.');
  assert.equal(describeRisk(riskAt(W, night, place(-2910, -1300)), night), 'Westcreek Lane becomes dangerous at 18:00.');
  assert.equal(describeRisk(riskAt(W, night, place(-2790, -1300)), night), 'Safe here (Plaza).');
  assert.equal(describeRisk(riskAt(W, defaultWorldPolicy(), place(-2910, -1300)), defaultWorldPolicy()), 'Peaceful here.');
});
