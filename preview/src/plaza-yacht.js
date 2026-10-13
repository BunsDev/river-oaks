import './plaza-table-games.css';
import { attachGuide } from './salon-guide.js';
import './plaza-yacht.css';
import { BOXES, BOX_NAMES, DICE, ROLLS, openBoxes, replay, scoreFor, totalOf } from './yacht-rules.js';
import { chooseMove } from './yacht-opponent.js';

// Yacht at the plaza's curved bench, for whoever sits there: you and two plaza regulars,
// or two players passing the turn. Roll five dice, keep any between up to three rolls,
// then score them in one of twelve boxes. The drum's dice follow the game. X opens it.

const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
const dieMarkup = value => `<svg viewBox="0 0 40 40" aria-hidden="true"><rect class="yacht-die-face" x="2" y="2" width="36" height="36" rx="7"/>${(PIPS[value] ?? []).map(([x, y]) => `<circle class="yacht-pip" cx="${10 + x * 10}" cy="${10 + y * 10}" r="3.6"/>`).join('')}</svg>`;

export function createPlazaYacht({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  random = Math.random, replyDelay = 650, onSwitch = null } = {}) {
  let game = null, held = [false, false, false, false, false], generation = 0, thinking = false;

  const panel = document.createElement('dialog');
  panel.id = 'yacht-panel'; panel.className = 'table-game-panel yacht-panel';
  panel.setAttribute('aria-labelledby', 'yacht-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="yacht-title">Yacht at the bench</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the Yacht dice">×</button></header>
    <div class="table-game-body yacht-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-bench-game="jenga" aria-pressed="false">Jenga</button><button type="button" data-bench-game="yacht" aria-pressed="true">Yacht</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <div class="yacht-play">
        <div class="yacht-hand">
          <div class="yacht-dice" role="group" aria-label="The dice: choose one to keep it">${Array.from({ length: DICE }, (_, i) => `<button type="button" class="yacht-die" data-yacht-die="${i}" aria-pressed="false"></button>`).join('')}</div>
          <button type="button" data-yacht-action="roll">Roll</button>
          <p class="yacht-rolls" aria-live="off"></p>
        </div>
        <table class="yacht-card">
          <caption class="sr-only">Score card</caption>
          <thead><tr><th scope="col">Box</th>${[0, 1, 2].map(player => `<th scope="col" data-yacht-player="${player}"></th>`).join('')}<th scope="col"><span class="sr-only">Score here</span></th></tr></thead>
          <tbody>${BOXES.map(box => `<tr data-yacht-row="${box}"><th scope="row">${BOX_NAMES[box]}</th>${[0, 1, 2].map(player => `<td data-yacht-player="${player}"></td>`).join('')}<td><button type="button" data-yacht-box="${box}" aria-disabled="true"></button></td></tr>`).join('')}</tbody>
          <tfoot><tr><th scope="row">Total</th>${[0, 1, 2].map(player => `<td data-yacht-player="${player}"></td>`).join('')}<td></td></tr></tfoot>
        </table>
      </div>
      <div class="table-game-actions">
        <button type="button" data-yacht-action="new">New game</button>
        <div class="table-game-mode" role="group" aria-label="Players"><button type="button" data-yacht-mode="regulars" aria-pressed="true">With two regulars</button><button type="button" data-yacht-mode="pass" aria-pressed="false">Pass and play</button></div>
      </div>
      <p class="table-game-note">Up to three rolls a turn; choose dice to keep them. Every box is filled once, even with nothing. Highest total wins.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'yacht');
  const $ = selector => panel.querySelector(selector);
  const status = $('.table-game-status'), rollButton = $('[data-yacht-action="roll"]'), dice = [...panel.querySelectorAll('[data-yacht-die]')];

  const players = () => (game.mode === 'pass' ? 2 : 3);
  const round = () => replay(game.seed, game.moves, players());
  const yours = state => game.mode === 'pass' || state.turn === 0;
  const who = player => game.mode === 'pass' ? `Player ${player + 1}` : player === 0 ? 'You' : `Regular ${player}`;
  const newGame = (keep = {}) => {
    game = { seed: Math.floor(random() * 2 ** 32), moves: [], mode: keep.mode ?? game?.mode ?? 'regulars', wins: keep.wins ?? game?.wins ?? [0, 0, 0], scored: false };
    held = held.map(() => false);
  };
  const mirror = () => { if (!game) return; const { state } = round(); getMirror()?.show(state.dice, held); };
  const mask = () => held.map(kept => (kept ? 1 : 0)).join('');

  function render() {
    if (!game) return;
    const { state } = round(), mine = yours(state) && !thinking && !state.winners;
    if (state.winners && !game.scored) { game.scored = true; for (const player of state.winners) game.wins[player] += 1; }
    status.textContent = describe(state);
    panel.dataset.state = state.winners ? 'over' : thinking ? 'thinking' : 'playing';
    dice.forEach((button, i) => {
      const value = state.dice?.[i];
      button.innerHTML = dieMarkup(value);
      button.setAttribute('aria-label', value ? `Die ${i + 1}: ${value}${held[i] ? ', kept' : ''}` : `Die ${i + 1}: not rolled`);
      button.setAttribute('aria-pressed', String(held[i]));
      button.setAttribute('aria-disabled', String(!mine || !value || state.rolls >= ROLLS));
    });
    const canRoll = mine && state.rolls < ROLLS && !(state.rolls > 0 && held.every(Boolean));
    rollButton.textContent = state.rolls === 0 ? 'Roll' : 'Roll again';
    rollButton.setAttribute('aria-disabled', String(!canRoll));
    $('.yacht-rolls').textContent = state.winners ? '' : `${ROLLS - state.rolls} roll${ROLLS - state.rolls === 1 ? '' : 's'} left this turn`;
    const count = players(), open = openBoxes(state.sheets[state.turn] ?? {});
    panel.querySelectorAll('[data-yacht-player]').forEach(cell => { cell.hidden = Number(cell.dataset.yachtPlayer) >= count; });
    panel.querySelectorAll('thead [data-yacht-player]').forEach(cell => { const player = Number(cell.dataset.yachtPlayer); cell.textContent = player < count ? who(player) : ''; if (!state.winners && state.turn === player) cell.dataset.turn = ''; else delete cell.dataset.turn; });
    for (const box of BOXES) {
      const row = panel.querySelector(`[data-yacht-row="${box}"]`);
      row.querySelectorAll('td[data-yacht-player]').forEach(cell => { const sheet = state.sheets[Number(cell.dataset.yachtPlayer)]; cell.textContent = sheet && box in sheet ? String(sheet[box]) : ''; });
      const button = row.querySelector('[data-yacht-box]'), available = mine && state.rolls > 0 && open.includes(box);
      button.textContent = available ? `+${scoreFor(box, state.dice)}` : '';
      button.setAttribute('aria-label', available ? `Score ${scoreFor(box, state.dice)} in ${BOX_NAMES[box]}` : `${BOX_NAMES[box]}: not available`);
      button.setAttribute('aria-disabled', String(!available));
      button.hidden = !available;
    }
    panel.querySelectorAll('tfoot td[data-yacht-player]').forEach(cell => { const sheet = state.sheets[Number(cell.dataset.yachtPlayer)]; cell.textContent = sheet ? String(totalOf(sheet)) : ''; });
    $('[data-yacht-action="new"]').hidden = !state.winners;
    for (const button of panel.querySelectorAll('[data-yacht-mode]')) button.setAttribute('aria-pressed', String(button.dataset.yachtMode === game.mode));
    // A hidden score button loses focus: send it to Roll (or New game at the end).
    if (panel.open && (document.activeElement === document.body || (panel.contains(document.activeElement) && document.activeElement.hidden))) (state.winners ? $('[data-yacht-action="new"]') : rollButton).focus({ preventScroll: true });
  }

  function describe(state) {
    if (state.winners) {
      const totals = state.sheets.map(totalOf), best = totals[state.winners[0]];
      if (state.winners.length > 1) return `A tie at ${best}: ${state.winners.map(who).join(' and ')}.`;
      return `${who(state.winners[0])} ${state.winners[0] === 0 && game.mode !== 'pass' ? 'win' : 'wins'} with ${best}.`;
    }
    const last = state.last ? `${who(state.last.player)} scored ${state.last.points} in ${BOX_NAMES[state.last.box].toLowerCase()}. ` : '';
    if (thinking || !yours(state)) return `${last}${who(state.turn)} is rolling…`;
    const whose = game.mode === 'pass' ? `${who(state.turn)}: ` : '';
    if (state.rolls === 0) return `${last}${whose}Roll the dice.`;
    if (state.rolls < ROLLS) return `${whose}Choose dice to keep and roll again, or score them in a box.`;
    return `${whose}Score the dice in a box.`;
  }

  function act(move) {
    const before = round().state;
    game.moves.push(move);
    const after = round().state;
    if (after.turn !== before.turn || after.rolls === 0) held = held.map(() => false);
    mirror(); render();
  }

  function roll() {
    const { state } = round();
    if (rollButton.getAttribute('aria-disabled') === 'true') return;
    act(state.rolls === 0 ? 'roll' : `roll:${mask()}`);
  }

  function score(box) {
    const { state } = round();
    if (!yours(state) || thinking || state.winners || state.rolls === 0 || !openBoxes(state.sheets[state.turn]).includes(box)) return;
    act(`score:${box}`);
    rollButton.focus({ preventScroll: true });
    void regulars();
  }

  // The regulars take their turns in order: each roll, keep and score a moment apart.
  async function regulars() {
    const ticket = ++generation;
    thinking = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.winners || yours(state)) break;
        render();
        await new Promise(resolve => setTimeout(resolve, replyDelay));
        if (ticket !== generation) return;
        const move = chooseMove(state);
        if (move.startsWith('roll:')) { held = [...move.slice(5)].map(bit => bit === '1'); mirror(); render(); await new Promise(resolve => setTimeout(resolve, replyDelay / 2)); if (ticket !== generation) return; }
        game.moves.push(move);
        if (move.startsWith('score:')) held = held.map(() => false);
        mirror();
      }
    } finally { if (ticket === generation) { thinking = false; render(); } }
  }

  for (const button of dice) button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    const i = Number(button.dataset.yachtDie); held[i] = !held[i]; mirror(); render();
  });
  rollButton.addEventListener('click', roll);
  panel.querySelector('.yacht-card').addEventListener('click', event => { const button = event.target.closest('[data-yacht-box]'); if (button && button.getAttribute('aria-disabled') !== 'true') score(button.dataset.yachtBox); });
  $('[data-yacht-action="new"]').addEventListener('click', () => { generation++; thinking = false; newGame({ wins: game.wins }); mirror(); render(); void regulars(); rollButton.focus(); });
  for (const button of panel.querySelectorAll('[data-yacht-mode]')) button.addEventListener('click', () => {
    if (game.mode === button.dataset.yachtMode) return;
    generation++; thinking = false; newGame({ mode: button.dataset.yachtMode, wins: [0, 0, 0] }); mirror(); render(); void regulars();
  });
  for (const button of panel.querySelectorAll('[data-bench-game]')) button.addEventListener('click', () => { if (button.dataset.benchGame !== 'yacht') onSwitch?.(button.dataset.benchGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; thinking = false; panel.close(); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    if (!getSeat()) return;
    if (!game) newGame();
    panel.show(); mirror(); render(); void regulars();
    rollButton.focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the Yacht dice' : 'Play Yacht', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && !getSeat()) close(); },
    open, close,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, seed: game.seed, mode: game.mode, players: players(), turn: state.turn, turns: state.turns, rolls: state.rolls, dice: state.dice?.slice() ?? null, held: held.slice(),
        moves: game.moves.slice(), totals: state.sheets.map(totalOf), filled: state.sheets.map(sheet => Object.keys(sheet).length), winners: state.winners, wins: game.wins.slice(0, players()), thinking, status: status.textContent };
    },
    // Replaces the game with a seeded one (for tests); keeps the mode and the tally.
    deal(seed) { if (!game) return false; generation++; thinking = false; newGame({ wins: game.wins }); game.seed = seed >>> 0; mirror(); render(); void regulars(); return true; },
  };
}
