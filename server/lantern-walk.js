// The Lantern Walk: Bayou Market Commons' shared activity (#586). Five lanterns
// stand around the destination (shared/commons-destination.js). Anyone on foot
// beside an unlit lantern lights it; when every lantern is lit the Bayou Lantern
// tower lights for the whole town and the round's time and lamplighters are kept.
// Lighting together is faster, so groups split up and meet again at the tower.
// The server decides reach and timing; a client only names the lantern.
import { LANTERN_REACH } from '../shared/commons-destination.js';
export { LANTERN_REACH };
// An unfinished round goes dark after five quiet minutes; a finished one stays
// lit for ninety seconds before the next round can start.
export const LANTERN_IDLE_MS = 5 * 60_000, LANTERN_CELEBRATION_MS = 90_000;
const MAX_NAME = 80;

const only = (message, keys) => Object.keys(message).every(key => keys.includes(key));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 128) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const time = value => Number.isFinite(value) && value >= 0;
const reject = (error, message = error) => ({ ok: false, error, message });

export function createLanternWalk({ lanterns = [], changed = () => {}, now = Date.now }) {
  const byId = new Map(lanterns.map(lantern => [lantern.id, lantern]));
  // round: { startedAt, lastAt, completedAt, lit: Map<lanternId, { by, name, at }> } | null
  let round = null, best = null, rounds = 0;
  const onFoot = player => !player.sitting && !player.vehicle && !player.performing && (player.altitude ?? 0) <= .1 && (player.levelId ?? null) === null;
  const reach = (player, lantern) => Math.hypot(player.position[0] - lantern.at[0], player.position[1] - lantern.at[1]);

  function view() {
    return {
      lanterns: lanterns.map(lantern => { const lit = round?.lit.get(lantern.id); return { id: lantern.id, name: lantern.name, lit: Boolean(lit), by: lit ? lit.name : null }; }),
      round: round ? { startedAt: round.startedAt, completedAt: round.completedAt, seconds: round.completedAt ? (round.completedAt - round.startedAt) / 1000 : null,
        lamplighters: [...new Set([...round.lit.values()].map(item => item.name))] } : null,
      best: best ? { seconds: best.seconds, lamplighters: [...best.lamplighters], at: best.at } : null, rounds,
    };
  }

  function command(player, message) {
    if (!record(message) || !only(message, ['type', 'action', 'lanternId']) || message.action !== 'light' || !byId.has(message.lanternId)) return reject('invalid_lantern');
    const lantern = byId.get(message.lanternId), at = now();
    prune(at);
    if (!onFoot(player)) return reject('not_on_foot', 'Walk up to the lantern to light it.');
    if (reach(player, lantern) > LANTERN_REACH) return reject('lantern_out_of_reach', 'Step closer to the lantern.');
    if (round?.completedAt) return reject('round_complete', 'The Bayou Lantern is lit. A new round starts soon.');
    if (round?.lit.has(lantern.id)) return reject('already_lit', 'This lantern is already lit.');
    round ??= { startedAt: at, lastAt: at, completedAt: null, lit: new Map() };
    round.lit.set(lantern.id, { by: player.id, name: String(player.name ?? 'A visitor').slice(0, MAX_NAME), at });
    round.lastAt = at;
    let completed = false;
    if (round.lit.size === lanterns.length) {
      round.completedAt = at; rounds++; completed = true;
      const seconds = (at - round.startedAt) / 1000, lamplighters = [...new Set([...round.lit.values()].map(item => item.name))];
      if (!best || seconds < best.seconds) best = { seconds, lamplighters, at };
    }
    changed();
    return { ok: true, lanternWalk: view(), lit: lantern.id, completed };
  }

  function prune(at = now()) {
    if (!round) return;
    const expired = round.completedAt ? at - round.completedAt >= LANTERN_CELEBRATION_MS : at - round.lastAt >= LANTERN_IDLE_MS;
    if (expired) { round = null; changed(); }
  }

  const checkpoint = () => ({ round: round ? { startedAt: round.startedAt, lastAt: round.lastAt, completedAt: round.completedAt,
    lit: [...round.lit].map(([id, item]) => ({ id, ...item })) } : null, best: best ? { ...best, lamplighters: [...best.lamplighters] } : null, rounds });
  function validate(saved) {
    if (saved === undefined || saved === null) return { round: null, best: null, rounds: 0 };
    if (!lanterns.length) throw new Error('Lantern walk has no lanterns here');
    if (!record(saved) || !only(saved, ['round', 'best', 'rounds']) || !Number.isInteger(saved.rounds) || saved.rounds < 0) throw new Error('Invalid lantern walk');
    let nextRound = null, nextBest = null;
    if (saved.round !== null) {
      const r = saved.round;
      if (!record(r) || !only(r, ['startedAt', 'lastAt', 'completedAt', 'lit']) || !time(r.startedAt) || !time(r.lastAt) || r.lastAt < r.startedAt
        || !Array.isArray(r.lit) || !r.lit.length || r.lit.length > lanterns.length) throw new Error('Invalid lantern round');
      const lit = new Map();
      for (const item of r.lit) {
        if (!record(item) || !only(item, ['id', 'by', 'name', 'at']) || !byId.has(item.id) || lit.has(item.id) || !text(item.by) || !text(item.name, MAX_NAME)
          || !time(item.at) || item.at < r.startedAt || item.at > r.lastAt) throw new Error('Invalid lit lantern');
        lit.set(item.id, { by: item.by, name: item.name, at: item.at });
      }
      const complete = lit.size === lanterns.length;
      if (complete ? r.completedAt !== r.lastAt : r.completedAt !== null) throw new Error('Invalid lantern completion');
      nextRound = { startedAt: r.startedAt, lastAt: r.lastAt, completedAt: r.completedAt, lit };
    }
    if (saved.best !== null) {
      const b = saved.best;
      if (!record(b) || !only(b, ['seconds', 'lamplighters', 'at']) || !(Number.isFinite(b.seconds) && b.seconds >= 0) || !time(b.at)
        || !Array.isArray(b.lamplighters) || !b.lamplighters.length || b.lamplighters.length > lanterns.length || !b.lamplighters.every(name => text(name, MAX_NAME))) throw new Error('Invalid lantern record');
      nextBest = { seconds: b.seconds, lamplighters: [...b.lamplighters], at: b.at };
    }
    if ((nextBest === null) !== (saved.rounds === 0)) throw new Error('Invalid lantern record count');
    return { round: nextRound, best: nextBest, rounds: saved.rounds };
  }
  const load = saved => { round = saved.round; best = saved.best; rounds = saved.rounds; };
  const clear = () => { if (round) { round = null; changed(); } };

  return { enabled: lanterns.length > 0, command, prune, snapshot: view, checkpoint, validate, load, clear };
}
