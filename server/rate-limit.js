// Sign-in starts allowed per address while their pending slots last.
export const SIGN_INS_PER_ADDRESS = 20, SIGN_IN_WINDOW = 20 * 60_000;

// Fixed windows that survive socket reconnects. A full table evicts its oldest
// key instead of refusing new ones, so a flood of distinct addresses cannot
// lock everyone else out; it can only reset its own oldest counters.
export function createRateLimiter(limit, interval, maxKeys = 4096, now = Date.now) {
  const windows = new Map();
  return key => {
    const time = now();
    let window = windows.get(key);
    if (!window || time >= window.until) {
      if (!window && windows.size >= maxKeys) {
        for (const [id, value] of windows) if (time >= value.until) windows.delete(id);
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value);
      }
      window = { until: time + interval, count: 0 }; windows.set(key, window);
    }
    return ++window.count <= limit;
  };
}
