# Town connection deadline on a busy page — 2026-10-12

**Objective:** stop the multiplayer client from throwing away a town connection
that is open but slow to deliver its first snapshot. Since #253 this has made the
`email access` browser test fail intermittently and turned `main` red.

**Branch / worktree:** `fix/town-connect-deadline` in
`../river-oaks-connect-deadline-20261012`, from `640abe3`. river-oaks-38 (owner of
#253) is separately reducing #253's CPU-rendering cost and is leaving the client
deadline to this task.

## Evidence

- In the last 40 Verify runs, the "Email access…" step failed 7 times. The first
  was #253's branch run (2026-10-11 19:31Z), then #253's merge on main (19:59Z).
  There were none before.
- Every failure times out at `email-access.test.js:162`, waiting 60 s for
  `.multiplayer-roster[data-connected="true"]`. The failure dump shows
  `connectionMessage: 'Connecting to the town…'` and `appInert: true`, and the
  screenshot taken just after shows the town connected. So the connection is
  slow, not refused.
- Mechanism: `connect()` armed a single 12 s timer at socket creation and closed
  the socket if no snapshot had been *processed* by then. Under CPU-only
  rendering, frames block the main thread, the late timer runs before the queued
  open and snapshot events, and the socket is closed. Each retry starves the
  same way and backs off further.

## Change

- `preview/src/connection-deadline.js` (`watchConnection`): 12 s to open, then
  45 s for the first snapshot. A timer that fires more than 2 s late means the
  page was starved, so the budget restarts (up to 4 times) instead of closing.
  A socket found open when the open budget expires moves to the snapshot budget.
- `preview/src/multiplayer-client.js` uses it in place of the 12 s
  `setTimeout`, calls `opened()` on `open`, and `stop()` on snapshot, close and
  shutdown.

## Verification

- `node --test preview/tests/connection-deadline.test.js`: 5/5. It covers a
  socket that never opens (12 s), the longer snapshot budget, a socket open before
  its handler ran, bounded restarts when starved, and cancellation.
- `pnpm test` 2651 pass / 1 skip. `pnpm run build` passes.
  `pnpm run test:security:e2e` passes 2/2 locally (Metal; not starved).
- **A/B starvation probe** (real browser, real server, real WebSocket; not
  committed): a copy of `email-access.test.js` with an init script that wraps
  `WebSocket` and, for each `/multiplayer` socket, blocks the main thread for
  15 s in a `setTimeout(…, 0)` right after creation.
  - Old client (origin/main `multiplayer-client.js`, rebuilt): fails like CI,
    `locator.waitFor: Timeout 60000ms exceeded` on the connected roster.
  - New client: passes, `{"sockets":1,"closes":0}`. The first socket survives.
- `pnpm run verify` (core): passed (preview 2651, server 360, desktop 49, agent 44).

## Gaps

- The underlying slowdown on CPU rendering is river-oaks-38's (#253 shaders and
  textures). This change removes the reconnect cascade, not the slow first
  frames.
- A hung server that opens the socket but never sends a snapshot is now detected
  after 45 s rather than 12 s.
