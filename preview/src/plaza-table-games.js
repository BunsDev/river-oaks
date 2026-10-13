import './plaza-table-games.css';
import { chessSeat } from './plaza-salon-plan.js';
import * as chess from './chess-rules.js';
import * as checkers from './checkers-rules.js';
import { TABLE_GAMES } from './table-game-adapters.js';
import { attachGuide } from './salon-guide.js';

export { TABLE_GAMES };

// Games at the plaza chess tables, for whoever sits down: chess, checkers, Connect Four,
// Reversi or nine men's morris, against the plaza regular (a small engine in a worker),
// pass-and-play, or the resident sitting across the table. A practice game lives in this
// browser; a game with the resident across is held by the town (server/table-games.js),
// which checks every move, and every table's 3D pieces show its shared game to everyone.
// X opens the board. Each game is an adapter over its pure rules module.

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
  getTown = () => null,
  think = createWorkerThinker(), budget = 30000, replyDelay = 450 } = {}) {
  const tables = new Map();
  let tableId = null, selected = null, cursor = 'e2', pendingChoice = null, thinking = null;

  const panel = document.createElement('dialog');
  panel.id = 'table-game-panel'; panel.className = 'table-game-panel';
  panel.setAttribute('aria-labelledby', 'table-game-title');
  panel.innerHTML = `<header class="table-game-header"><div><p class="table-game-eyebrow" id="table-game-eyebrow">Plaza games · practice game</p><h2 id="table-game-title">Chess at the plaza</h2></div>
    <button type="button" class="table-game-close" aria-label="Close the game board">×</button></header>
    <div class="table-game-body"><div class="table-game-board" role="grid" aria-label="Game board"></div>
    <div class="table-game-side"><div class="table-game-choice" role="group" aria-label="Game">${Object.values(TABLE_GAMES).map(game => `<button type="button" data-game="${game.id}" aria-pressed="false">${game.short ?? game.name}</button>`).join('')}</div>
    <p class="table-game-status" role="status" aria-live="polite"></p>
    <div class="table-game-invite" role="group" aria-label="Invitation" hidden><p></p><div><button type="button" data-invite="accept">Accept</button><button type="button" data-invite="decline">Decline</button></div></div>
    <div class="table-game-promotion" role="group" aria-label="Promote the pawn to" hidden></div>
    <ol class="table-game-moves" aria-label="Moves"></ol>
    <div class="table-game-actions"><div class="table-game-mode" role="group" aria-label="Opponent">
      <button type="button" data-mode="regular" aria-pressed="true">Plaza regular</button><button type="button" data-mode="pass" aria-pressed="false">Pass and play</button><button type="button" data-mode="shared" aria-pressed="false" hidden></button></div>
      <div class="table-game-side-choice" role="group" aria-label="You play"><button type="button" data-side-index="0" aria-pressed="true"></button><button type="button" data-side-index="1" aria-pressed="false"></button></div>
      <button type="button" data-action="undo">Take back</button><button type="button" data-action="resign" hidden>Resign</button><button type="button" data-action="new">New game</button></div>
    <p class="table-game-note"></p></div></div>`;
  host.append(panel);
  attachGuide(panel, () => panel.dataset.game);
  const $ = selector => panel.querySelector(selector);
  const board = $('.table-game-board'), status = $('.table-game-status'), moveList = $('.table-game-moves'), promotion = $('.table-game-promotion');

  // The town: its snapshot (every table's shared game, who sits where) and its commands.
  const town = () => getTown() ?? null;
  const selfId = () => town()?.selfId ?? null;
  const sharedAt = id => town()?.snapshot?.tables?.find(item => item.id === id) ?? null;
  const isMine = shared => Boolean(shared?.kind && shared.players.includes(selfId()));
  const residentAt = (id, chair) => (town()?.snapshot?.players ?? []).find(player => { const seat = chessSeat(player.sitting?.buildId); return seat?.tableId === id && seat.chair === chair; }) ?? null;
  const residentName = id => (town()?.snapshot?.players ?? []).find(player => player.id === id)?.name ?? 'Your opponent';
  // A shared game as the sheet plays it: the town's moves, your side, the first mover's chair.
  const sharedGame = shared => {
    const chair = shared.players.indexOf(selfId()), adapter = TABLE_GAMES[shared.kind];
    return { id: `shared:${shared.id}:${shared.kind}:${shared.players.join()}`, kind: shared.kind, moves: shared.moves, mode: 'shared', player: shared.sides[chair],
      chair, firstChair: shared.sides.indexOf(adapter.sides[0]), shared, opponent: shared.players[1 - chair] };
  };

  // Each table keeps one practice game per kind and remembers which kind was played last;
  // its view is the practice game or the shared game with the resident across.
  const table = () => tables.get(tableId);
  const current = () => {
    const entry = table();
    if (!entry) return null;
    const shared = sharedAt(tableId);
    if (entry.view === 'shared' && isMine(shared)) return sharedGame(shared);
    return entry.games[entry.kind];
  };
  const rules = () => TABLE_GAMES[current()?.kind ?? table()?.kind ?? 'chess'];
  const newGame = (kind, chair, { mode = 'regular', player = TABLE_GAMES[kind].sides[0] } = {}) => {
    // The side that moves first sits at its player's chair: yours, unless you chose to go second.
    const firstChair = player === TABLE_GAMES[kind].sides[0] ? chair : 1 - chair;
    const game = { id: Symbol(kind), kind, moves: [], mode, player, chair, firstChair };
    table().games[kind] = game; return game;
  };
  const yourTurn = (game, state) => game.mode === 'pass' || rules().turn(state) === game.player;
  // Each kind has its own table mirror; the others are cleared while it is in play (the
  // chess mirror also draws checkers and Reversi discs). board null shows the opening.
  const showOnTable = (id, kind, board, firstChair) => {
    const mirrorKind = TABLE_GAMES[kind]?.mirror ?? 'chess';
    getFourMirror()?.show(id, board && mirrorKind === 'connectFour' ? board : null, firstChair);
    getMorrisMirror()?.show(id, board && mirrorKind === 'morris' ? board : null, firstChair);
    getMirror()?.show(id, !board ? null : mirrorKind === 'chess' ? board : EMPTY_CHESS_BOARD, firstChair);
  };
  const sharedBoard = shared => TABLE_GAMES[shared.kind].replay(shared.moves).state.board;
  // A shared game's end is the town's: a resignation or a player leaving is not in its moves.
  const replayGame = game => {
    const replayed = TABLE_GAMES[game.kind].replay(game.moves);
    return game.mode === 'shared' ? { ...replayed, result: game.shared.result ?? replayed.result } : replayed;
  };
  // A table's shared game is what everyone sees there; your practice game shows at your
  // own table only while no shared game is on it.
  const mirror = () => {
    const shared = sharedAt(tableId);
    if (shared?.kind) { showOnTable(tableId, shared.kind, sharedBoard(shared), shared.sides.indexOf(TABLE_GAMES[shared.kind].sides[0])); return; }
    const game = current();
    if (game) showOnTable(tableId, game.kind, rules().replay(game.moves).state.board, game.firstChair);
  };
  // Every table follows its shared game, for everyone in town.
  const shownShared = new Map();
  function syncTables() {
    for (const id of getMirror()?.tables ?? []) {
      const shared = sharedAt(id), signature = shared?.kind ? `${shared.kind}|${shared.sides}|${shared.moves.join()}` : '';
      if (shownShared.get(id) === signature) continue;
      const before = shownShared.get(id);
      shownShared.set(id, signature);
      if (shared?.kind) showOnTable(id, shared.kind, sharedBoard(shared), shared.sides.indexOf(TABLE_GAMES[shared.kind].sides[0]));
      else if (id === tableId && tables.get(id)) mirror();
      else if (before) showOnTable(id, 'chess', null, 0);
    }
  }

  function render() {
    const game = current(), adapter = rules();
    if (!game) return;
    const { state, played, result } = replayGame(game);
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
      button.setAttribute('aria-pressed', String(side === game.player)); button.disabled = game.mode !== 'regular';
    }
    const sharing = game.mode === 'shared';
    $('[data-action="undo"]').hidden = sharing; $('[data-action="undo"]').disabled = !game.moves.length;
    $('[data-action="resign"]').hidden = !sharing || Boolean(result);
    // A rematch is offered once the shared game has ended.
    $('[data-action="new"]').textContent = sharing ? 'Rematch' : 'New game'; $('[data-action="new"]').hidden = sharing && !result;
    renderShared(game);
  }

  // The resident across the table, the invitation between you, and what the sheet says.
  function renderShared(game) {
    const seat = getSeat(), across = seat ? residentAt(seat.tableId, 1 - seat.chair) : null, shared = sharedAt(tableId), invite = shared?.invite ?? null;
    const opponent = game.mode === 'shared' ? game.opponent : across?.id ?? null;
    const button = $('[data-mode="shared"]');
    button.hidden = !across && game.mode !== 'shared';
    if (opponent) button.textContent = `Play ${residentName(opponent)}`;
    $('#table-game-eyebrow').textContent = game.mode === 'shared' ? `Plaza games · with ${residentName(game.opponent)}` : 'Plaza games · practice game';
    $('.table-game-note').textContent = game.mode === 'shared' ? 'Everyone in the plaza sees this game.'
      : across ? `Practice games stay in your browser. Play ${across.name} to share a game with the plaza.` : 'Practice games stay in your browser. When someone sits across from you, you can play them.';
    const bar = $('.table-game-invite'), mine = invite && [invite.from, invite.to].includes(selfId());
    bar.hidden = !mine;
    if (!mine) return;
    const incoming = invite.to === selfId(), kind = TABLE_GAMES[invite.kind], yours = incoming ? kind.sides.find(side => side !== invite.side) : invite.side;
    bar.dataset.invite = incoming ? 'incoming' : 'outgoing';
    bar.querySelector('p').textContent = incoming ? `${residentName(invite.from)} invites you to play ${kind.name} as ${kind.sideName[yours].toLowerCase()}.`
      : `Waiting for ${residentName(invite.to)} to accept ${kind.name}…`;
    bar.querySelector('[data-invite="accept"]').hidden = !incoming;
    bar.querySelector('[data-invite="decline"]').textContent = incoming ? 'Decline' : 'Cancel';
  }

  function describe(game, adapter, state, result, alert) {
    if (game.mode === 'shared') return describeShared(game, adapter, state, result, alert);
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

  function describeShared(game, adapter, state, result, alert) {
    const name = residentName(game.opponent), won = result?.winner === game.player;
    if (result) {
      if (result.reason === 'left the table') return result.left === selfId() ? 'You left the table.' : `${name} left the table, so the game is yours.`;
      if (result.reason === 'resigned') return result.resigned === selfId() ? `You resigned. ${name} wins.` : `${name} resigned. You win!`;
      if (!result.winner) return `Draw by ${result.reason}.`;
      return `${adapter.ending(result.reason)} ${won ? 'You win!' : `${name} wins.`}`;
    }
    if (sending) return 'Sending your move…';
    const prefix = alert?.text ?? '';
    return adapter.turn(state) === game.player ? `${prefix}Your move, ${adapter.sideName[game.player].toLowerCase()}.` : `${prefix}${name} to move.`;
  }

  // Shared moves and invitations go to the town; its snapshot brings them back.
  let sending = false, notice = '';
  async function send(message, after = () => {}) {
    const town_ = town();
    if (!town_?.command) { status.textContent = 'Connect to the town to play together.'; return null; }
    sending = message.action === 'move'; render();
    let reply = null;
    try { reply = await town_.command({ type: 'tableGame', ...message }); }
    catch (error) { reply = { ok: false, message: error.message }; }
    sending = false;
    if (reply?.ok) after(reply); else notice = reply?.message ?? 'The town did not accept that.';
    render();
    if (notice) { status.textContent = notice; notice = ''; }
    return reply;
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
    selected = null; pendingChoice = null; promotion.hidden = true; cursor = nameOf(rules(), move.to);
    if (current().mode === 'shared') { void send({ action: 'move', move: move.key }); return; }
    current().moves.push(move.key); mirror(); render(); void reply();
  }

  function choose(square) {
    const game = current(), adapter = rules();
    if (!game || thinking || sending) return;
    const { state, result } = replayGame(game);
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
  $('[data-action="new"]').addEventListener('click', () => {
    const game = current();
    if (!game) return;
    // A rematch asks again, for the same game, with the sides you had.
    if (game.mode === 'shared') { void send({ action: 'invite', kind: game.kind, side: game.player }); return; }
    restart({});
  });
  $('[data-action="resign"]').addEventListener('click', () => { if (current()?.mode === 'shared') void send({ action: 'resign' }); });
  for (const button of panel.querySelectorAll('[data-invite]')) button.addEventListener('click', () => {
    void send({ action: button.dataset.invite }, () => { if (button.dataset.invite === 'accept') table().view = 'shared'; });
  });
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
    const entry = table(), game = current();
    if (!entry || !game || game.mode === button.dataset.mode) return;
    thinking = null; selected = null; pendingChoice = null; promotion.hidden = true;
    // Play the resident across: show your game with them, or invite them to this one.
    if (button.dataset.mode === 'shared') {
      const shared = sharedAt(tableId);
      if (isMine(shared)) { entry.view = 'shared'; mirror(); render(); return; }
      if (shared?.invite?.from === selfId()) return;
      void send({ action: 'invite', kind: entry.kind, side: entry.games[entry.kind].player });
      return;
    }
    // Back to practice: the practice game resumes where it was, the shared one carries on.
    entry.view = 'practice';
    entry.games[entry.kind].mode = button.dataset.mode; mirror(); render(); void reply();
  });
  for (const button of panel.querySelectorAll('[data-side-index]')) button.addEventListener('click', () => {
    if (current() && current().mode !== 'shared' && current().player !== button.dataset.side) restart({ player: button.dataset.side });
  });
  // Switching kinds keeps the other game: each kind resumes where it was left.
  // The board also carries data-game (its CSS keys on it); only the choice buttons switch games.
  for (const button of panel.querySelectorAll('.table-game-choice [data-game]')) button.addEventListener('click', () => {
    const entry = table();
    if (!entry || (entry.kind === button.dataset.game && current()?.mode !== 'shared')) return;
    thinking = null; selected = null; pendingChoice = null; promotion.hidden = true;
    // Choosing a game shows its practice game; a shared game carries on at the table.
    entry.view = 'practice';
    // A new kind starts against the same opponent as the game being left.
    const leaving = entry.games[entry.kind];
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
    if (!tables.has(tableId) || tables.get(tableId).chair !== seat.chair) tables.set(tableId, { kind: 'chess', chair: seat.chair, games: {}, view: 'practice' });
    const entry = table();
    entry.games[entry.kind] ??= newGame(entry.kind, seat.chair);
    const shared = sharedAt(tableId);
    if (isMine(shared) && !shared.result) entry.view = 'shared';
    cursor = TABLE_GAMES[entry.kind].opening[current().player];
    panel.show(); mirror(); render(); void reply();
    board.querySelector(`[data-square="${cursor}"]`)?.focus({ preventScroll: true });
  }

  return {
    panel,
    // What X does now, for the walking controls: only while seated at a game table.
    interaction() {
      const seat = getSeat();
      if (!seat) return null;
      const invite = sharedAt(seat.tableId)?.invite;
      const label = panel.open ? 'Hide the game board' : invite?.to === selfId() ? `${residentName(invite.from)} invites you to ${TABLE_GAMES[invite.kind].name}` : 'Play a table game';
      return { kind: 'play', label, run: () => (panel.open ? close() : open()), disabled: false };
    },
    // Standing up or leaving the table puts the board away (its practice games are kept).
    // Each frame: every table follows its shared game, and the sheet follows the town.
    update() {
      if (panel.open && getSeat()?.tableId !== tableId) close();
      syncTables();
      const entry = table(), shared = sharedAt(tableId);
      if (!entry) return;
      // A new shared game of yours opens on its board.
      const start = isMine(shared) && !shared.moves.length && !shared.result ? `${shared.kind}|${shared.players}` : null;
      if (start && entry.started !== start) { entry.started = start; entry.view = 'shared'; }
      const seen = JSON.stringify([shared ?? null, residentAt(tableId, 1 - (getSeat()?.chair ?? entry.chair))?.id ?? null]);
      if (panel.open && seen !== entry.seen) { entry.seen = seen; mirror(); render(); }
    },
    open, close,
    // For tests and the debug overlay.
    debug() {
      const game = current(), adapter = rules(), state = game ? adapter.replay(game.moves).state : null;
      return { open: panel.open, tableId, game: game?.kind ?? null, thinking: Boolean(thinking), moves: game?.moves.slice() ?? [], mode: game?.mode ?? null,
        player: game?.player ?? null, firstChair: game?.firstChair ?? null, position: state && game.kind === 'chess' ? chess.toFEN(state) : state ? (adapter.key ?? checkers.positionKey)(state) : null,
        board: state?.board.slice() ?? null, status: status.textContent, shared: sharedAt(tableId), invite: $('.table-game-invite').hidden ? null : $('.table-game-invite p').textContent };
    },
  };
}

export const seatAtTable = pose => chessSeat(pose?.sitting?.buildId);
