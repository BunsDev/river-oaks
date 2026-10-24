// Bounded, explicit recovery. The browser owns context restoration; this module
// owns when it is still safe to accept it. Clocks are injected for deterministic
// timeout/window tests and every deadline belongs to exactly one attempt.
export function createGraphicsRecovery({ now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
  restoreTimeoutMs = 15000, lossWindowMs = 120000, maxLosses = 3, onChange = () => {} } = {}) {
  let state = 'ok', disposed = false, timer = null, generation = 0, losses = [];
  function cancel() { generation++; if (timer !== null) clearTimer(timer); timer = null; }
  function change(next, reason, stepDown = false) { state = next; onChange({ state, reason, stepDown }); }
  function fail(reason) { cancel(); change('failed', reason, true); }
  function deadline() {
    const current = generation;
    timer = setTimer(() => {
      if (!disposed && current === generation && (state === 'lost' || state === 'restoring')) fail('timeout');
    }, restoreTimeoutMs);
  }
  return {
    get state() { return state; },
    lost() {
      if (disposed || state !== 'ok') return;
      cancel();
      const at = now(); losses = losses.filter(time => at - time < lossWindowMs); losses.push(at);
      if (losses.length >= maxLosses) { fail('loop'); return; }
      change('lost', 'context-lost'); deadline();
    },
    restored() {
      if (disposed || (state !== 'lost' && state !== 'restoring')) return;
      cancel(); change('ok', 'restored');
    },
    failed(reason = 'rebuild') { if (!disposed && state !== 'failed') fail(reason); },
    retry() {
      if (disposed || state !== 'failed') return;
      cancel(); losses = []; change('restoring', 'retry'); deadline();
    },
    dispose() { if (disposed) return; disposed = true; cancel(); },
  };
}
