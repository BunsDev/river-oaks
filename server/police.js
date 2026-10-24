// Bounded authoritative foot patrol. Navigation and sight remain the world's existing
// geometry services; only last-seen positions may feed a route while sight is lost.
export const POLICE_RULES = Object.freeze({ maxUnits: 6, speed: 3.4, sightRadius: 35,
  arrestRange: 1.5, standOff: 1.25, arrestMs: 1400, searchMs: 8000, responseMs: 12000,
  returnMs: 15000, replanMs: 1000 });
const R = POLICE_RULES;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const stamp = n => Number.isFinite(n) && n >= 0;
const states = ['pursue', 'search', 'arrest', 'return'];
const reject = (error, message) => ({ ok: false, error, message });

export function createPolice({ players, starsOf, eligible, navigation, posts, sight, arrest, changed }) {
  let units = [], surrendered = new Set(), cursor = 0;
  // Paths are disposable caches, not authority. Restore recalculates them from current
  // geometry and last-seen positions; each tick permits at most one bounded route search.
  const routes = new Map();
  const usablePosts = posts.filter(p => point(p) && navigation?.free(p));
  const validTarget = player => Boolean(player && starsOf(player.id) > 0 && eligible(player));
  const sees = (unit, player) => distance(unit.position, player.position) <= R.sightRadius
    && Math.abs(unit.position[2] - player.position[2]) <= 2 && sight(unit.position, player.position);
  const returning = (unit, at) => {
    unit.state = 'return'; unit.targetId = null; unit.since = at; unit.arrestAt = null; routes.delete(unit.id);
  };
  function surrender(userId, message) {
    if (!message || Object.keys(message).some(key => !['type', 'action'].includes(key))
      || message.type !== 'surrender' || message.action !== undefined && !['offer', 'resume'].includes(message.action))
      return reject('invalid_surrender', 'That is not a surrender the town understands.');
    const player = players.get(userId);
    if (!validTarget(player)) return reject('not_wanted', 'You are not wanted in an active danger zone.');
    if (message.action === 'resume') {
      if (units.some(unit => unit.targetId === userId && unit.state === 'arrest'))
        return reject('arrest_in_progress', 'Please wait for the arrest to finish.');
      surrendered.delete(userId);
    } else surrendered.add(userId);
    changed(); return { ok: true, surrendered: surrendered.has(userId) };
  }
  function step(at, duration) {
    const dt = Math.max(0, Math.min(.25, duration));
    let routeBudget = 1;
    for (const id of surrendered) if (!validTarget(players.get(id))) surrendered.delete(id);
    const candidates = [...players.values()].filter(validTarget).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const counts = new Map(candidates.map(player => [player.id, units.filter(unit => unit.targetId === player.id).length]));
    const awaitingResponse = new Set(candidates.filter(player => !counts.get(player.id)
      && usablePosts.some(post => navigation.free(post) && sees({ position: post }, player))).map(player => player.id));
    const unserved = awaitingResponse.size;
    let needed = Math.max(0, unserved - (R.maxUnits - units.length) - units.filter(unit => unit.state === 'return').length);
    for (const unit of [...units].reverse()) if (needed && unit.state !== 'arrest' && (counts.get(unit.targetId) ?? 0) > 1) {
      counts.set(unit.targetId, counts.get(unit.targetId) - 1); returning(unit, at); needed--;
    }
    for (const unit of units) {
      const player = players.get(unit.targetId);
      if (unit.state !== 'return' && (!validTarget(player)
        || candidates.length > R.maxUnits && at - unit.assignedAt >= R.responseMs)) returning(unit, at);
      if (unit.state !== 'return') {
        if (sees(unit, player)) {
          unit.lastSeen = [...player.position];
          if (unit.state === 'search') { unit.state = 'pursue'; unit.since = at; }
          if (distance(unit.position, player.position) <= R.arrestRange && (surrendered.has(player.id) || player.health === 0)) {
            if (unit.state !== 'arrest') { unit.state = 'arrest'; unit.since = at; unit.arrestAt = at; }
            if (at - unit.arrestAt >= R.arrestMs) {
              arrest(player); surrendered.delete(player.id);
              for (const other of units) if (other.targetId === player.id) returning(other, at);
            }
          } else if (unit.state === 'arrest') { unit.state = 'pursue'; unit.arrestAt = null; unit.since = at; }
        } else {
          if (unit.state !== 'search') { unit.state = 'search'; unit.since = at; unit.arrestAt = null; }
          if (at - unit.since >= R.searchMs) returning(unit, at);
        }
      }
      if (unit.state === 'arrest') continue;
      const goal = unit.state === 'return' ? unit.home : unit.lastSeen;
      let cached = routes.get(unit.id);
      if (routeBudget && (!cached || at - cached.at >= R.replanMs
        && (!cached.path.length || distance(cached.goal, goal) > .5))) {
        routeBudget--;
        cached = { at, goal: [...goal], path: navigation.route(unit.position, goal) ?? [] }; routes.set(unit.id, cached);
      }
      while (cached?.path.length && distance(unit.position, cached.path[0]) < .08) cached.path.shift();
      const next = cached?.path[0];
      if (next) {
        const length = distance(unit.position, next), space = unit.state === 'pursue' ? Math.max(0, distance(unit.position, unit.lastSeen) - R.standOff) : Infinity;
        const amount = Math.min(length, R.speed * dt, space);
        if (length > 0) {
          const position = [unit.position[0] + (next[0] - unit.position[0]) * amount / length,
            unit.position[1] + (next[1] - unit.position[1]) * amount / length];
          // Check the actual short step, including dynamic objects, even for a cached route.
          if (navigation.canTravel(unit.position, position)) {
            unit.yaw = Math.atan2(next[0] - unit.position[0], -(next[1] - unit.position[1]));
            unit.position = [...position, navigation.ground?.(position) ?? unit.position[2]];
          } else cached.path = [];
        }
      }
    }
    units = units.filter(unit => {
      const keep = unit.state !== 'return' || distance(unit.position, unit.home) > .2 && at - unit.since < R.returnMs;
      if (!keep) routes.delete(unit.id); return keep;
    });
    // Fair rounds: every candidate gets one response before higher stars add units.
    const ordered = candidates.length ? [...candidates.slice(cursor % candidates.length), ...candidates.slice(0, cursor % candidates.length)] : [];
    for (let round = 0; round < 3 && units.length < R.maxUnits; round++) for (const player of ordered) {
      if (units.length >= R.maxUnits) break;
      const count = units.filter(unit => unit.targetId === player.id).length;
      if (count > round || count >= Math.ceil(starsOf(player.id) / 2)) continue;
      // Fill unserved candidates first, including when existing officers are returning.
      if (round > 0 && ordered.some(other => awaitingResponse.has(other.id) && !units.some(unit => unit.targetId === other.id))) continue;
      const home = usablePosts.find(post => navigation.free(post) && sees({ position: post }, player));
      if (!home) continue;
      let slot = 0; while (units.some(unit => unit.id === `police:${slot}`)) slot++;
      units.push({ id: `police:${slot}`, position: [...home], home: [...home], yaw: 0,
        targetId: player.id, lastSeen: [...player.position], state: 'pursue', since: at, assignedAt: at, arrestAt: null });
      cursor = (candidates.findIndex(item => item.id === player.id) + 1) % Math.max(1, candidates.length);
    }
    if (units.length || surrendered.size) changed();
  }
  const snapshot = () => ({ units: units.map(({ id, position, yaw, targetId, state }) => ({ id, position: [...position], yaw, targetId, state })),
    surrendered: [...surrendered].sort(), eligible: [...players.values()].filter(validTarget).map(player => player.id).sort() });
  const checkpoint = () => ({ units: structuredClone(units), surrendered: [...surrendered].sort(), cursor });
  function validate(saved, playerIds = new Set(players.keys()), geometry = navigation) {
    if (!saved || Object.keys(saved).sort().join() !== 'cursor,surrendered,units' || !integer(saved.cursor)
      || !Array.isArray(saved.units) || saved.units.length > R.maxUnits || !Array.isArray(saved.surrendered)
      || saved.surrendered.length > 32 || new Set(saved.surrendered).size !== saved.surrendered.length
      || saved.surrendered.some(id => typeof id !== 'string' || !playerIds.has(id))
      || new Set(saved.units.map(unit => unit?.id)).size !== saved.units.length) throw new Error('Invalid police state');
    for (const unit of saved.units) {
      if (!unit || Object.keys(unit).sort().join() !== 'arrestAt,assignedAt,home,id,lastSeen,position,since,state,targetId,yaw'
        || !/^police:[0-5]$/.test(unit.id) || !point(unit.position) || !point(unit.home) || !point(unit.lastSeen)
        || !geometry?.free(unit.position) || geometry.ground && Math.abs(geometry.ground(unit.position) - unit.position[2]) > .25
        || !Number.isFinite(unit.yaw) || !states.includes(unit.state) || !stamp(unit.since) || !stamp(unit.assignedAt)
        || unit.since < unit.assignedAt || (unit.state === 'arrest' ? !stamp(unit.arrestAt) || unit.arrestAt !== unit.since : unit.arrestAt !== null)
        || (unit.state === 'return' ? unit.targetId !== null : typeof unit.targetId !== 'string' || !playerIds.has(unit.targetId))
        || !usablePosts.some(post => post.every((v, i) => v === unit.home[i]))) throw new Error('Invalid police unit');
    }
    return structuredClone(saved);
  }
  const load = saved => { units = saved.units; surrendered = new Set(saved.surrendered); cursor = saved.cursor; routes.clear(); };
  const clear = () => load({ units: [], surrendered: [], cursor: 0 });
  return { step, surrender, snapshot, checkpoint, validate, load, clear,
    held: id => surrendered.has(id) || units.some(unit => unit.targetId === id && unit.state === 'arrest') };
}
