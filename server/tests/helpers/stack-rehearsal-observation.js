// Test-only admission observer. A closed socket cannot deliver a first snapshot;
// retain the terminal failure instead of turning it into an eight-second timeout.
export function waitForRehearsalSnapshot(ws, { label, timeoutMs = 8000, timing = {} } = {}) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const elapsed = () => Math.round(performance.now() - start);
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('open', opened); ws.off('message', message); ws.off('close', closed); ws.off('error', failed);
    };
    const finish = (error, snapshot) => { timing.elapsedMs = elapsed(); cleanup(); error ? reject(error) : resolve(snapshot); };
    const opened = () => { timing.openMs = elapsed(); };
    const closed = code => {
      timing.closeCode = code;
      finish(Object.assign(new Error(`${label} closed before snapshot (${code}) after ${elapsed()} ms`), { closeCode: code, elapsedMs: elapsed() }));
    };
    // Fixed classifications only; transport errors may contain connection URLs.
    const failed = () => { timing.error = 'transport'; finish(new Error(`${label} transport failed before snapshot after ${elapsed()} ms`)); };
    const message = raw => {
      let value;
      try { value = JSON.parse(raw); } catch { finish(new Error(`${label} invalid JSON before snapshot`)); return; }
      if (value.type === 'snapshot') { timing.snapshotMs = elapsed(); finish(null, value); }
    };
    const timer = setTimeout(() => { timing.error = 'timeout'; finish(new Error(`${label} snapshot timed out after ${elapsed()} ms`)); }, timeoutMs);
    ws.on('open', opened); ws.on('message', message); ws.on('close', closed); ws.on('error', failed);
  });
}
