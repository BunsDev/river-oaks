const MAX_WORKERS = 300;
const MAX_JOBS = 2000;
const TIME_SCALE = 60;
const ACTIONS = new Set(['continue', 'slow', 'pause', 'stop', 'seek_shelter', 'redirect', 'greet']);
const SOURCES = new Set(['jev', 'local_rules', 'safety_override']);
const DEFAULTS = { demand: 1, fee: 18, wage: 24, staff: 80, storm: false };

// Synthetic demo assumptions: 1,620 requests/hour at demand1 and fee$18,
// exponential price elasticity, delivery service45s/$2, landscaping120s/$5.
// The service scheduler is local; Jev supplies only bounded immediate micro-actions.
function boundedConfig(previous, patch = {}) {
  const result = { ...previous };
  const bounds = { demand: [0, 3], fee: [1, 100], wage: [0, 100], staff: [20, 300] };
  if (!patch || typeof patch !== 'object') return result;
  for (const [key, [low, high]] of Object.entries(bounds)) {
    if (typeof patch[key] === 'number' && Number.isFinite(patch[key])) {
      result[key] = Math.max(low, Math.min(high, key === 'staff' ? Math.round(patch[key]) : patch[key]));
    }
  }
  if (typeof patch.storm === 'boolean') result.storm = patch.storm;
  return result;
}

function makeRoute(road) {
  const segments = [];
  let length = 0;
  for (let index = 1; index < (road.points?.length ?? 0); index += 1) {
    const sourceA = road.points[index - 1], sourceB = road.points[index];
    if (![sourceA, sourceB].every((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite))) continue;
    const a = [sourceA[0], sourceA[1], sourceA[2] ?? 0], b = [sourceB[0], sourceB[1], sourceB[2] ?? 0];
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (span <= 0) continue;
    segments.push({ a, b, offset: length, span });
    length += span;
  }
  return length ? { id: road.id, segments, length } : null;
}

function routePosition(route, distance) {
  const clamped = Math.max(0, Math.min(route.length, distance));
  const segment = route.segments.find((part) => part.offset + part.span >= clamped) ?? route.segments.at(-1);
  const fraction = (clamped - segment.offset) / segment.span;
  return segment.a.map((value, axis) => value + (segment.b[axis] - value) * fraction);
}

function event(state, type, message) {
  state.events.push({ at: state.elapsed, type, message });
  if (state.events.length > 8) state.events.splice(0, state.events.length - 8);
}

function enforceStorm(state) {
  if (!state.config.storm) return;
  for (const worker of state.workers) {
    if (!worker.active) continue;
    worker.action = 'seek_shelter';
    worker.source = 'safety_override';
    worker._redirectPending = false;
  }
}

function updateMetrics(state) {
  const metrics = state.metrics;
  metrics.queued = state.jobs.length;
  metrics.active = state.workers.filter((worker) => worker.active && worker.job).length;
  metrics.cost = metrics.laborCost + metrics.serviceCost;
  metrics.profit = metrics.revenue - metrics.cost;
  metrics.servedPercent = metrics.requested ? metrics.completed / metrics.requested * 100 : 0;
  const latency = state.decisionStats.latency_ms;
  state.decisionStats = { jev: 0, local_rules: 0, safety_override: 0, latency_ms: latency };
  for (const worker of state.workers) if (worker.active) state.decisionStats[worker.source] += 1;
}

export function createEconomy(world, config = {}) {
  const settings = boundedConfig(DEFAULTS, config);
  const routes = (world.roads ?? []).map(makeRoute).filter(Boolean);
  const state = {
    config: settings,
    running: false,
    elapsed: 0,
    tick: 0,
    workers: [],
    jobs: [],
    routes,
    metrics: { completed: 0, queued: 0, revenue: 0, cost: 0, profit: 0, servedPercent: 0, laborCost: 0, serviceCost: 0, requested: 0, lost: 0, active: 0 },
    decisionStats: { jev: 0, local_rules: 0, safety_override: 0, latency_ms: 0 },
    events: [],
    _accumulator: 0,
    _demandRemainder: 0,
    _revision: 0,
    _packetRevision: -1,
    _packetIds: new Set(),
    _appliedTick: -1,
    _queueFull: false,
  };
  for (let index = 0; index < MAX_WORKERS; index += 1) {
    const route = routes.length ? routes[(index * 37) % routes.length] : null;
    const distance = route ? route.length * ((index * 0.61803398875) % 1) : 0;
    state.workers.push({
      id: `worker-${String(index).padStart(3, '0')}`,
      kind: index % 3 === 0 ? 'landscaper' : 'delivery',
      position: route ? routePosition(route, distance) : [0, 0, 0],
      action: 'continue',
      source: 'local_rules',
      active: index < settings.staff,
      progress: 0,
      job: null,
      route,
      distance,
      direction: 1,
      _decisionUntil: 0,
      _redirectPending: false,
    });
  }
  enforceStorm(state);
  updateMetrics(state);
  event(state, 'ready', 'Synthetic service economy ready; local scheduling, 60× clock.');
  return state;
}

function generateDemand(state) {
  const rate = 0.45 * state.config.demand * Math.exp(-0.045 * (state.config.fee - 18));
  state._demandRemainder += rate;
  let outstanding = state.jobs.length + state.metrics.active;
  while (state._demandRemainder >= 1 - 1e-9) {
    state._demandRemainder = Math.max(0, state._demandRemainder - 1);
    state.metrics.requested += 1;
    const sequence = state.metrics.requested;
    if (outstanding >= MAX_JOBS) {
      state.metrics.lost += 1;
      if (!state._queueFull) event(state, 'capacity', 'Queue limit reached; additional requests count as unserved.');
      state._queueFull = true;
      continue;
    }
    state._queueFull = false;
    const kind = sequence % 3 === 0 ? 'landscaper' : 'delivery';
    state.jobs.push({
      id: sequence, kind,
      fee: state.config.fee * (kind === 'landscaper' ? 1.6 : 1),
      serviceCost: kind === 'landscaper' ? 5 : 2,
      serviceSeconds: kind === 'landscaper' ? 120 : 45,
      created: state.elapsed,
    });
    outstanding += 1;
  }
}

function assignJob(state, worker) {
  const index = state.jobs.findIndex((job) => job.kind === worker.kind);
  if (index === -1) return;
  const job = state.jobs.splice(index, 1)[0];
  const target = worker.distance <= worker.route.length / 2 ? worker.route.length : 0;
  worker.direction = target > worker.distance ? 1 : -1;
  worker.job = { ...job, phase: 'travel', target, traveled: 0, serviceElapsed: 0 };
  worker.progress = 0;
}

function advanceWorker(state, worker) {
  if (!worker.active || !worker.route) return;
  if (state.config.storm) return;
  if (worker._decisionUntil <= state.elapsed && (worker.action !== 'continue' || worker.source !== 'local_rules')) {
    worker.action = 'continue';
    worker.source = 'local_rules';
    worker._redirectPending = false;
  }
  if (!worker.job) assignJob(state, worker);
  if (!worker.job) return; // Idle workers remain exactly where their last service ended.
  const job = worker.job;
  if (worker._redirectPending) {
    job.target = job.target > 0 ? 0 : worker.route.length;
    job.phase = 'travel';
    job.serviceElapsed = 0;
    worker.direction = job.target > worker.distance ? 1 : -1;
    worker._redirectPending = false;
  }
  if (['pause', 'stop', 'seek_shelter', 'greet'].includes(worker.action)) return;
  const rate = worker.action === 'slow' ? 0.35 : 1;
  if (job.phase === 'travel') {
    const speed = (worker.kind === 'delivery' ? 5.2 : 1.4) * rate;
    const remaining = Math.abs(job.target - worker.distance);
    const distance = Math.min(remaining, speed);
    worker.distance += distance * worker.direction;
    job.traveled += distance;
    worker.position = routePosition(worker.route, worker.distance);
    const left = Math.abs(job.target - worker.distance);
    worker.progress = 0.7 * (job.traveled / Math.max(0.001, job.traveled + left));
    if (left < 1e-7) { job.phase = 'service'; worker.progress = 0.7; }
    return;
  }
  job.serviceElapsed += rate;
  worker.progress = Math.min(1, 0.7 + 0.3 * job.serviceElapsed / job.serviceSeconds);
  if (job.serviceElapsed < job.serviceSeconds) return;
  state.metrics.completed += 1;
  state.metrics.revenue += job.fee;
  state.metrics.serviceCost += job.serviceCost;
  event(state, 'completed', `${worker.kind === 'landscaper' ? 'Landscaping' : 'Delivery'} job ${job.id} completed · $${job.fee.toFixed(2)}.`);
  worker.job = null;
  worker.progress = 1;
}

export function stepEconomy(state, realDelta) {
  if (!state.running || typeof realDelta !== 'number' || !Number.isFinite(realDelta) || realDelta <= 0) return state;
  state._accumulator += Math.min(realDelta, 0.25) * TIME_SCALE;
  // A fixed one-second quantum makes render frame splitting irrelevant to work and wages.
  while (state._accumulator >= 1 - 1e-9) {
    state._accumulator = Math.max(0, state._accumulator - 1);
    state.elapsed += 1;
    state.metrics.laborCost += state.config.staff * state.config.wage / 3600;
    enforceStorm(state);
    generateDemand(state);
    for (const worker of state.workers) advanceWorker(state, worker);
    updateMetrics(state);
  }
  return state;
}

export function updateEconomyConfig(state, patch) {
  const next = boundedConfig(state.config, patch);
  if (Object.keys(DEFAULTS).every((key) => next[key] === state.config[key])) return state;
  const recovering = state.config.storm && !next.storm;
  const stormChanged = state.config.storm !== next.storm;
  state.config = next;
  state._revision += 1;
  state.workers.forEach((worker, index) => {
    const active = index < next.staff;
    if (!active && worker.job) {
      // Unfinished work is returned to the bounded queue. Labor already paid is retained.
      const { phase, target, traveled, serviceElapsed, ...job } = worker.job;
      state.jobs.push(job);
      worker.job = null;
      worker.progress = 0;
    }
    if (active !== worker.active || recovering) {
      worker.action = 'continue';
      worker.source = 'local_rules';
      worker._decisionUntil = 0;
      worker._redirectPending = false;
    }
    worker.active = active;
  });
  state.jobs.sort((a, b) => a.id - b.id);
  enforceStorm(state);
  updateMetrics(state);
  event(state, stormChanged ? 'weather' : 'policy', stormChanged ? (next.storm ? 'Storm protection: service paused; staffed wages continue.' : 'Storm cleared: local service work can resume.') : `Policy updated: ${next.staff} staff, $${next.fee.toFixed(2)} base fee, $${next.wage.toFixed(2)}/hour wage.`);
  return state;
}

export function economyPacket(state) {
  enforceStorm(state);
  updateMetrics(state);
  state.tick += 1;
  state._packetRevision = state._revision;
  const active = state.workers.filter((worker) => worker.active);
  const radius = 30;
  const buckets = new Map();
  const cell = (position) => [Math.floor(position[0] / radius), Math.floor(position[1] / radius)];
  for (const worker of active) {
    const key = cell(worker.position).join(',');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(worker);
  }
  const agents = active.map((worker) => {
    const job = worker.job ? `job${worker.job.id} ${worker.job.phase}` : 'available';
    const fee = worker.job?.fee ?? state.config.fee;
    const [east, north] = cell(worker.position);
    const nearby = [];
    for (let x = east - 1; x <= east + 1; x += 1) {
      for (let y = north - 1; y <= north + 1; y += 1) {
        for (const other of buckets.get(`${x},${y}`) ?? []) {
          if (other.id === worker.id) continue;
          const distance = Math.hypot(...other.position.map((value, axis) => value - worker.position[axis]));
          if (distance <= radius) nearby.push({ id: other.id, kind: other.kind, distance_m: distance });
        }
      }
    }
    nearby.sort((a, b) => a.distance_m - b.distance_m || (a.id < b.id ? -1 : 1));
    return {
      id: worker.id, kind: worker.kind, position: [...worker.position],
      activity: `${worker.kind} ${job}; queue${state.metrics.queued}; fee$${fee.toFixed(0)}`.slice(0, 64),
      nearby: nearby.slice(0, 4), blocked: false, vehicle_distance_m: null,
    };
  });
  state._packetIds = new Set(agents.map((agent) => agent.id));
  return { schema_version: 1, tick: state.tick, agents, weather: { storm: state.config.storm, rain: state.config.storm ? 1 : 0, humidity: state.config.storm ? 0.94 : 0.72 }, hour: 12 };
}

export function applyEconomyDecisions(state, response) {
  // This local safety rule applies before validating or accepting any remote response.
  enforceStorm(state);
  updateMetrics(state);
  if (!response || response.schema_version !== 1 || !Number.isInteger(response.tick) || response.tick !== state.tick || state._appliedTick === response.tick || state._packetRevision !== state._revision) return false;
  if (!Array.isArray(response.decisions) || response.decisions.length > MAX_WORKERS || response.decisions.length === 0 || !Number.isFinite(response.latency_ms) || response.latency_ms < 0) return false;
  const seen = new Set();
  for (const decision of response.decisions) {
    if (!decision || !state._packetIds.has(decision.id) || seen.has(decision.id) || !ACTIONS.has(decision.action) || !SOURCES.has(decision.source)) return false;
    seen.add(decision.id);
  }
  const byId = new Map(state.workers.map((worker) => [worker.id, worker]));
  for (const decision of response.decisions) {
    const worker = byId.get(decision.id);
    worker.action = decision.action;
    worker.source = decision.source;
    worker._decisionUntil = state.elapsed + (decision.action === 'greet' ? 6 : 180);
    worker._redirectPending = decision.action === 'redirect';
  }
  state._appliedTick = response.tick;
  state.decisionStats.latency_ms = response.latency_ms;
  enforceStorm(state);
  updateMetrics(state);
  return true;
}
