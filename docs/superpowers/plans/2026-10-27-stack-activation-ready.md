# The 3× world, activation-ready

Task `stack-activation-ready-20261027`, owner `claude:river-oaks-91 (a3bcb4)`, branch
`feat/stack-activation-ready-20261027`, worktree `../river-oaks-stack-activation`,
started from `main` `697c4a0d`. Issues: #586, #587, #638.

## Objective

Make `woodland-heights-1` and the revisions under it (`east-garden-commons-market-1`,
`bayou-heights-1`, `heights-studewood-1`, `bayou-terraces-1`) ready to activate, and end
with a go/no-go packet for Val. Activation, deploys and production access stay Val's;
none is authorized here.

Finish line (Val's goal, 2026-10-27):

1. This ledger before source, with production's revision established from the
   activation records, not from live production.
2. One measured District gate for the whole stack: ABBA of `main` at the production
   revision against `main` at `woodland-heights-1`, #626 protocol, limits unamended, plus
   cold transfer. Receipts checked independently. A failing row is fixed in the product
   and measured again. Intermediate revisions are measured if Val wants staged activation.
3. Streaming that fits: retained geometry measured across all five districts on the
   walked route; everything in view loads within its ceiling; disposal and no per-loop
   growth proven in the browser.
4. A reconnect measurement that tracks the rejoin, not the random retry delay, proposed
   with evidence. Val decides before it is used.
5. One activation rehearsal for the stack on isolated Redis with fixture identities:
   activate, then roll back down the chain to Gardens, with players and #670's residents
   placed correctly, and every checkpoint migration tested.
6. Hosted CI with headroom: every district shard well inside its timeout, without
   lengthening timeouts.
7. Signed, verified commits in draft PRs and the go/no-go packet.

## What is already established (not redone here)

River-oaks-e9's 3× acceptance pass on `a5857cf4` (task `three-x-on-main-20261026`,
ledger draft #687; evidence #638 comment 6446065460, #587 comment 6446071792):

- #587 conditions 1–3 met for `woodland-heights-1`: integrated build on `main`; journeys
  for every district; Commons and Heights activation rehearsals; `verify full` 19/19.
- District ABBA **with A = pre-stack `2d63637f` at `east-garden-commons-market-1`** and
  B = `a5857cf4` at `woodland-heights-1`: met (CPU p95 −0.7 to −2.8 %, mean frame 0 to
  −1.2 %, reconnect −9.6 % desktop, +0.8 % phone).
- Reachable ground 3.048× at 0.5 m (receipt `255dea7d`).
- Open: #587 condition 4 (Val's visual and device sign-off) and 5 (production state).
- `world-streaming` failed once on lap 12 (eviction wait); rerun on `95882097` passed.
  River-oaks-71 owns a facing-guard proposal (`streaming-evict-facing-20261027`).

## Production revision (item 1)

From the records only; this task cannot read production.

- `docs/world-expansion-activation.md`, condition 5: the operator must confirm production's
  `RIVER_OAKS_DISTRICT_REVISION` is `river-oaks-gardens-3` before the Commons switch; if
  it is still `river-oaks-garage-1`, the Gardens rollout finishes first.
- No record shows the Commons or any later revision activated. #587 condition 5 is open
  on e9's 2026-10-27 pass.
- **Working assumption: production serves `river-oaks-gardens-3`** (possibly still the
  garage). The stack gate therefore measures Gardens, which is what players see today,
  not the Commons. If the operator reports the garage, the gate adds a garage arm.

## Gaps found at the start

- **Gate baseline.** e9's ABBA used the Commons revision as A. Players are on Gardens (or
  the garage), so the step players would actually take, Gardens → `woodland-heights-1`,
  is unmeasured.
- **Runbook.** `docs/world-expansion-activation.md` covers the Commons and Bayou Heights
  only. Studewood, the Terraces and Woodland Heights have migrations
  (`server/district-{studewood,terraces,woodland}-checkpoint-migration.js`) and log events
  in `server/redis-room.js`, but no switch, watch or rollback section.
- **Rehearsal.** Only `commons-activation-rehearsal.test.js` and
  `heights-activation-rehearsal.test.js` run the real Redis gateway. The later
  migrations are covered by unit tests in `studewood.test.js`, `bayou-terraces.test.js`
  and `woodland-heights.test.js`, not by a rehearsal of switching and rolling back.
- **Streaming.** All five districts stream through `preview/src/heights-stream.js` under
  one `HEIGHTS_MAX_BYTES` of 16 MiB. The fourteen part estimates sum to about 40.7 MiB.
  What a walker sees at once on the full route has not been measured against it.

## Design

- **Gate (item 2).** One clean detached snapshot of current `main`. A =
  `river-oaks-gardens-3` (the harness default), B = `woodland-heights-1`, same tree.
  Order A1 B1 B2 A2 under one held browser lock, `caffeinate -s`, each arm admitted at a
  one-minute load ≤ 12, harness defaults (keep×5 reconnect). Compare with
  `baseline-compare.js`; check receipts with this session's independent reader. Cold
  transfer from the same build, per revision. A skip×9 diagnostic run accompanies it as
  input for item 4, never as the gate.
- **Rehearsal (item 5).** A new `server/tests/stack-activation-rehearsal.test.js` on the
  real Redis gateway, modelled on the Heights rehearsal: Gardens → Commons → Heights →
  Studewood → Terraces → Woodland, one epoch raise per step, each logging exactly one
  migration event; then rollback Woodland → Gardens in one step and step by step, with
  players and residents on valid ground and no one left east of the District edge.
  Fixture identities only.
- **Runbook.** Add Studewood, Terraces and Woodland sections in the Heights section's shape.
- **Streaming (item 3).** Measure resident bytes per part on the walked route across all
  five districts (headless first, then the browser under the lock). Prefer sharing the
  oak models over raising the ceiling. A ceiling change is a budget change and goes to Val.
- **Reconnect (item 4).** Proposal only: paired keep×5 and skip×N on the same arms,
  variance of each, and a recommended gated read. No harness default changes without Val.
- **CI (item 6).** Read per-shard durations on recent `main` runs, then shorten journeys
  or split shards that run close to their timeout. Timeouts stay unchanged.

## Files owned

- `docs/superpowers/plans/2026-10-27-stack-activation-ready.md`
- `docs/world-expansion-activation.md` (new Studewood, Terraces and Woodland sections)
- `server/tests/stack-activation-rehearsal.test.js` (new)
- Streaming and CI changes are named here before they are made.

Not touched: e9's `docs/three-x-on-main-20261026`, river-oaks-71's facing guard, #670.

## Checks

- Focused tests for each change; `pnpm run verify`; `pnpm run verify full` with an
  isolated Redis for the rehearsal.
- ABBA and cold transfer as above, receipts checked independently.
- Browser streaming walk through `scripts/browser-lock.mjs`, from a detached snapshot.
- Hosted Verify on each pushed head; rerun failed jobs once, keep first failures.
- Before reading any local timing failure, check `pmset -g log` for host sleep.

## Results

- 2026-10-27: worktree created from `main` `697c4a0d`; task claimed; ledger written.

## Status

In progress. Nothing activated, deployed or merged.

## Next step

1. Commit this ledger, push, open the draft PR.
2. Start the Gardens → `woodland-heights-1` ABBA from a detached snapshot.
3. Write the stack rehearsal while the ABBA runs.
