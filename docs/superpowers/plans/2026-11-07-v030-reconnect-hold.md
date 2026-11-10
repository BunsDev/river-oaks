# Reconnect: hold remote figures through a lost town socket

Objective: remove the v0.3.0 phone reconnect slowdown against v0.2.2. Measured with
`--reconnect-backoff=skip`, phone rejoins took 215 to 231 ms on main `230d8814`, against 174 to 177 ms
on v0.2.2 `f4dd959a` (ABC, 2026-11-07 15:15–15:24Z, `v030-perf-attribution-20261103`). Budgets are not
changed here.

Owner: `claude:river-oaks-c7 (178fa13a)`, under Val's v0.3.0 goal (phone two-player and reconnect are
not accepted; attribute and fix, never rerun for a pass). Task `v030-reconnect-hold-20261107`, branch
`perf/reconnect-hold-figures-20261107`, worktree `river-oaks-reconnect-hold`. Feeds
`v030-perf-attribution-20261103` and `v030-blockers-20261103`. Landing needs Val's authorization.

## Attribution

`.runtime/v030-attr/reconnect-phases.mjs` uses the same two-player setup, camera and skip-backoff
close as `preview/audit/world-expansion-baseline.js`, and records an in-page timeline for each rejoin.
Phone, main, smoke run 15:27Z: the close event lands at 1 ms, `/auth/session` and the ticket are done
by 9 ms, the new socket opens at 11 ms and the first snapshot arrives at 12 ms. The snapshot's task
then runs until 53 ms, and a single 142 ms task blocks every frame until 195 ms. The rejoin is
main-thread work, not transport.

CPU profiles of three rejoins per tree (15:29–15:31Z):

| Per rejoin | v0.2.2 | main |
| --- | ---: | ---: |
| `setProgram` → `onFirstUse` → `getProgramInfoLog` (shader programs compiled in the first frame) | 64 ms | 113 ms |
| `loadResidentAvatar` (figures rebuilt from the snapshot) | 15 ms | 33 ms |

Why: on a lost socket `multiplayer-client.js` `lost()` calls `onPlayers([])`. `main.js` passes that to
`remotePlayers.sync([])`, which disposes every remote figure: the peer, the residents, the rivals and
the police (six figures in this view). Their materials are disposed, so three releases their programs.
The rejoin's first snapshot names the same figures, so each is loaded again and its programs are
compiled again in the next frame. v0.2.2 paid the same, but v0.3.0's figures cost more to build and
compile (Jevica costume and drape, romance looks).

## Change

`remote-players.js` gains `hold(ms = RECONNECT_HOLD_MS)` (10 s). It hides every figure as removal
would (holder not drawn, label hidden, rig suspended) and keeps its rig, outfit and materials. The next
`sync` keeps the figures it names and removes the rest. If no sync comes within the hold, the held
figures are removed and disposed exactly as before. While held, a figure reads as gone: `stats`,
`bounds`, `holderOf`, `craftOf` and `ribbonwings` skip it. `main.js` `onPlayers` calls `hold()` when the
client reports no players (a lost or closed town socket) and `sync` otherwise. `sync([])` keeps its old
meaning for other callers (office scenes, tests).

The 10 s hold covers the client's first three retries, which wait at most 7 s in all
(`connection-policy.js` `retryDelay`).

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/remote-players.test.js` | 22/22. The new test fails on main's `remote-players.js` (no `hold`) |
| Reconnect phases, phone, A B H H B A, 6 rejoins each, skip backoff, load 5–7, 15:35–15:40Z | medians: v0.2.2 172 and 187 ms, main 203 and 255 ms, **hold 37 and 42 ms**. No long task and at most one 17 ms frame gap with the hold, against a 114–213 ms long task on every other rejoin |
| Figures after the rejoin, phone, 3 rejoins each, load 6–8, 15:43–15:45Z | main rebuilds all six (alice, two rivals, three residents; re-added in a new order), 247–369 ms. With the hold, the same six come back loaded, in the same order, 52–57 ms |
| `pnpm run verify` | **passed** on main `230d8814` plus this change (before this ledger), 15:40–15:45Z: tooling 307/307, preview 5231 pass / 1 skip / 30 todo, server 1132 pass / 285 skip, desktop 127 pass / 5 skip, Python 215. With this ledger added: tooling 307/307 and secrets (`agent.mjs verify tooling`, `verify security`), 15:46Z |

## Gaps

- The hold keeps a disconnected page's figures in GPU memory for up to 10 s after the loss. Nothing
  draws them.
- Not yet measured with the audit itself (full protocol and skip set), nor together with #897.

## Next step

Push as a draft. Then an ABC under one lock: v0.2.2, main + #897, main + #897
+ this change, full protocol and skip set. Landing needs Val's authorization.
