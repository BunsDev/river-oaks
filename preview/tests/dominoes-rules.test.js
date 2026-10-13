import test from 'node:test';
import assert from 'node:assert/strict';
import { TILES, deal, ends, findMove, handPips, legalMoves, makeMove, notation, pips, publicView, replay, startRound } from '../src/dominoes-rules.js';

// A round from a hand-made deal, for positions a seed would take long to find.
const round = (hands, { boneyard = [], line = [], turn = 0, passes = 0 } = {}) => ({ seed: 0, players: hands.length, hands, boneyard, line, turn, lead: null, passes, over: null });
const placed = (id, left, right) => ({ id, left, right });

test('a double-six set: 28 different tiles, 168 pips', () => {
  assert.equal(TILES.length, 28);
  assert.equal(new Set(TILES).size, 28);
  assert.equal(TILES.reduce((sum, tile) => sum + pips(tile), 0), 168);
});

test('deals: seven each, a fourteen-tile boneyard for two, none for four; seeds repeat', () => {
  for (const players of [2, 4]) {
    const { hands, boneyard } = deal(7, players);
    assert.deepEqual(hands.map(hand => hand.length), Array(players).fill(7));
    assert.equal(boneyard.length, 28 - 7 * players);
    assert.equal(new Set([...hands.flat(), ...boneyard]).size, 28);
    assert.deepEqual(deal(7, players), { hands, boneyard }, 'the same seed deals the same hands');
  }
  assert.notDeepEqual(deal(7, 2), deal(8, 2));
  assert.throws(() => deal(1, 3), /two or four/);
});

test('the highest double leads, and the first move must play it', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const state = startRound(seed, 2), doubles = state.hands.flat().filter(tile => tile.split('-')[0] === tile.split('-')[1]);
    if (doubles.length) assert.equal(state.lead, doubles.sort().at(-1), `seed ${seed}`);
    assert.ok(state.hands[state.turn].includes(state.lead));
    assert.deepEqual(legalMoves(state).map(notation), [`R:${state.lead}`]);
  }
  assert.equal(startRound(3, 4).lead, '6-6', 'with every tile dealt, someone holds the double six');
});

test('tiles join matching ends, turned to fit; a double-ended line offers one side', () => {
  const state = round([['2-5', '3-6', '1-1'], ['0-0']], { line: [placed('4-5', 4, 5), placed('5-2', 5, 2)] });
  assert.deepEqual(legalMoves(state).map(notation).sort(), ['R:2-5']);
  const joined = makeMove(state, findMove(state, 'R:2-5'));
  assert.deepEqual(joined.line.at(-1), { id: '2-5', left: 2, right: 5 });
  assert.deepEqual(ends(joined), [4, 5]);
  const both = round([['3-4', '0-1'], ['0-0']], { line: [placed('3-3', 3, 3)] });
  assert.deepEqual(legalMoves(both).map(notation), ['L:3-4']);
  const left = makeMove(both, findMove(both, 'L:3-4'));
  assert.deepEqual(left.line[0], { id: '3-4', left: 4, right: 3 });
});

test('without a play: draw from the boneyard (two players) or pass (four)', () => {
  const draw = round([['0-1'], ['5-5']], { line: [placed('6-6', 6, 6)], boneyard: ['2-6', '3-3'] });
  assert.deepEqual(legalMoves(draw).map(notation), ['draw']);
  const drawn = makeMove(draw, { kind: 'draw' });
  assert.equal(drawn.turn, 0, 'the drawing player keeps the turn');
  assert.deepEqual(legalMoves(drawn).map(notation), ['L:2-6']);
  const pass = round([['0-1'], ['5-5'], ['1-2'], ['2-3']], { line: [placed('6-6', 6, 6)] });
  assert.deepEqual(legalMoves(pass).map(notation), ['pass']);
  assert.equal(makeMove(pass, { kind: 'pass' }).turn, 1);
});

test('playing the last tile wins the pips left in the other hands', () => {
  const state = round([['4-6'], ['1-2', '0-3'], ['5-5'], ['0-0']], { line: [placed('6-6', 6, 6)] });
  const won = makeMove(state, findMove(state, 'L:4-6'));
  assert.deepEqual(won.over, { winner: 0, reason: 'domino', points: 3 + 3 + 10 + 0 });
  assert.deepEqual(legalMoves(won), []);
});

test('a blocked round goes to the lightest hand; a shared lightest scores nothing', () => {
  const blocked = round([['0-1'], ['2-2'], ['1-3'], ['0-0']], { line: [placed('6-6', 6, 6)], turn: 3, passes: 3 });
  assert.deepEqual(makeMove(blocked, { kind: 'pass' }).over, { winner: 3, reason: 'blocked', points: 1 + 4 + 4 });
  const tied = round([['0-1'], ['1-0']], { line: [placed('6-6', 6, 6)], turn: 1, passes: 1 });
  assert.deepEqual(makeMove(tied, { kind: 'pass' }).over, { winner: null, reason: 'blocked', points: 0 });
});

test('rounds replay exactly from their seed and moves, and always end', () => {
  for (let seed = 1; seed <= 60; seed++) for (const players of [2, 4]) {
    let state = startRound(seed, players);
    const moves = [];
    while (!state.over) { const options = legalMoves(state), move = options[seed % options.length]; moves.push(notation(move)); state = makeMove(state, move); }
    assert.equal(state.hands.flat().length + state.boneyard.length + state.line.length, 28, 'no tile lost or doubled');
    assert.deepEqual(replay(seed, players, moves).state, state);
  }
  assert.throws(() => replay(5, 2, ['L:6-6']), /Illegal move/);
});

test('a player sees their hand, the line and what others could not follow', () => {
  // Player 1 cannot follow a 6 and draws; that tells the others player 1 lacks sixes.
  const seed = [...Array(200).keys()].find(s => { const state = startRound(s + 1, 2); return state.lead === '6-6' && legalMoves(makeMove(state, findMove(state, 'R:6-6')))[0].kind === 'draw'; }) + 1;
  const { state, played } = replay(seed, 2, ['R:6-6', 'draw']);
  const view = publicView(state, played, state.turn === 0 ? 0 : 1);
  assert.ok(view.lacks[startRound(seed, 2).turn === 0 ? 1 : 0].includes(6));
  assert.equal(view.hand.length, state.hands[state.turn === 0 ? 0 : 1].length);
  assert.equal(view.boneyard, 13);
  assert.equal(handPips(['1-2', '3-3']), 9);
});
