// Shared darts at a throwing line (the IPIC Tuck Room board; Val, 2026-10-15). Whoever
// stands at the line plays: alone against the house regular, or two players who agree
// to a match, three darts a turn, 501 double out (preview/src/darts-rules.js). A client
// sends only its release (across, and the hand's acceleration); the server adds the
// hand's error from its own random source and flies the dart (throwLanding), keeping
// the landing point, so no client can place a dart. The house
// regular throws here too, from a seed the server chose. Every line's match is in the
// snapshot for everyone. A match ends at a checkout, a resignation, or when one of its
// players leaves the line (walking off, sitting, travelling or leaving town).
import { randomInt } from 'node:crypto';
import { HAND, THROW, handDraw, replay, throwLanding, validRelease } from '../preview/src/darts-rules.js';
import { throwPoint } from '../preview/src/darts-opponent.js';

export const DARTS_REGULAR = 'regular';
// A decent pub hand: the release direction's error across, in millimetres (the regular's
// own wobble is 24); its speed error drops a slow dart further (darts-rules.js HAND).
export const DARTS_SCATTER = HAND.across;
// The widest release across the board: wider is not a throw.
export const DARTS_AIM = THROW.across;
export const MAX_DARTS = 600;
const LANDING = 400;

const only = (message, keys) => Object.keys(message).every(key => keys.includes(key));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const point = (value, limit) => Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit);
const reject = (error, message = error) => ({ ok: false, error, message });
const tenth = n => Math.round(n * 10) / 10;

export function createDartsGames({ players, lineIds = [], atLine = () => null, changed = () => {}, random = () => randomInt(1, 2 ** 32) / 2 ** 32 }) {
  // lineId → { id, players: [id, id | 'regular'] | null, points, result, invite: { from, to } | null, seed }
  let lines = new Map();
  const lineFor = lineId => lines.get(lineId) ?? { id: lineId, players: null, points: [], result: null, invite: null, seed: null };
  const state = line => replay(line.points, 2).state;
  const playing = line => Boolean(line.players) && line.result === null;
  const here = (playerId, lineId) => playerId === DARTS_REGULAR || (players.get(playerId) && atLine(players.get(playerId)) === lineId);
  const view = line => {
    const game = line.players ? state(line) : null;
    return { id: line.id, players: line.players ? [...line.players] : null, points: line.points.map(p => [...p]),
      scores: game ? [...game.scores] : null, turn: game ? game.turn : null, result: line.result ? { ...line.result } : null,
      invite: line.invite ? { ...line.invite } : null };
  };
  const save = line => { lines.set(line.id, line); changed(); return { ok: true, darts: view(line) }; };
  const start = (line, pair, seed = null) => Object.assign(line, { players: pair, points: [], result: null, invite: null, seed });

  // The regular throws its whole turn as soon as the turn is its own.
  function houseTurn(line) {
    for (let game = state(line); line.players[1] === DARTS_REGULAR && game.turn === 1 && game.winner === null; game = state(line)) {
      const [x, y] = throwPoint(game, line.seed);
      line.points.push([tenth(x), tenth(y)]);
    }
  }
  function settle(line) {
    const game = state(line);
    if (game.winner !== null) line.result = { winner: game.winner, reason: 'checkout' };
    else if (line.points.length >= MAX_DARTS) line.result = { winner: null, reason: 'too many darts' };
  }

  function command(player, message) {
    if (!record(message) || !lineIds.includes(message.lineId)) return reject('invalid_darts');
    const lineId = message.lineId, line = lineFor(lineId), atThis = atLine(player) === lineId;
    switch (message.action) {
      case 'practice': {
        if (!only(message, ['type', 'action', 'lineId'])) return reject('invalid_darts');
        if (!atThis) return reject('not_at_line', 'Stand at the throwing line first.');
        if (playing(line) && !line.players.includes(player.id)) return reject('line_busy', 'A match is on at this board.');
        return save(start(line, [player.id, DARTS_REGULAR], Math.floor(random() * 2 ** 32) >>> 0));
      }
      case 'invite': {
        if (!only(message, ['type', 'action', 'lineId', 'peerId']) || !id(message.peerId) || message.peerId === player.id) return reject('invalid_darts');
        if (!atThis) return reject('not_at_line', 'Stand at the throwing line first.');
        if (!here(message.peerId, lineId) || message.peerId === DARTS_REGULAR) return reject('peer_not_at_line', 'They need to be at the line too.');
        if (playing(line) && !(line.players.includes(player.id) && line.players[1] === DARTS_REGULAR)) return reject('line_busy', 'A match is on at this board.');
        line.invite = { from: player.id, to: message.peerId };
        return save(line);
      }
      case 'accept': case 'decline': {
        if (!only(message, ['type', 'action', 'lineId'])) return reject('invalid_darts');
        if (line.invite?.to !== player.id) return reject('no_invitation', 'There is no invitation for you here.');
        if (message.action === 'decline') { line.invite = null; return save(line); }
        if (!atThis || !here(line.invite.from, lineId)) { line.invite = null; save(line); return reject('peer_not_at_line', 'You both need to be at the line.'); }
        return save(start(line, [line.invite.from, player.id]));
      }
      case 'throw': {
        if (!only(message, ['type', 'action', 'lineId', 'release']) || !validRelease(message.release)) return reject('invalid_darts');
        const chair = line.players?.indexOf(player.id) ?? -1;
        if (chair < 0) return reject('not_playing', 'Start or join a match first.');
        if (line.result) return reject('match_over', 'This match is over.');
        if (!atThis) return reject('not_at_line', 'Stand at the throwing line first.');
        if (state(line).turn !== chair) return reject('not_your_turn', 'Wait for your turn.');
        const [x, y] = throwLanding(message.release, [handDraw(random()), handDraw(random())], HAND, LANDING);
        const thrown = line.points.push([tenth(x), tenth(y)]) - 1;
        settle(line);
        if (!line.result) { houseTurn(line); settle(line); }
        // `thrown` names the thrower's own dart in the reply, ahead of any the regular throws.
        return { ...save(line), thrown };
      }
      case 'resign': {
        if (!only(message, ['type', 'action', 'lineId'])) return reject('invalid_darts');
        const chair = line.players?.indexOf(player.id) ?? -1;
        if (chair < 0 || line.result) return reject('not_playing', 'There is no match of yours to resign.');
        line.result = { winner: 1 - chair, reason: 'resigned' };
        return save(line);
      }
      default: return reject('invalid_darts');
    }
  }

  // A match ends when one of its players has left the line; the line clears once
  // nobody from it is there. An invitation lapses when either side leaves.
  function prune() {
    let touched = false;
    for (const line of lines.values()) {
      if (line.invite && !(here(line.invite.from, line.id) && here(line.invite.to, line.id))) { line.invite = null; touched = true; }
      if (line.players && line.result === null) {
        const gone = line.players.findIndex(playerId => !here(playerId, line.id));
        if (gone >= 0) { line.result = { winner: 1 - gone, reason: 'left the line' }; touched = true; }
      }
      if (line.players && line.result && line.players.every(playerId => playerId === DARTS_REGULAR || !here(playerId, line.id))) {
        Object.assign(line, { players: null, points: [], result: null, seed: null }); touched = true;
      }
      if (!line.players && !line.invite) { lines.delete(line.id); touched = true; }
    }
    if (touched) changed();
  }

  // Checkpoints keep each line's match; a restored match must replay dart for dart.
  const checkpoint = () => [...lines.values()].map(line => ({ id: line.id, players: line.players ? [...line.players] : null,
    points: line.points.map(p => [...p]), result: line.result ? { ...line.result } : null, invite: line.invite ? { ...line.invite } : null, seed: line.seed }));
  function validate(saved = []) {
    if (!Array.isArray(saved) || saved.length > lineIds.length) throw new Error('Invalid darts lines');
    const seen = new Set(), next = [];
    for (const item of saved) {
      if (!record(item) || !only(item, ['id', 'players', 'points', 'result', 'invite', 'seed']) || !lineIds.includes(item.id) || seen.has(item.id)) throw new Error('Invalid darts line');
      seen.add(item.id);
      const line = { id: item.id, players: null, points: [], result: null, invite: null, seed: null };
      if (item.players !== null) {
        const [first, second] = item.players ?? [];
        if (!Array.isArray(item.players) || item.players.length !== 2 || !id(first) || first === DARTS_REGULAR || !id(second) || first === second) throw new Error('Invalid darts players');
        const house = second === DARTS_REGULAR;
        if (house ? !(Number.isInteger(item.seed) && item.seed >= 0 && item.seed < 2 ** 32) : item.seed !== null) throw new Error('Invalid darts seed');
        if (!Array.isArray(item.points) || item.points.length > MAX_DARTS || !item.points.every(p => point(p, LANDING))) throw new Error('Invalid darts points');
        let game;
        try { game = replay(item.points, 2).state; } catch { throw new Error('Unplayable darts match'); }
        const result = item.result;
        if (game.winner !== null ? !(record(result) && only(result, ['winner', 'reason']) && result.winner === game.winner && result.reason === 'checkout')
          : result !== null && !(record(result) && only(result, ['winner', 'reason']) && ([0, 1].includes(result.winner) && ['resigned', 'left the line'].includes(result.reason)
            || result.winner === null && result.reason === 'too many darts' && item.points.length >= MAX_DARTS))) throw new Error('Invalid darts result');
        Object.assign(line, { players: [first, second], points: item.points.map(p => [...p]), result: result ? { ...result } : null, seed: house ? item.seed : null });
      } else if (item.points?.length || item.result !== null || item.seed !== null) throw new Error('Invalid empty darts line');
      if (item.invite !== null) {
        if (!record(item.invite) || !only(item.invite, ['from', 'to']) || !id(item.invite.from) || !id(item.invite.to) || item.invite.from === item.invite.to) throw new Error('Invalid darts invitation');
        line.invite = { ...item.invite };
      }
      if (!line.players && !line.invite) throw new Error('Invalid empty darts line');
      next.push(line);
    }
    return next;
  }
  const load = list => { lines = new Map(list.map(line => [line.id, line])); };
  const clear = () => { if (lines.size) { lines.clear(); changed(); } };
  // Account erasure: a match or an invitation the account was part of is cleared.
  const forget = userId => {
    let touched = false;
    for (const item of [...lines.values()]) if (item.players?.includes(userId) || item.invite?.from === userId || item.invite?.to === userId) { lines.delete(item.id); touched = true; }
    if (touched) changed();
  };
  // Player blocking (#292): an open invitation between the two ends; a game stays.
  const separate = (a, b) => {
    let touched = false;
    for (const item of [...lines.values()]) if (item.invite && [a, b].includes(item.invite.from) && [a, b].includes(item.invite.to)) {
      if (item.players) item.invite = null; else lines.delete(item.id);
      touched = true;
    }
    if (touched) changed();
    return touched;
  };
  const snapshot = () => [...lines.values()].map(view);

  return { command, prune, forget, separate, snapshot, checkpoint, validate, load, clear };
}
