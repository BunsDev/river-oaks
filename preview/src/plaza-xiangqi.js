import './plaza-table-games.css';
import './plaza-xiangqi.css';
import { attachGuide } from './salon-guide.js';
import { inCheck, legalMoves, notation, pointName, pointOf, replay, sideOf } from './xiangqi-rules.js';
import { chooseMove } from './xiangqi-opponent.js';
import { createWorkerThinker } from './plaza-table-games.js';

// Xiangqi (Chinese chess) at the small grove table, for whoever sits down: against the
// plaza regular (a searching player, thinking in a worker) or pass-and-play, as red or
// black. A practice game kept in this browser; the table's board mirrors it. X opens it.

const SVG = 'http://www.w3.org/2000/svg', SPACE = 40, EDGE = 28, WIDTH = EDGE * 2 + SPACE * 8, HEIGHT = EDGE * 2 + SPACE * 9;
const COLOUR = { r: 'Red', b: 'Black' };
const GLYPH = { K: '帥', A: '仕', E: '相', H: '傌', R: '俥', C: '炮', P: '兵', k: '將', a: '士', e: '象', h: '馬', r: '車', c: '砲', p: '卒' };
const NAME = { k: 'general', a: 'advisor', e: 'elephant', h: 'horse', r: 'chariot', c: 'cannon', p: 'soldier' };

export function createPlazaXiangqi({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  think = createWorkerThinker(), budget = 24000, replyDelay = 300, onSwitch = null } = {}) {
  let game = null, generation = 0, thinking = false, selected = null, cursor = pointOf('b2');

  const panel = document.createElement('dialog');
  panel.id = 'xiangqi-panel'; panel.className = 'table-game-panel xiangqi-panel';
  panel.setAttribute('aria-labelledby', 'xiangqi-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="xiangqi-title">Xiangqi in the grove</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the xiangqi board">×</button></header>
    <div class="table-game-body xiangqi-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-grove-game="mancala" aria-pressed="false">Mancala</button><button type="button" data-grove-game="go" aria-pressed="false">Go</button><button type="button" data-grove-game="xiangqi" aria-pressed="true">Xiangqi</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <svg class="xq-board" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="grid" aria-label="Xiangqi board, nine files by ten ranks"></svg>
      <div class="table-game-actions">
        <button type="button" data-xq-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-xq-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-xq-mode="pass" aria-pressed="false">Pass and play</button></div>
        <div class="table-game-mode" role="group" aria-label="You play"><button type="button" data-xq-side="r" aria-pressed="true">Red</button><button type="button" data-xq-side="b" aria-pressed="false">Black</button></div>
      </div>
      <p class="table-game-note">Red moves first. Checkmate the other general, or leave it no move at all. The generals may never face each other with nothing between.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'xiangqi');
  const $ = selector => panel.querySelector(selector);
  const board = $('.xq-board'), status = $('.table-game-status');

  const round = () => replay(game.moves);
  const yours = state => game.mode === 'pass' || state.turn === game.you;
  const who = side => game.mode === 'pass' ? COLOUR[side] : side === game.you ? 'You' : 'The plaza regular';
  const newGame = (keep = {}) => { game = { moves: [], mode: keep.mode ?? game?.mode ?? 'regular', you: keep.you ?? game?.you ?? 'r', chair: keep.chair ?? game?.chair ?? 0, wins: keep.wins ?? game?.wins ?? { r: 0, b: 0, draw: 0 }, scored: false }; selected = null; cursor = pointOf(game.you === 'r' ? 'b2' : 'b7'); };
  // Red sits in your chair when you play red, in the other one when you play black.
  const redChair = () => (game.you === 'r' ? game.chair : 1 - game.chair);
  const mirror = () => { if (game) getMirror()?.show(round().state, redChair()); };
  // The board from your side: red's rank 0 at the bottom for red, at the top for black.
  const viewer = state => (game.mode === 'pass' ? state.turn : game.you);
  const xy = (index, side) => { const rank = Math.floor(index / 9), file = index % 9, flip = side === 'b'; return [EDGE + (flip ? 8 - file : file) * SPACE, EDGE + (flip ? rank : 9 - rank) * SPACE]; };
  const targets = state => (selected === null ? [] : legalMoves(state).filter(move => move.from === selected));
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };

  function lines(side) {
    const nodes = [el('rect', { class: 'xq-wood', x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 10 })];
    const point = (rank, file) => xy(rank * 9 + file, side);
    const line = (a, b, cls = 'xq-line') => { const [x1, y1] = point(...a), [x2, y2] = point(...b); nodes.push(el('line', { class: cls, x1, y1, x2, y2 })); };
    for (let rank = 0; rank < 10; rank++) line([rank, 0], [rank, 8]);
    for (let file = 0; file < 9; file++) if (file === 0 || file === 8) line([0, file], [9, file]); else { line([0, file], [4, file]); line([5, file], [9, file]); }
    for (const near of [0, 7]) { line([near, 3], [near + 2, 5]); line([near, 5], [near + 2, 3]); }
    const [, riverTop] = point(side === 'b' ? 4 : 5, 0), [, riverBottom] = point(side === 'b' ? 5 : 4, 0), mid = (riverTop + riverBottom) / 2;
    nodes.push(el('text', { class: 'xq-river', x: EDGE + SPACE * 2, y: mid, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '楚 河'), el('text', { class: 'xq-river', x: EDGE + SPACE * 6, y: mid, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '漢 界'));
    return nodes;
  }

  function render() {
    if (!game) return;
    const active = document.activeElement, hadFocus = panel.contains(active), focusedPoint = board.contains(active) ? active.dataset.xqPoint : null;
    const { state } = round(), side = viewer(state), over = Boolean(state.winner || state.draw), open = !thinking && yours(state) && !over;
    if (over && !game.scored) { game.scored = true; game.wins[state.winner ?? 'draw'] += 1; }
    const reach = open ? new Map(targets(state).map(move => [move.to, move])) : new Map();
    const movable = open ? new Set(legalMoves(state).map(move => move.from)) : new Set();
    const nodes = lines(side), general = state.board.indexOf(state.turn === 'r' ? 'K' : 'k'), check = !over && inCheck(state.board, state.turn);
    for (let index = 0; index < 90; index++) {
      const [x, y] = xy(index, side), piece = state.board[index], name = pointName(index);
      const label = `${name}: ${piece ? `${COLOUR[sideOf(piece)].toLowerCase()} ${NAME[piece.toLowerCase()]}` : 'empty'}${reach.has(index) ? ', reachable' : ''}${selected === index ? ', chosen' : ''}`;
      const node = el('g', { class: 'xq-point', 'data-xq-point': name, role: 'gridcell', tabindex: index === cursor ? 0 : -1, 'aria-label': label });
      node.append(el('circle', { class: 'xq-hit', cx: x, cy: y, r: SPACE / 2 }));
      if (state.last && (state.last.from === index || state.last.to === index)) node.append(el('circle', { class: 'xq-last', cx: x, cy: y, r: SPACE / 2 - 1 }));
      if (piece) {
        node.append(el('circle', { class: `xq-piece xq-${sideOf(piece)}${check && index === general ? ' xq-checked' : ''}`, cx: x, cy: y, r: SPACE / 2 - 3 }),
          el('text', { class: `xq-glyph xq-glyph-${sideOf(piece)}`, x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, GLYPH[piece]));
      }
      if (movable.has(index)) node.dataset.movable = '';
      if (reach.has(index)) { node.dataset.open = ''; node.append(el('circle', { class: piece ? 'xq-take' : 'xq-dot', cx: x, cy: y, r: piece ? SPACE / 2 - 1 : 5 })); }
      if (selected === index) node.dataset.selected = '';
      nodes.push(node);
    }
    board.replaceChildren(...nodes);
    status.textContent = describe(state, check);
    panel.dataset.state = over ? 'over' : thinking ? 'thinking' : 'playing';
    $('[data-xq-action="new"]').hidden = !over;
    for (const button of panel.querySelectorAll('[data-xq-mode]')) button.setAttribute('aria-pressed', String(button.dataset.xqMode === game.mode));
    for (const button of panel.querySelectorAll('[data-xq-side]')) { button.setAttribute('aria-pressed', String(button.dataset.xqSide === game.you)); button.disabled = game.mode === 'pass'; }
    if (hadFocus && !panel.contains(document.activeElement)) (board.querySelector(`[data-xq-point="${focusedPoint}"]`) ?? board.querySelector('[tabindex="0"]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  function describe(state, check) {
    if (state.draw) return `A draw: ${state.quiet >= 120 ? 'sixty moves each without a capture' : 'the same position a third time'}.`;
    if (state.winner) return `${who(state.winner)} ${who(state.winner) === 'You' ? 'win' : 'wins'}: ${state.mate ? 'checkmate' : 'no move left'}.`;
    const mover = state.turn === 'r' ? 'b' : 'r', last = state.last ? `${who(mover)} ${state.last.captured ? `took a ${NAME[state.last.captured.toLowerCase()]}` : 'moved'}${check ? '. Check!' : '.'} ` : '';
    if (thinking || !yours(state)) return `${last}${who(state.turn)} is thinking…`;
    const whose = game.mode === 'pass' ? `${COLOUR[state.turn]} to play. ` : '';
    return `${last}${whose}${selected === null ? 'Choose a piece.' : 'Choose where it goes, or another piece.'}`;
  }

  async function regular() {
    const ticket = ++generation;
    thinking = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.winner || state.draw || yours(state)) break;
        render();
        const history = Object.keys(state.seen);
        const [reply] = await Promise.all([think({ game: 'xiangqi', position: state, history, budget }), new Promise(resolve => setTimeout(resolve, replyDelay))]);
        if (ticket !== generation) return;
        // Without a worker (or if it fails), think here with a smaller budget.
        const move = reply ?? chooseMove(state, { history, budget: Math.round(budget / 3) });
        if (!move) break;
        game.moves.push(move); mirror();
      }
    } finally { if (ticket === generation) { thinking = false; render(); } }
  }

  function choose(index) {
    const { state } = round();
    if (thinking || state.winner || state.draw || !yours(state)) return;
    cursor = index;
    const move = targets(state).find(option => option.to === index);
    if (move) { selected = null; game.moves.push(notation(move)); mirror(); render(); void regular(); return; }
    selected = sideOf(state.board[index]) === state.turn && selected !== index && legalMoves(state).some(option => option.from === index) ? index : null;
    render();
  }

  board.addEventListener('click', event => { const point = event.target.closest('[data-xq-point]'); if (point) choose(pointOf(point.dataset.xqPoint)); });
  board.addEventListener('keydown', event => {
    const point = event.target.closest('[data-xq-point]');
    if (!point) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(pointOf(point.dataset.xqPoint)); return; }
    const flip = viewer(round().state) === 'b' ? -1 : 1, step = { ArrowUp: [0, flip], ArrowDown: [0, -flip], ArrowLeft: [-flip, 0], ArrowRight: [flip, 0] }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = pointOf(point.dataset.xqPoint), file = index % 9 + step[0], rank = Math.floor(index / 9) + step[1];
    if (file < 0 || file > 8 || rank < 0 || rank > 9) return;
    cursor = rank * 9 + file; point.setAttribute('tabindex', '-1');
    const target = board.querySelector(`[data-xq-point="${pointName(cursor)}"]`); target?.setAttribute('tabindex', '0'); target?.focus();
  });
  $('[data-xq-action="new"]').addEventListener('click', () => { generation++; thinking = false; newGame({}); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-xq-mode]')) button.addEventListener('click', () => { if (game.mode === button.dataset.xqMode) return; generation++; thinking = false; newGame({ mode: button.dataset.xqMode, wins: { r: 0, b: 0, draw: 0 } }); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-xq-side]')) button.addEventListener('click', () => { if (game.you === button.dataset.xqSide) return; generation++; thinking = false; newGame({ you: button.dataset.xqSide, wins: { r: 0, b: 0, draw: 0 } }); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-grove-game]')) button.addEventListener('click', () => { if (button.dataset.groveGame !== 'xiangqi') onSwitch?.(button.dataset.groveGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; thinking = false; selected = null; panel.close(); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    if (!game || game.chair !== seat.chair) newGame({ chair: seat.chair, you: 'r', wins: { r: 0, b: 0, draw: 0 } });
    panel.show(); mirror(); render(); void regular();
    (board.querySelector('[tabindex="0"]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the xiangqi board' : 'Play xiangqi', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && getSeat()?.chair !== game?.chair) close(); },
    open, close, mirror,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, mode: game.mode, you: game.you, chair: game.chair, turn: state.turn, plies: state.plies, moves: game.moves.slice(), selected: selected === null ? null : pointName(selected),
        reach: targets(state).map(move => pointName(move.to)), check: inCheck(state.board, state.turn), winner: state.winner, draw: state.draw, thinking, status: status.textContent };
    },
    // Starts afresh (for tests), keeping the mode and colour.
    reset() { if (!game) return false; generation++; thinking = false; newGame({}); mirror(); render(); void regular(); return true; },
  };
}
