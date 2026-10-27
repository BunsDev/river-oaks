// The first criminal action (#597), timed (#640): a melee strike on an authored rival, resolved
// here and nowhere else. A narrow resolver, not a legal or economy service: health, a recovery
// timer, 0–5 wanted stars that cool off with quiet time, and per-attacker receipts so a repeated
// attack ID never lands twice. A strike is an action with phases (windup, contact, recovery);
// damage waits for contact, which rechecks the town's own state. A struck rival telegraphs one
// counter at the participant who engaged it, which an evade window beats. The world rule
// (world-policy.js) decides where and when. See docs/crime.md.

export const CRIME_RULES = Object.freeze({
  maxHealth: 100, meleeDamage: 25, meleeReach: 1.6, meleeHeight: 0.6,
  cooldownMs: 900, recoveryMs: 20_000, hitReactionMs: 700, strikeMs: 600,
  maxStars: 5, starDecayMs: 30_000, receiptMs: 60_000, receiptsPerPlayer: 16,
  // #640 timed melee: proposed tuning, to be playtested (docs/crime.md).
  strikeWindupMs: 300, contactMs: 120, arcDegrees: 60,
  counterWindupMs: 750, counterMs: 1500, counterDamage: 20, counterCooldownMs: 2500, engageRange: 3,
  staggerMs: 600, downMs: 8000, lapseMs: 30_000, evadeMs: 350, evadeCooldownMs: 800, actionKeepMs: 1500,
});
const R = CRIME_RULES;
const TIMING = Object.freeze({ strike: { windup: R.strikeWindupMs, length: R.cooldownMs }, counter: { windup: R.counterWindupMs, length: R.counterMs } });
const OUTCOMES = ['hit', 'miss', 'cancelled', 'evaded'], DIRECTIONS = ['left', 'right', 'back'];

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
const reasonText = value => typeof value === 'string' && /^[a-z_]{1,64}$/.test(value);
const optional = (value, check) => value === null || check(value);
const reject = (error, message = error) => ({ ok: false, error, message });
const ATTACK_FIELDS = ['type', 'targetId', 'attackKind', 'attackId'], EVADE_FIELDS = ['type', 'direction', 'evadeId'];
const ACTION_KEYS = ['id', 'kind', 'actorId', 'targetId', 'startedAt', 'contactAt', 'endsAt', 'direction', 'outcome', 'reason', 'resolvedAt', 'effect'];
const PARTICIPANT_KEYS = ['damagedAt', 'engagedAt', 'downAt', 'staggerUntil'];
const flat = (a, b) => [b[0] - a[0], b[1] - a[1]];
const unit = (vector, fallback) => { const length = Math.hypot(vector[0], vector[1]);return length > 1e-6 ? [vector[0] / length, vector[1] / length] : fallback; };
// The target must still be inside the swing's arc, measured from where the actor stands now.
const inArc = (direction, from, to) => {
  const vector = flat(from, to), length = Math.hypot(vector[0], vector[1]);
  return length < 1e-6 || (direction[0] * vector[0] + direction[1] * vector[1]) / length >= Math.cos(R.arcDegrees * Math.PI / 180) - 1e-9;
};
const onFoot = player => !(player.sitting || player.vehicle || player.cycling || player.performing || player.altitude > 0.1 || player.levelId);

/**
 * groundAt(east, north) places the rivals; decide(attacker, target, targetType) is the world
 * rule's verdict from the town's own positions; reachable(attacker, target) checks floor, room,
 * arm's reach and sight; isResident and players let protected targets get a clear refusal;
 * engageable(player) is whether a player stands on foot in an active danger zone; held(userId)
 * whether police hold them (surrender or arrest), which no counter may strike.
 */
export function createCrime({ worldId, groundAt, now, changed, decide, reachable, isResident = () => false, players, engageable = () => true, held = () => false, captured = () => false }) {
  const rivals = new Map((CRIME_TARGETS[worldId] ?? []).map(item => [item.id, {
    id: item.id, name: item.name, appearance: item.appearance, yaw: item.yaw,
    position: [item.position[0], item.position[1], groundAt(item.position[0], item.position[1])],
    health: R.maxHealth, hitAt: null, engagedId: null, counterAt: null,
  }]));
  // Any hit starts the recovery clock; when it runs out the rival is whole again. Applied
  // before every decision too, so the outcome never depends on when the town last stepped.
  const recover = (rival, at) => {
    if (rival.hitAt === null || at - rival.hitAt < R.recoveryMs) return false;
    rival.health = R.maxHealth; rival.hitAt = null; return true;
  };
  const down = (rival, at) => rival.health === 0 && rival.hitAt !== null && at - rival.hitAt < R.recoveryMs;
  // Public: stars per account, actions in progress. Private: when the quiet period started,
  // cooldowns, receipts, participants' timers and evade windows.
  let wanted = new Map(), cooldowns = new Map(), receipts = new Map(), actions = new Map(), participants = new Map(), evades = new Map(), sequence = 0;
  // Contacts since the town last asked (#640 increment 3): what nearby residents may notice.
  // Process-local, never checkpointed: a restored town alarms nobody about a fight it slept through.
  let contacts = [];
  const starsOf = userId => wanted.get(userId)?.stars ?? 0;
  // A contact the town has not resolved yet reads as contact, never done: the outcome follows.
  const phaseOf = (action, at) => action.outcome === null ? (at < action.contactAt ? 'windup' : 'contact') : action.outcome === 'cancelled' || at >= action.endsAt ? 'done'
    : at < action.contactAt ? 'windup' : at < action.contactAt + R.contactMs ? 'contact' : 'recovery';
  const remainingOf = (action, at, phase) => Math.max(0, Math.round(phase === 'windup' ? action.contactAt - at : phase === 'contact' ? action.contactAt + R.contactMs - at : phase === 'recovery' ? action.endsAt - at : 0));
  const publicAction = (action, at) => {
    const phase = phaseOf(action, at);
    return { id: action.id, kind: action.kind, actorId: action.actorId, targetId: action.targetId, phase, remainingMs: remainingOf(action, at, phase),
      outcome: action.outcome, reason: action.reason, direction: [...action.direction], ...(action.effect ? { effect: { ...action.effect } } : {}) };
  };
  const shown = (action, at) => action.outcome === null || at < Math.max(action.endsAt, action.resolvedAt) + R.actionKeepMs;
  const isDown = (userId, at) => { const p = participants.get(userId);return Boolean(p && p.downAt !== null && at - p.downAt < R.downMs); };
  const prune = at => {
    for (const [userId, list] of receipts) {
      const kept = list.filter(item => at - item.at < R.receiptMs);
      if (kept.length) receipts.set(userId, kept); else receipts.delete(userId);
    }
    for (const [userId, at0] of cooldowns) if (at - at0 >= R.cooldownMs) cooldowns.delete(userId);
    for (const [userId, entry] of evades) {
      const ids = entry.ids.filter(item => at - item.at < R.receiptMs);
      // Kept past its window so a late police step can still read it (grab contacts, #640).
      if (!ids.length && at - entry.at >= Math.max(R.evadeCooldownMs, 2000)) evades.delete(userId); else entry.ids = ids;
    }
    // A finished action stays public for a moment and private while a receipt can replay it.
    const replayable = new Set([...receipts.values()].flat().map(item => item.actionId).filter(Boolean));
    for (const [id, action] of actions) if (action.outcome !== null && !shown(action, at) && !replayable.has(id)) actions.delete(id);
  };
  const resolve = (action, outcome, reason, at, effect = null) => {
    Object.assign(action, { outcome, reason, resolvedAt: Math.max(action.startedAt, at), effect });changed();
    const actor = players.get(action.actorId) ?? rivals.get(action.actorId);
    if (outcome !== 'cancelled' && actor && contacts.length < 64) contacts.push({ at, kind: action.kind, actorId: action.actorId, position: [...actor.position] });
  };
  // Participation: the minimal player health this PvE exchange needs, on the player record the
  // police capture already reads. It ends with full health; the field stays at 100.
  const engage = (player, at) => {
    const participant = participants.get(player.id);
    if (participant) { participant.engagedAt = at;return participant; }
    if (!Object.hasOwn(player, 'health')) player.health = R.maxHealth;
    const fresh = { damagedAt: null, engagedAt: at, downAt: null, staggerUntil: 0 };
    participants.set(player.id, fresh);return fresh;
  };
  function endParticipation(userId, at, reason) {
    for (const action of actions.values()) if (action.outcome === null && action.kind === 'counter' && action.targetId === userId) resolve(action, 'cancelled', reason, at);
    for (const rival of rivals.values()) if (rival.engagedId === userId) rival.engagedId = null;
    if (!participants.delete(userId)) return;
    const player = players.get(userId);
    if (player) player.health = R.maxHealth;
    changed();
  }

  // Contacts that are due resolve in contact order before anything reads or changes the town.
  function settle(at) {
    const due = [...actions.values()].filter(action => action.outcome === null && action.contactAt <= at)
      .sort((a, b) => a.contactAt - b.contactAt || Number(a.id.split(':')[1]) - Number(b.id.split(':')[1]));
    for (const action of due) (action.kind === 'strike' ? strikeContact : counterContact)(action, at);
  }
  function strikeContact(action, at) {
    const attacker = players.get(action.actorId), rival = rivals.get(action.targetId);
    if (!attacker || !rival) return resolve(action, 'cancelled', 'attacker_left', at);
    if (held(attacker.id) || captured(attacker.id)) return resolve(action, 'cancelled', 'surrendered', at);
    recover(rival, at);
    if (down(rival, at)) return resolve(action, 'miss', 'target_incapacitated', at);
    if (!onFoot(attacker)) return resolve(action, 'miss', 'attack_on_foot', at);
    const participant = participants.get(attacker.id);
    if (participant && participant.staggerUntil > action.contactAt) return resolve(action, 'miss', 'staggered', at);
    const verdict = decide(attacker, rival, 'resident');
    if (!verdict.allowed) return resolve(action, 'cancelled', verdict.reason, at);
    if (!reachable(attacker, rival)) return resolve(action, 'miss', 'attack_out_of_reach', at);
    if (!inArc(action.direction, attacker.position, rival.position)) return resolve(action, 'miss', 'attack_out_of_arc', at);
    // One authoritative transition: fixed damage and one star, timed from the contact.
    rival.health = Math.max(0, rival.health - R.meleeDamage);
    rival.hitAt = action.contactAt;
    const stars = Math.min(R.maxStars, starsOf(attacker.id) + 1);
    wanted.set(attacker.id, { stars, quietSince: action.contactAt });
    engage(attacker, action.contactAt);
    if (rival.health === 0) {
      rival.engagedId = null;
      for (const counter of actions.values()) if (counter.outcome === null && counter.actorId === rival.id) resolve(counter, 'cancelled', 'rival_down', at);
    } else rival.engagedId = attacker.id;
    resolve(action, 'hit', null, at, { damage: R.meleeDamage, health: rival.health, incapacitated: rival.health === 0, stars });
  }
  function counterContact(action, at) {
    const player = players.get(action.targetId), participant = participants.get(action.targetId), rival = rivals.get(action.actorId);
    if (!player || !participant || !rival) return resolve(action, 'cancelled', 'participant_left', at);
    recover(rival, at);
    if (down(rival, at)) return resolve(action, 'cancelled', 'rival_down', at);
    // A telegraphed counter still comes for a player who surrenders mid-fight (only an evade
    // beats it); police taking hold of them ends it.
    if (captured(player.id)) return resolve(action, 'cancelled', 'captured', at);
    const verdict = decide(player, rival, 'resident');
    if (!verdict.allowed) return resolve(action, 'cancelled', verdict.reason, at);
    const evade = evades.get(player.id);
    if (evade && evade.at <= action.contactAt && action.contactAt <= evade.at + R.evadeMs) return resolve(action, 'evaded', null, at);
    if (!onFoot(player) || !reachable(player, rival)) return resolve(action, 'miss', 'out_of_reach', at);
    if (!inArc(action.direction, rival.position, player.position)) return resolve(action, 'miss', 'out_of_arc', at);
    player.health = Math.max(0, player.health - R.counterDamage);
    participant.damagedAt = action.contactAt;participant.staggerUntil = action.contactAt + R.staggerMs;
    if (player.health === 0) { participant.downAt = action.contactAt;rival.engagedId = null; }
    resolve(action, 'hit', null, at, { damage: R.counterDamage, health: player.health, down: player.health === 0 });
  }

  function attack(player, message, at) {
    if (!record(message) || !Object.keys(message).every(key => ATTACK_FIELDS.includes(key))
      || message.attackKind !== 'melee' || !textId(message.targetId) || Object.hasOwn(message, 'attackId') && !attackId(message.attackId))
      return reject('invalid_attack', 'That is not an attack the town understands.');
    settle(at);
    // A repeated attack ID returns the action it already started, as it stands now, and changes
    // nothing. Refusals change nothing either, so they are not kept: the same ID may start once
    // it is allowed. A receipt from before #640 holds the instant hit it landed.
    const seen = message.attackId && receipts.get(player.id)?.find(item => item.attackId === message.attackId);
    if (seen) return seen.result ? { ...structuredClone(seen.result), replayed: true } : { ok: true, action: publicAction(actions.get(seen.actionId), at), replayed: true };
    const result = admit(player, message.targetId, at);
    if (message.attackId && result.ok) {
      const list = (receipts.get(player.id) ?? []).filter(item => at - item.at < R.receiptMs).slice(-(R.receiptsPerPlayer - 1));
      receipts.set(player.id, [...list, { attackId: message.attackId, at, actionId: result.action.id }]);
    }
    return result;
  }

  function admit(player, targetId, at) {
    if (!onFoot(player)) return reject('attack_on_foot', 'Stand on the street to do that.');
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
    if ((participants.get(player.id)?.staggerUntil ?? 0) > at) return reject('staggered', 'Steady yourself first.');
    recover(rival, at);
    if (down(rival, at)) return reject('target_incapacitated', `${rival.name} is already down.`);
    const verdict = decide(player, rival, 'resident');
    if (!verdict.allowed) return reject(verdict.reason, refusal(verdict.reason));
    if (!reachable(player, rival)) return reject('attack_out_of_reach', `Get within arm's reach of ${rival.name}, with nothing in between.`);
    if (cooldowns.has(player.id) && at - cooldowns.get(player.id) < R.cooldownMs) return reject('attack_cooldown', 'Catch your breath first.');
    // Admitted: a windup toward where the rival stands now. Damage and the star wait for contact.
    const action = start('strike', player.id, rival.id, unit(flat(player.position, rival.position), [-Math.sin(player.yaw), Math.cos(player.yaw)]), at);
    cooldowns.set(player.id, at);
    engage(player, at);
    return { ok: true, action: publicAction(action, at) };
  }
  function start(kind, actorId, targetId, direction, at) {
    const action = { id: `${kind}:${++sequence}`, kind, actorId, targetId, startedAt: at, contactAt: at + TIMING[kind].windup, endsAt: at + TIMING[kind].length,
      direction, outcome: null, reason: null, resolvedAt: null, effect: null };
    actions.set(action.id, action);changed();return action;
  }

  function evade(player, message, at) {
    if (!record(message) || !Object.keys(message).every(key => EVADE_FIELDS.includes(key)) || message.type !== 'evade'
      || Object.hasOwn(message, 'direction') && !DIRECTIONS.includes(message.direction) || Object.hasOwn(message, 'evadeId') && !attackId(message.evadeId))
      return reject('invalid_evade', 'That is not an evade the town understands.');
    settle(at);
    const entry = evades.get(player.id), publicEvade = () => ({ direction: evades.get(player.id).direction, remainingMs: Math.max(0, evades.get(player.id).at + R.evadeMs - at) });
    if (message.evadeId && entry?.ids.some(item => item.evadeId === message.evadeId)) return { ok: true, evade: publicEvade(), replayed: true };
    const participant = participants.get(player.id);
    if (!onFoot(player) || !participant && !starsOf(player.id) || !engageable(player)) return reject('evade_unavailable', 'There is nothing to evade here.');
    if (isDown(player.id, at)) return reject('incapacitated', 'You are down. Wait to get back up.');
    if (participant && participant.staggerUntil > at) return reject('staggered', 'Steady yourself first.');
    if (entry && at - entry.at < R.evadeCooldownMs) return reject('evade_cooldown', 'Not so fast.');
    const ids = (entry?.ids ?? []).filter(item => at - item.at < R.receiptMs).slice(-(R.receiptsPerPlayer - 1));
    evades.set(player.id, { at, direction: message.direction ?? 'back', ids: message.evadeId ? [...ids, { evadeId: message.evadeId, at }] : ids });
    if (participant) participant.engagedAt = at;
    changed();
    return { ok: true, evade: publicEvade() };
  }

  function step(at) {
    settle(at);
    for (const rival of rivals.values()) if (recover(rival, at)) changed();
    // Participants get up, recover, and lapse.
    for (const [userId, participant] of participants) {
      const player = players.get(userId);
      if (!player || !engageable(player) || at - participant.engagedAt >= R.lapseMs) { endParticipation(userId, at, 'lapsed');continue; }
      if (participant.downAt !== null && at - participant.downAt >= R.downMs
        || participant.downAt === null && participant.damagedAt !== null && at - participant.damagedAt >= R.recoveryMs) {
        Object.assign(participant, { damagedAt: null, downAt: null, staggerUntil: 0 });player.health = R.maxHealth;changed();
      }
    }
    // A struck, conscious rival faces its participant and, after its stagger and cooldown,
    // telegraphs one counter if they are still close; otherwise it lets them go.
    for (const rival of rivals.values()) {
      if (!rival.engagedId) continue;
      if (down(rival, at)) { rival.engagedId = null;changed();continue; }
      if ([...actions.values()].some(action => action.outcome === null && action.actorId === rival.id)) continue;
      if (at < Math.max((rival.hitAt ?? -Infinity) + R.hitReactionMs, (rival.counterAt ?? -Infinity) + R.counterCooldownMs)) continue;
      const player = players.get(rival.engagedId), participant = participants.get(rival.engagedId);
      if (!player || !participant || participant.downAt !== null || held(player.id) || !onFoot(player)
        || Math.hypot(...flat(rival.position, player.position)) > R.engageRange || !decide(player, rival, 'resident').allowed) {
        rival.engagedId = null;changed();continue;
      }
      start('counter', rival.id, player.id, unit(flat(rival.position, player.position), [1, 0]), at);
      rival.counterAt = at;participant.engagedAt = at;
    }
    // Quiet time cools a wanted level by one star per period, exactly, however steps fall.
    for (const [userId, entry] of wanted) {
      const periods = Math.floor((at - entry.quietSince) / R.starDecayMs);
      if (periods <= 0) continue;
      const stars = Math.max(0, entry.stars - periods);
      if (stars === 0) wanted.delete(userId); else wanted.set(userId, { stars, quietSince: entry.quietSince + periods * R.starDecayMs });
      changed();
    }
    prune(at);
  }

  // Emergency off and every rule change cancel all pending contacts at once; a peaceful town
  // also ends every participation. Due contacts resolve first under the rule now in force: after a
  // policy update they may still land if the new rule allows; after emergency off nothing does.
  function cancel(at, reason, { peace = false } = {}) {
    settle(at);
    for (const action of actions.values()) if (action.outcome === null) resolve(action, 'cancelled', reason, at);
    if (peace) for (const userId of [...participants.keys()]) endParticipation(userId, at, reason);
  }
  // A departing session lands nothing, and nothing lands on it.
  function release(userId, at) {
    for (const action of actions.values()) if (action.outcome === null && (action.actorId === userId || action.targetId === userId))
      resolve(action, 'cancelled', action.actorId === userId ? 'attacker_left' : 'participant_left', at);
    endParticipation(userId, at, 'participant_left');
  }

  const snapshot = at => ({
    targets: [...rivals.values()].map(rival => {
      const facing = rival.engagedId && players.get(rival.engagedId);
      // Camera-style yaw, as authored: a rendered figure faces yaw + pi.
      const yaw = facing ? Math.atan2(facing.position[0] - rival.position[0], -(facing.position[1] - rival.position[1])) - Math.PI : rival.yaw;
      return { id: rival.id, name: rival.name, appearance: rival.appearance, position: [...rival.position], yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
        health: rival.health, maxHealth: R.maxHealth, incapacitated: down(rival, at), staggered: rival.hitAt !== null && at - rival.hitAt < R.hitReactionMs, engagedId: rival.engagedId };
    }),
    wanted: [...wanted].map(([userId, entry]) => [userId, entry.stars]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    actions: [...actions.values()].filter(action => shown(action, at)).map(action => publicAction(action, at)),
  });
  const checkpoint = () => ({
    rivals: [...rivals.values()].map(({ id, health, hitAt, engagedId, counterAt }) => ({ id, health, hitAt, engagedId, counterAt })),
    wanted: [...wanted].map(([userId, entry]) => [userId, { ...entry }]),
    cooldowns: [...cooldowns],
    receipts: [...receipts].map(([userId, list]) => [userId, structuredClone(list)]),
    actions: [...actions.values()].map(action => structuredClone(action)),
    participants: [...participants].map(([userId, entry]) => [userId, { ...entry }]),
    evades: [...evades].map(([userId, entry]) => [userId, structuredClone(entry)]),
    sequence,
  });
  const blank = () => ({ rivals: new Map(), wanted: new Map(), cooldowns: new Map(), receipts: new Map(), actions: new Map(), participants: new Map(), evades: new Map(), sequence: 0 });
  const validEffect = (kind, effect) => kind === 'strike'
    ? exactly(effect, ['damage', 'health', 'incapacitated', 'stars']) && effect.damage === R.meleeDamage && count(effect.health) && effect.health <= R.maxHealth
      && typeof effect.incapacitated === 'boolean' && Number.isSafeInteger(effect.stars) && effect.stars >= 1 && effect.stars <= R.maxStars
    : exactly(effect, ['damage', 'health', 'down']) && effect.damage === R.counterDamage && count(effect.health) && effect.health <= R.maxHealth && typeof effect.down === 'boolean';
  const validAction = (action, limit) => exactly(action, ACTION_KEYS) && Object.hasOwn(TIMING, action.kind) && typeof action.id === 'string'
    && new RegExp(`^${action.kind}:([1-9][0-9]{0,15})$`).test(action.id) && Number(action.id.split(':')[1]) <= limit
    && textId(action.actorId) && textId(action.targetId) && time(action.startedAt)
    && action.contactAt === action.startedAt + TIMING[action.kind].windup && action.endsAt === action.startedAt + TIMING[action.kind].length
    && Array.isArray(action.direction) && action.direction.length === 2 && action.direction.every(Number.isFinite) && Math.abs(Math.hypot(...action.direction) - 1) < 1e-6
    && (action.outcome === null ? action.reason === null && action.resolvedAt === null && action.effect === null
      : OUTCOMES.includes(action.outcome) && optional(action.reason, reasonText) && time(action.resolvedAt) && action.resolvedAt >= action.startedAt
        && (action.outcome === 'hit' ? validEffect(action.kind, action.effect) : action.effect === null));
  const V17 = ['rivals', 'wanted', 'cooldowns', 'receipts', 'actions', 'participants', 'evades', 'sequence'];
  // A v17 section nobody has fought in carries nothing an older version lacks.
  const untouched = saved => exactly(saved, V17) && Array.isArray(saved.actions) && !saved.actions.length && Array.isArray(saved.participants) && !saved.participants.length
    && Array.isArray(saved.evades) && !saved.evades.length && saved.sequence === 0
    && Array.isArray(saved.rivals) && saved.rivals.every(item => exactly(item, ['id', 'health', 'hitAt', 'engagedId', 'counterAt']) && item.engagedId === null && item.counterAt === null);
  function validate(saved, version, savedPlayers = players) {
    // Before v15 there was no crime. An untouched section is the same as none; anything else
    // cannot ride in an older version, which an older writer would drop. v15/v16 had instant hits.
    if (version < 15 && saved === undefined) return blank();
    if (version < 17 && untouched(saved)) saved = { rivals: saved.rivals.map(({ id, health, hitAt }) => ({ id, health, hitAt })), wanted: saved.wanted, cooldowns: saved.cooldowns, receipts: saved.receipts };
    const current = version >= 17;
    if (!exactly(saved, current ? V17 : ['rivals', 'wanted', 'cooldowns', 'receipts'])) throw new Error('Invalid crime state');
    if (version < 15 && (saved.wanted.length || saved.cooldowns.length || saved.receipts.length
      || !Array.isArray(saved.rivals) || saved.rivals.some(item => item?.health !== R.maxHealth || item?.hitAt !== null))) throw new Error('Invalid crime version');
    const next = blank();
    if (!Array.isArray(saved.rivals) || saved.rivals.length > 64 || !saved.rivals.every(item => (current ? exactly(item, ['id', 'health', 'hitAt', 'engagedId', 'counterAt'])
      && optional(item.engagedId, textId) && optional(item.counterAt, time) : exactly(item, ['id', 'health', 'hitAt'])) && textId(item.id)
      && count(item.health) && item.health <= R.maxHealth && (item.hitAt === null ? item.health === R.maxHealth : time(item.hitAt))))
      throw new Error('Invalid crime rivals');
    // A rival this world no longer authors is dropped; one it still authors keeps its state.
    for (const item of saved.rivals) if (rivals.has(item.id)) next.rivals.set(item.id, { engagedId: null, counterAt: null, ...item });
    if (!Array.isArray(saved.wanted) || saved.wanted.length > 4096 || !saved.wanted.every(entry => Array.isArray(entry) && entry.length === 2 && textId(entry[0])
      && exactly(entry[1], ['stars', 'quietSince']) && Number.isSafeInteger(entry[1].stars) && entry[1].stars >= 1 && entry[1].stars <= R.maxStars && time(entry[1].quietSince)))
      throw new Error('Invalid wanted levels');
    for (const [userId, entry] of saved.wanted) { if (next.wanted.has(userId)) throw new Error('Duplicate wanted level'); next.wanted.set(userId, { ...entry }); }
    if (!Array.isArray(saved.cooldowns) || saved.cooldowns.length > 4096 || !saved.cooldowns.every(entry => Array.isArray(entry) && entry.length === 2 && textId(entry[0]) && time(entry[1])))
      throw new Error('Invalid attack cooldowns');
    for (const [userId, at] of saved.cooldowns) next.cooldowns.set(userId, at);
    if (current) {
      if (!count(saved.sequence)) throw new Error('Invalid action sequence');
      next.sequence = saved.sequence;
      if (!Array.isArray(saved.actions) || saved.actions.length > 4096 || !saved.actions.every(action => validAction(action, saved.sequence))) throw new Error('Invalid crime actions');
      for (const action of saved.actions) { if (next.actions.has(action.id)) throw new Error('Duplicate crime action'); next.actions.set(action.id, structuredClone(action)); }
      if (!Array.isArray(saved.participants) || saved.participants.length > 4096 || !saved.participants.every(entry => Array.isArray(entry) && entry.length === 2 && textId(entry[0])
        && exactly(entry[1], PARTICIPANT_KEYS) && optional(entry[1].damagedAt, time) && time(entry[1].engagedAt) && optional(entry[1].downAt, time) && time(entry[1].staggerUntil)))
        throw new Error('Invalid crime participants');
      for (const [userId, entry] of saved.participants) {
        // Participants are present players whose health the player record carries.
        const player = savedPlayers.get(userId);
        if (next.participants.has(userId) || !player || !count(player.health) || entry.downAt !== null && player.health !== 0) throw new Error('Invalid crime participant');
        next.participants.set(userId, { ...entry });
      }
      if (!Array.isArray(saved.evades) || saved.evades.length > 4096 || !saved.evades.every(entry => Array.isArray(entry) && entry.length === 2 && textId(entry[0])
        && exactly(entry[1], ['at', 'direction', 'ids']) && time(entry[1].at) && DIRECTIONS.includes(entry[1].direction) && Array.isArray(entry[1].ids)
        && entry[1].ids.length <= R.receiptsPerPlayer && entry[1].ids.every(item => exactly(item, ['evadeId', 'at']) && attackId(item.evadeId) && time(item.at))))
        throw new Error('Invalid crime evades');
      for (const [userId, entry] of saved.evades) { if (next.evades.has(userId)) throw new Error('Duplicate evade'); next.evades.set(userId, structuredClone(entry)); }
    }
    // Receipts: an action ID (v17), or the instant hit an earlier town landed.
    const legacy = item => exactly(item, ['attackId', 'at', 'result']) && record(item.result) && item.result.ok === true;
    const started = item => current && exactly(item, ['attackId', 'at', 'actionId']) && next.actions.get(item.actionId)?.kind === 'strike';
    if (!Array.isArray(saved.receipts) || saved.receipts.length > 4096 || !saved.receipts.every(entry => Array.isArray(entry) && entry.length === 2 && textId(entry[0])
      && Array.isArray(entry[1]) && entry[1].length <= R.receiptsPerPlayer && entry[1].every(item => (legacy(item) || started(item)) && attackId(item.attackId) && time(item.at))))
      throw new Error('Invalid attack receipts');
    for (const [userId, list] of saved.receipts) next.receipts.set(userId, structuredClone(list));
    return next;
  }
  // A restored town (writer replacement, restart) does not land contacts it slept through: one
  // more than LATE_CONTACT overdue is cancelled, so nobody is hit after a pause they could not
  // react to. Timers from a writer whose clock ran ahead are brought back to now, and health left
  // on anyone who is no longer a participant is whole again.
  const LATE_CONTACT = 250;
  function load(next, at = now()) {
    for (const rival of rivals.values()) Object.assign(rival, { health: R.maxHealth, hitAt: null, engagedId: null, counterAt: null }, next.rivals.get(rival.id) ?? {});
    ({ wanted, cooldowns, receipts, actions, participants, evades, sequence } = next);
    for (const action of actions.values()) if (action.outcome === null && action.contactAt + LATE_CONTACT < at)
      Object.assign(action, { outcome: 'cancelled', reason: 'interrupted', resolvedAt: Math.max(action.startedAt, at), effect: null });
    for (const participant of participants.values()) {
      for (const key of ['damagedAt', 'engagedAt', 'downAt']) if (participant[key] !== null && participant[key] > at) participant[key] = at;
      participant.staggerUntil = Math.min(participant.staggerUntil, at + R.staggerMs);
    }
    for (const player of players.values()) if (Object.hasOwn(player, 'health') && !participants.has(player.id)) player.health = R.maxHealth;
  }
  const clear = () => load(blank());

  return { attack, evade, step, cancel, release, snapshot, checkpoint, validate, load, clear, starsOf, rivals,
    down: isDown,
    // Police watching a wanted player (#640): the quiet period restarts, so stars do not cool off
    // under observation. The existing decay clock and checkpointed quietSince, nothing more.
    observe(userId, at) { const entry = wanted.get(userId); if (entry && at > entry.quietSince) entry.quietSince = at; },
    // Whether this player's evade window covers a moment (police grabs share the rival's rule).
    evading(userId, at) { const entry = evades.get(userId); return Boolean(entry && entry.at <= at && at <= entry.at + R.evadeMs); },
    // Only an active crime participant can be grabbed for refusing to surrender (#640).
    participating: userId => participants.has(userId),
    drainContacts() { const list = contacts;contacts = [];return list; },
    arrest(userId) { endParticipation(userId, now(), 'arrested');if (wanted.delete(userId)) changed(); } };
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
