// Bounded windows survive socket reconnects; saturated maps reject new keys.
export function createRateLimiter(limit, interval, maxKeys = 4096, now = Date.now) {
  const windows = new Map();
  return key => {
    const time = now();
    let window = windows.get(key);
    if (!window || time >= window.until) {
      if (!window && windows.size >= maxKeys) {
        for (const [id, value] of windows) if (time >= value.until) windows.delete(id);
        if (windows.size >= maxKeys) return false;
      }
      window = { until: time + interval, count: 0 }; windows.set(key, window);
    }
    return ++window.count <= limit;
  };
}
