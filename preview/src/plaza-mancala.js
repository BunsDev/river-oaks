import './plaza-table-games.css';
import './plaza-mancala.css';
import { attachGuide } from './salon-guide.js';
import { groveSeat } from './plaza-salon-plan.js';
import { STORE, legalMoves, replay } from './mancala-rules.js';
import { chooseMove } from './mancala-opponent.js';

// Mancala (Kalah) at the small grove table, for whoever sits down: against the plaza
// regular or pass-and-play, moving first or second. A practice game kept in this
// browser; the table's beads mirror it. X opens the board.

const SVG = 'http://www.w3.org/2000/svg', W = 600, H = 230, PIT = 72, FIRST = 120, R = 26;
const NAMES = ['You', 'The plaza regular'];

export function createPlazaMancala({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {}, replyDelay = 700, onSwitch = null } = {}) {
  let game = null, generation = 0, thinking = false;

  const panel = document.createElement('dialog');
  panel.id = 'mancala-panel'; panel.className = 'table-game-panel mancala-panel';
  panel.setAttribute('aria-labelledby', 'mancala-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="mancala-title">Mancala in the grove</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the mancala board">×</button></header>
    <div class="table-game-body mancala-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-grove-game="mancala" aria-pressed="true">Mancala</button><button type="button" data-grove-game="go" aria-pressed="false">Go</button><button type="button" data-grove-game="chineseCheckers" aria-pressed="false">Chinese checkers</button><button type="button" data-grove-game="xiangqi" aria-pressed="false">Xiangqi</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="mancala-scores" aria-label="Stores"></ul>
      <svg class="mancala-board" viewBox="0 0 ${W} ${H}" role="group" aria-label="Mancala board"></svg>
      <div class="table-game-actions">
        <button type="button" data-mancala-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-mancala-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-mancala-mode="pass" aria-pressed="false">Pass and play</button></div>
        <div class="table-game-mode" role="group" aria-label="Who moves first"><button type="button" data-mancala-first="0" aria-pressed="true">You first</button><button type="button" data-mancala-first="1" aria-pressed="false">Regular first</button></div>
      </div>
      <p class="table-game-note">Sow counter-clockwise, one seed a pit. End in your store to go again; end in an empty pit of yours to capture the seeds opposite.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'mancala');
  const $ = selector => panel.querySelector(selector);
  const board = $('.mancala-board'), status = $('.table-game-status');

  const round = () => replay(game.moves);
  // You play side `you`; in pass-and-play the view follows whoever is to move.
  const viewer = state => (game.mode === 'pass' ? state.turn : game.you);
  const yours = state => game.mode === 'pass' || state.turn === game.you;
  const who = side => game.mode === 'pass' ? `Side ${side + 1}` : NAMES[side === game.you ? 0 : 1];
  const newGame = (keep = {}) => {
    game = { moves: [], mode: keep.mode ?? game?.mode ?? 'regular', you: keep.you ?? game?.you ?? 0, chair: keep.chair ?? game?.chair ?? 0, wins: keep.wins ?? game?.wins ?? [0, 0], scored: false };
  };
  // The chair side 0 sits in: yours if you move first, the other one if not.
  const sideZeroChair = () => (game.you === 0 ? game.chair : 1 - game.chair);
  const mirror = () => { if (game) getMirror()?.show(round().state, sideZeroChair()); };

  // Where place `index` is drawn from the viewer's side: their pits along the bottom, left to right, their store on the right.
  function placeAt(index, side) {
    const theirs = 1 - side;
    if (index === STORE[side]) return { x: W - 46, y: H / 2, store: true };
    if (index === STORE[theirs]) return { x: 46, y: H / 2, store: true };
    const mine = index >= side * 7 && index < side * 7 + 6, pit = mine ? index - side * 7 : index - theirs * 7;
    return mine ? { x: FIRST + pit * PIT, y: H - 58 } : { x: FIRST + (5 - pit) * PIT, y: 58 };
  }
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };

  function render() {
    if (!game) return;
    const active = document.activeElement, hadFocus = panel.contains(active), focused = board.contains(active) ? active.dataset.mancalaPit : null;
    const { state } = round(), side = viewer(state), legal = !thinking && yours(state) ? legalMoves(state) : [];
    if (state.over && !game.scored) { game.scored = true; if (state.over.winner !== null) game.wins[state.over.winner === game.you ? 0 : 1] += 1; }
    const nodes = [el('rect', { class: 'mancala-wood', x: 4, y: 4, width: W - 8, height: H - 8, rx: 40 })];
    const lastPath = new Set(state.last?.path ?? []);
    for (let index = 0; index < 14; index++) {
      const { x, y, store } = placeAt(index, side), seeds = state.board[index], mine = index >= side * 7 && index < side * 7 + 6;
      const pit = mine ? index - side * 7 + 1 : null, open = pit !== null && legal.includes(pit);
      const group = el('g', { class: `mancala-place${store ? ' mancala-store' : ''}`, 'data-mancala-place': index,
        ...(pit !== null ? { 'data-mancala-pit': pit, role: 'button', tabindex: open ? 0 : -1, 'aria-label': `Your pit ${pit}: ${seeds} seed${seeds === 1 ? '' : 's'}${open ? '' : ', cannot be sown now'}` }
          : { role: 'img', 'aria-label': `${store ? (index === STORE[side] ? 'Your store' : 'Their store') : 'Their pit'}: ${seeds} seed${seeds === 1 ? '' : 's'}` }) });
      if (open) group.dataset.open = '';
      if (lastPath.has(index)) group.dataset.last = '';
      group.append(store ? el('rect', { class: 'mancala-cup', x: x - 30, y: y - 82, width: 60, height: 164, rx: 30 }) : el('circle', { class: 'mancala-cup', cx: x, cy: y, r: R }));
      for (let k = 0; k < Math.min(seeds, store ? 24 : 12); k++) {
        const angle = k * 2.4, radius = k === 0 ? 0 : 6 + Math.floor(k / 6) * 6;
        group.append(el('circle', { class: `mancala-seed mancala-seed-${(index * 7 + k) % 5}`, cx: x + Math.cos(angle) * radius * (store ? 1.6 : 1), cy: y + Math.sin(angle) * radius * (store ? 4 : 1), r: 4.2 }));
      }
      group.append(el('text', { class: 'mancala-count', x, y: store ? y + 104 : y + (y > H / 2 ? 44 : -34), 'text-anchor': 'middle' }, String(seeds)));
      nodes.push(group);
    }
    board.replaceChildren(...nodes);
    status.textContent = describe(state);
    panel.dataset.state = state.over ? 'over' : thinking ? 'thinking' : 'playing';
    $('.mancala-scores').replaceChildren(...[side, 1 - side].map(s => { const item = document.createElement('li'); item.textContent = `${who(s)}: ${state.board[STORE[s]]}`; return item; }));
    $('[data-mancala-action="new"]').hidden = !state.over;
    for (const button of panel.querySelectorAll('[data-mancala-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mancalaMode === game.mode));
    for (const button of panel.querySelectorAll('[data-mancala-first]')) { button.setAttribute('aria-pressed', String(Number(button.dataset.mancalaFirst) === game.you)); button.disabled = game.mode === 'pass'; }
    if (hadFocus && !panel.contains(document.activeElement)) {
      const stop = (focused && board.querySelector(`[data-mancala-pit="${focused}"][data-open]`)) ?? board.querySelector('[data-open]') ?? $('.table-game-close');
      stop.focus({ preventScroll: true });
    }
  }

  function describe(state) {
    if (state.over) {
      const [a, b] = state.over.scores;
      if (state.over.winner === null) return `A draw, ${a} all.`;
      return `${who(state.over.winner)} ${who(state.over.winner) === 'You' ? 'win' : 'wins'}, ${Math.max(a, b)} to ${Math.min(a, b)}.`;
    }
    const last = state.last, before = last ? (last.captured ? `${who(last.side)} captured ${last.captured}. ` : last.again ? `${who(last.side)} ended in the store: another turn. ` : '') : '';
    if (thinking || !yours(state)) return `${before}${who(state.turn)} is choosing a pit…`;
    return `${before}${game.mode === 'pass' ? `${who(state.turn)} to move.` : 'Your move.'} Choose a pit to sow.`;
  }

  async function regular() {
    const ticket = ++generation;
    thinking = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.over || yours(state)) break;
        render();
        await new Promise(resolve => setTimeout(resolve, replyDelay));
        if (ticket !== generation) return;
        game.moves.push(String(chooseMove(state))); mirror();
      }
    } finally { if (ticket === generation) { thinking = false; render(); } }
  }

  function choose(pit) {
    const { state } = round();
    if (thinking || state.over || !yours(state) || !legalMoves(state).includes(pit)) return;
    game.moves.push(String(pit)); mirror(); render(); void regular();
  }

  board.addEventListener('click', event => { const place = event.target.closest('[data-mancala-pit][data-open]'); if (place) choose(Number(place.dataset.mancalaPit)); });
  board.addEventListener('keydown', event => {
    const place = event.target.closest('[data-mancala-pit]');
    if (!place) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(Number(place.dataset.mancalaPit)); return; }
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const open = [...board.querySelectorAll('[data-mancala-pit][data-open]')].sort((a, b) => a.dataset.mancalaPit - b.dataset.mancalaPit);
    const next = open[(open.indexOf(place) + step + open.length) % open.length];
    if (next) { for (const item of open) item.setAttribute('tabindex', '-1'); next.setAttribute('tabindex', '0'); next.focus(); }
  });
  $('[data-mancala-action="new"]').addEventListener('click', () => { generation++; thinking = false; newGame({}); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-mancala-mode]')) button.addEventListener('click', () => {
    if (game.mode === button.dataset.mancalaMode) return;
    generation++; thinking = false; newGame({ mode: button.dataset.mancalaMode, wins: [0, 0] }); mirror(); render(); void regular();
  });
  for (const button of panel.querySelectorAll('[data-mancala-first]')) button.addEventListener('click', () => {
    const you = Number(button.dataset.mancalaFirst);
    if (game.you === you) return;
    generation++; thinking = false; newGame({ you, wins: [0, 0] }); mirror(); render(); void regular();
  });
  for (const button of panel.querySelectorAll('[data-grove-game]')) button.addEventListener('click', () => { if (button.dataset.groveGame !== 'mancala') onSwitch?.(button.dataset.groveGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; panel.close(); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    if (!game || game.chair !== seat.chair) newGame({ chair: seat.chair, you: 0, wins: [0, 0] });
    panel.show(); mirror(); render(); void regular();
    (board.querySelector('[data-open]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the mancala board' : 'Play mancala', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && getSeat()?.chair !== game?.chair) close(); },
    open, close,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, mode: game.mode, you: game.you, chair: game.chair, turn: state.turn, board: state.board.slice(), moves: game.moves.slice(),
        legal: !thinking && yours(state) ? legalMoves(state) : [], over: state.over, last: state.last ? { side: state.last.side, pit: state.last.pit, captured: state.last.captured, again: state.last.again } : null,
        wins: game.wins.slice(), thinking, status: status.textContent };
    },
    // Starts afresh (for tests), keeping the mode and who moves first.
    reset() { if (!game) return false; generation++; thinking = false; newGame({}); mirror(); render(); void regular(); return true; },
  };
}

export const seatAtGrove = pose => groveSeat(pose?.sitting?.buildId);
