import './plaza-table-games.css';
import { attachGuide } from './salon-guide.js';
import './plaza-wine-pong.css';
import { winePongOrigin, winePongSide } from './plaza-salon-plan.js';
import { RIM, TABLE, THROWS_PER_TURN, glassAt, landing, notation, replay, trajectory } from './wine-pong-rules.js';
import { chooseThrow } from './wine-pong-opponent.js';

// Wine pong at the long table by the café, for whoever stands at one of its ends:
// against a plaza regular at the far end, or two players passing the turn. Stop the
// sweeping reticle to aim, stop it again to set the power, and the ball flies; the
// table's glasses and ball mirror the game. X opens the table.

// The board: the table at 150 px a metre, with room above the far end for a long throw
// and below your end for your hand.
const SVG = 'http://www.w3.org/2000/svg', SCALE = 150, PAD = 26, TOP = 0.4 * SCALE;
const VIEW = { width: TABLE.width * SCALE + PAD * 2, height: TOP + (TABLE.length + 1.65) * SCALE };
// The close-up of the far rack: 0.75–1.5 m past the table's middle, at 300 px a metre.
const ZOOM = { scale: 300, near: 0.75, far: 1.5, pad: 14 };
ZOOM.width = TABLE.width * ZOOM.scale + ZOOM.pad * 2; ZOOM.height = (ZOOM.far - ZOOM.near) * ZOOM.scale + ZOOM.pad * 2;
const RESULT = { in: 'In! A glass goes down.', 'rim-in': 'Off the rim… and in!', 'rim-out': 'Off the rim, and out.', 'bounce-in': 'A bounce, and in!', miss: 'Missed.' };

export function createPlazaWinePong({ host = document.querySelector('#viewport'), getMirror = () => null, getTable = () => null, getPose = () => null, focusWorld = () => {},
  frameTable = () => {}, onWindup = () => {}, random = Math.random, now = () => performance.now(), replyDelay = 650, flight = 900, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, onSwitch = null } = {}) {
  let game = null, stance = null, phase = 'aim', meter = null, aim = 0.5, generation = 0, thinking = false, flying = false, said = '', frame = 0, inspectRack = false;

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
        <svg class="wine-pong-table" viewBox="0 0 ${VIEW.width} ${VIEW.height}" role="img" aria-label="The table from your end"></svg>
        <svg class="wine-pong-zoom" viewBox="0 0 ${ZOOM.width} ${ZOOM.height}" role="img" aria-label="Close-up of the far glasses" hidden></svg>
      </div>
      <div class="table-game-actions">
        <button type="button" data-pong-action="throw">Lock aim</button>
        <button type="button" data-pong-action="inspect" aria-pressed="false">Inspect rack</button>
        <button type="button" data-pong-action="reposition">Reposition</button>
        <button type="button" data-pong-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-pong-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-pong-mode="pass" aria-pressed="false">Pass and play</button></div>
      </div>
      <p class="table-game-note">Two throws a turn. Your standing position changes the launch. Reposition to walk along your end, then press X to resume. Stop the reticle to aim, then again for the power.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'winePong');
  const $ = selector => panel.querySelector(selector);
  const board = $('.wine-pong-table'), zoom = $('.wine-pong-zoom'), status = $('.table-game-status'), throwButton = $('[data-pong-action="throw"]');

  const round = () => replay(game.seed, game.throws);
  const shotOrigin = side => stance?.side === side ? stance.origin : null;
  const handAt = side => shotOrigin(side) ?? [side === 0 ? -1.6 : 1.6, 0];
  const yours = state => game.mode === 'pass' || state.turn === game.side;
  const who = side => game.mode === 'pass' ? (side === 0 ? 'West end' : 'East end') : side === game.side ? 'You' : 'The plaza regular';
  const newGame = (keep = {}) => {
    game = { seed: Math.floor(random() * 2 ** 32), throws: [], side: keep.side ?? game?.side ?? 0, mode: keep.mode ?? game?.mode ?? 'regular', wins: keep.wins ?? game?.wins ?? [0, 0], scored: false };
    said = ''; startMeter('aim');
  };
  const mirror = () => { if (game) getMirror()?.show(round().state); };

  // The view from the thrower's end: forward is up the screen, their left is screen left.
  const viewer = state => (game.mode === 'pass' ? state.turn : game.side);
  const toScreen = (side, [u, v]) => { const forward = side === 0 ? 1 : -1; return [VIEW.width / 2 - v * forward * SCALE, TOP + (TABLE.length / 2 - u * forward) * SCALE]; };
  const toZoom = (side, [u, v]) => { const forward = side === 0 ? 1 : -1; return [ZOOM.width / 2 - v * forward * ZOOM.scale, ZOOM.pad + (ZOOM.far - u * forward) * ZOOM.scale]; };

  // The reticle sweeps to and fro; stopping it sets the aim, then the power.
  const period = () => (phase === 'aim' ? 2200 : 1900) * (reducedMotion ? 1.6 : 1);
  const meterValue = () => meter.held ?? (0.5 - 0.5 * Math.cos(2 * Math.PI * (now() - meter.start) / period()));
  function startMeter(next) {
    phase = next; meter = { start: now(), held: null };
    cancelAnimationFrame(frame);
    const tick = () => { if (!meter || !panel.open) return; drawReticle(); frame = requestAnimationFrame(tick); };
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
    nodes.push(el('circle', { class: 'pong-hand', cx: hand[0], cy: hand[1], r: 7 }));
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
    panel.dataset.state = state.winner !== null ? 'over' : thinking || flying ? 'thinking' : 'playing';
    const scores = [0, 1].map(rackSide => { const item = document.createElement('li'); item.textContent = `${who(rackSide)}: ${state.glasses[rackSide].filter(Boolean).length} glasses · ${game.wins[rackSide]} won`; return item; });
    $('.wine-pong-scores').replaceChildren(...scores);
    throwButton.textContent = phase === 'aim' ? 'Lock aim' : 'Throw';
    // aria-disabled, not disabled: the button keeps keyboard focus through the flight and the
    // regular's turn, so Space throws again when it is yours (press() ignores it until then).
    throwButton.setAttribute('aria-disabled', String(state.winner !== null || thinking || flying || !yours(state)));
    $('[data-pong-action="new"]').hidden = state.winner === null;
    for (const button of panel.querySelectorAll('[data-pong-mode]')) button.setAttribute('aria-pressed', String(button.dataset.pongMode === game.mode));
    if (hadFocus && !panel.contains(document.activeElement)) (state.winner !== null ? $('[data-pong-action="new"]') : throwButton).focus({ preventScroll: true });
  }
  const el = (tag, attributes) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); return node; };

  function drawReticle() {
    const group = board.querySelector('.pong-reticle'), close = zoom.querySelector('.pong-reticle');
    if (!group || !game) return;
    const { state } = round(), side = viewer(state);
    if (state.winner !== null || thinking || flying || !yours(state) || !meter) { group.replaceChildren(); close?.replaceChildren(); return; }
    const value = meterValue(), origin = shotOrigin(side), hand = toScreen(side, handAt(side));
    const aimNow = phase === 'aim' ? value : aim, far = toScreen(side, landing(side, aimNow, 1, origin)), near = toScreen(side, landing(side, aimNow, 0, origin));
    const nodes = [el('line', { class: 'pong-aim', x1: hand[0], y1: hand[1], x2: far[0], y2: far[1] })];
    if (phase === 'power') { const [x, y] = toScreen(side, landing(side, aim, value, origin)); nodes.push(el('line', { class: 'pong-span', x1: near[0], y1: near[1], x2: far[0], y2: far[1] }), el('circle', { class: 'pong-target', cx: x, cy: y, r: 9 })); }
    group.replaceChildren(...nodes);
    // In the close-up the aim line crosses the far rack, and the power target rides along it.
    const [ax1, ay1] = toZoom(side, landing(side, aimNow, 0, origin)), [ax2, ay2] = toZoom(side, landing(side, aimNow, 1, origin)), closeNodes = [el('line', { class: 'pong-aim', x1: ax1, y1: ay1, x2: ax2, y2: ay2 })];
    if (phase === 'power') { const [x, y] = toZoom(side, landing(side, aim, value, origin)); closeNodes.push(el('circle', { class: 'pong-target', cx: x, cy: y, r: (RIM - 0.01) * ZOOM.scale })); }
    close?.replaceChildren(...closeNodes);
  }

  function describe(state) {
    if (state.winner !== null) return `${who(state.winner)} ${who(state.winner) === 'You' ? 'clear' : 'clears'} the rack and ${who(state.winner) === 'You' ? 'win' : 'wins'}!`;
    const before = said ? `${said} ` : '';
    if (flying) return 'The ball is in the air…';
    if (thinking || !yours(state)) return `${before}${who(state.turn)} lines up a throw…`;
    const count = `throw ${THROWS_PER_TURN - state.throwsLeft + 1} of ${THROWS_PER_TURN}`;
    const lead = game.mode === 'pass' ? `${who(state.turn)}, ${count}.` : `Your ${count}.`;
    return `${before}${lead} ${phase === 'aim' ? 'Stop the reticle to aim.' : 'Now stop it for the power.'}`;
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

  async function throwBall(aimValue, power, origin) {
    const { state } = round(), side = state.turn, text = notation(aimValue, power, origin);
    const next = replay(game.seed, [...game.throws, text]).state, outcome = next.last;
    const ticket = generation;
    onWindup();
    if (!reducedMotion) await new Promise(resolve => setTimeout(resolve, 180));
    if (ticket !== generation) return;
    if (!(await fly(side, outcome))) return;
    game.throws.push(text); said = RESULT[outcome.result]; flying = false;
    mirror(); startMeter('aim'); render(); void regular();
  }

  // Stopping the reticle: the first press sets the aim, the second throws.
  function press() {
    const { state } = round();
    if (!game || state.winner !== null || thinking || flying || !yours(state) || !meter) return;
    if (phase === 'aim') { aim = meterValue(); startMeter('power'); render(); return; }
    const power = meterValue(), origin = shotOrigin(state.turn)?.slice() ?? null; meter = null; flying = true; render();
    void throwBall(Number(aim.toFixed(3)), Number(power.toFixed(3)), origin);
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
    } finally { if (ticket === generation) { thinking = false; flying = false; startMeter('aim'); render(); } }
  }

  throwButton.addEventListener('click', press);
  $('[data-pong-action="inspect"]').addEventListener('click', event => {
    inspectRack = !inspectRack;
    zoom.toggleAttribute('hidden', !inspectRack);
    event.currentTarget.setAttribute('aria-pressed', String(inspectRack));
  });
  $('[data-pong-action="reposition"]').addEventListener('click', () => {
    if (flying || thinking) return;
    startMeter('aim'); close();
  });
  panel.addEventListener('keydown', event => {
    // Space and Enter press the focused Throw button natively (one click each).
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });
  $('[data-pong-action="new"]').addEventListener('click', () => { generation++; thinking = false; flying = false; newGame({ wins: game.wins }); mirror(); render(); void regular(); throwButton.focus(); });
  for (const button of panel.querySelectorAll('[data-pong-mode]')) button.addEventListener('click', () => {
    if (game.mode === button.dataset.pongMode) return;
    generation++; thinking = false; flying = false; newGame({ mode: button.dataset.pongMode, wins: [0, 0] }); mirror(); render(); void regular();
  });
  for (const button of panel.querySelectorAll('[data-long-game]')) button.addEventListener('click', () => { if (button.dataset.longGame !== 'winePong') onSwitch?.(button.dataset.longGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; thinking = false; flying = false; getMirror()?.ball(null); panel.close(); cancelAnimationFrame(frame); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());

  // The end of the table a standing visitor is at, if any.
  function standingStance() {
    const pose = getPose(), table = getTable();
    if (!pose || !table || pose.sitting || pose.riding || pose.altitude > 0.1) return null;
    const point = [pose.position[0], -pose.position[2]], side = winePongSide(table, point);
    if (side === null) return null;
    const origin = winePongOrigin(table, side, point);
    return origin ? { side, origin } : null;
  }

  function open() {
    const nextStance = standingStance();
    if (!nextStance) return;
    const { side } = nextStance;
    if (!game || game.side !== side) newGame({ side, wins: game?.side === side ? game.wins : [0, 0] });
    if (!stance || stance.side !== side || stance.origin.some((value, index) => Math.abs(value - nextStance.origin[index]) > 0.001)) startMeter('aim');
    stance = nextStance;
    frameTable(getTable(), stance);
    panel.show(); startMeter(phase); mirror(); render(); void regular();
    throwButton.focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (panel.open) return { kind: 'play', label: 'Leave the wine pong table', run: () => close(), disabled: false };
      if (!standingStance()) return null;
      return { kind: 'play', label: 'Play wine pong', run: open, disabled: false };
    },
    update() { if (panel.open && !standingStance()) close(); },
    open, close,
    debug() {
      if (!game) return { open: panel.open, game: null, standing: getPose()?.position.slice() ?? null };
      const { state } = round();
      return { open: panel.open, seed: game.seed, side: game.side, origin: stance?.origin.slice() ?? null, standing: getPose()?.position.slice() ?? null, mode: game.mode, turn: state.turn, throwsLeft: state.throwsLeft, throws: game.throws.slice(),
        glasses: state.glasses.map(rack => rack.filter(Boolean).length), winner: state.winner, wins: game.wins.slice(), phase, aim, meter: meter ? meterValue() : null,
        thinking, flying, last: state.last ? { result: state.last.result, glass: state.last.glass, side: state.last.side } : null, status: status.textContent };
    },
    // For tests: hold the reticle still at a value of its sweep (0–1).
    hold(value) { if (!meter) return false; meter.held = Math.min(1, Math.max(0, value)); drawReticle(); return true; },
    // Replaces the game with a seeded one (for tests); keeps the end and the mode.
    deal(seed) { if (!game) return false; generation++; thinking = false; flying = false; newGame({ wins: game.wins }); game.seed = seed >>> 0; mirror(); render(); void regular(); return true; },
  };
}
