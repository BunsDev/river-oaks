// All people, needs, resource costs and outcomes are fictional simulation rules.
// Source district locations anchor encounters; they do not identify real people.
import { createPersona } from './personas.js';
export const COMMUNITY_SCENARIOS = Object.freeze({
  heatwave: Object.freeze({
    title: 'Heatwave support', need: 'cooling supplies',
    description: 'Help six of eight neighbors through the afternoon heat. Cooling kits buy time; volunteer visits resolve a request.',
    supplies: 12, helpBudget: 4, supplyCost: 2, supplyRelief: 30,
    dispatchSeconds: 360, duration: 3600, growth: 0.014, initialNeed: 42,
    maxResupply: 0, offset: 0,
  }),
  storm: Object.freeze({
    title: 'Storm recovery', need: 'cleanup and power support',
    description: 'Reach six of eight neighbors after a storm. Cleanup takes longer, and supply kits offer limited relief. An active service-economy storm holds volunteer visits.',
    supplies: 10, helpBudget: 5, supplyCost: 2, supplyRelief: 24,
    dispatchSeconds: 540, duration: 4200, growth: 0.012, initialNeed: 48,
    maxResupply: 0, offset: 1,
  }),
  delivery: Object.freeze({
    title: 'Delivery disruption', need: 'essential deliveries',
    description: 'Restore essentials for six of eight neighbors. New service-economy completions replenish one kit per 25 jobs, up to four extra kits.',
    supplies: 10, helpBudget: 3, supplyCost: 2, supplyRelief: 45,
    dispatchSeconds: 420, duration: 3600, growth: 0.016, initialNeed: 36,
    maxResupply: 4, offset: 2,
  }),
});

const NAMES = ['Maya', 'Theo', 'June', 'Elias', 'Nora', 'Mateo', 'Iris', 'Samir', 'Hazel', 'Luca', 'Amara', 'Owen', 'Cleo', 'Ravi', 'Wren', 'Noel', 'Esme', 'Finn', 'Ada', 'Hugo', 'Zara', 'Remy', 'Lena', 'Nico'];
const ROLES = ['Weekend shopper', 'Café regular', 'Neighborhood resident', 'Gallery visitor', 'Concierge', 'Dog walker'];
const ACTIONS = new Set(['continue', 'pause', 'greet', 'redirect', 'seek_shelter', 'slow', 'stop']);
const SOURCES = new Set(['jev', 'local_rules', 'safety_override']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const isFinished = (state) => state.status === 'success' || state.status === 'failed';

function event(state, message) {
  state.events.push({ at: state.elapsed, message });
  if (state.events.length > 8) state.events.shift();
}

function makeLocals(world) {
  const locations = (world?.communityLocations ?? []).filter((location) => Array.isArray(location.position) && location.position.length >= 2 && location.position.every(Number.isFinite));
  const buildings = (world?.buildings ?? []).filter((house) => Array.isArray(house.center) && house.center.length >= 2 && house.center.every(Number.isFinite));
  const anchors = locations.length ? locations : buildings;
  const count = Math.min(24, anchors.length);
  return Array.from({ length: count }, (_, index) => {
    const house = anchors[Math.floor(index * anchors.length / count)];
    const yaw = (Number.isFinite(house.yaw_deg) ? house.yaw_deg : 0) * Math.PI / 180;
    const depth = Number.isFinite(house.size?.[1]) ? clamp(house.size[1], 0, 100) : 10;
    const distance = depth / 2 + 2.5;
    const anchorName = locations.length ? house.name : 'Neighborhood sidewalk';
    const persona = createPersona(index, NAMES[index], anchorName);
    return {
      id: `local-${String(index).padStart(2, '0')}`, name: persona.name, role: persona.role ?? ROLES[index % ROLES.length], persona,
      fictional: true, homeId: locations.length ? null : house.id, anchorId: house.id,
      anchorName,
      position: locations.length ? [house.position[0], house.position[1], house.position[2] ?? 0] : [house.center[0] - Math.sin(yaw) * distance, house.center[1] + Math.cos(yaw) * distance, house.center[2] ?? 0],
    };
  });
}

export function createCommunity(world) {
  const state = { locals: makeLocals(world), generation: 0, selectedId: null };
  chooseCommunityScenario(state, 'heatwave');
  return state;
}

export function chooseCommunityScenario(state, key) {
  if (!Object.hasOwn(COMMUNITY_SCENARIOS, key)) return false;
  const scenario = COMMUNITY_SCENARIOS[key], count = Math.min(8, state.locals.length);
  const targets = new Set(Array.from({ length: count }, (_, i) => (Math.floor(i * state.locals.length / count) + scenario.offset) % state.locals.length));
  Object.assign(state, {
    scenarioKey: key, scenario, status: 'ready', running: false, elapsed: 0,
    target: Math.min(6, count), supported: 0, unmet: 0,
    supplies: scenario.supplies, helpBudget: scenario.helpBudget,
    resupplied: 0, storm: false, jobs: [], events: [], result: null,
    generation: state.generation + 1, _accumulator: 0, _lastEconomyCompleted: null,
    _economyRemainder: 0, _packet: null, _appliedTick: -1,
  });
  state.locals.forEach((local, index) => {
    const priority = targets.has(index);
    Object.assign(local, {
      priority, need: priority ? scenario.initialNeed + index % 4 * 4 : 0,
      needKnown: false, status: priority ? 'needs_help' : 'comfortable',
      action: 'continue', source: 'local_rules', cooldownUntil: 0, reactionUntil: 0,
      lastInteraction: null, lastResult: null,
    });
  });
  event(state, `${scenario.title}: support ${state.target} fictional neighbors. Clock paused until you begin.`);
  return state;
}

function finish(state, status) {
  state.status = status;
  state.running = false;
  state.jobs = [];
  for (const local of state.locals) if (local.status === 'aid_en_route') local.status = 'needs_help';
  state.result = status === 'success'
    ? `${state.supported} neighbors supported. The community objective is complete.`
    : `${state.supported} of ${state.target} neighbors supported. The support window closed.`;
  event(state, state.result);
}

function assess(state) {
  state.supported = state.locals.filter((local) => local.priority && local.status === 'supported').length;
  state.unmet = state.locals.filter((local) => local.priority && local.status === 'unmet').length;
  const available = state.locals.filter((local) => local.priority && local.status !== 'unmet').length;
  if (state.target > 0 && state.supported >= state.target) finish(state, 'success');
  else if (available < state.target || state.elapsed >= state.scenario.duration) finish(state, 'failed');
}

function observeEconomy(state, economy) {
  const completed = economy?.metrics?.completed;
  if (!Number.isFinite(completed) || completed < 0) return;
  if (state._lastEconomyCompleted === null || completed < state._lastEconomyCompleted) {
    // Starting or resetting the service economy cannot award historical work.
    state._lastEconomyCompleted = completed;
    state._economyRemainder = 0;
    return;
  }
  state._economyRemainder += Math.floor(completed - state._lastEconomyCompleted);
  state._lastEconomyCompleted = completed;
  const kits = Math.min(Math.floor(state._economyRemainder / 25), state.scenario.maxResupply - state.resupplied);
  if (kits > 0) {
    state.supplies += kits;
    state.resupplied += kits;
    state._economyRemainder -= kits * 25;
    event(state, `${kits} supply ${kits === 1 ? 'kit' : 'kits'} replenished by new service completions.`);
  }
  state._economyRemainder = Math.min(state._economyRemainder, 24);
}

export function stepCommunity(state, realDelta, economy) {
  if (!state.running || isFinished(state) || !state.target || !Number.isFinite(realDelta) || realDelta <= 0) return state;
  state.status = 'running';
  state.storm = economy?.config?.storm === true;
  observeEconomy(state, economy);
  const staff = Number.isFinite(economy?.config?.staff) ? economy.config.staff : 80;
  const workRate = state.storm ? 0 : clamp(staff / 80, 0.5, 1.5);
  state._accumulator += Math.min(realDelta, 0.25) * 60;
  while (state._accumulator >= 1 - 1e-9 && state.running) {
    state._accumulator = Math.max(0, state._accumulator - 1);
    state.elapsed += 1;
    for (const local of state.locals) {
      if (local.reactionUntil <= state.elapsed) {
        local.action = state.storm ? 'seek_shelter' : 'continue';
        local.source = state.storm ? 'safety_override' : 'local_rules';
      }
      if (state.storm) { local.action = 'seek_shelter'; local.source = 'safety_override'; }
      if (!local.priority || ['supported', 'unmet'].includes(local.status)) continue;
      local.need = clamp(local.need + state.scenario.growth * (state.storm ? 1.3 : 1), 0, 100);
      if (local.need >= 100) {
        local.status = 'unmet';
        event(state, `${local.name}'s support window was missed.`);
      }
    }
    for (const job of state.jobs) {
      const local = state.locals.find((item) => item.id === job.localId);
      if (local.status !== 'aid_en_route') continue;
      job.progress = Math.min(job.duration, job.progress + workRate);
      if (job.progress >= job.duration) {
        local.need = 0;
        local.status = 'supported';
        event(state, `Volunteer visit complete: ${local.name}'s request is resolved.`);
      }
    }
    state.jobs = state.jobs.filter((job) => state.locals.find((local) => local.id === job.localId)?.status === 'aid_en_route');
    assess(state);
  }
  return state;
}

export function interactWithLocal(state, id, action) {
  const local = state.locals.find((item) => item.id === id);
  if (!local || !['ask', 'supply', 'dispatch'].includes(action)) return { ok: false, reason: 'invalid_interaction' };
  state.selectedId = id;
  const respond = (ok, reason, message) => {
    const result = { ok, reason, message, localId: id, action, generation: state.generation };
    local.lastResult = result;
    if (ok) local.lastInteraction = action;
    if (ok && ['supply', 'dispatch'].includes(action) && local.persona) local.persona.memory.supportReceived++;
    return result;
  };
  if (action === 'ask') {
    if (local.needKnown) return respond(false, 'already_asked', 'You already checked in. Their current need is shown below.');
    local.needKnown = true;
    local.action = state.storm ? 'seek_shelter' : 'greet';
    local.reactionUntil = state.elapsed + 120;
    return respond(true, 'needs_shared', local.priority ? `I could use ${state.scenario.need}. A visit would resolve it; supply kits help right away.` : 'I have what I need. Please check on the neighbors with an open request.');
  }
  if (isFinished(state)) return respond(false, 'finished', 'This community scenario has ended. Reset to try another approach.');
  if (!state.running) return respond(false, 'paused', 'Begin or resume the scenario before committing resources.');
  if (!local.needKnown) return respond(false, 'ask_first', 'Ask about their needs before choosing support.');
  if (!local.priority || local.status === 'supported') return respond(false, 'not_needed', 'This neighbor does not need more support.');
  if (local.status === 'unmet') return respond(false, 'window_missed', 'This neighbor missed their support window.');
  if (local.status === 'aid_en_route') return respond(false, 'already_dispatched', 'Help is already on the way; resources have been committed.');
  if (action === 'dispatch') {
    if (state.helpBudget < 1) return respond(false, 'no_help', 'All volunteer visits have been committed.');
    state.helpBudget -= 1;
    const duration = state.scenario.dispatchSeconds;
    state.jobs.push({ localId: id, generation: state.generation, progress: 0, duration });
    local.status = 'aid_en_route';
    event(state, `Volunteer dispatched to ${local.name}; arrival and support take simulation time.`);
    return respond(true, 'dispatched', 'Thank you. I will wait for the volunteer visit. My need can still grow until they arrive.');
  }
  if (local.cooldownUntil > state.elapsed) return respond(false, 'cooldown', 'Let this delivery settle before offering another kit.');
  if (state.supplies < state.scenario.supplyCost) return respond(false, 'no_supplies', 'There are not enough shared supplies for this delivery.');
  state.supplies -= state.scenario.supplyCost;
  local.need = Math.max(0, local.need - state.scenario.supplyRelief);
  local.cooldownUntil = state.elapsed + 120;
  if (local.need <= 8) { local.need = 0; local.status = 'supported'; }
  event(state, `${state.scenario.supplyCost} kits delivered to ${local.name}${local.status === 'supported' ? '; request resolved' : '; need reduced'}.`);
  assess(state);
  return respond(true, local.status === 'supported' ? 'supported' : 'relieved', local.status === 'supported' ? 'That covers what I need. Thank you for checking on me.' : 'That helps right away. I could still use another delivery or a volunteer visit.');
}

export function snapshotForLocal(state, id, interaction = 'ask', tick = 0) {
  const local = state.locals.find((item) => item.id === id);
  if (!local || !Number.isInteger(tick) || tick < 0) return null;
  state._packet = { id, tick, generation: state.generation };
  return {
    schema_version: 1, tick,
    agents: [{ id, kind: 'resident', position: [...local.position], activity: `neighbor ${String(interaction).slice(0, 12)}; ${state.scenarioKey}; need ${Math.round(local.need)}`.slice(0, 64), nearby: [{ id: 'visitor', kind: 'pedestrian', distance_m: 2 }], blocked: false, vehicle_distance_m: null }],
    weather: { storm: state.storm, rain: state.storm ? 1 : state.scenarioKey === 'storm' ? 0.3 : 0, humidity: state.scenarioKey === 'heatwave' ? 0.9 : 0.72 }, hour: 15,
  };
}

export function applyLocalReaction(state, id, response, context) {
  const packet = state._packet;
  if (!packet || !context || context.generation !== state.generation || packet.generation !== state.generation || packet.id !== id || packet.tick !== context.tick || state._appliedTick === context.tick) return false;
  if (!response || response.schema_version !== 1 || response.tick !== context.tick || !Number.isFinite(response.latency_ms) || response.latency_ms < 0 || !Array.isArray(response.decisions) || response.decisions.length !== 1) return false;
  const decision = response.decisions[0], local = state.locals.find((item) => item.id === id);
  if (!local || !decision || decision.id !== id || !ACTIONS.has(decision.action) || !SOURCES.has(decision.source)) return false;
  // Reactive pose only: inference cannot spend resources, plan visits or change needs.
  local.action = state.storm ? 'seek_shelter' : decision.action;
  local.source = state.storm ? 'safety_override' : decision.source;
  local.reactionUntil = state.elapsed + 120;
  state._appliedTick = context.tick;
  return true;
}
