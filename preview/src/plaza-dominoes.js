import './plaza-table-games.css';
import './plaza-dominoes.css';
import { cafeSeat } from './plaza-salon-plan.js';
import { MATCH_POINTS, ends, handPips, legalMoves, notation, replay, values } from './dominoes-rules.js';
import { chooseMove } from './dominoes-opponent.js';
import { attachGuide } from './salon-guide.js';

// Dominoes at the plaza café table, for whoever sits down: a match to 100 against
// the plaza regulars, two players (the draw game) or four (the block game). It is
// a practice game kept in this browser; the round table mirrors the line and the
// hands while you play. X opens the table. The regulars play in turn, a moment apart.

// A tile as a small SVG: two halves with their pips; `vertical` stands it up.
const SPOTS = { 0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]] };
function tileArt(first, second, vertical = false) {
  const half = (value, offset) => SPOTS[value].map(([x, y]) => vertical
    ? `<circle cx="${5 + y * 5}" cy="${offset + 5 + x * 5}" r="1.6"/>` : `<circle cx="${offset + 5 + x * 5}" cy="${5 + y * 5}" r="1.6"/>`).join('');
  const [w, h] = vertical ? [20, 40] : [40, 20];
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect x=".75" y=".75" width="${w - 1.5}" height="${h - 1.5}" rx="3.2"/>`
    + (vertical ? '<line x1="4" y1="20" x2="16" y2="20"/>' : '<line x1="20" y1="4" x2="20" y2="16"/>')
    + `<g>${half(first, 0)}${half(second, 20)}</g></svg>`;
}
const tileName = id => id.replace('-', '–');

export function createPlazaDominoes({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  random = Math.random, replyDelay = 600, onSwitch = null } = {}) {
  let match = null, pendingTile = null, generation = 0, playing = false;

  const panel = document.createElement('dialog');
  panel.id = 'dominoes-panel'; panel.className = 'table-game-panel dominoes-panel';
  panel.setAttribute('aria-labelledby', 'dominoes-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="dominoes-title">Dominoes at the café</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the dominoes table">×</button></header>
    <div class="table-game-body dominoes-body">
      ${onSwitch ? '<div class="table-game-choice" role="group" aria-label="Game"><button type="button" data-cafe-game="dominoes" aria-pressed="true">Dominoes</button><button type="button" data-cafe-game="hearts" aria-pressed="false">Hearts</button></div>' : ''}
      <p class="table-game-status" role="status" aria-live="polite"></p>
      <ul class="dominoes-scores" aria-label="Scores, first to ${MATCH_POINTS}"></ul>
      <section class="dominoes-table" aria-label="Played tiles"><ol class="dominoes-line"></ol><p class="dominoes-ends"></p></section>
      <ul class="dominoes-others" aria-label="Other hands"></ul>
      <div class="dominoes-hand" role="toolbar" aria-label="Your tiles"></div>
      <div class="dominoes-choice" role="group" aria-label="Play this tile on" hidden></div>
      <div class="table-game-actions">
        <button type="button" data-action="draw">Draw</button><button type="button" data-action="pass">Pass</button><button type="button" data-action="next">Next round</button>
        <div class="dominoes-players" role="group" aria-label="Players"><button type="button" data-players="2" aria-pressed="true">2 players</button><button type="button" data-players="4" aria-pressed="false">4 players</button></div>
        <button type="button" data-action="match">New match</button>
      </div>
      <p class="table-game-note">Two play the draw game, four the block game. The regulars only see what a player at the table could.</p>
    </div>`;
  host.append(panel);
  attachGuide(panel, 'dominoes');
  const $ = selector => panel.querySelector(selector);
  const status = $('.table-game-status'), hand = $('.dominoes-hand'), choice = $('.dominoes-choice');

  const names = () => match.players === 2 ? ['You', 'The regular'] : ['You', 'The regular on your right', 'The regular across', 'The regular on your left'];
  const shortNames = () => match.players === 2 ? ['You', 'Regular'] : ['You', 'Right', 'Across', 'Left'];
  // You are player 0 at your chair; the regulars follow round the table.
  const chairs = () => match.players === 2 ? [match.chair, (match.chair + 2) % 4] : [0, 1, 2, 3].map(step => (match.chair + step) % 4);
  const round = () => replay(match.seed, match.players, match.moves);
  const newRound = (seed = Math.floor(random() * 2 ** 32)) => { match.seed = seed; match.moves = []; match.scored = false; };
  const newMatch = (players, chair) => { match = { players, chair, scores: Array(players).fill(0), rounds: 0 }; newRound(); };
  const leadIndex = played => played.filter(move => move.kind === 'play' && move.end === 'left').length;
  const matchWinner = () => { const best = Math.max(...match.scores); return best >= MATCH_POINTS ? match.scores.indexOf(best) : null; };

  function mirror() {
    if (!match) return;
    const { state, played } = round(), seats = chairs();
    getMirror()?.show({ line: state.line, leadIndex: leadIndex(played), facing: match.chair,
      hands: state.hands.map((tiles, player) => player === 0 ? { chair: seats[0], tiles } : { chair: seats[player], count: tiles.length }) });
  }

  // Scores a finished round once.
  function settle(state) {
    if (!state.over || match.scored) return;
    match.scored = true; match.rounds++;
    if (state.over.winner !== null) match.scores[state.over.winner] += state.over.points;
  }

  function describe(state) {
    const who = names(), winner = matchWinner();
    if (state.over) {
      const { winner: player, reason, points } = state.over;
      const outcome = player === null ? 'Blocked, with a tie for the lightest hand: no points.'
        : reason === 'domino' ? (player === 0 ? `Domino! You win ${points} points.` : `${who[player]} plays out and wins ${points} points.`)
        : (player === 0 ? `Blocked. Your hand is the lightest: ${points} points.` : `Blocked. ${who[player]} has the lightest hand and wins ${points} points.`);
      if (winner === null) return outcome;
      return `${outcome} ${winner === 0 ? `You win the match, ${match.scores[0]} points!` : `${who[winner]} wins the match.`}`;
    }
    if (state.turn !== 0) return `${who[state.turn]} is playing…`;
    const moves = legalMoves(state);
    if (!state.line.length) return `Your lead: play the ${tileName(state.lead)}.`;
    if (moves[0].kind === 'draw') return 'No tile fits: draw from the boneyard.';
    if (moves[0].kind === 'pass') return 'No tile fits and nothing is left to draw: pass.';
    const [left, right] = ends(state);
    return `Your turn. Open ends: ${left} and ${right}.`;
  }

  function render() {
    if (!match) return;
    const { state } = round(), who = names(), short = shortNames(), legal = state.turn === 0 && !state.over ? legalMoves(state) : [];
    settle(state);
    status.textContent = describe(state);
    panel.dataset.state = state.over ? 'over' : state.turn === 0 ? 'yours' : 'theirs';
    $('.dominoes-scores').replaceChildren(...match.scores.map((score, player) => {
      const item = document.createElement('li'); item.textContent = `${short[player]} ${score}`; item.title = who[player];
      if (player === state.turn && !state.over) item.dataset.turn = ''; return item;
    }));
    $('.dominoes-line').replaceChildren(...state.line.map(tile => {
      const item = document.createElement('li'), double = tile.left === tile.right;
      item.className = 'domino'; item.dataset.tile = tile.id; item.innerHTML = tileArt(tile.left, tile.right, double);
      item.setAttribute('aria-label', tileName(`${tile.left}-${tile.right}`)); return item;
    }));
    const open = ends(state);
    $('.dominoes-ends').textContent = open ? `Open ends: ${open[0]} on the left, ${open[1]} on the right.` : 'The line is empty.';
    $('.dominoes-others').replaceChildren(...state.hands.slice(1).map((tiles, index) => {
      const item = document.createElement('li'); item.textContent = `${who[index + 1]}: ${tiles.length} tile${tiles.length === 1 ? '' : 's'}`; return item;
    }), ...(match.players === 2 ? [Object.assign(document.createElement('li'), { textContent: `Boneyard: ${state.boneyard.length}` })] : []));
    const focusedTile = hand.contains(document.activeElement) ? document.activeElement.dataset.tile : null;
    hand.replaceChildren(...state.hands[0].map(id => {
      const [a, b] = values(id), button = document.createElement('button'), fits = legal.some(move => move.tile === id);
      button.type = 'button'; button.className = 'domino domino-in-hand'; button.dataset.tile = id; button.innerHTML = tileArt(a, b, true);
      button.setAttribute('aria-label', `${tileName(id)}${fits ? ', playable' : ''}`); button.disabled = !fits; button.tabIndex = -1;
      if (fits) button.dataset.fits = '';
      if (pendingTile === id) button.dataset.selected = '';
      return button;
    }));
    // One tab stop in the hand: the focused tile, else the first that fits.
    const stop = hand.querySelector(`[data-tile="${focusedTile}"]:not(:disabled)`) ?? hand.querySelector('[data-fits]');
    if (stop) stop.tabIndex = 0;
    if (focusedTile && stop) stop.focus({ preventScroll: true });
    const only = legal[0]?.kind;
    $('[data-action="draw"]').disabled = only !== 'draw' || playing;
    $('[data-action="pass"]').disabled = only !== 'pass' || playing;
    $('[data-action="next"]').hidden = !state.over || matchWinner() !== null;
    $('[data-action="match"]').textContent = matchWinner() !== null ? 'New match' : 'Start over';
    for (const button of panel.querySelectorAll('[data-players]')) button.setAttribute('aria-pressed', String(Number(button.dataset.players) === match.players));
  }

  // The regulars take their turns, one move at a time, until it is yours or the round ends.
  async function regulars() {
    const ticket = ++generation;
    playing = true;
    try {
      for (;;) {
        const { state, played } = round();
        if (state.over || state.turn === 0) break;
        render();
        await new Promise(resolve => setTimeout(resolve, replyDelay));
        if (ticket !== generation) return;
        const move = chooseMove(state, played, legalMoves(state));
        match.moves.push(notation(move)); mirror();
      }
    } finally { if (ticket === generation) { playing = false; render(); } }
  }

  function play(move) {
    match.moves.push(notation(move)); pendingTile = null; choice.hidden = true;
    mirror(); render(); void regulars();
  }

  function pick(id) {
    const { state } = round();
    if (playing || state.over || state.turn !== 0) return;
    const options = legalMoves(state).filter(move => move.tile === id);
    if (options.length === 1) { play(options[0]); return; }
    if (!options.length) return;
    // The tile fits both ends: ask which.
    pendingTile = id; choice.hidden = false;
    const [left, right] = ends(state);
    choice.replaceChildren(...options.map(move => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.end = move.end;
      button.textContent = move.end === 'left' ? `Left end (${left})` : `Right end (${right})`;
      button.addEventListener('click', () => play(move)); return button;
    }));
    render(); choice.querySelector('button').focus();
  }

  hand.addEventListener('click', event => { const button = event.target.closest('[data-tile]'); if (button && !button.disabled) pick(button.dataset.tile); });
  hand.addEventListener('keydown', event => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const buttons = [...hand.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
    const next = buttons[(index + step + buttons.length) % buttons.length];
    if (!next) return;
    for (const button of buttons) button.tabIndex = -1;
    next.tabIndex = 0; next.focus();
  });
  for (const kind of ['draw', 'pass']) $(`[data-action="${kind}"]`).addEventListener('click', () => {
    const { state } = round(), move = legalMoves(state).find(option => option.kind === kind);
    if (!playing && state.turn === 0 && move) play(move);
  });
  $('[data-action="next"]').addEventListener('click', () => { if (round().state.over && matchWinner() === null) { generation++; newRound(); mirror(); render(); void regulars(); } });
  $('[data-action="match"]').addEventListener('click', () => { generation++; newMatch(match.players, match.chair); pendingTile = null; choice.hidden = true; mirror(); render(); void regulars(); });
  for (const button of panel.querySelectorAll('[data-players]')) button.addEventListener('click', () => {
    const players = Number(button.dataset.players);
    if (players === match.players) return;
    generation++; newMatch(players, match.chair); pendingTile = null; choice.hidden = true; mirror(); render(); void regulars();
  });
  for (const button of panel.querySelectorAll('[data-cafe-game]')) button.addEventListener('click', () => { if (button.dataset.cafeGame !== 'dominoes') onSwitch?.(button.dataset.cafeGame); });
  const close = ({ toWorld = true } = {}) => {
    if (!panel.open) return;
    panel.close(); pendingTile = null; choice.hidden = true;
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
    if (!match || match.chair !== seat.chair) newMatch(match?.players ?? 2, seat.chair);
    panel.show(); mirror(); render(); void regulars();
    (hand.querySelector('[tabindex="0"]') ?? status).focus?.({ preventScroll: true });
  }

  return {
    panel,
    // What X does now, for the walking controls: only while seated at the café table.
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the dominoes' : 'Play dominoes', run: () => (panel.open ? close() : open()), disabled: false };
    },
    // Standing up or changing chairs puts the table away (the match is kept for that chair).
    update() {
      if (panel.open && getSeat()?.chair !== match?.chair) close();
    },
    open, close, mirror,
    // For tests and the debug overlay; `deal` replaces the round with a seeded one.
    debug() {
      if (!match) return { open: panel.open, match: null };
      const { state } = round();
      return { open: panel.open, players: match.players, chair: match.chair, seed: match.seed, moves: match.moves.slice(), turn: state.turn, lead: state.lead,
        hand: state.hands[0].slice(), sizes: state.hands.map(tiles => tiles.length), boneyard: state.boneyard.length, line: state.line.map(tile => `${tile.left}-${tile.right}`),
        legal: state.turn === 0 ? legalMoves(state).map(notation) : [], over: state.over, scores: match.scores.slice(), playing, status: status.textContent,
        pips: handPips(state.hands[0]) };
    },
    deal(seed, players = match?.players ?? 2) {
      if (!match) return false;
      generation++; if (players !== match.players) newMatch(players, match.chair);
      newRound(seed); pendingTile = null; choice.hidden = true; mirror(); render(); void regulars(); return true;
    },
  };
}

export const seatAtCafe = pose => cafeSeat(pose?.sitting?.buildId);
