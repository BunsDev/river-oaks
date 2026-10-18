import './plaza-table-games.css';
import { attachGuide } from './salon-guide.js';
import './plaza-wine-pong.css';
import { winePongNear, winePongOrigin, winePongSide } from './plaza-salon-plan.js';
import { RIM, TABLE, THROWS_PER_TURN, aimAt, glassAt, landing, notation, replay, trajectory } from './wine-pong-rules.js';
import { chooseThrow } from './wine-pong-opponent.js';
import { createHeldControls } from './throw-controls.js';

// Wine pong at the long table by the café, for whoever stands at one of its ends:
// against a plaza regular at the far end, or two players passing the turn. Left and
// right aim across the far rack, up and down set how far the ball carries (or click the
// table where it should come down); the hand sways a little, so the throw is timed as
// the landing mark passes a glass; Space throws. Reposition keeps the game open: walk
// along your end and the launch follows you, then X or Throw carries on. The table's
// glasses and ball mirror the game. X opens the table.

// The board: the table at 150 px a metre, with room above the far end for a long throw
// and below your end for your hand.
const SVG = 'http://www.w3.org/2000/svg', SCALE = 150, PAD = 26, TOP = 0.4 * SCALE;
const VIEW = { width: TABLE.width * SCALE + PAD * 2, height: TOP + (TABLE.length + 1.65) * SCALE };
// The close-up of the far rack: 0.75–1.5 m past the table's middle, at 300 px a metre.
const ZOOM = { scale: 300, near: 0.75, far: 1.5, pad: 14 };
ZOOM.width = TABLE.width * ZOOM.scale + ZOOM.pad * 2; ZOOM.height = (ZOOM.far - ZOOM.near) * ZOOM.scale + ZOOM.pad * 2;
const RESULT = { in: 'In! A glass goes down.', 'rim-in': 'Off the rim… and in!', 'rim-out': 'Off the rim, and out.', 'bounce-in': 'A bounce, and in!', miss: 'Missed.' };
// A tap moves the aim or the power one step, a held key keeps moving this far a second
// (Shift: a quarter). Aim 1 throws to the thrower's left, so the left key raises it.
const STEP = { aim: 0.01, power: 0.01 }, RATE = { aim: 0.3, power: 0.3 };
const KEYS = { ArrowLeft: ['aim', 1], KeyA: ['aim', 1], ArrowRight: ['aim', -1], KeyD: ['aim', -1], ArrowUp: ['power', 1], KeyW: ['power', 1], ArrowDown: ['power', -1], KeyS: ['power', -1] };
// The hand's sway: about ±3 cm of landing either way at the rack, doubling once the ball
// has been held up for 5 s more than 7 s.
const SWAY = { aim: 0.008, power: 0.011, calm: 5, tire: 7 };
const clamp = value => Math.min(1, Math.max(0, value));

export function createPlazaWinePong({ host = document.querySelector('#viewport'), getMirror = () => null, getTable = () => null, getPose = () => null, focusWorld = () => {},
  frameTable = () => {}, onWindup = () => {}, random = Math.random, now = () => performance.now(), replyDelay = 650, flight = 900, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, onSwitch = null } = {}) {
  let game = null, stance = null, aim = 0.5, power = 0.5, ready = now(), steady = false, generation = 0, thinking = false, flying = false, said = '', frame = 0, inspectRack = false;
  // Repositioning: the sheet stays open while the visitor walks; `away` when they have
  // stepped off the end (the launch waits for them to come back).
  let repositioning = false, away = false;
  const controls = createHeldControls({ keys: KEYS, step: STEP, rate: RATE, now,
    apply: move => { aim = clamp(aim + (move.aim ?? 0)); power = clamp(power + (move.power ?? 0)); steady = false; drawReticle(); } });

  const panel = document.createElement('dialog');
  panel.id = 'wine-pong-panel'; panel.className = 'table-game-panel wine-pong-panel';
  panel.setAttribute('aria-labelledby', 'wine-pong-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="wine-pong-title">Wine pong at the café</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the wine pong table">×</button></header>
    <div class="table-game-body wine-pong-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-long-game="winePong" aria-pressed="true">Wine pong</button><button type="button" data-long-game="shuffleboard" aria-pressed="false">Shuffleboard</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="wine-pong-scores" aria-label="Glasses left"></ul>
      <div class="wine-pong-views">
        <svg class="wine-pong-table" viewBox="0 0 ${VIEW.width} ${VIEW.height}" role="img" aria-label="The table from your end: click where the ball should come down"></svg>
        <svg class="wine-pong-zoom" viewBox="0 0 ${ZOOM.width} ${ZOOM.height}" role="img" aria-label="Close-up of the far glasses" hidden></svg>
      </div>
      <p class="wine-pong-readout"></p>
      <div class="table-game-actions">
        <button type="button" data-pong-action="throw">Throw</button>
        <button type="button" data-pong-action="inspect" aria-pressed="false">Inspect rack</button>
        <button type="button" data-pong-action="reposition" aria-pressed="false">Reposition</button>
        <button type="button" data-pong-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-pong-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-pong-mode="pass" aria-pressed="false">Pass and play</button></div>
      </div>
      <p class="table-game-note">Two throws a turn. Left and right aim, up and down set the distance (Shift for fine moves), or click the table where the ball should land; Space throws as the mark passes a glass. Reposition (R) to walk along your end without leaving the game; your standing spot changes the launch. X or Throw carries on.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'winePong');
  const $ = selector => panel.querySelector(selector);
  const board = $('.wine-pong-table'), zoom = $('.wine-pong-zoom'), status = $('.table-game-status'), throwButton = $('[data-pong-action="throw"]'), repositionButton = $('[data-pong-action="reposition"]');

  const round = () => replay(game.seed, game.throws);
  const shotOrigin = side => stance?.side === side ? stance.origin : null;
  const handAt = side => shotOrigin(side) ?? [side === 0 ? -1.6 : 1.6, 0];
  const yours = state => game.mode === 'pass' || state.turn === game.side;
  const who = side => game.mode === 'pass' ? (side === 0 ? 'West end' : 'East end') : side === game.side ? 'You' : 'The plaza regular';
  const newGame = (keep = {}) => {
    game = { seed: Math.floor(random() * 2 ** 32), throws: [], side: keep.side ?? game?.side ?? 0, mode: keep.mode ?? game?.mode ?? 'regular', wins: keep.wins ?? game?.wins ?? [0, 0], scored: false };
    said = ''; pickUp();
  };
  const mirror = () => { if (game) getMirror()?.show(round().state); };
  const canThrow = state => state.winner === null && !thinking && !flying && !repositioning && yours(state);

  // The view from the thrower's end: forward is up the screen, their left is screen left.
  const viewer = state => (game.mode === 'pass' ? state.turn : game.side);
  const toScreen = (side, [u, v]) => { const forward = side === 0 ? 1 : -1; return [VIEW.width / 2 - v * forward * SCALE, TOP + (TABLE.length / 2 - u * forward) * SCALE]; };
  const fromScreen = (side, [x, y]) => { const forward = side === 0 ? 1 : -1; return [(TABLE.length / 2 - (y - TOP) / SCALE) * forward, (VIEW.width / 2 - x) / (forward * SCALE)]; };
  const toZoom = (side, [u, v]) => { const forward = side === 0 ? 1 : -1; return [ZOOM.width / 2 - v * forward * ZOOM.scale, ZOOM.pad + (ZOOM.far - u * forward) * ZOOM.scale]; };

  // The aim and power with the hand's sway at this moment (reduced motion slows it).
  function swayed() {
    if (steady) return [aim, power];
    const t = (now() - ready) / 1000, pace = reducedMotion ? 0.6 : 1, grow = 1 + Math.min(1, Math.max(0, (t - SWAY.calm) / SWAY.tire));
    const wave = (f1, f2, p1, p2) => 0.62 * Math.sin(2 * Math.PI * f1 * pace * t + p1) + 0.38 * Math.sin(2 * Math.PI * f2 * pace * t + p2);
    return [clamp(aim + SWAY.aim * grow * wave(0.29, 0.57, 0.4, 1.9)), clamp(power + SWAY.power * grow * wave(0.23, 0.49, 1.1, 0.3))];
  }
  // A ball in hand: the sway starts calm, and held keys keep moving the aim and power.
  function pickUp() {
    ready = now();
    cancelAnimationFrame(frame);
    const tick = () => { if (!panel.open) return; controls.advance(); drawReticle(); frame = requestAnimationFrame(tick); };
    if (panel.open) tick();
  }

  function render() {
    if (!game) return;
    const active = document.activeElement, hadFocus = panel.contains(active);
    const { state } = round();
    if (state.winner !== null && !game.scored) { game.scored = true; game.wins[state.winner] += 1; }
    const side = viewer(state), nodes = [];
    const [x0, y0] = toScreen(side, [side === 0 ? TABLE.length / 2 : -TABLE.length / 2, side === 0 ? TABLE.width / 2 : -TABLE.width / 2]);
    nodes.push(el('rect', { class: 'pong-cloth', x: x0, y: y0, width: TABLE.width * SCALE, height: TABLE.length * SCALE, rx: 6 }));
    nodes.push(el('line', { class: 'pong-centre', x1: x0, x2: x0 + TABLE.width * SCALE, y1: TOP + TABLE.length / 2 * SCALE, y2: TOP + TABLE.length / 2 * SCALE }));
    state.glasses.forEach((rack, rackSide) => rack.forEach((standing, k) => {
      const [x, y] = toScreen(side, glassAt(rackSide, k));
      nodes.push(el('circle', { class: `pong-glass${standing ? '' : ' pong-glass-down'}${rackSide === side ? ' pong-glass-own' : ''}`, cx: x, cy: y, r: RIM * SCALE, 'data-pong-glass': `${rackSide}-${k}` }));
      if (standing) nodes.push(el('circle', { class: 'pong-wine', cx: x, cy: y, r: RIM * SCALE * 0.62 }));
    }));
    const hand = toScreen(side, handAt(side));
    nodes.push(el('circle', { class: `pong-hand${repositioning ? ' pong-hand-moving' : ''}`, cx: hand[0], cy: hand[1], r: 7 }));
    nodes.push(el('g', { class: 'pong-reticle' }));
    if (state.last) { const [x, y] = toScreen(side, state.last.bounce ?? state.last.land); nodes.push(el('circle', { class: 'pong-mark', cx: x, cy: y, r: 4 })); }
    nodes.push(el('circle', { class: 'pong-ball', r: 6, cx: -20, cy: -20 }));
    board.replaceChildren(...nodes);
    // The close-up: the far end of the cloth, the far rack large, the last landing, the reticle and the ball.
    const far = 1 - side, zoomed = [];
    const [zx0, zy0] = toZoom(side, [side === 0 ? TABLE.length / 2 : -TABLE.length / 2, side === 0 ? TABLE.width / 2 : -TABLE.width / 2]);
    zoomed.push(el('rect', { class: 'pong-cloth', x: zx0, y: zy0, width: TABLE.width * ZOOM.scale, height: (TABLE.length / 2 - ZOOM.near) * ZOOM.scale, rx: 8 }));
    state.glasses[far].forEach((standing, k) => {
      const [x, y] = toZoom(side, glassAt(far, k));
      zoomed.push(el('circle', { class: `pong-glass${standing ? '' : ' pong-glass-down'}`, cx: x, cy: y, r: RIM * ZOOM.scale, 'data-pong-zoom-glass': k }));
      if (standing) zoomed.push(el('circle', { class: 'pong-wine', cx: x, cy: y, r: RIM * ZOOM.scale * 0.62 }));
    });
    if (state.last && state.last.side === side) { const [x, y] = toZoom(side, state.last.bounce ?? state.last.land); zoomed.push(el('circle', { class: 'pong-mark', cx: x, cy: y, r: 6 })); }
    zoomed.push(el('g', { class: 'pong-reticle' }), el('circle', { class: 'pong-ball', r: 9, cx: -40, cy: -40 }));
    zoom.replaceChildren(...zoomed);
    drawReticle();
    status.textContent = describe(state);
    panel.dataset.state = state.winner !== null ? 'over' : thinking || flying ? 'thinking' : repositioning ? 'repositioning' : 'playing';
    const scores = [0, 1].map(rackSide => { const item = document.createElement('li'); item.textContent = `${who(rackSide)}: ${state.glasses[rackSide].filter(Boolean).length} glasses · ${game.wins[rackSide]} won`; return item; });
    $('.wine-pong-scores').replaceChildren(...scores);
    throwButton.textContent = repositioning ? 'Resume' : 'Throw';
    // aria-disabled, not disabled: the button keeps keyboard focus through the flight and the
    // regular's turn, so Space throws again when it is yours (press() ignores it until then).
    throwButton.setAttribute('aria-disabled', String(repositioning ? away : !canThrow(state)));
    repositionButton.setAttribute('aria-pressed', String(repositioning));
    $('[data-pong-action="new"]').hidden = state.winner === null;
    for (const button of panel.querySelectorAll('[data-pong-mode]')) button.setAttribute('aria-pressed', String(button.dataset.pongMode === game.mode));
    if (hadFocus && !panel.contains(document.activeElement)) (state.winner !== null ? $('[data-pong-action="new"]') : throwButton).focus({ preventScroll: true });
  }
  const el = (tag, attributes) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); return node; };

  // The aim line from the hand across the far end, the span the power covers, and the
  // mark where the ball would come down now.
  function drawReticle() {
    const group = board.querySelector('.pong-reticle'), close = zoom.querySelector('.pong-reticle');
    if (!group || !game) return;
    const { state } = round(), side = viewer(state);
    if (!canThrow(state)) { group.replaceChildren(); close?.replaceChildren(); $('.wine-pong-readout').textContent = ''; return; }
    const [aimNow, powerNow] = swayed(), origin = shotOrigin(side), hand = toScreen(side, handAt(side));
    const far = toScreen(side, landing(side, aimNow, 1, origin)), near = toScreen(side, landing(side, aimNow, 0, origin)), [x, y] = toScreen(side, landing(side, aimNow, powerNow, origin));
    group.replaceChildren(el('line', { class: 'pong-aim', x1: hand[0], y1: hand[1], x2: far[0], y2: far[1] }), el('line', { class: 'pong-span', x1: near[0], y1: near[1], x2: far[0], y2: far[1] }), el('circle', { class: 'pong-target', cx: x, cy: y, r: 9 }));
    // In the close-up the aim line crosses the far rack, and the mark rides along it.
    const [ax1, ay1] = toZoom(side, landing(side, aimNow, 0, origin)), [ax2, ay2] = toZoom(side, landing(side, aimNow, 1, origin)), [zx, zy] = toZoom(side, landing(side, aimNow, powerNow, origin));
    close?.replaceChildren(el('line', { class: 'pong-aim', x1: ax1, y1: ay1, x2: ax2, y2: ay2 }), el('circle', { class: 'pong-target', cx: zx, cy: zy, r: (RIM - 0.01) * ZOOM.scale }));
    $('.wine-pong-readout').textContent = `Aim ${aimNow < 0.5 ? 'right' : aimNow > 0.5 ? 'left' : 'straight'} ${Math.round(Math.abs(aimNow - 0.5) * 200)}%, distance ${Math.round(powerNow * 100)}%.`;
  }

  function describe(state) {
    if (state.winner !== null) return `${who(state.winner)} ${who(state.winner) === 'You' ? 'clear' : 'clears'} the rack and ${who(state.winner) === 'You' ? 'win' : 'wins'}!`;
    const before = said ? `${said} ` : '';
    if (flying) return 'The ball is in the air…';
    if (repositioning) return away ? `${before}Walk back to the ${game.side === 0 ? 'west' : 'east'} end of the table to throw.` : `${before}Walk along your end; the launch follows you. Press X or Resume to carry on.`;
    if (thinking || !yours(state)) return `${before}${who(state.turn)} lines up a throw…`;
    const count = `throw ${THROWS_PER_TURN - state.throwsLeft + 1} of ${THROWS_PER_TURN}`;
    const lead = game.mode === 'pass' ? `${who(state.turn)}, ${count}.` : `Your ${count}.`;
    return `${before}${lead} Aim and set the distance, then throw as the mark passes a glass.`;
  }

  // Flies the ball along the throw's path (in the sheet and over the real table), then records it.
  function fly(side, outcome) {
    const path = trajectory(side, outcome), duration = reducedMotion ? Math.min(flight, 300) : flight, start = now(), ticket = generation;
    flying = true; render();
    return new Promise(resolve => {
      const step = () => {
        if (ticket !== generation) { getMirror()?.ball(null); resolve(false); return; }
        const t = Math.min(1, (now() - start) / duration), point = path[Math.min(path.length - 1, Math.floor(t * (path.length - 1)))];
        getMirror()?.ball(point);
        const ball = board.querySelector('.pong-ball'), [x, y] = toScreen(viewer(round().state), [point[0], point[1]]);
        ball?.setAttribute('cx', x); ball?.setAttribute('cy', y); ball?.setAttribute('r', 5 + point[2] * 4);
        const closeBall = zoom.querySelector('.pong-ball'), [zx, zy] = toZoom(viewer(round().state), [point[0], point[1]]);
        closeBall?.setAttribute('cx', zx); closeBall?.setAttribute('cy', zy); closeBall?.setAttribute('r', 6 + point[2] * 6);
        if (t < 1) { requestAnimationFrame(step); return; }
        setTimeout(() => { getMirror()?.ball(null); resolve(true); }, 250);
      };
      requestAnimationFrame(step);
    });
  }

  async function throwBall(aimValue, powerValue, origin) {
    const { state } = round(), side = state.turn, text = notation(aimValue, powerValue, origin);
    const next = replay(game.seed, [...game.throws, text]).state, outcome = next.last;
    const ticket = generation;
    onWindup();
    if (!reducedMotion) await new Promise(resolve => setTimeout(resolve, 180));
    if (ticket !== generation) return;
    if (!(await fly(side, outcome))) return;
    game.throws.push(text); said = RESULT[outcome.result]; flying = false;
    mirror(); pickUp(); render(); void regular();
  }

  // Space or Throw: throws the ball where the mark is now (or carries on after repositioning).
  function press() {
    if (repositioning) { resume(); return; }
    const { state } = round();
    if (!game || !canThrow(state)) return;
    const [aimValue, powerValue] = swayed(), origin = shotOrigin(state.turn)?.slice() ?? null; flying = true; controls.clear(); render();
    void throwBall(Number(aimValue.toFixed(3)), Number(powerValue.toFixed(3)), origin);
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
        const choice = chooseThrow(state, game.seed), text = notation(choice.aim, choice.power);
        const outcome = replay(game.seed, [...game.throws, text]).state.last;
        thinking = false;
        const flew = await fly(state.turn, { ...outcome });
        if (!flew || ticket !== generation) return;
        game.throws.push(text); said = `The regular: ${RESULT[outcome.result].toLowerCase()}`; flying = false; thinking = true; mirror();
      }
    } finally { if (ticket === generation) { thinking = false; flying = false; pickUp(); render(); } }
  }

  // Reposition: the sheet stays open and the world takes the keys, so walking moves the
  // visitor; the launch follows them along their end until they carry on.
  function reposition() {
    if (flying || thinking || repositioning || !game) return;
    repositioning = true; away = false; controls.clear(); said = '';
    render(); focusWorld();
  }
  function resume() {
    if (!repositioning) return false;
    const next = standingStance();
    if (!next || (game.mode !== 'pass' && next.side !== game.side)) { away = true; render(); return false; }
    repositioning = false; away = false; stance = next;
    frameTable(getTable(), stance); pickUp(); render(); void regular();
    throwButton.focus({ preventScroll: true });
    return true;
  }

  throwButton.addEventListener('click', press);
  $('[data-pong-action="inspect"]').addEventListener('click', event => {
    inspectRack = !inspectRack;
    zoom.toggleAttribute('hidden', !inspectRack);
    event.currentTarget.setAttribute('aria-pressed', String(inspectRack));
  });
  repositionButton.addEventListener('click', () => { if (repositioning) resume(); else reposition(); });
  panel.addEventListener('keydown', event => {
    // Space and Enter press the focused Throw button natively (one click each).
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) {
      event.preventDefault(); event.stopPropagation();
      if (repositioning && event.code === 'KeyX') resume(); else close();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'KeyR' && !event.repeat) { event.preventDefault(); reposition(); return; }
    if (controls.down(event)) event.preventDefault();
  });
  panel.addEventListener('keyup', event => controls.up(event));
  panel.addEventListener('focusout', event => { if (!panel.contains(event.relatedTarget)) controls.clear(); });
  // A click or drag on the table sets the aim and power that bring the ball down there.
  const fromPointer = event => {
    const matrix = board.getScreenCTM?.(), { state } = round();
    if (!matrix || !canThrow(state)) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()), side = viewer(state);
    const target = aimAt(side, fromScreen(side, [point.x, point.y]), shotOrigin(side));
    aim = clamp(target.aim); power = clamp(target.power); steady = false; drawReticle();
  };
  board.addEventListener('pointerdown', event => { if (!game) return; event.preventDefault(); board.setPointerCapture?.(event.pointerId); fromPointer(event); throwButton.focus({ preventScroll: true }); });
  board.addEventListener('pointermove', event => { if (event.buttons) fromPointer(event); });
  $('[data-pong-action="new"]').addEventListener('click', () => { generation++; thinking = false; flying = false; newGame({ wins: game.wins }); mirror(); render(); void regular(); throwButton.focus(); });
  for (const button of panel.querySelectorAll('[data-pong-mode]')) button.addEventListener('click', () => {
    if (game.mode === button.dataset.pongMode) return;
    generation++; thinking = false; flying = false; newGame({ mode: button.dataset.pongMode, wins: [0, 0] }); mirror(); render(); void regular();
  });
  for (const button of panel.querySelectorAll('[data-long-game]')) button.addEventListener('click', () => { if (button.dataset.longGame !== 'winePong') onSwitch?.(button.dataset.longGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; thinking = false; flying = false; repositioning = false; away = false; controls.clear(); getMirror()?.ball(null); panel.close(); cancelAnimationFrame(frame); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());

  const standingPoint = () => { const pose = getPose(); return pose && !pose.sitting && !pose.riding && pose.altitude <= 0.1 ? [pose.position[0], -pose.position[2]] : null; };
  // The end of the table a standing visitor is at, if any.
  function standingStance() {
    const point = standingPoint(), table = getTable();
    if (!point || !table) return null;
    const side = winePongSide(table, point);
    if (side === null) return null;
    const origin = winePongOrigin(table, side, point);
    return origin ? { side, origin } : null;
  }

  function open() {
    const nextStance = standingStance();
    if (!nextStance) return;
    const { side } = nextStance;
    if (!game || game.side !== side) newGame({ side, wins: game?.side === side ? game.wins : [0, 0] });
    stance = nextStance; repositioning = false; away = false;
    frameTable(getTable(), stance);
    panel.show(); pickUp(); mirror(); render(); void regular();
    throwButton.focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (panel.open && repositioning) return { kind: 'play', label: 'Resume wine pong', run: resume, disabled: false };
      if (panel.open) return { kind: 'play', label: 'Leave the wine pong table', run: () => close(), disabled: false };
      if (!standingStance()) return null;
      return { kind: 'play', label: 'Play wine pong', run: open, disabled: false };
    },
    // Each frame: the launch follows a repositioning visitor along their end. Anyone who
    // steps off the end keeps the game, waiting for them; only leaving the table ends it.
    update() {
      if (!panel.open || !game) return;
      const next = standingStance(), point = standingPoint(), table = getTable();
      if (!point || !table || !winePongNear(table, point)) { close(); return; }
      if (!next || (game.mode !== 'pass' && next.side !== game.side)) {
        if (!repositioning) { repositioning = true; controls.clear(); }
        if (!away) { away = true; render(); }
        return;
      }
      const moved = !stance || stance.side !== next.side || Math.hypot(stance.origin[0] - next.origin[0], stance.origin[1] - next.origin[1]) > 0.01;
      if (moved || away) { stance = next; away = false; render(); }
    },
    open, close, reposition, resume,
    debug() {
      if (!game) return { open: panel.open, game: null, standing: getPose()?.position.slice() ?? null };
      const { state } = round();
      return { open: panel.open, seed: game.seed, side: game.side, origin: stance?.origin.slice() ?? null, standing: getPose()?.position.slice() ?? null, mode: game.mode, turn: state.turn, throwsLeft: state.throwsLeft, throws: game.throws.slice(),
        glasses: state.glasses.map(rack => rack.filter(Boolean).length), winner: state.winner, wins: game.wins.slice(), aim, power, swayed: swayed(), steady, repositioning, away,
        thinking, flying, last: state.last ? { result: state.last.result, glass: state.last.glass, side: state.last.side } : null, status: status.textContent };
    },
    // For tests: hold the hand still at an aim and a power (0–1). Keys or a click move it again.
    steadyAt(nextAim, nextPower) { aim = clamp(nextAim); power = clamp(nextPower); steady = true; drawReticle(); return [aim, power]; },
    // Replaces the game with a seeded one (for tests); keeps the end and the mode.
    deal(seed) { if (!game) return false; generation++; thinking = false; flying = false; newGame({ wins: game.wins }); game.seed = seed >>> 0; mirror(); render(); void regular(); return true; },
  };
}
