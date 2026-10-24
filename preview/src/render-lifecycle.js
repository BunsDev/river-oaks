// One animation-loop owner composes visibility with graphics/rebuild pauses.
// The callable return value remains the existing disposal contract.
export function bindRenderVisibility({ document, setLoop, render, resetTime }) {
  const reasons = new Set();
  let disposed = false;
  const sync = () => {
    if (disposed) return;
    if (document.hidden || reasons.size) setLoop(null);
    else { resetTime(); setLoop(render); }
  };
  document.addEventListener('visibilitychange', sync);
  sync();
  const dispose = () => { if (disposed) return; disposed = true; document.removeEventListener('visibilitychange', sync); setLoop(null); };
  dispose.setPaused = (reason, paused) => {
    if (disposed || reasons.has(reason) === Boolean(paused)) return;
    if (paused) reasons.add(reason); else reasons.delete(reason);
    sync();
  };
  return dispose;
}
