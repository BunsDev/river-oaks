import { distribution } from './metrics.js';

// Options for world-expansion-baseline.js. Defaults reproduce the Phase 1
// protocol (three 30-second samples per workload, display vsync, both profiles).
export function baselineOptions(args) {
  const result = { seconds: 30, samples: 3, vsync: 'on', profiles: ['desktop', 'phone-viewport'], cpuProfile: 'off', label: '' };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--(seconds|samples|vsync|profiles|cpu-profile|label)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw new Error(`Invalid or duplicate option: ${arg}`);
    seen.add(match[1]);
    const [, key, value] = match;
    if (key === 'seconds' || key === 'samples') result[key] = Number(value);
    else if (key === 'profiles') result.profiles = value.split(',');
    else if (key === 'cpu-profile') result.cpuProfile = value;
    else result[key] = value;
  }
  if (!Number.isInteger(result.seconds) || result.seconds < 5 || result.seconds > 120
    || !Number.isInteger(result.samples) || result.samples < 1 || result.samples > 9
    || !['on', 'off'].includes(result.vsync) || !['on', 'off'].includes(result.cpuProfile)
    || !result.profiles.length || result.profiles.some(name => !['desktop', 'phone-viewport'].includes(name))
    || !/^[a-z0-9-]{0,40}$/.test(result.label))
    throw new Error('Use seconds 5–120, samples 1–9, vsync on/off, cpu-profile on/off, profiles from desktop,phone-viewport and a lowercase label.');
  return result;
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
