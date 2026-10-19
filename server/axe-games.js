// Shared axe throwing at the lanes of the unbranded axe-and-darts room (Val, 2026-10-15).
// Whoever stands in a lane's throwing box plays there: alone against the house thrower,
// or two players who agree to a match of ten throws each (preview/src/axe-rules.js).
// A client sends only its release (across, and the throw's speed); the server takes the
// thrower's real distance to the target from where they stand, adds the hand's error
// from its own random source and flies the axe (axe-rules.js axeThrow): the flight sets the
// height and the distance sets the rotation, so whether it sticks is the server's, and a
// bounce tells the thrower which way to step. The house thrower throws here too, from
// the ideal distance and a seed the server chose. Every lane's
// match is in the snapshot. A match ends after the last throw, a resignation, or when
// one of its players leaves the lane. The same shape as server/darts-games.js.
import { randomInt } from 'node:crypto';
import { AXE_HAND, AXE_THROW, axeSpeedFor, axeThrow, replay, validAxeRelease } from '../preview/src/axe-rules.js';
import { seededRandom } from '../preview/src/seeded-random.js';

export const AXE_HOUSE = 'house';
// A fair recreational hand across, in millimetres (axe-rules.js AXE_HAND); the house thrower's own.
export const AXE_SCATTER = AXE_HAND.across, HOUSE_HAND = { across: 60, speed: 0.16 };
// The widest release across the target: wider is not a throw. Stored landings stay within twice the board.
export const AXE_AIM = AXE_THROW.across;
export const MAX_AXES = 200;

const only = (message, keys) => Object.keys(message).every(key => keys.includes(key));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const point = (value, limit) => Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit);
const reject = (error, message = error) => ({ ok: false, error, message });
// A unit-variance logistic draw from u in (0, 1): zero at 0.5.
const spread = u => Math.log(u / (1 - u)) * .5513;
const tenth = n => Math.round(n * 10) / 10;

// distanceTo(player, laneId): the thrower's distance to that lane's target, in metres.
export function createAxeGames({ players, laneIds = [], atLane = () => null, distanceTo = () => AXE_THROW.ideal, changed = () => {}, random = () => randomInt(1, 2 ** 32) / 2 ** 32 }) {
  // laneId → { id, players: [id, id | 'house'] | null, throws: [{ point, stuck }], result, invite: { from, to } | null, seed }
  let lanes = new Map();
  const laneFor = laneId => lanes.get(laneId) ?? { id: laneId, players: null, throws: [], result: null, invite: null, seed: null };
  const state = lane => replay(lane.throws, 2).state;
  const playing = lane => Boolean(lane.players) && lane.result === null;
  const here = (playerId, laneId) => playerId === AXE_HOUSE || (players.get(playerId) && atLane(players.get(playerId)) === laneId);
  const view = lane => {
    const game = lane.players ? state(lane) : null;
    return { id: lane.id, players: lane.players ? [...lane.players] : null, throws: lane.throws.map(item => ({ point: [...item.point], stuck: item.stuck })),
      scores: game ? [...game.scores] : null, turn: game ? game.turn : null, result: lane.result ? { ...lane.result } : null, invite: lane.invite ? { ...lane.invite } : null };
  };
  const save = lane => { lanes.set(lane.id, lane); changed(); return { ok: true, axes: view(lane) }; };
  const start = (lane, pair, seed = null) => Object.assign(lane, { players: pair, throws: [], result: null, invite: null, seed });
  const outcome = game => game.winner !== null ? { winner: game.winner, reason: 'final' } : game.draw ? { winner: null, reason: 'draw' } : null;

  // The house throws for the bull from the ideal distance with a seeded hand whenever the turn is its own.
  function houseTurn(lane) {
    for (let game = state(lane); lane.players[1] === AXE_HOUSE && game.turn === 1 && !outcome(game); game = state(lane)) {
      const next = seededRandom((Math.imul(lane.seed >>> 0, 0x27d4eb2f) ^ Math.imul(lane.throws.length + 1, 0x165667b1)) >>> 0);
      const { point, stuck } = axeThrow([0, axeSpeedFor(0, AXE_THROW.ideal)], AXE_THROW.ideal, [spread(next()), spread(next()), spread(next()), next()], HOUSE_HAND);
      lane.throws.push({ point, stuck });
    }
  }

  function command(player, message) {
    if (!record(message) || !laneIds.includes(message.laneId)) return reject('invalid_axes');
    const laneId = message.laneId, lane = laneFor(laneId), atThis = atLane(player) === laneId;
    switch (message.action) {
      case 'practice': {
        if (!only(message, ['type', 'action', 'laneId'])) return reject('invalid_axes');
        if (!atThis) return reject('not_at_lane', 'Step into the lane first.');
        if (playing(lane) && !lane.players.includes(player.id)) return reject('lane_busy', 'A match is on in this lane.');
        return save(start(lane, [player.id, AXE_HOUSE], Math.floor(random() * 2 ** 32) >>> 0));
      }
      case 'invite': {
        if (!only(message, ['type', 'action', 'laneId', 'peerId']) || !id(message.peerId) || message.peerId === player.id) return reject('invalid_axes');
        if (!atThis) return reject('not_at_lane', 'Step into the lane first.');
        if (message.peerId === AXE_HOUSE || !here(message.peerId, laneId)) return reject('peer_not_at_lane', 'They need to be in the lane too.');
        if (playing(lane) && !(lane.players.includes(player.id) && lane.players[1] === AXE_HOUSE)) return reject('lane_busy', 'A match is on in this lane.');
        lane.invite = { from: player.id, to: message.peerId };
        return save(lane);
      }
      case 'accept': case 'decline': {
        if (!only(message, ['type', 'action', 'laneId'])) return reject('invalid_axes');
        if (lane.invite?.to !== player.id) return reject('no_invitation', 'There is no invitation for you here.');
        if (message.action === 'decline') { lane.invite = null; return save(lane); }
        if (!atThis || !here(lane.invite.from, laneId)) { lane.invite = null; save(lane); return reject('peer_not_at_lane', 'You both need to be in the lane.'); }
        return save(start(lane, [lane.invite.from, player.id]));
      }
      case 'throw': {
        if (!only(message, ['type', 'action', 'laneId', 'release']) || !validAxeRelease(message.release)) return reject('invalid_axes');
        const chair = lane.players?.indexOf(player.id) ?? -1;
        if (chair < 0) return reject('not_playing', 'Start or join a match first.');
        if (lane.result) return reject('match_over', 'This match is over.');
        if (!atThis) return reject('not_at_lane', 'Step into the lane first.');
        if (state(lane).turn !== chair) return reject('not_your_turn', 'Wait for your turn.');
        const distance = distanceTo(player, laneId);
        if (!Number.isFinite(distance)) return reject('not_at_lane', 'Step into the lane first.');
        const flown = axeThrow(message.release, distance, [spread(random()), spread(random()), spread(random()), random()]);
        const thrown = lane.throws.push({ point: flown.point, stuck: flown.stuck }) - 1;
        lane.result = outcome(state(lane));
        if (!lane.result) { houseTurn(lane); lane.result = outcome(state(lane)); }
        // How the axe turned is the thrower's feedback, not part of the match record, and
        // `thrown` names the thrower's own axe in the reply, ahead of any house throws.
        return { ...save(lane), thrown, rotation: flown.rotation, distance: tenth(distance * 100) / 100 };
      }
      case 'resign': {
        if (!only(message, ['type', 'action', 'laneId'])) return reject('invalid_axes');
        const chair = lane.players?.indexOf(player.id) ?? -1;
        if (chair < 0 || lane.result) return reject('not_playing', 'There is no match of yours to resign.');
        lane.result = { winner: 1 - chair, reason: 'resigned' };
        return save(lane);
      }
      default: return reject('invalid_axes');
    }
  }

  function prune() {
    let touched = false;
    for (const lane of lanes.values()) {
      if (lane.invite && !(here(lane.invite.from, lane.id) && here(lane.invite.to, lane.id))) { lane.invite = null; touched = true; }
      if (lane.players && lane.result === null) {
        const gone = lane.players.findIndex(playerId => !here(playerId, lane.id));
        if (gone >= 0) { lane.result = { winner: 1 - gone, reason: 'left the lane' }; touched = true; }
      }
      if (lane.players && lane.result && lane.players.every(playerId => playerId === AXE_HOUSE || !here(playerId, lane.id))) {
        Object.assign(lane, { players: null, throws: [], result: null, seed: null }); touched = true;
      }
      if (!lane.players && !lane.invite) { lanes.delete(lane.id); touched = true; }
    }
    if (touched) changed();
  }

  const checkpoint = () => [...lanes.values()].map(lane => ({ id: lane.id, players: lane.players ? [...lane.players] : null,
    throws: lane.throws.map(item => ({ point: [...item.point], stuck: item.stuck })), result: lane.result ? { ...lane.result } : null, invite: lane.invite ? { ...lane.invite } : null, seed: lane.seed }));
  function validate(saved = []) {
    if (!Array.isArray(saved) || saved.length > laneIds.length) throw new Error('Invalid axe lanes');
    const seen = new Set(), next = [];
    for (const item of saved) {
      if (!record(item) || !only(item, ['id', 'players', 'throws', 'result', 'invite', 'seed']) || !laneIds.includes(item.id) || seen.has(item.id)) throw new Error('Invalid axe lane');
      seen.add(item.id);
      const lane = { id: item.id, players: null, throws: [], result: null, invite: null, seed: null };
      if (item.players !== null) {
        const [first, second] = item.players ?? [];
        if (!Array.isArray(item.players) || item.players.length !== 2 || !id(first) || first === AXE_HOUSE || !id(second) || first === second) throw new Error('Invalid axe players');
        const house = second === AXE_HOUSE;
        if (house ? !(Number.isInteger(item.seed) && item.seed >= 0 && item.seed < 2 ** 32) : item.seed !== null) throw new Error('Invalid axe seed');
        if (!Array.isArray(item.throws) || item.throws.length > MAX_AXES
          || !item.throws.every(entry => record(entry) && only(entry, ['point', 'stuck']) && point(entry.point, AXE_AIM * 2) && typeof entry.stuck === 'boolean')) throw new Error('Invalid axe throws');
        let game;
        try { game = replay(item.throws, 2).state; } catch { throw new Error('Unplayable axe match'); }
        const derived = outcome(game), result = item.result;
        const ok = derived ? record(result) && only(result, ['winner', 'reason']) && result.winner === derived.winner && result.reason === derived.reason
          : result === null || record(result) && only(result, ['winner', 'reason']) && [0, 1].includes(result.winner) && ['resigned', 'left the lane'].includes(result.reason);
        if (!ok) throw new Error('Invalid axe result');
        Object.assign(lane, { players: [first, second], throws: item.throws.map(entry => ({ point: [...entry.point], stuck: entry.stuck })), result: result ? { ...result } : null, seed: house ? item.seed : null });
      } else if (item.throws?.length || item.result !== null || item.seed !== null) throw new Error('Invalid empty axe lane');
      if (item.invite !== null) {
        if (!record(item.invite) || !only(item.invite, ['from', 'to']) || !id(item.invite.from) || !id(item.invite.to) || item.invite.from === item.invite.to) throw new Error('Invalid axe invitation');
        lane.invite = { ...item.invite };
      }
      if (!lane.players && !lane.invite) throw new Error('Invalid empty axe lane');
      next.push(lane);
    }
    return next;
  }
  const load = list => { lanes = new Map(list.map(lane => [lane.id, lane])); };
  const clear = () => { if (lanes.size) { lanes.clear(); changed(); } };
  const snapshot = () => [...lanes.values()].map(view);

  return { command, prune, snapshot, checkpoint, validate, load, clear };
}
