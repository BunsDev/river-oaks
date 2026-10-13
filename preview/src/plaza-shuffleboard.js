import './plaza-table-games.css';
import './plaza-shuffleboard.css';
import { attachGuide } from './salon-guide.js';
import { winePongSide } from './plaza-salon-plan.js';
import { FOUL, PUCK, PUCKS, SPREAD, TABLE, TARGET, ZONES, notation, replay, restFor, slide } from './shuffleboard-rules.js';
import { chooseThrow } from './shuffleboard-opponent.js';

// Table shuffleboard on the long café table, played standing at either end: against a
// plaza regular (both throwing from your end) or two players passing the turn. Stop the
// sweeping line across for the aim, then along for the power, and the puck slides on
// the sheet and the real table. X opens the table.

const SVG = 'http://www.w3.org/2000/svg', SCALE = 170, PAD = 22, TOP = 18;
const VIEW = { width: TABLE.width * SCALE + PAD * 2, height: TOP + TABLE.length * SCALE + PAD };
const NAMES = ['You', 'The plaza regular'];

export function createPlazaShuffleboard({ host = document.querySelector('#viewport'), getMirror = () => null, getTable = () => null, getPose = () => null, focusWorld = () => {},
  random = Math.random, now = () => performance.now(), replyDelay = 650, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, onSwitch = null } = {}) {
  let game = null, phase = 'aim', meter = null, aim = 0.5, generation = 0, thinking = false, sliding = null, frame = 0;

  const panel = document.createElement('dialog');
  panel.id = 'shuffleboard-panel'; panel.className = 'table-game-panel shuffleboard-panel';
  panel.setAttribute('aria-labelledby', 'shuffleboard-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="shuffleboard-title">Shuffleboard at the café</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the shuffleboard table">×</button></header>
    <div class="table-game-body shuffleboard-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-long-game="winePong" aria-pressed="false">Wine pong</button><button type="button" data-long-game="shuffleboard" aria-pressed="true">Shuffleboard</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="shuffle-scores" aria-label="Scores, the game ends at ${TARGET}"></ul>
      <svg class="shuffle-table" viewBox="0 0 ${VIEW.width} ${VIEW.height}" role="img" aria-label="The table from your end"></svg>
      <div class="table-game-actions">
        <button type="button" data-shuffle-action="throw">Set the aim</button><button type="button" data-shuffle-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-shuffle-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-shuffle-mode="pass" aria-pressed="false">Pass and play</button></div>
      </div>
      <p class="table-game-note">Four pucks each a round. Only the player furthest along scores: every puck beyond the other's best, 1, 2 or 3 by zone, 4 hanging over the end. First to ${TARGET}.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'shuffleboard');
  const $ = selector => panel.querySelector(selector);
  const board = $('.shuffle-table'), status = $('.table-game-status'), throwButton = $('[data-shuffle-action="throw"]');

  const round = () => replay(game.throws);
  const yours = state => game.mode === 'pass' || state.turn === 0;
  const who = player => game.mode === 'pass' ? `Player ${player + 1}` : NAMES[player];
  const newGame = (keep = {}) => { game = { seed: Math.floor(random() * 2 ** 32), throws: [], side: keep.side ?? game?.side ?? 0, mode: keep.mode ?? game?.mode ?? 'regular', wins: keep.wins ?? game?.wins ?? [0, 0], scored: false, said: '' }; startMeter('aim'); };
  const shown = state => (state.pucks.length ? state.pucks : state.last?.ended ?? []);
  const mirror = (list = null) => { if (game) getMirror()?.show(list ?? shown(round().state), game.side); };
  // The table from your end: the far end at the top.
  const toScreen = ([u, v]) => [VIEW.width / 2 + v * SCALE, TOP + (TABLE.length - u) * SCALE];
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };

  const period = () => (phase === 'aim' ? 2200 : 2000) * (reducedMotion ? 1.6 : 1);
  const meterValue = () => meter.held ?? (0.5 - 0.5 * Math.cos(2 * Math.PI * (now() - meter.start) / period()));
  function startMeter(next) {
    phase = next; meter = { start: now(), held: null };
    cancelAnimationFrame(frame);
    const tick = () => { if (!meter || !panel.open || sliding) return; drawReticle(); frame = requestAnimationFrame(tick); };
    if (panel.open) tick();
  }

  function draw(state, list) {
    const [x0, y0] = toScreen([TABLE.length, -TABLE.width / 2]), nodes = [el('rect', { class: 'shuffle-wood', x: x0, y: y0, width: TABLE.width * SCALE, height: TABLE.length * SCALE, rx: 6 })];
    ZONES.forEach((zone, index) => { const [, ya] = toScreen([zone.from, 0]), [, yb] = toScreen([ZONES[index + 1]?.from ?? TABLE.length, 0]); nodes.push(el('rect', { class: `shuffle-zone shuffle-zone-${zone.points}`, x: x0, y: yb, width: TABLE.width * SCALE, height: ya - yb }), el('text', { class: 'shuffle-zone-label', x: x0 + 8, y: (ya + yb) / 2 + 5 }, String(zone.points))); });
    const [, yf] = toScreen([FOUL, 0]); nodes.push(el('line', { class: 'shuffle-foul', x1: x0, x2: x0 + TABLE.width * SCALE, y1: yf, y2: yf }));
    nodes.push(el('text', { class: 'shuffle-zone-label', x: x0 + TABLE.width * SCALE - 18, y: y0 + 14 }, '4'));
    list.forEach((puck, index) => { if (puck.out) return; const [x, y] = toScreen([puck.u, puck.v]); nodes.push(el('circle', { class: `shuffle-puck shuffle-puck-${puck.owner}`, cx: x, cy: y, r: PUCK * SCALE, 'data-shuffle-puck': index })); });
    nodes.push(el('g', { class: 'shuffle-reticle' }));
    board.replaceChildren(...nodes);
    drawReticle();
  }

  function drawReticle() {
    const group = board.querySelector('.shuffle-reticle');
    if (!group || !game) return;
    const { state } = round();
    if (state.winner !== null || thinking || sliding || !yours(state) || !meter) { group.replaceChildren(); return; }
    const value = meterValue(), aimNow = phase === 'aim' ? value : aim, drift = (aimNow - 0.5) * 2 * SPREAD;
    // The aim line: from the start toward where a firm slide would drift at the far end.
    const [x1, y1] = toScreen([0.12, drift * 0.6]), [x2, y2] = toScreen([TABLE.length, drift * 0.6 + drift * 1.9]);
    const nodes = [el('line', { class: 'shuffle-aim', x1, y1, x2, y2 })];
    if (phase === 'power') { const u = Math.min(TABLE.length + 0.1, restFor(value)), t = (u - 0.12) / (TABLE.length - 0.12), [x, y] = [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]; nodes.push(el('circle', { class: 'shuffle-target', cx: x, cy: y, r: 10 })); }
    group.replaceChildren(...nodes);
  }

  function render() {
    if (!game) return;
    const hadFocus = panel.contains(document.activeElement), { state } = round();
    if (state.winner !== null && !game.scored) { game.scored = true; game.wins[state.winner] += 1; }
    draw(state, sliding?.list ?? shown(state));
    status.textContent = describe(state);
    panel.dataset.state = state.winner !== null ? 'over' : thinking || sliding ? 'thinking' : 'playing';
    $('.shuffle-scores').replaceChildren(...[0, 1].map(player => { const item = document.createElement('li'); item.textContent = `${who(player)}: ${state.scores[player]} · ${PUCKS - state.thrown[player]} puck${PUCKS - state.thrown[player] === 1 ? '' : 's'} left`; item.dataset.owner = player; if (state.turn === player && state.winner === null) item.dataset.turn = ''; return item; }));
    throwButton.textContent = phase === 'aim' ? 'Set the aim' : 'Slide';
    throwButton.setAttribute('aria-disabled', String(state.winner !== null || thinking || Boolean(sliding) || !yours(state)));
    $('[data-shuffle-action="new"]').hidden = state.winner === null;
    for (const button of panel.querySelectorAll('[data-shuffle-mode]')) button.setAttribute('aria-pressed', String(button.dataset.shuffleMode === game.mode));
    if (hadFocus && !panel.contains(document.activeElement)) (state.winner !== null ? $('[data-shuffle-action="new"]') : throwButton).focus({ preventScroll: true });
  }

  function describe(state) {
    if (state.winner !== null) return `${who(state.winner)} ${who(state.winner) === 'You' ? 'reach' : 'reaches'} ${state.scores[state.winner]}: game!`;
    const before = game.said ? `${game.said} ` : '';
    if (sliding) return `${before}The puck slides…`;
    if (thinking || !yours(state)) return `${before}${who(state.turn)} lines up a puck…`;
    return `${before}${game.mode === 'pass' ? `${who(state.turn)}, round ${state.round}.` : `Your puck, round ${state.round}.`} ${phase === 'aim' ? 'Stop the line for the aim.' : 'Now stop it for the power.'}`;
  }

  // Slides a puck: animates the simulation's frames, then records the throw.
  function throwPuck(shot) {
    const { state } = round(), { frames, pucks } = slide(state.pucks, state.turn, shot.aim, shot.power), owners = pucks.map(p => p.owner);
    const ticket = generation, step = reducedMotion ? 4 : 1;
    return new Promise(resolve => {
      let index = 0;
      const tick = () => {
        if (ticket !== generation) { sliding = null; resolve(false); return; }
        const positions = frames[Math.min(index, frames.length - 1)], list = positions.map(([u, v, out], i) => ({ owner: owners[i], u, v, out }));
        sliding = { list }; mirror(list); render();
        if (index >= frames.length - 1) { sliding = null; resolve(true); return; }
        index += step; requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }).then(done => {
      if (!done) return false;
      const before = round().state;
      game.throws.push(notation(shot.aim, shot.power));
      const after = round().state;
      game.said = after.round > before.round ? (after.last.scored ? `${who(after.last.scored[0])} ${after.last.scored[0] === 0 && game.mode !== 'pass' ? 'score' : 'scores'} ${after.last.scored[1]}.` : 'Nobody scores this round.') : '';
      mirror(); return true;
    });
  }

  async function press() {
    const { state } = round();
    if (!game || state.winner !== null || thinking || sliding || !yours(state) || !meter) return;
    if (phase === 'aim') { aim = meterValue(); startMeter('power'); render(); return; }
    const power = meterValue(); meter = null;
    if (await throwPuck({ aim: Number(aim.toFixed(3)), power: Number(power.toFixed(3)) })) { startMeter('aim'); render(); void regular(); }
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
        const shot = chooseThrow(state, game.seed);
        thinking = false;
        const done = await throwPuck({ aim: Number(shot.aim.toFixed(3)), power: Number(shot.power.toFixed(3)) });
        if (!done || ticket !== generation) return;
        thinking = true;
      }
    } finally { if (ticket === generation) { thinking = false; startMeter('aim'); render(); } }
  }

  throwButton.addEventListener('click', () => { if (throwButton.getAttribute('aria-disabled') !== 'true') void press(); });
  $('[data-shuffle-action="new"]').addEventListener('click', () => { generation++; thinking = false; sliding = null; newGame({ wins: game.wins }); mirror(); render(); void regular(); throwButton.focus(); });
  for (const button of panel.querySelectorAll('[data-shuffle-mode]')) button.addEventListener('click', () => { if (game.mode === button.dataset.shuffleMode) return; generation++; thinking = false; sliding = null; newGame({ mode: button.dataset.shuffleMode, wins: [0, 0] }); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-long-game]')) button.addEventListener('click', () => { if (button.dataset.longGame !== 'shuffleboard') onSwitch?.(button.dataset.longGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; thinking = false; sliding = null; panel.close(); cancelAnimationFrame(frame); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function standingSide() {
    const pose = getPose(), table = getTable();
    if (!pose || !table || pose.sitting || pose.riding || pose.altitude > 0.1) return null;
    return winePongSide(table, [pose.position[0], -pose.position[2]]);
  }
  function open() {
    const side = standingSide();
    if (side === null) return;
    if (!game || game.side !== side) newGame({ side, wins: game?.side === side ? game.wins : [0, 0] });
    panel.show(); startMeter(phase); mirror(); render(); void regular();
    throwButton.focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (panel.open) return { kind: 'play', label: 'Leave the shuffleboard table', run: () => close(), disabled: false };
      if (standingSide() === null) return null;
      return { kind: 'play', label: 'Play shuffleboard', run: open, disabled: false };
    },
    update() { if (panel.open && standingSide() === null) close(); },
    open, close,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, mode: game.mode, side: game.side, round: state.round, turn: state.turn, thrown: state.thrown.slice(), scores: state.scores.slice(), throws: game.throws.length,
        pucks: shown(state).filter(p => !p.out).length, last: state.last ? { player: state.last.player, rest: state.last.rest, scored: state.last.scored ?? null } : null,
        winner: state.winner, phase, aim, meter: meter ? meterValue() : null, thinking, sliding: Boolean(sliding), status: status.textContent };
    },
    hold(value) { if (!meter) return false; meter.held = Math.min(1, Math.max(0, value)); drawReticle(); return true; },
    reset() { if (!game) return false; generation++; thinking = false; sliding = null; newGame({ wins: game.wins }); mirror(); render(); void regular(); return true; },
  };
}
