import './plaza-table-games.css';
import './plaza-darts.css';
import { attachGuide } from './salon-guide.js';
import { atDartsLine } from './plaza-salon-plan.js';
import { RINGS, SECTORS, THROW, accelFor, checkout, handDraw, landingOf, releaseSpeed, replay, scoreAt, throwLanding } from './darts-rules.js';
import { throwPoint } from './darts-opponent.js';
import { seededRandom } from './seeded-random.js';
import { createHeldControls } from './throw-controls.js';
import { soundToggle, throwSounds } from './throw-sounds.js';
import { flyOnBoard } from './board-flight.js';

// Darts at the board on the plaza's south wall: 501, double out, for whoever stands at
// the throwing line, against a plaza regular or two players passing the turn. A throw is
// a release (darts-rules.js): left and right set where across the board the dart is let
// go, up and down how hard the hand accelerates, which sets its speed and so how far it
// falls on the way. The hand sways a little, more the longer it is held up, so the throw
// is timed as the landing guide passes the target; the hand's own error lands it. The
// real board shows the turn's darts. X opens the board.
// With `shared` (the IPIC Tuck Room board), the town holds the match instead
// (server/darts-games.js): a throw sends only the release and the server flies the dart,
// the house regular throws on the server, players invite each other at the line, and the
// real board shows every match to everyone in the room.

const SVG = 'http://www.w3.org/2000/svg', SCALE = 1.25, R = 205, VIEW = R * 2 * SCALE + 20;
const NAMES = ['You', 'The plaza regular'];
// A tap moves the release line 2 mm or the acceleration 0.25 m/s² (about 2 mm of height at
// the treble 20); a held key keeps moving 120 mm or 9 m/s² a second. Shift: a quarter.
const STEP = { across: 2, accel: 0.25 }, RATE = { across: 120, accel: 9 };
// The hand's sway: about ±7 mm across and ±0.8 m/s² (some 7 mm of height near the treble
// 20), growing to double after holding the dart up for 5 s more than 7 s.
const SWAY = { across: 7, accel: 0.8, calm: 5, tire: 7 };
const KEYS = { ArrowLeft: ['across', -1], KeyA: ['across', -1], ArrowRight: ['across', 1], KeyD: ['across', 1], ArrowUp: ['accel', 1], KeyW: ['accel', 1], ArrowDown: ['accel', -1], KeyS: ['accel', -1] };
const GUIDE_KEY = 'river-oaks-darts-guide';
const tenth = n => Math.round(n * 10) / 10;

export function createPlazaDarts({ host = document.querySelector('#viewport'), getMirror = () => null, getBoard = () => null, getPose = () => null, focusWorld = () => {},
  random = Math.random, now = () => performance.now(), replyDelay = 650, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  shared = null, storage = globalThis.localStorage, sounds = throwSounds() } = {}) {
  // pending: a shared throw is with the town; flying: a dart is in the air on the sheet.
  let game = null, release = [0, THROW.nominal], ready = now(), steady = false, last = null, generation = 0, thinking = false, pending = false, flying = false, frame = 0, lastKey = '';
  const controls = createHeldControls({ keys: KEYS, step: STEP, rate: RATE, now,
    apply: move => { release = clampRelease([release[0] + (move.across ?? 0), release[1] + (move.accel ?? 0)]); steady = false; drawReticle(); } });
  let guide = true;
  try { guide = storage?.getItem(GUIDE_KEY) !== 'off'; } catch { /* storage may be unavailable */ }
  const titleId = shared ? `darts-title-${shared.lineId}` : 'darts-title';

  const panel = document.createElement('dialog');
  panel.id = shared ? `darts-panel-${shared.lineId}` : 'darts-panel'; panel.className = 'table-game-panel darts-panel';
  panel.setAttribute('aria-labelledby', titleId);
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">${shared?.eyebrow ?? 'Plaza games · practice game'}</p><h2 id="${titleId}">${shared?.title ?? 'Darts on the south wall'}</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the dartboard">×</button></header>
    <div class="table-game-body darts-body">
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="darts-scores" aria-label="Scores left"></ul>
      <div class="darts-play">
        <svg class="darts-board" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="The dartboard: drag to set the release and the acceleration"></svg>
        <div class="darts-side">
          <div class="darts-gauge" role="meter" aria-label="Acceleration" aria-valuemin="${THROW.accel[0]}" aria-valuemax="${THROW.accel[1]}">
            <span class="darts-gauge-fill"></span><span class="darts-gauge-last" hidden></span><span class="darts-gauge-bull"></span>
          </div>
          <p class="darts-readout"></p><p class="darts-turn" aria-live="polite"></p><p class="darts-checkout"></p>
        </div>
      </div>
      <div class="table-game-actions">
        <button type="button" data-darts-action="throw">Throw</button><button type="button" data-darts-action="guide" aria-pressed="true">Landing guide</button><button type="button" data-darts-action="new">New game</button>
        ${shared ? '<div class="table-game-mode darts-shared" role="group" aria-label="Match"></div>' : '<div class="table-game-mode" role="group" aria-label="Opponent"><button type="button" data-darts-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-darts-mode="pass" aria-pressed="false">Pass and play</button></div>'}
      </div>
      <p class="table-game-note">Left and right set where you release across the board; up and down how hard you throw. A soft throw drops low, a hard one flies high. Hold Shift for fine moves, or drag on the board. Space throws as the guide passes your target. 501, double out: three darts a turn, finish exactly on a double or the bull.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'darts');
  const $ = selector => panel.querySelector(selector);
  const board = $('.darts-board'), status = $('.table-game-status'), throwButton = $('[data-darts-action="throw"]'), guideButton = $('[data-darts-action="guide"]');
  guideButton.after(soundToggle(sounds));

  // The shared line's match from the town's snapshot, or null.
  const line = () => shared?.line() ?? null;
  const seat = player => line()?.players?.[player] ?? null;
  const round = () => replay(shared ? (line()?.players ? line().points : []) : game.points);
  const yours = state => shared ? Boolean(line()?.players && !line().result && seat(state.turn) === shared.selfId()) : game.mode === 'pass' || state.turn === 0;
  const who = player => shared ? (seat(player) === shared.selfId() ? 'You' : seat(player) === 'regular' ? 'The house regular' : shared.name(seat(player)))
    : game.mode === 'pass' ? `Player ${player + 1}` : NAMES[player];
  const sharedGame = () => ({ points: [], mode: 'shared', wins: [0, 0], scored: true, said: '' });
  const newGame = (keep = {}) => { game = { seed: Math.floor(random() * 2 ** 32), points: [], mode: keep.mode ?? game?.mode ?? 'regular', wins: keep.wins ?? game?.wins ?? [0, 0], scored: false, said: '' }; pickUp(); };
  const mirror = () => { if (game) { const { state } = round(); getMirror()?.show(state.darts.length ? state.darts.map(dart => dart.point) : (state.history.at(-1)?.darts ?? []).map(dart => dart.point)); } };
  const toScreen = ([x, y]) => [VIEW / 2 + x * SCALE, VIEW / 2 - y * SCALE];
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
  const clampRelease = ([x, accel]) => [Math.max(-THROW.across, Math.min(THROW.across, x)), Math.max(THROW.accel[0], Math.min(THROW.accel[1], accel))];

  // The hand's sway at this moment: a slow, bounded wander that grows once the dart has
  // been held up a while (reduced motion slows it, it never stops).
  function swayed() {
    if (steady) return release.slice();
    const t = (now() - ready) / 1000, pace = reducedMotion ? 0.6 : 1, grow = 1 + Math.min(1, Math.max(0, (t - SWAY.calm) / SWAY.tire)), wave = (f1, f2, p1, p2) => 0.62 * Math.sin(2 * Math.PI * f1 * pace * t + p1) + 0.38 * Math.sin(2 * Math.PI * f2 * pace * t + p2);
    return clampRelease([release[0] + SWAY.across * grow * wave(0.31, 0.53, 0, 1.3), release[1] + SWAY.accel * grow * wave(0.27, 0.61, 0.7, 2.1)]);
  }
  // A fresh dart in the hand: the sway starts calm again.
  function pickUp() {
    ready = now();
    cancelAnimationFrame(frame);
    const tick = () => { if (!panel.open) return; controls.advance(); drawReticle(); frame = requestAnimationFrame(tick); };
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

  // The release line, the landing guide and the acceleration gauge, for the dart in hand.
  function drawReticle() {
    const group = board.querySelector('.darts-reticle');
    if (!group || !game) return;
    const { state } = round(), active = state.winner === null && !thinking && !flying && yours(state);
    const [x, accel] = active ? swayed() : release, fill = (accel - THROW.accel[0]) / (THROW.accel[1] - THROW.accel[0]);
    $('.darts-gauge-fill').style.setProperty('--fill', fill.toFixed(4));
    const gauge = $('.darts-gauge'), speed = releaseSpeed(accel), text = `${accel.toFixed(1)} m/s², release at ${speed.toFixed(2)} m/s`;
    gauge.setAttribute('aria-valuenow', accel.toFixed(1)); gauge.setAttribute('aria-valuetext', text);
    $('.darts-readout').textContent = `${x === 0 ? 'Release on the centre line' : `Release ${Math.abs(x).toFixed(0)} mm ${x < 0 ? 'left' : 'right'} of centre`}; ${text}.`;
    if (!active) { group.replaceChildren(); return; }
    const [lx] = toScreen([x, 0]), nodes = [el('line', { class: 'darts-line', x1: lx, y1: 8, x2: lx, y2: VIEW - 8 })];
    if (guide) { const [gx, gy] = toScreen(landingOf([x, accel])); nodes.push(el('circle', { class: 'darts-target', cx: gx, cy: gy, r: 9 }), el('circle', { class: 'darts-target-dot', cx: gx, cy: gy, r: 2 })); }
    group.replaceChildren(...nodes);
  }

  function render() {
    if (!game) return;
    const hadFocus = panel.contains(document.activeElement), { state } = round();
    if (state.winner !== null && !game.scored) { game.scored = true; game.wins[state.winner] += 1; }
    drawBoard(state); drawReticle();
    status.textContent = describe(state);
    panel.dataset.state = state.winner !== null ? 'over' : thinking ? 'thinking' : 'playing';
    if (shared) renderShared();
    $('.darts-scores').replaceChildren(...(shared && !line()?.players ? [] : [0, 1]).map(player => { const item = document.createElement('li'); item.textContent = `${who(player)}: ${state.scores[player]}${game.wins[player] ? ` · ${game.wins[player]} won` : ''}`; if (state.turn === player && state.winner === null) item.dataset.turn = ''; return item; }));
    const turn = state.darts.length ? state.darts : [];
    $('.darts-turn').textContent = turn.length ? `This turn: ${turn.map(dart => dart.label).join(' · ')}` : state.history.length ? `${who(state.history.at(-1).player)} last threw ${state.history.at(-1).darts.map(dart => dart.label).join(' · ')}${state.history.at(-1).result === 'bust' ? ': bust' : ''}.` : 'Three darts a turn.';
    const plan = state.winner === null && state.scores[state.turn] <= 170 ? checkout(state.scores[state.turn], 3 - state.darts.length) : null;
    $('.darts-checkout').textContent = plan ? `Checkout: ${plan.map(bed => bed.number === 25 ? (bed.double ? 'Bull' : '25') : `${bed.ring === 'treble' ? 'T' : bed.ring === 'double' ? 'D' : ''}${bed.number}`).join(' ')}` : '';
    // Your last throw's acceleration stays marked on the gauge, to throw against.
    const mark = $('.darts-gauge-last');
    mark.hidden = !last; if (last) mark.style.setProperty('--at', ((last.release[1] - THROW.accel[0]) / (THROW.accel[1] - THROW.accel[0])).toFixed(4));
    $('.darts-gauge-bull').style.setProperty('--at', ((THROW.nominal - THROW.accel[0]) / (THROW.accel[1] - THROW.accel[0])).toFixed(4));
    throwButton.setAttribute('aria-disabled', String(state.winner !== null || thinking || pending || flying || !yours(state)));
    guideButton.setAttribute('aria-pressed', String(guide));
    $('[data-darts-action="new"]').hidden = Boolean(shared) || state.winner === null;
    for (const button of panel.querySelectorAll('[data-darts-mode]')) button.setAttribute('aria-pressed', String(button.dataset.dartsMode === game.mode));
    if (hadFocus && !panel.contains(document.activeElement)) (state.winner !== null ? $('[data-darts-action="new"]') : throwButton).focus({ preventScroll: true });
  }

  function describe(state) {
    if (shared) {
      const view = line(), me = shared.selfId(), said = game.said ? `${game.said} ` : '';
      if (!view?.players) return said + (view?.invite?.to === me ? `${shared.name(view.invite.from)} invites you to a match.`
        : view?.invite?.from === me ? `Waiting for ${shared.name(view.invite.to)} to accept.` : 'Practise against the house regular, or invite someone at the line to a match.');
      if (view.result) return said + (view.result.reason === 'checkout' ? `${who(view.result.winner)} ${seat(view.result.winner) === me ? 'check out' : 'checks out'}: game!`
        : view.result.winner === null ? 'The match ran out of darts.' : `${who(1 - view.result.winner)} ${view.result.reason === 'resigned' ? 'resigned' : 'left the line'}.`);
      if (!view.players.includes(me)) return `${said}${who(0)} and ${who(1)} are playing; ${who(state.turn)} to throw.`;
    }
    if (state.winner !== null) return `${who(state.winner)} ${state.winner === 0 && game.mode !== 'pass' ? 'check out' : 'checks out'}: game!`;
    const before = game.said ? `${game.said} ` : '';
    if (thinking || !yours(state)) return `${before}${who(state.turn)} is at the line…`;
    const dart = `dart ${state.darts.length + 1} of 3`;
    return `${before}${game.mode === 'pass' ? `${who(state.turn)}, ${dart}.` : `Your ${dart}, on ${state.scores[state.turn]}.`} Line up the release and the acceleration, then throw.`;
  }

  function land(point) {
    const before = round().state;
    game.points.push([tenth(point[0]), tenth(point[1])]);
    const after = round().state, previous = after.history.at(-1);
    game.said = after.history.length > before.history.length && previous.result === 'bust' ? `${who(previous.player)} busts.` : '';
    mirror();
  }

  // The hand's error for a practice dart, seeded from the game and the dart, so it replays.
  const handFor = dart => { const next = seededRandom((Math.imul(game.seed >>> 0, 0x5bd1e995) ^ Math.imul(dart + 1, 0x27d4eb2f)) >>> 0); return [handDraw(next() * 0.999998 + 0.000001), handDraw(next() * 0.999998 + 0.000001)]; };

  // The dart in the air: from the hand below the board onto where it landed, then its thunk.
  // Resolves false if the sheet closed or a new game started meanwhile (those clear `flying`
  // themselves, so a later dart's flight is never cut short).
  async function fly(point, accel = last?.release?.[1] ?? THROW.nominal) {
    const ticket = generation, strength = Math.min(1, Math.max(0.2, (accel - THROW.accel[0]) / (THROW.accel[1] - THROW.accel[0])));
    flying = true; drawReticle();
    try {
      sounds.play('release', { strength });
      const arrived = await flyOnBoard(board, { from: [VIEW / 2, VIEW - 6], to: toScreen(point), reducedMotion, now, className: 'darts-flight', cancelled: () => ticket !== generation || !panel.open });
      if (arrived) sounds.play(scoreAt(point).value > 0 ? 'dart' : 'dart-miss', { strength });
      return arrived;
    } finally { if (ticket === generation) flying = false; }
  }

  async function press() {
    const { state } = round();
    if (!game || state.winner !== null || thinking || pending || flying || !yours(state)) return;
    sounds.unlock();
    const thrown = swayed(), sent = [tenth(thrown[0]), Math.round(thrown[1] * 100) / 100];
    last = { release: sent, before: state.darts.length };
    if (shared) { pickUp(); void send({ action: 'throw', release: sent }); return; }
    const point = throwLanding(sent, handFor(game.points.length));
    if (!(await fly(point))) return;
    land(point); pickUp(); render(); void regular();
  }

  // Shared matches: the town answers, and its snapshot brings the darts back. A reply for a
  // sheet closed meanwhile is dropped (`ticket`). A throw holds the button until the town answers.
  async function send(message) {
    const ticket = generation, throwing = message.action === 'throw';
    if (throwing) { pending = true; render(); }
    let reply;
    try { reply = await shared.send({ type: 'darts', lineId: shared.lineId, ...message }); }
    catch (error) { reply = { ok: false, message: error.message }; }
    finally { if (throwing && ticket === generation) pending = false; }
    if (ticket !== generation) return;
    game.said = reply?.ok ? '' : reply?.message ?? 'The board did not take that.';
    // A throw the town took flies to where the town landed it: the reply names the
    // thrower's own dart, ahead of any the regular answers with.
    const landed = throwing && reply?.ok ? reply.darts?.points?.[reply.thrown] ?? null : null;
    if (landed && !(await fly(landed))) return;
    lastKey = ''; render();
  }
  function renderShared() {
    const view = line(), me = shared.selfId(), playing = Boolean(view?.players && !view.result), buttons = [];
    const add = (label, action, peer) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.dartsShared = action; if (peer) button.dataset.peer = peer; buttons.push(button); };
    if (view?.invite?.to === me) { add(`Accept ${shared.name(view.invite.from)}`, 'accept'); add('Decline', 'decline'); }
    if (playing && view.players.includes(me)) add('Resign', 'resign');
    if (!playing || (view.players[0] === me && view.players[1] === 'regular')) {
      if (!playing) add('Practise against the regular', 'practice');
      for (const peer of shared.peers()) if (peer.id !== me && view?.invite?.to !== peer.id) add(`Invite ${peer.name}`, 'invite', peer.id);
    }
    $('.darts-shared').replaceChildren(...buttons);
  }
  $('.darts-shared')?.addEventListener('click', event => {
    const button = event.target.closest('[data-darts-shared]');
    if (button) void send(button.dataset.dartsShared === 'invite' ? { action: 'invite', peerId: button.dataset.peer } : { action: button.dataset.dartsShared });
  });

  async function regular() {
    if (shared) return;
    const ticket = ++generation;
    thinking = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.winner !== null || yours(state)) break;
        render();
        await new Promise(resolve => setTimeout(resolve, replyDelay));
        if (ticket !== generation) return;
        const point = throwPoint(state, game.seed);
        if (!(await fly(point, THROW.nominal)) || ticket !== generation) return;
        land(point); render();
      }
    } finally { if (ticket === generation) { thinking = false; pickUp(); render(); } }
  }

  throwButton.addEventListener('click', press);
  guideButton.addEventListener('click', () => {
    guide = !guide;
    try { storage?.setItem(GUIDE_KEY, guide ? 'on' : 'off'); } catch { /* storage may be unavailable */ }
    render();
  });
  $('[data-darts-action="new"]').addEventListener('click', () => { generation++; thinking = false; pending = false; flying = false; last = null; newGame({ wins: game.wins }); mirror(); render(); void regular(); throwButton.focus(); });
  for (const button of panel.querySelectorAll('[data-darts-mode]')) button.addEventListener('click', () => { if (game.mode === button.dataset.dartsMode) return; generation++; thinking = false; pending = false; flying = false; last = null; newGame({ mode: button.dataset.dartsMode, wins: [0, 0] }); mirror(); render(); void regular(); });
  const close = () => { if (!panel.open) return; generation++; thinking = false; pending = false; flying = false; controls.clear(); panel.close(); cancelAnimationFrame(frame); focusWorld(); };
  $('.table-game-close').addEventListener('click', close);
  // The sheet keeps its keys: arrows and WASD line up the release (a tap is one step, a hold
// keeps moving; Shift for fine moves),
  // Space and Enter press the focused button, X and Escape put the board away.
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (controls.down(event)) event.preventDefault();
  });
  panel.addEventListener('keyup', event => controls.up(event));
  panel.addEventListener('focusout', event => { if (!panel.contains(event.relatedTarget)) controls.clear(); });
  // Dragging on the board places the release under the pointer: across directly, the
  // acceleration that would carry the dart to that height.
  const fromPointer = event => {
    const matrix = board.getScreenCTM?.();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    release = clampRelease([(point.x - VIEW / 2) / SCALE, accelFor(-(point.y - VIEW / 2) / SCALE)]); steady = false; drawReticle();
  };
  // The throw button keeps focus, so Space still throws after a drag.
  board.addEventListener('pointerdown', event => { if (!game) return; event.preventDefault(); board.setPointerCapture?.(event.pointerId); fromPointer(event); throwButton.focus({ preventScroll: true }); });
  board.addEventListener('pointermove', event => { if (event.buttons) fromPointer(event); });

  function atLine() {
    if (shared) return shared.atLine();
    const pose = getPose(), table = getBoard();
    if (!pose || !table || pose.sitting || pose.riding || pose.altitude > 0.1) return false;
    return atDartsLine(table, [pose.position[0], -pose.position[2]]);
  }
  function open() {
    if (!atLine()) return;
    if (!game) { if (shared) game = sharedGame(); else newGame({}); }
    panel.show(); pickUp(); mirror(); render(); void regular();
    throwButton.focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (panel.open) return { kind: 'play', label: 'Leave the dartboard', run: close, disabled: false };
      if (!atLine()) return null;
      return { kind: 'play', label: 'Play darts', run: open, disabled: false };
    },
    update() {
      if (panel.open && !atLine()) close();
      if (!shared) return;
      // Everyone in the room sees each match on the real board, panel open or not.
      const view = line(), key = JSON.stringify([view?.points.length, view?.result, view?.invite, view?.players, panel.open && shared.peers().map(peer => peer.id)]);
      if (key === lastKey) return;
      lastKey = key; game ??= sharedGame(); mirror();
      // A dart in flight draws its hit when it lands, not when the town's snapshot arrives.
      if (panel.open && !flying) render();
    },
    open, close,
    debug() {
      const hand = { release: release.slice(), swayed: swayed(), guide, steady, landing: landingOf(swayed()), lastRelease: last ? last.release.slice() : null };
      if (shared) return { open: panel.open, shared: true, line: line(), status: status.textContent, ...hand, pending, flying, buttons: [...panel.querySelectorAll('[data-darts-shared]')].map(button => button.textContent) };
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, mode: game.mode, turn: state.turn, scores: state.scores.slice(), darts: state.darts.map(dart => dart.label), thrown: game.points.length, points: game.points.map(p => p.slice()),
        last: state.history.at(-1) ? { player: state.history.at(-1).player, result: state.history.at(-1).result, darts: state.history.at(-1).darts.map(dart => dart.label) } : null,
        winner: state.winner, ...hand, thinking, flying, status: status.textContent, seed: game.seed };
    },
    // For tests: hold the hand still on a release [across mm, acceleration], or on the
    // release that carries a dart to a point [across, height] in mm. Keys or a drag move it again.
    steadyAt(next) { release = clampRelease(next); steady = true; drawReticle(); return release.slice(); },
    steadyOn([x, y]) { release = clampRelease([x, accelFor(y)]); steady = true; drawReticle(); return release.slice(); },
    // The landing a practice dart from this release would have (the hand's error included), for tests.
    landingFor(next, dart) { return game ? throwLanding(next, handFor(dart)) : null; },
    // Starts afresh (for tests), keeping the mode.
    reset(seed) { if (!game || shared) return false; generation++; thinking = false; last = null; newGame({ wins: game.wins }); if (seed !== undefined) game.seed = seed >>> 0; mirror(); render(); void regular(); return true; },
  };
}
