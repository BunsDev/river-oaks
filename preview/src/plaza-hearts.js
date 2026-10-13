import './plaza-table-games.css';
import './plaza-hearts.css';
import { cafeSeat } from './plaza-salon-plan.js';
import { GAME_POINTS, canPass, legalCards, points, replay, suitOf } from './hearts-rules.js';
import { choosePass, choosePlay } from './hearts-opponent.js';

// Hearts at the plaza café table: you and three plaza regulars, a game to 100. It
// is a practice game kept in this browser; the round table shows the trick face up
// and the hands face down while you play. The regulars play in turn, a moment apart.

const SUIT = { C: { glyph: '♣', name: 'clubs' }, D: { glyph: '♦', name: 'diamonds' }, S: { glyph: '♠', name: 'spades' }, H: { glyph: '♥', name: 'hearts' } };
const RANK = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const RANK_NAME = { J: 'jack', Q: 'queen', K: 'king', A: 'ace', T: '10' };
export const cardName = card => `${RANK_NAME[card[0]] ?? card[0]} of ${SUIT[suitOf(card)].name}`;
function cardArt(card) {
  const rank = RANK[card[0]] ?? card[0], { glyph } = SUIT[suitOf(card)];
  return `<svg viewBox="0 0 50 70" aria-hidden="true"><rect x=".75" y=".75" width="48.5" height="68.5" rx="5"/>`
    + `<text class="card-rank" x="5" y="17">${rank}</text><text class="card-pip" x="25" y="47" text-anchor="middle">${glyph}︎</text></svg>`;
}

export function createPlazaHearts({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  random = Math.random, replyDelay = 650, onSwitch = null } = {}) {
  let game = null, selected = [], generation = 0, playing = false;

  const panel = document.createElement('dialog');
  panel.id = 'hearts-panel'; panel.className = 'table-game-panel hearts-panel';
  panel.setAttribute('aria-labelledby', 'hearts-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="hearts-title">Hearts at the café</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the card table">×</button></header>
    <div class="table-game-body hearts-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-cafe-game="dominoes" aria-pressed="false">Dominoes</button><button type="button" data-cafe-game="hearts" aria-pressed="true">Hearts</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="hearts-scores" aria-label="Scores, the game ends at ${GAME_POINTS}"></ul>
      <section class="hearts-trick" aria-label="The trick"></section>
      <div class="hearts-hand" role="toolbar" aria-label="Your cards"></div>
      <div class="table-game-actions">
        <button type="button" data-action="pass">Pass three cards</button><button type="button" data-action="next">Next hand</button><button type="button" data-action="game">New game</button>
      </div>
      <p class="table-game-note">Hearts score one each and the queen of spades thirteen; take all of them to shoot the moon. The regulars only see what a player at the table could.</p>
    </div>`;
  host.append(panel);
  const $ = selector => panel.querySelector(selector);
  const status = $('.table-game-status'), handBar = $('.hearts-hand');

  // You are player 0; play moves left. Player 1 sits on your left, 2 across, 3 on your right.
  const NAMES = ['You', 'The regular on your left', 'The regular across', 'The regular on your right'], SHORT = ['You', 'Left', 'Across', 'Right'];
  const chairOf = player => (game.chair - player + 4) % 4;
  const round = () => replay(game.seed, game.hand, game.moves);
  const newHand = (seed = Math.floor(random() * 2 ** 32)) => { game.seed = seed; game.moves = []; game.scored = false; selected = []; };
  const newGame = chair => { game = { chair, scores: [0, 0, 0, 0], hand: 0 }; newHand(); };
  const gameOver = () => Math.max(...game.scores) >= GAME_POINTS;

  function mirror() {
    if (!game) return;
    const { state } = round();
    getMirror()?.show({ trick: state.trick.map(play => ({ chair: chairOf(play.player), card: play.card })),
      hands: state.hands.map((cards, player) => ({ chair: chairOf(player), count: cards.length })),
      won: state.taken.map((cards, player) => ({ chair: chairOf(player), tricks: cards.length / 4 })) });
  }

  function settle(state) {
    if (!state.over || game.scored) return;
    game.scored = true;
    state.over.points.forEach((value, player) => { game.scores[player] += value; });
  }

  function describe(state) {
    if (state.over) {
      const { moon, points: taken } = state.over;
      const hand = moon !== null ? (moon === 0 ? 'You shot the moon! Everyone else takes 26.' : `${NAMES[moon]} shot the moon: 26 for everyone else.`)
        : `You took ${taken[0]} point${taken[0] === 1 ? '' : 's'} this hand.`;
      if (!gameOver()) return hand;
      const best = Math.min(...game.scores), winners = game.scores.flatMap((score, player) => score === best ? [player] : []);
      return `${hand} ${winners.includes(0) ? (winners.length > 1 ? 'You share the win!' : 'You win the game!') : `${NAMES[winners[0]]} wins the game.`}`;
    }
    if (state.phase === 'pass') return `Choose three cards to pass ${state.direction === 'across' ? 'across' : `to the ${state.direction}`}${selected.length ? ` (${selected.length} chosen)` : ''}.`;
    if (state.turn !== 0) return `${NAMES[state.turn]} is playing…`;
    if (state.tricks === 0 && !state.trick.length) return 'You hold the two of clubs: lead it.';
    if (!state.trick.length) return state.heartsBroken ? 'Your lead.' : 'Your lead. Hearts are not broken yet.';
    return `Your turn: follow ${SUIT[suitOf(state.trick[0].card)].name} if you can.`;
  }

  function render() {
    if (!game) return;
    const { state } = round(), legal = state.phase === 'play' && state.turn === 0 && !state.over && !playing ? legalCards(state) : [];
    settle(state);
    status.textContent = describe(state);
    panel.dataset.state = state.over ? 'over' : state.phase;
    $('.hearts-scores').replaceChildren(...game.scores.map((score, player) => {
      const item = document.createElement('li'), taken = state.taken[player].reduce((sum, card) => sum + points(card), 0);
      item.textContent = `${SHORT[player]} ${score}${taken && !state.over ? ` +${taken}` : ''}`; item.title = NAMES[player];
      if (player === state.turn && state.phase === 'play' && !state.over) item.dataset.turn = '';
      return item;
    }));
    // The trick as a cross: you at the foot, the others where they sit. An empty trick
    // shows the last one, with its taker marked.
    const shown = state.trick.length ? state.trick : state.lastTrick ?? [], finished = !state.trick.length && Boolean(state.lastTrick);
    const taker = finished ? state.turn : null;
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
    const focused = handBar.contains(document.activeElement) ? document.activeElement.dataset.card : null;
    handBar.replaceChildren(...state.hands[0].map(card => {
      const button = document.createElement('button'), passing = state.phase === 'pass' && state.turn === 0;
      button.type = 'button'; button.className = 'playing-card in-hand'; button.dataset.card = card; button.dataset.suit = suitOf(card); button.innerHTML = cardArt(card);
      const usable = passing || legal.includes(card);
      button.disabled = !usable; button.tabIndex = -1;
      if (legal.includes(card)) button.dataset.legal = '';
      if (selected.includes(card)) { button.dataset.selected = ''; button.setAttribute('aria-pressed', 'true'); } else if (passing) button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', cardName(card)); return button;
    }));
    const stop = handBar.querySelector(`[data-card="${focused}"]:not(:disabled)`) ?? handBar.querySelector('button:not(:disabled)');
    if (stop) stop.tabIndex = 0;
    if (focused && stop) stop.focus({ preventScroll: true });
    const passButton = $('[data-action="pass"]');
    passButton.hidden = state.phase !== 'pass';
    passButton.disabled = selected.length !== 3 || playing;
    passButton.textContent = state.phase === 'pass' ? `Pass ${state.direction === 'across' ? 'across' : state.direction}` : 'Pass';
    $('[data-action="next"]').hidden = !state.over || gameOver();
    for (const button of panel.querySelectorAll('[data-cafe-game]')) button.setAttribute('aria-pressed', String(button.dataset.cafeGame === 'hearts'));
  }

  // The regulars pass and play in turn until it is yours or the hand ends.
  async function regulars() {
    const ticket = ++generation;
    playing = true;
    try {
      for (;;) {
        const { state, played } = round();
        if (state.over || state.turn === 0) break;
        render();
        await new Promise(resolve => setTimeout(resolve, state.phase === 'pass' ? 120 : replyDelay));
        if (ticket !== generation) return;
        game.moves.push(state.phase === 'pass' ? `pass:${choosePass(state.hands[state.turn]).join(',')}` : choosePlay(state, played, legalCards(state)));
        mirror();
      }
    } finally { if (ticket === generation) { playing = false; render(); } }
  }

  function choose(card) {
    const { state } = round();
    if (playing || state.over || state.turn !== 0) return;
    if (state.phase === 'pass') {
      selected = selected.includes(card) ? selected.filter(held => held !== card) : selected.length < 3 ? [...selected, card] : selected;
      render(); return;
    }
    if (!legalCards(state).includes(card)) return;
    game.moves.push(card); mirror(); render(); void regulars();
  }

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
  $('[data-action="pass"]').addEventListener('click', () => {
    const { state } = round();
    if (playing || state.phase !== 'pass' || state.turn !== 0 || !canPass(state, selected)) return;
    game.moves.push(`pass:${selected.join(',')}`); selected = []; mirror(); render(); void regulars();
  });
  $('[data-action="next"]').addEventListener('click', () => {
    if (!round().state.over || gameOver()) return;
    generation++; game.hand++; newHand(); mirror(); render(); void regulars();
  });
  $('[data-action="game"]').addEventListener('click', () => { generation++; newGame(game.chair); mirror(); render(); void regulars(); });
  for (const button of panel.querySelectorAll('[data-cafe-game]')) button.addEventListener('click', () => { if (button.dataset.cafeGame !== 'hearts') onSwitch?.(button.dataset.cafeGame); });
  const close = ({ toWorld = true } = {}) => {
    if (!panel.open) return;
    panel.close(); selected = [];
    if (toWorld) focusWorld();
  };
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
    (handBar.querySelector('[tabindex="0"]') ?? status).focus?.({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the cards' : 'Play hearts', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() {
      if (panel.open && getSeat()?.chair !== game?.chair) close();
    },
    open, close, mirror,
    // For tests and the debug overlay; `deal` replaces the hand with a seeded one (hand number kept).
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, chair: game.chair, seed: game.seed, hand: game.hand, moves: game.moves.slice(), phase: state.phase, direction: state.direction, turn: state.turn,
        cards: state.hands[0].slice(), sizes: state.hands.map(cards => cards.length), trick: state.trick.map(play => play.card), tricks: state.tricks,
        legal: state.phase === 'play' && state.turn === 0 ? legalCards(state) : [], selected: selected.slice(), over: state.over, scores: game.scores.slice(), playing, status: status.textContent };
    },
    deal(seed, hand = game?.hand ?? 0) {
      if (!game) return false;
      generation++; game.hand = hand; newHand(seed); mirror(); render(); void regulars(); return true;
    },
  };
}

export const seatAtCafeTable = pose => cafeSeat(pose?.sitting?.buildId);
