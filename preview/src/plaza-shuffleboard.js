import './plaza-table-games.css';
import './plaza-shuffleboard.css';
import { attachGuide } from './salon-guide.js';
import { winePongSide } from './plaza-salon-plan.js';
import { FOUL, PUCK, PUCKS, SPREAD, TABLE, TARGET, ZONES, notation, powerFor, replay, restFor, slide } from './shuffleboard-rules.js';
import { chooseThrow } from './shuffleboard-opponent.js';
import { createHeldControls } from './throw-controls.js';
import { soundToggle, throwSounds } from './throw-sounds.js';

// Table shuffleboard on the long café table, played standing at either end: against a
// plaza regular (both throwing from your end) or two players passing the turn. Left and
// right aim, up and down set the power (or click the table where the puck should stop);
// the hand sways a little, so the slide is timed as the mark passes the spot; Space
// slides, and the puck slides on the sheet and the real table, hissing and knocking. X
// opens the table.

const SVG = 'http://www.w3.org/2000/svg', SCALE = 170, PAD = 22, TOP = 18;
const VIEW = { width: TABLE.width * SCALE + PAD * 2, height: TOP + TABLE.length * SCALE + PAD };
const NAMES = ['You', 'The plaza regular'];
// A tap moves the aim or power one step; a held key keeps moving (Shift: a quarter). Aim
// above 0.5 drifts the puck to the right of the table as you see it.
const STEP = { aim: 0.01, power: 0.01 }, RATE = { aim: 0.3, power: 0.3 };
const KEYS = { ArrowLeft: ['aim', -1], KeyA: ['aim', -1], ArrowRight: ['aim', 1], KeyD: ['aim', 1], ArrowUp: ['power', 1], KeyW: ['power', 1], ArrowDown: ['power', -1], KeyS: ['power', -1] };
// The hand's sway (a few centimetres where the puck stops), growing once held up past 5 s.
const SWAY = { aim: 0.008, power: 0.01, calm: 5, tire: 7 };
const clamp = value => Math.min(1, Math.max(0, value));

export function createPlazaShuffleboard({ host = document.querySelector('#viewport'), getMirror = () => null, getTable = () => null, getPose = () => null, focusWorld = () => {},
  random = Math.random, now = () => performance.now(), replyDelay = 650, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, onSwitch = null, sounds = throwSounds() } = {}) {
  let game = null, aim = 0.5, power = 0.5, ready = now(), steady = false, generation = 0, thinking = false, sliding = null, frame = 0;
  const controls = createHeldControls({ keys: KEYS, step: STEP, rate: RATE, now,
    apply: move => { aim = clamp(aim + (move.aim ?? 0)); power = clamp(power + (move.power ?? 0)); steady = false; drawReticle(); } });

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
        <button type="button" data-shuffle-action="throw">Slide</button><button type="button" data-shuffle-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-shuffle-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-shuffle-mode="pass" aria-pressed="false">Pass and play</button></div>
      </div>
      <p class="table-game-readout shuffle-readout"></p>
      <p class="table-game-note">Left and right aim, up and down set the power (Shift for fine moves), or click the table where the puck should stop; Space slides as the mark passes the spot. Four pucks each a round. Only the player furthest along scores: every puck beyond the other's best, 1, 2 or 3 by zone, 4 hanging over the end. First to ${TARGET}.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'shuffleboard');
  const $ = selector => panel.querySelector(selector);
  const board = $('.shuffle-table'), status = $('.table-game-status'), throwButton = $('[data-shuffle-action="throw"]');
  throwButton.after(soundToggle(sounds));

  const round = () => replay(game.throws);
  const yours = state => game.mode === 'pass' || state.turn === 0;
  const who = player => game.mode === 'pass' ? `Player ${player + 1}` : NAMES[player];
  const newGame = (keep = {}) => { game = { seed: Math.floor(random() * 2 ** 32), throws: [], side: keep.side ?? game?.side ?? 0, mode: keep.mode ?? game?.mode ?? 'regular', wins: keep.wins ?? game?.wins ?? [0, 0], scored: false, said: '' }; pickUp(); };
  const shown = state => (state.pucks.length ? state.pucks : state.last?.ended ?? []);
  const mirror = (list = null) => { if (game) getMirror()?.show(list ?? shown(round().state), game.side); };
  // The table from your end: the far end at the top.
  const toScreen = ([u, v]) => [VIEW.width / 2 + v * SCALE, TOP + (TABLE.length - u) * SCALE];
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };

  const fromScreen = ([x, y]) => [TABLE.length - (y - TOP) / SCALE, (x - VIEW.width / 2) / SCALE];
  // The aim and power with the hand's sway at this moment (reduced motion slows it).
  function swayed() {
    if (steady) return [aim, power];
    const t = (now() - ready) / 1000, pace = reducedMotion ? 0.6 : 1, grow = 1 + Math.min(1, Math.max(0, (t - SWAY.calm) / SWAY.tire));
    const wave = (f1, f2, p1, p2) => 0.62 * Math.sin(2 * Math.PI * f1 * pace * t + p1) + 0.38 * Math.sin(2 * Math.PI * f2 * pace * t + p2);
    return [clamp(aim + SWAY.aim * grow * wave(0.27, 0.55, 0.9, 2.3)), clamp(power + SWAY.power * grow * wave(0.21, 0.47, 0.2, 1.4))];
  }
  // A puck in hand: the sway starts calm, and held keys keep moving the aim and power.
  function pickUp() {
    ready = now();
    cancelAnimationFrame(frame);
    const tick = () => { if (!panel.open) return; controls.advance(); if (!sliding) drawReticle(); frame = requestAnimationFrame(tick); };
    if (panel.open) tick();
  }
  // The aim line runs from the start toward where a firm slide would drift at the far end.
  const lineAt = (aimValue, u) => { const drift = (aimValue - 0.5) * 2 * SPREAD; return drift * 0.6 + drift * 1.9 * (u - 0.12) / (TABLE.length - 0.12); };

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
    if (state.winner !== null || thinking || sliding || !yours(state)) { group.replaceChildren(); $('.shuffle-readout').textContent = ''; return; }
    const [aimNow, powerNow] = swayed(), [x1, y1] = toScreen([0.12, lineAt(aimNow, 0.12)]), [x2, y2] = toScreen([TABLE.length, lineAt(aimNow, TABLE.length)]);
    // Where a lone puck would stop along it.
    const u = Math.min(TABLE.length + 0.1, restFor(powerNow)), [x, y] = toScreen([u, lineAt(aimNow, u)]);
    group.replaceChildren(el('line', { class: 'shuffle-aim', x1, y1, x2, y2 }), el('circle', { class: 'shuffle-target', cx: x, cy: y, r: 10 }));
    $('.shuffle-readout').textContent = `Aim ${aimNow < 0.5 ? 'left' : aimNow > 0.5 ? 'right' : 'straight'} ${Math.round(Math.abs(aimNow - 0.5) * 200)}%, power ${Math.round(powerNow * 100)}%.`;
  }

  function render() {
    if (!game) return;
    const hadFocus = panel.contains(document.activeElement), { state } = round();
    if (state.winner !== null && !game.scored) { game.scored = true; game.wins[state.winner] += 1; }
    draw(state, sliding?.list ?? shown(state));
    status.textContent = describe(state);
    panel.dataset.state = state.winner !== null ? 'over' : thinking || sliding ? 'thinking' : 'playing';
    $('.shuffle-scores').replaceChildren(...[0, 1].map(player => { const item = document.createElement('li'); item.textContent = `${who(player)}: ${state.scores[player]} · ${PUCKS - state.thrown[player]} puck${PUCKS - state.thrown[player] === 1 ? '' : 's'} left`; item.dataset.owner = player; if (state.turn === player && state.winner === null) item.dataset.turn = ''; return item; }));
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
    return `${before}${game.mode === 'pass' ? `${who(state.turn)}, round ${state.round}.` : `Your puck, round ${state.round}.`} Aim and set the power, then slide.`;
  }

  // Slides a puck: animates the simulation's frames, then records the throw.
  function throwPuck(shot) {
    const { state } = round(), { frames, pucks } = slide(state.pucks, state.turn, shot.aim, shot.power), owners = pucks.map(p => p.owner);
    const ticket = generation, step = reducedMotion ? 4 : 1, knocked = new Set();
    // The sheet draws `step` frames a display frame (about 60 a second), and the slide hisses
    // while it moves: sized to that, and stopped when the slide ends or is cancelled.
    sounds.play('release', { strength: 0.4 + shot.power * 0.4 });
    const hiss = sounds.play('slide', { seconds: frames.length / step / 60, strength: 0.5 + shot.power * 0.4, delay: 0.05 });
    return new Promise(resolve => {
      let index = 0;
      const tick = () => {
        if (ticket !== generation) { hiss?.stop(); sliding = null; resolve(false); return; }
        const positions = frames[Math.min(index, frames.length - 1)], list = positions.map(([u, v, out], i) => ({ owner: owners[i], u, v, out }));
        // A puck already down that starts to move has been struck: one knock each.
        const before = frames[Math.max(0, index - step)];
        positions.forEach(([u, v], i) => { if (i < positions.length - 1 && !knocked.has(i) && Math.hypot(u - before[i][0], v - before[i][1]) > 1e-4) { knocked.add(i); sounds.play('knock', { strength: 0.7 }); } });
        sliding = { list }; mirror(list); render();
        if (index >= frames.length - 1) { hiss?.stop(); sliding = null; resolve(true); return; }
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
    if (!game || state.winner !== null || thinking || sliding || !yours(state)) return;
    const [aimValue, powerValue] = swayed(); controls.clear();
    if (await throwPuck({ aim: Number(aimValue.toFixed(3)), power: Number(powerValue.toFixed(3)) })) { pickUp(); render(); void regular(); }
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
    } finally { if (ticket === generation) { thinking = false; pickUp(); render(); } }
  }

  throwButton.addEventListener('click', () => { if (throwButton.getAttribute('aria-disabled') !== 'true') void press(); });
  $('[data-shuffle-action="new"]').addEventListener('click', () => { generation++; thinking = false; sliding = null; newGame({ wins: game.wins }); mirror(); render(); void regular(); throwButton.focus(); });
  for (const button of panel.querySelectorAll('[data-shuffle-mode]')) button.addEventListener('click', () => { if (game.mode === button.dataset.shuffleMode) return; generation++; thinking = false; sliding = null; newGame({ mode: button.dataset.shuffleMode, wins: [0, 0] }); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-long-game]')) button.addEventListener('click', () => { if (button.dataset.longGame !== 'shuffleboard') onSwitch?.(button.dataset.longGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; thinking = false; sliding = null; controls.clear(); panel.close(); cancelAnimationFrame(frame); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (controls.down(event)) event.preventDefault();
  });
  panel.addEventListener('keyup', event => controls.up(event));
  panel.addEventListener('focusout', event => { if (!panel.contains(event.relatedTarget)) controls.clear(); });
  // A click or drag on the table aims a lone puck to stop there.
  const fromPointer = event => {
    const matrix = board.getScreenCTM?.(), { state } = round();
    if (!matrix || state.winner !== null || thinking || sliding || !yours(state)) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()), [u, v] = fromScreen([point.x, point.y]);
    const nextPower = clamp(powerFor(Math.max(0.2, u))), share = 0.6 + 1.9 * (u - 0.12) / (TABLE.length - 0.12);
    aim = clamp(0.5 + v / share / (2 * SPREAD)); power = Number.isFinite(nextPower) ? nextPower : 0; steady = false; drawReticle();
  };
  board.addEventListener('pointerdown', event => { if (!game) return; event.preventDefault(); board.setPointerCapture?.(event.pointerId); fromPointer(event); throwButton.focus({ preventScroll: true }); });
  board.addEventListener('pointermove', event => { if (event.buttons) fromPointer(event); });

  function standingSide() {
    const pose = getPose(), table = getTable();
    if (!pose || !table || pose.sitting || pose.riding || pose.altitude > 0.1) return null;
    return winePongSide(table, [pose.position[0], -pose.position[2]]);
  }
  function open() {
    const side = standingSide();
    if (side === null) return;
    if (!game || game.side !== side) newGame({ side, wins: game?.side === side ? game.wins : [0, 0] });
    panel.show(); pickUp(); mirror(); render(); void regular();
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
        winner: state.winner, aim, power, swayed: swayed(), steady, thinking, sliding: Boolean(sliding), status: status.textContent };
    },
    // For tests: hold the hand still at an aim and a power (0–1). Keys or a click move it again.
    steadyAt(nextAim, nextPower) { aim = clamp(nextAim); power = clamp(nextPower); steady = true; drawReticle(); return [aim, power]; },
    reset() { if (!game) return false; generation++; thinking = false; sliding = null; newGame({ wins: game.wins }); mirror(); render(); void regular(); return true; },
  };
}
