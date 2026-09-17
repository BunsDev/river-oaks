import { createEconomy, stepEconomy, updateEconomyConfig, economyPacket, applyEconomyDecisions } from './economy.js';

const PRESETS = {
  steady: { demand: 1, fee: 18, wage: 24, staff: 80, storm: false, description: 'A normal afternoon. Keep the waiting queue low and operating results positive.' },
  demand: { demand: 2.2, fee: 18, wage: 24, staff: 80, storm: false, description: 'Weekend orders surge. Add staff or adjust the fee to balance demand and capacity.' },
  storm: { demand: 1.5, fee: 18, wage: 24, staff: 80, storm: true, description: 'Outdoor work stops, but wages continue. Clear the storm to watch the recovery.' },
  wages: { demand: 1, fee: 18, wage: 38, staff: 80, storm: false, description: 'Higher hourly wages raise costs. Test staffing and service fees against the queue.' },
};
const money = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
const formatTime = (seconds) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}`;

export function createEconomyPanel({ onWeather }) {
  const $ = (selector) => document.querySelector(selector);
  let world, state, shown = false, request = null, generation = 0, nextRequestAt = 0, lastPaint = 0;
  let mode = 'unavailable', baseline = null;
  const controls = ['demand', 'fee', 'wage', 'staff'];
  const values = () => ({ ...Object.fromEntries(controls.map((name) => [name, Number($(`#economy-${name}`).value)])), storm: $('#economy-storm').checked });
  const invalidate = () => { generation++; request?.abort(); request = null; nextRequestAt = 0; };
  const engineLabel = () => {
    $('#economy-engine').textContent = mode === 'jev' ? 'Jev configured · source counts show accepted live answers' : mode === 'local_rules' ? 'Local rules · Jev key not configured on the bridge' : 'Bridge unavailable · local fallback active';
  };
  const health = async () => {
    try {
      const response = await fetch('/health', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      if (!response.ok) throw new Error('Bridge unavailable');
      mode = (await response.json()).mode;
    } catch { mode = 'unavailable'; }
    engineLabel();
  };
  const syncControls = () => {
    const config = state?.config ?? values();
    controls.forEach((name) => {
      $(`#economy-${name}`).value = config[name];
      $(`#economy-${name}-value`).textContent = name === 'demand' ? `${config[name].toFixed(1)}×` : name === 'staff' ? String(config[name]) : `$${config[name]}`;
    });
    $('#economy-storm').checked = config.storm;
    onWeather(config.storm);
    $('#economy-run').textContent = state?.running ? 'Pause scenario' : shown ? 'Resume scenario' : 'Run scenario';
    $('#economy-run').setAttribute('aria-pressed', String(Boolean(state?.running)));
  };
  const paint = () => {
    if (!state) return;
    const { metrics, decisionStats } = state;
    $('#economy-clock').textContent = `${formatTime(state.elapsed)} sim`;
    for (const name of ['completed', 'queued']) $(`#economy-${name}`).textContent = Math.round(metrics[name]).toLocaleString();
    for (const name of ['profit', 'revenue', 'cost']) $(`#economy-${name}`).textContent = money(metrics[name]);
    $('#economy-active').textContent = String(state.config.staff);
    $('#economy-jev').textContent = String(decisionStats.jev);
    $('#economy-local').textContent = String(decisionStats.local_rules);
    $('#economy-safety').textContent = String(decisionStats.safety_override);
    $('#economy-latency').textContent = decisionStats.latency_ms == null ? 'Awaiting batch' : `${Math.round(decisionStats.latency_ms)} ms / batch`;
    const nodes = state.workers.filter((worker) => worker.active).slice(0, 3).map((worker) => {
      const row = document.createElement('div');
      const identity = document.createElement('span');
      const action = document.createElement('b');
      identity.textContent = `${worker.id} · ${worker.source === 'jev' ? 'Jev' : worker.source === 'safety_override' ? 'safety' : 'local'}`;
      action.textContent = worker.action.replaceAll('_', ' ');
      row.append(identity, action);
      return row;
    });
    $('#economy-events').replaceChildren(...nodes);
    if (shown) $('#marker-count').textContent = String(state.config.staff);
    if (baseline) $('#economy-baseline').textContent = `Saved: ${baseline.completed} jobs, ${money(baseline.profit)} at ${formatTime(baseline.elapsed)} sim. Current: ${formatTime(state.elapsed)}.`;
  };
  const fallback = (packet) => ({ schema_version: 1, tick: packet.tick, latency_ms: 0, decisions: packet.agents.map((agent) => ({ id: agent.id, action: packet.weather.storm ? 'seek_shelter' : agent.blocked ? 'stop' : 'continue', source: 'local_rules' })) });
  const dispatch = async (now) => {
    const packet = economyPacket(state);
    const current = generation;
    const controller = new AbortController();
    request = controller;
    nextRequestAt = now + 2000;
    const deadline = setTimeout(() => controller.abort(), 1800);
    try {
      const response = await fetch('/v1/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet), signal: controller.signal });
      if (!response.ok) throw new Error('Decision batch unavailable');
      const result = await response.json();
      if (current !== generation || !state.running) return;
      if (!applyEconomyDecisions(state, result)) throw new Error('Invalid or expired decision batch');
      $('#economy-response').textContent = `${packet.agents.length} workers · current decision sources shown above. ${mode === 'jev' ? 'Late or invalid answers fall back locally.' : 'Local mode; connect Jev on the bridge to compare live reactions.'}`;
    } catch {
      if (current !== generation || !state.running) return;
      applyEconomyDecisions(state, fallback(packet));
      $('#economy-response').textContent = 'Decision batch unavailable or expired. Workers use local fallback; no request backlog.';
    } finally {
      clearTimeout(deadline);
      if (request === controller) request = null;
    }
  };
  const applyControls = () => {
    if (!state) return;
    invalidate();
    updateEconomyConfig(state, values());
    syncControls();
    paint();
  };
  controls.forEach((name) => $(`#economy-${name}`).addEventListener('input', applyControls));
  $('#economy-storm').addEventListener('change', applyControls);
  $('#economy-preset').addEventListener('change', () => {
    const preset = PRESETS[$('#economy-preset').value];
    controls.forEach((name) => { $(`#economy-${name}`).value = preset[name]; });
    $('#economy-storm').checked = preset.storm;
    $('#economy-description').textContent = preset.description;
    applyControls();
  });
  $('#economy-run').addEventListener('click', () => {
    if (!state) return;
    state.running = !state.running;
    shown = true;
    invalidate();
    $('#economy-hud').hidden = false;
    $('#motion').hidden = true;
    $('#marker-label').textContent = 'Service workers';
    $('#marker-note').textContent = 'Workers serve synthetic jobs on source road routes. Blue: Jev; amber: local rules; red: safety override. Traffic lanes remain unmodeled.';
    syncControls();
    paint();
    health();
  });
  $('#economy-reset').addEventListener('click', () => {
    if (!world) return;
    invalidate();
    state = createEconomy(world, values());
    $('#economy-response').textContent = 'Results reset. Resume to start a new comparison.';
    syncControls();
    paint();
  });
  $('#economy-save').addEventListener('click', () => {
    if (!state) return;
    baseline = { ...state.metrics, elapsed: state.elapsed };
    paint();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) invalidate();
  });
  $('#economy-run').disabled = true;
  health();
  return {
    get state() { return state; },
    get enabled() { return shown; },
    setWorld(data) {
      invalidate();
      world = data;
      state = createEconomy(world, values());
      $('#economy-run').disabled = !state.routes.length;
      syncControls();
      paint();
    },
    update(delta, now) {
      if (!state || !shown || document.hidden) return;
      stepEconomy(state, delta);
      if (state.running && !request && now >= nextRequestAt) dispatch(now);
      if (now - lastPaint > 200) { paint(); lastPaint = now; }
    },
  };
}
