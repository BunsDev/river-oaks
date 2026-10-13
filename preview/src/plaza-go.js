import './plaza-table-games.css';
import './plaza-go.css';
import { attachGuide } from './salon-guide.js';
import { groveSeat } from './plaza-salon-plan.js';
import { SIZE, areaScore, isLegal, pointName, pointOf, replay } from './go-rules.js';
import { chooseMove } from './go-opponent.js';
import { createWorkerThinker } from './plaza-table-games.js';

// Go (9×9) at the small grove table, for whoever sits down: against the plaza regular
// (Monte Carlo, thinking in a worker) or pass-and-play, as black or white. A practice
// game kept in this browser; the table's goban mirrors it. X opens the board.

const SVG = 'http://www.w3.org/2000/svg', SPACE = 42, EDGE = 30, VIEW = EDGE * 2 + SPACE * (SIZE - 1);
const COLOUR = { b: 'Black', w: 'White' };

export function createPlazaGo({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  think = createWorkerThinker(), budget = 700, replyDelay = 300, onSwitch = null } = {}) {
  let game = null, generation = 0, thinking = false, cursor = 40;

  const panel = document.createElement('dialog');
  panel.id = 'go-panel'; panel.className = 'table-game-panel go-panel';
  panel.setAttribute('aria-labelledby', 'go-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="go-title">Go in the grove</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the Go board">×</button></header>
    <div class="table-game-body go-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-grove-game="mancala" aria-pressed="false">Mancala</button><button type="button" data-grove-game="go" aria-pressed="true">Go</button><button type="button" data-grove-game="chineseCheckers" aria-pressed="false">Chinese checkers</button><button type="button" data-grove-game="xiangqi" aria-pressed="false">Xiangqi</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="go-scores" aria-label="Captures and score"></ul>
      <svg class="go-board" viewBox="0 0 ${VIEW} ${VIEW}" role="grid" aria-label="Go board, nine by nine"></svg>
      <div class="table-game-actions">
        <button type="button" data-go-action="pass">Pass</button><button type="button" data-go-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-go-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-go-mode="pass" aria-pressed="false">Pass and play</button></div>
        <div class="table-game-mode" role="group" aria-label="You play"><button type="button" data-go-side="b" aria-pressed="true">Black</button><button type="button" data-go-side="w" aria-pressed="false">White</button></div>
      </div>
      <p class="table-game-note">Surround territory and capture stones; two passes end the game, scored by area with 7.5 komi. Play out dead groups before you pass.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'go');
  const $ = selector => panel.querySelector(selector);
  const board = $('.go-board'), status = $('.table-game-status');

  const round = () => replay(game.moves);
  const yours = state => game.mode === 'pass' || state.turn === game.you;
  const who = colour => game.mode === 'pass' ? COLOUR[colour] : colour === game.you ? 'You' : 'The plaza regular';
  const newGame = (keep = {}) => { game = { moves: [], mode: keep.mode ?? game?.mode ?? 'regular', you: keep.you ?? game?.you ?? 'b', chair: keep.chair ?? game?.chair ?? 0, wins: keep.wins ?? game?.wins ?? { b: 0, w: 0 }, scored: false }; cursor = 40; };
  // Black sits in your chair when you play black, in the other one when you play white.
  const blackChair = () => (game.you === 'b' ? game.chair : 1 - game.chair);
  const mirror = () => { if (game) getMirror()?.show(round().state, blackChair()); };
  // The board from your side: row 1 at the bottom for black, at the top for white.
  const viewer = state => (game.mode === 'pass' ? state.turn : game.you);
  const xy = (index, side) => { const row = Math.floor(index / SIZE), column = index % SIZE, flip = side === 'w'; return [EDGE + (flip ? SIZE - 1 - column : column) * SPACE, EDGE + (flip ? row : SIZE - 1 - row) * SPACE]; };
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };

  function render() {
    if (!game) return;
    const active = document.activeElement, hadFocus = panel.contains(active), focusedPoint = board.contains(active) ? active.dataset.goPoint : null;
    const { state } = round(), side = viewer(state), open = !thinking && yours(state) && !state.over;
    if (state.over && !game.scored) { game.scored = true; game.wins[state.over.winner] += 1; }
    const nodes = [el('rect', { class: 'go-wood', x: 0, y: 0, width: VIEW, height: VIEW, rx: 10 })];
    for (let i = 0; i < SIZE; i++) {
      const a = EDGE + i * SPACE, far = EDGE + (SIZE - 1) * SPACE;
      nodes.push(el('line', { class: 'go-line', x1: EDGE, y1: a, x2: far, y2: a }), el('line', { class: 'go-line', x1: a, y1: EDGE, x2: a, y2: far }));
    }
    for (const name of ['c3', 'g3', 'c7', 'g7', 'e5']) { const [x, y] = xy(pointOf(name), side); nodes.push(el('circle', { class: 'go-star', cx: x, cy: y, r: 3.5 })); }
    for (let index = 0; index < SIZE * SIZE; index++) {
      const [x, y] = xy(index, side), stone = state.board[index], name = pointName(index), legal = open && isLegal(state, index);
      const point = el('g', { class: 'go-point', 'data-go-point': name, role: 'gridcell', tabindex: index === cursor ? 0 : -1,
        'aria-label': `${name}: ${stone ? `${COLOUR[stone].toLowerCase()} stone` : legal ? 'empty, playable' : 'empty'}` });
      point.append(el('circle', { class: 'go-hit', cx: x, cy: y, r: SPACE / 2 }));
      if (legal) point.dataset.open = '';
      if (stone) point.append(el('circle', { class: `go-stone go-${stone}`, cx: x, cy: y, r: SPACE / 2 - 2 }));
      if (state.last?.index === index) point.append(el('circle', { class: 'go-last', cx: x, cy: y, r: 7 }));
      nodes.push(point);
    }
    board.replaceChildren(...nodes);
    status.textContent = describe(state);
    panel.dataset.state = state.over ? 'over' : thinking ? 'thinking' : 'playing';
    const score = state.over?.score ?? areaScore(state.board);
    $('.go-scores').replaceChildren(...['b', 'w'].map(colour => { const item = document.createElement('li'); item.textContent = `${who(colour)} (${COLOUR[colour].toLowerCase()}): ${state.captures[colour]} taken · ${score[colour]} by area`; return item; }));
    $('[data-go-action="pass"]').setAttribute('aria-disabled', String(!open));
    $('[data-go-action="new"]').hidden = !state.over;
    for (const button of panel.querySelectorAll('[data-go-mode]')) button.setAttribute('aria-pressed', String(button.dataset.goMode === game.mode));
    for (const button of panel.querySelectorAll('[data-go-side]')) { button.setAttribute('aria-pressed', String(button.dataset.goSide === game.you)); button.disabled = game.mode === 'pass'; }
    for (const button of panel.querySelectorAll('[data-grove-game]')) button.setAttribute('aria-pressed', String(button.dataset.groveGame === 'go'));
    if (hadFocus && !panel.contains(document.activeElement)) (board.querySelector(`[data-go-point="${focusedPoint}"]`) ?? board.querySelector('[tabindex="0"]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  function describe(state) {
    if (state.over) {
      const { score, winner, margin } = state.over;
      return `${who(winner)} ${who(winner) === 'You' ? 'win' : 'wins'} by ${margin} (black ${score.b}, white ${score.w}).`;
    }
    const last = state.last, before = last ? (last.pass ? `${who(last.colour)} passed. ` : last.captured ? `${who(last.colour)} captured ${last.captured}. ` : '') : '';
    if (thinking || !yours(state)) return `${before}${who(state.turn)} is thinking…`;
    return `${before}${game.mode === 'pass' ? `${COLOUR[state.turn]} to play.` : `Your move, as ${COLOUR[state.turn].toLowerCase()}.`} Choose a point, or pass.`;
  }

  async function regular() {
    const ticket = ++generation;
    thinking = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.over || yours(state)) break;
        render();
        const [reply] = await Promise.all([think({ game: 'go', position: state, budget }), new Promise(resolve => setTimeout(resolve, replyDelay))]);
        if (ticket !== generation) return;
        // Without a worker (or if it fails), think here with a smaller budget.
        const move = reply ?? chooseMove(state, { budget: Math.round(budget / 3) });
        game.moves.push(move === 'pass' ? 'pass' : pointName(move)); mirror();
      }
    } finally { if (ticket === generation) { thinking = false; render(); } }
  }

  function playAt(name) {
    const { state } = round();
    if (thinking || state.over || !yours(state)) return;
    if (name !== 'pass' && !isLegal(state, pointOf(name))) return;
    if (name !== 'pass') cursor = pointOf(name);
    game.moves.push(name); mirror(); render(); void regular();
  }

  board.addEventListener('click', event => { const point = event.target.closest('[data-go-point][data-open]'); if (point) playAt(point.dataset.goPoint); });
  board.addEventListener('keydown', event => {
    const point = event.target.closest('[data-go-point]');
    if (!point) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); playAt(point.dataset.goPoint); return; }
    const flip = viewer(round().state) === 'w' ? -1 : 1, step = { ArrowUp: [SIZE * flip, 0], ArrowDown: [-SIZE * flip, 0], ArrowLeft: [-flip, 1], ArrowRight: [flip, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = pointOf(point.dataset.goPoint), next = index + step[0];
    if (next < 0 || next >= SIZE * SIZE || (step[1] && Math.floor(next / SIZE) !== Math.floor(index / SIZE))) return;
    cursor = next; point.setAttribute('tabindex', '-1');
    const target = board.querySelector(`[data-go-point="${pointName(next)}"]`); target?.setAttribute('tabindex', '0'); target?.focus();
  });
  $('[data-go-action="pass"]').addEventListener('click', () => { if ($('[data-go-action="pass"]').getAttribute('aria-disabled') !== 'true') playAt('pass'); });
  $('[data-go-action="new"]').addEventListener('click', () => { generation++; thinking = false; newGame({}); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-go-mode]')) button.addEventListener('click', () => { if (game.mode === button.dataset.goMode) return; generation++; thinking = false; newGame({ mode: button.dataset.goMode, wins: { b: 0, w: 0 } }); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-go-side]')) button.addEventListener('click', () => { if (game.you === button.dataset.goSide) return; generation++; thinking = false; newGame({ you: button.dataset.goSide, wins: { b: 0, w: 0 } }); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-grove-game]')) button.addEventListener('click', () => { if (button.dataset.groveGame !== 'go') onSwitch?.(button.dataset.groveGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; thinking = false; panel.close(); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    if (!game || game.chair !== seat.chair) newGame({ chair: seat.chair, you: 'b', wins: { b: 0, w: 0 } });
    panel.show(); mirror(); render(); void regular();
    (board.querySelector('[tabindex="0"]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the Go board' : 'Play Go', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && getSeat()?.chair !== game?.chair) close(); },
    open, close, mirror,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, mode: game.mode, you: game.you, chair: game.chair, turn: state.turn, stones: state.board.filter(Boolean).length, moves: game.moves.slice(),
        passes: state.passes, captures: { ...state.captures }, over: state.over, thinking, status: status.textContent };
    },
    // Starts afresh (for tests), keeping the mode and colour.
    reset() { if (!game) return false; generation++; thinking = false; newGame({}); mirror(); render(); void regular(); return true; },
  };
}

export const seatAtGroveGo = pose => groveSeat(pose?.sitting?.buildId);
