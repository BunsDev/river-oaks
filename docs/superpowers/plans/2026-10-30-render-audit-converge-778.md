# Render audit: converge() counts town figures as players (#778)

- **Goal:** Val, 2026-10-30: make `node preview/audit/rendered-multiplayer.js --players=1,8,16,32` complete on main without loosening what it proves (#778, blocks #599 render-tier evidence).
- **Task id:** `render-audit-converge-778-20261030` (live register)
- **Owner:** `claude:render-audit-778`
- **Branch:** `fix/render-audit-converge-778-20261030`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-render-audit-778`
- **Baseline head:** `986977ef45af1a909b1b31470d8a95f2ed251815` (`origin/main`, 2026-10-30)

## Objective

The capacity audit timed out in `converge()`. Decide whether its predicate is stale
against the current client or the client really fails to converge, and fix the one
that is wrong.

## Root cause

The predicate is stale; the client converges. Since #597 (`1b6c090e`, authored
rivals) and #598 (`79dcbf13`, police units), `main.js` syncs the town's own figures
into the remote-figure registry beside the players whenever the viewer is joined:
`remotePlayers.sync([...players, ...rivalFigures(crime), ...policeFigures(police)])`.
`window.__riverMultiplayer().remotes` is that registry, so it holds
`count - 1` players plus every rival and officer. The audit (last changed 2026-10-18)
required `remotes.length === count - 1`, which can no longer be true: the river-oaks
world always has the two rivals of `server/crime.js` `CRIME_TARGETS`.

Evidence, unmodified `986977ef` (`preview/audit/rendered-multiplayer.js` sha256
`af82bb49…`), `--players=1,8 --seconds=5 --warmup=1`, report
`.runtime/render-audit-778/baseline-main.json` (local, not committed): it failed at
the very first `converge(page, 1)` (line 194) after 90 s. The failure diagnostic shows
the page fully converged on everything else: connected, `players: ["viewer"]`,
`playerReady: "true"`, assets 102/102 with 0 failed, and `remotes` =
`rival:westcreek`, `rival:service-lane`, both `ready: true`, matching
`snapshot.crime.targets`; no police units. The issue's 8-player diagnostic
(9 entries = 7 peers + 2 rivals) is the same arithmetic.

## Change

- `preview/audit/metrics.js`: `peerRoster(town, count)`, a self-contained predicate
  that counts peers by the authoritative `snapshot.players` ids (excluding self),
  requires the exact peer id set, the tier's roster length, a connection, and that
  every drawn figure (player, rival or officer) is loaded. It returns the peers and the
  non-player figures. It does not depend on a `kind` field, so it holds with or without
  #708 (which adds `kind` and resident figures).
- `preview/audit/rendered-multiplayer.js`: `converge()` serializes `peerRoster` into
  `waitForFunction`; the crowd-view `onScreenPeers`, the post-sample loaded-peer
  assertion, and `afterPeersLeave.peers` use the roster's players. Each row now records
  `townFigures` (ids, loaded, on screen) and `afterPeersLeave.townFigures`, so the
  extra figures the renderer drew are visible in the evidence instead of hidden.
- `preview/tests/render-audit.test.js`: three behavioral tests on a synthetic town
  built with the real `rivalFigures`/`policeFigures` and `CRIME_TARGETS`: convergence
  at 1/8/16/32 with two rivals and an officer drawn; non-convergence for a missing
  peer, a loading peer, a loading rival, the wrong tier, disconnected, no hook, and two
  rivals standing in for two absent players; and evaluation of the serialized source.
- `data/reports/rendered-multiplayer-audit-778.json`: the fixed tree's full run.
  The historical `data/reports/rendered-multiplayer-audit.json` (2026-10-05) is untouched.

Not loosened: the old check also required every remote ready and the roster length;
the new one keeps both, adds an exact id-set match, and still requires the town
figures to be loaded before and after measurement.

## Checks

- `node --test preview/tests/render-audit.test.js`: 13 pass, 0 fail.
- `node scripts/browser-lock.mjs 'render audit 778 fixed' -- node preview/audit/rendered-multiplayer.js --players=1,8,16,32 --output=.runtime/render-audit-778/fixed.json`
  under `caffeinate -s`, load 16.7 at start, Apple M5 Max ANGLE Metal, sharp, 15 s
  samples: **passed**, copied to `data/reports/rendered-multiplayer-audit-778.json`.
  Every tier: peers loaded = on screen = count - 1, town figures = the two rivals
  (2 loaded, 0 on screen in the crowd view), after departure 0 peers and the two rivals.

  | profile | players | frame p50/p95 ms | convergence ms | reconnect ms |
  | --- | --- | --- | --- | --- |
  | desktop | 1 | 16.7 / 16.7 | 380 | – |
  | desktop | 8 | 16.7 / 33.3 | 362 | 69 |
  | desktop | 16 | 33.3 / 33.4 | 1465 | 78 |
  | desktop | 32 | 33.3 / 50.0 | 592 | 96 |
  | phone-viewport | 1 | 16.7 / 16.8 | 198 | – |
  | phone-viewport | 8 | 16.7 / 16.7 | 428 | 18 |
  | phone-viewport | 16 | 16.7 / 33.3 | 999 | 69 |
  | phone-viewport | 32 | 33.3 / 33.4 | 414 | 75 |

- `pnpm run verify`: see Results.

## Results

`pnpm run verify` (core) on the dirty tree at `986977ef`, started 2026-10-30T06:38Z under
`caffeinate -s`, load 16–26: **exit 0**, receipt `.runtime/agent/core.json` status `passed`.
Counts: agent 289/289 pass; preview 4714 tests, 4678 pass, 0 fail, 1 skipped, 35 todo;
server 1367 tests, 1082 pass, 0 fail, 285 skipped (Redis/hosted, not evidence);
desktop 132 tests, 127 pass, 0 fail, 5 skipped; python 214 passed; build, plugin, python
lint/format, demo, demo-verify and secrets (no leaks) passed.

## Gaps

- One run on a loaded shared host (load ~16): frame numbers are a single sample, not a
  #599 comparison; the ABBA render-tier evidence is still #599's to collect.
- Hosted CI, `verify full` and browser journeys were not run; the audit is not part of either.
- #708 and #732 edit the same audit lines with a `kind` filter; whichever lands second
  must rebase onto `peerRoster` (it subsumes both).

## Next step

Val lands the PR. #599 can then run the render tiers on main without a scratch patch.
