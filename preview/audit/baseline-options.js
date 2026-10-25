import { distribution } from './metrics.js';

// Options for world-expansion-baseline.js. Defaults reproduce the expansion
// protocol (three 30-second samples per workload, display vsync, both profiles,
// and the median of five reconnects that wait out the client's backoff).
// RIVER_OAKS_BASELINE_PROFILES sets the default profiles; --profiles overrides it.
// After a socket closes the client waits retryDelay(0), a random 500–1,000 ms, before
// rejoining (connection-policy.js), so one reconnect per profile cannot resolve a 20%
// budget; Val adopted the five-reconnect median on 2026-10-25 (#672). --reconnects=1
// reproduces the Phase 1 single read; --reconnect-backoff=skip rejoins at once through
// the client's own back-online path, so the time leaves out the client's random delay.
export function baselineOptions(args, env = {}) {
  const result = { seconds: 30, samples: 3, vsync: 'on', profiles: (env.RIVER_OAKS_BASELINE_PROFILES ?? 'desktop,phone-viewport').split(','), cpuProfile: 'off', label: '',
    reconnects: 5, reconnectBackoff: 'keep' };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--(seconds|samples|vsync|profiles|cpu-profile|label|reconnects|reconnect-backoff)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw new Error(`Invalid or duplicate option: ${arg}`);
    seen.add(match[1]);
    const [, key, value] = match;
    if (key === 'seconds' || key === 'samples' || key === 'reconnects') result[key] = Number(value);
    else if (key === 'profiles') result.profiles = value.split(',');
    else if (key === 'cpu-profile') result.cpuProfile = value;
    else if (key === 'reconnect-backoff') result.reconnectBackoff = value;
    else result[key] = value;
  }
  if (!Number.isInteger(result.seconds) || result.seconds < 5 || result.seconds > 120
    || !Number.isInteger(result.samples) || result.samples < 1 || result.samples > 9
    || !Number.isInteger(result.reconnects) || result.reconnects < 1 || result.reconnects > 9
    || !['on', 'off'].includes(result.vsync) || !['on', 'off'].includes(result.cpuProfile)
    || !['keep', 'skip'].includes(result.reconnectBackoff)
    || !result.profiles.length || result.profiles.some(name => !['desktop', 'phone-viewport'].includes(name))
    || !/^[a-z0-9-]{0,40}$/.test(result.label))
    throw new Error('Use seconds 5–120, samples 1–9, reconnects 1–9, vsync on/off, cpu-profile on/off, reconnect-backoff keep/skip, profiles from desktop,phone-viewport and a lowercase label.');
  return result;
}

// The reconnect row. One sample keeps the unrounded value the Phase 1 protocol has
// always recorded; several give their median (the mean of the middle two for an even
// count). Drift is checked per rejoin and from the first start to the last end, so a
// move that builds up across rejoins is caught too.
export function reconnectSummary(samplesMs, starts, ends) {
  if (!samplesMs.length || starts.length !== samplesMs.length || ends.length !== samplesMs.length
    || samplesMs.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Missing or invalid reconnect samples');
  const sorted = [...samplesMs].sort((a, b) => a - b), middle = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
  return { reconnectMs: samplesMs.length === 1 ? samplesMs[0] : Math.round(median * 100) / 100,
    reconnectPositionDeltaM: Math.max(...starts.map((start, i) => distance(ends[i], start))),
    reconnectTotalDeltaM: distance(ends.at(-1), starts[0]) };
}

// Frame p95 snaps to refresh multiples (16.7/33.4/50 ms at 60 Hz), so one
// quantization step reads as +50%. Mean interval and the share of frames that
// missed one or more refreshes are continuous and compare fairly.
export function frameSummary(frames, refreshMs = 1000 / 60) {
  if (!frames.length) throw new Error('Missing frame samples');
  const intervals = frames.map(frame => frame.intervalMs);
  const total = intervals.reduce((sum, value) => sum + value, 0);
  const missed = steps => intervals.filter(value => value > refreshMs * (steps + .5)).length / intervals.length;
  return { count: intervals.length, meanMs: Math.round(total / intervals.length * 100) / 100, fps: Math.round(intervals.length / total * 1e5) / 100,
    missedOneRefresh: Math.round(missed(1) * 1e4) / 1e4, missedTwoRefreshes: Math.round(missed(2) * 1e4) / 1e4 };
}

// Per-phase CPU distributions (synchronous elapsed time inside the frame).
export function phaseSummary(frames) {
  const names = new Set(frames.flatMap(frame => Object.keys(frame.phasesMs ?? {})));
  return Object.fromEntries([...names].sort().map(name => {
    const values = frames.map(frame => frame.phasesMs?.[name] ?? 0);
    const { p50Ms, p95Ms } = distribution(values);
    return [name, { p50Ms, p95Ms, meanMs: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 }];
  }));
}
