// The plaza regulars at Yacht weigh every box against what it usually earns (its par),
// so a zero in ones costs little and a zero in yacht a lot. After each roll they look one
// roll ahead: for every choice of dice to keep, the average of the best box over every
// way the others could fall. They roll again while that beats scoring now.
import { DICE, ROLLS, openBoxes, scoreFor } from './yacht-rules.js';

export const PAR = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17, fullHouse: 18, fourKind: 14, littleStraight: 16, bigStraight: 16, choice: 22, yacht: 20 };

const best = (boxes, dice) => { let top = { box: boxes[0], value: -Infinity }; for (const box of boxes) { const value = scoreFor(box, dice) - PAR[box]; if (value > top.value || (value === top.value && PAR[box] < PAR[top.box])) top = { box, value }; } return top; };

// The average best value after rerolling the dice not kept.
function expectation(boxes, dice, keep) {
  const free = keep.flatMap((kept, i) => (kept ? [] : [i])), outcomes = 6 ** free.length, next = dice.slice();
  let total = 0;
  for (let n = 0; n < outcomes; n++) {
    let code = n;
    for (const i of free) { next[i] = 1 + (code % 6); code = Math.floor(code / 6); }
    total += best(boxes, next).value;
  }
  return total / outcomes;
}

export function chooseMove(state) {
  if (state.rolls === 0) return 'roll';
  const boxes = openBoxes(state.sheets[state.turn]), now = best(boxes, state.dice);
  if (state.rolls < ROLLS) {
    let top = null;
    // Masks that keep the same faces are the same choice: try each once.
    const seen = new Set();
    for (let mask = 0; mask < 2 ** DICE - 1; mask++) {
      const keep = Array.from({ length: DICE }, (_, i) => Boolean(mask & (1 << (DICE - 1 - i))));
      const kept = state.dice.filter((_, i) => keep[i]).sort().join();
      if (seen.has(kept)) continue;
      seen.add(kept);
      const value = expectation(boxes, state.dice, keep);
      if (!top || value > top.value) top = { keep, value };
    }
    if (top.value > now.value + 0.5) return `roll:${top.keep.map(kept => (kept ? 1 : 0)).join('')}`;
  }
  return `score:${now.box}`;
}
