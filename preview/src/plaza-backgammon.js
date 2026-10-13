import './plaza-table-games.css';
import './plaza-backgammon.css';
import { backgammonSeat } from './plaza-salon-plan.js';
import { BLACK, WHITE, legalMoves, move, notation, parse, pips, replay } from './backgammon-rules.js';
import { choosePlay } from './backgammon-opponent.js';

// Backgammon at the plaza's backgammon table, for whoever sits down: against the
// plaza regular or pass-and-play, white or black. A practice game kept in this
// browser; the table's checkers mirror it. X opens the board.

const COLOUR = ['White', 'Black'];
const SVG = 'http://www.w3.org/2000/svg';
// Board drawing (viewBox 700 × 480): two halves of six points and a bar, a tray on the right.
const FRAME = 16, BAR = [300, 340], HALF = (BAR[0] - FRAME) / 6, POINT_HEIGHT = 190, R = 20, TRAY = 640;

export function createPlazaBackgammon({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  random = Math.random, replyDelay = 500 } = {}) {
  let game = null, source = null, generation = 0, thinking = false;

  const panel = document.createElement('dialog');
  panel.id = 'backgammon-panel'; panel.className = 'table-game-panel backgammon-panel';
  panel.setAttribute('aria-labelledby', 'backgammon-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="backgammon-title">Backgammon at the plaza</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the backgammon board">×</button></header>
    <div class="table-game-body backgammon-body">
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="backgammon-scores" aria-label="Points won"></ul>
      <svg class="backgammon-board" viewBox="0 0 700 480" role="group" aria-label="Backgammon board"></svg>
      <div class="table-game-actions">
        <button type="button" data-backgammon-action="undo">Undo move</button><button type="button" data-backgammon-action="next">Next game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-backgammon-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-backgammon-mode="pass" aria-pressed="false">Pass and play</button></div>
        <div class="backgammon-side" role="group" aria-label="You play"><button type="button" data-backgammon-side="0" aria-pressed="true">White</button><button type="button" data-backgammon-side="1" aria-pressed="false">Black</button></div>
      </div>
      <p class="table-game-note">Use both dice when you can; checkers on the bar enter first. A gammon scores two, a backgammon three.</p>
    </div>`;
  host.append(panel);
  const $ = selector => panel.querySelector(selector);
  const board = $('.backgammon-board'), status = $('.table-game-status');

  const round = () => replay(game.seed, game.moves);
  const yours = state => game.mode === 'pass' || state.turn === game.player;
  const newGame = (keep = {}) => {
    const player = keep.player ?? game?.player ?? WHITE, chair = keep.chair ?? game.chair;
    game = { seed: Math.floor(random() * 2 ** 32), moves: [], turnStart: 0, mode: keep.mode ?? game?.mode ?? 'regular', player, chair,
      whiteChair: player === WHITE ? chair : 1 - chair, scores: keep.scores ?? game?.scores ?? [0, 0], scored: false };
    source = null;
  };
  const mirror = () => { if (game) getMirror()?.show(round().state, game.whiteChair); };

  // Where a point sits on the drawing, seen from the viewer's side (your home at the bottom right).
  const viewer = () => (game.mode === 'pass' ? WHITE : game.player);
  function pointGeometry(point) {
    const own = viewer() === WHITE ? point : 25 - point, near = own <= 12, col = near ? 12 - own : own - 13;
    const x = col < 6 ? FRAME + col * HALF + HALF / 2 : BAR[1] + (col - 6) * HALF + HALF / 2;
    return { x, near, base: near ? 480 - FRAME : FRAME, colour: (col + (near ? 0 : 1)) & 1 };
  }
  const svg = (tag, attributes = {}, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };

  function render() {
    if (!game) return;
    // Redrawing replaces the board's points: keep keyboard focus on the same one, and inside the sheet.
    const active = document.activeElement, hadFocus = panel.contains(active), focusedPoint = board.contains(active) ? active.closest('[data-point]')?.dataset.point : null;
    const { state } = round(), legal = !thinking && yours(state) && !state.over ? legalMoves(state) : [];
    if (state.over && !game.scored) { game.scored = true; game.scores[state.over.winner] += state.over.points; }
    const sources = new Set(legal.map(step => step.from)), targets = new Set(source === null ? [] : legal.filter(step => step.from === source).map(step => step.to));
    const nodes = [svg('rect', { class: 'bg-frame', x: 0, y: 0, width: 640, height: 480, rx: 10 }), svg('rect', { class: 'bg-felt', x: FRAME, y: FRAME, width: 640 - 2 * FRAME, height: 480 - 2 * FRAME }),
      svg('rect', { class: 'bg-bar', x: BAR[0], y: 0, width: BAR[1] - BAR[0], height: 480 }), svg('rect', { class: 'bg-tray', x: TRAY + 6, y: 0, width: 54, height: 480, rx: 8 })];
    for (let point = 1; point <= 24; point++) {
      const { x, near, base, colour } = pointGeometry(point), tip = near ? base - POINT_HEIGHT : base + POINT_HEIGHT;
      const group = svg('g', { class: 'bg-point', 'data-point': point, role: 'button', tabindex: sources.has(point) || targets.has(point) ? 0 : -1,
        'aria-label': `Point ${point}${state.points[point] ? `, ${Math.abs(state.points[point])} ${state.points[point] > 0 ? 'white' : 'black'}` : ''}` });
      if (sources.has(point)) group.dataset.source = '';
      if (targets.has(point)) group.dataset.target = '';
      if (source === point) group.dataset.selected = '';
      group.append(svg('polygon', { class: `bg-triangle bg-triangle-${colour}`, points: `${x - HALF / 2 + 2},${base} ${x + HALF / 2 - 2},${base} ${x},${tip}` }));
      const checkers = Math.abs(state.points[point]), side = state.points[point] > 0 ? 'white' : 'black';
      for (let i = 0; i < Math.min(checkers, 5); i++) group.append(svg('circle', { class: `bg-checker bg-${side}`, cx: x, cy: near ? base - R - i * 2 * R : base + R + i * 2 * R, r: R - 1 }));
      if (checkers > 5) group.append(svg('text', { class: 'bg-count', x, y: near ? base - R - 4 * 2 * R + 5 : base + R + 4 * 2 * R + 5, 'text-anchor': 'middle' }, String(checkers)));
      nodes.push(group);
    }
    // The bar: each colour on its own side of the middle, the viewer's nearest them.
    for (const player of [WHITE, BLACK]) {
      const count = state.bar[player], down = (player === viewer()) ? 1 : -1;
      const group = svg('g', { class: 'bg-point bg-bar-stack', 'data-point': `bar-${player}`, role: 'button', tabindex: sources.has('bar') && player === state.turn ? 0 : -1, 'aria-label': `Bar, ${count} ${COLOUR[player].toLowerCase()}` });
      if (sources.has('bar') && player === state.turn) group.dataset.source = '';
      if (source === 'bar' && player === state.turn) group.dataset.selected = '';
      for (let i = 0; i < Math.min(count, 4); i++) group.append(svg('circle', { class: `bg-checker bg-${player ? 'black' : 'white'}`, cx: (BAR[0] + BAR[1]) / 2, cy: 240 + down * (40 + i * 2 * R), r: R - 1 }));
      if (count > 4) group.append(svg('text', { class: 'bg-count', x: (BAR[0] + BAR[1]) / 2, y: 240 + down * (40 + 3 * 2 * R) + 5, 'text-anchor': 'middle' }, String(count)));
      nodes.push(group);
    }
    // The bear-off tray: borne-off checkers as thin bars, and the drop target while bearing off.
    const tray = svg('g', { class: 'bg-point bg-off', 'data-point': 'off', role: 'button', tabindex: targets.has('off') ? 0 : -1, 'aria-label': `Borne off: ${state.off[WHITE]} white, ${state.off[BLACK]} black` });
    if (targets.has('off')) tray.dataset.target = '';
    for (const player of [WHITE, BLACK]) {
      const down = player === viewer() ? 1 : -1;
      for (let i = 0; i < state.off[player]; i++) tray.append(svg('rect', { class: `bg-off-checker bg-${player ? 'black' : 'white'}`, x: TRAY + 12, y: 240 + down * (12 + i * 8) - 3, width: 42, height: 6, rx: 2 }));
    }
    nodes.push(tray);
    // The dice of the turn: used ones fade.
    const left = state.dice.slice();
    state.rolled.forEach((value, index) => {
      const used = !left.includes(value); if (!used) left.splice(left.indexOf(value), 1);
      const x = 170 + index * 48 + (state.turn === viewer() ? 330 : 0) - (state.rolled.length > 2 ? 48 : 0), y = 222;
      nodes.push(svg('rect', { class: `bg-die${used ? ' bg-die-used' : ''}`, x, y, width: 36, height: 36, rx: 7 }), svg('text', { class: 'bg-die-face', x: x + 18, y: y + 25, 'text-anchor': 'middle' }, String(value)));
    });
    board.replaceChildren(...nodes);
    status.textContent = describe(state, legal);
    panel.dataset.state = state.over ? 'over' : thinking ? 'thinking' : 'playing';
    $('.backgammon-scores').replaceChildren(...[game.player, 1 - game.player].map((player, index) => {
      const item = document.createElement('li'); item.textContent = `${game.mode === 'pass' ? COLOUR[player] : index === 0 ? 'You' : 'Regular'} ${game.scores[player]} · ${pips(state, player)} pips`; return item;
    }));
    $('[data-backgammon-action="undo"]').disabled = !(yours(state) && !state.over && game.moves.length > game.turnStart && !thinking);
    $('[data-backgammon-action="next"]').hidden = !state.over;
    for (const button of panel.querySelectorAll('[data-backgammon-mode]')) button.setAttribute('aria-pressed', String(button.dataset.backgammonMode === game.mode));
    for (const button of panel.querySelectorAll('[data-backgammon-side]')) { button.setAttribute('aria-pressed', String(Number(button.dataset.backgammonSide) === game.player)); button.disabled = game.mode === 'pass'; }
    if (hadFocus && !panel.contains(document.activeElement)) {
      const stop = (focusedPoint && board.querySelector(`[data-point="${focusedPoint}"]`)) ?? board.querySelector('[data-source]') ?? $('.table-game-close');
      stop.focus({ preventScroll: true });
    }
  }

  function describe(state, legal) {
    const who = player => game.mode === 'pass' ? COLOUR[player] : player === game.player ? 'You' : 'The plaza regular';
    if (state.over) {
      const { winner, points, kind } = state.over, label = kind === 'single' ? 'the game' : `a ${kind}`;
      return `${who(winner)} ${who(winner) === 'You' ? 'win' : 'wins'} ${label} (${points} point${points === 1 ? '' : 's'}).`;
    }
    const dice = state.rolled.length > 2 ? `double ${state.rolled[0]}s` : `${state.rolled[0]} and ${state.rolled[1]}`;
    if (thinking || !yours(state)) return `${who(state.turn)} rolled ${dice}…`;
    if (!legal.length) return `No move with ${dice}.`;
    const opener = game.mode === 'pass' ? `${COLOUR[state.turn]} rolled ${dice}.` : `You rolled ${dice}.`;
    if (state.bar[state.turn]) return `${opener} Enter from the bar first.`;
    return source === null ? `${opener} Choose a checker to move.` : `${opener} Choose where it goes.`;
  }

  // The regular plays its whole roll, one checker at a time, then it is your turn again.
  // Each run takes a ticket from an ever-rising count, so a newer game or mode cancels it.
  async function regular() {
    const ticket = ++generation;
    let played = false;
    thinking = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.over || yours(state)) break;
        render();
        const steps = choosePlay(state);
        if (!steps.length) break;
        for (const step of steps) {
          await new Promise(resolve => setTimeout(resolve, replyDelay));
          if (ticket !== generation) return;
          game.moves.push(notation(step)); played = true; mirror(); render();
        }
      }
    // Your turn starts where the regular stopped; when it had nothing to play, it stays put.
    } finally { if (ticket === generation) { thinking = false; if (played) game.turnStart = game.moves.length; render(); } }
  }

  function choose(place) {
    const { state } = round();
    if (thinking || state.over || !yours(state)) return;
    const legal = legalMoves(state), from = place.startsWith('bar') ? 'bar' : place === 'off' ? null : Number(place);
    if (source !== null) {
      const to = place === 'off' ? 'off' : from;
      const step = legal.find(option => option.from === source && option.to === to);
      if (step) {
        const turn = state.turn;
        game.moves.push(notation(step)); source = null;
        const after = round().state;
        if (after.turn !== turn || after.over) game.turnStart = game.moves.length;
        mirror(); render(); void regular(); return;
      }
    }
    source = from !== null && legal.some(option => option.from === from) && source !== from ? from : null;
    render();
  }

  board.addEventListener('click', event => { const point = event.target.closest('[data-point]'); if (point) choose(point.dataset.point); });
  board.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const point = event.target.closest('[data-point]'); if (!point) return;
    event.preventDefault(); choose(point.dataset.point);
    board.querySelector(`[data-point="${point.dataset.point}"]`)?.focus();
  });
  $('[data-backgammon-action="undo"]').addEventListener('click', () => { if (game.moves.length > game.turnStart) { game.moves.length = game.turnStart; source = null; mirror(); render(); } });
  $('[data-backgammon-action="next"]').addEventListener('click', () => { generation++; thinking = false; newGame({ scores: game.scores }); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-backgammon-mode]')) button.addEventListener('click', () => {
    if (game.mode === button.dataset.backgammonMode) return;
    game.mode = button.dataset.backgammonMode; generation++; thinking = false; source = null; render(); void regular();
  });
  for (const button of panel.querySelectorAll('[data-backgammon-side]')) button.addEventListener('click', () => {
    const player = Number(button.dataset.backgammonSide);
    if (player === game.player) return;
    generation++; thinking = false; newGame({ player, scores: [0, 0] }); mirror(); render(); void regular();
  });
  const close = () => { if (!panel.open) return; panel.close(); source = null; focusWorld(); };
  $('.table-game-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    if (!game || game.chair !== seat.chair) { game = null; newGame({ chair: seat.chair, player: WHITE, scores: [0, 0] }); }
    panel.show(); mirror(); render(); void regular();
    (board.querySelector('[data-source]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the backgammon board' : 'Play backgammon', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && getSeat()?.chair !== game?.chair) close(); },
    open, close,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, seed: game.seed, moves: game.moves.slice(), player: game.player, mode: game.mode, whiteChair: game.whiteChair, turn: state.turn,
        rolled: state.rolled.slice(), dice: state.dice.slice(), legal: !thinking && yours(state) ? legalMoves(state).map(step => `${notation(step)}`) : [], points: state.points.slice(),
        bar: state.bar.slice(), off: state.off.slice(), over: state.over, scores: game.scores.slice(), thinking: Boolean(thinking), status: status.textContent };
    },
    // Replaces the game with a seeded one (for tests); keeps the side and mode.
    deal(seed) { if (!game) return false; generation++; thinking = false; newGame({ scores: game.scores }); game.seed = seed; mirror(); render(); void regular(); return true; },
  };
}

export const seatAtBackgammon = pose => backgammonSeat(pose?.sitting?.buildId);
export { parse };
