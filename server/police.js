// Bounded authoritative foot patrol. Navigation and sight remain the world's existing
// geometry services; only last-seen positions may feed a route while sight is lost. Since
// #640 an officer sees ahead of it (with a close-contact exception), reports what it sees so
// stars do not cool off under watch, and may grab a refusing wanted player through a
// telegraphed, avoidable contact that hands over to the existing arrest.
export const POLICE_RULES = Object.freeze({ maxUnits: 6, speed: 3.4, sightRadius: 35,
  arrestRange: 1.5, standOff: 1.25, arrestMs: 1400, searchMs: 8000, responseMs: 12000,
  returnMs: 15000, replanMs: 1000,
  // #640, proposed tuning to be playtested (docs/crime.md).
  fieldOfViewDegrees: 140, closeContact: 3, scanRate: Math.PI / 2,
  refusalMs: 4000, grabRange: 1.5, grabReach: 1.6, grabHeight: 0.6, grabWindupMs: 900, grabArcDegrees: 60, grabRecoverMs: 2000 });
const R = POLICE_RULES;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const stamp = n => Number.isFinite(n) && n >= 0;
const states = ['pursue', 'search', 'grab', 'arrest', 'return'];
// yaw is atan2(east, -north); an officer's forward is (sin yaw, -cos yaw) in east/north.
const facing = yaw => [Math.sin(yaw), -Math.cos(yaw)];
const yawToward = (from, to) => Math.atan2(to[0] - from[0], -(to[1] - from[1]));
const within = (forward, from, to, degrees) => {
  const east = to[0] - from[0], north = to[1] - from[1], length = Math.hypot(east, north);
  return length < 1e-6 || (forward[0] * east + forward[1] * north) / length >= Math.cos(degrees * Math.PI / 180) - 1e-9;
};
const reject = (error, message) => ({ ok: false, error, message });

export function createPolice({ players, starsOf, eligible, navigation, posts, sight, arrest, changed, observe = () => {}, evading = () => false, participating = () => false }) {
  // subdued: player id -> the officer whose grab landed; only that officer's arrest or release ends it.
  let units = [], surrendered = new Set(), subdued = new Map(), cursor = 0;
  // Paths are disposable caches, not authority. Restore recalculates them from current
  // geometry and last-seen positions; each tick permits at most one bounded route search.
  const routes = new Map();
  const usablePosts = posts.filter(p => point(p) && navigation?.free(p));
  const validTarget = player => Boolean(player && starsOf(player.id) > 0 && eligible(player));
  // A post (dispatch) sees all round; an officer sees within its field of view, or anything at
  // close contact, always along a clear chest-height line.
  const sees = (unit, player) => distance(unit.position, player.position) <= R.sightRadius
    && Math.abs(unit.position[2] - player.position[2]) <= 2
    && (unit.yaw === undefined || distance(unit.position, player.position) <= R.closeContact || within(facing(unit.yaw), unit.position, player.position, R.fieldOfViewDegrees / 2))
    && sight(unit.position, player.position);
  const returning = (unit, at) => {
    if (unit.targetId && subdued.get(unit.targetId) === unit.id) subdued.delete(unit.targetId);
    unit.state = 'return'; unit.targetId = null; unit.since = at; unit.arrestAt = null; unit.grabDirection = null; unit.closeSince = null; routes.delete(unit.id);
  };
  function surrender(userId, message) {
    if (!message || Object.keys(message).some(key => !['type', 'action'].includes(key))
      || message.type !== 'surrender' || message.action !== undefined && !['offer', 'resume'].includes(message.action))
      return reject('invalid_surrender', 'That is not a surrender the town understands.');
    const player = players.get(userId);
    if (!validTarget(player)) return reject('not_wanted', 'You are not wanted in an active danger zone.');
    if (message.action === 'resume') {
      if (subdued.has(userId) || units.some(unit => unit.targetId === userId && unit.state === 'arrest'))
        return reject('arrest_in_progress', 'Please wait for the arrest to finish.');
      surrendered.delete(userId);
    } else surrendered.add(userId);
    changed(); return { ok: true, surrendered: surrendered.has(userId) };
  }
  function step(at, duration) {
    const dt = Math.max(0, Math.min(.25, duration));
    let routeBudget = 1;
    for (const id of surrendered) if (!validTarget(players.get(id))) surrendered.delete(id);
    for (const [id] of subdued) if (!validTarget(players.get(id))) subdued.delete(id);
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
      if (unit.state === 'grab' && at - unit.since >= R.grabWindupMs) {
        // Contact: the town's own positions now, against the arc fixed when the grab began.
        const contact = unit.since + R.grabWindupMs;
        if (!surrendered.has(player.id) && participating(player.id) && sees(unit, player) && distance(unit.position, player.position) <= R.grabReach
          && Math.abs(unit.position[2] - player.position[2]) <= R.grabHeight
          && within(unit.grabDirection, unit.position, player.position, R.grabArcDegrees) && !evading(player.id, contact)) subdued.set(player.id, unit.id);
        unit.state = 'pursue'; unit.since = at; unit.grabDirection = null; unit.recoverUntil = subdued.has(player.id) ? 0 : at + R.grabRecoverMs;
      }
      let watching = false;
      if (unit.state !== 'return' && unit.state !== 'grab') {
        if (sees(unit, player)) {
          watching = true;
          unit.lastSeen = [...player.position];
          observe(player.id, at);
          if (unit.state === 'search') { unit.state = 'pursue'; unit.since = at; }
          const gap = distance(unit.position, player.position);
          // The officer whose grab landed arrests from where it holds the player (grab reach).
          if (gap <= (subdued.get(player.id) === unit.id ? R.grabReach : R.arrestRange) && (surrendered.has(player.id) || subdued.has(player.id) || player.health === 0)) {
            if (unit.state !== 'arrest') { unit.state = 'arrest'; unit.since = at; unit.arrestAt = at; }
            if (at - unit.arrestAt >= R.arrestMs) {
              arrest(player); surrendered.delete(player.id); subdued.delete(player.id);
              for (const other of units) if (other.targetId === player.id) returning(other, at);
            }
          } else if (unit.state === 'arrest') { unit.state = 'pursue'; unit.arrestAt = null; unit.since = at; if (subdued.get(player.id) === unit.id) subdued.delete(player.id); }
          else {
            // In contact, the officer offers surrender for refusalMs; an active crime participant
            // who refuses is then grabbed after a telegraph. Anyone else is only followed.
            const offering = gap <= R.grabRange && Math.abs(unit.position[2] - player.position[2]) <= R.grabHeight && !surrendered.has(player.id) && participating(player.id);
            unit.closeSince = offering ? unit.closeSince ?? at : null;
            if (offering && at - unit.closeSince >= R.refusalMs && at >= unit.recoverUntil && !units.some(other => other.targetId === player.id && other.state === 'grab')
              && within(facing(unit.yaw), unit.position, player.position, R.fieldOfViewDegrees / 2)) {
              unit.state = 'grab'; unit.since = at; unit.yaw = yawToward(unit.position, player.position); unit.grabDirection = facing(unit.yaw); routes.delete(unit.id);
            }
          }
        } else {
          if (unit.state !== 'search') { unit.state = 'search'; unit.since = at; unit.arrestAt = null; unit.closeSince = null; if (subdued.get(player.id) === unit.id) subdued.delete(player.id); }
          if (at - unit.since >= R.searchMs) returning(unit, at);
        }
      } else if (unit.state === 'grab' && sees(unit, player)) observe(player.id, at);
      if (unit.state === 'arrest' || unit.state === 'grab') continue;
      const goal = unit.state === 'return' ? unit.home : unit.lastSeen;
      let cached = routes.get(unit.id);
      if (routeBudget && (!cached || at - cached.at >= R.replanMs
        && (!cached.path.length || distance(cached.goal, goal) > .5))) {
        routeBudget--;
        cached = { at, goal: [...goal], path: navigation.route(unit.position, goal) ?? [] }; routes.set(unit.id, cached);
      }
      while (cached?.path.length && distance(unit.position, cached.path[0]) < .08) cached.path.shift();
      const next = cached?.path[0];
      // Standing at stand-off, an officer faces its target; searching, it looks around.
      if (unit.state === 'pursue' && distance(unit.position, unit.lastSeen) <= R.standOff + .05) unit.yaw = yawToward(unit.position, unit.lastSeen);
      if (unit.state === 'search' && (!next || distance(unit.position, unit.lastSeen) < .5)) unit.yaw = Math.atan2(Math.sin(unit.yaw + R.scanRate * dt), Math.cos(unit.yaw + R.scanRate * dt));
      if (next) {
        const length = distance(unit.position, next), space = unit.state === 'pursue' ? Math.max(0, distance(unit.position, unit.lastSeen) - R.standOff) : Infinity;
        const amount = Math.min(length, R.speed * dt, space);
        if (length > 0) {
          const position = [unit.position[0] + (next[0] - unit.position[0]) * amount / length,
            unit.position[1] + (next[1] - unit.position[1]) * amount / length];
          // Check the actual short step, including dynamic objects, even for a cached route.
          if (navigation.canTravel(unit.position, position)) {
            // An officer watching its target keeps its eyes on it while it moves; otherwise it
            // looks where it goes. (The rendered body faces its travel either way.)
            unit.yaw = watching ? yawToward(position, unit.lastSeen) : Math.atan2(next[0] - unit.position[0], -(next[1] - unit.position[1]));
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
      units.push({ id: `police:${slot}`, position: [...home], home: [...home], yaw: yawToward(home, player.position),
        targetId: player.id, lastSeen: [...player.position], state: 'pursue', since: at, assignedAt: at, arrestAt: null, grabDirection: null, recoverUntil: 0, closeSince: null });
      cursor = (candidates.findIndex(item => item.id === player.id) + 1) % Math.max(1, candidates.length);
    }
    if (units.length || surrendered.size || subdued.size) changed();
  }
  let clock = 0;
  const snapshot = (at = clock) => ({ units: units.map(({ id, position, yaw, targetId, state, since }) => ({ id, position: [...position], yaw, targetId, state,
    ...(state === 'grab' ? { remainingMs: Math.max(0, Math.round(since + R.grabWindupMs - at)) } : {}) })),
    surrendered: [...surrendered].sort(), subdued: [...subdued.keys()].sort(), eligible: [...players.values()].filter(validTarget).map(player => player.id).sort() });
  const checkpoint = () => ({ units: structuredClone(units), surrendered: [...surrendered].sort(), subdued: [...subdued].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), cursor });
  // v17 (#640) adds grabs and subdued players; a v16 town had neither.
  function validate(saved, playerIds = new Set(players.keys()), geometry = navigation, version = 17) {
    if (version < 17) {
      // An untouched v17 section (nobody pursued) is the same as none, as for crime; real grabs
      // or subdued players cannot ride in an older envelope.
      if (saved && Array.isArray(saved.subdued) && !saved.subdued.length && Array.isArray(saved.units) && !saved.units.length) {
        const { subdued, ...rest } = saved; saved = rest;
      }
      if (!saved || Object.hasOwn(saved, 'subdued') || !Array.isArray(saved.units)
        || saved.units.some(unit => !unit || ['grabDirection', 'recoverUntil', 'closeSince'].some(key => Object.hasOwn(unit, key)) || unit.state === 'grab'))
        throw new Error('Invalid police version');
      saved = { ...saved, subdued: [], units: saved.units.map(unit => ({ ...unit, grabDirection: null, recoverUntil: 0, closeSince: null })) };
    }
    if (!saved || Object.keys(saved).sort().join() !== 'cursor,subdued,surrendered,units' || !integer(saved.cursor)
      || !Array.isArray(saved.units) || saved.units.length > R.maxUnits || !Array.isArray(saved.surrendered)
      || saved.surrendered.length > 32 || new Set(saved.surrendered).size !== saved.surrendered.length
      || saved.surrendered.some(id => typeof id !== 'string' || !playerIds.has(id))
      // A subdued player is held by an officer still on them, pursuing or arresting.
      || !Array.isArray(saved.subdued) || saved.subdued.length > R.maxUnits || new Set(saved.subdued.map(entry => entry?.[0])).size !== saved.subdued.length
      || saved.subdued.some(entry => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !playerIds.has(entry[0])
        || !saved.units.some(unit => unit?.id === entry[1] && unit.targetId === entry[0] && ['pursue', 'arrest'].includes(unit.state)))
      || new Set(saved.units.map(unit => unit?.id)).size !== saved.units.length) throw new Error('Invalid police state');
    for (const unit of saved.units) {
      if (!unit || Object.keys(unit).sort().join() !== 'arrestAt,assignedAt,closeSince,grabDirection,home,id,lastSeen,position,recoverUntil,since,state,targetId,yaw'
        || !stamp(unit.recoverUntil) || unit.closeSince !== null && !stamp(unit.closeSince) || (unit.state === 'grab' ? !Array.isArray(unit.grabDirection) || unit.grabDirection.length !== 2
          || !unit.grabDirection.every(Number.isFinite) || Math.abs(Math.hypot(...unit.grabDirection) - 1) > 1e-6 : unit.grabDirection !== null)
        || !/^police:[0-5]$/.test(unit.id) || !point(unit.position) || !point(unit.home) || !point(unit.lastSeen)
        || !geometry?.free(unit.position) || geometry.ground && Math.abs(geometry.ground(unit.position) - unit.position[2]) > .25
        || !Number.isFinite(unit.yaw) || !states.includes(unit.state) || !stamp(unit.since) || !stamp(unit.assignedAt)
        || unit.since < unit.assignedAt || (unit.state === 'arrest' ? !stamp(unit.arrestAt) || unit.arrestAt !== unit.since : unit.arrestAt !== null)
        || (unit.state === 'return' ? unit.targetId !== null : typeof unit.targetId !== 'string' || !playerIds.has(unit.targetId))
        || !usablePosts.some(post => post.every((v, i) => v === unit.home[i]))) throw new Error('Invalid police unit');
    }
    return structuredClone(saved);
  }
  // `at`: the restoring town's clock. A grab it slept through more than LATE_GRAB is called off
  // (nobody is grabbed after a pause they could not react to), and timers a writer's clock left in
  // the future are brought back to now.
  const LATE_GRAB = 250;
  const load = (saved, at = null) => {
    units = saved.units; surrendered = new Set(saved.surrendered); subdued = new Map(saved.subdued ?? []); cursor = saved.cursor; routes.clear();
    if (at === null) return;
    for (const unit of units) {
      if (unit.state === 'grab' && unit.since + R.grabWindupMs + LATE_GRAB < at) Object.assign(unit, { state: 'pursue', since: at, grabDirection: null, recoverUntil: at + R.grabRecoverMs });
      if (unit.assignedAt > at) unit.assignedAt = at;
      if (unit.since > at) { unit.since = at; if (unit.arrestAt !== null) unit.arrestAt = at; }
      if (unit.closeSince !== null && unit.closeSince > at) unit.closeSince = at;
      unit.recoverUntil = Math.min(unit.recoverUntil, at + R.grabRecoverMs);
    }
  };
  const clear = () => load({ units: [], surrendered: [], subdued: [], cursor: 0 });
  return { step(at, duration) { clock = at; step(at, duration); }, surrender, snapshot, checkpoint, validate, load, clear,
    held: id => surrendered.has(id) || subdued.has(id) || units.some(unit => unit.targetId === id && unit.state === 'arrest'),
    // Police have hold of them (a grab landed or an arrest is under way), as opposed to surrender.
    captured: id => subdued.has(id) || units.some(unit => unit.targetId === id && unit.state === 'arrest') };
}
