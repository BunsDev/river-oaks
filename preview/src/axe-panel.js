import './plaza-table-games.css';
import './plaza-darts.css';
import './axe-panel.css';
import { AXE_THROW, BOARD, KILLSHOTS, KILLSHOT_RADIUS, RINGS, THROWS, axeLandingOf, axeSpeedFor, replay, rotationError } from './axe-rules.js';
import { createHeldControls } from './throw-controls.js';
import { soundToggle, throwSounds } from './throw-sounds.js';
import { flyOnBoard } from './board-flight.js';

// Axe throwing in the axe-and-darts venue (server/axe-games.js holds every match): stand
// in a lane's throwing box and X opens the target. Left and right set where across the
// target the axe is released, up and down how hard (the speed sets the height, as the axe
// falls on its way). Where you stand sets its rotation: about one clean turn from 4.1 m;
// closer it under-rotates and the handle hits first, further back it over-rotates. The
// town lands the axe and decides whether it sticks, and a bounce says which way to step.
// Alone, practise against the house thrower; with someone else in the lane, invite them
// to ten throws each. Every lane's axes show on its real target for everyone in the room.
const SVG = 'http://www.w3.org/2000/svg', R = BOARD, SCALE = .5, VIEW = R * 2 * SCALE + 20;
// A tap moves the release 3 mm or the speed 0.03 m/s (about 10 mm of height); a held key
// keeps moving 150 mm or 1.2 m/s a second. Shift: a quarter.
const STEP = { across: 3, speed: 0.03 }, RATE = { across: 150, speed: 1.2 };
const KEYS = { ArrowLeft: ['across', -1], KeyA: ['across', -1], ArrowRight: ['across', 1], KeyD: ['across', 1], ArrowUp: ['speed', 1], KeyW: ['speed', 1], ArrowDown: ['speed', -1], KeyS: ['speed', -1] };
// The hand's sway: about ±10 mm across and ±0.05 m/s, doubling once held up 5 s more than 7 s.
const SWAY = { across: 10, speed: 0.05, calm: 5, tire: 7 };
const GUIDE_KEY = 'river-oaks-axes-guide';
const STEP_HINT = { under: 'The handle hit first: under-rotated. Step back a little.', over: 'The top hit first: over-rotated. Step a little closer.' };
const tenth = n => Math.round(n * 10) / 10;

// Reading `localStorage` itself throws when site data is blocked, so the default is guarded too.
const deviceStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export function createAxePanel({ host = document.querySelector('#viewport'), getMirror = () => null, focusWorld = () => {},
  now = () => performance.now(), reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, shared, storage = deviceStorage(), sounds = throwSounds() }) {
  // pending: a throw is with the town; flying: its axe is in the air on the sheet.
  let laneId = null, release = [0, AXE_THROW.nominal], ready = now(), steady = false, pending = false, flying = false, frame = 0, said = '', lastKey = '', generation = 0;
  let guide = true;
  try { guide = storage?.getItem(GUIDE_KEY) !== 'off'; } catch { /* storage may be unavailable */ }
  const panel = document.createElement('dialog');
  panel.id = 'axe-panel'; panel.className = 'table-game-panel darts-panel axe-panel';
  panel.setAttribute('aria-labelledby', 'axe-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Axe &amp; Darts · shared game</p><h2 id="axe-title">Axe throwing</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the target">×</button></header>
    <div class="table-game-body darts-body">
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="darts-scores" aria-label="Scores"></ul>
      <div class="darts-play"><svg class="darts-board" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="The axe target: drag to set the release and the speed"></svg>
        <div class="darts-side">
          <div class="darts-gauge" role="meter" aria-label="Throw speed" aria-valuemin="${AXE_THROW.speed[0]}" aria-valuemax="${AXE_THROW.speed[1]}">
            <span class="darts-gauge-fill"></span><span class="darts-gauge-last" hidden></span><span class="darts-gauge-bull"></span>
          </div>
          <p class="darts-readout"></p><p class="axe-stance"></p><p class="darts-turn" aria-live="polite"></p>
        </div></div>
      <div class="table-game-actions"><button type="button" data-axe-action="throw">Throw</button><button type="button" data-axe-action="guide" aria-pressed="true">Landing guide</button>
        <div class="table-game-mode axe-shared" role="group" aria-label="Match"></div></div>
      <p class="table-game-note">Left and right set where you release across the target; up and down how hard you throw (harder lands higher). Where you stand sets the axe's turn: about one clean turn from 4.1 m. Ten throws each, in turn. Bull 6, rings 4 to 1, a blue killshot 8. An axe that bounces off scores nothing.</p>
    </div>`;
  host.append(panel);
  const $ = selector => panel.querySelector(selector);
  const board = $('.darts-board'), status = $('.table-game-status'), throwButton = $('[data-axe-action="throw"]'), guideButton = $('[data-axe-action="guide"]');
  guideButton.after(soundToggle(sounds));
  const lane = () => laneId ? shared.lane(laneId) : null;
  const seat = player => lane()?.players?.[player] ?? null;
  const round = () => replay(lane()?.players ? lane().throws : []);
  const who = player => seat(player) === shared.selfId() ? 'You' : seat(player) === 'house' ? 'The house thrower' : shared.name(seat(player));
  const yours = state => Boolean(lane()?.players && !lane().result && seat(state.turn) === shared.selfId());
  // The thrower's own distance to the target (the town measures the same from where they stand).
  const distance = () => { const value = shared.distance?.(); return Number.isFinite(value) ? value : AXE_THROW.ideal; };
  const toScreen = ([x, y]) => [VIEW / 2 + x * SCALE, VIEW / 2 - y * SCALE];
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
  const clampRelease = ([x, speed]) => [Math.max(-AXE_THROW.across, Math.min(AXE_THROW.across, x)), Math.max(AXE_THROW.speed[0], Math.min(AXE_THROW.speed[1], speed))];
  const controls = createHeldControls({ keys: KEYS, step: STEP, rate: RATE, now,
    apply: move => { release = clampRelease([release[0] + (move.across ?? 0), release[1] + (move.speed ?? 0)]); steady = false; drawReticle(); } });

  // The hand's sway now: a slow wander that grows once the axe has been held up a while.
  function swayed() {
    if (steady) return release.slice();
    const t = (now() - ready) / 1000, pace = reducedMotion ? 0.6 : 1, grow = 1 + Math.min(1, Math.max(0, (t - SWAY.calm) / SWAY.tire));
    const wave = (f1, f2, p1, p2) => 0.62 * Math.sin(2 * Math.PI * f1 * pace * t + p1) + 0.38 * Math.sin(2 * Math.PI * f2 * pace * t + p2);
    return clampRelease([release[0] + SWAY.across * grow * wave(0.29, 0.51, 0.3, 1.7), release[1] + SWAY.speed * grow * wave(0.23, 0.57, 1.2, 0.4)]);
  }
  function pickUp() {
    ready = now(); cancelAnimationFrame(frame);
    const tick = () => { if (!panel.open) return; controls.advance(); drawReticle(); frame = requestAnimationFrame(tick); };
    if (panel.open) tick();
  }
  function drawBoard() {
    const nodes = [el('rect', { class: 'axe-planks', x: 10, y: 10, width: VIEW - 20, height: VIEW - 20, rx: 4 })];
    for (const ring of [...RINGS].reverse()) nodes.push(el('circle', { class: ring.value === 6 ? 'darts-red' : ring.value % 2 ? 'darts-light' : 'axe-ring', cx: VIEW / 2, cy: VIEW / 2, r: ring.radius * SCALE }));
    for (const point of KILLSHOTS) { const [x, y] = toScreen(point); nodes.push(el('circle', { class: 'axe-killshot', cx: x, cy: y, r: KILLSHOT_RADIUS * SCALE })); }
    (lane()?.throws ?? []).slice(-THROWS).forEach(({ point, stuck }, index) => { const [x, y] = toScreen(point); nodes.push(el('circle', { class: stuck ? 'darts-hit' : 'axe-drop', cx: x, cy: y, r: 6, 'data-axe-hit': index })); });
    nodes.push(el('g', { class: 'darts-reticle' }));
    board.replaceChildren(...nodes);
  }
  // The release line, the landing guide, the speed gauge and where you stand.
  function drawReticle() {
    const group = board.querySelector('.darts-reticle');
    if (!group) return;
    const active = !flying && yours(round().state), [x, speed] = active ? swayed() : release, metres = distance();
    $('.darts-gauge-fill').style.setProperty('--fill', ((speed - AXE_THROW.speed[0]) / (AXE_THROW.speed[1] - AXE_THROW.speed[0])).toFixed(4));
    $('.darts-gauge-bull').style.setProperty('--at', ((axeSpeedFor(0, metres) - AXE_THROW.speed[0]) / (AXE_THROW.speed[1] - AXE_THROW.speed[0])).toFixed(4));
    const gauge = $('.darts-gauge'), text = `${speed.toFixed(2)} m/s`;
    gauge.setAttribute('aria-valuenow', speed.toFixed(2)); gauge.setAttribute('aria-valuetext', text);
    $('.darts-readout').textContent = `${x === 0 ? 'Release on the centre line' : `Release ${Math.abs(x).toFixed(0)} mm ${x < 0 ? 'left' : 'right'} of centre`}; ${text}.`;
    const turn = rotationError(metres);
    $('.axe-stance').textContent = `You stand ${metres.toFixed(1)} m from the target: ${Math.abs(turn) <= 0.05 ? 'about one clean turn.' : turn < 0 ? 'the axe will under-rotate; a step back helps.' : 'the axe will over-rotate; a step closer helps.'}`;
    if (!active) { group.replaceChildren(); return; }
    const [lx] = toScreen([x, 0]), nodes = [el('line', { class: 'darts-line', x1: lx, y1: 8, x2: lx, y2: VIEW - 8 })];
    if (guide) { const [gx, gy] = toScreen(axeLandingOf([x, speed], metres)); nodes.push(el('circle', { class: 'darts-target', cx: gx, cy: gy, r: 9 }), el('circle', { class: 'darts-target-dot', cx: gx, cy: gy, r: 2 })); }
    group.replaceChildren(...nodes);
  }
  function describe(state) {
    const view = lane(), me = shared.selfId(), before = said ? `${said} ` : '';
    if (!view?.players) return before + (view?.invite?.to === me ? `${shared.name(view.invite.from)} invites you to a match.` : view?.invite?.from === me ? `Waiting for ${shared.name(view.invite.to)} to accept.` : 'Practise against the house thrower, or invite someone in this lane to a match.');
    if (view.result) return before + (view.result.reason === 'draw' ? 'A draw!' : view.result.reason === 'final' ? `${who(view.result.winner)} ${seat(view.result.winner) === me ? 'win' : 'wins'}!` : `${who(1 - view.result.winner)} ${view.result.reason === 'resigned' ? 'resigned' : 'left the lane'}.`);
    if (!view.players.includes(me)) return `${before}${who(0)} and ${who(1)} are throwing; ${who(state.turn)} is up.`;
    if (!yours(state)) return `${before}${who(state.turn)} is up…`;
    return `${before}Your throw ${state.throws[state.turn] + 1} of ${THROWS}. Line up the release and the speed, then throw.`;
  }
  function renderButtons() {
    const view = lane(), me = shared.selfId(), playing = Boolean(view?.players && !view.result), buttons = [];
    const add = (label, action, peer) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.axeShared = action; if (peer) button.dataset.peer = peer; buttons.push(button); };
    if (view?.invite?.to === me) { add(`Accept ${shared.name(view.invite.from)}`, 'accept'); add('Decline', 'decline'); }
    if (playing && view.players.includes(me)) add('Resign', 'resign');
    if (!playing || (view.players[0] === me && view.players[1] === 'house')) {
      if (!playing) add('Practise against the house', 'practice');
      for (const peer of shared.peers(laneId)) if (peer.id !== me && view?.invite?.to !== peer.id) add(`Invite ${peer.name}`, 'invite', peer.id);
    }
    $('.axe-shared').replaceChildren(...buttons);
  }
  function render() {
    if (!laneId) return;
    const { state } = round(), hadFocus = panel.contains(document.activeElement);
    drawBoard(); drawReticle(); renderButtons();
    status.textContent = describe(state);
    $('.darts-scores').replaceChildren(...(lane()?.players ? [0, 1] : []).map(player => { const item = document.createElement('li'); item.textContent = `${who(player)}: ${state.scores[player]} (${state.throws[player]}/${THROWS})`; if (state.turn === player && !lane().result) item.dataset.turn = ''; return item; }));
    const last = state.history.at(-1);
    $('.darts-turn').textContent = last ? `${who(last.player)} threw: ${last.label}${last.stuck ? ` (${last.value})` : ''}.` : 'Ten throws each.';
    throwButton.setAttribute('aria-disabled', String(pending || flying || !yours(state)));
    guideButton.setAttribute('aria-pressed', String(guide));
    if (hadFocus && !panel.contains(document.activeElement)) throwButton.focus({ preventScroll: true });
  }
  // A reply for a sheet that was closed or reopened meanwhile is dropped (`ticket`); the
  // snapshot still brings its axes. A throw holds the button until the town answers.
  async function send(message) {
    const ticket = generation, throwing = message.action === 'throw';
    if (throwing) { pending = true; render(); }
    let reply;
    try { reply = await shared.send({ type: 'axes', laneId, ...message }); } catch (error) { reply = { ok: false, message: error.message }; }
    finally { if (throwing && ticket === generation) pending = false; }
    if (ticket !== generation) return;
    said = reply?.ok ? '' : reply?.message ?? 'The lane did not take that.';
    // A throw the town took flies to where it landed (the reply names the thrower's own
    // axe, ahead of the house's answer): a thud if it stuck, a clatter if not.
    const landed = throwing && reply?.ok ? reply.axes?.throws?.[reply.thrown] ?? null : null;
    if (landed) {
      flying = true; drawReticle();
      let arrived = false;
      try {
        sounds.play('release', { strength: 0.7 });
        arrived = await flyOnBoard(board, { from: [VIEW / 2, VIEW - 6], to: toScreen(landed.point), reducedMotion, now, className: 'darts-flight', lift: 30, cancelled: () => ticket !== generation || !panel.open });
        if (arrived) sounds.play(landed.stuck ? 'axe-stick' : 'axe-bounce');
      } finally { if (ticket === generation) flying = false; }
      if (ticket !== generation) return;
      if (!landed.stuck) said = STEP_HINT[reply.rotation] ?? (Math.abs(landed.point[0]) > BOARD || Math.abs(landed.point[1]) > BOARD ? 'Off the target.' : 'It bounced off the grain.');
      pickUp();
    }
    lastKey = ''; render();
  }
  function press() {
    if (!laneId || pending || flying || !yours(round().state)) return;
    sounds.unlock();
    const thrown = swayed(), sent = [tenth(thrown[0]), Math.round(thrown[1] * 100) / 100];
    $('.darts-gauge-last').hidden = false;
    $('.darts-gauge-last').style.setProperty('--at', ((sent[1] - AXE_THROW.speed[0]) / (AXE_THROW.speed[1] - AXE_THROW.speed[0])).toFixed(4));
    void send({ action: 'throw', release: sent });
  }
  throwButton.addEventListener('click', press);
  guideButton.addEventListener('click', () => {
    guide = !guide;
    try { storage?.setItem(GUIDE_KEY, guide ? 'on' : 'off'); } catch { /* storage may be unavailable */ }
    render();
  });
  $('.axe-shared').addEventListener('click', event => {
    const button = event.target.closest('[data-axe-shared]');
    if (button) void send(button.dataset.axeShared === 'invite' ? { action: 'invite', peerId: button.dataset.peer } : { action: button.dataset.axeShared });
  });
  const close = () => { if (!panel.open) return; generation++; pending = false; flying = false; controls.clear(); panel.close(); cancelAnimationFrame(frame); laneId = null; focusWorld(); };
  $('.table-game-close').addEventListener('click', close);
  // The sheet keeps its keys: arrows and WASD line up the release (a tap is one step, a hold
  // keeps moving; Shift for fine moves), Space and Enter press the focused button.
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (controls.down(event)) event.preventDefault();
  });
  panel.addEventListener('keyup', event => controls.up(event));
  panel.addEventListener('focusout', event => { if (!panel.contains(event.relatedTarget)) controls.clear(); });
  // Dragging on the target places the release under the pointer: across directly, and the
  // speed that carries the axe to that height from where you stand.
  const fromPointer = event => {
    const matrix = board.getScreenCTM?.();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    release = clampRelease([(point.x - VIEW / 2) / SCALE, axeSpeedFor(-(point.y - VIEW / 2) / SCALE, distance())]); steady = false; drawReticle();
  };
  board.addEventListener('pointerdown', event => { if (!laneId) return; event.preventDefault(); board.setPointerCapture?.(event.pointerId); fromPointer(event); throwButton.focus({ preventScroll: true }); });
  board.addEventListener('pointermove', event => { if (event.buttons) fromPointer(event); });
  function open() {
    laneId = shared.laneAt();
    if (!laneId) return;
    said = ''; panel.show(); pickUp(); render(); throwButton.focus({ preventScroll: true });
  }
  const mirrorAll = () => { for (const id of shared.laneIds) getMirror(id)?.show(shared.lane(id)?.players ? shared.lane(id).throws : []); };

  return {
    panel,
    interaction() {
      if (panel.open) return { kind: 'play', label: 'Leave the lane', run: close, disabled: false };
      return shared.laneAt() ? { kind: 'play', label: 'Throw axes', run: open, disabled: false } : null;
    },
    update() {
      if (panel.open && shared.laneAt() !== laneId) close();
      // Everyone in the room sees each lane's axes on its real target, panel open or not.
      const key = JSON.stringify([shared.laneIds.map(id => [shared.lane(id)?.throws.length, shared.lane(id)?.result, shared.lane(id)?.invite, shared.lane(id)?.players]), panel.open && shared.peers(laneId).map(peer => peer.id)]);
      if (key === lastKey) return;
      lastKey = key; mirrorAll();
      if (panel.open && !flying) render();
    },
    open, close,
    debug: () => ({ open: panel.open, laneId, lane: lane(), status: status.textContent, release: release.slice(), swayed: swayed(), steady, guide, pending, flying, distance: distance(),
      buttons: [...panel.querySelectorAll('[data-axe-shared]')].map(button => button.textContent) }),
    // For tests: hold the hand still on a release [across mm, speed m/s], or on the release
    // that carries an axe to a point [across, height] mm from where you stand.
    steadyAt(next) { release = clampRelease(next); steady = true; drawReticle(); return release.slice(); },
    steadyOn([x, y]) { release = clampRelease([x, axeSpeedFor(y, distance())]); steady = true; drawReticle(); return release.slice(); },
  };
}
