import './plaza-table-games.css';
import './plaza-darts.css';
import { attachGuide } from './salon-guide.js';
import { atDartsLine } from './plaza-salon-plan.js';
import { RINGS, SECTORS, checkout, replay } from './darts-rules.js';
import { throwPoint } from './darts-opponent.js';

// Darts at the board on the plaza's south wall: 501, double out, for whoever stands at
// the throwing line, against a plaza regular or two players passing the turn. Stop the
// sweeping line once across and once up; the dart lands where they cross. The real
// board shows the turn's darts. X opens the board.

const SVG = 'http://www.w3.org/2000/svg', SCALE = 1.25, R = 205, VIEW = R * 2 * SCALE + 20;
const NAMES = ['You', 'The plaza regular'];

export function createPlazaDarts({ host = document.querySelector('#viewport'), getMirror = () => null, getBoard = () => null, getPose = () => null, focusWorld = () => {},
  random = Math.random, now = () => performance.now(), replyDelay = 650, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false } = {}) {
  let game = null, phase = 'x', meter = null, aimX = 0, generation = 0, thinking = false, frame = 0;

  const panel = document.createElement('dialog');
  panel.id = 'darts-panel'; panel.className = 'table-game-panel darts-panel';
  panel.setAttribute('aria-labelledby', 'darts-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="darts-title">Darts on the south wall</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the dartboard">×</button></header>
    <div class="table-game-body darts-body">
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="darts-scores" aria-label="Scores left"></ul>
      <div class="darts-play">
        <svg class="darts-board" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="The dartboard"></svg>
        <div class="darts-side"><p class="darts-turn" aria-live="polite"></p><p class="darts-checkout"></p></div>
      </div>
      <div class="table-game-actions">
        <button type="button" data-darts-action="throw">Set the line</button><button type="button" data-darts-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-darts-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-darts-mode="pass" aria-pressed="false">Pass and play</button></div>
      </div>
      <p class="table-game-note">501, double out: three darts a turn, finish exactly on a double or the bull. Going below 2 is a bust.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'darts');
  const $ = selector => panel.querySelector(selector);
  const board = $('.darts-board'), status = $('.table-game-status'), throwButton = $('[data-darts-action="throw"]');

  const round = () => replay(game.points);
  const yours = state => game.mode === 'pass' || state.turn === 0;
  const who = player => game.mode === 'pass' ? `Player ${player + 1}` : NAMES[player];
  const newGame = (keep = {}) => { game = { seed: Math.floor(random() * 2 ** 32), points: [], mode: keep.mode ?? game?.mode ?? 'regular', wins: keep.wins ?? game?.wins ?? [0, 0], scored: false, said: '' }; startMeter('x'); };
  const mirror = () => { if (game) { const { state } = round(); getMirror()?.show(state.darts.length ? state.darts.map(dart => dart.point) : (state.history.at(-1)?.darts ?? []).map(dart => dart.point)); } };
  const toScreen = ([x, y]) => [VIEW / 2 + x * SCALE, VIEW / 2 - y * SCALE];
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };

  // The sweeping line: across for the aim, then up and down for the height.
  const period = () => 2400 * (reducedMotion ? 1.6 : 1);
  const meterValue = () => meter.held ?? (0.5 - 0.5 * Math.cos(2 * Math.PI * (now() - meter.start) / period()));
  const toMm = value => (value * 2 - 1) * R;
  function startMeter(next) {
    phase = next; meter = { start: now(), held: null };
    cancelAnimationFrame(frame);
    const tick = () => { if (!meter || !panel.open) return; drawReticle(); frame = requestAnimationFrame(tick); };
    if (panel.open) tick();
  }

  function drawBoard(state) {
    const nodes = [el('circle', { class: 'darts-surround', cx: VIEW / 2, cy: VIEW / 2, r: R * SCALE })];
    // Twenty sectors, each in four beds (inner single, treble, outer single, double).
    SECTORS.forEach((number, index) => {
      const dark = [20, 18, 13, 10, 2, 3, 7, 8, 14, 12].includes(number);
      const wedge = (r0, r1, cls) => {
        const a0 = (index * 18 - 9) * Math.PI / 180, a1 = (index * 18 + 9) * Math.PI / 180, pt = (r, a) => toScreen([Math.sin(a) * r, Math.cos(a) * r]);
        const [x0, y0] = pt(r0, a0), [x1, y1] = pt(r1, a0), [x2, y2] = pt(r1, a1), [x3, y3] = pt(r0, a1);
        return el('path', { class: cls, d: `M${x0} ${y0}L${x1} ${y1}A${r1 * SCALE} ${r1 * SCALE} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r0 * SCALE} ${r0 * SCALE} 0 0 0 ${x0} ${y0}Z` });
      };
      nodes.push(wedge(RINGS.outerBull, RINGS.trebleIn, dark ? 'darts-dark' : 'darts-light'), wedge(RINGS.trebleIn, RINGS.trebleOut, dark ? 'darts-red' : 'darts-green'),
        wedge(RINGS.trebleOut, RINGS.doubleIn, dark ? 'darts-dark' : 'darts-light'), wedge(RINGS.doubleIn, RINGS.doubleOut, dark ? 'darts-red' : 'darts-green'));
      const a = index * 18 * Math.PI / 180, [nx, ny] = toScreen([Math.sin(a) * 188, Math.cos(a) * 188]);
      nodes.push(el('text', { class: 'darts-number', x: nx, y: ny + 6, 'text-anchor': 'middle' }, String(number)));
    });
    nodes.push(el('circle', { class: 'darts-green', cx: VIEW / 2, cy: VIEW / 2, r: RINGS.outerBull * SCALE }), el('circle', { class: 'darts-red', cx: VIEW / 2, cy: VIEW / 2, r: RINGS.bull * SCALE }));
    const shown = state.darts.length ? state.darts : (state.history.at(-1)?.darts ?? []);
    shown.forEach((dart, index) => { const [x, y] = toScreen(dart.point); nodes.push(el('circle', { class: 'darts-hit', cx: x, cy: y, r: 5, 'data-darts-hit': index })); });
    nodes.push(el('g', { class: 'darts-reticle' }));
    board.replaceChildren(...nodes);
  }

  function drawReticle() {
    const group = board.querySelector('.darts-reticle');
    if (!group || !game) return;
    const { state } = round();
    if (state.winner !== null || thinking || !yours(state) || !meter) { group.replaceChildren(); return; }
    const value = toMm(meterValue()), nodes = [];
    if (phase === 'x') { const [x] = toScreen([value, 0]); nodes.push(el('line', { class: 'darts-line', x1: x, y1: 8, x2: x, y2: VIEW - 8 })); }
    else { const [x] = toScreen([aimX, 0]), [, y] = toScreen([0, value]); nodes.push(el('line', { class: 'darts-line darts-line-set', x1: x, y1: 8, x2: x, y2: VIEW - 8 }), el('line', { class: 'darts-line', x1: 8, y1: y, x2: VIEW - 8, y2: y }), el('circle', { class: 'darts-target', cx: x, cy: y, r: 9 })); }
    group.replaceChildren(...nodes);
  }

  function render() {
    if (!game) return;
    const hadFocus = panel.contains(document.activeElement), { state } = round();
    if (state.winner !== null && !game.scored) { game.scored = true; game.wins[state.winner] += 1; }
    drawBoard(state); drawReticle();
    status.textContent = describe(state);
    panel.dataset.state = state.winner !== null ? 'over' : thinking ? 'thinking' : 'playing';
    $('.darts-scores').replaceChildren(...[0, 1].map(player => { const item = document.createElement('li'); item.textContent = `${who(player)}: ${state.scores[player]}${game.wins[player] ? ` · ${game.wins[player]} won` : ''}`; if (state.turn === player && state.winner === null) item.dataset.turn = ''; return item; }));
    const turn = state.darts.length ? state.darts : [];
    $('.darts-turn').textContent = turn.length ? `This turn: ${turn.map(dart => dart.label).join(' · ')}` : state.history.length ? `${who(state.history.at(-1).player)} last threw ${state.history.at(-1).darts.map(dart => dart.label).join(' · ')}${state.history.at(-1).result === 'bust' ? ': bust' : ''}.` : 'Three darts a turn.';
    const plan = state.winner === null && state.scores[state.turn] <= 170 ? checkout(state.scores[state.turn], 3 - state.darts.length) : null;
    $('.darts-checkout').textContent = plan ? `Checkout: ${plan.map(bed => bed.number === 25 ? (bed.double ? 'Bull' : '25') : `${bed.ring === 'treble' ? 'T' : bed.ring === 'double' ? 'D' : ''}${bed.number}`).join(' ')}` : '';
    throwButton.textContent = phase === 'x' ? 'Set the line' : 'Throw';
    throwButton.setAttribute('aria-disabled', String(state.winner !== null || thinking || !yours(state)));
    $('[data-darts-action="new"]').hidden = state.winner === null;
    for (const button of panel.querySelectorAll('[data-darts-mode]')) button.setAttribute('aria-pressed', String(button.dataset.dartsMode === game.mode));
    if (hadFocus && !panel.contains(document.activeElement)) (state.winner !== null ? $('[data-darts-action="new"]') : throwButton).focus({ preventScroll: true });
  }

  function describe(state) {
    if (state.winner !== null) return `${who(state.winner)} ${state.winner === 0 && game.mode !== 'pass' ? 'check out' : 'checks out'}: game!`;
    const before = game.said ? `${game.said} ` : '';
    if (thinking || !yours(state)) return `${before}${who(state.turn)} is at the line…`;
    const dart = `dart ${state.darts.length + 1} of 3`;
    return `${before}${game.mode === 'pass' ? `${who(state.turn)}, ${dart}.` : `Your ${dart}, on ${state.scores[state.turn]}.`} ${phase === 'x' ? 'Stop the line across the board.' : 'Now stop it for the height.'}`;
  }

  function land(point) {
    const before = round().state;
    game.points.push([Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10]);
    const after = round().state, last = after.history.at(-1);
    game.said = after.history.length > before.history.length && last.result === 'bust' ? `${who(last.player)} busts.` : '';
    mirror();
  }

  function press() {
    const { state } = round();
    if (!game || state.winner !== null || thinking || !yours(state) || !meter) return;
    if (phase === 'x') { aimX = toMm(meterValue()); startMeter('y'); render(); return; }
    const point = [aimX, toMm(meterValue())];
    land(point); startMeter('x'); render(); void regular();
  }

  async function regular() {
    const ticket = ++generation;
    thinking = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.winner !== null || yours(state)) break;
        render();
        await new Promise(resolve => setTimeout(resolve, replyDelay));
        if (ticket !== generation) return;
        land(throwPoint(state, game.seed));
      }
    } finally { if (ticket === generation) { thinking = false; startMeter('x'); render(); } }
  }

  throwButton.addEventListener('click', press);
  $('[data-darts-action="new"]').addEventListener('click', () => { generation++; thinking = false; newGame({ wins: game.wins }); mirror(); render(); void regular(); throwButton.focus(); });
  for (const button of panel.querySelectorAll('[data-darts-mode]')) button.addEventListener('click', () => { if (game.mode === button.dataset.dartsMode) return; generation++; thinking = false; newGame({ mode: button.dataset.dartsMode, wins: [0, 0] }); mirror(); render(); void regular(); });
  const close = () => { if (!panel.open) return; generation++; thinking = false; panel.close(); cancelAnimationFrame(frame); focusWorld(); };
  $('.table-game-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function atLine() {
    const pose = getPose(), table = getBoard();
    if (!pose || !table || pose.sitting || pose.riding || pose.altitude > 0.1) return false;
    return atDartsLine(table, [pose.position[0], -pose.position[2]]);
  }
  function open() {
    if (!atLine()) return;
    if (!game) newGame({});
    panel.show(); startMeter(phase); mirror(); render(); void regular();
    throwButton.focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (panel.open) return { kind: 'play', label: 'Leave the dartboard', run: close, disabled: false };
      if (!atLine()) return null;
      return { kind: 'play', label: 'Play darts', run: open, disabled: false };
    },
    update() { if (panel.open && !atLine()) close(); },
    open, close,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, mode: game.mode, turn: state.turn, scores: state.scores.slice(), darts: state.darts.map(dart => dart.label), thrown: game.points.length,
        last: state.history.at(-1) ? { player: state.history.at(-1).player, result: state.history.at(-1).result, darts: state.history.at(-1).darts.map(dart => dart.label) } : null,
        winner: state.winner, phase, aimX, meter: meter ? meterValue() : null, thinking, status: status.textContent };
    },
    // For tests: hold the sweeping line still at a value of its sweep (0–1), or at a millimetre position.
    hold(value) { if (!meter) return false; meter.held = Math.min(1, Math.max(0, value)); drawReticle(); return true; },
    holdAt(mm) { if (!meter) return false; meter.held = Math.min(1, Math.max(0, (mm / R + 1) / 2)); drawReticle(); return true; },
    // Starts afresh (for tests), keeping the mode.
    reset(seed) { if (!game) return false; generation++; thinking = false; newGame({ wins: game.wins }); if (seed !== undefined) game.seed = seed >>> 0; mirror(); render(); void regular(); return true; },
  };
}

