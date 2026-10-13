import './plaza-table-games.css';
import './plaza-hearts.css';
import './plaza-spades.css';
import { cafeSeat } from './plaza-salon-plan.js';
import { suitOf } from './hearts-rules.js';
import { GAME_POINTS, addHand, gameWinner, legalCards, replay } from './spades-rules.js';
import { chooseBid, choosePlay } from './spades-opponent.js';
import { cardArt, cardName } from './plaza-hearts.js';
import { attachGuide } from './salon-guide.js';

// Spades at the plaza café table: you and the regular across against the regulars on
// your left and right, a game to 500. Bid your tricks (or nil), then play; spades are
// trumps. A practice game kept in this browser; the round table shows the trick face
// up and the hands face down while you play.

const NAMES = ['You', 'The regular on your left', 'Your partner across', 'The regular on your right'], SHORT = ['You', 'Left', 'Across', 'Right'];
const TEAMS = ['You & Across', 'Left & Right'];

export function createPlazaSpades({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  random = Math.random, replyDelay = 650, onSwitch = null } = {}) {
  let game = null, generation = 0, playing = false;

  const panel = document.createElement('dialog');
  panel.id = 'spades-panel'; panel.className = 'table-game-panel spades-panel';
  panel.setAttribute('aria-labelledby', 'spades-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="spades-title">Spades at the café</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the card table">×</button></header>
    <div class="table-game-body spades-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-cafe-game="dominoes" aria-pressed="false">Dominoes</button><button type="button" data-cafe-game="hearts" aria-pressed="false">Hearts</button><button type="button" data-cafe-game="spades" aria-pressed="true">Spades</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="spades-teams" aria-label="Partnership scores, the game ends at ${GAME_POINTS}"></ul>
      <ul class="hearts-scores spades-seats" aria-label="Bids and tricks"></ul>
      <div class="spades-bids" role="group" aria-label="Your bid" hidden>${Array.from({ length: 14 }, (_, n) => `<button type="button" data-spades-bid="${n}">${n === 0 ? 'Nil' : n}</button>`).join('')}</div>
      <section class="hearts-trick" aria-label="The trick"></section>
      <div class="hearts-hand" role="toolbar" aria-label="Your cards"></div>
      <div class="table-game-actions"><button type="button" data-spades-action="next">Next hand</button><button type="button" data-spades-action="game">New game</button></div>
      <p class="table-game-note">Bid the tricks you expect; nil means none. Spades are trumps and cannot be led until one is played. Every ten overtricks cost a hundred.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'spades');
  const $ = selector => panel.querySelector(selector);
  const status = $('.table-game-status'), handBar = $('.hearts-hand'), bidBar = $('.spades-bids');

  const chairOf = player => (game.chair - player + 4) % 4;
  const round = () => replay(game.seed, game.dealer, game.moves);
  const newHand = (seed = Math.floor(random() * 2 ** 32)) => { game.seed = seed; game.moves = []; game.scored = false; };
  const newGame = chair => { game = { chair, totals: [{ score: 0, bags: 0 }, { score: 0, bags: 0 }], dealer: 3, winner: null }; newHand(); };

  function mirror() {
    if (!game) return;
    const { state } = round();
    getMirror()?.show({ trick: state.trick.map(play => ({ chair: chairOf(play.player), card: play.card })),
      hands: state.hands.map((cards, player) => ({ chair: chairOf(player), count: cards.length })),
      won: state.taken.map((tricks, player) => ({ chair: chairOf(player), tricks })) });
  }

  function settle(state) {
    if (!state.over || game.scored) return;
    game.scored = true; game.totals = addHand(game.totals, state.over); game.winner = gameWinner(game.totals);
  }

  function describe(state) {
    if (state.over) {
      const [ours, theirs] = state.over, line = (team, result) => `${TEAMS[team]} ${result.set ? `were set (${result.made} of ${result.contract})` : `made ${result.contract} with ${result.made}`}`;
      const nils = state.over.flatMap(team => team.nils).map(nil => `${SHORT[nil.player]}'s nil ${nil.made ? 'made' : 'failed'}`);
      const hand = `${line(0, ours)}; ${line(1, theirs)}.${nils.length ? ` ${nils.join(', ')}.` : ''}`;
      if (game.winner === null) return hand;
      return `${hand} ${game.winner === 0 ? 'You and your partner win the game!' : 'Left and Right win the game.'}`;
    }
    if (state.phase === 'bid') return state.turn === 0 ? 'Your bid: how many tricks will you take?' : `${NAMES[state.turn]} is bidding…`;
    if (state.turn !== 0) return `${NAMES[state.turn]} is playing…`;
    if (!state.trick.length) return state.spadesBroken ? 'Your lead.' : 'Your lead. Spades are not broken yet.';
    return `Your turn: follow ${({ C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' })[suitOf(state.trick[0].card)]} if you can.`;
  }

  function render() {
    if (!game) return;
    const { state } = round(), legal = state.phase === 'play' && state.turn === 0 && !state.over && !playing ? legalCards(state) : [];
    settle(state);
    status.textContent = describe(state);
    panel.dataset.state = state.over ? 'over' : state.phase;
    $('.spades-teams').replaceChildren(...game.totals.map((team, index) => {
      const item = document.createElement('li'); item.textContent = `${TEAMS[index]}: ${team.score} · ${team.bags} bag${team.bags === 1 ? '' : 's'}`; return item;
    }));
    $('.spades-seats').replaceChildren(...[0, 1, 2, 3].map(player => {
      const item = document.createElement('li'), bid = state.bids[player];
      item.textContent = `${SHORT[player]} ${bid === null ? '—' : bid === 0 ? 'nil' : `bid ${bid}`} · ${state.taken[player]}`; item.title = NAMES[player];
      if (player === state.turn && !state.over) item.dataset.turn = '';
      return item;
    }));
    bidBar.hidden = !(state.phase === 'bid' && state.turn === 0 && !playing);
    const shown = state.trick.length ? state.trick : state.lastTrick ?? [], finished = !state.trick.length && Boolean(state.lastTrick), taker = finished ? state.turn : null;
    $('.hearts-trick').replaceChildren(...[2, 1, 3, 0].map(player => {
      const slot = document.createElement('div'), play = shown.find(item => item.player === player);
      slot.className = 'hearts-slot'; slot.dataset.seat = SHORT[player].toLowerCase();
      const label = document.createElement('span'); label.textContent = taker === player ? (player === 0 ? 'You take it' : `${SHORT[player]} takes it`) : SHORT[player]; slot.append(label);
      if (play) {
        const card = document.createElement('span'); card.className = 'playing-card'; card.dataset.suit = suitOf(play.card); card.innerHTML = cardArt(play.card);
        card.setAttribute('role', 'img'); card.setAttribute('aria-label', `${NAMES[player]}: ${cardName(play.card)}`); slot.append(card);
      }
      if (finished) slot.dataset.last = '';
      if (taker === player) slot.dataset.taker = '';
      return slot;
    }));
    const focused = handBar.contains(document.activeElement) ? document.activeElement.dataset.card : null, hadFocus = panel.contains(document.activeElement);
    handBar.replaceChildren(...state.hands[0].map(card => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'playing-card in-hand'; button.dataset.card = card; button.dataset.suit = suitOf(card); button.innerHTML = cardArt(card);
      button.disabled = !legal.includes(card); button.tabIndex = -1;
      if (legal.includes(card)) button.dataset.legal = '';
      button.setAttribute('aria-label', cardName(card)); return button;
    }));
    const stop = handBar.querySelector(`[data-card="${focused}"]:not(:disabled)`) ?? handBar.querySelector('button:not(:disabled)');
    if (stop) stop.tabIndex = 0;
    if (focused && stop) stop.focus({ preventScroll: true });
    $('[data-spades-action="next"]').hidden = !state.over || game.winner !== null;
    $('[data-spades-action="game"]').hidden = !state.over || game.winner === null;
    for (const button of panel.querySelectorAll('[data-cafe-game]')) button.setAttribute('aria-pressed', String(button.dataset.cafeGame === 'spades'));
    // Keep keyboard focus in the sheet when what held it was redrawn or hidden.
    if (hadFocus && !panel.contains(document.activeElement)) (!bidBar.hidden ? bidBar.querySelector('button') : stop ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  // The regulars bid and play in turn until it is yours or the hand ends.
  async function regulars() {
    const ticket = ++generation;
    playing = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.over || state.turn === 0) break;
        render();
        await new Promise(resolve => setTimeout(resolve, state.phase === 'bid' ? 400 : replyDelay));
        if (ticket !== generation) return;
        game.moves.push(state.phase === 'bid' ? `bid:${chooseBid(state.hands[state.turn])}` : choosePlay(state));
        mirror();
      }
    } finally { if (ticket === generation) { playing = false; render(); } }
  }

  function bid(value) {
    const { state } = round();
    if (playing || state.phase !== 'bid' || state.turn !== 0) return;
    game.moves.push(`bid:${value}`); mirror(); render(); void regulars();
  }
  function choose(card) {
    const { state } = round();
    if (playing || state.over || state.turn !== 0 || !legalCards(state).includes(card)) return;
    game.moves.push(card); mirror(); render(); void regulars();
  }

  bidBar.addEventListener('click', event => { const button = event.target.closest('[data-spades-bid]'); if (button) bid(Number(button.dataset.spadesBid)); });
  handBar.addEventListener('click', event => { const button = event.target.closest('[data-card]'); if (button && !button.disabled) choose(button.dataset.card); });
  handBar.addEventListener('keydown', event => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const buttons = [...handBar.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
    const next = buttons[(index + step + buttons.length) % buttons.length];
    if (!next) return;
    for (const button of buttons) button.tabIndex = -1;
    next.tabIndex = 0; next.focus();
  });
  $('[data-spades-action="next"]').addEventListener('click', () => {
    if (!round().state.over || game.winner !== null) return;
    generation++; game.dealer = (game.dealer + 1) % 4; newHand(); mirror(); render(); void regulars();
  });
  $('[data-spades-action="game"]').addEventListener('click', () => { generation++; newGame(game.chair); mirror(); render(); void regulars(); });
  for (const button of panel.querySelectorAll('[data-cafe-game]')) button.addEventListener('click', () => { if (button.dataset.cafeGame !== 'spades') onSwitch?.(button.dataset.cafeGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; panel.close(); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  // Escape, or X again (as in the world), puts the table away.
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    if (!game || game.chair !== seat.chair) newGame(seat.chair);
    panel.show(); mirror(); render(); void regulars();
    (!bidBar.hidden ? bidBar.querySelector('button') : handBar.querySelector('[tabindex="0"]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the cards' : 'Play spades', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && getSeat()?.chair !== game?.chair) close(); },
    open, close, mirror,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, chair: game.chair, seed: game.seed, dealer: game.dealer, moves: game.moves.slice(), phase: state.phase, turn: state.turn, bids: state.bids.slice(),
        taken: state.taken.slice(), cards: state.hands[0].slice(), sizes: state.hands.map(cards => cards.length), trick: state.trick.map(play => play.card), tricks: state.tricks,
        legal: state.phase === 'play' && state.turn === 0 && !playing ? legalCards(state) : [], over: state.over, totals: game.totals.map(team => ({ ...team })), winner: game.winner, playing, status: status.textContent };
    },
    // Replaces the hand with a seeded one (for tests), keeping the dealer and the running scores.
    deal(seed) { if (!game) return false; generation++; newHand(seed >>> 0); mirror(); render(); void regulars(); return true; },
  };
}

export const seatAtCafeSpades = pose => cafeSeat(pose?.sitting?.buildId);
