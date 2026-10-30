# #640 GTA-inspired on-foot encounter: increments 3, 4 and 5

Goal: Val, 2026-10-27 (`goal-640-crime-feel-increments-3-5`). Session `claude:river-oaks-d1 (c6ab037e)`.
Consumes #637 (#645, merged) and #640 increments 1–2 (#646, merged). Supplies evidence to #599.
Register tasks, one per PR branch:

| Increment | Task | Branch | Worktree |
| --- | --- | --- | --- |
| 3 resident reactions | `onfoot-encounter-640-inc3-20261027` | `feat/onfoot-encounter-640-inc3-20261027` | `../river-oaks-onfoot-640-inc3` |
| 4 client presentation | (stacked on 3, claimed when started) | | |
| 5 evidence | (stacked on 4, claimed when started) | | |

Not authorized here: merging or landing, deploys, production activation, budget or threshold
changes, new animation assets or audio, paid services. Timings and distances below are proposed
tuning, not approved budgets.

## State at start (2026-10-27 17:00Z)

- `main` `697c4a0d`, hosted Verify green on `95882097`.
- #645 (locomotion handoff) merged 2026-10-25 `3af2…`; #646 (melee phases, police perception, resisted
  capture) merged 2026-10-25. Checkpoint v17, writer generation 21/22.
- Register task `onfoot-encounter-640` is delivered with no owner. Its presentation worktree
  `../river-oaks-onfoot-presentation-640` holds one uncommitted, untracked file,
  `preview/tests/combat-motion.test.js`: a specification test for a `preview/src/combat-motion.js`
  that was never written. Left untouched; its design is adopted for increment 4 (credited below).
- `outdoor-residents-admin-controls-20261024` (codex:road-bricks-20261024): uncommitted work in
  `../river-oaks-outdoor-admin` restoring up to eight outdoor residents through the remote-player
  renderer (`preview/src/outdoor-residents.js`, figure ids `resident:<id>`). Lease expired
  2026-10-24T20:30Z; its last Codex transcript write is 2026-10-24T14:01. Not live, not taken over.
  Increment 3 draws residents through the same figure scheme in its own module so either lands
  first; the one-line `main.js` wiring overlaps and is recorded on #640.
- Milestone zone (Val's default in the goal): the south service lane, rival at (−2800, −1440).
  It lies inside `site_ring` (the ring's south edge passes about 1.8 m south of the rival), so
  residents can path there. Westcreek Lane is outside the ring.

## Increment 3 design: resident reactions

Server-authoritative, in the resident simulation the server already runs
(`preview/src/resident-life.js`, shared, not a garment-bake input), through the existing bounded
`motion.action` / `reactionUntil` override. Residents stay protected targets.

- **Alarms** (world.js, after `crime.step` and `police.step`):
  - a strike or counter that resolved at contact (hit, miss or evaded; not cancelled), at the
    actor's position (`crime.drainContacts()`, process-local, not checkpointed);
  - a police grab starting or an arrest starting (`alarm` callback from `createPolice`);
  - a wanted player (stars > 0) on foot within 6 m of a resident, checked at most every 250 ms.
- **Perception:** outdoor, non-stationary residents at street level within 20 m of the alarm
  (6 m for a wanted player) with a clear chest-height sight line (the police `sight` rule).
  Nearest first, at most 6 reacting residents at once, one reaction per resident per 10 s.
- **Reaction:** `startle` for 1 s (stop, face the alarm), then `flee` for 6 s along a routed path
  to clear non-road ground 12–18 m away from the alarm at about twice walking pace, or `cower`
  in place for 5 s when no flee route exists; then back to the routine. Held residents (a
  conversation, a wish, a visit) do not react.
- **State:** `motion.reaction = { kind, from: [east, north], until }` plus `motion.reactionCooldownUntil` on the
  resident's life record, so it rides in the checkpoint with the rest of resident life
  (`state.locals`). Restore validates it (kind, times, point). Snapshots add `life.reaction`
  (the kind or null). The resident count is unchanged.
- **Display:** `preview/src/resident-figures.js` maps outdoor residents within 120 m of the
  player (nearest 8) to remote-player figures, gesture `startled` while startled and `bow`
  (bent over, the existing crime `down` stand-in) while cowering; fleeing residents walk fast.
  Increment 4's pose layer gives them a dedicated cower.

## Files owned (increment 3)

See the register task. Not touched: garment-bake inputs, `community-ui.js`, `world-policy-ui.js`,
`walking.js`, `crime-release*`.

## Checks

- `node --test server/tests/resident-reactions.test.js` first failure kept under
  `.runtime/evidence-640/`.
- Focused suites with an isolated Redis; `pnpm run verify`; `crime-shared` journey with two
  Chromium clients; hosted CI on the pushed head; two independent reviews.

## Results (increment 3, 2026-10-27, worktree `../river-oaks-onfoot-640-inc3`)

Logs under the worktree's `.runtime/evidence-640/` (not committed).

- `node --test server/tests/resident-reactions.test.js`: first failure kept
  (`inc3-first-failure.txt`); now 6 pass.
- `node --test` on resident-reactions (preview, 2), resident-figures (3), volunteer-visits (9),
  remote-players (20): 40 pass after the review fixes.
- Focused suites (crime, crime-phases, police, resident-reactions ×2, resident-figures,
  resident-life, world-policy): 79 pass, 0 fail (`inc3-focused-suites.txt`).
- Transport suites without Redis: 22 pass, 4 skipped (`inc3-transport-suites.txt`). With an
  isolated `redis-server` on 127.0.0.1:6399 (crime-transport, world-policy-transport, redis-room,
  redis-backend, crime-phases): 44 pass, 0 skipped (`inc3-redis-suites.txt`).
- `pnpm run verify` (python 3.12 first on PATH): core passed before and after the review fixes
  (`inc3-verify-core.txt`, `inc3-verify-core-2.txt`; the second server stage: 127 pass, 0 fail,
  5 skipped, the Redis-gated tests covered by the isolated run above).
- `crime-residents` journey, two Chromium clients under `scripts/browser-lock.mjs`: run 1 failed on
  a stale stillness comparison (`crime-residents-run1.txt`), run 2 passed after the fix, run 3
  passed after the review fixes (`crime-residents-run3.txt`). `data/reports/shared-experience.json`
  restored after each run.
- Two independent reviews (fresh subagents on the diff: server; client and journey). Addressed:
  the tracked receipt the journey overwrote (restored); restore accepting a reaction on an indoor or
  stationary resident or timers far in the future (rejected / brought back to now, tested); the
  journey racing the rival's 20 s recovery (health clause dropped, population read during the
  flight); volunteer visits drafting a reacting resident (pool filter, tested); a flight that could
  end nearer the alarm (least-distance rule, tested); alarms during a storm (none); a held resident
  keeping a reaction (dropped, tested); the render audit and the indoor journey counting figures
  as peers (`kind` on remote stats); churn of the eight drawn residents at the cut (hysteresis,
  tested); the startle facing never shown (remote heading, tested); doc and ledger drift.
  Left for Val: nameplate ranking between residents and players; render-budget samples now
  include up to eight resident rigs; one hidden flight vehicle per resident entry.
- Hosted CI: on the pushed head, recorded on the PR.

## Results (increment 4, 2026-10-27, worktree `../river-oaks-onfoot-640-inc4`)

Logs under the worktree's `.runtime/evidence-640/` (not committed). Branch
`feat/onfoot-encounter-640-inc4-20261027`, stacked on increment 3.

- `preview/src/combat-motion.js` written to the adopted spec
  (`preview/tests/combat-motion.test.js`, copied from the untracked presentation worktree):
  15 pass after the pose and settle fixes (axis probes in `.runtime/evidence-640/probe*.mjs`).
- Wiring: `crime-ui.js` publishes `combatState` / `combatFocus` / `telegraph`; `player-avatar.js`
  faces the focus and layers the pose after `avatar.update()`, releasing held inputs once when
  held; `remote-players.js` plays the state forward from the snapshot's arrival; `main.js`
  attaches the state to player, rival and officer figures; `multiplayer.css` pulses the evade
  button on a telegraph; `docs/crime.md` "How a fight looks".
- `node --test` on combat-motion, crime-ui, remote-players: 50 pass, 0 fail after the reviews.
- `crime-shared` journey under the browser lock: run 1 passed (`inc4-crime-shared-run1.txt`),
  run 2 passed after the review fixes (`inc4-crime-shared-run2.txt`, 30.9 s; receipt copied to
  `inc4-crime-shared-run2-receipt.json`, tracked report restored).
- `pnpm run verify`: core passed before the reviews (`inc4-verify-core.txt`); core passed again on the reviewed tree (`inc4-verify-core-2.txt`, receipt `.runtime/agent/core.json`, dirty: uncommitted candidate): tooling 289/289; preview 4307 tests, 4306 pass, 1 existing skip; server 1320 tests, 1042 pass, 278 Redis-gated skips (no `REDIS_URL`; this increment touches no server code); desktop 132, 127 pass, 5 skips; then build, Python, demo and secrets.
- Two independent reviews (module; wiring and journey). Fixed with regressions: travel turn vs
  combat turn stacking on the local figure; legacy shove stacking on the strike layer; evade
  double-counting snapshot age; rival stagger pop after the strike ends; zero-duration
  `combatState` never ending / NaN; dead `arrest` hold; doc wording (hold releases push-to-talk and
  the look drag; subdued shows hands up). Noted for Val: start the local strike from the reply
  instead of the next snapshot (increment 5 measures the cost).
- Hosted CI: recorded on the PR.

## Gaps and next step

- Lane resident stops (optional re-routing) not added: the wanted-player alarm makes the journey
  deterministic without them.
- Reduced motion keeps the rest pose for residents; increment 4's layer owns poses.
- Increment 4 delivered as a draft PR (stacked on #708); see its results above.
- Next: increment 5 (`feat/onfoot-encounter-640-inc5-20261027`, `../river-oaks-onfoot-640-inc5`,
  stacked on increment 4): `server/crime-workload.js` (the #599 protocol of 2026-10-24, main vs
  branch), `preview/tests/combat-timing.test.js` (30/60/120 Hz under the proposed RTT 0/100/200 ms
  profiles, input-to-pose and contact alignment), the on-demand `crime-night` journey (two browsers
  in the south service lane at the latest authored hour), `pnpm run verify full` with isolated
  Redis from a clean detached snapshot.
