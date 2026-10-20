// Explicit development/diagnostic audit only. A full buffer is a failure,
// never a silently truncated performance sample. These are synchronous elapsed
// durations (including instrumentation overhead), not GPU completion times.
const PHASES = new Set(['setup', 'community', 'trees', 'residents', 'interactions', 'players', 'reflections', 'debug', 'pipeline']);
export function createRenderAudit({ limit = 120000, now = () => performance.now() } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 120000) throw new Error('Invalid render audit capacity');
  let frames = [], previous = null, overflow = false, active = false, discontinuities = 0;
  let started = null, marked = null, phases = null;
  const clock = () => {
    const value = now();
    if (!Number.isFinite(value) || value < 0 || marked !== null && value < marked) throw new Error('Invalid render audit clock');
    return value;
  };
  return {
    start() { frames = []; previous = null; overflow = false; discontinuities = 0; active = true; started = marked = phases = null; },
    beginFrame() {
      if (!active) return;
      const at = clock();
      started = marked = at; phases = {};
    },
    phase(name) {
      if (!active || started === null) return;
      if (!PHASES.has(name)) throw new Error('Unknown render audit phase');
      const at = clock();
      phases[name] = (phases[name] ?? 0) + at - marked;
      marked = at;
    },
    frame(at, cpuMs) {
      if (!active) return;
      let phasesMs;
      if (started !== null) {
        const end = clock();
        cpuMs = end - started;
        phasesMs = { ...phases, tail: end - marked };
      }
      if (previous !== null) {
        if (frames.length >= limit) { overflow = true; active = false; }
        else frames.push({ intervalMs: at - previous, cpuMs, ...(phasesMs ? { phasesMs } : {}) });
      }
      previous = at; started = marked = phases = null;
    },
    discontinuity() {
      if (!active) return;
      previous = started = marked = phases = null; discontinuities++;
    },
    stop() { active = false; started = marked = phases = null; return { frames, overflow, ...(discontinuities ? { discontinuities } : {}) }; },
  };
}
