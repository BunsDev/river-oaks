import { supportAvailability } from './community-presentation.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const finitePoint = p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite);
const thresholds = { visit: 0.30, wait: 0.30, ask: 0.50, supply: 0.75, dispatch: 0.75, shelter: 0.75 };
// Leave headroom inside the 2.8 m interaction range: a neighbor can keep
// walking while the next decision is in flight. Never aim for their feet.
const APPROACH_DISTANCE = 1.4;

// Keep coordinates in the executor; the model may select IDs, never invent positions.
export function visitorOptions(world, state, position, { visited = new Set(), blocked = new Set(), storm = state.storm } = {}) {
  const candidates = [], targets = new Map();
  const add = (id, action, label, target, extra = {}) => {
    if (blocked.has(id) || (target && !finitePoint(target))) return;
    candidates.push({ id, action, label: label.slice(0, 160), distance_m: target ? distance(position, target) : 0, ...extra });
    if (target) targets.set(id, target.slice(0, 2));
  };
  const shelters = (world.stores ?? []).map(store => ({ id: store.id, name: store.name,
    position: [store.facade[0] + store.outward[0] * 0.9, store.facade[1] + store.outward[1] * 0.9] }));
  const sheltered = shelters.some(stop => distance(position, stop.position) < 1.4);
  if (storm) {
    if (!sheltered) for (const stop of shelters.sort((a,b) => distance(position,a.position)-distance(position,b.position)).slice(0, 8)) {
      add(`shelter-${stop.id}`, 'shelter', `Take cover near ${stop.name}`, stop.position);
    }
  } else {
    const locals = state.locals.filter(local => !local.indoor).sort((a,b) => distance(position,a.position)-distance(position,b.position));
    for (const local of locals.slice(0, 16)) {
      const d = distance(position, local.position), availability = supportAvailability(state, local);
      const extra = { target_id: local.id, known: local.needKnown, needs_help: local.priority && local.status === 'needs_help',
        urgent: local.need >= 70, resolves_need: local.need - state.scenario.supplyRelief <= 8,
        cooldown: local.cooldownUntil > state.elapsed };
      if (d <= 2.8) {
        if (!local.needKnown) add(`ask-${local.id}`, 'ask', `Ask ${local.name} what would help`, local.position, extra);
        if (!availability.supply) add(`supply-${local.id}`, 'supply', `Bring supplies to ${local.name}`, local.position, extra);
        if (!availability.dispatch) add(`dispatch-${local.id}`, 'dispatch', `Arrange a volunteer visit for ${local.name}`, local.position, extra);
      } else if (!local.needKnown || !availability.supply || !availability.dispatch) {
        // Stop within speaking range; do not try to occupy another character's feet.
        const ratio = Math.max(0, (d - APPROACH_DISTANCE) / d);
        const target = [position[0] + (local.position[0] - position[0]) * ratio, position[1] + (local.position[1] - position[1]) * ratio];
        add(`visit-${local.id}`, 'visit', `Meet ${local.name}${extra.needs_help ? ' · open support request' : ''}`, target, extra);
      }
    }
    const stops = (world.communityLocations ?? []).map((stop, i) => ({ ...stop, id: `stop-${i}` }));
    for (const stop of stops.filter(stop => finitePoint(stop.position) && !visited.has(stop.id))
      .sort((a,b) => distance(position,a.position)-distance(position,b.position)).slice(0, 12)) {
      add(stop.id, 'visit', `Explore ${stop.name ?? 'the district'}`, stop.position);
    }
  }
  add('wait', 'wait', 'Wait and observe the district', null);
  return { candidates, targets, sheltered };
}

export function createAutoVisitor({ getWorld, getState, getPosition, getStorm, route, steer, halt, interact,
  decide = async (packet, signal) => {
    const response = await fetch('/v1/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet), signal });
    if (!response.ok) throw new Error('Decision bridge unavailable');
    return response.json();
  }, onStatus = () => {}, now = () => performance.now() }) {
  let enabled = false, epoch = 0, tick = 0, pending = null, navigation = null, next = 0;
  let generation, storm, lastPosition, stalled = 0, elapsed = 0;
  const visited = new Set(), blocked = new Map();
  const status = { enabled: false, phase: 'off', source: null, action: null, label: 'Auto off', reason: null, decisions: 0, arrivals: 0, interactions: 0 };
  const publish = changes => { Object.assign(status, changes, { enabled }); onStatus({ ...status }); };
  const invalidate = () => { epoch++; pending?.abort(); pending = null; navigation = null; halt(); };
  const options = () => visitorOptions(getWorld(), getState(), getPosition(), {
    visited, blocked: new Set([...blocked].filter(([, until]) => until > elapsed).map(([id]) => id)), storm: getStorm(),
  });
  const defer = (reason, label = 'Waiting for Jev') => {
    navigation = null; halt(); next = now() + 5000;
    publish({ phase: 'waiting', action: null, reason, label });
  };
  async function choose() {
    const controller = new AbortController(), version = epoch, state = getState(), selection = options();
    pending = controller;
    const packet = { schema_version: 1, tick: ++tick, generation: state.generation, storm: getStorm(), sheltered: selection.sheltered,
      running: state.running, finished: ['success','failed'].includes(state.status),
      supplies_available: state.supplies >= state.scenario.supplyCost, visits_available: state.helpBudget > 0, candidates: selection.candidates };
    const current = () => enabled && version === epoch && getState() === state && state.generation === packet.generation && getStorm() === packet.storm;
    publish({ phase: 'deciding', label: 'Jev is choosing the next stop', reason: null, action: null });
    let timer;
    try {
      const reply = await Promise.race([
        decide(packet, controller.signal),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Decision timed out')); }, 2000); }),
      ]);
      clearTimeout(timer);
      if (!current()) return;
      if (reply?.schema_version !== 1 || reply.tick !== packet.tick || reply.generation !== packet.generation) throw new Error('Stale decision rejected');
      const proposed = selection.candidates.find(c => c.id === reply.candidate_id);
      if (reply.source !== 'jev' || !proposed || !Number.isFinite(reply.confidence) || reply.confidence < thresholds[proposed.action] || reply.confidence > 1) {
        publish({ source: reply.source ?? 'unavailable' });
        defer(reply.reason ?? 'invalid_answer', reply.reason === 'not_configured' ? 'Jev is not connected' : 'Waiting for a confident Jev decision'); return;
      }
      const fresh = options(), candidate = fresh.candidates.find(c => c.id === reply.candidate_id);
      if (!candidate || !selection.candidates.some(c => c.id === candidate.id)) throw new Error('Action is no longer available');
      publish({ source: 'jev', decisions: status.decisions + 1, action: candidate.action, label: candidate.label, reason: null });
      if (candidate.action === 'wait') { defer('model_wait', 'Jev chose to wait'); return; }
      if (['ask', 'supply', 'dispatch'].includes(candidate.action)) {
        const result = interact(candidate.target_id, candidate.action);
        if (!result?.ok) throw new Error('Interaction no longer available');
        publish({ phase: 'interacting', interactions: status.interactions + 1, label: `${candidate.label} · ${result.message ?? 'done'}` });
        next = now() + 3000; return;
      }
      const target = fresh.targets.get(candidate.id);
      publish({ phase: 'routing' });
      const path = await route(getPosition().slice(0, 2), target);
      if (!current()) return;
      if (!Array.isArray(path) || !path.length || path.length > 1000 || !path.every(finitePoint) || distance(path.at(-1), target) > 0.5) {
        blocked.set(candidate.id, elapsed + 60); throw new Error('Destination has no accessible route');
      }
      navigation = { candidate, path, target, age: 0 };
      lastPosition = getPosition(); stalled = 0;
      publish({ phase: 'walking' });
    } catch (error) {
      if (current()) defer(error.message);
    } finally {
      clearTimeout(timer);
      if (pending === controller) pending = null;
    }
  }
  return {
    get status() { return { ...status }; },
    start() {
      if (!getWorld() || !getState() || !getPosition()) return;
      invalidate(); enabled = true; generation = getState().generation; storm = getStorm(); next = 0;
      publish({ phase: 'ready', source: null, label: 'Auto visit started', reason: null });
    },
    stop(reason = 'Auto off') {
      enabled = false; invalidate(); publish({ phase: 'off', source: null, label: reason, action: null, reason: null });
    },
    update(delta) {
      if (!enabled || !Number.isFinite(delta) || delta <= 0) return;
      const dt = Math.min(delta, 0.08); elapsed += dt;
      if (getState()?.generation !== generation) { this.stop('Scenario changed · auto off'); return; }
      if (getStorm() !== storm) { invalidate(); storm = getStorm(); next = 0; publish({ phase: 'ready', label: storm ? 'Finding cover' : 'Weather cleared' }); }
      if (navigation) {
        const position = getPosition(), { candidate, path } = navigation;
        const fresh = options();
        // A moving resident or newly unavailable action must not leave an obsolete route running.
        if (candidate.target_id) {
          const local = getState().locals.find(l => l.id === candidate.target_id);
          if (!local || distance(local.position, navigation.target) > 5 || (!fresh.candidates.some(c => c.id === candidate.id) && distance(position, local.position) > 2.8)) {
            navigation = null; halt(); next = 0; return;
          }
          if (distance(position, local.position) <= APPROACH_DISTANCE + 0.2) path.length = 0;
        }
        while (path.length && distance(position, path[0]) < 0.3) path.shift();
        if (!path.length) {
          if (!candidate.target_id) visited.add(candidate.id);
          // A moving neighbor can leave speaking range during a fixed arrival
          // pause. Recheck their available actions immediately; static stops rest.
          navigation = null; halt(); next = now() + (candidate.target_id ? 0 : 500);
          publish({ phase: 'arrived', arrivals: status.arrivals + 1, label: `Arrived · ${candidate.label}` }); return;
        }
        navigation.age += dt;
        if (lastPosition && distance(position, lastPosition) < 0.002) stalled += dt; else stalled = 0;
        lastPosition = position;
        if (stalled > 4 || navigation.age > 180) {
          blocked.set(candidate.id, elapsed + 60); defer('Route obstructed · choosing another destination'); return;
        }
        steer(path[0], dt);
      } else if (!pending && now() >= next) void choose();
    },
  };
}
