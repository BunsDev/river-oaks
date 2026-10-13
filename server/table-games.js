// Shared games at the plaza chess tables: two residents seated at one table play each
// other, and the town holds the game. Either may invite the other to chess, checkers,
// Connect Four, Reversi or nine men's morris; the invited one accepts or declines.
// Every move is checked by replaying the game with the adapters the sheet plays
// (preview/src/table-game-adapters.js), so a client offers moves and never sets a
// position. A game lasts while both players stay in their chairs: standing up, leaving
// town or travelling ends it. The snapshot shows every table's game to everyone.
import { chessSeat } from '../preview/src/plaza-salon-plan.js';
import { TABLE_GAMES } from '../preview/src/table-game-adapters.js';

export const MAX_TABLE_MOVES = 1000;
const MOVE_KEY = /^[a-z0-9=x-]{1,24}$/;
const plain = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (message, keys) => Object.keys(message).every(key => keys.includes(key));
const reject = (error, message = error) => ({ ok: false, error, message });

export function createTableGames({ players, tableIds = [], changed = () => {} }) {
  // tableId → { id, kind, moves, seats: [chair 0's id, chair 1's id], sides, result, invite }
  let tables = new Map();
  const seatOf = player => {
    const seat = player?.sitting ? chessSeat(player.sitting.buildId) : null;
    return seat && tableIds.includes(seat.tableId) ? seat : null;
  };
  const occupant = (tableId, chair) => [...players.values()].find(player => { const seat = seatOf(player); return seat?.tableId === tableId && seat.chair === chair; }) ?? null;
  const replay = table => TABLE_GAMES[table.kind].replay(table.moves);
  const outcome = result => result ? { winner: result.winner ?? null, reason: String(result.reason), ...(result.cells ? { cells: [...result.cells] } : {}) } : null;
  const view = table => ({
    id: table.id, kind: table.kind, moves: [...table.moves], players: [...table.seats], sides: [...table.sides], result: plain(table.result),
    invite: table.invite ? { ...table.invite } : null,
  });

  // A game, or an invitation, lasts while its residents stay in their chairs. An ended
  // game stays on the table until both of its players have stood up or a new one starts.
  function prune() {
    let touched = false;
    for (const table of [...tables.values()]) {
      const invite = table.invite;
      if (invite && (occupant(table.id, invite.chair)?.id !== invite.from || occupant(table.id, 1 - invite.chair)?.id !== invite.to)) { table.invite = null; touched = true; }
      if (table.kind && !table.result) {
        const gone = table.seats.findIndex((id, chair) => occupant(table.id, chair)?.id !== id);
        if (gone >= 0) { table.result = { winner: table.sides[1 - gone], reason: 'left the table', left: table.seats[gone] }; touched = true; }
      }
      if (table.kind && table.result && table.seats.every((id, chair) => occupant(table.id, chair)?.id !== id)) {
        Object.assign(table, { kind: null, moves: [], seats: [null, null], sides: [null, null], result: null }); touched = true;
      }
      if (!table.kind && !table.invite) tables.delete(table.id);
    }
    if (touched) changed();
  }

  const tableAt = id => tables.get(id) ?? { id, kind: null, moves: [], seats: [null, null], sides: [null, null], result: null, invite: null };
  const save = table => { tables.set(table.id, table); changed(); return { ok: true, table: view(table) }; };

  function command(player, message, time) {
    if (!record(message) || message.type !== 'tableGame' || typeof message.action !== 'string') return reject('invalid_table_game');
    const seat = seatOf(player);
    if (!seat) return reject('not_at_table', 'Sit at a chess table to play.');
    prune();
    const table = tableAt(seat.tableId), playing = table.kind && !table.result;
    switch (message.action) {
      case 'invite': {
        if (!only(message, ['type', 'action', 'kind', 'side']) || !Object.hasOwn(TABLE_GAMES, message.kind)) return reject('invalid_table_game');
        const adapter = TABLE_GAMES[message.kind], side = message.side ?? adapter.sides[0];
        if (!adapter.sides.includes(side)) return reject('invalid_table_game');
        const opponent = occupant(seat.tableId, 1 - seat.chair);
        if (!opponent) return reject('no_opponent', 'Nobody is sitting across from you.');
        if (playing) return reject('game_in_progress', 'Finish or resign this game first.');
        table.invite = { from: player.id, to: opponent.id, chair: seat.chair, kind: message.kind, side, at: time };
        return save(table);
      }
      case 'accept': {
        if (!only(message, ['type', 'action'])) return reject('invalid_table_game');
        const invite = table.invite;
        if (!invite || invite.to !== player.id) return reject('no_invitation', 'There is no invitation to accept.');
        const adapter = TABLE_GAMES[invite.kind], other = adapter.sides.find(side => side !== invite.side);
        const seats = [null, null], sides = [null, null];
        seats[invite.chair] = invite.from; seats[1 - invite.chair] = player.id;
        sides[invite.chair] = invite.side; sides[1 - invite.chair] = other;
        return save(Object.assign(table, { kind: invite.kind, moves: [], seats, sides, result: null, invite: null, startedAt: time }));
      }
      case 'decline': {
        if (!only(message, ['type', 'action'])) return reject('invalid_table_game');
        if (!table.invite || ![table.invite.from, table.invite.to].includes(player.id)) return reject('no_invitation', 'There is no invitation to decline.');
        table.invite = null;
        return save(table);
      }
      case 'move': {
        if (!only(message, ['type', 'action', 'move']) || typeof message.move !== 'string' || !MOVE_KEY.test(message.move)) return reject('invalid_table_game');
        if (!playing) return reject('no_game', 'There is no game in progress at this table.');
        const chair = table.seats.indexOf(player.id), adapter = TABLE_GAMES[table.kind];
        if (chair < 0) return reject('not_playing', 'Only the two players move.');
        const { state } = replay(table);
        if (adapter.turn(state) !== table.sides[chair]) return reject('not_your_turn', 'Wait for your turn.');
        if (!adapter.moves(state).some(move => move.key === message.move)) return reject('illegal_move', 'That move is not allowed.');
        table.moves.push(message.move);
        table.result = table.moves.length >= MAX_TABLE_MOVES ? { winner: null, reason: 'the move limit' } : outcome(replay(table).result);
        return save(table);
      }
      case 'resign': {
        if (!only(message, ['type', 'action'])) return reject('invalid_table_game');
        const chair = table.seats.indexOf(player.id);
        if (!playing || chair < 0) return reject('no_game', 'There is no game of yours to resign.');
        table.result = { winner: table.sides[1 - chair], reason: 'resigned', resigned: player.id };
        return save(table);
      }
      default: return reject('invalid_table_game');
    }
  }

  // Checkpoints keep each table's game; a restored game must replay move for move.
  const checkpoint = () => [...tables.values()].map(view);
  function validate(saved = []) {
    if (!Array.isArray(saved) || saved.length > tableIds.length) throw new Error('Invalid table games');
    const seen = new Set(), next = [];
    for (const item of saved) {
      if (!record(item) || !only(item, ['id', 'kind', 'moves', 'players', 'sides', 'result', 'invite']) || !tableIds.includes(item.id) || seen.has(item.id)) throw new Error('Invalid table game');
      seen.add(item.id);
      const id = value => value === null || (typeof value === 'string' && value.length > 0 && value.length <= 128);
      if (!Array.isArray(item.players) || item.players.length !== 2 || !item.players.every(id) || !Array.isArray(item.sides) || item.sides.length !== 2) throw new Error('Invalid table seats');
      const table = { id: item.id, kind: item.kind, moves: [], seats: [...item.players], sides: [...item.sides], result: null, invite: null };
      if (item.kind !== null) {
        const adapter = TABLE_GAMES[item.kind];
        if (!Object.hasOwn(TABLE_GAMES, item.kind) || !Array.isArray(item.moves) || item.moves.length > MAX_TABLE_MOVES || !item.moves.every(move => typeof move === 'string' && MOVE_KEY.test(move))) throw new Error('Invalid table moves');
        if ([...item.sides].sort().join() !== [...adapter.sides].sort().join() || !item.players.every(Boolean)) throw new Error('Invalid table sides');
        table.moves = [...item.moves];
        if (replay(table).played.length !== item.moves.length) throw new Error('Unplayable table game');
        if (item.result !== null && (!record(item.result) || typeof item.result.reason !== 'string' || ![null, ...adapter.sides].includes(item.result.winner ?? null))) throw new Error('Invalid table result');
        table.result = plain(item.result);
      } else if (item.moves?.length || item.result !== null || item.players.some(Boolean)) throw new Error('Invalid empty table');
      if (item.invite !== null) {
        const invite = item.invite;
        if (!record(invite) || !only(invite, ['from', 'to', 'chair', 'kind', 'side', 'at']) || !id(invite.from) || !id(invite.to) || ![0, 1].includes(invite.chair)
          || !Object.hasOwn(TABLE_GAMES, invite.kind) || !TABLE_GAMES[invite.kind].sides.includes(invite.side) || !Number.isFinite(invite.at)) throw new Error('Invalid table invitation');
        table.invite = { ...invite };
      }
      next.push(table);
    }
    return next;
  }
  const load = list => { tables = new Map(list.map(table => [table.id, table])); };
  const clear = () => { if (tables.size) { tables.clear(); changed(); } };
  const snapshot = () => [...tables.values()].filter(table => table.kind || table.invite).map(view);

  return { command, prune, snapshot, checkpoint, validate, load, clear };
}
