// The plaza regular at backgammon: it weighs every legal way to play the roll and
// keeps the best by a plain player's sense: race ahead, hit, make points (above
// all in its home board and in front of your back checkers), bear off, and leave
// as few blots as it can within your reach. One ply, deterministic: ties go to
// the play that reads first.
import { BLACK, WHITE, notation, pips } from './backgammon-rules.js';

const sign = player => player === WHITE ? 1 : -1;

// Apply a whole play to a position, mirroring the rules' own bookkeeping.
function after(state, player, play) {
  const points = state.points.slice(), bar = state.bar.slice(), off = state.off.slice(), opponent = player === WHITE ? BLACK : WHITE;
  for (const step of play) {
    if (step.from === 'bar') bar[player]--; else points[step.from] -= sign(player);
    if (step.to === 'off') { off[player]++; continue; }
    if (step.hit) { points[step.to] += sign(player); bar[opponent]++; }
    points[step.to] += sign(player);
  }
  return { ...state, points, bar, off };
}

export function evaluate(state, player) {
  const opponent = player === WHITE ? BLACK : WHITE, own = point => state.points[point] * sign(player);
  let score = (pips(state, opponent) - pips(state, player)) + state.bar[opponent] * 18 + state.off[player] * 9;
  for (let point = 1; point <= 24; point++) {
    const held = own(point);
    if (held >= 2) {
      const home = player === WHITE ? point <= 6 : point >= 19;
      score += home ? 7 : 3;
    } else if (held === 1) {
      // A blot: how many opposing checkers (or entering ones) sit within direct reach of it.
      let shots = 0;
      for (let distance = 1; distance <= 12; distance++) {
        const from = point - distance * (player === WHITE ? -1 : 1);
        const threat = from >= 1 && from <= 24 ? Math.max(0, -own(from)) : (from === (player === WHITE ? 25 : 0) ? state.bar[opponent] : 0);
        if (threat) shots += distance <= 6 ? 3 : 1;
      }
      score -= shots * 3;
    }
  }
  return score;
}

// The rest of the best play: when part of the turn is already played, only plays
// that continue it count, and only their remaining steps are returned.
export function choosePlay(state) {
  const done = state.played ?? [], same = (a, b) => a.from === b.from && a.to === b.to && a.die === b.die;
  const open = (state.plays ?? []).filter(play => play.length > done.length && done.every((step, i) => same(step, play[i])));
  if (!open.length) return [];
  const scored = open.map(play => ({ play, score: evaluate(after(state, state.turn, play.slice(done.length)), state.turn), key: play.map(notation).join(' ') }));
  scored.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return scored[0].play.slice(done.length);
}
