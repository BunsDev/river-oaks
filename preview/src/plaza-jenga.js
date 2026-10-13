import './plaza-table-games.css';
import { attachGuide } from './salon-guide.js';
import './plaza-jenga.css';
import { jengaSeat } from './plaza-salon-plan.js';
import { SLOTS, legalPulls, notation, outcome, parse, replay, zone } from './jenga-rules.js';
import { choosePull, steadyFor } from './jenga-opponent.js';
import { seededRandom } from './seeded-random.js';

// Jenga at the plaza's curved bench, for whoever sits there: you and two plaza regulars,
// or two players passing the turn. Pick a block, then stop the steady-hand meter inside
// its safe zone to slide it out; it goes on top by itself. A practice game kept in this
// browser; the drum's tower mirrors it. X opens the tower.

const LETTERS = 'abc', ROW = 16, BLOCK = [62, 13], GUTTER = 4;

export function createPlazaJenga({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  random = Math.random, now = () => performance.now(), replyDelay = 700, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false } = {}) {
  let game = null, selected = null, meter = null, generation = 0, thinking = false, frame = 0;

  const panel = document.createElement('dialog');
  panel.id = 'jenga-panel'; panel.className = 'table-game-panel jenga-panel';
  panel.setAttribute('aria-labelledby', 'jenga-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="jenga-title">Jenga at the bench</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the Jenga tower">×</button></header>
    <div class="table-game-body jenga-body">
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="jenga-scores" aria-label="Towers knocked over"></ul>
      <div class="jenga-play">
        <svg class="jenga-tower" role="group" aria-label="The tower"></svg>
        <div class="jenga-meter" hidden>
          <p class="jenga-meter-label">Steady hand: stop the marker in the green.</p>
          <div class="jenga-meter-track" aria-hidden="true"><span class="jenga-meter-zone"></span><span class="jenga-meter-marker"></span></div>
          <div class="jenga-meter-actions"><button type="button" data-jenga-action="pull">Pull</button><button type="button" data-jenga-action="cancel">Choose another</button></div>
        </div>
      </div>
      <div class="table-game-actions">
        <button type="button" data-jenga-action="new">New tower</button>
        <div class="table-game-mode" role="group" aria-label="Players"><button type="button" data-jenga-mode="regulars" aria-pressed="true">With two regulars</button><button type="button" data-jenga-mode="pass" aria-pressed="false">Pass and play</button></div>
      </div>
      <p class="table-game-note">Never the top level, nor the one under it until the top is finished. A level left on one edge block brings the tower down.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'jenga');
  const $ = selector => panel.querySelector(selector);
  const tower = $('.jenga-tower'), status = $('.table-game-status'), meterBox = $('.jenga-meter');

  const players = () => (game.mode === 'pass' ? 2 : 3);
  const round = () => replay(game.moves, { players: players() });
  const yours = state => game.mode === 'pass' || state.turn === 0;
  const who = player => game.mode === 'pass' ? `Player ${player + 1}` : player === 0 ? 'You' : `Regular ${player}`;
  const newGame = (keep = {}) => {
    const mode = keep.mode ?? game?.mode ?? 'regulars';
    game = { seed: Math.floor(random() * 2 ** 32), moves: [], mode, seat: keep.seat ?? game?.seat ?? 0, losses: keep.losses ?? game?.losses ?? [0, 0, 0], scored: false };
    selected = null; stopMeter();
  };
  const mirror = () => { if (game) getMirror()?.show(round().state); };
  const key = ({ level, slot }) => `${level + 1}${LETTERS[slot]}`;

  // The meter: a marker sweeping to and fro; the safe zone sits somewhere new for each pull.
  const period = () => (reducedMotion ? 3200 : 1800);
  const position = () => meter.frozen ?? (0.5 - 0.5 * Math.cos(2 * Math.PI * (now() - meter.start) / period()));
  function startMeter(state, choice) {
    const width = zone(state, choice), centre = width / 2 + 0.04 + seededRandom((Math.imul(game.seed >>> 0, 0x27d4eb2f) ^ Math.imul(state.pulls + 1, 0x165667b1)) >>> 0)() * (0.92 - width);
    meter = { width, lo: centre - width / 2, hi: centre + width / 2, start: now(), frozen: null };
    meterBox.hidden = false;
    const zoneEl = $('.jenga-meter-zone');
    zoneEl.style.left = `${meter.lo * 100}%`; zoneEl.style.width = `${width * 100}%`;
    const tick = () => { if (!meter) return; $('.jenga-meter-marker').style.left = `${position() * 100}%`; frame = requestAnimationFrame(tick); };
    cancelAnimationFrame(frame); tick();
  }
  function stopMeter() { meter = null; cancelAnimationFrame(frame); meterBox.hidden = true; }

  function render() {
    if (!game) return;
    const active = document.activeElement, hadFocus = panel.contains(active), focusedBlock = tower.contains(active) ? active.dataset.jengaBlock : null;
    const { state } = round(), result = outcome(state);
    if (result && !game.scored) { game.scored = true; game.losses[result.loser] += 1; }
    const legal = !thinking && !result && yours(state) ? legalPulls(state) : [], open = new Map(legal.map(option => [key(option), option]));
    const levels = state.levels.length, height = levels * ROW + GUTTER * 2, width = SLOTS * BLOCK[0] + (SLOTS - 1) * GUTTER + GUTTER * 2;
    tower.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const nodes = [];
    state.levels.forEach((row, level) => {
      const y = height - GUTTER - (level + 1) * ROW + (ROW - BLOCK[1]) / 2;
      row.forEach((present, slot) => {
        if (!present) return;
        const name = key({ level, slot }), option = open.get(name), x = GUTTER + slot * (BLOCK[0] + GUTTER);
        const block = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        for (const [attribute, value] of Object.entries({ x, y, width: BLOCK[0], height: BLOCK[1], rx: 2, class: `jenga-block jenga-${level % 2 ? 'end' : 'side'}`, 'data-jenga-block': name,
          role: option ? 'button' : 'img', tabindex: option ? -1 : undefined, 'aria-label': `Level ${level + 1}, ${['left', 'middle', 'right'][slot]} block${option ? '' : ', cannot be pulled now'}` })) {
          if (value !== undefined) block.setAttribute(attribute, value);
        }
        if (option) block.dataset.open = '';
        if (option?.fatal) block.dataset.fatal = '';
        if (selected === name) block.dataset.selected = '';
        nodes.push(block);
      });
    });
    tower.replaceChildren(...nodes);
    // One tab stop in the tower (roving): the selected block, the last focused, or the first open one.
    const stop = tower.querySelector(`[data-jenga-block="${selected ?? focusedBlock}"][data-open]`) ?? tower.querySelector('[data-open]');
    stop?.setAttribute('tabindex', '0');
    status.textContent = describe(state, result);
    panel.dataset.state = result ? 'over' : thinking ? 'thinking' : 'playing';
    $('.jenga-scores').replaceChildren(...Array.from({ length: players() }, (_, player) => {
      const item = document.createElement('li'); item.textContent = `${who(player)}: ${game.losses[player]}`; return item;
    }));
    $('[data-jenga-action="new"]').hidden = !result;
    for (const button of panel.querySelectorAll('[data-jenga-mode]')) button.setAttribute('aria-pressed', String(button.dataset.jengaMode === game.mode));
    if (hadFocus && !panel.contains(document.activeElement)) {
      const target = (focusedBlock && tower.querySelector(`[data-jenga-block="${focusedBlock}"]`)) ?? stop ?? (meter ? $('[data-jenga-action="pull"]') : null) ?? $('.table-game-close');
      target.focus({ preventScroll: true });
    }
  }

  function describe(state, result) {
    if (result) {
      const loser = who(result.loser), how = result.fatal ? 'pulled the block that held it up' : 'wobbled';
      return `The tower falls! ${loser} ${how}. New tower?`;
    }
    if (thinking || !yours(state)) return `${who(state.turn)} is choosing a block…`;
    const turn = game.mode === 'pass' ? `${who(state.turn)}'s turn.` : 'Your turn.';
    if (!selected) return `${turn} Choose a block to pull.`;
    const choice = parse(selected);
    if (legalPulls(state).find(option => option.level === choice.level && option.slot === choice.slot)?.fatal) return `${turn} That would leave one edge block carrying the tower: it can only fall.`;
    return `${turn} Steady now: stop the marker in the green.`;
  }

  function choose(name) {
    const { state } = round();
    if (thinking || outcome(state) || !yours(state)) return;
    const option = legalPulls(state).find(item => key(item) === name);
    if (!option) return;
    if (selected === name) { selected = null; stopMeter(); render(); return; }
    selected = name; startMeter(state, option); render();
    $('[data-jenga-action="pull"]').focus({ preventScroll: true });
  }

  // Stops the meter where it is: inside the zone the block slides out; outside, the tower falls.
  function release() {
    if (!meter || !selected) return;
    const { state } = round(), choice = parse(selected), at = position(), steady = at >= meter.lo && at <= meter.hi && meter.width > 0;
    const fatal = legalPulls(state).find(option => option.level === choice.level && option.slot === choice.slot)?.fatal;
    game.moves.push(notation({ ...choice, fell: !steady || Boolean(fatal) }));
    selected = null; stopMeter(); mirror(); render(); void regulars();
  }

  // The regulars take their turns in order, each a moment to choose and a moment to pull.
  async function regulars() {
    const ticket = ++generation;
    thinking = true;
    try {
      for (;;) {
        const { state } = round();
        if (outcome(state) || yours(state)) break;
        render();
        const choice = choosePull(state, game.seed);
        if (!choice) break;
        await new Promise(resolve => setTimeout(resolve, replyDelay));
        if (ticket !== generation) return;
        selected = key(choice); render();
        await new Promise(resolve => setTimeout(resolve, replyDelay));
        if (ticket !== generation) return;
        const fatal = legalPulls(state).find(option => option.level === choice.level && option.slot === choice.slot)?.fatal;
        game.moves.push(notation({ ...choice, fell: Boolean(fatal) || !steadyFor(state, choice, game.seed) }));
        selected = null; mirror();
      }
    } finally { if (ticket === generation) { thinking = false; render(); } }
  }

  tower.addEventListener('click', event => { const block = event.target.closest('[data-jenga-block][data-open]'); if (block) choose(block.dataset.jengaBlock); });
  tower.addEventListener('keydown', event => {
    const block = event.target.closest('[data-jenga-block]');
    if (!block) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(block.dataset.jengaBlock); return; }
    const step = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const { level, slot } = parse(block.dataset.jengaBlock), open = [...tower.querySelectorAll('[data-open]')].map(item => ({ item, ...parse(item.dataset.jengaBlock) }));
    const next = open.filter(item => step[0] ? Math.sign(item.level - level) === step[0] : item.level === level && Math.sign(item.slot - slot) === step[1])
      .sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || Math.abs(a.slot - slot) - Math.abs(b.slot - slot))[0];
    if (!next) return;
    block.setAttribute('tabindex', '-1'); next.item.setAttribute('tabindex', '0'); next.item.focus();
  });
  $('[data-jenga-action="pull"]').addEventListener('click', release);
  $('[data-jenga-action="cancel"]').addEventListener('click', () => { const was = selected; selected = null; stopMeter(); render(); tower.querySelector(`[data-jenga-block="${was}"]`)?.focus(); });
  $('[data-jenga-action="new"]').addEventListener('click', () => { generation++; thinking = false; newGame({ losses: game.losses }); mirror(); render(); void regulars(); });
  for (const button of panel.querySelectorAll('[data-jenga-mode]')) button.addEventListener('click', () => {
    if (game.mode === button.dataset.jengaMode) return;
    generation++; thinking = false; newGame({ mode: button.dataset.jengaMode, losses: [0, 0, 0] }); mirror(); render(); void regulars();
  });
  const close = () => { if (!panel.open) return; panel.close(); selected = null; stopMeter(); focusWorld(); };
  $('.table-game-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    if (!game) newGame({ seat: seat.seat });
    panel.show(); mirror(); render(); void regulars();
    (tower.querySelector('[data-open][tabindex="0"]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the Jenga tower' : 'Play Jenga', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && !getSeat()) close(); },
    open, close,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round(), result = outcome(state);
      return { open: panel.open, seed: game.seed, mode: game.mode, players: players(), turn: state.turn, moves: game.moves.slice(), pulls: state.pulls, levels: state.levels.length,
        fallen: result, losses: game.losses.slice(0, players()), thinking, selected, legal: !thinking && !result && yours(state) ? legalPulls(state).map(option => ({ block: key(option), fatal: option.fatal })) : [],
        meter: meter ? { lo: meter.lo, hi: meter.hi, width: meter.width, position: position() } : null, status: status.textContent };
    },
    // For tests: hold the meter's marker still at a point of the track (0–1).
    aim(at) { if (!meter) return false; meter.frozen = Math.min(1, Math.max(0, at)); return true; },
    // Replaces the game with a seeded one (for tests); keeps the mode and the tally.
    deal(seed) { if (!game) return false; generation++; thinking = false; newGame({ losses: game.losses }); game.seed = seed >>> 0; mirror(); render(); void regulars(); return true; },
  };
}

export const seatAtJenga = pose => jengaSeat(pose?.sitting);
