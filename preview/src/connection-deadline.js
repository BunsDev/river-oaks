// How long a new town socket may take before the client gives up and retries.
// Opening the socket gets a short budget. Once it is open, the town gets longer to
// deliver, and the page to read, the first snapshot. On a busy main thread (a slow
// device or CPU-only rendering), timers fire late. A late timer means the page
// could not read the socket, not that the town stopped answering, so the budget
// restarts instead of throwing away a connection that is about to complete.
//
// A timer and a network event that became due during the same long frame can run
// in either order. The socket only reports OPEN once its queued open task runs,
// and the first snapshot is a queued message, so an on-time timer could close a
// connection that had already succeeded. Before giving up, the deadline waits one
// short grace timer so those queued events run first.
export const CONNECT_BUDGETS = Object.freeze({ openMs: 12_000, snapshotMs: 45_000, starvedMs: 2_000, maxRestarts: 4, graceMs: 1_000 });

export function watchConnection(socket, { onExpire, budgets = CONNECT_BUDGETS, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null, phase = 'open', restarts = 0, done = false;
  const isOpen = () => socket.readyState === (socket.OPEN ?? 1);
  const arm = ms => { const due = now() + ms; timer = setTimer(() => fire(ms, due), ms); };
  function fire(ms, due, grace = false) {
    timer = null;
    if (done) return;
    // The socket opened while the page was too busy to run its open handler.
    if (phase === 'open' && isOpen()) { phase = 'snapshot'; arm(budgets.snapshotMs); return; }
    if (now() - due > budgets.starvedMs && restarts < budgets.maxRestarts) { restarts++; arm(ms); return; }
    // Out of budget: first let any open or message event queued alongside this
    // timer run (opened() or stop() cancel the grace), then give up.
    if (!grace) { const graceDue = now() + budgets.graceMs; timer = setTimer(() => fire(ms, graceDue, true), budgets.graceMs); return; }
    done = true;
    onExpire();
  }
  arm(budgets.openMs);
  return {
    opened() { if (done || phase !== 'open') return; phase = 'snapshot'; clearTimer(timer); arm(budgets.snapshotMs); },
    stop() { done = true; clearTimer(timer); timer = null; },
  };
}
