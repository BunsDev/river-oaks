// Presentation ownership only. Coordinates are east/north metres; this module
// never changes collision, player state, world identity or server permissions.
const distance = ([x, y], [w, s, e, n]) => Math.hypot(Math.max(w - x, 0, x - e), Math.max(s - y, 0, y - n));
export function createSpatialChunkStream({ chunks, load, attach, detach,
  maxResident = 2, maxConcurrent = 1, maxBytes = 16 * 1024 * 1024,
  prefetchDistance = 80, unloadDistance = 120, retryDelayMs = 1000, loadTimeoutMs = 15000,
  now = () => performance.now() }) {
  if (![maxResident, maxConcurrent].every(value => Number.isInteger(value) && value > 0)
    || ![maxBytes, retryDelayMs, loadTimeoutMs].every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(prefetchDistance) || prefetchDistance < 0
    || !Number.isFinite(unloadDistance) || unloadDistance < prefetchDistance) throw new Error('Invalid stream limits');
  const entries = new Map();
  for (const chunk of chunks) {
    if (!chunk?.id || entries.has(chunk.id) || !Array.isArray(chunk.bounds) || chunk.bounds.length !== 4
      || !chunk.bounds.every(Number.isFinite) || chunk.bounds[0] >= chunk.bounds[2] || chunk.bounds[1] >= chunk.bounds[3]
      || !Number.isFinite(chunk.estimatedBytes) || chunk.estimatedBytes <= 0) throw new Error('Invalid chunk definition');
    entries.set(chunk.id, { chunk, state: 'absent', resource: null, token: null, failures: 0, retryAt: 0, distance: Infinity, wanted: false, measuredBytes: null });
  }
  let disposed = false, residentBytes = 0, loads = 0, unloads = 0, failures = 0, lastLoadMs = 0;
  const pending = new Set();
  function release(entry) {
    if (!entry.resource) return;
    const resource = entry.resource; entry.resource = null;
    residentBytes -= resource.bytes;
    try { detach(entry.chunk, resource); } finally { resource.dispose(); }
    unloads++; entry.state = 'absent';
  }
  function cancel(entry, timeout = false) {
    const token = entry.token;
    if (!token || token.cancelled) return;
    token.cancelled = true; token.controller.abort();
    if (timeout) { fail(entry); entry.state = 'stalled'; } else entry.state = 'absent';
  }
  function fail(entry) {
    entry.state = 'failed'; entry.failures++; failures++;
    entry.retryAt = now() + Math.min(30000, retryDelayMs * 2 ** Math.min(entry.failures - 1, 5));
  }
  function start(entry) {
    const token = { controller: new AbortController(), started: now(), cancelled: false };
    entry.token = token; entry.state = 'loading'; pending.add(token); loads++;
    Promise.resolve().then(() => load(entry.chunk, token.controller.signal)).then(resource => {
      if (!resource || typeof resource.dispose !== 'function') throw new Error('Chunk must own disposal');
      if (disposed || token.cancelled || !entry.wanted) { resource.dispose(); return; }
      if (!Number.isFinite(resource.bytes) || resource.bytes < 0 || residentBytes + resource.bytes > maxBytes) {
        resource.dispose(); throw new Error('Chunk exceeds memory ceiling');
      }
      try { attach(entry.chunk, resource); } catch (error) {
        try { detach(entry.chunk, resource); } finally { resource.dispose(); }
        throw error;
      }
      entry.resource = resource; residentBytes += resource.bytes; entry.measuredBytes = resource.bytes;
      entry.state = 'ready'; entry.failures = 0; lastLoadMs = now() - token.started;
    }).catch(() => {
      if (!disposed && !token.cancelled) fail(entry);
    }).finally(() => {
      pending.delete(token);
      if (entry.token === token) {
        entry.token = null;
        if (entry.state === 'stalled') entry.state = 'failed';
      }
    });
  }
  return {
    update(points) {
      if (disposed) return;
      const valid = points.filter(point => Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite));
      if (!valid.length) return;
      for (const entry of entries.values()) entry.distance = Math.min(...valid.map(point => distance(point, entry.chunk.bounds)));
      const candidates = [...entries.values()].filter(entry => entry.distance <= (entry.resource || entry.token ? unloadDistance : prefetchDistance))
        .sort((a, b) => a.distance - b.distance || a.chunk.id.localeCompare(b.chunk.id));
      let bytes = 0, count = 0;
      const wanted = new Set();
      for (const entry of candidates) {
        // Once a chunk has loaded, its measured size replaces the authored estimate.
        const size = entry.resource?.bytes ?? entry.measuredBytes ?? entry.chunk.estimatedBytes;
        if (count >= maxResident || bytes + size > maxBytes) continue;
        wanted.add(entry); bytes += size; count++;
      }
      for (const entry of entries.values()) {
        entry.wanted = wanted.has(entry);
        if (!entry.wanted) { cancel(entry); release(entry); }
        else if (entry.token && !entry.token.cancelled && now() - entry.token.started >= loadTimeoutMs) cancel(entry, true);
      }
      for (const entry of candidates) {
        if (pending.size >= maxConcurrent) break;
        if (entry.wanted && !entry.resource && !entry.token && now() >= entry.retryAt) start(entry);
      }
    },
    ready(id) { return !disposed && entries.get(id)?.state === 'ready'; },
    retry(id) { const entry = entries.get(id); if (entry?.state === 'failed') entry.retryAt = 0; },
    debug() {
      return { disposed, residentBytes, pending: pending.size, loads, unloads, failures, lastLoadMs,
        chunks: [...entries.values()].map(({ chunk, state, distance, failures, retryAt, measuredBytes }) => ({ id: chunk.id, state, distance, failures, retryAt, measuredBytes })) };
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const entry of entries.values()) { entry.wanted = false; cancel(entry); release(entry); }
    },
  };
}
