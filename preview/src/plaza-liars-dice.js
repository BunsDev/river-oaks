import './plaza-table-games.css';
import './plaza-liars-dice.css';
import { attachGuide } from './salon-guide.js';
import { cafeSeat } from './plaza-salon-plan.js';
import { FACES, legalMoves, raises, replay, totalDice } from './liars-dice-rules.js';
import { chooseMove } from './liars-dice-opponent.js';

// Liar's dice at the plaza café table: you and three plaza regulars, five dice each under
// a cup. Bid how many of a face are on the whole table (ones are wild), raise, or call
// "liar". A practice game kept in this browser; the round table's cups and dice mirror
// it. X opens the table.

const NAMES = ['You', 'The regular on your left', 'The regular across', 'The regular on your right'], SHORT = ['You', 'Left', 'Across', 'Right'];
// A die face as SVG pips, the same layout as the table's dice.
const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]], 6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]] };
const face = value => `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="16"/>${PIPS[value].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('')}</svg>`;
const plural = (n, face) => `${n} ${['', 'one', 'two', 'three', 'four', 'five', 'six'][face]}${n === 1 ? '' : face === 6 ? 'es' : 's'}`;

export function createPlazaLiarsDice({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  random = Math.random, replyDelay = 800, revealPause = 2200, onSwitch = null } = {}) {
  let game = null, generation = 0, playing = false, quantity = 1, chosen = 2;

  const panel = document.createElement('dialog');
  panel.id = 'liars-dice-panel'; panel.className = 'table-game-panel liars-dice-panel';
  panel.setAttribute('aria-labelledby', 'liars-dice-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="liars-dice-title">Liar’s dice at the café</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the dice table">×</button></header>
    <div class="table-game-body liars-dice-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-cafe-game="dominoes" aria-pressed="false">Dominoes</button><button type="button" data-cafe-game="hearts" aria-pressed="false">Hearts</button><button type="button" data-cafe-game="spades" aria-pressed="false">Spades</button><button type="button" data-cafe-game="dice" aria-pressed="true">Liar’s dice</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="dice-players" aria-label="Dice left"></ul>
      <section class="dice-reveal" aria-label="The cups lifted" hidden></section>
      <div class="dice-cup" aria-label="Your dice"></div>
      <ol class="dice-bids" aria-label="Bids this round"></ol>
      <div class="dice-bidder" role="group" aria-label="Your bid">
        <div class="dice-quantity"><button type="button" data-dice-step="-1" aria-label="Fewer">−</button><output class="dice-count" aria-live="polite"></output><button type="button" data-dice-step="1" aria-label="More">+</button></div>
        <div class="dice-faces" role="group" aria-label="Face">${FACES.map(f => `<button type="button" data-dice-face="${f}" aria-pressed="false" aria-label="${['', '', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'][f]}">${face(f)}</button>`).join('')}</div>
      </div>
      <div class="table-game-actions"><button type="button" data-dice-action="bid">Bid</button><button type="button" data-dice-action="liar">Liar!</button><button type="button" data-dice-action="new">New game</button></div>
      <p class="table-game-note">Ones are wild. Raise the count, or keep it and raise the face. Call liar and every cup is lifted: whoever was wrong loses a die.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'dice');
  const $ = selector => panel.querySelector(selector);
  const status = $('.table-game-status');

  const chairOf = player => (game.chair - player + 4) % 4;
  const round = () => replay(game.seed, game.moves);
  const newGame = chair => { game = { seed: Math.floor(random() * 2 ** 32), moves: [], chair, wins: game?.wins ?? [0, 0, 0, 0], scored: false }; };
  // Lifted cups stay open while the reveal is on the table (until the next bid).
  const mirror = () => {
    if (!game) return;
    const { state } = round(), cups = state.reveal && !state.bids.length ? state.reveal.cups : state.cups;
    getMirror()?.show({ cups: cups.map((dice, player) => ({ chair: chairOf(player), dice: dice.slice(), open: Boolean(state.reveal && !state.bids.length) })) });
  };
  // The smallest legal raise, to start the stepper from.
  const settle = state => {
    const bid = state.bid;
    if (!raises(bid, quantity, chosen) || quantity > totalDice(state)) { quantity = bid ? bid.quantity : 1; chosen = bid ? bid.face : 2; if (!raises(bid, quantity, chosen)) { if (chosen < 6) chosen += 1; else { quantity += 1; chosen = 2; } } }
  };

  function describe(state) {
    if (state.winner !== null) return state.winner === 0 ? 'You are the last with dice: you win!' : `${NAMES[state.winner]} is the last with dice and wins.`;
    const reveal = state.reveal && !state.bids.length ? state.reveal : null;
    const before = reveal ? `${SHORT[reveal.caller] === 'You' ? 'You' : NAMES[reveal.caller]} called liar on ${plural(reveal.bid.quantity, reveal.bid.face)}: there ${reveal.actual === 1 ? 'is' : 'are'} ${reveal.actual}. ${reveal.loser === 0 ? 'You lose' : `${NAMES[reveal.loser]} loses`} a die. ` : '';
    if (playing || state.turn !== 0) return `${before}${NAMES[state.turn]} is thinking…`;
    return `${before}Your turn: ${state.bid ? `raise ${plural(state.bid.quantity, state.bid.face)}, or call liar.` : 'open the bidding.'}`;
  }

  function render() {
    if (!game) return;
    const hadFocus = panel.contains(document.activeElement), { state } = round(), yours = !playing && state.turn === 0 && state.winner === null && state.counts[0] > 0;
    if (state.winner !== null && !game.scored) { game.scored = true; game.wins[state.winner] += 1; }
    settle(state);
    status.textContent = describe(state);
    panel.dataset.state = state.winner !== null ? 'over' : playing ? 'thinking' : 'playing';
    $('.dice-players').replaceChildren(...state.counts.map((count, player) => { const item = document.createElement('li'); item.textContent = `${SHORT[player]}: ${count ? `${count} ${count === 1 ? 'die' : 'dice'}` : 'out'}`; item.setAttribute('aria-label', `${NAMES[player]}: ${count} dice`); if (state.turn === player && state.winner === null) item.dataset.turn = ''; return item; }));
    const reveal = state.reveal && !state.bids.length ? state.reveal : null, revealBox = $('.dice-reveal');
    revealBox.hidden = !reveal;
    if (reveal) revealBox.replaceChildren(...reveal.cups.map((cup, player) => {
      const row = document.createElement('p'); row.textContent = `${SHORT[player]}: `;
      for (const die of cup) { const span = document.createElement('span'); span.className = 'dice-die'; span.innerHTML = face(die); span.setAttribute('role', 'img'); span.setAttribute('aria-label', String(die)); if (die === reveal.bid.face || die === 1) span.dataset.match = ''; row.append(span); }
      return row;
    }));
    $('.dice-cup').replaceChildren(...state.cups[0].map(die => { const span = document.createElement('span'); span.className = 'dice-die'; span.innerHTML = face(die); span.setAttribute('role', 'img'); span.setAttribute('aria-label', String(die)); return span; }));
    $('.dice-bids').replaceChildren(...state.bids.map(bid => { const item = document.createElement('li'); item.textContent = `${SHORT[bid.player]}: ${plural(bid.quantity, bid.face)}`; return item; }));
    $('.dice-count').textContent = String(quantity);
    for (const button of panel.querySelectorAll('[data-dice-face]')) { const f = Number(button.dataset.diceFace); button.setAttribute('aria-pressed', String(f === chosen)); button.disabled = !yours || !raises(state.bid, quantity, f); }
    $('[data-dice-step="-1"]').disabled = !yours || quantity <= 1; $('[data-dice-step="1"]').disabled = !yours || quantity >= totalDice(state);
    $('[data-dice-action="bid"]').disabled = !yours || !raises(state.bid, quantity, chosen);
    $('[data-dice-action="bid"]').textContent = `Bid ${plural(quantity, chosen)}`;
    $('[data-dice-action="liar"]').disabled = !yours || !state.bid;
    $('[data-dice-action="new"]').hidden = state.winner === null && state.counts[0] > 0;
    for (const button of panel.querySelectorAll('[data-cafe-game]')) button.setAttribute('aria-pressed', String(button.dataset.cafeGame === 'dice'));
    if (hadFocus && !panel.contains(document.activeElement)) ($('[data-dice-action="bid"]:not(:disabled)') ?? $('[data-dice-action="new"]:not([hidden])') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  async function regulars() {
    const ticket = ++generation;
    playing = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.winner !== null || (state.turn === 0 && state.counts[0] > 0)) break;
        // Once you are out the regulars play on; the reveal of a call stays up a moment longer.
        render();
        await new Promise(resolve => setTimeout(resolve, state.reveal && !state.bids.length ? revealPause : replyDelay));
        if (ticket !== generation) return;
        game.moves.push(chooseMove(state)); mirror();
      }
    } finally { if (ticket === generation) { playing = false; render(); } }
  }

  function move(text) {
    const { state } = round();
    if (playing || state.turn !== 0 || state.winner !== null || !legalMoves(state).includes(text)) return;
    game.moves.push(text); mirror(); render(); void regulars();
  }

  for (const button of panel.querySelectorAll('[data-dice-step]')) button.addEventListener('click', () => { quantity = Math.max(1, quantity + Number(button.dataset.diceStep)); render(); });
  for (const button of panel.querySelectorAll('[data-dice-face]')) button.addEventListener('click', () => { chosen = Number(button.dataset.diceFace); render(); });
  $('[data-dice-action="bid"]').addEventListener('click', () => move(`bid:${quantity}:${chosen}`));
  $('[data-dice-action="liar"]').addEventListener('click', () => move('liar'));
  $('[data-dice-action="new"]').addEventListener('click', () => { generation++; newGame(game.chair); mirror(); render(); void regulars(); });
  for (const button of panel.querySelectorAll('[data-cafe-game]')) button.addEventListener('click', () => { if (button.dataset.cafeGame !== 'dice') onSwitch?.(button.dataset.cafeGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; playing = false; panel.close(); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    if (!game || game.chair !== seat.chair) newGame(seat.chair);
    panel.show(); mirror(); render(); void regulars();
    ($('[data-dice-action="bid"]:not(:disabled)') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the dice' : 'Play liar’s dice', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && getSeat()?.chair !== game?.chair) close(); },
    open, close, mirror,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, chair: game.chair, seed: game.seed, round: state.round, turn: state.turn, counts: state.counts.slice(), cup: state.cups[0].slice(), bid: state.bid,
        bids: state.bids.length, reveal: state.reveal ? { actual: state.reveal.actual, loser: state.reveal.loser } : null, winner: state.winner, quantity, face: chosen, playing, moves: game.moves.length, status: status.textContent };
    },
    deal(seed) { if (!game) return false; generation++; newGame(game.chair); game.seed = seed >>> 0; mirror(); render(); void regulars(); return true; },
  };
}

export const seatAtCafeDice = pose => cafeSeat(pose?.sitting?.buildId);
