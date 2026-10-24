// All asynchronous GPU work and animation callbacks carry the context generation
// that created them. A newer loss, timeout or teardown makes them inert.
export function bindGraphicsRecovery({ canvas, recovery, rebuild, getContext = () => null, onLost = () => {}, onRestored = () => {} }) {
  let generation = 0, disposed = false, restoringGeneration = -1, retryPending = false, retryTimer = null;
  const extension = getContext()?.getExtension('WEBGL_lose_context');
  const accepting = () => recovery.state === 'lost' || recovery.state === 'restoring';
  const lost = event => {
    event.preventDefault(); generation++;
    try { onLost(); } finally { recovery.lost(); }
    if (retryPending) {
      retryPending = false;
      retryTimer = setTimeout(() => { retryTimer = null; if (!disposed && recovery.state === 'restoring') extension.restoreContext(); }, 0);
    }
  };
  const restored = () => {
    if (!disposed) onRestored();
    if (disposed || !accepting() || restoringGeneration === generation) return;
    const current = generation; restoringGeneration = current;
    const isCurrent = () => !disposed && current === generation && accepting();
    Promise.resolve().then(() => { if (isCurrent()) return rebuild(isCurrent); }).then(() => {
      if (isCurrent()) recovery.restored();
    }).catch(() => { if (isCurrent()) recovery.failed('rebuild'); });
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return {
    get generation() { return generation; },
    retry(fallback) {
      if (disposed || recovery.state !== 'failed') return;
      // Invalidate the failed attempt before restoring becomes an accepting
      // state again; the browser's next loss event is queued asynchronously.
      generation++;
      // A context that did not return even for a deliberate retry is not coming
      // back; offer the guarded page reload rather than retrying forever.
      if (!extension || recovery.retryTimedOut) { fallback(); return; }
      recovery.retry();
      if (getContext().isContextLost()) extension.restoreContext();
      else { retryPending = true; extension.loseContext(); }
    },
    frame(callback) {
      const current = generation;
      return (...args) => { if (!disposed && current === generation && recovery.state === 'ok') callback(...args); };
    },
    dispose() {
      if (disposed) return; disposed = true; generation++; recovery.dispose(); clearTimeout(retryTimer);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
    },
  };
}
