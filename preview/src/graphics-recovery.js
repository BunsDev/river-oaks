// Bounded, explicit recovery. The browser owns context restoration; this module
// owns when it is still safe to accept it. Clocks are injected for deterministic
// timeout/window tests and every deadline belongs to exactly one attempt.
// Phones routinely reclaim a hidden page's context and may restore it only once
// the page is shown, so the deadline spends visible time only. A loss that begins
// hidden is not evidence of a crash loop or of too heavy a quality setting.
export function createGraphicsRecovery({ now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, document = globalThis.document,
  restoreTimeoutMs = 15000, lossWindowMs = 120000, maxLosses = 3, onChange = () => {} } = {}) {
  let state = 'ok', disposed = false, timer = null, generation = 0, losses = [];
  // The current attempt's unspent visible time, whether it began hidden, and
  // whether it is a deliberate retry (one that also times out will not restore).
  let remaining = 0, startedAt = 0, background = false, retrying = false, retryTimedOut = false;
  const waiting = () => state === 'lost' || state === 'restoring';
  function cancel() { generation++; if (timer !== null) clearTimer(timer); timer = null; }
  function change(next, reason, stepDown = false) { state = next; onChange({ state, reason, stepDown }); }
  function fail(reason) { cancel(); retryTimedOut = retrying && reason === 'timeout'; retrying = false; change('failed', reason, !background); }
  function start() {
    if (disposed || timer !== null || !waiting() || document?.hidden) return;
    const current = generation; startedAt = now();
    timer = setTimer(() => {
      if (!disposed && current === generation && waiting()) fail('timeout');
    }, Math.max(0, remaining));
  }
  function deadline() { remaining = restoreTimeoutMs; start(); }
  const visibility = () => {
    if (!document.hidden) start();
    else if (timer !== null) { remaining -= now() - startedAt; cancel(); }
  };
  document?.addEventListener('visibilitychange', visibility);
  return {
    get state() { return state; },
    get retryTimedOut() { return retryTimedOut; },
    lost() {
      if (disposed || state !== 'ok') return;
      cancel(); background = Boolean(document?.hidden);
      if (!background) {
        const at = now(); losses = losses.filter(time => at - time < lossWindowMs); losses.push(at);
        if (losses.length >= maxLosses) { fail('loop'); return; }
      }
      change('lost', 'context-lost'); deadline();
    },
    restored() {
      if (disposed || !waiting()) return;
      cancel(); retrying = retryTimedOut = false; change('ok', 'restored');
    },
    failed(reason = 'rebuild') { if (!disposed && state !== 'failed') fail(reason); },
    retry() {
      if (disposed || state !== 'failed') return;
      cancel(); losses = []; background = false; retrying = true; retryTimedOut = false; change('restoring', 'retry'); deadline();
    },
    dispose() { if (disposed) return; disposed = true; cancel(); document?.removeEventListener('visibilitychange', visibility); },
  };
}
