import './plaza-chess.css';
import { chessSeat } from './plaza-salon-plan.js';
import { findMove, fromFEN, inCheck, kingSquare, legalMoves, makeMove, outcome, positionKey, san, squareName, squareOf, START_FEN, toFEN, uci } from './chess-rules.js';

// Chess at the plaza tables, for whoever sits down: against the plaza regular (a
// small engine in a worker) or pass-and-play. The game lives in this browser, a
// practice game; the table's 3D pieces mirror it while you play. X opens the board.

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const PROMOTIONS = [['q', 'Queen'], ['r', 'Rook'], ['b', 'Bishop'], ['n', 'Knight']];
const colourName = colour => colour === 'w' ? 'White' : 'Black';

// The regular thinks in a worker; each request carries an id, so a late answer is dropped.
function createWorkerThinker() {
  let worker = null, next = 0;
  return ({ fen, history, budget }) => new Promise(resolve => {
    try { worker ??= new Worker(new URL('./chess-opponent-worker.js', import.meta.url), { type: 'module' }); }
    catch { resolve(null); return; }
    const id = ++next;
    const listen = ({ data }) => { if (data?.id !== id) return; worker.removeEventListener('message', listen); resolve(data.move ?? null); };
    worker.addEventListener('message', listen);
    worker.postMessage({ id, fen, history, budget });
  });
}

export function createPlazaChess({ host = document.querySelector('#viewport'), getMirror = () => null, getSeat = () => null, focusWorld = () => {},
  think = createWorkerThinker(), budget = 30000, replyDelay = 450 } = {}) {
  const games = new Map();
  let tableId = null, selected = null, cursor = 'e2', pendingPromotion = null, thinking = null;

  const panel = document.createElement('dialog');
  panel.id = 'chess-panel'; panel.className = 'chess-panel';
  panel.setAttribute('aria-labelledby', 'chess-title');
  panel.innerHTML = `<header class="chess-header"><div><p class="chess-eyebrow">Plaza chess · practice game</p><h2 id="chess-title">Chess at the plaza</h2></div>
    <button type="button" class="chess-close" aria-label="Close chess board">×</button></header>
    <div class="chess-body"><div class="chess-board" role="grid" aria-label="Chess board"></div>
    <div class="chess-side"><p class="chess-status" role="status" aria-live="polite"></p>
    <div class="chess-promotion" role="group" aria-label="Promote the pawn to" hidden></div>
    <ol class="chess-moves" aria-label="Moves"></ol>
    <div class="chess-actions"><div class="chess-mode" role="group" aria-label="Opponent">
      <button type="button" data-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-mode="pass" aria-pressed="false">Pass and play</button></div>
      <div class="chess-colour" role="group" aria-label="You play"><button type="button" data-colour="w" aria-pressed="true">White</button><button type="button" data-colour="b" aria-pressed="false">Black</button></div>
      <button type="button" data-chess="undo">Take back</button><button type="button" data-chess="new">New game</button></div>
    <p class="chess-note">Others in the town see a fresh board; shared games are coming.</p></div></div>`;
  host.append(panel);
  const $ = selector => panel.querySelector(selector);
  const board = $('.chess-board'), status = $('.chess-status'), moveList = $('.chess-moves'), promotion = $('.chess-promotion');

  const game = () => games.get(tableId);
  const replayGame = current => {
    let state = fromFEN(START_FEN);
    const keys = [positionKey(state)], played = [];
    for (const text of current.moves) {
      const move = findMove(state, text);
      if (!move) break;
      played.push({ ...move, san: san(state, move) });
      state = makeMove(state, move); keys.push(positionKey(state));
    }
    return { state, keys, played, result: outcome(state, keys) };
  };
  const newGame = (table, chair, { mode = 'regular', player = 'w' } = {}) => {
    // White sits at the chair of whoever plays white: you, unless you chose black.
    const whiteChair = player === 'w' ? chair : 1 - chair;
    const current = { id: Symbol(table), moves: [], mode, player, chair, whiteChair };
    games.set(table, current); return current;
  };
  const yourTurn = (current, state) => current.mode === 'pass' || state.turn === current.player;
  const mirror = () => { const current = game(); if (current) getMirror()?.show(tableId, replayGame(current).state.board, current.whiteChair); };

  function render() {
    const current = game();
    if (!current) return;
    const { state, played, result } = replayGame(current);
    // Your own colour sits at the bottom; pass-and-play keeps white at the bottom.
    const bottom = current.mode === 'pass' ? 'w' : current.player;
    const last = played.at(-1), legal = selected === null ? [] : legalMoves(state).filter(move => move.from === selected);
    const checked = inCheck(state) ? kingSquare(state, state.turn) : -1;
    const rows = [];
    for (let row = 0; row < 8; row++) {
      const rank = bottom === 'w' ? 7 - row : row, cells = [];
      for (let column = 0; column < 8; column++) {
        const file = bottom === 'w' ? column : 7 - column, square = rank * 8 + file, piece = state.board[square], name = squareName(square);
        const cell = document.createElement('button');
        cell.type = 'button'; cell.className = 'chess-square'; cell.setAttribute('role', 'gridcell');
        cell.dataset.square = name; cell.dataset.shade = (file + rank) % 2 ? 'light' : 'dark';
        cell.tabIndex = name === cursor ? 0 : -1;
        const colour = piece ? (piece === piece.toUpperCase() ? 'w' : 'b') : null;
        cell.setAttribute('aria-label', piece ? `${name}, ${colour === 'w' ? 'white' : 'black'} ${NAME[piece.toLowerCase()]}` : name);
        if (square === selected) cell.dataset.selected = '';
        if (legal.some(move => move.to === square)) cell.dataset.target = piece ? 'capture' : 'move';
        if (last && (last.from === square || last.to === square)) cell.dataset.last = '';
        if (square === checked) cell.dataset.check = '';
        if (piece) {
          const glyph = document.createElement('span');
          glyph.className = 'chess-piece'; glyph.dataset.colour = colour; glyph.setAttribute('aria-hidden', 'true');
          glyph.textContent = GLYPH[piece.toLowerCase()] + '︎';
          cell.append(glyph);
        }
        cells.push(cell);
      }
      const line = document.createElement('div'); line.setAttribute('role', 'row'); line.className = 'chess-row'; line.append(...cells); rows.push(line);
    }
    const hadFocus = board.contains(document.activeElement);
    board.replaceChildren(...rows);
    if (hadFocus) board.querySelector(`[data-square="${cursor}"]`)?.focus({ preventScroll: true });
    moveList.replaceChildren(...played.reduce((items, move, index) => {
      if (index % 2 === 0) { const item = document.createElement('li'); item.textContent = move.san; items.push(item); }
      else items.at(-1).textContent += `  ${move.san}`;
      return items;
    }, []));
    moveList.scrollTop = moveList.scrollHeight;
    status.textContent = describe(current, state, result);
    panel.dataset.state = result ? 'over' : thinking ? 'thinking' : 'playing';
    for (const button of panel.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === current.mode));
    for (const button of panel.querySelectorAll('[data-colour]')) { button.setAttribute('aria-pressed', String(button.dataset.colour === current.player)); button.disabled = current.mode === 'pass'; }
    $('[data-chess="undo"]').disabled = !current.moves.length;
  }

  function describe(current, state, result) {
    if (result) {
      if (result.result === '1/2-1/2') return `Draw by ${result.reason}.`;
      const winner = result.result === '1-0' ? 'w' : 'b';
      return current.mode === 'pass' ? `Checkmate. ${colourName(winner)} wins.` : winner === current.player ? 'Checkmate. You win!' : 'Checkmate. The plaza regular wins.';
    }
    if (thinking) return 'The plaza regular is thinking…';
    const check = inCheck(state) ? 'Check! ' : '';
    if (current.mode === 'pass') return `${check}${colourName(state.turn)} to move.`;
    return `${check}Your move, ${colourName(current.player).toLowerCase()}.`;
  }

  async function reply() {
    const current = game();
    if (!current || current.mode !== 'regular') return;
    const { state, keys, result } = replayGame(current);
    if (result || state.turn === current.player) return;
    const ticket = { game: current.id, ply: current.moves.length };
    thinking = ticket; render();
    const [move] = await Promise.all([think({ fen: toFEN(state), history: keys, budget }), new Promise(resolve => setTimeout(resolve, replyDelay))]);
    // A newer game, a take-back or another table makes this answer stale.
    if (thinking !== ticket || game()?.id !== ticket.game || game().moves.length !== ticket.ply) return;
    thinking = null;
    if (move && findMove(state, move)) current.moves.push(move);
    mirror(); render();
  }

  function play(move) {
    const current = game();
    current.moves.push(uci(move)); selected = null; pendingPromotion = null; promotion.hidden = true;
    cursor = squareName(move.to); mirror(); render(); void reply();
  }

  function choose(square) {
    const current = game();
    if (!current || thinking) return;
    const { state, result } = replayGame(current);
    if (result || !yourTurn(current, state)) return;
    const piece = state.board[square], own = piece && (piece === piece.toUpperCase() ? 'w' : 'b') === state.turn;
    if (selected !== null) {
      const options = legalMoves(state).filter(move => move.from === selected && move.to === square);
      if (options.length > 1) { offerPromotion(options); return; }
      if (options.length === 1) { play(options[0]); return; }
    }
    selected = own && selected !== square ? square : null; render();
  }

  function offerPromotion(options) {
    pendingPromotion = options; promotion.hidden = false;
    promotion.replaceChildren(...PROMOTIONS.map(([type, label]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.promotion = type;
      button.addEventListener('click', () => { const move = pendingPromotion?.find(option => option.promotion === type); if (move) play(move); });
      return button;
    }));
    promotion.querySelector('button').focus();
  }

  board.addEventListener('click', event => {
    const cell = event.target.closest('.chess-square');
    if (!cell) return;
    cursor = cell.dataset.square; choose(squareOf(cell.dataset.square));
  });
  // Arrow keys move around the board as you see it; Enter or Space picks the square.
  board.addEventListener('keydown', event => {
    const current = game(), cell = event.target.closest('.chess-square');
    if (!current || !cell) return;
    const steps = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (!steps) return;
    event.preventDefault();
    const cells = [...board.querySelectorAll('.chess-square')], index = cells.indexOf(cell);
    const row = Math.min(7, Math.max(0, Math.floor(index / 8) + steps[1])), column = Math.min(7, Math.max(0, index % 8 + steps[0]));
    const target = cells[row * 8 + column];
    cell.tabIndex = -1; target.tabIndex = 0; target.focus(); cursor = target.dataset.square;
  });
  $('[data-chess="new"]').addEventListener('click', () => {
    const current = game();
    if (!current) return;
    thinking = null; selected = null; promotion.hidden = true;
    newGame(tableId, current.chair, { mode: current.mode, player: current.player });
    cursor = game().player === 'w' ? 'e2' : 'e7'; mirror(); render(); void reply();
  });
  $('[data-chess="undo"]').addEventListener('click', () => {
    const current = game();
    if (!current?.moves.length) return;
    thinking = null; selected = null; promotion.hidden = true;
    current.moves.pop();
    // Against the regular, take back to your own turn.
    if (current.mode === 'regular' && current.moves.length && replayGame(current).state.turn !== current.player) current.moves.pop();
    mirror(); render(); void reply();
  });
  for (const button of panel.querySelectorAll('[data-mode]')) button.addEventListener('click', () => {
    const current = game();
    if (!current || current.mode === button.dataset.mode) return;
    current.mode = button.dataset.mode; thinking = null; selected = null; render(); void reply();
  });
  for (const button of panel.querySelectorAll('[data-colour]')) button.addEventListener('click', () => {
    const current = game();
    if (!current || current.player === button.dataset.colour) return;
    thinking = null; selected = null;
    newGame(tableId, current.chair, { mode: current.mode, player: button.dataset.colour });
    cursor = button.dataset.colour === 'w' ? 'e2' : 'e7'; mirror(); render(); void reply();
  });
  const close = () => {
    if (!panel.open) return;
    panel.close(); selected = null; promotion.hidden = true; focusWorld();
  };
  $('.chess-close').addEventListener('click', close);
  // Escape, or X again (as in the world), puts the board away.
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    tableId = seat.tableId;
    if (!games.has(tableId) || games.get(tableId).chair !== seat.chair) newGame(tableId, seat.chair);
    cursor = game().player === 'w' ? 'e2' : 'e7';
    panel.show(); mirror(); render(); void reply();
    board.querySelector(`[data-square="${cursor}"]`)?.focus({ preventScroll: true });
  }

  return {
    panel,
    // What X does now, for the walking controls: only while seated at a chess table.
    interaction() {
      const seat = getSeat();
      if (!seat) return null;
      return { kind: 'play', label: panel.open ? 'Hide the chess board' : 'Play chess', run: () => (panel.open ? close() : open()), disabled: false };
    },
    // Standing up or leaving the table puts the board away (the game is kept for this table).
    update() {
      if (panel.open && getSeat()?.tableId !== tableId) close();
    },
    open, close,
    // For tests and the debug overlay.
    debug() {
      const current = game();
      return { open: panel.open, tableId, thinking: Boolean(thinking), moves: current?.moves.slice() ?? [], mode: current?.mode ?? null, player: current?.player ?? null,
        whiteChair: current?.whiteChair ?? null, fen: current ? toFEN(replayGame(current).state) : null, status: status.textContent };
    },
  };
}

export const seatAtChess = pose => chessSeat(pose?.sitting?.buildId);
