import './plaza-table-games.css';
import './plaza-darts.css';
import './axe-panel.css';
import { BOARD, KILLSHOTS, KILLSHOT_RADIUS, RINGS, THROWS, replay } from './axe-rules.js';

// Axe throwing in the axe-and-darts venue (server/axe-games.js holds every match): stand
// in a lane's throwing box and X opens the target. Stop the sweeping line once across and
// once up; the town lands the axe and decides whether it sticks. Alone, practise against
// the house thrower; with someone else in the lane, invite them to ten throws each.
// Every lane's axes show on its real target for everyone in the room.
const SVG = 'http://www.w3.org/2000/svg', R = BOARD, SCALE = .5, VIEW = R * 2 * SCALE + 20;

export function createAxePanel({ host = document.querySelector('#viewport'), getMirror = () => null, focusWorld = () => {},
  now = () => performance.now(), reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, shared }) {
  let laneId = null, phase = 'x', meter = null, aimX = 0, frame = 0, said = '', lastKey = '';
  const panel = document.createElement('dialog');
  panel.id = 'axe-panel'; panel.className = 'table-game-panel darts-panel axe-panel';
  panel.setAttribute('aria-labelledby', 'axe-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Axe &amp; Darts · shared game</p><h2 id="axe-title">Axe throwing</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the target">×</button></header>
    <div class="table-game-body darts-body">
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="darts-scores" aria-label="Scores"></ul>
      <div class="darts-play"><svg class="darts-board" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="The axe target"></svg>
        <div class="darts-side"><p class="darts-turn" aria-live="polite"></p></div></div>
      <div class="table-game-actions"><button type="button" data-axe-action="throw">Set the line</button>
        <div class="table-game-mode axe-shared" role="group" aria-label="Match"></div></div>
      <p class="table-game-note">Ten throws each, in turn. Bull 6, rings 4 to 1, a blue killshot 8. An axe that bounces off scores nothing.</p>
    </div>`;
  host.append(panel);
  const $ = selector => panel.querySelector(selector);
  const board = $('.darts-board'), status = $('.table-game-status'), throwButton = $('[data-axe-action="throw"]');
  const lane = () => laneId ? shared.lane(laneId) : null;
  const seat = player => lane()?.players?.[player] ?? null;
  const round = () => replay(lane()?.players ? lane().throws : []);
  const who = player => seat(player) === shared.selfId() ? 'You' : seat(player) === 'house' ? 'The house thrower' : shared.name(seat(player));
  const yours = state => Boolean(lane()?.players && !lane().result && seat(state.turn) === shared.selfId());
  const toScreen = ([x, y]) => [VIEW / 2 + x * SCALE, VIEW / 2 - y * SCALE];
  const el = (tag, attributes, text) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
  const period = () => 2600 * (reducedMotion ? 1.6 : 1);
  const meterValue = () => meter.held ?? (.5 - .5 * Math.cos(2 * Math.PI * (now() - meter.start) / period()));
  const toMm = value => (value * 2 - 1) * R;
  function startMeter(next) {
    phase = next; meter = { start: now(), held: null }; cancelAnimationFrame(frame);
    const tick = () => { if (!meter || !panel.open) return; drawReticle(); frame = requestAnimationFrame(tick); };
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
  function drawReticle() {
    const group = board.querySelector('.darts-reticle');
    if (!group) return;
    if (!yours(round().state) || !meter) { group.replaceChildren(); return; }
    const value = toMm(meterValue()), nodes = [];
    if (phase === 'x') { const [x] = toScreen([value, 0]); nodes.push(el('line', { class: 'darts-line', x1: x, y1: 8, x2: x, y2: VIEW - 8 })); }
    else { const [x] = toScreen([aimX, 0]), [, y] = toScreen([0, value]); nodes.push(el('line', { class: 'darts-line darts-line-set', x1: x, y1: 8, x2: x, y2: VIEW - 8 }), el('line', { class: 'darts-line', x1: 8, y1: y, x2: VIEW - 8, y2: y })); }
    group.replaceChildren(...nodes);
  }
  function describe(state) {
    const view = lane(), me = shared.selfId(), before = said ? `${said} ` : '';
    if (!view?.players) return before + (view?.invite?.to === me ? `${shared.name(view.invite.from)} invites you to a match.` : view?.invite?.from === me ? `Waiting for ${shared.name(view.invite.to)} to accept.` : 'Practise against the house thrower, or invite someone in this lane to a match.');
    if (view.result) return before + (view.result.reason === 'draw' ? 'A draw!' : view.result.reason === 'final' ? `${who(view.result.winner)} ${seat(view.result.winner) === me ? 'win' : 'wins'}!` : `${who(1 - view.result.winner)} ${view.result.reason === 'resigned' ? 'resigned' : 'left the lane'}.`);
    if (!view.players.includes(me)) return `${before}${who(0)} and ${who(1)} are throwing; ${who(state.turn)} is up.`;
    if (!yours(state)) return `${before}${who(state.turn)} is up…`;
    return `${before}Your throw ${state.throws[state.turn] + 1} of ${THROWS}. ${phase === 'x' ? 'Stop the line across the target.' : 'Now stop it for the height.'}`;
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
    throwButton.textContent = phase === 'x' ? 'Set the line' : 'Throw';
    throwButton.setAttribute('aria-disabled', String(!yours(state)));
    if (hadFocus && !panel.contains(document.activeElement)) throwButton.focus({ preventScroll: true });
  }
  async function send(message) {
    let reply;
    try { reply = await shared.send({ type: 'axes', laneId, ...message }); } catch (error) { reply = { ok: false, message: error.message }; }
    said = reply?.ok ? '' : reply?.message ?? 'The lane did not take that.'; lastKey = ''; render();
  }
  function press() {
    if (!laneId || !yours(round().state) || !meter) return;
    if (phase === 'x') { aimX = toMm(meterValue()); startMeter('y'); render(); return; }
    const aim = [aimX, toMm(meterValue())].map(n => Math.round(n * 10) / 10);
    startMeter('x'); render(); void send({ action: 'throw', aim });
  }
  throwButton.addEventListener('click', press);
  $('.axe-shared').addEventListener('click', event => {
    const button = event.target.closest('[data-axe-shared]');
    if (button) void send(button.dataset.axeShared === 'invite' ? { action: 'invite', peerId: button.dataset.peer } : { action: button.dataset.axeShared });
  });
  const close = () => { if (!panel.open) return; panel.close(); cancelAnimationFrame(frame); laneId = null; focusWorld(); };
  $('.table-game-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });
  function open() {
    laneId = shared.laneAt();
    if (!laneId) return;
    said = ''; panel.show(); startMeter('x'); render(); throwButton.focus({ preventScroll: true });
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
      if (panel.open) render();
    },
    open, close,
    debug: () => ({ open: panel.open, laneId, lane: lane(), status: status.textContent, phase, aimX, meter: meter ? meterValue() : null, buttons: [...panel.querySelectorAll('[data-axe-shared]')].map(button => button.textContent) }),
    // For tests: hold the sweeping line still at a millimetre position.
    holdAt(mm) { if (!meter) return false; meter.held = Math.min(1, Math.max(0, (mm / R + 1) / 2)); drawReticle(); return true; },
  };
}
