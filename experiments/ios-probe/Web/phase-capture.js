// Opt-in native diagnostic adapter, evaluated in the main page. No native
// message handler. Only fixed statuses and bounded numeric timings leave it.
(function (root) {
  const names = ['setup', 'community', 'trees', 'residents', 'interactions', 'players', 'reflections', 'debug', 'pipeline', 'tail'];
  const duration = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 60000;
  function ready() {
    const host = root.document.querySelector('#canvas-host')?.dataset;
    const assets = JSON.parse(root.document.querySelector('#viewport')?.dataset.assetProgress || '{}');
    return root.document.visibilityState === 'visible' && host?.playerReady === 'true' &&
      Number(host.storePeopleTotal) > 0 && host.storePeopleReady === host.storePeopleTotal && assets.done === true && assets.failed === 0;
  }
  function createCapture() {
    let owner = null, audit = null, startedAtMs = 0;
    return {
      start(token) {
        if (owner !== null) return { status: 'busy' };
        if (typeof token !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(token)) return { status: 'invalid' };
        try {
          if (!ready()) return { status: 'not-ready' };
          const api = root.__riverRenderAudit;
          if (typeof api?.start !== 'function' || typeof api?.stop !== 'function') return { status: 'unsupported' };
          const at = root.performance.now();
          if (!Number.isFinite(at) || at < 0) return { status: 'invalid' };
          api.start(); audit = api; owner = token; startedAtMs = at;
          return { status: 'started', startedAtMs };
        } catch { return { status: 'failed' }; }
      },
      stop(token) {
        if (owner === null || token !== owner) return { status: 'stale' };
        owner = null;
        const api = audit; audit = null;
        try {
          const sample = api.stop(), elapsedMs = root.performance.now() - startedAtMs;
          if (!ready() || !duration(elapsedMs) || sample.overflow !== false || (sample.discontinuities ?? 0) !== 0 ||
            !Array.isArray(sample.frames) || !sample.frames.length || sample.frames.length > 7200) return { status: 'invalid' };
          const frames = [];
          for (const frame of sample.frames) {
            if (!duration(frame.intervalMs) || frame.intervalMs === 0 || !duration(frame.cpuMs)) return { status: 'invalid' };
            const phasesMs = {};
            for (const name of names) {
              if (!duration(frame.phasesMs?.[name])) return { status: 'invalid' };
              phasesMs[name] = frame.phasesMs[name];
            }
            if (Math.abs(Object.values(phasesMs).reduce((sum, value) => sum + value, 0) - frame.cpuMs) > .001) return { status: 'invalid' };
            frames.push({ intervalMs: frame.intervalMs, cpuMs: frame.cpuMs, phasesMs });
          }
          return { status: 'captured', startedAtMs, elapsedMs, frames };
        } catch { return { status: 'failed' }; }
      },
      cancel(token) {
        if (owner === null || owner !== token) return { status: 'stale' };
        owner = null;
        const api = audit; audit = null;
        try { api.stop(); } catch { /* No evidence is accepted after cancellation. */ }
        return { status: 'cancelled' };
      },
    };
  }
  root.IOSProbePhases = { createCapture, install() { return root.__iosProbePhaseCapture ??= createCapture(); } };
})(globalThis);
