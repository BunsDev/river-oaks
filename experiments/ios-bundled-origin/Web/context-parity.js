// Controlled-fixture measurements only. No native message transport and no
// arbitrary page/error text is exported. Native code polls this bounded result.
(function () {
  const errorName = error => ['TypeError', 'SecurityError', 'AbortError', 'Error'].includes(error?.name) ? error.name : 'other';
  async function fetchProbe(target) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(target, { credentials: 'omit', cache: 'no-store', signal: controller.signal });
      return { outcome: 'response', status: Number.isInteger(response.status) && response.status >= 0 && response.status <= 599 ? response.status : null };
    } catch (error) { return { outcome: 'error', errorName: errorName(error) }; }
    finally { clearTimeout(timer); }
  }
  function workerProbe(nonce) {
    return new Promise(resolve => {
      if (typeof Worker !== 'function') { resolve({ outcome: 'unavailable', nonceValidated: false }); return; }
      let worker, timer, settled = false;
      const done = outcome => {
        if (settled) return;
        settled = true; clearTimeout(timer); worker?.terminate();
        resolve({ outcome, nonceValidated: outcome === 'reply' });
      };
      try {
        worker = new Worker(new URL('/parity-worker.js', location.href), { type: 'module' });
        worker.addEventListener('message', event => {
          if (event.data?.kind === 'context-worker-ready' && event.data?.nonce === nonce) done('reply');
        });
        worker.addEventListener('error', () => done('worker-error'));
        timer = setTimeout(() => done('timeout'), 2500);
        worker.postMessage({ nonce });
      } catch { done('construction-error'); }
    });
  }
  async function run(config) {
    const violations = [];
    const onViolation = event => {
      if (violations.length >= 16 || !['connect-src', 'worker-src', 'script-src', 'script-src-elem'].includes(event.violatedDirective)) return;
      let canaryOrigin = false;
      try { canaryOrigin = new URL(event.blockedURI, location.href).origin === new URL(config.target).origin; } catch {}
      violations.push({ directive: event.violatedDirective, canaryOrigin });
    };
    addEventListener('securitypolicyviolation', onViolation);
    const checks = { runID: config.nonce, role: config.role, harnessHandlerPresent: Boolean(globalThis.webkit?.messageHandlers?.harness) };
    try { checks.fetch = await fetchProbe(config.target); checks.worker = await workerProbe(config.nonce); }
    finally { removeEventListener('securitypolicyviolation', onViolation); }
    return JSON.stringify({ checks, violations });
  }
  globalThis.ContextParityProbe = {
    run,
    start(config) {
      const begin = () => run(config).then(value => { globalThis.__typeSafeContextParityResult = value; });
      if (document.readyState === 'loading') addEventListener('DOMContentLoaded', begin, { once: true }); else begin();
    },
  };
})();
