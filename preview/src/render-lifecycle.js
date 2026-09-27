// Stop GPU work while minimized/hidden, and exclude the pause from simulation
// time and adaptive quality measurements when the game becomes visible again.
export function bindRenderVisibility({ document, setLoop, render, resetTime }) {
  const sync = () => {
    if (document.hidden) setLoop(null);
    else { resetTime(); setLoop(render); }
  };
  document.addEventListener('visibilitychange', sync);
  sync();
  return () => { document.removeEventListener('visibilitychange', sync); setLoop(null); };
}
