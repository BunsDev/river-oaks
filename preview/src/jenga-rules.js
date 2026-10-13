// Jenga on the travertine drum by the plaza's curved bench. A tower of eighteen levels
// of three blocks, each level crossing the one below. On your turn you pull one block
// from a level below the top (never the top level, nor the one under it while the top
// is unfinished, nor a level's last block) and lay it on top, finishing the top level
// before a new one starts. A level left with a single block at one edge cannot carry
// what stands on it: pulling that block's neighbour topples the tower. Every other pull
// is a test of a steady hand. zone() is the width of the safe zone on the sheet's timing
// meter, and it narrows as the tower grows taller and weaker and as the level carries
// more. The plaza regulars read the same number as their odds. Whoever topples the
// tower loses the round.
//
// Levels count from the bottom (1), slots across a level a, b, c. A pull is written with
// its outcome ('7b' stood, '7b!' fell), so a game replays exactly. Pure and
// dependency-free, like the other table games.

export const LEVELS = 18, SLOTS = 3;
const LETTERS = 'abc';
// The top level fills from the middle out.
const FILL = [1, 0, 2];
// How much each level already pulled from narrows every later pull's safe zone.
export const WEAKENING = 0.008;

export const startTower = ({ players = 2 } = {}) => ({ levels: Array.from({ length: LEVELS }, () => [true, true, true]), players, turn: 0, pulls: 0, fallen: null });

const count = level => level.filter(Boolean).length;
export const topLevel = state => state.levels.findLastIndex(level => count(level) > 0);
// The highest level you may pull from: below the top level, and below the one under it
// while the top is unfinished.
const ceiling = state => { const top = topLevel(state); return count(state.levels[top]) === SLOTS ? top - 1 : top - 2; };
const lone = (level, slot) => { const left = level.slice(); left[slot] = false; return count(left) === 1 && !left[1]; };

export const notation = ({ level, slot, fell }) => `${level + 1}${LETTERS[slot]}${fell ? '!' : ''}`;
export function parse(text) {
  const match = /^(\d+)([abc])(!?)$/.exec(text ?? '');
  if (!match) throw new Error(`Unreadable pull ${text}`);
  return { level: Number(match[1]) - 1, slot: LETTERS.indexOf(match[2]), fell: match[3] === '!' };
}

// Pulls the rules allow now. A fatal one is allowed (the tower simply falls).
export function legalPulls(state) {
  if (state.fallen) return [];
  const pulls = [], top = ceiling(state);
  for (let level = 0; level <= top; level++) {
    for (let slot = 0; slot < SLOTS; slot++) {
      if (state.levels[level][slot] && count(state.levels[level]) > 1) pulls.push({ level, slot, fatal: lone(state.levels[level], slot) });
    }
  }
  return pulls;
}

// The steady-hand safe zone for a pull, as a share of the meter (0 when it can only fall).
export function zone(state, { level, slot }) {
  const row = state.levels[level];
  if (lone(row, slot)) return 0;
  const top = topLevel(state), load = (top - level) / Math.max(1, top);
  const weak = state.levels.slice(0, top).filter(other => count(other) < SLOTS).length;
  // A middle block of a full level slides out easily; the last of two leaves a level on one block.
  const shape = count(row) === SLOTS ? (slot === 1 ? 0.1 : 0) : -0.14;
  const width = 0.42 + shape - load * 0.1 - weak * WEAKENING - Math.max(0, state.levels.length - LEVELS) * 0.009;
  return Math.round(Math.min(0.55, Math.max(0.06, width)) * 1000) / 1000;
}

// Plays a pull with its outcome. A steady pull lays the block on top; an unsteady or fatal one
// topples the tower, and its puller loses.
export function pull(state, { level, slot, steady = true }) {
  const legal = legalPulls(state).find(option => option.level === level && option.slot === slot);
  if (!legal) throw new Error(`Illegal pull ${notation({ level, slot })}`);
  if (legal.fatal || !steady) return { ...state, pulls: state.pulls + 1, fallen: { by: state.turn, level, slot, fatal: legal.fatal } };
  const levels = state.levels.map(row => row.slice());
  levels[level][slot] = false;
  let top = levels.length - 1;
  if (count(levels[top]) === SLOTS) { levels.push([false, false, false]); top++; }
  levels[top][FILL.find(index => !levels[top][index])] = true;
  return { ...state, levels, turn: (state.turn + 1) % state.players, pulls: state.pulls + 1 };
}

export function replay(moves = [], { players = 2 } = {}) {
  let state = startTower({ players });
  const played = [];
  for (const text of moves) {
    const move = parse(text), player = state.turn;
    state = pull(state, { level: move.level, slot: move.slot, steady: !move.fell });
    if (Boolean(state.fallen) !== move.fell) throw new Error(`Pull ${text} does not match its outcome`);
    played.push({ ...move, player, text });
  }
  return { state, played };
}

export const outcome = state => state.fallen ? { loser: state.fallen.by, fatal: state.fallen.fatal } : null;
export const blocks = state => state.levels.reduce((sum, row) => sum + count(row), 0);
