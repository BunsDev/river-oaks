import './plaza-table-games.css';
import { chessSeat } from './plaza-salon-plan.js';
import * as chess from './chess-rules.js';
import * as checkers from './checkers-rules.js';
import { CONNECT_FOUR } from './connect-four-adapter.js';
import { REVERSI } from './reversi-adapter.js';
import { attachGuide } from './salon-guide.js';

// Games at the plaza chess tables, for whoever sits down: chess, checkers or Connect Four,
// against the plaza regular (a small engine in a worker) or pass-and-play. A game
// lives in this browser, a practice game; the table's 3D pieces mirror it while
// you play. X opens the board. Each game is an adapter over its pure rules module.
// Chess and checkers move a piece from one square to another on an 8×8 board; a
// drop game (Connect Four) has its own board size and plays a column in one click.

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

const CHESS = {
  id: 'chess', name: 'Chess', sides: ['w', 'b'], sideName: { w: 'White', b: 'Black' }, opening: { w: 'e2', b: 'e7' },
  replay(moves) {
    let state = chess.fromFEN(chess.START_FEN);
    const keys = [chess.positionKey(state)], played = [];
    for (const text of moves) {
      const move = chess.findMove(state, text);
      if (!move) break;
      played.push({ from: move.from, to: move.to, text: chess.san(state, move) });
      state = chess.makeMove(state, move); keys.push(chess.positionKey(state));
    }
    const ended = chess.outcome(state, keys);
    return { state, keys, played, result: ended && { winner: ended.result === '1-0' ? 'w' : ended.result === '0-1' ? 'b' : null, reason: ended.reason } };
  },
  turn: state => state.turn,
  piece(state, square) {
    const letter = state.board[square];
    if (!letter) return null;
    const side = letter === letter.toUpperCase() ? 'w' : 'b', type = letter.toLowerCase();
    return { side, label: `${side === 'w' ? 'white' : 'black'} ${NAME[type]}`, glyph: GLYPH[type] };
  },
  moves: state => chess.legalMoves(state).map(move => ({ from: move.from, to: move.to, key: chess.uci(move), capture: Boolean(move.captured), choice: move.promotion ?? null })),
  alert: state => chess.inCheck(state) ? { square: chess.kingSquare(state, state.turn), text: 'Check! ' } : null,
  ending: () => 'Checkmate.',
  position: state => chess.toFEN(state),
};

const CHECKERS = {
  id: 'checkers', name: 'Checkers', sides: ['d', 'l'], sideName: { d: 'Dark', l: 'Light' }, opening: { d: 'c3', l: 'f6' },
  replay(moves) {
    let state = checkers.startPosition();
    const keys = [checkers.positionKey(state)], played = [];
    for (const text of moves) {
      const move = checkers.findMove(state, text);
      if (!move) break;
      played.push({ from: move.from, to: move.path.at(-1), text });
      state = checkers.makeMove(state, move); keys.push(checkers.positionKey(state));
    }
    return { state, keys, played, result: checkers.outcome(state, keys) };
  },
  turn: state => state.turn,
  piece(state, square) {
    const letter = state.board[square];
    if (!letter) return null;
    const side = letter.toLowerCase(), king = letter !== side;
    return { side, king, label: `${side === 'd' ? 'dark' : 'light'} ${king ? 'king' : 'man'}` };
  },
  // Two sequences can end on one square; the one that takes more is offered.
  moves: state => checkers.legalMoves(state).map(move => ({ from: move.from, to: move.path.at(-1), key: checkers.notation(move), capture: move.captures.length > 0, weight: move.captures.length }))
    .sort((a, b) => b.weight - a.weight),
  alert: state => checkers.legalMoves(state)[0]?.captures.length ? { square: -1, text: 'A capture is compulsory. ' } : null,
  ending: reason => reason === 'no pieces left' ? 'Every piece taken.' : 'No moves left.',
  position: state => state,
};
export const TABLE_GAMES = { chess: CHESS, checkers: CHECKERS, connectFour: CONNECT_FOUR, reversi: REVERSI };
const EMPTY_CHESS_BOARD = Array(64).fill('');
const sizeOf = adapter => adapter.size ?? { rows: 8, cols: 8 };
const nameOf = (adapter, square) => (adapter.squareName ?? chess.squareName)(square);
const squareOf = (adapter, name) => (adapter.squareOf ?? chess.squareOf)(name);

// The regular thinks in a worker; each request carries an id, so a late answer is dropped.
function createWorkerThinker() {
  let worker = null, next = 0;
  return ({ game, position, history, budget }) => new Promise(resolve => {
    try { worker ??= new Worker(new URL('./table-game-worker.js', import.meta.url), { type: 'module' }); }
    catch { resolve(null); return; }
    const id = ++next;
    const listen = ({ data }) => { if (data?.id !== id) return; worker.removeEventListener('message', listen); resolve(data.move ?? null); };
    worker.addEventListener('message', listen);
    worker.postMessage({ id, game, position, history, budget });
  });
}

export function createPlazaTableGames({ host = document.querySelector('#viewport'), getMirror = () => null, getFourMirror = () => null, getSeat = () => null, focusWorld = () => {},
  think = createWorkerThinker(), budget = 30000, replyDelay = 450 } = {}) {
  const tables = new Map();
  let tableId = null, selected = null, cursor = 'e2', pendingChoice = null, thinking = null;

  const panel = document.createElement('dialog');
  panel.id = 'table-game-panel'; panel.className = 'table-game-panel';
  panel.setAttribute('aria-labelledby', 'table-game-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="table-game-title">Chess at the plaza</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the game board">×</button></header>
    <div class="table-game-body"><div class="table-game-board" role="grid" aria-label="Game board"></div>
    <div class="table-game-side"><div class="table-game-choice" role="group" aria-label="Game">${Object.values(TABLE_GAMES).map(game => `<button type="button" data-game="${game.id}" aria-pressed="false">${game.name}</button>`).join('')}</div>
    <p class="table-game-status" role="status" aria-live="polite"></p>
    <div class="table-game-promotion" role="group" aria-label="Promote the pawn to" hidden></div>
    <ol class="table-game-moves" aria-label="Moves"></ol>
    <div class="table-game-actions"><div class="table-game-mode" role="group" aria-label="Opponent">
      <button type="button" data-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-mode="pass" aria-pressed="false">Pass and play</button></div>
      <div class="table-game-side-choice" role="group" aria-label="You play"><button type="button" data-side-index="0" aria-pressed="true"></button><button type="button" data-side-index="1" aria-pressed="false"></button></div>
      <button type="button" data-action="undo">Take back</button><button type="button" data-action="new">New game</button></div>
    <p class="table-game-note">Others in the town see a fresh board; shared games are coming.</p></div></div>`;
  host.append(panel);
  attachGuide(panel, () => panel.dataset.game);
  const $ = selector => panel.querySelector(selector);
  const board = $('.table-game-board'), status = $('.table-game-status'), moveList = $('.table-game-moves'), promotion = $('.table-game-promotion');

  // Each table keeps one game per kind, and remembers which kind was played last.
  const table = () => tables.get(tableId);
  const current = () => { const entry = table(); return entry?.games[entry.kind]; };
  const rules = () => TABLE_GAMES[table()?.kind ?? 'chess'];
  const newGame = (kind, chair, { mode = 'regular', player = TABLE_GAMES[kind].sides[0] } = {}) => {
    // The side that moves first sits at its player's chair: yours, unless you chose to go second.
    const firstChair = player === TABLE_GAMES[kind].sides[0] ? chair : 1 - chair;
    const game = { id: Symbol(kind), kind, moves: [], mode, player, chair, firstChair };
    table().games[kind] = game; return game;
  };
  const yourTurn = (game, state) => game.mode === 'pass' || rules().turn(state) === game.player;
  // Each kind has its own table mirror; the other one is cleared while it is in play.
  const mirror = () => {
    const game = current();
    if (!game) return;
    const board = rules().replay(game.moves).state.board;
    if (rules().mirror === 'connectFour') { getMirror()?.show(tableId, EMPTY_CHESS_BOARD, game.firstChair); getFourMirror()?.show(tableId, board, game.firstChair); }
    else { getFourMirror()?.show(tableId, null); getMirror()?.show(tableId, board, game.firstChair); }
  };

  function render() {
    const game = current(), adapter = rules();
    if (!game) return;
    const { state, played, result } = adapter.replay(game.moves);
    // Your own side sits at the bottom; pass-and-play keeps the first side at the bottom.
    const bottom = game.mode === 'pass' ? adapter.sides[0] : game.player, flipped = adapter.flips !== false && bottom !== adapter.sides[0];
    // A drop game marks where each column's next disc lands, only while you may drop one.
    const last = played.at(-1), legal = adapter.drop ? (result || thinking || !yourTurn(game, state) ? [] : adapter.moves(state)) : selected === null ? [] : adapter.moves(state).filter(move => move.from === selected);
    const { rows: size, cols } = sizeOf(adapter);
    // A mated king stays marked; the status only reads the alert while the game goes on.
    const alert = adapter.alert(state);
    const rows = [];
    for (let row = 0; row < size; row++) {
      const rank = flipped ? row : size - 1 - row, cells = [];
      for (let column = 0; column < cols; column++) {
        const file = flipped ? cols - 1 - column : column, square = rank * cols + file, name = nameOf(adapter, square), piece = adapter.piece(state, square);
        const cell = document.createElement('button');
        cell.type = 'button'; cell.className = 'table-square'; cell.setAttribute('role', 'gridcell');
        cell.dataset.square = name; cell.dataset.shade = (file + rank) % 2 ? 'light' : 'dark';
        cell.tabIndex = name === cursor ? 0 : -1;
        cell.setAttribute('aria-label', piece ? `${name}, ${piece.label}` : name);
        if (square === selected) cell.dataset.selected = '';
        const target = legal.find(move => move.to === square);
        if (target) cell.dataset.target = target.capture ? 'capture' : 'move';
        if (last && ((last.from !== undefined && last.from === square) || last.to === square)) cell.dataset.last = '';
        if (result?.cells?.includes(square)) cell.dataset.win = '';
        if (alert?.square === square) cell.dataset.check = '';
        if (piece) {
          const mark = document.createElement('span');
          mark.className = `table-piece ${adapter.id}-piece`; mark.dataset.side = piece.side; mark.setAttribute('aria-hidden', 'true');
          if (piece.glyph) mark.textContent = piece.glyph + '︎';
          if (piece.king) mark.dataset.king = '';
          cell.append(mark);
        }
        cells.push(cell);
      }
      const line = document.createElement('div'); line.setAttribute('role', 'row'); line.className = 'table-row'; line.append(...cells); rows.push(line);
    }
    const hadFocus = board.contains(document.activeElement);
    board.replaceChildren(...rows);
    board.dataset.game = adapter.id;
    if (hadFocus) board.querySelector(`[data-square="${cursor}"]`)?.focus({ preventScroll: true });
    moveList.replaceChildren(...played.reduce((items, move, index) => {
      if (index % 2 === 0) { const item = document.createElement('li'); item.textContent = move.text; items.push(item); }
      else items.at(-1).textContent += `  ${move.text}`;
      return items;
    }, []));
    moveList.scrollTop = moveList.scrollHeight;
    $('#table-game-title').textContent = `${adapter.name} at the plaza`;
    status.textContent = describe(game, adapter, state, result, alert);
    panel.dataset.state = result ? 'over' : thinking ? 'thinking' : 'playing';
    panel.dataset.game = adapter.id;
    for (const button of panel.querySelectorAll('.table-game-choice [data-game]')) button.setAttribute('aria-pressed', String(button.dataset.game === adapter.id));
    for (const button of panel.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === game.mode));
    for (const button of panel.querySelectorAll('[data-side-index]')) {
      const side = adapter.sides[Number(button.dataset.sideIndex)];
      button.textContent = adapter.sideName[side]; button.dataset.side = side;
      button.setAttribute('aria-pressed', String(side === game.player)); button.disabled = game.mode === 'pass';
    }
    $('[data-action="undo"]').disabled = !game.moves.length;
  }

  function describe(game, adapter, state, result, alert) {
    if (result) {
      if (!result.winner) return `Draw by ${result.reason}.`;
      const ending = adapter.ending(result.reason);
      return game.mode === 'pass' ? `${ending} ${adapter.sideName[result.winner]} wins.` : result.winner === game.player ? `${ending} You win!` : `${ending} The plaza regular wins.`;
    }
    if (thinking) return 'The plaza regular is thinking…';
    const prefix = alert?.text ?? '';
    if (game.mode === 'pass') return `${prefix}${adapter.sideName[adapter.turn(state)]} to move.`;
    return `${prefix}Your move, ${adapter.sideName[game.player].toLowerCase()}.`;
  }

  async function reply() {
    const game = current(), adapter = rules();
    if (!game || game.mode !== 'regular') return;
    const { state, keys, result } = adapter.replay(game.moves);
    if (result || adapter.turn(state) === game.player) return;
    const ticket = { game: game.id, ply: game.moves.length };
    thinking = ticket; render();
    const [move] = await Promise.all([think({ game: adapter.id, position: adapter.position(state), history: keys, budget }), new Promise(resolve => setTimeout(resolve, replyDelay))]);
    // A newer game, a take-back, another kind of game or another table makes this answer stale.
    if (thinking !== ticket || current()?.id !== ticket.game || current().moves.length !== ticket.ply) return;
    thinking = null;
    if (move && adapter.moves(state).some(option => option.key === move)) game.moves.push(move);
    mirror(); render();
    // In Reversi a side with no move passes, so the regular may move again.
    void reply();
  }

  function play(move) {
    current().moves.push(move.key); selected = null; pendingChoice = null; promotion.hidden = true;
    cursor = nameOf(rules(), move.to); mirror(); render(); void reply();
  }

  function choose(square) {
    const game = current(), adapter = rules();
    if (!game || thinking) return;
    const { state, result } = adapter.replay(game.moves);
    if (result || !yourTurn(game, state)) return;
    const moves = adapter.moves(state);
    if (adapter.drop) { const move = adapter.dropAt(moves, square); if (move) play(move); return; }
    if (selected !== null) {
      const options = moves.filter(move => move.from === selected && move.to === square);
      if (options.length && options[0].choice) { offerChoice(options); return; }
      if (options.length) { play(options[0]); return; }
    }
    selected = moves.some(move => move.from === square) && selected !== square ? square : null; render();
  }

  function offerChoice(options) {
    pendingChoice = options; promotion.hidden = false;
    promotion.replaceChildren(...[['q', 'Queen'], ['r', 'Rook'], ['b', 'Bishop'], ['n', 'Knight']].map(([type, label]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.promotion = type;
      button.addEventListener('click', () => { const move = pendingChoice?.find(option => option.choice === type); if (move) play(move); });
      return button;
    }));
    promotion.querySelector('button').focus();
  }

  const restart = changes => {
    const entry = table(), game = current();
    thinking = null; selected = null; promotion.hidden = true;
    const next = newGame(changes.kind ?? entry.kind, game.chair, { mode: changes.mode ?? game.mode, ...(changes.player ? { player: changes.player } : {}) });
    entry.kind = next.kind; cursor = TABLE_GAMES[next.kind].opening[next.player]; mirror(); render(); void reply();
  };

  board.addEventListener('click', event => {
    const cell = event.target.closest('.table-square');
    if (!cell) return;
    cursor = cell.dataset.square; choose(squareOf(rules(), cell.dataset.square));
  });
  // Arrow keys move around the board as you see it; Enter or Space picks the square.
  board.addEventListener('keydown', event => {
    const cell = event.target.closest('.table-square');
    if (!current() || !cell) return;
    const steps = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (!steps) return;
    event.preventDefault();
    const cells = [...board.querySelectorAll('.table-square')], index = cells.indexOf(cell), { rows, cols } = sizeOf(rules());
    const row = Math.min(rows - 1, Math.max(0, Math.floor(index / cols) + steps[1])), column = Math.min(cols - 1, Math.max(0, index % cols + steps[0]));
    const target = cells[row * cols + column];
    cell.tabIndex = -1; target.tabIndex = 0; target.focus(); cursor = target.dataset.square;
  });
  $('[data-action="new"]').addEventListener('click', () => { if (current()) restart({}); });
  $('[data-action="undo"]').addEventListener('click', () => {
    const game = current(), adapter = rules();
    if (!game?.moves.length) return;
    thinking = null; selected = null; promotion.hidden = true;
    game.moves.pop();
    // Against the regular, take back to your own turn.
    // Reversi's regular can move twice when you pass, so step back until it is yours.
    while (game.mode === 'regular' && game.moves.length && adapter.turn(adapter.replay(game.moves).state) !== game.player) game.moves.pop();
    mirror(); render(); void reply();
  });
  for (const button of panel.querySelectorAll('[data-mode]')) button.addEventListener('click', () => {
    const game = current();
    if (!game || game.mode === button.dataset.mode) return;
    game.mode = button.dataset.mode; thinking = null; selected = null; render(); void reply();
  });
  for (const button of panel.querySelectorAll('[data-side-index]')) button.addEventListener('click', () => {
    if (current() && current().player !== button.dataset.side) restart({ player: button.dataset.side });
  });
  // Switching kinds keeps the other game: each kind resumes where it was left.
  // The board also carries data-game (its CSS keys on it); only the choice buttons switch games.
  for (const button of panel.querySelectorAll('.table-game-choice [data-game]')) button.addEventListener('click', () => {
    const entry = table();
    if (!entry || entry.kind === button.dataset.game) return;
    thinking = null; selected = null; promotion.hidden = true;
    // A new kind starts against the same opponent as the game being left.
    const leaving = current();
    entry.kind = button.dataset.game;
    entry.games[entry.kind] ??= newGame(entry.kind, leaving?.chair ?? entry.chair, { mode: leaving?.mode });
    cursor = TABLE_GAMES[entry.kind].opening[current().player]; mirror(); render(); void reply();
  });
  const close = () => {
    if (!panel.open) return;
    panel.close(); selected = null; promotion.hidden = true; focusWorld();
  };
  $('.table-game-close').addEventListener('click', close);
  // Escape, or X again (as in the world), puts the board away.
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' || (event.code === 'KeyX' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function open() {
    const seat = getSeat();
    if (!seat) return;
    tableId = seat.tableId;
    if (!tables.has(tableId) || tables.get(tableId).chair !== seat.chair) tables.set(tableId, { kind: 'chess', chair: seat.chair, games: {} });
    const entry = table();
    entry.games[entry.kind] ??= newGame(entry.kind, seat.chair);
    cursor = TABLE_GAMES[entry.kind].opening[current().player];
    panel.show(); mirror(); render(); void reply();
    board.querySelector(`[data-square="${cursor}"]`)?.focus({ preventScroll: true });
  }

  return {
    panel,
    // What X does now, for the walking controls: only while seated at a game table.
    interaction() {
      if (!getSeat()) return null;
      return { kind: 'play', label: panel.open ? 'Hide the game board' : 'Play a table game', run: () => (panel.open ? close() : open()), disabled: false };
    },
    // Standing up or leaving the table puts the board away (its games are kept).
    update() {
      if (panel.open && getSeat()?.tableId !== tableId) close();
    },
    open, close,
    // For tests and the debug overlay.
    debug() {
      const game = current(), adapter = rules(), state = game ? adapter.replay(game.moves).state : null;
      return { open: panel.open, tableId, game: game?.kind ?? null, thinking: Boolean(thinking), moves: game?.moves.slice() ?? [], mode: game?.mode ?? null,
        player: game?.player ?? null, firstChair: game?.firstChair ?? null, position: state && game.kind === 'chess' ? chess.toFEN(state) : state ? (adapter.key ?? checkers.positionKey)(state) : null,
        board: state?.board.slice() ?? null, status: status.textContent };
    },
  };
}

export const seatAtTable = pose => chessSeat(pose?.sitting?.buildId);
