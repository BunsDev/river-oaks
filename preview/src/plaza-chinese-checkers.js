import './plaza-table-games.css';
import './plaza-chinese-checkers.css';
import { attachGuide } from './salon-guide.js';
import { HOLES, MARBLES, NEIGHBOURS, homeCount, movesFrom, notation, replay } from './chinese-checkers-rules.js';
import { chooseMove } from './chinese-checkers-opponent.js';

// Chinese checkers at the small grove table, for whoever sits down: against the plaza
// regular or pass-and-play. Choose one of your marbles and the holes it can reach light
// up; choose one and it steps or hops there, chain and all. A practice game kept in this
// browser; the table's star board mirrors it. X opens the board.

const SVG = 'http://www.w3.org/2000/svg', SPACE = 24, EDGE = 22, ROW = SPACE * Math.sqrt(3) / 2;
const VIEW = { width: EDGE * 2 + SPACE * 12, height: EDGE * 2 + ROW * 16 };
const COLOUR = ['Red', 'Blue'];
// Your point is at the bottom: x across from the middle, y down toward you.
const xy = ([q, r]) => [VIEW.width / 2 + (q + r / 2) * SPACE, VIEW.height / 2 + r * ROW];

export function createPlazaChineseCheckers({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  random = Math.random, replyDelay = 500, legDelay = 170, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, onSwitch = null } = {}) {
  let game = null, generation = 0, thinking = false, selected = null, moving = null, cursor = HOLES.findIndex(([q, r]) => q === -2 && r === 6);

  const panel = document.createElement('dialog');
  panel.id = 'chinese-checkers-panel'; panel.className = 'table-game-panel chinese-checkers-panel';
  panel.setAttribute('aria-labelledby', 'chinese-checkers-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="chinese-checkers-title">Chinese checkers in the grove</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the Chinese checkers board">×</button></header>
    <div class="table-game-body chinese-checkers-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-grove-game="mancala" aria-pressed="false">Mancala</button><button type="button" data-grove-game="go" aria-pressed="false">Go</button><button type="button" data-grove-game="chineseCheckers" aria-pressed="true">Chinese checkers</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="cc-scores" aria-label="Marbles home"></ul>
      <svg class="cc-board" viewBox="0 0 ${VIEW.width.toFixed(1)} ${VIEW.height.toFixed(1)}" role="grid" aria-label="The star board, your point at the bottom"></svg>
      <div class="table-game-actions">
        <button type="button" data-cc-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-cc-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-cc-mode="pass" aria-pressed="false">Pass and play</button></div>
      </div>
      <p class="table-game-note">Step to a neighbouring hole, or hop over any marble to the hole beyond, again and again. Fill the point opposite to win.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'chineseCheckers');
  const $ = selector => panel.querySelector(selector);
  const board = $('.cc-board'), status = $('.table-game-status');

  const round = () => replay(game.moves);
  const yours = state => game.mode === 'pass' || state.turn === 0;
  const who = player => game.mode === 'pass' ? COLOUR[player] : player === 0 ? 'You' : 'The plaza regular';
  const newGame = (keep = {}) => { game = { seed: Math.floor(random() * 2 ** 32), moves: [], mode: keep.mode ?? game?.mode ?? 'regular', chair: keep.chair ?? game?.chair ?? 0, wins: keep.wins ?? game?.wins ?? [0, 0, 0], scored: false }; selected = null; moving = null; };
  // The marbles as they stand, or mid-move with the moving one at its current leg.
  const shown = state => { if (!moving) return state.board; const b = state.board.slice(); b[moving.path[0]] = null; b[moving.path[moving.leg]] = moving.player; return b; };
  const mirror = () => { if (game) getMirror()?.show(shown(round().state), game.chair); };
  const targets = state => (selected === null ? [] : movesFrom(state.board, selected));
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };

  function render() {
    if (!game) return;
    const active = document.activeElement, hadFocus = panel.contains(active), focusedHole = board.contains(active) ? active.dataset.ccHole : null;
    const { state } = round(), over = state.winner !== null || state.draw, open = !thinking && !moving && yours(state) && !over;
    if (over && !game.scored) { game.scored = true; game.wins[state.draw ? 2 : state.winner] += 1; }
    const marbles = shown(state), reach = open ? new Map(targets(state).map(move => [move.to, move])) : new Map();
    const movable = open ? new Set(marbles.flatMap((owner, hole) => (owner === state.turn && movesFrom(state.board, hole).length ? [hole] : []))) : new Set();
    const nodes = [];
    // The star's outline through its six tips and the hexagon's corners (padded by its stroke).
    nodes.push(el('polygon', { class: 'cc-star', points: [[4, -8], [4, -4], [8, -4], [4, 0], [4, 4], [0, 4], [-4, 8], [-4, 4], [-8, 4], [-4, 0], [-4, -4], [0, -4]].map(hole => xy(hole).map(v => v.toFixed(1)).join(',')).join(' ') }));
    HOLES.forEach((hole, index) => {
      const [x, y] = xy(hole), owner = marbles[index], home = hole[1] > 4 ? 0 : hole[1] < -4 ? 1 : null;
      const label = `${owner === null ? 'Empty hole' : `${COLOUR[owner]} marble`}${reach.has(index) ? ', reachable' : ''}${selected === index ? ', chosen' : ''}`;
      const node = el('g', { class: 'cc-hole', 'data-cc-hole': index, role: 'gridcell', tabindex: index === cursor ? 0 : -1, 'aria-label': label });
      if (home !== null) node.dataset.point = home;
      node.append(el('circle', { class: 'cc-hit', cx: x, cy: y, r: SPACE / 2 }), el('circle', { class: 'cc-pit', cx: x, cy: y, r: 4 }));
      if (owner !== null) node.append(el('circle', { class: `cc-marble cc-marble-${owner}`, cx: x, cy: y, r: SPACE * 0.38 }));
      if (movable.has(index)) node.dataset.movable = '';
      if (reach.has(index)) { node.dataset.open = ''; node.append(el('circle', { class: 'cc-reach', cx: x, cy: y, r: SPACE * 0.32 })); }
      if (selected === index) node.dataset.selected = '';
      nodes.push(node);
    });
    // The last move's path.
    const path = moving?.path.slice(0, moving.leg + 1) ?? state.last?.path;
    if (path?.length > 1) nodes.push(el('polyline', { class: 'cc-path', points: path.map(hole => xy(HOLES[hole]).map(v => v.toFixed(1)).join(',')).join(' ') }));
    board.replaceChildren(...nodes);
    status.textContent = describe(state);
    panel.dataset.state = over ? 'over' : thinking || moving ? 'thinking' : 'playing';
    $('.cc-scores').replaceChildren(...[0, 1].map(player => { const item = document.createElement('li'); item.dataset.player = player; item.textContent = `${who(player)}: ${homeCount(state.board, player)} of ${MARBLES} home`; if (!over && state.turn === player) item.dataset.turn = ''; return item; }));
    $('[data-cc-action="new"]').hidden = !over;
    for (const button of panel.querySelectorAll('[data-cc-mode]')) button.setAttribute('aria-pressed', String(button.dataset.ccMode === game.mode));
    if (hadFocus && !panel.contains(document.activeElement)) (board.querySelector(`[data-cc-hole="${focusedHole}"]`) ?? board.querySelector('[tabindex="0"]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  function describe(state) {
    if (state.draw) return `A draw: neither filled the far point in ${state.plies} moves.`;
    if (state.winner !== null) return `${who(state.winner)} ${who(state.winner) === 'You' ? 'fill' : 'fills'} the far point: ${who(state.winner) === 'You' ? 'you win' : 'game'}!`;
    const hops = path => (NEIGHBOURS[path[0]].includes(path[1]) ? 0 : path.length - 1);
    const chain = state.last ? hops(state.last.path) : 0, last = chain ? `${who(state.last.player)} hopped${chain > 1 ? ` ${chain} times in a row` : ''}. ` : '';
    if (moving) return `${who(moving.player)} ${hops(moving.path) ? 'hops' : 'steps'}…`;
    if (thinking || !yours(state)) return `${last}${who(state.turn)} is thinking…`;
    const whose = game.mode === 'pass' ? `${COLOUR[state.turn]} to play. ` : '';
    return `${last}${whose}${selected === null ? 'Choose a marble.' : 'Choose where it goes, or another marble.'}`;
  }

  // Plays a move one leg at a time on the sheet and the table, then records it.
  async function animate(path, player) {
    const ticket = generation;
    moving = { path, leg: 0, player };
    for (let leg = 1; leg < path.length; leg++) {
      if (!reducedMotion) await new Promise(resolve => setTimeout(resolve, legDelay));
      if (ticket !== generation) { moving = null; return false; }
      moving.leg = leg; mirror(); render();
    }
    moving = null; game.moves.push(notation(path)); mirror(); render();
    return true;
  }

  async function choose(hole) {
    const { state } = round();
    if (thinking || moving || !yours(state) || state.winner !== null || state.draw) return;
    const target = targets(state).find(move => move.to === hole);
    if (target) { selected = null; cursor = hole; if (await animate(target.path, state.turn)) void regular(); return; }
    selected = state.board[hole] === state.turn && selected !== hole && movesFrom(state.board, hole).length ? hole : null;
    cursor = hole; render();
  }

  async function regular() {
    const ticket = ++generation;
    thinking = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.winner !== null || state.draw || yours(state)) break;
        render();
        await new Promise(resolve => setTimeout(resolve, replyDelay));
        if (ticket !== generation) return;
        const move = chooseMove(state, game.seed);
        if (!move) break;
        thinking = false;
        if (!await animate(move.split('-').map(Number), state.turn) || ticket !== generation) return;
        thinking = true;
      }
    } finally { if (ticket === generation) { thinking = false; render(); } }
  }

  board.addEventListener('click', event => { const hole = event.target.closest('[data-cc-hole]'); if (hole) void choose(Number(hole.dataset.ccHole)); });
  board.addEventListener('keydown', event => {
    const hole = event.target.closest('[data-cc-hole]');
    if (!hole) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void choose(Number(hole.dataset.ccHole)); return; }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const [q, r] = HOLES[Number(hole.dataset.ccHole)], [x] = xy([q, r]);
    // Across: the next hole on the row. Up and down: the nearest hole on the next row.
    const next = step[0] ? HOLES.findIndex(([q2, r2]) => r2 === r && q2 === q + step[0])
      : HOLES.map((h, i) => [i, h]).filter(([, [, r2]]) => r2 === r + step[1]).sort(([, a], [, b]) => Math.abs(xy(a)[0] - x) - Math.abs(xy(b)[0] - x))[0]?.[0] ?? -1;
    if (next < 0) return;
    cursor = next; hole.setAttribute('tabindex', '-1');
    const target = board.querySelector(`[data-cc-hole="${next}"]`); target?.setAttribute('tabindex', '0'); target?.focus();
  });
  $('[data-cc-action="new"]').addEventListener('click', () => { generation++; thinking = false; newGame({}); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-cc-mode]')) button.addEventListener('click', () => { if (game.mode === button.dataset.ccMode) return; generation++; thinking = false; newGame({ mode: button.dataset.ccMode, wins: [0, 0, 0] }); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-grove-game]')) button.addEventListener('click', () => { if (button.dataset.groveGame !== 'chineseCheckers') onSwitch?.(button.dataset.groveGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; thinking = false; moving = null; selected = null; panel.close(); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    if (!game || game.chair !== seat.chair) newGame({ chair: seat.chair, wins: [0, 0, 0] });
    panel.show(); mirror(); render(); void regular();
    (board.querySelector('[tabindex="0"]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the Chinese checkers board' : 'Play Chinese checkers', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && getSeat()?.chair !== game?.chair) close(); },
    open, close, mirror,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, mode: game.mode, chair: game.chair, turn: state.turn, plies: state.plies, moves: game.moves.slice(), selected, reach: targets(state).map(move => move.to),
        home: [homeCount(state.board, 0), homeCount(state.board, 1)], winner: state.winner, draw: state.draw, wins: game.wins.slice(), thinking, moving: Boolean(moving), status: status.textContent };
    },
    // Starts afresh (for tests), keeping the mode.
    reset() { if (!game) return false; generation++; thinking = false; newGame({}); mirror(); render(); void regular(); return true; },
  };
}
