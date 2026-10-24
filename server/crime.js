// The first criminal action (#597): a melee attack on an authored rival, resolved here and
// nowhere else. A narrow resolver, not a legal or economy service: health, a recovery timer,
// 0–5 wanted stars that cool off with quiet time, and per-attacker receipts so a repeated
// attack ID never lands twice. The world rule (world-policy.js) decides where and when.
// See docs/crime.md.

export const CRIME_RULES = Object.freeze({
  maxHealth: 100, meleeDamage: 25, meleeReach: 1.6, meleeHeight: 0.6,
  cooldownMs: 900, recoveryMs: 20_000, hitReactionMs: 700, strikeMs: 600,
  maxStars: 5, starDecayMs: 30_000, receiptMs: 60_000, receiptsPerPlayer: 16,
});
const R = CRIME_RULES;

// Authored eligible targets, by world: rivals who stand their ground in a danger zone and pick
// themselves up again. Residents are never targets. Positions are [east, north] in town metres,
// on free street inside the zone (preview/tests/world-policy.test.js measures the zones).
export const CRIME_TARGETS = Object.freeze({
  'river-oaks': Object.freeze([
    Object.freeze({ id: 'rival:westcreek', name: 'Westcreek rival', position: Object.freeze([-2908, -1320]), yaw: Math.PI / 2, appearance: 'sable-human' }),
    Object.freeze({ id: 'rival:service-lane', name: 'Service lane rival', position: Object.freeze([-2800, -1440]), yaw: 0, appearance: 'sable-human' }),
  ]),
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactly = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const time = value => Number.isFinite(value) && value >= 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const textId = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
const attackId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
const reject = (error, message = error) => ({ ok: false, error, message });
const ATTACK_FIELDS = ['type', 'targetId', 'attackKind', 'attackId'];

/**
 * groundAt(east, north) places the rivals; decide(attacker, target, targetType) is the world
 * rule's verdict from the town's own positions; reachable(attacker, target) checks floor, room,
 * arm's reach and sight; isResident and players let protected targets get a clear refusal.
 */
export function createCrime({ worldId, groundAt, now, changed, decide, reachable, isResident = () => false, players }) {
  const rivals = new Map((CRIME_TARGETS[worldId] ?? []).map(item => [item.id, {
    id: item.id, name: item.name, appearance: item.appearance, yaw: item.yaw,
    position: [item.position[0], item.position[1], groundAt(item.position[0], item.position[1])],
    health: R.maxHealth, hitAt: null,
  }]));
  // Any hit starts the recovery clock; when it runs out the rival is whole again. Applied
  // before every decision too, so the outcome never depends on when the town last stepped.
  const recover = (rival, at) => {
    if (rival.hitAt === null || at - rival.hitAt < R.recoveryMs) return false;
    rival.health = R.maxHealth; rival.hitAt = null; return true;
  };
  const down = (rival, at) => rival.health === 0 && rival.hitAt !== null && at - rival.hitAt < R.recoveryMs;
  // Public: stars per account. Private: when the quiet period started, cooldowns and receipts.
  let wanted = new Map(), cooldowns = new Map(), receipts = new Map();
  const starsOf = userId => wanted.get(userId)?.stars ?? 0;
  const prune = at => {
    for (const [userId, list] of receipts) {
      const kept = list.filter(item => at - item.at < R.receiptMs);
      if (kept.length) receipts.set(userId, kept); else receipts.delete(userId);
    }
    for (const [userId, at0] of cooldowns) if (at - at0 >= R.cooldownMs) cooldowns.delete(userId);
  };

  function attack(player, message, at) {
    if (!record(message) || !Object.keys(message).every(key => ATTACK_FIELDS.includes(key))
      || message.attackKind !== 'melee' || !textId(message.targetId) || Object.hasOwn(message, 'attackId') && !attackId(message.attackId))
      return reject('invalid_attack', 'That is not an attack the town understands.');
    // A repeated attack ID returns the hit it already landed and changes nothing. Refusals
    // change nothing either, so they are not kept: the same ID may land once it is allowed.
    const seen = message.attackId && receipts.get(player.id)?.find(item => item.attackId === message.attackId);
    if (seen) return { ...structuredClone(seen.result), replayed: true };
    const result = resolve(player, message.targetId, at);
    if (message.attackId && result.ok) {
      const list = (receipts.get(player.id) ?? []).filter(item => at - item.at < R.receiptMs).slice(-(R.receiptsPerPlayer - 1));
      receipts.set(player.id, [...list, { attackId: message.attackId, at, result: structuredClone(result) }]);
    }
    return result;
  }

  function resolve(player, targetId, at) {
    if (player.sitting || player.vehicle || player.cycling || player.performing || player.altitude > 0.1 || player.levelId)
      return reject('attack_on_foot', 'Stand on the street to do that.');
    const rival = rivals.get(targetId);
    if (!rival) {
      if (isResident(targetId)) return reject('protected_target', 'Residents are never fair game.');
      if (players.has(targetId)) {
        // PvP needs the world rule and the target's consent; nobody can give consent yet.
        const verdict = decide(player, players.get(targetId), 'player');
        return reject(verdict.allowed ? 'pvp_consent_required' : verdict.reason, verdict.allowed ? 'They have not agreed to fight.' : refusal(verdict.reason));
      }
      return reject('unknown_target', 'There is nobody there to fight.');
    }
    recover(rival, at);
    if (down(rival, at)) return reject('target_incapacitated', `${rival.name} is already down.`);
    const verdict = decide(player, rival, 'resident');
    if (!verdict.allowed) return reject(verdict.reason, refusal(verdict.reason));
    if (!reachable(player, rival)) return reject('attack_out_of_reach', `Get within arm's reach of ${rival.name}, with nothing in between.`);
    if (cooldowns.has(player.id) && at - cooldowns.get(player.id) < R.cooldownMs) return reject('attack_cooldown', 'Catch your breath first.');
    // One authoritative transition: fixed damage, one star, a cooldown and a strike.
    rival.health = Math.max(0, rival.health - R.meleeDamage);
    rival.hitAt = at;
    const stars = Math.min(R.maxStars, starsOf(player.id) + 1);
    wanted.set(player.id, { stars, quietSince: at });
    cooldowns.set(player.id, at);
    changed();
    return { ok: true, hit: { targetId: rival.id, damage: R.meleeDamage, health: rival.health, incapacitated: rival.health === 0, stars } };
  }

  function step(at) {
    prune(at);
    for (const rival of rivals.values()) if (recover(rival, at)) changed();
    // Quiet time cools a wanted level by one star per period, exactly, however steps fall.
    for (const [userId, entry] of wanted) {
      const periods = Math.floor((at - entry.quietSince) / R.starDecayMs);
      if (periods <= 0) continue;
      const stars = Math.max(0, entry.stars - periods);
      if (stars === 0) wanted.delete(userId); else wanted.set(userId, { stars, quietSince: entry.quietSince + periods * R.starDecayMs });
      changed();
    }
  }

  const snapshot = at => ({
    targets: [...rivals.values()].map(rival => ({ id: rival.id, name: rival.name, appearance: rival.appearance, position: [...rival.position], yaw: rival.yaw,
      health: rival.health, maxHealth: R.maxHealth, incapacitated: down(rival, at), staggered: rival.hitAt !== null && at - rival.hitAt < R.hitReactionMs })),
    wanted: [...wanted].map(([userId, entry]) => [userId, entry.stars]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
  });
  const checkpoint = () => ({
    rivals: [...rivals.values()].map(({ id, health, hitAt }) => ({ id, health, hitAt })),
    wanted: [...wanted].map(([userId, entry]) => [userId, { ...entry }]),
    cooldowns: [...cooldowns],
    receipts: [...receipts].map(([userId, list]) => [userId, structuredClone(list)]),
  });
  const blank = () => ({ rivals: new Map(), wanted: new Map(), cooldowns: new Map(), receipts: new Map() });
  function validate(saved, version) {
    // Before v15 there was no crime. An untouched section is the same as none; anything else
    // cannot ride in an older version, which an older writer would drop.
    if (version < 15 && saved === undefined) return blank();
    if (!exactly(saved, ['rivals', 'wanted', 'cooldowns', 'receipts'])) throw new Error('Invalid crime state');
    if (version < 15 && (saved.wanted.length || saved.cooldowns.length || saved.receipts.length
      || !Array.isArray(saved.rivals) || saved.rivals.some(item => item?.health !== R.maxHealth || item?.hitAt !== null))) throw new Error('Invalid crime version');
    const next = blank();
    if (!Array.isArray(saved.rivals) || saved.rivals.length > 64 || !saved.rivals.every(item => exactly(item, ['id', 'health', 'hitAt']) && textId(item.id)
      && count(item.health) && item.health <= R.maxHealth && (item.hitAt === null ? item.health === R.maxHealth : time(item.hitAt))))
      throw new Error('Invalid crime rivals');
    // A rival this world no longer authors is dropped; one it still authors keeps its state.
    for (const item of saved.rivals) if (rivals.has(item.id)) next.rivals.set(item.id, { ...item });
    if (!Array.isArray(saved.wanted) || saved.wanted.length > 4096 || !saved.wanted.every(entry => Array.isArray(entry) && entry.length === 2 && textId(entry[0])
      && exactly(entry[1], ['stars', 'quietSince']) && Number.isSafeInteger(entry[1].stars) && entry[1].stars >= 1 && entry[1].stars <= R.maxStars && time(entry[1].quietSince)))
      throw new Error('Invalid wanted levels');
    for (const [userId, entry] of saved.wanted) { if (next.wanted.has(userId)) throw new Error('Duplicate wanted level'); next.wanted.set(userId, { ...entry }); }
    if (!Array.isArray(saved.cooldowns) || saved.cooldowns.length > 4096 || !saved.cooldowns.every(entry => Array.isArray(entry) && entry.length === 2 && textId(entry[0]) && time(entry[1])))
      throw new Error('Invalid attack cooldowns');
    for (const [userId, at] of saved.cooldowns) next.cooldowns.set(userId, at);
    if (!Array.isArray(saved.receipts) || saved.receipts.length > 4096 || !saved.receipts.every(entry => Array.isArray(entry) && entry.length === 2 && textId(entry[0])
      && Array.isArray(entry[1]) && entry[1].length <= R.receiptsPerPlayer && entry[1].every(item => exactly(item, ['attackId', 'at', 'result']) && attackId(item.attackId) && time(item.at)
        && record(item.result) && item.result.ok === true)))
      throw new Error('Invalid attack receipts');
    for (const [userId, list] of saved.receipts) next.receipts.set(userId, structuredClone(list));
    return next;
  }
  function load(next) {
    for (const rival of rivals.values()) Object.assign(rival, { health: R.maxHealth, hitAt: null }, next.rivals.get(rival.id) ?? {});
    wanted = next.wanted; cooldowns = next.cooldowns; receipts = next.receipts;
  }
  const clear = () => load(blank());

  return { attack, step, snapshot, checkpoint, validate, load, clear, starsOf, rivals,
    arrest(userId) { if(wanted.delete(userId))changed(); } };
}

/** Plain words for every refusal the world rule can give. */
export function refusal(reason) {
  return {
    violence_off: 'The town is peaceful right now.',
    outside_hours: 'Not at this hour. Trouble here only starts later.',
    pvp_off: 'Players cannot fight each other here.',
    safe_zone: 'This is a safe place. Nobody can be harmed here.',
    not_danger_zone: 'Nothing like that happens here. Find a danger zone.',
    zone_boundary: 'You are both in different places. Get closer, in the same zone.',
    zone_disabled: 'This zone is peaceful right now.',
  }[reason] ?? 'That is not allowed here.';
}
