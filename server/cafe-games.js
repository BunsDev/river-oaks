// Shared games at the café round table: two residents seated across from each
// other play dominoes, and the town deals and holds the round. Unlike the chess
// tables (table-games.js), a dominoes round has hidden information: the hands,
// the boneyard and the seed, and a draw takes a tile nobody else may learn. So
// the town keeps the real state from dominoes-rules.js, publishes only the
// public view in the snapshot, and hands each player their own tiles through
// the reply to a `hand` command, which reaches that sender alone. Invitations,
// leaving a chair, checkpoints and reset follow the chess tables.
import { randomInt } from 'node:crypto';
import { cafeSeat } from '../preview/src/plaza-salon-plan.js';
import { MATCH_POINTS, findMove, legalMoves, makeMove, notation, replay, startRound } from '../preview/src/dominoes-rules.js';

export const TABLE_ID = 'round', CHAIRS = 4, MAX_ROUND_MOVES = 200, MAX_ROUNDS = 100;
const MOVE_TEXT = /^(L:[0-6]-[0-6]|R:[0-6]-[0-6]|draw|pass)$/;
const plain = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (message, keys) => Object.keys(message).every(key => keys.includes(key));
const reject = (error, message = error) => ({ ok: false, error, message });
const across = chair => (chair + 2) % CHAIRS;

export function createCafeGames({ players, changed = () => {}, now = Date.now, random = () => randomInt(2 ** 31) }) {
  // { id, kind, seats: [inviter's chair, the chair across], players: [ids], invite, round, moves, scores, version, result, startedAt }
  let table = null;
  const seatOf = player => player?.sitting ? cafeSeat(player.sitting.buildId) : null;
  const occupant = chair => [...players.values()].find(player => seatOf(player)?.chair === chair) ?? null;
  const playing = () => Boolean(table?.round && !table.result);
  const lastMove = () => {
    const text = table.moves.at(-1); if (!text) return null;
    const { played } = replay(table.round.seed, 2, table.moves), move = played.at(-1);
    return move.kind === 'play' ? { player: move.player, kind: 'play', tile: move.tile, end: move.end } : { player: move.player, kind: move.kind };
  };
  // What the whole plaza may see: never a hand, the seed or the move list.
  const view = () => {
    const { round } = table;
    return {
      id: TABLE_ID, kind: table.kind, players: [...table.players], sides: [...table.seats], invite: table.invite ? { ...table.invite } : null,
      turn: round?.turn ?? null, line: round ? round.line.map(tile => ({ ...tile })) : [], lead: round?.lead ?? null,
      leadIndex: round ? Math.max(0, round.line.findIndex(tile => tile.tile === round.lead)) : 0,
      sizes: round ? round.hands.map(hand => hand.length) : [0, 0], boneyard: round?.boneyard.length ?? 0, passes: round?.passes ?? 0,
      lastMove: round ? lastMove() : null, result: plain(table.result), scores: [...table.scores], version: table.version,
    };
  };
  const bump = () => { table.version += 1; changed(); };
  const deal = time => { table.round = startRound(random(), 2); table.moves = []; table.result = null; table.startedAt = time; };
  const settle = () => {
    const over = table.round.over; if (!over) return;
    if (over.winner !== null) table.scores[over.winner] += over.points;
    table.result = { winner: over.winner, reason: over.reason, points: over.points, ...(Math.max(...table.scores) >= MATCH_POINTS ? { match: true } : {}) };
  };

  // A round, or an invitation, lasts while both residents stay in their chairs. An
  // ended round stays on the table until both have stood up or a new invitation starts.
  function prune() {
    if (!table) return;
    let touched = false;
    const invite = table.invite;
    if (invite && (occupant(invite.chair)?.id !== invite.from || occupant(across(invite.chair))?.id !== invite.to)) { table.invite = null; touched = true; }
    if (table.kind && !table.result) {
      const gone = table.seats.findIndex((chair, index) => occupant(chair)?.id !== table.players[index]);
      if (gone >= 0) { table.result = { winner: 1 - gone, reason: 'left the table', left: table.players[gone] }; touched = true; }
    }
    if (table.kind && table.result && table.seats.every((chair, index) => occupant(chair)?.id !== table.players[index])) { table = null; changed(); return; }
    if (!table.kind && !table.invite) { table = null; changed(); return; }
    if (touched) bump();
  }

  function command(player, message, time) {
    if (!record(message) || message.type !== 'tableGame' || typeof message.action !== 'string') return reject('invalid_table_game');
    const seat = seatOf(player);
    if (!seat) return reject('not_at_table', 'Sit at the café table to play.');
    prune();
    const mine = () => table?.kind ? table.players.indexOf(player.id) : -1;
    switch (message.action) {
      case 'invite': {
        if (!only(message, ['type', 'action', 'kind']) || message.kind !== 'dominoes') return reject('invalid_table_game');
        const opponent = occupant(across(seat.chair));
        if (!opponent) return reject('no_opponent', 'Nobody is sitting across from you.');
        if (playing()) return reject('game_in_progress', 'Finish or resign this round first.');
        if (table?.invite) return reject('invite_pending', 'An invitation is already open at this table.');
        table = { id: TABLE_ID, kind: null, seats: [null, null], players: [null, null], invite: { from: player.id, to: opponent.id, chair: seat.chair, kind: 'dominoes', at: time }, round: null, moves: [], scores: [0, 0], version: table?.version ?? 0, result: null, startedAt: null };
        bump(); return { ok: true, table: view() };
      }
      case 'accept': {
        if (!only(message, ['type', 'action'])) return reject('invalid_table_game');
        const invite = table?.invite;
        if (!invite || invite.to !== player.id) return reject('not_invited', 'There is no invitation to accept.');
        // A match starts its version count at the first deal, so clients read 1 as a fresh round.
        Object.assign(table, { kind: 'dominoes', seats: [invite.chair, across(invite.chair)], players: [invite.from, player.id], invite: null, scores: [0, 0], version: 0 });
        deal(time); bump(); return { ok: true, table: view() };
      }
      case 'decline': {
        if (!only(message, ['type', 'action'])) return reject('invalid_table_game');
        if (!table?.invite || ![table.invite.from, table.invite.to].includes(player.id)) return reject('not_invited', 'There is no invitation to decline.');
        table.invite = null; prune(); if (table) bump(); return { ok: true, table: table ? view() : null };
      }
      case 'hand': {
        if (!only(message, ['type', 'action'])) return reject('invalid_table_game');
        const index = mine();
        if (index < 0 || !table.round) return reject('no_round', 'You are not in a round at this table.');
        const legal = !table.result && table.round.turn === index ? legalMoves(table.round).map(notation) : [];
        return { ok: true, hand: table.round.hands[index].slice(), legal, version: table.version };
      }
      case 'move': {
        if (!only(message, ['type', 'action', 'move']) || typeof message.move !== 'string' || message.move.length > 12 || !MOVE_TEXT.test(message.move)) return reject('invalid_table_game');
        const index = mine();
        if (!playing() || index < 0) return reject('no_round', 'There is no round of yours in progress.');
        if (table.round.turn !== index) return reject('not_your_turn', 'Wait for your turn.');
        const move = findMove(table.round, message.move);
        if (!move) return reject('illegal_move', 'That move is not allowed.');
        if (table.moves.length >= MAX_ROUND_MOVES) return reject('illegal_move', 'This round has gone on too long.');
        table.round = makeMove(table.round, move); table.moves.push(message.move); settle(); bump();
        return { ok: true, table: view() };
      }
      case 'resign': {
        if (!only(message, ['type', 'action'])) return reject('invalid_table_game');
        const index = mine();
        if (!playing() || index < 0) return reject('no_round', 'There is no round of yours to resign.');
        table.result = { winner: 1 - index, reason: 'resigned', resigned: player.id, match: true }; bump();
        return { ok: true, table: view() };
      }
      case 'next': {
        if (!only(message, ['type', 'action'])) return reject('invalid_table_game');
        const index = mine();
        if (index < 0 || !table.result) return reject('no_round', 'There is no finished round to follow.');
        if (table.result.match) return reject('match_over', 'This match is over. Invite again for a new one.');
        deal(time); bump(); return { ok: true, table: view() };
      }
      default: return reject('invalid_table_game');
    }
  }

  // The checkpoint keeps the whole round (seed, hands, moves); a restored round must
  // replay from its seed and moves to exactly the saved state.
  const checkpoint = () => table ? [plain({ ...table, invite: table.invite ? { ...table.invite } : null })] : [];
  function validate(saved = []) {
    if (!Array.isArray(saved) || saved.length > 1) throw new Error('Invalid cafe game');
    if (!saved.length) return null;
    const item = saved[0];
    const id = value => value === null || (typeof value === 'string' && value.length > 0 && value.length <= 128);
    const chair = value => value === null || [0, 1, 2, 3].includes(value);
    if (!record(item) || !only(item, ['id', 'kind', 'seats', 'players', 'invite', 'round', 'moves', 'scores', 'version', 'result', 'startedAt'])
      || item.id !== TABLE_ID || ![null, 'dominoes'].includes(item.kind) || !Array.isArray(item.seats) || item.seats.length !== 2 || !item.seats.every(chair)
      || !Array.isArray(item.players) || item.players.length !== 2 || !item.players.every(id) || !Array.isArray(item.scores) || item.scores.length !== 2
      || !item.scores.every(score => Number.isInteger(score) && score >= 0 && score <= 10000) || !Number.isInteger(item.version) || item.version < 0 || item.version > 1e9
      || !Array.isArray(item.moves) || item.moves.length > MAX_ROUND_MOVES || !item.moves.every(move => typeof move === 'string' && MOVE_TEXT.test(move))) throw new Error('Invalid cafe game');
    if (item.kind === 'dominoes') {
      if (!item.players.every(Boolean) || !item.seats.every(value => value !== null) || item.seats[1] !== across(item.seats[0]) || !record(item.round)) throw new Error('Invalid cafe game');
      if (!Number.isInteger(item.round.seed) || item.round.seed < 0) throw new Error('Invalid cafe game');
      let state; try { state = replay(item.round.seed, 2, item.moves).state; } catch { throw new Error('Invalid cafe game'); }
      if (JSON.stringify(state) !== JSON.stringify(item.round)) throw new Error('Invalid cafe game');
      if (item.result !== null && (!record(item.result) || typeof item.result.reason !== 'string' || ![null, 0, 1].includes(item.result.winner ?? null))) throw new Error('Invalid cafe game');
    } else if (item.round !== null || item.moves.length || item.result !== null || item.players.some(Boolean)) throw new Error('Invalid cafe game');
    if (item.invite !== null) {
      const invite = item.invite;
      if (!record(invite) || !only(invite, ['from', 'to', 'chair', 'kind', 'at']) || !id(invite.from) || !id(invite.to) || !invite.from || !invite.to
        || ![0, 1, 2, 3].includes(invite.chair) || invite.kind !== 'dominoes' || !Number.isFinite(invite.at)) throw new Error('Invalid cafe game');
    }
    return plain(item);
  }
  const load = item => { table = item ? plain(item) : null; };
  const clear = () => { if (table) { table = null; changed(); } };
  const snapshot = () => table && (table.kind || table.invite) ? [view()] : [];

  return { command, prune, snapshot, checkpoint, validate, load, clear };
}
