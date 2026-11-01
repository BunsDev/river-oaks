# Wave-4 steward (goal 2026-11-01)

Goal: Val, 2026-11-01 (`/goal implement as follows: …/2026-11-01-wave-4-steward-goal.md`). Session `claude:river-oaks-b3 (6f600af1)`, register task `wave-4-steward-20261101`, branch `docs/wave-4-steward-20261101`, worktree `../river-oaks-wave-4-steward-20261101` from `main` `decb4e9a`. This ledger owns only itself.

## Objective

1. `main` green, with the cause of any red named (hosted Verify, Dependabot alert 20).
2. A disposition for every open PR; land only under the goal's landing line; `project:check --github` below 180.
3. CI headroom: per-shard timings, the shards within 4 min of the 20-minute cap, one safe change in a draft PR.
4. #599: a #785 recommendation with a test-first draft, the Redis 8-player quiet repeat under a load <8 gate, a #784 verdict, increment 6 scoped.
5. A numbered Decisions for Val list.

## Baseline (2026-11-01 08:20Z to 08:35Z, `main` `decb4e9a`)

- Hosted Verify on `decb4e9a` (run 41252631179, #829's docs-only merge): attempt 1 `cancelled`; `preview experience (terraces)`, `(depth)`, `(access)` and `preview shared (required)` were cut at the 20-minute cap at 23:48Z; the 18 other jobs passed; `5b00fd0b` before it passed 30/30.
- Last 36 push runs on `main` (`preview *` jobs): 4 cancelled jobs, all in that run; 5 failed jobs (`ribbonwing` ×3, `places` ×1, `heights-return` ×1, the known flakes). Shard maxima: `preview checks` 16 min (≥15 min in 25 of 36), `commons` 16 min (≥15 in 6 of 36), `shared (required)` / `terraces` / `access` / `depth` 20 min only in the cancelled run (otherwise ≤14), everything else ≤13 min.
- Dependabot: the `npm_and_yarn` update for alert 20 (minimatch <11.0.1, medium, transitive, development) fails on every scheduled attempt since 10-31 (runs 41181156423, 41260776016).
- Open PRs: 44 (3 ready: #786, #794, #819; 41 drafts). Landing queue empty; no `.git/river-oaks-land-queue.lock`.
- Register: 667 tasks (52 active, 22 blocked, 102 queued, 20 delivered, 471 retired). `project:check --github`: 180 gaps at 08:16Z; 126 at 08:31Z after the 10-27 goal's closing hygiene sweep cleared stale `worktree` paths on 54 owner-null queued rows (recorded on #717). Remaining classes: 34 "no local branch" on other sessions' rows, 22 missing worktree paths on owned or delivered rows, 4 unregistered detached worktrees, 14 local/PR head differences, pending retirements, and the 285 lost pre-10-22 archives as one line.
- Live sessions (ListAgents, register leases, `ps` for `claude --resume`, transcript mtimes): `river-oaks-48` (10-31 docs review; owns `main`'s rerun), `river-oaks-41` (#832, lease 10:30Z), the R9 plan session (#833, 10:00Z), Codex `host-isolation-286` (08:30Z), cody's coven-cave sessions (#826–#828), `river-oaks-50` (busy, task unknown). Host load 13.8 (1 min) at 08:30Z; the clock is NTP-true (GitHub's `Date` header matched to the second). GitHub's *resource* timestamps (`merged_at`, `run_started_at`, `pushed_at`) read about 52 minutes ahead of that clock and of GitHub's own `Date` header all morning (for example `merged_at` 09:53:35Z for a merge this session observed at 09:00Z); times in this ledger are the local NTP-true clock unless marked "GitHub".

## Round 1: `main` and Dependabot

- **Verify rerun, owned by a live peer.** `river-oaks-48` confirmed by cross-session message that it owns `decb4e9a`'s Verify (its #829 merge) and reran the four cut jobs under its own authorization; GitHub records attempt 2 of run 41252631179 starting at 09:27Z (GitHub stamp; the local clock read 08:31Z while the jobs were already running, the same offset as above). Its diagnosis: the same runner hang #829's PR run showed, stuck in the Playwright apt-cache setup step before any journey ran. Attempt 2 at 08:40Z: `terraces`, `access`, `depth` passed; `shared (required)` in progress. Outcome recorded below when terminal.
- **Dependabot alert 20 diagnosis** (job 124713407645 log): `security_update_not_possible` — `latest-resolvable-version: 3.1.5`, `lowest-non-vulnerable-version: 11.0.1`, no conflicting dependencies. The only remaining `minimatch@3.1.5` sits under `electron-winstaller@5.4.4 > @electron/asar@^3.2.1`; electron-winstaller's latest release (5.4.4, the one installed) still declares `@electron/asar ^3`, and asar 3 default-imports minimatch, which 11 does not export (#821's reasoning). So no version bump exists today; #821 already pins asar 4's copy to 11.0.1 and ignores the GHSA in `pnpm audit` for the asar-3 path with that justification. The scheduled job will keep failing until the alert is dismissed or electron-winstaller moves to asar 4. Decision 1 below. Nothing to add without weakening a check.

## Round 2: the ready three

| PR | Head | Behind `main` | Merge-tree | Commits verified | Owner liveness | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| #794 depth clone shader callbacks | `b976c357` | 163 | clean | 1/1 | `river-oaks-bb (4a824f53)`: last transcript write 2026-10-30 13:37Z, no process, not in ListAgents → not live | **Approve.** Two clone sites copy `onBeforeCompile` and `customProgramCacheKey` from the source material before the polygon-offset assignment; `Material.clone` copies maps but not those callbacks, so the depth-biased masses lost the metric-UV patch (#695 regression). The new assertion in `district-depth.test.js` compiles each opaque depth-biased mass's patch and checks the program key, so the regression is covered. No budget, timeout or threshold changes. |
| #819 phase-3 tree overlaps (#584) | `03eec146` | 13 | clean | 2/2 | `river-oaks-86 (2421a3)`: no transcript under any project, no process, not in ListAgents → not live | **Approve.** Config-only (15 destination recipes and their `.lock.json` counterparts); no client or server file. The two red checks on the head are `preview unit` → "Audit locked JavaScript dependencies" at 10-31 02:01Z, the minimatch/glob advisory that #821 cleared on `main` at 22:10Z, and the `preview` aggregate that follows it; a head updated from `main` clears both. Route fixtures are not touched, so the pinned police routes (`resident-locations.test.js`) are unaffected unless the lander's merge shows otherwise. |
| #786 render audit tier convergence (#778) | `a72208da` | 210 | **conflict** in `preview/audit/rendered-multiplayer.js` (5 hunks) | 1/1 | `claude:render-audit-778`: no session id, lease lapsed 10-30 18:30Z, no process → not live | **Hold, superseded in substance.** #778 was closed on 10-30 23:34Z as fixed on `main` by #708 (`b19456ec`): remote figures carry `kind`, and `converge()`, the on-screen count, the per-sample assertion and the final peer check all filter `kind === 'player'`. #786 reaches the same end by a roster-id predicate (`peerRoster` in `metrics.js`, with three new unit tests) and reconciles the report. Every conflict hunk is a choice between the two approaches on the same lines, which is the owner's call, not a steward's merge. Decision 2 below: close as superseded, or rebase as a test-only addition (`peerRoster` + tests) with the audit file left as `main` has it. |

### Round 1 outcome (main green)

Attempt 2 of run 41252631179 completed with every job green (22 success, `dependency-review` skipped by design); the `preview` aggregate on `decb4e9a` now reads `success`. `river-oaks-48` confirmed by message and recorded it on its own register row (`docs-plans-review-closeout-20261031`, `observed.mainVerify`). Finish-line item 1 holds; the Dependabot run stays red by design until Decision 1.

## Round 3: CI headroom

Step timings for the three jobs nearest the cap, from the last 12 push runs on `main` (jobs API, step `started_at`/`completed_at`):

| Job | Step | Mean | Max |
| --- | --- | --- | --- |
| `preview checks` | `pnpm run test:server` | 11.4 min | 11.8 min |
| `preview checks` | email/content-security browser regressions | 1.7 | 2.0 |
| `preview checks` | IPIC screening journey | 1.4 | 1.5 |
| `preview experience (commons)` | contextual action, photo and command journeys | 10.5 | 13.4 |
| `preview shared (required)` | shared town journeys | 8.6 | 9.8 |

`test:server` is 219 files, 1437 tests, serial sum 1133 s against 707 s wall on the 4-core runner (default file concurrency 3); the long tail is single tests of 21–55 s (stack and activation rehearsals, the Redis B12 walker test, the two-coordinator recliner test), so more in-process concurrency would stack them on one runner. Change chosen: run the server suite as two equal file shards with Node's `--test-shard` on a two-way job matrix, and keep the desktop and browser steps on shard 1. Expected: shard 1 ≈ 6 + 4 min, shard 2 ≈ 6 min; the `preview` aggregate needs the job id, so both must pass; no timeout, journey, or threshold changes. Branch `ci/preview-checks-server-shard-20261101` (`scripts/test-server-shard.mjs`, `test:server:shard` with its `pre` pnpm guard, `verify.yml`). Local shard timings and the PR's hosted run are recorded below when they finish. `commons` (13.4 max) is left as a finding: its one step is one journey list, and splitting it is a shard-list edit for the experience matrix, which Decision 3 asks about.

## Round 4: #599

- **#785 recommendation.** Refuse `travel` only while an officer is on the player (`pursue`, `grab`, `arrest` targeting them); leave it open while merely wanted (star cooling, no officer), while the officers are searching (they lost the player: that is the escape), and once they stand down. Reason: the fair-chase gap is a hop out of an active pursuit, and the three other states are the on-foot outcomes the design wants to reward. Refusing on stars alone would also strand a wanted player in a danger zone with no officer near.
- **Test-first draft** on `feat/wanted-travel-785-20261101`: `server/tests/wanted-travel.test.js` (3 cases through `createSharedWorld` on the real District: wanted-not-pursued travels and keeps the star; pursued is refused `pursued` with nobody moved, through grab and arrest; emergency off reopens it). On unmodified `main` `decb4e9a` (run from the ledger worktree): 1 pass, 2 fail (`undefined` where `pursued` is expected). With the change (`police.pursuing(id)` accessor; one check in `travel()` after the cooldown, before destination resolution; a `docs/crime.md` bullet): 3/3. Contact time, server validation and every budget are untouched; the check is a reject before any geometry.
- **Journeys that hop while pursued (inventory, not changed here):** `crime-encounter` (#732, hosted in `preview shared (development)`) travels out of the danger zone in its "stars held under observation" row while pursued, to show the star surviving departure; under the rule that hop is refused and the row needs a walk (pose) out of the zone or an evade-then-walk. Its "safe-zone transition inside the windup" travel happens at zero stars with no officer, so it is unaffected. `crime-conceal` on draft #784 reaches the inner bay by one hop while pursued, per its own body; it would need the walk to the bay that #784's "Not claimed" paragraph says officers currently follow. Focused suite results and the draft PR's hosted run follow.

### #784 review (lane service yard, #599 escape by concealment)

Head `f1ed985d`, 28/28 green, behind `main`; owner `river-oaks-3d (c317fd0a)` lease lapsed 10-30 09:57Z, no process, not in ListAgents. Files: `preview/src/lane-cover.js` (three axis-aligned boxes in the south service lane as 0.3 m disc footprints on a 0.4 m pitch, taller than the 1.2 m sight line), `lane-cover-mesh.js`, `walking.js` (the yard joins the prop boxes that block bodies, and is the only prop that also fails `hasSightLine` samples), `main.js` (mesh + a dev-only inspector), `shared-runner.js` (a `crime-conceal` journey, selected by name only, reset like `crime-shared`), `server/tests/lane-cover.test.js`, `docs/crime.md`, its ledger. **Verdict: approve the mechanism; hold the PR.** The walking change is contained (one extra box list, one extra predicate in the 0.15 m sight sweep) and the server test sweeps the lane for sight. Exact remaining blockers: (1) its own body says the tested escape reaches the inner bay by one `travel` hop while pursued, which the #785 rule refuses, so the journey and the claim need the on-foot approach once #785's rule is decided (Decision 4 fixes the order); (2) its head is 11 days of `main` behind and must be updated by its owner or under a release.

### Round 3, local shard timings

`RIVER_OAKS_TEST_SHARD=1/2` and `2/2` through `pnpm run test:server:shard` on this host (no `REDIS_URL`, so the Redis files skip; 1-min load 74–102 from other sessions): shard 1 = 781 tests (605 pass, 176 skipped) in 100 s; shard 2 = 614 tests (505 pass, 109 skipped) in 67 s; 0 failures. The hosted numbers (with Redis, 4 cores) come from the draft PR's run.

### Increment 6 scoping (night sky, peer-visible evade), not built

Owner findings come from the draft-wave-2 ledger on #724 (decisions 4 and 6, 2026-10-28) and the code on `main` `decb4e9a`:

- **Night sky.** `preview/src/main.js` `updateAtmosphere()` (lines 940–957) reads `#sun-hour` and `#weather`, asks `atmosphereFor(hour, weather)` for sun, fog and horizon, and sets `scene.background` to the daytime HDR whenever the weather is not overcast, so the `crime-night` journey's 19:00 setting renders a daylight sky. The work is an authored night horizon and sky tint past the last authored hour, lamps for the south service lane (the lane's warm entrance strips exist in `reference-blocks.js` but no street lighting), and a capture budget check in the `crime-night` journey (`preview/e2e/crime-night.js`, 9 checks, 18.8 s on #732's head). Owner: whoever owns `main.js` lighting (`atmosphereFor`) and the Pink Jet-Age R8/R9 direction decides the palette, since #738 aligned Crime Feel presentation to it on 10-28. Est. one focused PR; the hour control and HDR stay as they are for daytime.
- **Peer-visible evade.** `server/crime.js` keeps `evades` (direction, `at`, ids) per player (line 76; checkpointed at 322) and the command reply carries `{direction, remainingMs}` to the evader only (line 237); the public snapshot carries no evade state, so `owner.evadeShownAfterVisitorKeyMs` in the increment-5 measurement is null by construction. The work is one public field per participant in the crime snapshot (direction and remaining ms, pruned with the existing `evades` sweep at line 98), the remote-figure pose for it in `preview/src/crime-ui.js` / the remote players' layer, the measurement on the witness page, and a snapshot-size check (the workload table in `docs/crime.md` is the budget). Owner: the Crime Feel lane (`river-oaks-3d` held it last; lease lapsed 10-31 11:00Z). Est. one server PR with a transport test and one client PR, stacked.
- **Order.** Both wait on Decision 5 below; neither blocks #785 or #784.

### Landing record

- **#794** landed 2026-11-01 ~09:00Z (GitHub `merged_at` 09:53:35Z) through `pnpm run land 794 --owner "claude:river-oaks-b3 (6f600af1)"`: `draft: false` confirmed over REST first; the lander updated the branch (`785dce4d` = `b976c357` merged with `main`), Verify passed on it, merge `9d139387`. Production deployment 7470830548 created for that sha (GitHub stamp 09:54:17Z). Register row `depth-clone-callbacks-20261030` marked delivered with `{pr, reviewedHead, landedHead, merge, tree, checks}`; the owner's worktree waits for the guarded prune.
- **#819** landed ~09:40Z through `pnpm run land 819`: `draft: false` confirmed first; the lander waited one slot, updated the branch (`7783dcc6`), Verify passed, merge `e3d398ce`. Production deployment 7471233273 exists for that sha. Register row `phase3-tree-overlaps-20261030` marked delivered with evidence.

## Dispositions (sweep 08:50Z, 44 open PRs; checks are on each PR's head, `behind` is commits of `main` not in it)

| PR | Owner (liveness) | Head state | Disposition |
| --- | --- | --- | --- |
| #794 | `river-oaks-bb` lapsed | landed | **Landed** `9d139387` |
| #819 | `river-oaks-86` lapsed | landed | **Landed** `e3d398ce` |
| #786 | `render-audit-778` lapsed | ready, conflict, 210 behind | **Held**: superseded by #708's `b19456ec`; Decision 2 |
| #784 | `river-oaks-3d` lapsed | draft, 28/28, 239 behind | **Verdict: approve mechanism, hold** on #785's order (Decision 4) and a branch update by its owner or under a release |
| #705 | `river-oaks-91` lapsed | draft, 26/26, 510 behind | **Held**: never landed without a line; Decision 6 |
| #831 | unregistered (ChatGPT branch) | draft, `preview experience (depth)` red | **Review only, held**: 4 files; `render-quality.js` flips the default finish on, with a default-foundation test and the live-kit test adjusted. The depth shard fails on the head, which is the cost of default-on the depth budget was written to catch; a product call. Decision 7 |
| #697 | `river-oaks-71 (044cb069)` live (process up, lease to 11-02 06:00Z, pushed a `main` merge today, GitHub stamp 08:48Z) | draft, checks running | **Owner's**, left alone |
| #834 | `garden-circuit-jev-tricks` (lease lapsed 01:00Z, but merged `main` and marked ready today, GitHub stamps 08:54Z and 09:54Z) | ready, checks running | **Owner's by activity**, left alone; not in this goal's table |
| #843 | `river-oaks-6d` live | draft, checks running | **Owner's** (Five Rooms plan), left alone |
| #830 | nova (coven-cave; lease lapsed 10-31 23:00Z, marked ready today, GitHub stamp 09:51Z) | ready, 30/30, 5 behind | **Owner's by activity**; a touch-controls feature with its own journey, not reviewed here |
| #832 #833 | `river-oaks-41`, R9 plan session (live) | drafts, green | **Owners'** |
| #826 #827 #828 | cody (coven-cave sessions present; leases lapsed 03:00–04:00Z) | drafts, green, 5 behind | **Owner's**; not released in writing |
| #787 #788 #789 | `river-oaks-01` lapsed | drafts, 28/28, ~200 behind | **Held**: Pink Jet-Age opt-ins whose order is #738's (Decision 8) |
| #800 #807 #810 | `river-oaks-d0` blocked rows | drafts; #810 red on the pre-#821 audit | **Held**: stacked 800→807→810, owner blocked on #441 |
| #813 #814 #815 #816 #817 #818 #822 | `river-oaks-ribbonwing (9b98c1a1)` lapsed | drafts; #813 #818 #822 red only on the pre-#821 audit | **Held**: Jevica likeness stack and the autoland fix; Val reviews the captures |
| #792 | `codex:ribbonwing-flicker` blocked row | draft, 22/22, 181 behind | **Held** with its owner |
| #790 #796 | `river-oaks-bb` lapsed | drafts, green, 138–163 behind | **Held**: depth burn-downs in bb's lane; #707 (same lane) red on `depth` |
| #707 | `river-oaks-bb` blocked row | draft, `depth` shard red since 10-30 | **Held** (wave-3 round 4) |
| #685 #719 #709 | lapsed owners | drafts, 510–728 behind | **Held** since wave 3 (Decision 9) |
| #755 | — | draft, 351 behind | **Recommend close**: superseded by merged #756 (Decision 10) |
| #727 #728 | owner null, blocked rows | drafts; #728 red on `preview checks` since 10-28 | **Held** on Val's Safari sound row (wave-3 decision 6) |
| #668 #687 #697 #724 #748 #795 | lapsed or null | docs drafts, 200–787 behind; #687 red on `campus` since 10-28 | **Held**: land as docs or close (Decision 11) |

Pre-#821 audit reds (`preview unit` → "Audit locked JavaScript dependencies", 10-31 02:00–05:10Z) clear on any head updated from `main`; they are not defects in those PRs.

## Decisions for Val

Each needs one line from you; nothing below is simulated. Wave-3 items 11–20 that are still open are carried at the end.

1. **Dependabot alert 20 (minimatch <11.0.1 under `electron-winstaller > @electron/asar@3`).** The updater reports `security_update_not_possible` (latest resolvable 3.1.5, first fixed 11.0.1) and will fail every scheduled run. No electron-winstaller release depends on asar 4. Dismiss the alert as "no fix available / tolerable" with #821's justification (asar 3 only extracts; the pattern path is never built), or keep the red run as a reminder. The session may not dismiss alerts.
2. **#786 (render-audit convergence).** #778 is fixed on `main` by #708. Close #786 as superseded, or ask its owner to rebase it as a test-only addition (`peerRoster` + three unit tests) over `main`'s `kind === 'player'` audit.
3. **`preview experience (commons)` at 13.4 min max.** Its one step is one journey list in the experience matrix. Authorize splitting that list into two shards (same journeys, no budget change) in a follow-up to the CI PR, or accept the margin.
4. **#785 rule and order.** Recommended: refuse `travel` only while an officer is on the player (`pursue`/`grab`/`arrest`); keep it while merely wanted, while searched for, and after stand-down. Alternatives: refuse on any star, or leave travel as it is and document the hop. If you take the recommendation, land the #785 draft first, then #784 adapts `crime-conceal` to the on-foot approach before it lands; `crime-encounter`'s departure row needs the same adaptation (the #785 PR's hosted run shows whether it is required now).
5. **Increment 6.** Scope the night sky and the peer-visible evade into one increment with the owners named in the scoping section, or accept both for the first playable (#724 decisions 4 and 6).
6. **#705.** Owner `river-oaks-91` has been silent since 10-28; the packet is complete via #717/#720. Say: land #705's stack-gate code (after a branch update under a release), park it, or close it. Activation conditions stay yours.
7. **#831 (default-on Pink Jet-Age presentation, ChatGPT branch).** Register it to an owner who finishes the depth-budget question, or close it; it is a product default, not a steward call.
8. **Pink Jet-Age R2/R6/R8 opt-ins (#787 #788 #789).** `river-oaks-01` is gone; name who updates and lands them, in #738's order, or park them.
9. **#685 #719 #709 (held since wave 3).** Still expected from their owners, or close.
10. **#755.** Close as superseded by #756 (the session may not close PRs).
11. **Docs drafts #668 #687 #697 #724 #748 #795.** Land as docs (each needs a branch update and a green run) or close. #697 is live with `river-oaks-71`.
12. **Redis 8-player quiet repeat (#599).** The gate for load <8 is armed for six hours this morning; if it does not open, say whether to run it at the next quiet window on this host or accept "Not met at load 7–10" as the record.
13. **Carried from wave 3 (still open):** 11 coordinator idle-tick A/B; 13 `ops/browser-lock-turns-20261024`; 14 archives lost on 10-22 (285 rows); 15 record-only rows sweep; 16 missing-worktree records (`character-fidelity-517-review`, `integrated-expansion-mvp-20261023`); 17 orphan siblings; 18 `crime-melee-597` dirty worktree; 19 the f1 streaming mirror; 20 local-only ledgers.

### Core verify under host load (09:00Z)

`pnpm run verify` on the #785 branch: `agent-tests` passed (89 s); `preview-tests` was SIGKILLed at the stage's 600 s cap (`ETIMEDOUT`, receipt `.runtime/agent/core.json`, log `scratchpad/785-core-verify.log`, 2018 lines, no failing test before the kill); the later stages did not run. The 1-minute load was 84–105 on 18 cores throughout, from other projects on this host (a Rust build, two browsers, Discord, another repo's vitest). This is the host-load pattern in memory, not a defect in the change, and the stage cap stays as it is. Reruns for the #785, CI-shard and ledger branches are queued one after another behind a 1-minute-load-under-16 gate (three hours); no commit is pushed before its branch's core receipt reads `passed`.


### #844 (the #785 draft)

Committed signed as `547d706b` (`G val@opencoven.ai`) after core verify passed on the branch (09:24–09:32Z, load 15–31); pushed and opened as draft #844 over REST; register task `wanted-travel-785-20261101` holds it. Hosted results are recorded when its run completes.

### Core receipts and drafts (10:05Z)

Gated reruns (1-minute load under 16) passed core verify on all three branches: #785 branch 09:24–09:32Z, CI-shard branch 09:50–09:56Z, this ledger branch 09:57–10:03Z (loads 14–35). The CI split is committed signed as `16e04be3` and open as draft **#846** (register `preview-checks-server-shard-20261101`); its hosted shard durations are recorded against the 11.4 min baseline when the run completes. The Redis 8-player repeat gate (pid 45676, load under 8, six hours from 08:53Z) is still waiting.

## Next step

Hosted results for #844 and #846; the Redis repeat result or its gate log; Val's answers to the Decisions above. Nothing else in this goal is landable without a line from Val.
