import './plaza-table-games.css';
import { chessSeat } from './plaza-salon-plan.js';
import * as chess from './chess-rules.js';
import * as checkers from './checkers-rules.js';
import { TABLE_GAMES } from './table-game-adapters.js';
import { attachGuide } from './salon-guide.js';

export { TABLE_GAMES };

// Games at the plaza chess tables, for whoever sits down: chess, checkers or Connect Four,
// against the plaza regular (a small engine in a worker) or pass-and-play. A game
// lives in this browser, a practice game; the table's 3D pieces mirror it while
// you play. X opens the board. Each game is an adapter over its pure rules module.
// Chess and checkers move a piece from one square to another on an 8×8 board; a
// drop game (Connect Four) has its own board size and plays a column in one click.

// A drop game places with one click; morris does while pieces remain in hand.
const dropping = (adapter, state) => typeof adapter.drop === 'function' ? adapter.drop(state) : Boolean(adapter.drop);
const EMPTY_CHESS_BOARD = Array(64).fill('');
const sizeOf = adapter => adapter.size ?? { rows: 8, cols: 8 };
const nameOf = (adapter, square) => (adapter.squareName ?? chess.squareName)(square);
const squareOf = (adapter, name) => (adapter.squareOf ?? chess.squareOf)(name);

// The regular thinks in a worker; each request carries an id, so a late answer is dropped.
export function createWorkerThinker() {
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

export function createPlazaTableGames({ host = document.querySelector('#viewport'), getMirror = () => null, getFourMirror = () => null, getMorrisMirror = () => null, getSeat = () => null, focusWorld = () => {},
  think = createWorkerThinker(), budget = 30000, replyDelay = 450 } = {}) {
  const tables = new Map();
  let tableId = null, selected = null, cursor = 'e2', pendingChoice = null, thinking = null;

  const panel = document.createElement('dialog');
  panel.id = 'table-game-panel'; panel.className = 'table-game-panel';
  panel.setAttribute('aria-labelledby', 'table-game-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow">Plaza games · practice game</p><h2 id="table-game-title">Chess at the plaza</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the game board">×</button></header>
    <div class="table-game-body"><div class="table-game-board" role="grid" aria-label="Game board"></div>
    <div class="table-game-side"><div class="table-game-choice" role="group" aria-label="Game">${Object.values(TABLE_GAMES).map(game => `<button type="button" data-game="${game.id}" aria-pressed="false">${game.short ?? game.name}</button>`).join('')}</div>
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
  // Each kind has its own table mirror; the others are cleared while it is in play (the
  // chess mirror also draws checkers and Reversi discs).
  const mirror = () => {
    const game = current();
    if (!game) return;
    const board = rules().replay(game.moves).state.board, kind = rules().mirror ?? 'chess';
    getFourMirror()?.show(tableId, kind === 'connectFour' ? board : null, game.firstChair);
    getMorrisMirror()?.show(tableId, kind === 'morris' ? board : null, game.firstChair);
    getMirror()?.show(tableId, kind === 'chess' ? board : EMPTY_CHESS_BOARD, game.firstChair);
  };

  function render() {
    const game = current(), adapter = rules();
    if (!game) return;
    const { state, played, result } = adapter.replay(game.moves);
    // Your own side sits at the bottom; pass-and-play keeps the first side at the bottom.
    const bottom = game.mode === 'pass' ? adapter.sides[0] : game.player, flipped = adapter.flips !== false && bottom !== adapter.sides[0];
    // A drop game marks where each column's next disc lands, only while you may drop one.
    // A mill waiting for its piece marks the pieces it may take.
    const taking = pendingChoice?.[0]?.take != null ? pendingChoice.map(move => ({ to: move.take, capture: true })) : null;
    const last = played.at(-1), legal = taking ?? (dropping(adapter, state) ? (result || thinking || !yourTurn(game, state) ? [] : adapter.moves(state)) : selected === null ? [] : adapter.moves(state).filter(move => move.from === selected));
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
        // Morris plays only its 24 points; the rest of the grid carries the lines.
        if (adapter.playable && !adapter.playable(square)) { cell.dataset.void = ''; cell.disabled = true; cell.tabIndex = -1; cell.setAttribute('aria-hidden', 'true'); cells.push(cell); continue; }
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
    status.textContent = taking ? adapter.takeLabel(state) : describe(game, adapter, state, result, alert);
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
    // A mill is waiting: a marked piece completes the move.
    if (pendingChoice?.[0]?.take != null) { const move = pendingChoice.find(option => option.take === square); if (move) play(move); return; }
    // The moves that share this placement or step: more than one means a mill, and the
    // piece to take is chosen next, on the board.
    const settle = options => {
      if (options.length > 1 && options[0].take != null) { pendingChoice = options; selected = options[0].from ?? null; render(); return; }
      play(options[0]);
    };
    if (dropping(adapter, state)) { const move = adapter.dropAt(moves, square); if (move) settle(moves.filter(option => option.from === move.from && option.to === move.to)); return; }
    if (selected !== null) {
      const options = moves.filter(move => move.from === selected && move.to === square);
      if (options.length && options[0].choice) { offerChoice(options); return; }
      if (options.length) { settle(options); return; }
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
    thinking = null; selected = null; pendingChoice = null; promotion.hidden = true;
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
    // Step past cells that are not played (morris) to the next one that is, if any.
    let row = Math.floor(index / cols), column = index % cols, target = cell;
    for (;;) {
      row += steps[1]; column += steps[0];
      if (row < 0 || row >= rows || column < 0 || column >= cols) break;
      const next = cells[row * cols + column];
      if (!next.disabled) { target = next; break; }
    }
    if (target === cell) return;
    cell.tabIndex = -1; target.tabIndex = 0; target.focus(); cursor = target.dataset.square;
  });
  $('[data-action="new"]').addEventListener('click', () => { if (current()) restart({}); });
  $('[data-action="undo"]').addEventListener('click', () => {
    const game = current(), adapter = rules();
    if (!game?.moves.length) return;
    thinking = null; selected = null; pendingChoice = null; promotion.hidden = true;
    game.moves.pop();
    // Against the regular, take back to your own turn.
    // Reversi's regular can move twice when you pass, so step back until it is yours.
    while (game.mode === 'regular' && game.moves.length && adapter.turn(adapter.replay(game.moves).state) !== game.player) game.moves.pop();
    mirror(); render(); void reply();
  });
  for (const button of panel.querySelectorAll('[data-mode]')) button.addEventListener('click', () => {
    const game = current();
    if (!game || game.mode === button.dataset.mode) return;
    game.mode = button.dataset.mode; thinking = null; selected = null; pendingChoice = null; render(); void reply();
  });
  for (const button of panel.querySelectorAll('[data-side-index]')) button.addEventListener('click', () => {
    if (current() && current().player !== button.dataset.side) restart({ player: button.dataset.side });
  });
  // Switching kinds keeps the other game: each kind resumes where it was left.
  // The board also carries data-game (its CSS keys on it); only the choice buttons switch games.
  for (const button of panel.querySelectorAll('.table-game-choice [data-game]')) button.addEventListener('click', () => {
    const entry = table();
    if (!entry || entry.kind === button.dataset.game) return;
    thinking = null; selected = null; pendingChoice = null; promotion.hidden = true;
    // A new kind starts against the same opponent as the game being left.
    const leaving = current();
    entry.kind = button.dataset.game;
    entry.games[entry.kind] ??= newGame(entry.kind, leaving?.chair ?? entry.chair, { mode: leaving?.mode });
    cursor = TABLE_GAMES[entry.kind].opening[current().player]; mirror(); render(); void reply();
  });
  const close = () => {
    if (!panel.open) return;
    panel.close(); selected = null; pendingChoice = null; promotion.hidden = true; focusWorld();
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
