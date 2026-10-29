# Wave-3 steward (goal 2026-10-29)

Owner: `claude:river-oaks-bb (97524b7a)`, successor of `claude:river-oaks-bb (5c00df30)` in the same terminal after `/clear`. Task `wave-3-steward-20261029`, branch `docs/wave-3-steward-20261029` in `../river-oaks-wave-3-steward`, from `origin/main` `39a5f302`.

Goal: Val, 2026-10-29 ~22:12Z, "proceed with your recommendations" on the wave-3 steward prompt. The Authority block was not edited, so only the pre-ticked landing (#716) is authorized. Every other landing is listed under Decisions for Val.

## Objective

1. Finish the predecessor's sweep (`pr-sweep-lander-20261028`): land #716, retire `../river-oaks-pr691-merge` and `../river-oaks-pr715-merge`.
2. Coordinator idle tick: re-measure on current `main`; build a fix only if the regression is still there.
3. Split `preview shared (required)`, with a before/after duration table.
4. Make the register and inventory smaller, with evidence.
5. One consolidated Decisions for Val list.

## Files owned

- This ledger.
- `ci/shared-required-split-20261029`: `.github/workflows/verify.yml` (preview-shared matrix), `preview/e2e/shared-runner.js` (modes), `docs/testing.md` (mode list).

## Baseline (2026-10-29 22:15Z)

- `origin/main` `39a5f302`. Land queue empty. 21 open PRs, all drafts. Host load 7–14.
- `project:check --github`: 162 gaps. `project:inventory`: 86 worktrees, 88 branches.
- Live river-oaks sessions (ListAgents): 3d, f7, 86, de, 22.

## Round 1: #716

- #716 head `13cd0a84`, base `main`, `mergeable_state: dirty` after #711 and #715 merged. The owner, `claude:river-oaks-ac`, is not live (missing from ListAgents; no process). Val ticked #716 in the 10-28 wave (`green-wave-lander-20261028`) and again in this goal.
- Detached copy `../river-oaks-pr716-merge` (register `pr716-merge-scratch-20261029`): merged `origin/main` `39a5f302`, with two conflicts:
  - `preview/src/sidebar.js`: kept #716's gate-copied `createSupportContact()` from `settings-support.js`, plus #711's blocked-residents pane.
  - `docs/app-review-292.md`: kept #716's final readiness rows, plus #711's integrated Block row; the intro and review-notes line no longer call Block a gap.
- Signed merge `a0cd049f` (verified `G` against a scratch allowed-signers file). Focused `support-contact` + `player-blocks` tests 17/17. Core verify on `a0cd049f`: passed (unit 289/289, preview 4,646 of 4,682 pass with 0 failed, server 1,080 of 1,365 with Redis-gated skips and 0 failed, 127 of 132). Pushed `13cd0a84..a0cd049f` to `feat/support-contact-gate-292-20261027` at ~22:22Z.
- Mark ready: `gh pr ready 716` failed twice with "GraphQL: API rate limit already exceeded" (22:22Z and 22:26Z), although `rate_limit` reported 3,154 and then 2,824 GraphQL calls left. A direct `markPullRequestReadyForReview` mutation was refused by this session's permission classifier. #716 stays a draft until Val marks it ready or allows the call; then `pnpm run land 716`.
- Predecessor scratch retired (22:30Z): `../river-oaks-pr691-merge` (`8805a07b`) and `../river-oaks-pr715-merge` (`2de0bf5c`), both tips in `main`. Retired with `project:prune --cancel-stale --detached-path ... --apply` after clean dry runs. Archives `~/worktree-backups/river-oaks/cancel-detached-r9rED6` and `cancel-detached-TGCLIv` (manifest status `cancelled-local`). Worktree registrations are gone.

## Round 2: preview shared split

Per-journey seconds in `preview shared (required)`, read from the "Running/Passed" log lines of four green `main` runs (40955715604, 40950893563, 40942273791, 40935449320). Job total 15.2–16.4 min against the 20-min cut:

| Journey | s |
| --- | --- |
| character-studio-shared | 180–192 |
| resident-names | 133–162 |
| character-studio-tiers | 119–133 |
| multiplayer | 104–116 |
| greetings | 45–48 |
| multiplayer-exclusivity | 36–40 |
| sit-and-water | 36–38 |
| multiplayer-gate | 32–33 |
| player-blocking | 30–32 |
| indoor-npcs | 24–31 |
| default-appearance-tiers | 26–29 |
| access-gate | 24–25 |
| vehicle-exit, connection-required | 14–16 |
| player-blocking-interface, -lifecycle | 1–9 |

Change: a `required-characters` mode (same server setup as `required`) takes the three character journeys (about 340 s). Each of them already restarts the server first. `required` keeps the other 13 (about 500 s). No timeout changed.

- Local (Mac, Metal, full rendering, load 16–24): `pnpm run test:shared required-characters` passed 3/3, 22:27–22:31Z: character-studio-shared 109 s, character-studio-tiers 85 s, default-appearance-tiers 28 s. Report kept in the scratchpad, not committed.
- `ci/shared-required-split-20261029` at `b8dac965` (signed): core verify passed (289/289; preview 4,645 of 4,681 pass, 0 failed; server 1,080 of 1,365 with Redis-gated skips, 0 failed; 127 of 132). Draft **#764**.
- Expected hosted durations: `required` about 10–11 min, `required-characters` about 7–8 min (about 2 min of setup plus build on each). To be confirmed on the PR's hosted run.

## Round 3: coordinator idle tick

- Finding on record (#724 Round 5): #655's strolls moved route searches onto other ticks. Total work stayed the same (251 vs 248 ms of heavy ticks). The harness's p95 over 28 warm ticks (its second-slowest tick) went 33 → 60 ms, with one tier-1 miss (109.4 > 85.0) in one run. The other run had all tiers within. The limit is the harness's investigation comparison (`max baseline p95 × 1.2 + 5 ms`, active vs peaceful in the same tree), not a product budget.
- `stepResidentLife` already allows one route search per step (`planned`, `life.planning`). A "per-tick route-search budget" exists, so a fix would have to make single searches cheaper or time-sliced.
- Re-measure, 22:20–22:26Z: detached snapshot of `39a5f302` with the Codex `crime-redis-audit.js` copied read-only (register `tick-remeasure-snapshot-20261029`). Own Redis on 6497. Two back-to-back runs, after #716's verify finished.

| Tier | Run 1 limit / active p95 (ms) | Run 2 limit / active p95 (ms) |
| --- | --- | --- |
| 1 | 71.1 / 68.6 within | 71.2 / 49.3 within |
| 8 | 79.7 / 64.5 within | 96.0 / 98.7 **miss** (1 tick > 200 ms) |
| 16 | 83.3 / 64.2 within | 90.9 / 58.4 within |
| 32 | 108.8 / 64.1 within | 100.0 / 78.0 within (1 tick > 200 ms) |

- **Not valid as evidence: host load was 13.3 at the start and 25.8 three minutes in**, far above the ≤8–12 gate used by the 10-28 attribution. Peaceful (baseline) warm-idle p95 is itself 57–80 ms in these runs, so the noise is as large as the effect being looked for. Run 1 passed at every tier; run 2's single miss is 2.7 ms over its limit.
- **Decision: no product change built.** The finding is a redistribution of unchanged work, measured by a comparison threshold rather than a product budget, and `stepResidentLife` already allows one route search per step. A fix would mean cheaper or time-sliced searches: a behaviour change in residents' planning that needs a quiet-host A/B (`4557e70d` vs current `main`, load ≤ 8) to justify it. That run is listed below.

## Gaps

- #716 isn't landed: it needs the ready flip (see round 1).
- The tick re-measure was taken at load 13–25 and proves nothing either way. No quiet-host A/B was run.
- The split's hosted durations aren't measured yet (they need the PR's first run). `required` without the character journeys wasn't run locally; they ran last in that mode and each restarted the server first, so the remaining order is unchanged.
- `tick-remeasure-snapshot-20261029` (scratchpad `tick-main`, detached `39a5f302`, one untracked harness copy) can't be cancelled until its 12 h touch window ends (after 10-30 10:30Z): `project:prune --cancel-stale --detached-path <path> --expected-head 39a5f30272ea620ce692b95fcc15a8c69b9aff9f`.

## Decisions for Val

This list replaces the open lists in #724 (draft-wave-2) and the `docs/register-reconcile-20261028` ledger (`12ea8d75`, local). Their items that are now done are dropped.

**Landing (each goes through `pnpm run land <pr>` after a core receipt on its head and all hosted checks):**

1. **#716** (support contact under the gate, last of the #292 stack): resolved and pushed at `a0cd049f`, core passed. Mark it ready (`gh pr ready 716`), or allow this session to make that call, and it lands.
2. **#722** Quaternius clips: say "land #722".
3. **Crime stack #708 → #710 → #732** and the matrix **#731**: d1's leases are expired; 3d owns #732/#731 and is live. Say whether 3d lands the stack or a steward does.
4. **#695 + #707** depth audit and hardening (3e, ended): land, or hand them to a named session.
5. **#685** iOS shadow draws and **#719** wardrobe: held for owner fixes. Say whether the fixes are still expected.
6. **#727** IPIC packets (docs) and **#728** (WebKit MP4-first): both wait on your Safari sound row.
7. **#737** landowner hovercraft (owner lease expired 10-29 02:30Z): land, or leave with the owner.
8. **#755** stack-rehearsal fix: the same issue was fixed by merged #756. Close it, or say what it still adds.
9. **Ledger drafts** #668 #687 #697 #724: land them as docs, or close them.
10. **#764, the shared split from this goal**: land it once its hosted shards are green.

**Engineering calls:**

11. **Coordinator idle tick**: no fix built (see round 3). Authorize a quiet-host A/B (`4557e70d` vs `main`, load ≤ 8, own Redis), followed by a cheaper or time-sliced route search only if it reproduces. Or close the finding.
12. **Night sky for Crime Feel** (#724 decision 4) and the **evade state peers never see** (#724 decision 6): put them in increment 6, or accept them for the first playable.
13. **`ops/browser-lock-turns-20261024`** (one commit, `50e5cd48`): open a PR, or cancel it.

**Register and cleanup:**

14. **Archives lost on 10-22**: restore `~/worktree-backups` from another disk, or approve marking 286 restore paths unrecoverable.
15. **Record-only rows**: approve a sweep that retires email-account-transition, world-expansion-gate-587, phase2-review-582-583, crime-police-598, studio-acceptance-417-refresh, dev-server-5180, procedural-gpu-acceptance and garden-campus-510-verify with their existing evidence.
16. **Missing worktree records** (`character-fidelity-517-review`, `integrated-expansion-mvp-20261023`): approve clearing `worktree`.
17. **Unknown sibling orphans** `river-oaks-accept-final-5541f831` (2 dirty files) and `river-oaks-release-v0.2.2-tag`: name their owners.
18. **`crime-melee-597` worktree is dirty** (Codex cc29 state archived at `~/worktree-backups/river-oaks/crime-release-599-handoff-20261028/`): say whether it can be retired.
19. **The f1 streaming mirror** `../river-oaks-streaming-f1-review` (7 dirty files at `059a16a6`): who releases it.
20. **Ledgers still local**: `docs/register-reconcile-20261028` (`12ea8d75`) and `docs/goal-register-reconcile-20261028` (`3bd1918d`). Push them as draft docs PRs, or drop them.
