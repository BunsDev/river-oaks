import './plaza-table-games.css';
import './plaza-hearts.css';
import './plaza-cribbage.css';
import { attachGuide } from './salon-guide.js';
import { backgammonSeat } from './plaza-salon-plan.js';
import { suitOf } from './hearts-rules.js';
import { GAME_POINTS, cardsLeft, legalMoves, replay, runningCount } from './cribbage-rules.js';
import { choosePlay } from './cribbage-opponent.js';
import { cardArt, cardName } from './plaza-hearts.js';

// Cribbage at the walnut table, you against a plaza regular, to 121. Lay two cards
// away to the crib, play to 31, and count your hand; the board's pegs mirror the
// score. A practice game kept in this browser. X opens the table.

const WHO = ['You', 'The plaza regular'], REASON = { 'fifteen': 'fifteen', 'thirty-one': 'thirty-one', 'pair': 'a pair', 'pair royal': 'a pair royal',
  'double pair royal': 'a double pair royal', 'run': 'a run', 'go': 'go', 'last card': 'last card', 'his heels': 'his heels', 'hand': 'the hand', 'crib': 'the crib' };

export function createPlazaCribbage({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  random = Math.random, replyDelay = 650, onSwitch = null } = {}) {
  let game = null, selected = [], generation = 0, playing = false;

  const panel = document.createElement('dialog');
  panel.id = 'cribbage-panel'; panel.className = 'table-game-panel cribbage-panel';
  panel.setAttribute('aria-labelledby', 'cribbage-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="cribbage-title">Cribbage at the walnut table</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the cribbage table">×</button></header>
    <div class="table-game-body cribbage-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-walnut-game="backgammon" aria-pressed="false">Backgammon</button><button type="button" data-walnut-game="cribbage" aria-pressed="true">Cribbage</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="cribbage-scores" aria-label="Scores, the game ends at ${GAME_POINTS}"></ul>
      <section class="cribbage-table" aria-label="The table"><div class="cribbage-cut"></div><div class="cribbage-pile"></div></section>
      <ol class="cribbage-show" aria-label="The show" hidden></ol>
      <div class="hearts-hand cribbage-hand" role="toolbar" aria-label="Your cards"></div>
      <div class="table-game-actions"><button type="button" data-cribbage-action="discard">Lay away to the crib</button><button type="button" data-cribbage-action="next">Next hand</button><button type="button" data-cribbage-action="game">New game</button></div>
      <p class="table-game-note">Fifteen and thirty-one score 2, pairs and runs as they fall; go and the last card 1. Then each hand counts with the starter, and the dealer's crib last.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'cribbage');
  const $ = selector => panel.querySelector(selector);
  const status = $('.table-game-status'), handBar = $('.cribbage-hand');

  const round = () => replay(game.seed, game.moves, game.firstDealer);
  const newGame = chair => { game = { seed: Math.floor(random() * 2 ** 32), moves: [], firstDealer: 1, chair, wins: game?.wins ?? [0, 0], scored: false }; selected = []; };
  const mirror = () => { if (game) getMirror()?.show(round().state.scores, game.chair); };
  const card = (code, label) => { const node = document.createElement('span'); node.className = 'playing-card'; node.dataset.suit = suitOf(code); node.innerHTML = cardArt(code); node.setAttribute('role', 'img'); node.setAttribute('aria-label', label ?? cardName(code)); return node; };
  const back = label => { const node = document.createElement('span'); node.className = 'cribbage-back'; node.setAttribute('role', 'img'); node.setAttribute('aria-label', label); return node; };
  const summary = parts => {
    const by = {};
    for (const part of parts) by[part.kind] = (by[part.kind] ?? 0) + part.points;
    return Object.entries(by).map(([kind, points]) => `${kind === 'fifteen' ? 'fifteens' : kind === 'pair' ? 'pairs' : kind === 'run' ? 'runs' : kind} ${points}`).join(' · ') || 'nineteen (nothing)';
  };

  function describe(state) {
    const heard = state.events.map(event => `${WHO[event.player]} ${event.player === 0 ? 'peg' : 'pegs'} ${event.points} for ${REASON[event.reason] ?? event.reason}.`).join(' ');
    if (state.winner !== null) return `${heard} ${state.winner === 0 ? 'You win the game!' : 'The plaza regular wins the game.'}`.trim();
    if (state.phase === 'discard') return state.turn === 0 ? `${state.dealer === 0 ? 'Your crib' : 'The regular’s crib'}: choose two cards to lay away.` : 'The regular is laying away…';
    if (state.phase === 'show') return `${heard} The show is counted.`.trim();
    if (playing || state.turn !== 0) return `${heard} The regular is playing…`.trim();
    return `${heard} Your play: the count is ${runningCount(state)}.`.trim();
  }

  function render() {
    if (!game) return;
    const { state } = round(), hadFocus = panel.contains(document.activeElement), focused = handBar.contains(document.activeElement) ? document.activeElement.dataset.card : null;
    if (state.winner !== null && !game.scored) { game.scored = true; game.wins[state.winner] += 1; }
    status.textContent = describe(state);
    panel.dataset.state = state.winner !== null ? 'over' : state.phase;
    $('.cribbage-scores').replaceChildren(...[0, 1].map(player => {
      const item = document.createElement('li'), bar = document.createElement('span');
      item.textContent = `${WHO[player]}${state.dealer === player ? ' (dealer)' : ''}: ${state.scores[player]}`;
      bar.className = 'cribbage-track'; bar.style.setProperty('--score', Math.min(1, state.scores[player] / GAME_POINTS)); item.append(bar);
      if (state.phase === 'play' && state.turn === player && state.winner === null) item.dataset.turn = '';
      return item;
    }));
    const cut = [];
    cut.push(state.starter ? card(state.starter, `The starter: ${cardName(state.starter)}`) : back('The deck, uncut'));
    cut.push(back(`${state.dealer === 0 ? 'Your' : 'The regular’s'} crib: ${state.crib.length} cards`));
    $('.cribbage-cut').replaceChildren(...cut);
    const pile = state.pile.map(code => card(code)), count = document.createElement('span');
    count.className = 'cribbage-count'; count.textContent = state.phase === 'play' ? `Count ${runningCount(state)}` : state.phase === 'discard' ? 'Laying away' : '';
    $('.cribbage-pile').replaceChildren(count, ...pile);
    const show = $('.cribbage-show');
    show.hidden = !state.show;
    if (state.show) show.replaceChildren(...state.show.map(part => { const item = document.createElement('li'); item.textContent = `${part.player === 0 ? 'Your' : 'The regular’s'} ${part.crib ? 'crib' : 'hand'}: ${summary(part.parts)} = ${part.total}`; return item; }));
    const yours = state.phase === 'discard' ? state.hands[0] : state.kept[0] ? (state.phase === 'play' ? cardsLeft(state, 0) : state.kept[0]) : [];
    const legal = !playing && state.phase === 'play' && state.turn === 0 ? legalMoves(state) : [], discarding = state.phase === 'discard' && state.turn === 0 && !playing;
    handBar.replaceChildren(...yours.map(code => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'playing-card in-hand'; button.dataset.card = code; button.dataset.suit = suitOf(code); button.innerHTML = cardArt(code);
      const usable = discarding || legal.includes(code);
      button.disabled = !usable; button.tabIndex = -1;
      if (legal.includes(code)) button.dataset.legal = '';
      if (discarding) button.setAttribute('aria-pressed', String(selected.includes(code)));
      if (selected.includes(code)) button.dataset.selected = '';
      button.setAttribute('aria-label', cardName(code)); return button;
    }));
    const stop = handBar.querySelector(`[data-card="${focused}"]:not(:disabled)`) ?? handBar.querySelector('button:not(:disabled)');
    if (stop) stop.tabIndex = 0;
    const discard = $('[data-cribbage-action="discard"]');
    discard.hidden = !discarding; discard.disabled = selected.length !== 2;
    $('[data-cribbage-action="next"]').hidden = state.phase !== 'show' || state.winner !== null;
    $('[data-cribbage-action="game"]').hidden = state.winner === null;
    if (hadFocus && !panel.contains(document.activeElement)) (stop ?? panel.querySelector('[data-cribbage-action]:not([hidden]):not(:disabled)') ?? $('.table-game-close')).focus({ preventScroll: true });
    else if (focused && stop && document.activeElement !== stop) stop.focus({ preventScroll: true });
  }

  async function regular() {
    const ticket = ++generation;
    playing = true;
    try {
      for (;;) {
        const { state } = round();
        if (state.winner !== null || state.phase === 'show' || (state.turn === 0 && state.phase !== 'show')) break;
        render();
        await new Promise(resolve => setTimeout(resolve, replyDelay));
        if (ticket !== generation) return;
        game.moves.push(choosePlay(state)); mirror();
      }
    } finally { if (ticket === generation) { playing = false; render(); } }
  }

  function choose(code) {
    const { state } = round();
    if (playing || state.winner !== null || state.turn !== 0) return;
    if (state.phase === 'discard') { selected = selected.includes(code) ? selected.filter(item => item !== code) : selected.length < 2 ? [...selected, code] : selected; render(); return; }
    if (!legalMoves(state).includes(code)) return;
    game.moves.push(code); mirror(); render(); void regular();
  }

  handBar.addEventListener('click', event => { const button = event.target.closest('[data-card]'); if (button && !button.disabled) choose(button.dataset.card); });
  handBar.addEventListener('keydown', event => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const buttons = [...handBar.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement), next = buttons[(index + step + buttons.length) % buttons.length];
    if (!next) return;
    for (const button of buttons) button.tabIndex = -1;
    next.tabIndex = 0; next.focus();
  });
  $('[data-cribbage-action="discard"]').addEventListener('click', () => {
    const { state } = round();
    if (playing || state.phase !== 'discard' || state.turn !== 0 || selected.length !== 2) return;
    game.moves.push(`discard:${selected.join(',')}`); selected = []; mirror(); render(); void regular();
  });
  $('[data-cribbage-action="next"]').addEventListener('click', () => { if (round().state.phase !== 'show') return; game.moves.push('next'); mirror(); render(); void regular(); });
  $('[data-cribbage-action="game"]').addEventListener('click', () => { generation++; newGame(game.chair); mirror(); render(); void regular(); });
  for (const button of panel.querySelectorAll('[data-walnut-game]')) button.addEventListener('click', () => { if (button.dataset.walnutGame !== 'cribbage') onSwitch?.(button.dataset.walnutGame); });
  const close = ({ toWorld = true } = {}) => { if (!panel.open) return; generation++; playing = false; panel.close(); if (toWorld) focusWorld(); };
  $('.table-game-close').addEventListener('click', () => close());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    if (!game || game.chair !== seat.chair) newGame(seat.chair);
    panel.show(); mirror(); render(); void regular();
    (handBar.querySelector('[tabindex="0"]') ?? $('.table-game-close')).focus({ preventScroll: true });
  }

  return {
    panel,
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the cribbage table' : 'Play cribbage', run: () => (panel.open ? close() : open()), disabled: false };
    },
    update() { if (panel.open && getSeat()?.chair !== game?.chair) close(); },
    open, close, mirror,
    debug() {
      if (!game) return { open: panel.open, game: null };
      const { state } = round();
      return { open: panel.open, chair: game.chair, seed: game.seed, phase: state.phase, turn: state.turn, dealer: state.dealer, hand: state.hand, cards: state.phase === 'discard' ? state.hands[0].slice() : cardsLeft(state, 0),
        legal: !playing && state.turn === 0 ? legalMoves(state) : [], count: runningCount(state), pile: state.pile.slice(), scores: state.scores.slice(), crib: state.crib.length, starter: state.starter,
        show: state.show?.map(part => ({ player: part.player, crib: part.crib, total: part.total })) ?? null, winner: state.winner, selected: selected.slice(), playing, moves: game.moves.length, status: status.textContent };
    },
    // Deals a seeded game (for tests), keeping the chair.
    deal(seed) { if (!game) return false; generation++; newGame(game.chair); game.seed = seed >>> 0; mirror(); render(); void regular(); return true; },
  };
}

export const seatAtWalnut = pose => backgammonSeat(pose?.sitting?.buildId);
