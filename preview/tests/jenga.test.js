import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, blocks, legalPulls, notation, outcome, parse, pull, replay, startTower, topLevel, zone } from '../src/jenga-rules.js';
import { choosePull, steadiness, steadyFor } from '../src/jenga-opponent.js';

const at = (state, text) => { const { level, slot } = parse(text); return { level, slot }; };

test('the tower: eighteen full levels; never the top level, the one under an unfinished top, or a last block', () => {
  let state = startTower();
  assert.equal(blocks(state), 54);
  assert.equal(topLevel(state), LEVELS - 1);
  assert.ok(!legalPulls(state).some(option => option.level === LEVELS - 1), 'the top level is never pulled');
  assert.equal(legalPulls(state).length, (LEVELS - 1) * 3);
  // A pull lays the block on a new top level, from the middle out: now level 18 is protected too.
  state = pull(state, at(state, '5b'));
  assert.deepEqual(state.levels[LEVELS], [false, true, false]);
  assert.equal(state.turn, 1);
  assert.ok(!legalPulls(state).some(option => option.level >= LEVELS - 1), 'the level under an unfinished top is protected');
  state = pull(state, at(state, '6b'));
  state = pull(state, at(state, '7b'));
  assert.deepEqual(state.levels[LEVELS], [true, true, true], 'the top level fills before a new one starts');
  assert.ok(legalPulls(state).some(option => option.level === LEVELS - 1), 'once the top is finished, the level under it opens');
  assert.equal(blocks(state), 54, 'blocks move; none is lost');
  // A level down to one block keeps it.
  let thin = startTower();
  thin = pull(thin, at(thin, '3a'));
  thin = pull(thin, at(thin, '3c'));
  assert.ok(!legalPulls(thin).some(option => option.level === 2), 'the last block of a level stays');
});

test('a single edge block cannot carry the tower: pulling its neighbour topples it, whoever pulls', () => {
  let state = startTower({ players: 3 });
  state = pull(state, at(state, '4a'));
  const fatal = legalPulls(state).find(option => option.level === 3 && option.slot === 1);
  assert.equal(fatal.fatal, true);
  assert.equal(zone(state, fatal), 0);
  assert.equal(legalPulls(state).find(option => option.level === 3 && option.slot === 2).fatal, false, 'leaving the middle alone stands');
  const fallen = pull(state, { level: 3, slot: 1, steady: true });
  assert.deepEqual(outcome(fallen), { loser: 1, fatal: true });
  assert.deepEqual(legalPulls(fallen), []);
  // An unsteady hand topples it too.
  assert.deepEqual(outcome(pull(startTower(), { level: 0, slot: 0, steady: false })), { loser: 0, fatal: false });
});

test('the safe zone narrows as the tower weakens, grows and carries more', () => {
  const state = startTower();
  const middle = zone(state, at(state, '9b')), edge = zone(state, at(state, '9a'));
  assert.ok(middle > edge, 'a middle block of a full level slides out more easily');
  assert.ok(zone(state, at(state, '2b')) < zone(state, at(state, '16b')), 'a low level carries more of the tower');
  let weak = state;
  for (const text of ['2a', '3a', '4a', '5a', '6a', '7a']) weak = pull(weak, at(weak, text));
  assert.ok(zone(weak, at(weak, '12b')) < zone(state, at(state, '12b')), 'weakened levels make every pull harder');
  // Level 2 is down to b and c: taking b would leave c alone at the edge; taking c leaves the middle.
  assert.equal(zone(weak, at(weak, '2b')), 0);
  assert.ok(zone(weak, at(weak, '2c')) < edge, 'leaving a level on its middle block is the hardest pull that still stands');
  for (const option of legalPulls(weak)) { const width = zone(weak, option); assert.ok(option.fatal ? width === 0 : width >= 0.06 && width <= 0.55); }
});

test('games replay exactly from their pulls and outcomes, and reject a mismatch', () => {
  let state = startTower({ players: 3 });
  const record = [];
  for (const text of ['9b', '4a', '12c', '6b']) { const move = at(state, text); state = pull(state, move); record.push(notation({ ...move, fell: false })); }
  const fell = { level: 3, slot: 1 };
  state = pull(state, { ...fell, steady: true });
  record.push(notation({ ...fell, fell: true }));
  assert.deepEqual(record, ['9b', '4a', '12c', '6b', '4b!']);
  assert.deepEqual(replay(record, { players: 3 }).state, state);
  assert.equal(replay(record, { players: 3 }).played.at(-1).player, 1);
  assert.throws(() => replay(['4a', '4b'], { players: 3 }), /does not match/, 'a fatal pull must be written as a fall');
  assert.throws(() => replay(['18b']), /Illegal pull/);
});

test('the regulars pull the loosest block, never a fatal one, with odds from the same zone', () => {
  for (const seed of [1, 7, 123_456_789, 2 ** 31, 2 ** 32 - 1]) {
    let state = startTower({ players: 3 }), stood = 0;
    for (let guard = 0; guard < 200 && !state.fallen; guard++) {
      const choice = choosePull(state, seed);
      assert.ok(choice, `seed ${seed} always has a pull`);
      const option = legalPulls(state).find(item => item.level === choice.level && item.slot === choice.slot);
      assert.ok(option && (!option.fatal || legalPulls(state).every(item => item.fatal)), 'never a fatal pull while a safe one remains');
      assert.equal(steadyFor(state, choice, seed), steadyFor(state, choice, seed), 'deterministic');
      state = pull(state, { ...choice, steady: steadyFor(state, choice, seed) });
      if (!state.fallen) stood++;
    }
    assert.ok(state.fallen, `seed ${seed}: the tower falls in the end`);
    assert.ok(stood >= 3, `seed ${seed}: the regulars manage a few pulls first (${stood})`);
  }
  assert.equal(steadiness(0), 0);
  assert.ok(steadiness(0.5) > steadiness(0.1));
});
