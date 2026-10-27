# Convergence, release candidate and 3× (2026-10-24)

## Objective and ownership

1. Land the open draft backlog onto `main` through the shared landing queue, one lander at a time.
2. Rerun the Commons and Heights release-candidate evidence on the converged `main` commit.
3. Open the 3× reachable-ground lane after Bayou Heights (#649).

Task `convergence-3x-20261024`, owner `claude:river-oaks-71 (3e5b45)`, branch `docs/convergence-3x-20261024`, worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-convergence-3x`. Owned files: this ledger. Every PR stays its owner's work. This task runs only the landers and edits no other branch.

## Authorization and default decisions

Around 23:35 UTC, Val answered the proposed goal with "proceed with all of the above e2e through to full completion … I will be asleep". That plan asked whether `pnpm run land` may land the listed PRs. This task reads Val's answer as permission to land, under the plan's conditions:

- hosted checks pass on the head that is up to date with `main`;
- the owner's required local checks are recorded;
- an independent review was done and its findings addressed;
- merging goes only through `pnpm run land` and the merge guard: no auto-merge, admin bypass or force-push.

Val left four questions unanswered. Each gets the default that changes nothing:

| Question | Default applied |
| --- | --- |
| Heights retained-geometry ceiling | Keep 16 MiB; out-of-view neighborhoods stream out, as #649 already does (no budget change) |
| #641 Bayou luxe polish | Held (Val requested changes; owner river-oaks-33 is reworking it) |
| #653 core-dump trade-off | Held |
| #654 desktop packet (#373/#372 answers) | Held |

Also excluded: security changes. #659's commit `66134f27` changes the WorkOS/waitlist access recheck. #659 lands only without that commit, or after Val reviews it.

Not authorized: deployment, production activation or reads, budget/security changes, land beyond the reserve, likeness intake, paid services.

## Coordination (2026-10-24, 23:36–23:55 UTC)

- **river-oaks-e9** (`landing-steward-20261024`) holds an overlapping goal. Its session has no landing authorization (Val ticked no rows there). Agreed split:
  - 71 runs every Phase 1 lander and the Phase 2 rerun, and owns Phase 3 (e9 handed it over at about 23:50Z, unstarted).
  - e9 runs no lander. It takes guarded retirement of each merge (after an exact-head release by the owner) and its D12 experience-stage fix.
  - 71 sends e9 the PR, merge SHA and owner task for each merge.
- **river-oaks-33** runs its own lander for #657, authorized earlier by Val. #657 is removed from this train.
- **river-oaks-a3:** the open-pr-sweep has no landing work in flight and no objection. Its sweep worktrees are released to e9 for retirement.
- Owners who said "hold until I confirm":
  - #647 (a8): review and verify full browser stages pending.
  - #656 (32): Jevica cost exceeds +10% in timing run 1; a load-gated rerun is queued; no code review yet.
  - #658/#659 (f1): browser runs queued; reviews starting.
  - #655 (3e): browser stages queued.
  - #649 (91): preview check failing at `8f3c94fd`.
- Owner agreed to this task landing the PR: #648 (bc), #651/#652 (7c).
- Owner sessions gone, so this task lands on the register evidence: #645 and #646 (`claude:onfoot-637-640-728d6f06`), #650 (`claude:river-oaks-56`).

## Phase 1: landing train

Order: #648 → #650 → #651 → #652 → #645 → #646, then each held PR as its owner confirms (#658, #659, #647, #656, #655, #649).

| PR | Basis to land | Lander | Result |
| --- | --- | --- | --- |
| #657 | Val authorized earlier, in river-oaks-33's session | river-oaks-33's lander | Merged `c3eae4f5` at about 23:49Z (Verify passed on `942711f5`) |
| #648 | Docs-only; hosted 22/22; core passed at `85d66e97` | 71, queued 23:37Z | Merged `26d63a06` at about 00:05Z, reviewed head `bbd68da9` (update-branch), Verify passed; on fetched main |
| #651 | Owner 7c agreed; Desktop and Verify green; 10/10 diagnostic legs; independent review addressed | 71, queued 23:39Z | Merged `4122fe07` at about 00:40Z, reviewed head `12ae37ac`, Verify passed; on fetched main |
| #641 | Val approved in river-oaks-33's session | river-oaks-33's lander (through a copy of the wrapper, after an "unstable" refusal) | Merged `0b9a97c4` at 04:01Z, reviewed head `e5202092`. This is the release-candidate commit |
| #658 | Owner f1 final head `4d870774`; reviews addressed; hosted 22/22; journeys on the exact and adjacent tree | 71 through the wrapper | Merged `e8207b2b` at about 12:20Z, reviewed head `48f8f511`; 22/22 checks complete; on fetched main. After the release candidate; touch controls only |
| #646 | Hosted 22/22 (crime-shared and world-rules-shared run in the hosted development shard); verify full on 83a1c4f6; two reviews addressed (owner session gone) | 71; attempt 3 through the wrapper | Merged `15334aad` at about 03:50Z, reviewed head `de9e325f`; 22/22 checks complete; on fetched main; owner task marked delivered. Rollback: checkpoint v17 / writer v21–22 needs build and Redis rolled back together |
| #645 | Hosted 22/22; every verify full stage passed across two runs on 7e267038; two reviews addressed (owner session gone) | 71; attempt 1 refused "unstable" (CodeQL swift queued); attempt 2 through the wrapper | Merged `a437cbbf` at about 03:10Z, reviewed head `e4d0413`; 22/22 checks complete; on fetched main; owner task marked delivered. Human gameplay-feel review (#637/#599) open |
| #647 | Owner a8 confirmed final head 2586c39a; review's four defects fixed failing-first; hosted 29/29; core on identical source | 71; attempt 2 through the check-waiting wrapper | Merged `2c2f2eec` at about 02:58Z, reviewed head `0918a012`; all 29 checks complete, including CodeQL Swift; on fetched main |
| #652 | Owner 7c agreed; Desktop and Verify green; cache miss and hit proven on three runners; review addressed | 71; attempt 1 refused "unstable" (Desktop installers running); attempt 3 through the check-waiting wrapper | Merged `7ad9ffc6` at about 01:55Z, reviewed head `65aef4ac`; all 31 checks complete; on fetched main |
| #650 | Two independent reviews addressed; hosted 22/22; core `b612ac51`; actual-screen 12/12; two-browser 19/19 (owner river-oaks-56, gone) | 71, queued 23:39Z | Merged `2da76e1f` at about 00:17Z, reviewed head `b7b9e5d0`, Verify passed; on fetched main; owner task marked delivered |

### #658 confirmed by its owner and queued (about 11:55Z)

river-oaks-f1 confirmed `4d870774` as final:
- **On the exact tree:** touch-layout passed in WebKit and Chromium (31 checks; 2 known landscape-overlap cases; 8 not run in each); core passed.
- **At `b939f1e6`, which differs only in touch-layout and docs:** touch-hold passed in Chromium (33) and WebKit (21, plus 4 multi-finger cases not run); background-input, contextual-first-visit and voice-shared passed.
- **Same as main:** touch-people and carriage-mobile fail the same way there.
- **Review and hosted:** the independent review and the Copilot review are addressed; hosted 22/22 on `4d870774`.

This task marked it ready and queued it through the check-waiting wrapper, telling f1 before the update-branch.

After the merge, f1 clarified that its own goal excluded merging, and that "final from my side" meant only that it had stopped pushing. f1 would have flagged that landing needed Val's go-ahead. This task landed #658 on Val's goal in this session, as recorded under "Authorization and default decisions", with the owner's confirmation the plan required. f1 is reporting this to Val as it stands. If Val wants it undone, a revert is an ordinary PR.

**Val's answer (22:06Z, in f1's session): keep the merge `e8207b2b`.** f1 recorded it as `landingConfirmation` on task `touch-network-288-290-20261024`. Val also chose to record the WebKit two-player failure (`multiplayer-dev.js:215`: the builder's placement hint never turns valid, failing at #659's head and its base `1fd53fb9` alike) without a fix. #659 stays held for Val's review of `66134f27`.

### #656 held for Val's decisions (reported by river-oaks-32 at about 09:15Z)

- **Head:** `82b51d89b15eb744cae6aca258f72407eedbd224`.
- **Hosted:** 22/22 (run 40179234053), including the required shared job with character-studio-shared, character-studio-tiers and default-appearance-tiers.
- **Local core on clean `82b51d89`:** passed. Tooling 277/277; preview 4,166 plus 1 skip; server 917 plus 225 Redis skips; desktop 120 plus 3 skips.
- **Other checks:** bakes 5/5; focused 88/88. Verify full on `2065b5ef` passed every stage except ipic-screening, which timed out during the host sleep; a standalone rerun is queued.
- **Reviews:** independent visual and code reviews done, findings fixed.
- **Held for Val:**
  - the hero golden's pinned check is expected to fail;
  - the pores follow-up;
  - cost: Jevica ×1 frame/CPU p95 at +10.4% in one run, within +10% in the other.

  A budget call isn't this task's to make.
- **Reruns at about 11:40Z, host awake.**
  - ipic-screening, standalone on clean `2065b5ef`: 19/19.
  - character-studio-tiers: 64/64.
  - The head is still `82b51d89`, up to date with main, hosted 22/22.
  - river-oaks-32's session work is done. #656 is held only for Val's three decisions.
- **New head `7757f387` (about 13:50Z, river-oaks-32):** one signed docs-and-receipts commit on `82b51d89`.
  - **timing-5:** on the exact head, with a clean tree and load 2.9–17.2: frame and CPU p95 within +10% for both looks at ×1, ×8 and ×24. The worst was Jevica ×1 CPU at +9.1%. timing-3's +10.5% stays recorded.
  - **Hero golden:** `--check` exits 2 (incompatible osRelease, osVersion and gpu). The Sable candidate was recorded and inspected. Its bodice tiles come from main's outfit changes, not this trial. The reference is not replaced.
  - **Core** passed on `7757f387`; hosted CI is running.
  - The branch is behind main by the #288 work only, which merges cleanly. Still held for Val.
  - **Hosted on `7757f387`:** 22/22 (Verify run 40199631214), including the shared job with default-appearance-tiers, character-studio-tiers and character-studio-shared. Evidence comment on #517 (issuecomment-6398721190). river-oaks-32's session work is done. #656 stays held for Val on Decisions 1–4.
- **Correction, head `026fbcdc` (about 15:15Z, river-oaks-32): cost is not established.** Hosted CI passed 22/22 (Verify run 40205009032), on a commit of docs and receipts only.
  - **The numbers.** timing-6, a confirmation run on the head with its rule recorded beforehand, put Jevica ×8 at +10.5% frame and +10.2% CPU p95. Sable shows no cost. Pooled over the three measurement runs, Jevica ×8 CPU is +8.5%.
  - **Decision 3 for Val:**
    - profile Jevica ×8 and measure on a quiet host or a device;
    - ship to Sable only;
    - or accept on the pooled numbers.
  - **Second independent visual review:** accepts roughness; says not to promote the hero candidate.
  - **Correction:** the bodice tiles come from main's code or the M5 GPU, and this host can't tell which.
  - #517 correction: issuecomment-6399455259. Still held for Val.
- **Final head `13c0afc4` (about 17:30Z, river-oaks-32): ships switched off, held for Val.**
  - **Policy:** `sable-human:['roughness']` with `enabled:false`, so Jevica and Sable draw as on main for every viewer.
  - **Why it's off:** Jevica was stopped after timing-6 (×8 at +10.2% CPU p95), and Sable after timing-7 (×24 at +12.0% frame and +11.7% CPU p95), under a rule recorded before that run.
  - **Verification:**
    - verify full on `6621d297` passed all 18 stages;
    - core on `13c0afc4` passed with stages run separately, tooling 279/279 serially;
    - hosted 22/22 (run 40209651820).
  - **Records:** #517 issuecomment-6400822388; register task `default-appearance-517-20261024` is blocked on Val's Decisions 1–5.
  - **Every gate on the exact head `13c0afc4` (about 18:55Z):**
    - verify full 18/18 (17:37–18:53Z, clean snapshot, disposable Redis);
    - character-fidelity 9/9 and character-studio 43/43;
    - core passed as one command on the third run (the first two hit the `land-pr` wake flake);
    - hosted 22/22.
    - The owner's condition stands: do not land without Val's Decision 1.

### #655 held after an independent review (about 03:55Z)

river-oaks-3e reported #655 ready (verify full 18/18, hosted 22/22, "awaiting Val"), but its record showed no independent code review, so this task commissioned one (fresh context, read-only) at `22679471`. Findings:
1. **HIGH, CONFIRMED.** A Commons→Gardens rollback freezes residents who were walking toward the Commons at the seam: the migration resets only residents already in removed land, and `recoverRoute` restores the stale route. Probe: stuck for 20 simulated minutes.
2. **MEDIUM, CONFIRMED.** A placed object on a seam lane leaves residents pacing without crossing, because the lanes are computed once. Probe: 10 minutes pacing.
3. **LOW.** Lantern home-stop names survive a rollback.

The reviewer confirmed that other callers' routes are unchanged (60 pairs) and that Heights is safely excluded for now. The findings are posted on #655 and relayed through e9, because 71's messages to 3e are held. #655 stays out of the train; its owner's fix is needed.

### #655's review findings fixed as stacked draft #674 (about 19:20Z, task `resident-locations-review-fixes-20261025`)

The HIGH and MEDIUM findings of this task's 03:46Z review were still open at `fea24bed`, and river-oaks-3e never answered (messages to it were held). A subagent fixed them on `fix/resident-locations-review-20261025`, based on #655's branch; this task reviewed and published it.
- **HIGH:** a rollback now re-plans residents on District ground whose route or destination lies in removed land (`reroutedResidents`) and requeues their errands. The removed-land corridors are computed without builds, as the live planner does.
- **MEDIUM:** a route uses its keep-right lane when walkable past current objects, otherwise the nearest clear crossing row.
- **LOW:** Commons-lantern home stops revert to the Gardens home stop.
- **Misleading tests repaired:**
  - a resident is actually seated;
  - the District-grid test compares against main's 60 routes (a fixture with world fingerprints);
  - the wanderer walks rather than teleporting.

  Each regression fails on the old code.
- **Verification:**
  - related suites 246/246 with an owned Redis (this task reran 11/11);
  - core passed on attempt 2 (agent 274/274; preview 4,163 + 1 skip; server 919 + 225 Redis skips; desktop 120 + 3); attempt 1 hit the `land-pr` wake flake;
  - hosted CI on `d5666034` 15/15, including `preview experience (commons)` and the aggregate `preview`.
- **What's next:** 3e decides whether to merge it into #655, and #655 still waits for Val's go. It was noted on #655 (issuecomment-6401515309).

### Landing incidents (kept as found)

- **01:06Z, #652 refused.** Verify passed on `65aef4ac`, but the merge guard refused with "merge state is unstable": the Desktop workflow's `installers (windows-latest)` job was still running. The repository lander waits only for Verify.
  - #652 and #647 change Desktop-workflow paths: `.github/workflows/desktop.yml` for #652, and a `shared/` file for #647.
  - Both now land through a task-local wrapper, `scratchpad/land-wait-checks.mjs`. It uses the repository's own `land()`, queue and merge guard, but its guard first runs `pnpm run pr:wait <pr> --until checks`. No repository tooling changed.
- **01:08Z, stopped lander left the queue lock.** Stopping #647's plain lander to switch tools left the queue's lock directory behind.
  - `local-queue.mjs` reclaims an abandoned lock after 30 s, but `withLock` gives up after about 10 s (400 × 25 ms).
  - So the #646 and #652 landers exited with "The queue lock is held". They were requeued at 01:09Z; nothing merged wrongly and no other session's lander was affected.
  - A follow-up for the tooling owner: make the retry window outlast the 30 s stale-lock window, or stop landers only between lock operations.
- **01:43Z, #645 refused.** Same refusal: Verify passed on `2b39b9c3`, but CodeQL's `Analyze (swift)` job and the PR workflow were still queued for runners.
  - Every lander of this task now uses the check-waiting wrapper: #652, #647, #645 and #646, in queue order after river-oaks-33's #641.
  - #646's plain lander was stopped with SIGTERM to its own PID, so it dequeued cleanly and left no lock.
  - river-oaks-33 was told about the refusal and the wrapper.

- **02:23Z, browser queue stalled.** The shared browser lock has been held since 23:36Z by river-oaks-32's `character-fidelity-baseline.mjs … --quiet load=10 … --out timing-4` (PID 85902), at 0% CPU, waiting for host load ≤ 10. Host load has stayed between 12 and 40 all night with about 20 sessions, and 11 runs are queued behind it, including both of this task's journeys. Its owner was asked to stop it or release the lock while waiting. This task did not touch it.
- **02:22Z, #647 waiting.** CodeQL's `Analyze (swift)` job was still queued for a runner on `0918a01`, the only incomplete check of 29. The wrapper holds the turn until it completes.

- **02:45Z, pace.** Each landing turn begins with an update-branch, and GitHub's default CodeQL setup then reruns `Analyze (swift)` on `macos-latest`. With macOS runners contended, those runs take 60–95 minutes: #645's ran from 01:07Z to 02:42Z, and #647's has been queued since 01:56Z. The merge guard requires every workflow to be complete, so the train lands about one PR per 60–95 minutes. That is outside this task's control, and no guard or check was bypassed.

### #649's District CPU regression and a candidate fix (task `walking-obstacle-buckets-20261025`)

- **03:18Z, D part 1 not met.** river-oaks-3e's ABBA for #649 (`2da76e1f` Commons against `6e5abdff` Heights) didn't meet the budget: one-client CPU p95 +24.0% desktop and +18.1% phone, with the "interactions" render phase about 2× in every Heights sample. 3e queued CPU profiles for attribution.
- **Likely cause.** `createWalkingEnvironment`'s point query `baseIsFree` scans every collision ring linearly.
  - Composition appends each destination solid as a ring: 104 in the Commons revision, 626 with Heights, 753 with Studewood, 920 with the terraces. So `isFree` costs 3–6× more even at the District spawn.
  - Measured in Node: 2,000 `isFree` calls took 1.35 ms in the Commons revision and 6.47 ms in Heights.
  - The interactions phase holds `walking.update`, seating and table-game updates.
- **Candidate fix.** Branch `perf/walking-obstacle-buckets-20261025`, worktree `river-oaks-walking-buckets`, from main `a437cbbf`.
  - **Change:** 8 m buckets over each ring's bounds; the point query checks only its own bucket, with the predicate unchanged. `isAreaFree` stays linear.
  - **Equivalence:** against main's own `walking.js` as an oracle, zero mismatches over 434,730 samples in six worlds (garage, Gardens, Commons, Heights, Studewood, terraces), uniform plus dense near every ring.
  - **Speed:** garage at parity (12.7 against 12.3 ms); Heights 24.5 against 122.0 ms; terraces 22.2 against 129.0 ms.
  - **Regression test:** `preview/tests/walking-obstacle-buckets.test.js` places rings across bucket edges on both sides of zero. A deliberate `Math.trunc` mutation makes it fail.
  - **Superseded and closed, about 03:40Z.** #649's own branch already carried `dd682a7b` (river-oaks-91). It puts obstacles, the Commons flight solids and rooms on one 16 m grid, so it also covers `canFly`, which the camera boom calls about 42 times a frame. It is digest-verified over about 3.8 million queries, and river-oaks-3e queued the round-2 ABBA on it (Heights `3cd60702`). #669 was closed unmerged with a note, and its branch awaits guarded retirement.
  - **Lesson.** Check the owner's local branch refs, not only the pushed PR head, before starting a fix in a lane with active owners.
  - **Results:** walking suites 27/27.
- **Independent review** (fresh context): no correctness defect. Its own equivalence probes over about 330,000 points per world, plus degenerate rings and bucket-line floating-point values, found 0 differences. Two findings, both fixed:
  - Bucket construction was unbounded for a huge or infinite ring. Ranges are now clamped to the world bounds, which is exact because queries outside them are refused first. Tested.
  - The test missed the walking-radius padding across a bucket line. Added; a radius-less mutation fails it.
  - After the fixes: the oracle still finds 0 mismatches over 434,730 samples, and walking suites pass 29/29.
- **Delivered as draft PR #669** (signed `ae967600` on main `a437cbbf`). `buckets-core-002` passed: tooling 274/274; preview 4,153 plus 1 skip; server 889 plus 225 skips; desktop 120 plus 3 skips. It is cross-referenced on #649 for 91 and 3e. Whether it closes the browser CPU gap needs their ABBA rerun with #669 merged in.

## Phase 2: release candidate (after the train)

- **Release-candidate commit:** main `0b9a97c4f308f2fe15373708227176157aacaed3`, after #641 merged at 04:01Z. It contains all nine merges of the night: #657, #648, #650, #651, #652, #647, #645, #646, #641.
- **Not landed, so not in it:**
  - #649 (Heights): its round-2 ABBA is pending with 3e.
  - #655: review defects.
  - #656 and #658: owners' evidence pending.
  - #659, #653 and #654: Val.
  - #662 and #663: stacked on #649.

  Heights rows are therefore not part of this candidate.
- **Setup:** a clean detached snapshot `scratchpad/rc-0b9a97c4`, prepared with `pnpm install --frozen-lockfile`, the Electron postinstall and `uv sync --locked`. `agent:doctor full` passed.
- **Runner:** `scratchpad/rc-run.sh`, started 04:02Z. It owns a disposable Redis and runs, in order:
  1. the activation rehearsal (row 11);
  2. world-gate-587, world-streaming and east-garden-commons (rows 5, 10, 4);
  3. ABBA Gardens/Commons/Commons/Gardens with pixel parity, under one browser-lock turn (rows 6, 7);
  4. `pnpm run verify full` (row 2).
- **Row 3:** hosted Verify on `0b9a97c4`, run 40160333490: **success**. Desktop and the main push run also succeeded.
- **Row 11 (activation rehearsal, owned non-persistent Redis), 04:02Z: passed.** 26/26 from `river-oaks-gardens-3` and 28/28 from `river-oaks-garage-1`, 5 phases each, matching #657's counts on `09bd7a83`. Receipts `rc-out-0b9a97c4/rehearsal-commons-0b9a97c4-{river-oaks-gardens-3,river-oaks-garage-1}.json`.
- **Rows 4, 5 and 10 (journeys, 04:40–05:45Z, local Metal, one lock turn): all three failed.** First failures kept in `rc-out-0b9a97c4/rc-journeys-0b9a97c4.json`, with diagnostics.
  - **world-gate-587 (1,424 s against #657's 620 s).** Every walk passed: the failed-load self-heal and reload, Market notices, collisions, reconnect, five seam loops, and the return with announcements and sync. It failed in the 20-rebuild loop: after a reload, `assetProgress` showed 114/114 loaded and 0 failed but `done:false` for 120 s, at 4 fps on Sharp.
  - **world-streaming.** It stalled on its first walk, "Player 1 reaches gateway", in the District 49 m west of the edge, with speed 3.19 m/s and no progress.
  - **east-garden-commons.** Alice stalled on her outward walk inside the Commons, 2.8 m short of the plaza centre, showing 3.2 m/s with no progress and an empty refusal list. The owner had reached it.
  - **Context.** All three runs logged 503 and connection-reset console errors from the local fixture. Hosted Verify passed `preview experience (commons)` on the same commit, using CPU software rendering. #641 is the only Commons render change since `09bd7a83`, where #657 passed all three.
- **Cause found: the host slept.** `pmset -g log` shows the display off at 05:02Z and idle sleep at 05:03Z, then maintenance sleeps with dark wakes about every 15 minutes until 09:05Z.
  - **The journeys.** world-gate-587's rebuild loop failed as sleep began. world-streaming (05:19–05:35Z) and east-garden-commons (05:35–05:45Z) ran inside the sleep window.
  - **The verdict.** These are environmental failures, not product evidence. They are kept, but they don't count against `0b9a97c4` or #641.
  - **The rest of the machine.** Every session's landers, CI polling and browser runs stalled too, including river-oaks-3e's round-3 ABBA for #649, which has held the lock since 04:41Z. A note is posted on #649.
  - **Mitigation, 09:08Z.** `caffeinate -ims -t 21600` (PID 71428, ends by about 15:07Z) prevents idle and system sleep on AC. It is bounded, makes no settings change, and `kill 71428` stops it.
  - **Sessions told:** e9, 33, 32 and f1.
- **Bisect (queued at about 05:55Z; it now confirms the release candidate on a host that stays awake).** The runner was stopped before its ABBA turn started, with SIGTERM to its own PIDs; no lock was held and its Redis was stopped. In one browser-lock turn, east-garden-commons runs on `15334aad` (just before #641) and on `0b9a97c4`, twice each, interleaved: `scratchpad/bisect-out/`. The ABBA (rows 6 and 7) and verify full (row 2) follow once the cause is known. river-oaks-33 has been told, unconfirmed.
- **Bisect result (09:36–09:52Z, host awake, load 5–6): no regression from #641.** east-garden-commons passed 10/10 in all four runs: `15334aad` twice (237.7 s and 236.6 s) and `0b9a97c4` twice (235.6 s and 236.8 s). Receipts are in `scratchpad/bisect-out/bisect-{pre,rc}-{1,2}.json`.
- **Phase 2 rerun started at about 09:53Z** on the same clean `0b9a97c4` snapshot into `scratchpad/rc-out2-0b9a97c4/`: rehearsal, journeys, ABBA with pixel parity, then verify full. `caffeinate` holds the host awake until about 15:07Z.
- **Rerun with the host awake:**
  - rehearsal passed;
  - **world-gate-587 passed**;
  - **world-streaming failed** its "Scene and GPU object bounds across twenty measured trips" check.
- **That bounds failure is not a growing leak.** Across all 14 reported laps, client 0 sits at a fixed offset from its warm-up baseline: geometries 737 → 749 (+12) and textures 227 → 240 (+13); evicted, 627 → 639 and 224 → 233–237. Scene objects stay equal (9,152). Client 1 is equal apart from a flicker of up to 4 textures. So something is allocated once after the warm-up snapshot and then held. #657's run on `09bd7a83` passed the check.
- **Pinning the change.** world-streaming was queued on `15334aad` (just before #641) at about 11:30Z (`scratchpad/bisect-out/streaming-pre.log`).
- **Bisect run for row 10.** On `15334aad`, world-streaming passed 286/286 (11:33–12:34Z, load about 6). This task first read that as "#641 introduces the offset". **That was wrong; see the correction below.** One passing run before #641 was luck, not a bisect.
  - **Row 10 is therefore failed for this release candidate.** The gate (`withinBounds`, `world-streaming.js:204`) allows +20 objects, +20 geometries and +10 textures over the warmed baseline.
    - Client 0 exceeds only textures, by 3 (+13 when loaded on every measured lap).
    - Its +12 geometries are within the tolerance. Evicted textures are +9 on most laps and +13 on laps 3 and 8.
    - **Correction (about 17:00Z): a journey measurement artifact, not #641 and not a leak.**
      - **Instrumented rerun** (`scratchpad/diag-0b9a97c4`, 16:21–16:51Z): a local-only copy of the journey hooks WebGL texture create, upload and delete and tags each texture by phase, over 3 measured trips.
        - Client 0's textures created after the baseline are three triples within 2 ms (ids 897–905): a 16×16 bone texture (a ~64-bone skeleton, `Skeleton.js:252–259`), a 4×4 bone texture and a morph-target array texture (`texImage3D`).
        - That's three skinned character avatars first drawn after the warm-ups. Everything else created after the baseline replaces render targets of the same size.
      - **Why only client 0.** It's the only tab put through the journey's two WebGL context-loss probes (`world-streaming.js:215` pending load and `:240` active presentation). Three.js's `onContextRestore` calls `initGLContext()`, which makes a new `WebGLInfo`: every counter restarts at zero, and a resource is counted again only when next drawn.
      - **Why it sometimes fails.** The step from lap 2 to lap 3 is +9 to +13 textures depending on where the baseline lands: 227 → 240 in the failing run; 231 → 240 here, which passed. It is then flat through every later trip.
      - **Fix.** It belongs to the journey's owner (task `world-streaming-582-583`), not #641. For example, run the active-presentation probe after the measured trips, or bound growth across the measured trips.
      - **Receipts:** `diag-0b9a97c4/.runtime/world-streaming/tex-diag-{baseline,lap3,lap4,lap5}.json`, the journey checkpoint `journey-2026-10-25T16-36-37.040Z.json` and `scratchpad/tex-diag.log`.
      - **Told:** river-oaks-33 and e9 have the correction. #587 and #638 were edited in place.
  - river-oaks-33 (#641's owner) was first asked for a follow-up fix. That request has been withdrawn (see the correction).
  - Receipts: `scratchpad/bisect-out/bisect-streaming-pre.json` and `rc-out2-0b9a97c4/rc-journeys-0b9a97c4.json`.
- **Rerun journey times (host awake, one lock turn ending 11:36Z):**
  - world-gate-587 passed 26 checks in 571.5 s (#657: 620 s);
  - world-streaming failed only its bounds check, in 3,437.7 s;
  - **row 4, east-garden-commons, passed** 10 checks in 232.9 s.

  The journeys step exited 1 only for world-streaming. Receipt `rc-out2-0b9a97c4/rc-journeys-0b9a97c4.json` (sha256 `d9be195903e497b1`).
- **Rows 6 and 7: ABBA Gardens/Commons/Commons/Gardens on `0b9a97c4`** (12:34–13:04Z, one browser-lock turn, host awake under `caffeinate`).
  - **Method.** The same protocol and settings as #657: `world-expansion-baseline.js --label=rc-<arm>`, with `RIVER_OAKS_BASELINE_REVISION` set per arm.
  - **Arms.** Each took 7 min 33 s and passed. Median per-sample one-minute load was 3.2 and 3.6 (Gardens) and 4.6 and 4.1 (Commons); the maximum was 5.7. Drift was 0 m in every arm.
  - **Receipts.** `rc-0b9a97c4/.runtime/world-expansion/baseline-rc-{g1,c1,c2,g2}-*/report.json`; `rc-out2-0b9a97c4/compare-rc-gardens-vs-commons.json` (sha256 `ad9aa6c90379bc04`).

  | Workload | Metric | Gardens | Commons | Change | Decision | #657 on `09bd7a83` |
  | --- | --- | ---: | ---: | ---: | --- | ---: |
  | Desktop, 1 client | frame mean | 16.67 ms | 16.67 ms | 0.0% | within | 0.0% |
  | Desktop, 1 client | CPU submission p95 | 8.25 ms | 8.30 ms | +0.6% | within | +3.0% |
  | Desktop, 2 clients | frame mean | 24.11 ms | 24.36 ms | +1.1% | within | −1.2% |
  | Desktop, 2 clients | CPU submission p95 | 9.55 ms | 9.80 ms | +2.6% | within | −0.4% |
  | Desktop | reconnect | 1,153 ms | 938 ms | −18.7% | within | −6.9% |
  | Phone viewport, 1 client | frame mean | 16.67 ms | 16.67 ms | 0.0% | within | 0.0% |
  | Phone viewport, 1 client | CPU submission p95 | 7.20 ms | 7.20 ms | 0.0% | within | −5.9% |
  | Phone viewport, 2 clients | frame mean | 21.19 ms | 21.36 ms | +0.8% | within | −0.8% |
  | Phone viewport, 2 clients | CPU submission p95 | 8.00 ms | 8.10 ms | +1.2% | within | −6.6% |
  | **Phone viewport** | **reconnect** | **742 ms** | **1,073 ms** | **+44.5%** | **over (limit 20%)** | +19.1% |

  - **Frame p95** (informational) is 16.7–16.75 ms for one client and 33.4 ms for two in every arm.
  - **Reconnect varies widely**, from 726 to 1,174 ms.
    - Per arm, desktop and then phone: g1 1,133 / 758; c1 1,098 / 1,068; c2 777 / 1,077; g2 1,174 / 726.
    - Every Commons phone arm fell in the slow mode, in this run and in #657's (1,042 / 938 against 823 / 841). Every Gardens phone arm fell in the fast mode.
    - Desktop goes the other way.
    - **Cause in source: the client's own random backoff.** After a socket closes, the client waits `retryDelay(0)` before reconnecting: uniform 500–1,000 ms from `Math.random` (`preview/src/connection-policy.js:7`, scheduled at `multiplayer-client.js:204`). `attempt` resets to 0 on every successful join (`:288`).
      - `world-expansion-baseline.js:158–165` times close-to-rejoin once per profile per arm, so each sample is that random wait plus about 250 ms of connection and snapshot. The observed 726–1,174 ms fit that range.
      - With two samples per side, the row can't resolve a 20% change. The phone pattern across two ABBAs (4 against 4 draws, about a 1-in-70 ordering under no effect) is weak evidence once desktop's opposite pattern is counted.
    - **Independent read-only check** (river-oaks-e9, ledger #668 Decision 10 @ `d8641190`):
      - both arms are head `0b9a97c4`;
      - phone and desktop move in opposite directions in the same run;
      - the 500 ms span of `retryDelay(0)` alone covers the 331 ms phone difference at one sample per arm;
      - `connection-policy.js` and `multiplayer-client.js` are unchanged between `15334aad` and `0b9a97c4`.

      That fits the noise explanation without proving it. A seeded random or several samples per arm would settle it.
    - **Rerun with an opt-in multi-sample harness** (draft #672 `d4006820`, task `reconnect-measure-20261025`). The harness was applied locally to `scratchpad/diag-0b9a97c4`, and the run took one browser-lock turn (17:14–17:26Z, load 3.1–4.6), Gardens/Commons/Commons/Gardens with `--reconnects=5` and 5-second frame samples (the frame and CPU rows from this run are not meaningful).
      - **Backoff kept** (the protocol's measurement, median of 5): desktop 938.8 → 971.8 ms (+3.5%), phone 937.5 → 998.1 ms (+6.5%). Within.
      - **Backoff skipped** (the rejoin itself): desktop 215.4 → 225.8 ms (+4.8%), phone 159.6 → 112.7 ms (−29.4%). Within.
      - **Receipts:** `scratchpad/compare-rc-reconnect-{skip,keep}.json` (sha256 `94b51ebbab8d4b01`, `b4f91acdc47ed6be`).
      - **So the +44.5% was the backoff drawn once per arm.** The protocol's single-sample row still reads over as written, until its owner or Val adopts a multi-sample read.
    - **Reading.** As written, the row is over its budget. The likely explanation is harness noise from deliberate jitter, not a Commons cost. Making the row deterministic (seed or stub `Math.random` in the harness, or subtract the scheduled delay) or taking more samples is a protocol change for its owner or Val. It isn't made here, and the budget isn't amended.
  - **Pixel parity** (`pixel-parity.mjs`: pixels whose largest channel difference is over 24, 12 captures per pair):
    - g1–g2: 0.04–0.70%;
    - g1–c1: 0.03–0.44%;
    - g2–c2: 0.03–0.37%;
    - c1–c2: 0.04–0.35%.

    So the Gardens-to-Commons difference in the District captures is within the same-revision spread. Receipt `rc-out2-0b9a97c4/pixel-parity.json`.
- **Row 2 (`pnpm run verify full`).**
  - **Attempt 1 (13:04–13:06Z): failed in the tooling stage, 273/274.** The failure was `land-pr.test.js:122` "a queued lander wakes on release": the known watch-latency flake, which passed alone straight afterwards. The failed receipt is kept: `rc-out2-0b9a97c4/full-attempt1-failed.json` and `verify-full-attempt1.log`.
  - **Attempt 2 (13:07–15:33Z, fresh isolated Redis): passed all 18 stages.**
    - **Non-browser stages:**
      - dependency audit;
      - tooling 274/274;
      - preview 4,156 + 1 skip;
      - server with Redis 1,182/1,182, none skipped;
      - desktop 120 + 3 skips;
      - build, Python lint, format and tests;
      - demo and demo-verify;
      - secrets and secret history.
    - **Browser stages:** security-browser, reflections, experience, shared and ipic-screening, with 44 journeys passed and none failed.
    - **Receipt:** `rc-out2-0b9a97c4/full-attempt2.json` (sha256 `3f3615248cbc6333`), revision `0b9a97c4`.
    - **Its `dirty: true`** comes only from journey reports: `data/reports/experience.json` and `shared-experience.json` rewritten, plus three untracked report files from this task's journey runs. No source file differs.

### Commons go/no-go for `0b9a97c4` (runbook `docs/world-expansion-activation.md`)

**Verdict: no-go.** Condition 2 fails on two measured rows, and conditions 4 and 5 are not this task's to satisfy.

| # | Condition | `0b9a97c4` (this task) | #657 on `09bd7a83` |
| --- | --- | --- | --- |
| 1 | Build merged through the guard; hosted Verify green on the release commit | **Met.** #641 merged through the merge guard; Verify run 40160333490, Desktop and push all succeeded | Met |
| 2 | #587 gate: traversal; frame time within the District baseline on desktop and phone; walked-away assets released; accessibility; two-player journey locally and hosted | **Not met.** Traversal passed (world-gate-587, east-garden-commons), frame/CPU are within budget, and verify full passed with every browser stage. But **phone-viewport reconnect is +44.5%** against the 20% budget (likely the client's random 500–1,000 ms reconnect backoff, sampled once per arm). **world-streaming's GPU bound fails as written** (textures +13 against +10). The cause is a journey measurement artifact after its own context-loss probe on client 0, not #641; the instrumented rerun passed at +9. | Met (phone reconnect +19.1%, close to the limit) |
| 3 | Rehearsal on the release commit, from both revisions, isolated Redis | **Met.** 26/26 (Gardens) and 28/28 (garage), twice | Met |
| 4 | Val's human visual approval and physical-device results | **Open.** Val's to give; never simulated | Open |
| 5 | Production revision and epoch confirmed; a rollback watcher | **Open.** Operator's step; production reads aren't authorized here | Open |

**To reach go on a later commit:**
- the world-streaming journey stops counting after its own context-loss probe (owner of `world-streaming-582-583`), then reruns within bounds;
- the reconnect row is read from several samples (draft #672). With 5 rejoins per arm it measured within budget on `0b9a97c4` in both modes; adopting it is a protocol change for its owner or Val;
- Val gives condition 4 and the operator condition 5.

Main has since moved to `e8207b2b` (#658, touch/voice UI only). These rows were measured on `0b9a97c4`, not on `e8207b2b`.

- **#649 at about 12:45Z: held, not landed by this task.**
  - The owner reports finish-line items 1–6 complete on `0cc09391`: round 3 met; hosted 16/16 on `4c3fddc3`.
  - At the start of the train, river-oaks-91 asked to hold until they confirm. Their record now reads "blocked on merge authorization (owner needed: Val)".
  - This task's messages to 91 and 3e (12:41Z) are held undelivered, and there's no confirmation.
  - Main has moved to `e8207b2b` (touch/voice UI only). The PR's own protocol then requires a merge of main, core and hosted checks, and a new ABBA plus cold transfer from support task D.
  - Posted on #649 (issuecomment-6397758010). #662 and #663 stay stacked and ready to follow.
- **#649 status at 04:23Z.** Round-2 ABBA met (river-oaks-3e: `a437cbbf` against `3cd60702`, with `dd682a7b`). 91 is to merge main `0b9a97c4`, which brings the #641 conflicts in `render.js` and `east-garden-commons.js`, then a round-3 ABBA on that exact SHA, then landing.

## Phase 3: 3× lane

Target: ≥139,433.25 m² reachable at 0.5 m from the District spawn (3 × 46,477.75).

### Capacity, measured on #649's head

Command: `node preview/audit/world-expansion-footprint.js --reachable`, run on a detached checkout of #649's head `8f3c94fd` (2026-10-24, ~23:55Z). Receipt kept locally as `p3/footprint-8f3c94fd.json` in this session's scratchpad.

| Grid | Gardens | Commons | Bayou Heights | Heights ratio |
| --- | ---: | ---: | ---: | ---: |
| 1 m | 46,549 | 52,130 | 93,904 | 2.0173× |
| 0.5 m | 46,477.75 | 52,030.75 | 93,508 | 2.0119× |

The PR body gives 93,509.75 m² at 0.5 m for the same work. That figure came from earlier evidence; this run on `8f3c94fd` measures 93,508.

Location bounds after Heights' partition:

| Location | Status | Bounds area (m²) |
| --- | --- | ---: |
| `river-oaks-district` | authored | 73,753.12 |
| `east-garden-commons` | authored | 9,200 |
| `bayou-heights` | authored | 89,307.42 |
| `east-garden-reserve` (x 422.5–507.9 of the Commons frame, full north/south span) | reserved | 24,799.31 |
| `east-garden-reserve-north` (x 0–115, y 40–167.8) | reserved | 14,699.53 |
| `east-garden-reserve-south` (x 0–115, y −122.6 to −40) | reserved | 9,499.99 |

The tool's `expansionCapacity` at the District's measured walkable density (0.6302):

- **Projected total:** 124,386 m², about **2.676×**.
- **Bounds needed for 3×:** 72,876 m² of new location bounds, which is **23,878 m² more than is reserved**.
- **Without more land:** 3× would need the remaining reserve to be **93.7% walkable**, against the District's 63% and Heights' 46% (41,477 m² added from 89,307 m² of bounds). Even full coverage stops at 3.066×.

**Conclusion: 3× cannot be reached honestly inside the current reserve.** This task authors the remaining strips toward about 2.6× and asks Val to decide on land. Under the authorization, that is a land proposal, not added land.

### First increment: Studewood (east strip beyond Heights Boulevard)

Draft recipes live in this session's scratchpad (`p3/recipes/gen.py`, `studewood-north.json`, `studewood-south.json`). They aren't committed: they build on #649, which is still changing.

| Recipe | Site (Commons frame) | Contents | `destination build` |
| --- | --- | --- | --- |
| `studewood-north` (seed 1931) | x 404–507.5, y 0–167.5 | Studewood Street (north-running, lane 7, sidewalks 3.5); Twentieth Street continued east through the Heights frontage gap; Studewood Park with a water tower landmark, a three-stall night market with café sets, benches and lamps; a shop row and a court | 185 pieces, 99 solids, 11 materials, 45,804 triangles; within budgets; connectivity 1.0 |
| `studewood-south` (seed 1932) | x 404–507.5, y −122.5–5 | Studewood Street south; Eighteenth Street continued east; a market row and a market yard with stalls and café sets; a garden-court row and a lawn | 150 pieces, 67 solids, 13 materials, 74,244 triangles; within budgets; connectivity 1.0 |

At 0.5 m, the union of their walkable rectangles inside the reserve is 21,669 m², or 20,781 m² clear of solids. That is a source estimate before the 0.35 m walking-radius erosion, not a measurement. If it holds, the total is about 113,000 m², around 2.43×.

Seams: Twentieth (y 111) and Eighteenth (y −71) cross Heights' 2 m reserve margin and its frontage gaps, x 404–422.5. Those gaps are empty block land in #649 (frontage-mid/north at y 104.5–117.5; frontage-south/far-south at y −77.5 to −64.5). The stubs are ground inside Heights' location and must be documented and tested as seams, like Heights' footbridge landing on the Commons plaza.

### Studewood implementation (task `studewood-3x-20261024`)

- **Where.** Worktree `river-oaks-studewood-3x`, branch `feat/studewood-3x-20261024`, stacked on #649's head `7291b566` until #649 lands.
- **What.** Revision `heights-studewood-1` composes the two recipes onto Heights (`shared/studewood.js`):
  - Heights streams them as two more neighborhoods.
  - The rest of the east reserve becomes the authored `studewood` location, with the same bounds.
  - It adds a park game table (`chess-studewood`) and a checkpoint migration, first in the Redis chain.
  - The location label names Studewood.
  - The design doc is `docs/level-design/expansion/studewood.md`.
- **Seams.** The recipes' cross streets start at x 406, where Heights' streets end. Ground-only seams at x 404–407 carry the walking overlap, so kit paving never overlaps. Composition refuses any seam that crosses a Heights building.
- **Measured reachable ground** (`--reachable`, uncommitted tree on `7291b566`):

  | Grid | Studewood total | Added | Ratio |
  | --- | ---: | ---: | ---: |
  | 1 m | 114,793 m² | +20,889 | 2.4661× |
  | 0.5 m | 114,323.75 m² | +20,815.75 | 2.4598× |

  `expansionCapacity` from Studewood: the remaining strips beside the Commons project to 2.788× at District density, and 3× needs 15,645 m² more bounds.
- **Focused tests.**
  - `preview/tests/studewood.test.js`: 11/11.
  - `server/tests/studewood.test.js`: 5 pass, 1 Redis-only skip without Redis.
  - With an owned disposable Redis, the Studewood and Heights server files together pass 12/12, 0 skipped.
  - First failure kept: the first combined Redis run failed both Redis tests, under host load 29–31. Each then passed alone, both passed together, and the full files passed.
  - Heights, stream, label, manifest and plaza suites: 74 tests with two partition failures. Both came from the reserve change and are fixed with one-line updates (49/49 rerun).
  - `destination check`: 10/10 locks.
- **Core verify (uncommitted tree, diff SHA-256 `471e8caa…`).**
  - `core-001`, 00:05–00:07Z, load 42: failed in tooling, 273/274. The failure was the known load-sensitive `land-pr.test.js` "queued lander wakes on release" timing test, which passed alone. Log and receipt kept as `.runtime/studewood-core-001.{log,-receipt.json}`.
  - `core-002`, 00:07–00:14Z, load 38: **passed**. Tooling 274/274; preview 4,118 plus 1 existing skip; server 899 plus 228 Redis-only skips; desktop 115 plus 3 Windows-only skips. Build, Python, lint and secrets passed.
- **Independent review** (fresh-context agent, read-only, about 00:00–00:20Z):
  - **One confirmed defect.** The journey owner's straight leg to the east chair crosses a park tree-row trunk; in a headless simulation with the real `stepWalking`, it stalled 23 of 27 times.
  - **Fixed.** The owner now takes the west chair, alice the east one, and the owner returns north of the table via x 469, clear of the bench at x 466. All 20 jittered simulations of the four legs reach every waypoint (`scratchpad/p3/probe-swap.mjs`).
  - **No other defects.** The reviewer confirmed:
    - World fingerprints for garage, Gardens, Commons and `bayou-heights-1` are identical to `7291b566`.
    - The only newly walkable cells in the Heights location are the two cross-street strips.
    - The rollback line at x 405.65 is exact.
    - Every migration direction, including garage → Studewood, is correct.
    - The Redis chain order is correct.
  - **Nits addressed.** An unused helper, a no-op assertion (now a real Commons refusal plus a Heights equality check), stale "only bayou-heights-1" comments, and a boundary test with a player just inside and just outside the rollback line.
  - **Kept, documented.** The seam guard checks Heights building shells, not authored landmarks. Forward-migration move lists are inherited log-only behaviour.
  - Focused results after the fixes: preview Heights/Studewood suites 79/79; Studewood and Heights server files with Redis 12/12, 0 skipped.
- **Pending.** Core on the final tree (`core-003`; diff `249f33e0ddd3`, untracked `ec5b01abaf92`), the browser journey `studewood` (queued at about 00:08Z through the lock, from the detached snapshot `scratchpad/studewood-snap`, same diff hash), a signed commit, and a draft PR.

- **Delivered as draft PR #662** (https://github.com/BunsDev/river-oaks/pull/662). Signed commit `33e671e3`, based on `feat/next-district-586-20261024`, opened through REST because GraphQL was rate-limited. `core-003` (00:22–00:29Z) passed on the final tree.

- **Hosted first failure** (Verify 40146901031 on `33e671e3`). `preview experience (studewood)` failed at its streaming check after walking into Studewood (artifact `experience-failure-studewood`).
  - **Cause (inferred; the report has no figures).** The shared Heights landscape part's 6.5 MiB estimate was measured for Heights alone, and Studewood adds 76 trees and 84 planted beds to it.
  - **Fix `6be77a56` (signed).** A high allowance per added tree (4 KiB) and bed (10 KiB); `bayou-heights-1` is unchanged, which a test checks. The journey now logs measured and estimated bytes.
  - **Core attempts on that tree.** `core-004` failed the `land-pr` watch-latency timing test again, at load 17; `core-005` passed (00:44–00:49Z).
  - **Follow-up.** Pushed and commented on #662. The Studewood and terraces journey snapshots were re-synced before they started.

- **Hosted green on `6be77a56`** (19 success, 5 skipped), including `preview experience (studewood)` (Verify 40148167697) and `(heights)`.
  - **Browser figures on the CPU runner.** The shared Heights part measured 7,292,066 B, above the old 6,815,744 B estimate and within the new 7,987,200 B, which confirms the diagnosis. `studewood-north` measured 1,850,396 B and `studewood-south` 1,646,592 B, both within their estimates. Resident was 16,025,470 of 16,777,216 B.
  - **Journey passed:** the Twentieth Street walk, the "Entering Studewood" notice, the park table game, reconnect and return.

- **Local Metal journey passed** (snapshot files equal to `6be77a56`, ended 02:43:58Z): 11/11 checks in 124 s, no page errors, reconnect 1,069 ms, drift 0 m, the same byte figures as hosted.
  - **Captures inspected:** the street and the park (water tower, stalls, café tables, game table).
  - **Visual gaps noted for Val:** bare ground past the east edge on the horizon, and the inherited District address in the HUD.

- **Later merge.** #649's handoff head `c6d42f43` (91's docs-only ledger on `6e5abdff`, which merged main `2da76e1f`) was merged in as `18b9a61f`, with no conflicts.
  - Focused 66/66 preview and 10 server tests, plus 2 Redis-only skips.
  - Core attempts `core-006` and `core-007` failed only the `land-pr` watch-latency test, which passed 3/3 alone in about 100 ms. `core-008` passed. The change is pushed.

### Second increment: Bayou Terraces (task `bayou-terraces-3x-20261025`)

- **Where.** Worktree `river-oaks-terraces-3x`, branch `feat/bayou-terraces-3x-20261025`, stacked on Studewood `33e671e3`.
- **What.** Revision `bayou-terraces-1` composes two locked recipes onto Studewood:
  - `bayou-terrace-north` (seed 1933) and `bayou-terrace-south` (seed 1934);
  - each has a studio row facing Terrace Lane, bank gardens with lawns, a market and café tables, and a riverside walk;
  - a 5 m footbridge over the bayou continues Twentieth or Eighteenth Street onto the Heights greenway.
- **Connections and gates.**
  - The Commons green keeps its hedges and the District edge isn't joined, so the footbridges are the only connections.
  - The two reserved strips become authored locations with unchanged bounds, so no reserved land remains.
  - Heights streams the terraces, and its gate covers them.
  - The Commons stream gate now covers only the Commons' north–south span.
  - There is a gardens game table (`chess-terrace`), a migration that runs first in the Redis chain, and a "Bayou Terraces" label.
- **Measured** (`--reachable`, uncommitted tree on `33e671e3`):

  | Grid | Terraces total | Added | Ratio |
  | --- | ---: | ---: | ---: |
  | 1 m | 131,707 m² | +16,914 | 2.8294× |
  | 0.5 m | 131,269.5 m² | +16,945.75 | 2.8244× |

  3× now needs 8,163.75 m² more reachable ground, about 12,955 m² of new bounds at District density.
- **Focused tests.**
  - Preview Heights/Studewood/terraces/stream/Commons-stream/label/manifest/plaza suites: 99/99.
  - Terraces, Studewood and Heights server files with an owned Redis: 18/18, 0 skipped.
  - Locks: 12/12.
  - First failures kept in this ledger: three terrace test assumptions (the south bridge also lands on Eighteenth Street, a straight walk ends at a market stall, and the gate must be tested from the greenway onto the bridge) and one terrace notice wording. All were fixed in tests or notices, not in composition.
- **Journey routes.** Simulated with the real walking controller over 20 jittered runs, all reaching every waypoint (`scratchpad/p3/probe-terraces.mjs`).
- **`terraces-core-001`** (diff `d53552da195b`, untracked `6f6bb1f893e5`): failed in tooling, 273/274, on the same `land-pr` watch-latency timing test. Its receipt is kept. It never reached the server stage, where review finding 1 below would also have failed.
- **Independent review** (fresh context, read-only). Four confirmed defects and one confirmed behaviour change, all fixed with regressions:
  1. `server/tests/world-manifest.test.js` looked up a reserved location, and none remains. It now uses an authored location that the default revision doesn't compose.
  2. Rollback moved Gardens campus upper-floor players to the greenway, because it checked ground-level walkability for everyone. It now moves only people on terrace geography (the strips and bridges, with no building level), and a campus-floor regression covers it.
  3. The Heights gate trapped a walker mid-bridge on an unloaded terrace, and the notice there gave the wrong way out. Retreat direction and notice now follow the terrace plan. Regressions cover an east step mid-bridge, a real guarded walk from the terrace back to the greenway, and the notice text.
  4. The Commons-gate test didn't tell the old code from the new. It now takes an eastward terrace step.
  5. The terraces' shared bounds made District points stream about 9.5 MB. Points and cameras west of the District edge now never stream Heights when the terraces exist; earlier revisions are unchanged. A regression covers the District gateway looking at the north terrace.
  - Doc wording and stale comments were fixed.
  - The reviewer confirmed byte-identical fingerprints for every earlier revision (default, garage, Gardens, Commons, `bayou-heights-1`, `heights-studewood-1`), exact detach, the Redis chain order, and every journey route from the real stand-up points.
- **After the fixes.** Preview suites 99/99. Terraces, Studewood, Heights and manifest server files with an owned Redis: 23/23, 0 skipped. The branch was fast-forwarded to Studewood `6be77a56` (shared-estimate fix), with a conflict in `heights-stream.js` resolved.
- **Pending.**
  - `terraces-core-002`;
  - the journey `bayou-terraces`, queued about 00:40Z from the detached snapshot `scratchpad/terraces-snap` with matching hashes;
  - a signed commit and a draft PR stacked on #662.

- **Delivered as draft PR #663** (https://github.com/BunsDev/river-oaks/pull/663). Signed commit `125c7f3e`, based on `feat/studewood-3x-20261024`. `terraces-core-002` (00:53–00:57Z) passed: tooling 274/274; preview 4,129 plus 1 skip; server 905 plus 229 Redis-only skips; desktop 115 plus 3 skips.

- **Hosted green on `125c7f3e`** (20 success, 5 skipped), including `preview experience (terraces)` (Verify 40148743422), `(studewood)` and `(heights)`.
  - **Browser figures.** The shared part measured 8,175,390 B against 9,388,032 B estimated; `bayou-terrace-north` measured 2,093,952 B against 2,202,010 B; resident was 11,935,710 B.
  - **Journey passed:** the footbridge crossing, "Entering Bayou Terraces", the gardens table game, reconnect and return.

- **Local Metal journey passed** (snapshot files equal to `125c7f3e`, ended 03:19:27Z): 11/11 checks in 100 s, no page errors, reconnect 931 ms.
  - **Captures inspected:** the riverside walk and the gardens table.
  - **Gaps for follow-up and review:**
    - The Commons Lantern Walk chip shows on the terraces, because `lantern-walk.js` hides it only east of the bayou. That's a design call, left unchanged.
    - The bayou under the kit bridges doesn't read clearly as water.
    - The HUD shows the inherited District address.
- **Later merge.** Studewood `18b9a61f` (carrying #649 `c6d42f43`) was merged in as `9d130475`; focused 67/67 and `terraces-core-003` passed, and it's pushed.

### Both increments merged onto #649's current head (13:00–13:20Z)

#649's head `4c3fddc3` carries main `0b9a97c4`, and with it #641's luxury kit. Both stacked branches were brought up to it while the release-candidate checks ran.

| | #662 Studewood | #663 Bayou Terraces |
| --- | --- | --- |
| Signed merge | `1af6b511`: merges `4c3fddc3` into `18b9a61f` | `f9960d2f`: merges `1af6b511` into `9d130475` |
| Neighborhood size in the luxury kit (headless) | 2.84 and 2.43 MiB | 2.76 and 2.01 MiB |
| New stream estimate | 3.0 and 2.6 MiB (was 1.85 and 1.65) | 2.9 and 2.15 MiB (was 2.1 and 1.5) |
| Recipe locks | All 12 reproduce | All 12 reproduce |
| Reachable footprint | Unchanged, 2.4661× at 1 m | Unchanged, 2.8244× at 0.5 m |
| Focused tests | Studewood and Heights, 22/22 | Terraces, Studewood, Heights and Commons stream, 42/42 |
| Core verify | Passed 13:07–13:12Z: tooling 274/274; preview 4,187 + 1 skip; server 925 + 228 Redis skips; desktop 120 + 3 skips | Passed 13:13–13:17Z: tooling 274/274; preview 4,198 + 1 skip; server 931 + 229 Redis skips; desktop 120 + 3 skips |

- **Estimates.** Each is high, and within a quarter of the measurement, the same rule #649 uses for its own neighborhoods. #649 raised its own after the same merge.
- **Budget tests.** They now check what the kit budgets, as #649's test does after its merge: an assembled plan's materials, triangles and solids, and a drawn plan's meshes. The drawn material count (30–34) includes overlay clones, so it was never the kit's budget.
- **Conflicts.** `heights-stream.js` and `docs/world-expansion.md`, resolved as described in the commit messages.
- **Hosted CI on the merge heads.** Studewood `1af6b511` passed 19 of 19, with 5 skipped. On Terraces `f9960d2f`, every check passed except `preview experience (studewood)`, run 40196965997.
  - **The failure.** The owner stalled against a tree-row trunk at frame (466.55, 100.84) on the leg to the west chair.
  - **Cause, measured with `isFree` along the segment.** From x 466, the line to the chair approach (470.32, 81) leaves 0.00 m clearance at the trunk (x 467), walking radius included. That was already true before the luxury kit. Earlier runs got past only by sliding along it.
  - **Fix `7c9fab86` (journey only).** The owner turns at x 469, as the return leg already does. Clearance is now 0.95 m in both revisions, and every other leg keeps 0.55 m or more. Core passed (13:27–13:31Z). It's merged into Terraces as `b5016d29`.
- **Hosted CI after the fix.**
  - **Terraces `b5016d29`:** 20/20 passed, 5 skipped, including the Studewood and Terraces journeys.
  - **Studewood `7c9fab86`:** 19/19 passed, 5 skipped.
    - Attempt 1 failed `preview shared (development)` → `crime-shared`, "A timed evade (U) beats the rival's telegraphed counter". The same job passed on `1af6b511`, and the only change is the Studewood journey file. It's a timing flake from #646's journey.
    - It passed on `rerun-failed-jobs`, run 40198014512 attempt 2. The first failure's log is kept at `.runtime/convergence/662-7c9fab86-shared-development-attempt1.log`.
- **Merged onto #649's `525856e2`** (river-oaks-91's merge of main `e8207b2b`, #658's touch and voice UI). The merges were clean, and the heavy checks waited until 3e's round-4 ABBA had left the browser queue.
  - **Studewood `d61bdea4`:** Studewood and Heights tests 22/22; recipe locks reproduce. Core attempt 1 failed only the `land-pr` wake-on-release flake (273/274); that log is kept, and the test passed alone. Attempt 2 passed: tooling 274/274; preview 4,191 + 1 skip; server 925 + 228 Redis skips; desktop 120 + 3 skips.
  - **Terraces `6bbf3090`:** 42/42 focused. Core passed: tooling 274/274; preview 4,202 + 1 skip; server 931 + 229 Redis skips; desktop 120 + 3 skips.
  - **Hosted CI.** Studewood `d61bdea4`: 19/19, 5 skipped. Terraces `6bbf3090`: 20/20, 5 skipped. Terraces passed after one `rerun-failed-jobs` for the `crime-shared` timed-evade flake (run 40208285831; see below).
- **Local Metal journeys on `b5016d29` (13:57–14:05Z, one browser-lock turn): both passed.** Hosted runs upload no captures, so these were run for visual inspection in the luxury kit.
  - studewood: 11 checks in 125.0 s;
  - bayou-terraces: 11 checks in 103.7 s.
  - **Receipts.** `scratchpad/p3-journeys/luxury-b5016d29.json` and 10 captures alongside it.
  - **What the captures show:**
    - Studewood's street has the kit's iron tree grates in pale surrounds along the shared brick lane, and both players reach the park table.
    - The Terraces riverside walk and gardens show the planted limestone planter wall along the bank, and the game table.
    - No missing geometry, z-fighting or untextured surfaces were seen. This is a visual check by this task, not Val's human approval.

### Third increment: Woodland Heights, land proposal A′ as a draft (task `woodland-heights-3x-20261025`, draft #673)

**Why build it as a draft.** The goal asks for 3×, and the reserve was fully authored at 2.8244×. So recommendation A′ was built as a working draft that Val can accept or reject. It's marked not to land without Val's land decision, and it's stacked on #663 → #662 → #649.

**The authoring.** A subagent wrote it in `river-oaks-woodland-3x`, using the Studewood and Terraces diffs as the template; this task reviewed and published it.
- **The revision.** `woodland-heights-1` composes on `bayou-terraces-1`. The location `woodland-heights` spans x 507.888 → 552.888 in the recipe frame across the District's whole span (13,069.38 m²), the first location outside the original envelope.
- **The ground.**
  - Live Oak Lane at x 530 with bungalow gardens;
  - Twentieth and Eighteenth continue east from Studewood's, joined by 2 m ground-only seams;
  - corner shops and a green with a `chess-woodland` table;
  - a rollback migration first in the Redis chain.
- **Measured:** 141,664.25 m² at 0.5 m, **3.0480×** (3.0519× at 1 m), adding 10,394.75 m² over the Terraces and passing 3× by 2,231 m². Earlier revisions' world hashes and areas are unchanged. This task reran the footprint and recipe checks itself.

| Check | Result |
| --- | --- |
| Recipe locks | 14/14 |
| Focused preview suites | 125/125 (the subagent); 92/92 and then 93/93 (this task) |
| Server suites | 23/23 with an owned Redis |
| Core on `8c0123e3` | Passed on run 3; runs 1–2 hit the `land-pr` wake flake |
| Local Metal journeys | woodland-heights, studewood and bayou-terraces passed, captures inspected (`scratchpad/woodland/captures/`) |
| Hosted on `8c0123e3` | 21/21, 5 skipped, including `preview experience (woodland)` |

**Independent review** (fresh context, read-only) of `8c0123e3`: one MEDIUM and three LOW, all addressed in `946e8cd2`.
1. **MEDIUM, confirmed: east-facing side gardens held a restored player while Woodland failed to load** (1,327.5 m² by reverse flood fill).
   - **Fix:** on Woodland ground that isn't presented, any step within Woodland is allowed; the way out is west along a cross street.
   - **New flood-fill test:** it fails on the old gate with exactly 1,327.5 m² held.
2. **LOW:** the airborne rollback branch couldn't fire for Woodland. It's marked defensive and the test no longer claims it.
3. **LOW:** the rollback line wasn't pinned. It is now pinned either side; a 0.30 radius fails the test.
4. **LOW, documented:** two Heights pairs exceed 16 MiB on estimates, while measured sizes fit.

**Confirmed fine by the review:**
- earlier worlds are byte-identical;
- the rollback moves exactly the players on Woodland ground;
- the Redis chain order and epoch fencing hold;
- budgets and seams;
- the east edge is closed;
- journey legs are clear;
- every documented number reproduces.

**After the fixes (`946e8cd2`):**
- focused 93/93 and server Woodland 6/6;
- core passed on run 3 (tooling 274/274; preview 4,214 + 1 skip; server 936 + 230 Redis skips; desktop 120 + 3); runs 1–2 hit the `land-pr` wake flake again, and it passed alone;
- hosted 21/21 + 5 skipped on `946e8cd2`.

**Not done:** verify full, human visual approval, devices, matched performance. Val's land decision is required.

### Land proposal for Val, updated after the terraces (projection, not measurement)

**Measured with #649, #662 and #663:** 131,269.5 m² at 0.5 m (2.8244×). The original east envelope is fully authored, so 3× (139,433.25 m²) needs **8,163.75 m² more reachable ground on new land**. Both measured increments came in at about 84–86% walkable density (Studewood 20,815.75 m² from 24,799 m² of bounds; the terraces 16,945.75 m² from 24,199.5 m²).

| Option | New bounds | At ~84% (Studewood/terraces) | At 63% (District) | Ratio if authored |
| --- | ---: | ---: | ---: | ---: |
| A. East envelope +35 m (x 507.9 → 542.9, across the 290.4 m span) | 10,165 m² | ~8,540 m² | 6,404 m² | ~3.008× at 84%; 2.96× at 63% |
| A′. East envelope +45 m | 13,069 m² | ~10,980 m² | 8,234 m² | ~3.06× at 84%; ~3.002× at 63% |
| B. A strip north or south of the whole east envelope, e.g. 40 m × 254 m beyond the District span | 10,160 m² | ~8,530 m² | 6,400 m² | ~3.007× at 84% |
| C. Keep the land and change the metric | — | — | — | Needs Val's explicit approval; not proposed |

Recommendation: **A′ (+45 m east)**. It reaches 3× even at the District's density, keeps the single east–west growth axis, and continues Studewood Street's frontage. It needs a manifest location, which only Val can authorize. 5× remains about 148,000 m² of bounds beyond the original envelope.

### Land proposal for Val (first projection, before the increments)

Suppose Studewood and the north and south strips beside the Commons are authored at about 80% walkable density, Studewood's draft level:

- **Within the reserve:** about 93,508 + 20,000 + 0.8 × 24,199 ≈ 132,900 m², around 2.86×.
- **Still needed for 3×:** about 6,500 m² of reachable ground, or about 8,200 m² of new bounds at 80% (10,300 m² at the District's 63%).
- **Option A, smallest change:** extend the east envelope by 40 m, x 507.9 → 547.9 across the District's 290.4 m span (11,617 m²).
- **Option B:** a reserve north or south of the east envelope, for example 115 × 90 m beside the Commons strips.
- **Option C:** keep the land and change the metric. This needs Val's explicit approval and is not proposed here.

The 5× target is far beyond any of these: about 148,000 m² more bounds at District density.

## Process slip and a frequent local flake

- **Slip (about 19:20Z).** Ledger commit `7f6fe51e` (docs only) was committed and pushed before its `pnpm run verify tooling` passed: the command chain used `;`, not `&&`.
  - Attempts 1–3 on that tree failed only `land-pr.test.js` "a queued lander wakes on release" (273/274).
  - The test passed alone, and its file passed 29/29.
  - Attempt 4 passed 274/274 on the same tree.
  - Later commits chain the verification with `&&`.
- **The flake.** That test now fails often in the full tooling stage on this host, even at load 3–4. Today:
  - the release candidate's verify full attempt 1;
  - #662's core attempt 1;
  - Woodland core runs 1–2 and review-fix runs 1–2;
  - #674's core attempt 1;
  - the ledger tooling attempts 1–3 above.

  It always passes alone. It's worth an owner looking at the watch-latency assumption (`scripts/tests/land-pr.test.js:122`) rather than rerunning past it.

## Recurring hosted flake: `crime-shared` timed evade

`preview shared (development)` → `crime-shared` failed "A timed evade (U) beats the rival's telegraphed counter" twice today, both on heads whose change could not reach it:
- #662 `7c9fab86`, run 40198014512, after a journey-only change; the job passed on `1af6b511` just before;
- #663 `6bbf3090`, run 40208285831, after a clean merge of #658's touch UI.

Both passed on `rerun-failed-jobs`. The first-attempt logs are kept in `.runtime/convergence/`.

The journey (`preview/e2e/crime-shared.js:78–90`, from #646/#640) reads the counter's `remainingMs` from a town snapshot sent every 200 ms. It accepts 80–330 ms, presses U, and needs the press inside a 350 ms window, with three attempts. On a slow hosted runner, snapshot age plus input latency can miss all three. A fix belongs to the #640 owner: for example, time the press from a fresher signal, or widen the attempts.

## Both harness rows fixed, then a rerun on main (Val's decision, about 22:20Z)

**The decision.** Val gave this in river-oaks-33's session at about 22:20Z: "Fix both harness rows, rerun". 33 relayed it here and asked for the final go/no-go. 33 reads it as covering both of the following, then a rerun of the Commons go/no-go on current main:
- the world-streaming journey fix;
- adopting #672's five-rejoin reconnect read.

Landing the two harness PRs through the land queue and guard, once their checks pass, falls under it and under this task's overnight authorization. Conditions 4 (Val) and 5 (operator) still gate activation, and activation stays off. The final go/no-go for `0b9a97c4` (no-go as written) was sent to 33 at about 22:15Z, before this decision.

**Coordination.** The journey belongs to `world-streaming-582-583`, owned by codex:world-streaming-delivery-20261023, whose lease expired 2026-10-24T17:15Z. A note is recorded there as `coordination20261025`; that task is otherwise unclaimed and unchanged, and its worktree has no edit to the journey.

**#675: world-streaming probes on a third client** (task `world-streaming-probe-client-20261025`, head `811669c3`).
- **The mechanism, refined from `diag-0b9a97c4`'s receipts.** Around the probes, client 0 deleted 243 of the 251 GL textures it had registered before the first one. Client 1, which never lost its context, kept 171 of 212.
  - On restore, three.js builds a new `WebGLInfo` and counts each resource again on its next draw. So avatars that weren't redrawn during the warm-ups registered later.
  - The failing +13 is that +9 step plus a +4 swing that both clients show.
  - Moving only the active-presentation probe wouldn't have been enough: the pending-load probe resets client 0 before the warm-ups as well.
- **The change.** A third fixture client, `bob`, goes first and alone. It takes:
  - the failed import;
  - both context losses;
  - one eviction/reload/re-cross cycle after the restore.

  It leaves before the bounded clients connect. The socket reconnect stays on client 0 at lap 0, because it leaves the renderer alone. GPU counts after a restore are no longer bounded; that's the stated trade-off.
- **Independent review.**
  - HIGH: the bounded clients' one-hour fixture sessions could expire around lap 22 if all three clients connected at the start. Addressed.
  - MEDIUM and LOW coverage findings: addressed, or stated in the PR.
- **Checks.**
  - Core: attempt 1 hit the `land-pr` flake (log kept); attempt 2 passed.
  - Hosted: 22/22, after one `rerun-failed-jobs` of `preview experience (campus-traversal)`, a "phone back on the street" failure in a journey this change doesn't load. It passed on main and #672. The log is kept.
- **A void run (this task's slip).** The first version's main run was voided at measured trip 3. I edited the journey in the run's own worktree, which breaks its end-of-run source-hash check, so I stopped the run. In the trips it completed, client 0 showed zero growth over its baseline.
  - Since then, runs go from detached snapshots: `ws-main-e8207b2b` and `ws-rc-0b9a97c4`, both registered as evidence tasks and both carrying the file at sha256 `d274e2a4049976eb`.
- **Journey on main `e8207b2b`: passed**, 22:42–23:45Z, 290 checks in 3,766.7 s, with no resource violations.
  - Against the lap-2 baseline, client 0's largest change was +0 geometries / +0 textures, loaded and evicted, on all 20 trips. Client 1's was +0 / −4 loaded.
  - Heap ratios 1.009 / 1.005. Client 0's reconnect took 1,218 ms with zero drift. Source hashes were unchanged.
  - Receipts: checkpoint `08c341adac7b5f61`, report `61a8282c153b74f2`, in `ws-main-e8207b2b`.
  - The release-candidate snapshot run started at 23:45Z as a second sample.
- **Landed** as `cb83c7cd` at 00:00:58Z through the wrapper and the merge guard.
  - The lander updated the branch onto main `d23fc556`, giving `fa26b3eb`, and all 22 checks passed on the first attempt.
  - Task marked delivered. The branch and worktree were retired with `project:prune --apply`: manifest `~/worktree-backups/river-oaks/retirement-SatxyJ/manifest.json`, with evidence first copied to `~/worktree-backups/river-oaks/evidence/world-streaming-probe-client-20261025-811669c3/`.
  - The coordination note on `world-streaming-582-583` now records the merge.

**Rerun on main `cb83c7cd`, which carries both fixes.** Before this, at about 22:15Z, the final go/no-go for `0b9a97c4` went to river-oaks-33: no-go as written. The ABBA reconnect row and the world-streaming row each failed as written, and each was traced to how it was measured.
- `scratchpad/rc-run.sh` started at 00:01Z on a clean detached checkout, `rc-cb83c7cd` (registered as an evidence task), with an isolated Redis and `caffeinate`.
- It runs: rehearsals; world-gate-587, world-streaming and east-garden-commons; a Gardens/Commons ABBA at the new default of 5 rejoins; pixel parity; then verify full.
- The Commons rehearsal passed at 00:02Z.
- **Journeys** (00:05–00:31Z):
  - world-gate-587: passed.
  - east-garden-commons: passed.
  - **world-streaming, attempt 1: failed** with "Reload 1 player 1 stalled", on warm-up lap 1, before any bound was checked.
    - The peer stopped at (−2708.31, −1349.73), pressed against a 1.75 m box. The route it was following passes that box's corner with 0.05 m of static clearance (walking radius included).
    - Every resident route from the far point to the promenade passes this corner at 0.05–0.10 m. Earlier runs slid past it, including all 22 laps on `e8207b2b`.
    - This is route fragility in the journey, not streaming; #675 didn't change walking. The checkpoint is kept in `rc-out-cb83c7cd/`.
  - **Attempt 2: passed** (01:03–02:06Z), from a separate clean snapshot, `ws2-cb83c7cd`. 290 checks in 3,745.7 s, with no resource violations.
    - Largest change against the lap-2 baseline: loaded client 0 +0 geometries / +4 textures; evicted client 1 +0 / +4.
    - Heap ratios 1.006 / 1.007. Client 0's reconnect took 674 ms with zero drift. Source hashes unchanged.
    - Receipts: checkpoint `7babb536a6fc1f5b`, report `6a90386915ef7c35`, copied to `rc-out-cb83c7cd/`.
  - The release-candidate snapshot sample (`ws-rc-0b9a97c4`) was stopped after measured trip 4 to free the browser lock for this rerun. Up to that point it had 85 checks and 0 violations, with both clients within +0 / +4; its checkpoint (`00044e1790709dae`) is kept in `ws-rc-sample-partial/`.
- **Paired ABBA** (00:31–01:03Z), Gardens/Commons/Commons/Gardens, with 5 rejoins per profile and the backoff kept. All budgeted metrics are within allowance, and every reconnect row has matched `keep×5` settings:

  | Workload | Frame mean | CPU p95 | Reconnect (median of 5) |
  | --- | --- | --- | --- |
  | Desktop, 1 client | 0.0% | +4.2% | −14.2% (1,111 → 953 ms) |
  | Desktop, 2 clients | +0.1% | +3.6% | |
  | Phone viewport, 1 client | 0.0% | +1.6% | +7.2% (982 → 1,052 ms) |
  | Phone viewport, 2 clients | +0.5% | 0.0% | |

  - The first arm confirmed the merged harness end to end: desktop samples 899–1,187 ms, phone 810–1,162 ms, zero drift.
  - **Pixel parity:** Gardens against Commons changed 0.04–0.40% of pixels, against a same-revision spread of 0.03–0.74%.
  - **Receipts:** `rc-out-cb83c7cd/compare-gardens-vs-commons.json`, `pixel-parity.json` and `abba.log`.
- **Verify full: passed all 18 stages on attempt 1** (01:03–02:45Z).
  - Tooling 274/274; preview 4,165 + 1 skip; server with Redis 1,182/1,182; desktop 120 + 3 skips.
  - 44 browser journeys passed across security, reflections, experience, shared and ipic-screening.
  - Receipt sha256 `8502800676dbffa0`.
- **Hosted Verify on main `cb83c7cd`** (push run 40247308809): 20 passed, 1 skipped, after one `rerun-failed-jobs`. Attempt 1 failed only `preview shared (development)` → `crime-shared`, the recurring "timed evade" flake; its log is kept in `rc-out-cb83c7cd/`.
- **Verdict for `cb83c7cd`: conditions 1–3 met. A go for the engineering gate; activation waits on conditions 4 (Val) and 5 (operator), and stays off.**
  - Posted on #587 (issuecomment-6407077852) and sent to river-oaks-33 to take to Val for condition 4.
  - The verdict states world-streaming attempt 1's failure and its cause.
- **Follow-up draft (task `world-streaming-route-clearance-20261026`).** The journey wraps its resident routes in `preview/e2e/route-clearance.js`. `keepClear()` detours a leg around its least-clear point: of the sideways offsets that pass `nav.canTravel`, it takes the one leaving the whole detoured leg clearest, and repeats on each half while the leg keeps less than 0.3 m. A leg is replaced only by a clearer one, and the destination never moves.
  - The journey caches routes per metre of start and settles the lap routes before anyone walks.
  - **Independent review of the first version:** no HIGH. All three MEDIUMs are addressed in the rework:
    - the guards were untested;
    - the greedy detour left eviction legs at 0.10 m;
    - each call blocked about 1 s.
  - **Now:** about 30 ms per call (worst 63 ms). The walked lap routes keep at least 0.30 m (reload) and 0.25 m (eviction), against about 0 for the raw resident routes, by `isAreaFree`.
  - **Tests:** 4/4. Mutants that drop the improvement guard, `canTravel` or the detours each fail.
  - **Draft #676 `fc24f72d`, signed.**
    - Core: attempts 1–3 failed only the `land-pr` wake flake (logs kept; the file alone passes 29/29); attempt 4 passed.
    - Hosted: 22/22 after one rerun of the `office-computer-embed` race.
    - **Journey on a detached `cb83c7cd` with the exact files: passed** (02:49–03:52Z). 290 checks, 0 violations, at most +0 / +4; heap ratio 1.007 / 1.008. Checkpoint `a8940cc09dbf3054`.
    - **Second independent review** of `fc24f72d`: no HIGH. Addressed in `e385e8e2`:
      - MEDIUM: a cached route's first leg wasn't cleared again from a shifted start (0.20 m → 0.30 m).
      - LOW: a missing route was cached; the room key was a grid cell; margins off the 0.05 m grid could never be met; the wrapper was copied into the tests rather than shared (it's now `clearRouter()`).
      - Focused 6/6, with mutants failing; core passed on the first attempt.
      - Hosted 22/22, after one rerun of a `preview checks` timeout: the runner's `playwright install` took 10 m 41 s.
      - **Journey on a detached `cb83c7cd` with `e385e8e2`'s exact files: passed** (07:40–08:42Z). 290 checks, 0 violations, +0 / +0 for both clients; heap ratio 1.009 / 1.007. Checkpoint `2ec10ef29864d51d`.
    - **Landed** as `cb403ba2` at 08:43:09Z through the wrapper and the merge guard: reviewed head `e385e8e2`, 22/22 complete. The basis was Val's "Fix both harness rows, rerun", since this is the row-10 harness follow-up, plus the overnight landing conditions.
      - Task marked delivered. The branch was retired: manifest `~/worktree-backups/river-oaks/retirement-tBzXcL/manifest.json`, with evidence in `~/worktree-backups/river-oaks/evidence/world-streaming-route-clearance-20261026-e385e8e2/`.
      - Coordination recorded on `world-streaming-582-583`, and a follow-up note on #649 (issuecomment-6411862482).

**#672: the five-rejoin read adopted** (head `69afb992`).
- Reconnects default to 5, with the backoff kept.
- `reconnectSummary()` is unit-tested: a single sample is kept unrounded; several give a true median; drift is checked per rejoin and cumulatively.
- Skip-mode nudges stop after 2 s.
- The compare reads each profile's rejoin settings from its samples and marks a mismatched reconnect row `unmatched`.
- `docs/world-expansion.md` states the read.
- **Independent review:** no HIGH. The MEDIUM (an untested summary) and six LOWs are addressed.
- **Checks:** focused 15/15; core passed in one run. Hosted 22/22 after one `rerun-failed-jobs` of `preview experience (places)`, the known `office-computer-embed` account-switch race. The log is kept.
- **Landed** as `d23fc556` at 23:40:05Z through the wrapper and the merge guard: reviewed head `69afb992`, 22/22 complete.
  - The ready mark waited for a GraphQL limit reset (23:39Z).
  - Task marked delivered. The local branch and worktree were retired with `project:prune --apply`: manifest `~/worktree-backups/river-oaks/retirement-vr2WNV/manifest.json`, with evidence copied first to `~/worktree-backups/river-oaks/evidence/reconnect-measure-20261025-69afb992/`.

## Handoff (about 18:15Z)

**Delivered by this task:**
- **Ten merges** through `pnpm run land` and the merge guard (Phase 1 table above).
- **The Commons go/no-go for `0b9a97c4`: no-go as written**, with evidence on #587 (issuecomment-6399590750) and status on #638 (issuecomment-6399591964). Both measured failures now have measured explanations:
  - **World-streaming:** the journey's own context-loss probe resets three.js's counters on client 0. The instrumented rerun passed at +9. This is not #641.
  - **Phone reconnect:** the client's random backoff, sampled once. With 5 rejoins (draft #672) it's within budget in both modes.
- **Three 3× increments, stacked on #649 `525856e2`:**

  | PR | Head | Reachable ground | State |
  | --- | --- | --- | --- |
  | #662 Studewood | `d61bdea4` | 2.4598× | Ready to follow #649 |
  | #663 Bayou Terraces | `6bbf3090` | 2.8244× | Ready to follow #662 |
  | #673 Woodland Heights (A′) | `946e8cd2` | **3.0480×** | Needs Val's land decision |

  All are signed, with core passed and hosted CI green: #673 is 21/21 on both `8c0123e3` and `946e8cd2`.
- **Draft #672 (reconnect measurement):** hosted 22/22. A protocol change for its owner or Val.

**Update at 22:10Z.** Two Val decisions have arrived in other sessions since this handoff:
- **#658: keep the merge** (22:06Z, f1's session; see the #658 section).
- **#649: Val chose to review and merge it personally** (about 18:50Z, recorded in river-oaks-3e's register entry `next-district-586-support-20261024`). So this task won't queue a lander for #649. #649's head is now `df794f95` (docs only on top of `525856e2`; hosted 25 passed, 5 skipped), and 91's entry lists the decisions Val takes with it: the Heights ceiling (about 24.5 MiB), oak sharing, the budget-test reading, and the heights journey's leg length (19m09s of its 20-minute timeout).

After Val merges #649, this task prepares #662 and then #663 as before: merge main, retarget to `main`, run core and hosted. Both had independent reviews addressed (Studewood and Terraces sections above). They extend the district Val is reviewing in person, so they land only on Val's word at that point, not on the overnight reading.

**Waiting on Val:**
1. **#649:** Val's own review and merge.
   - **State at about 18:40Z:** head `95904d23`, up to date with main. Round 4 (`e8207b2b` against `525856e2`) is within every limit, verify full passed 18/18, and hosted CI is 16/16.
   - **Both owners route the merge to Val.** river-oaks-91's register entry says "BLOCKED on merge authorization (owner needed: Val)".
   - **Decisions set before the merge.** river-oaks-3e's support ledger (#670 `ad27d9d6`, "Decisions for Val") lists them: the district's name and art direction, visual approval at pedestrian height, which budget protocol is in force, and the streaming ceiling.
   - **Why this task doesn't land it.** Landing would pre-empt those decisions as well as the owner's hold.

   Once it lands:
   - merge main into #662 and retarget it to `main`;
   - run core and hosted checks, then land;
   - then do the same for #663, then #673.

   Landing them needs merge authorization at that time.
2. **The land decision for #673** (A′, #586 issuecomment-6391681517).
3. **#656** Decisions 1–5. Its final head `13c0afc4` ships switched off.
4. **#659**'s security commit `66134f27`.
5. **#653 and #654.**
6. **#655:** its review fixes are ready in stacked draft #674 (hosted 15/15) for river-oaks-3e; then Val's go.
7. **The Commons release:**
   - the world-streaming journey's counting after its own context-loss probe (owner of `world-streaming-582-583`; options on #587);
   - adopting a multi-sample reconnect read (#672);
   - condition 4 (Val's sign-off) and condition 5 (production state).

**Preserved, not retirable now:**
- **Branches with open PRs:**
  - `docs/convergence-3x-20261024` (#664);
  - `feat/studewood-3x-20261024` (#662);
  - `feat/bayou-terraces-3x-20261025` (#663);
  - `feat/woodland-heights-3x-20261025` (#673);
  - `perf/reconnect-measure-20261025` (#672);
  - `fix/resident-locations-review-20261025` (#674).
- **`perf/walking-obstacle-buckets-20261025`** (worktree `river-oaks-walking-buckets`, PR #669 closed as superseded). It needs explicit cancellation authority (`project:cancel`, dry-run first).
- **Seven detached scratch checkouts holding receipts,** each registered as a blocked `convergence-3x-evidence-*` task: `rc-0b9a97c4`, `bisect-15334aad`, `heights-8f3c94fd`, `studewood-snap`, `terraces-snap`, `terraces-b5016d29` and `diag-0b9a97c4`.
  - `diag-0b9a97c4` holds local-only instrumentation and the #672 harness patch, both uncommitted.

**Host.** `caffeinate` PID 56722 holds the host awake until about 18:36Z; `kill 56722` stops it.

## Handoff (about 03:00Z, updated 08:50Z, 2026-10-26)

**Delivered since the 18:15Z handoff:**
- **Val's two decisions recorded.** Keep #658's merge (22:06Z, f1's session). Val will merge #649 personally (about 18:50Z, 3e's register).
- **Both harness rows fixed and landed** on Val's "Fix both harness rows, rerun", relayed by river-oaks-33:
  - **#672** landed as `d23fc556`: the five-rejoin reconnect read is now the protocol.
  - **#675** landed as `cb83c7cd`: the context-loss probes run on a third client.
  - Each had an independent review addressed, core passed, hosted was complete, and its branch was retired with restore-tested archives.
- **The Commons go/no-go rerun on main `cb83c7cd`: conditions 1–3 met.** Evidence is on #587 (issuecomment-6407077852) and the verdict went to river-oaks-33 for Val's condition 4. World-streaming attempt 1's route-corner stall is reported alongside it.
- **#676 landed** as `cb403ba2` (08:43Z, task `world-streaming-route-clearance-20261026`): the journey's walked routes keep clear of obstacle corners. It had two independent reviews addressed, and its journey passed on its exact files. Its branch is retired.
- **#649's owners told that main moved.** The messages to river-oaks-91 and 3e were held undelivered, so the note is on #649 (issuecomment-6407190389): their next ABBA needs matched reconnect settings on both arms.

**Waiting on Val:**
1. **Commons activation:** condition 4 (visual and physical-device sign-off), then condition 5 (production state, for the operator). Activation stays off.
2. **#649:** Val's own review and merge. #649 is now behind main by three harness merges (#672, #675, #676). Then #662 → #663, which land only on Val's word, and #673 after Val's land decision.
3. **#656, #659 (`66134f27`), #653, #654:** unchanged.
4. **#655:** 3e takes #674, then Val's go.

**Preserved, not retirable now:**
- **Branches with open PRs:** `docs/convergence-3x-20261024` (#664), `feat/studewood-3x-20261024` (#662), `feat/bayou-terraces-3x-20261025` (#663), `feat/woodland-heights-3x-20261025` (#673) and `fix/resident-locations-review-20261025` (#674).
- **`perf/walking-obstacle-buckets-20261025`:** needs explicit cancellation authority.
- **Detached evidence checkouts**, each a blocked `convergence-3x-evidence-*` task:
  - from earlier: `rc-0b9a97c4`, `bisect-15334aad`, `heights-8f3c94fd`, `studewood-snap`, `terraces-snap`, `terraces-b5016d29` and `diag-0b9a97c4`;
  - added tonight: `ws-rc-0b9a97c4`, `ws-main-e8207b2b`, `rc-cb83c7cd`, `ws2-cb83c7cd`, `ws-route-cb83c7cd` and `ws-route2-cb83c7cd`.
  - They hold the receipts cited above. Retire them only once nobody needs those receipts.

## Val's decisions, 2026-10-26 (about 16:40–20:00Z, answered directly in this session)

Val asked to continue. This task asked the open decisions directly, then put a second question round after river-oaks-a3 relayed answers from Val's session there that conflicted with them. These are Val's confirmed answers:

| PR | Decision | Who acts |
| --- | --- | --- |
| #649 Bayou Heights | Rerun the gated ABBA (round 6, five-rejoin protocol). Land #649 only if it's within budget | This task lands it last, after the PRs below, so the gate is measured on the main it lands on. 91 and 3e were told through a3; 3e may run round 6 |
| #662, #663 | Wait for Val's word | — |
| #673 Woodland Heights | Land proposal A′ approved; it lands after #663 | Waits on #663 |
| #659 network drops | `66134f27` approved (also relayed by a3: "Approve 66134f27"). It lands whole | This task |
| #656 default looks | Lands with the trial switched off | This task |
| #654 desktop docs | Lands | This task |
| #655 resident locations | Go | This task, with verify full after the main merge, per 3e's note |
| #653 Linux crash recovery | Hold | — |

Landing order: #654, #659, #656, #655, then #649 after round 6. Each decision is also recorded on its register task as `valDecision20261026`.

### Results of the 2026-10-26 decisions (to about 01:20Z on 10-27)

| PR | Result |
| --- | --- |
| #654 | Landed as `8b73888a`, 21:46Z. 22/22 after one rerun of the Commons job |
| #659 | Landed as `40f4e786`, 22:37Z, with `66134f27`. Task delivered. Branch retirement left to river-oaks-f1, whose reports are in the worktree |
| #656 | Landed as `caa1a7ef`, 23:29Z, switched off. Delivery and retirement left to river-oaks-32 |
| #655 | Landed as `2d63637f`, 00:53Z. 22/22 after one rerun: the runner's `playwright install` took 9 min 14 s and cut off the Commons job. Merge SHA posted for river-oaks-3e (#670); a direct message expired, held |
| #649 | **Superseded.** river-oaks-91 reports Val told it directly at about 23:3xZ to "commit push and merge to main" without round 6. This task stood down, recorded it on #649 and the register, and 91 lands #649 as owner. After that, this task prepares #662, #663 and #673 for river-oaks-e9 to land; e9 reports Val's authorization at about 20:40Z |
| #653 | Held on Val's answer in this session, then landed by river-oaks-7c as `ba7418c6`, presumably on Val's word in that session |

**#655 pre-landing verification** (#655 issuecomment-6429702334), on a scratch merge with main:
- `verify full` didn't pass as one command:
  - attempt 1 was SIGKILLed at the 1,200 s experience limit;
  - attempts 2 and 3 failed on the tooling timing flakes, at loads up to 169;
  - attempt 4 was SIGKILLed again, at load 35–73 from other projects.
- Run directly, the four remaining stages all passed: 16 experience journeys in 23.9 min, experience-commons, shared 27/27, and ipic-screening.
- river-oaks-e9's #660 (`a13c853b`) moved the Commons journey into its own stage.

**Landers that died at about 00:09Z.** Every lander on the machine, #655's included, died at about 00:09Z, with no sleep in the power log. #655's lander was requeued and landed. river-oaks-7c held #683 back to keep #655's place.

## Phase 3: recurring flakes (2026-10-27)

- **#693, the queue wake and admission timing** (task `queue-wake-recheck-20261026`). See the PR for the cause and probe data.
  - On macOS, a directory watch starts its FSEvents stream asynchronously. So a queue release in the same tick as `watch()` is never reported, and the waiter sleeps until its fallback timer. That's the `land-pr` wake flake, exactly 30 s every time.
  - `waitForTurn` now rechecks every 1 s, and a held lock during a recheck skips that tick.
  - The admission test's queue wait now exceeds its timeout (2.5 s against 2 s), so the property is kept with a realistic start-up budget.
  - **Checks:**
    - on the old code, three tests fail, including the original at 30 s;
    - with the fix, 32/32;
    - `verify tooling` 9/9 runs;
    - core passed;
    - hosted 22/22 on the first attempt.
  - Independent review: no HIGH; all findings addressed.
  - **Landed** as `96ec9e10` at 02:29Z, with 23/23 complete on the lander's head `48ca24ed`. The ready mark first failed on the GraphQL limit and was retried. Task delivered; branch retired (manifest `~/worktree-backups/river-oaks/retirement-tB4rM0/manifest.json`).
- **The district stack after #649 landed** (`3df540ee`, 01:20Z, by river-oaks-91).
  - **Val's gate**, reported by e9 at about 01:28Z: each step lands once hosted CI is green on an up-to-date head, citing the existing local journey receipts. The journeys and the District ABBA run at final main in e9's 3× acceptance pass.
  - **#662:** GitHub retargeted it to main. Signed merge of main `36382dfe`; tests 17/17; recipe locks clean; core passed in one run. Released to river-oaks-e9, who claimed it and is landing it.
  - **#663:** signed merge of #662's head, `adb2baa2`; tests 48/48; core passed in one run. Pushed; released to e9 once #662 merges.
  - **#673:** signed merge of #663's head, `e0b2d293`; tests 60/60; core passed in one run. Pushed; released once #663 merges.
- **#696, `crime-shared` evade timing** (task `crime-evade-timing-20261027`).
  - **Measured on scratch copies, visitor CPU-throttled through CDP:**
    - 6×: both old and new fail; the page sees the counter too late for any timing.
    - 3×: the old timing passed 4 of 6. The new one (230 ms lead) passed 6 of 6, every time on the first attempt, with the evade sent 157–208 ms before contact.
  - **Hosted:** that 230 ms version (`2f430afe`) **failed the check on hosted**.
  - **Independent review:** no HIGH. Its MEDIUM: the error only runs one way, so the lead should sit near the window's early edge.
  - **The 340 ms lead (`4d7cbd6e`):**
    - 3/3 at 3×, sent 273–294 ms before contact;
    - **`crime-shared` passed on hosted** in 36 s; the 230 ms run took 2 min and failed.
  - **That hosted run's two other failures, neither touched by this change; failed jobs rerunning:**
    - server `crime-transport.test.js` "redis: one hit is seen by every client once…": "alice: socket closed (4009) before its first snapshot". A reconnect and writer-replacement race in the test, for the crime owner. Log kept.
    - `east-garden-commons` "owner home: stalled". The owner was still moving at 5.8 m/s when the 120 s per-waypoint deadline expired, 15 m from a waypoint whose approach passes an obstacle at 0.05 m. It's the same corner class #676 fixed for world-streaming. **Follow-up:** route this journey through `clearRouter()` too.
- **#673:** released to river-oaks-e9 at `fcfc6a98` (signed merge of main `74f12d76`; tests 60/60; core passed in one run).
- **The district stack is on main. 3× reachable ground (Woodland A′ measured 3.0480× at 0.5 m on its branch):**
  - #649 Bayou Heights `3df540ee` (river-oaks-91, 01:20Z);
  - #662 Studewood `9ee35b4c` (e9, 02:50Z);
  - #663 Bayou Terraces `74f12d76` (e9, 03:39Z);
  - #673 Woodland Heights `a5857cf4` (e9, 04:56Z; `preview checks` passed on rerun).

  Each step: this task merged main and ran core, and e9 landed it on Val's gate. e9 retires the district worktrees after archiving them, then runs the 3× acceptance pass on final main (journeys, the District ABBA and reachable-ground measurement) and posts on #638 and #587.
- **Main red after the stack: #698, Redis room lease** (task `redis-refused-lease-20261027`).
  - **Symptom:** hosted `preview checks` failed intermittently from a5857cf4 on (#673 attempt 1, both #696 attempts, d70f4d87). The failure rotated across Redis district-epoch tests: gardens migration :250, Studewood :163, Heights :166. Each time, the join right after a refused join returned `request_timeout`.
  - **Cause:** `runTick` takes the lease, refuses the stored state ("Invalid durable town district/region/checkpoint/..."), and never releases it. The next room waited the 5 s lease out (5,507 ms measured locally), and the longer recovery chain pushed it past `REQUEST_MS` (7 s) on hosted runners. A refuser that keeps ticking renews the lease indefinitely. 32 parallel local runs at load 6–7 did not reproduce the timeout, but the timing gap was measured directly.
  - **Fix (`fae70fe6`):** `tick()` runs the token-checked `RELEASE` on an "Invalid durable" refusal. A new regression test fails on the old code, and the existing epoch test now asserts the release after each refusal. Focused Redis files 20/20; full server suite with Redis 1,339/1,339; core passed in one run (twice).
  - **Independent review:** nothing HIGH or MEDIUM. On base it measured `request_timeout` while the refuser keeps ticking, and 9 of 10 commands timing out under a higher-generation refuser; with the fix, 10 of 10. LOW notes addressed.
  - **Landed:** #698 as `866ae90d` (26/26 checks on `fae70fe6`), then #696 as `525d9edd` (26/26 on lander-updated `ba75e923`). Both retired through `project:prune` from main's tooling, with evidence archived and restore-tested under `~/worktree-backups/river-oaks/evidence/` (`redis-refused-lease-698`, `crime-evade-timing-696`). Origin deleted both branches on merge.
- **`east-garden-commons` hosted failures, 2 of the last 50 shard runs: #699 landed as `94479146`** (task `commons-route-clearance-20261027`; the branch keeps its first name because the ref guard refuses renames).
  - **Route clearance dropped.** An independent review showed the #696-run stall never reached the 0.05 m corner: the owner was still 0.83 m from where "owner home" began.
  - **Stall (run 40447048333, owner page at 3 fps).**
    - In the 120 s window the owner made 100 drags; only 2 got pointer capture, and yaw changed only on those.
    - **First reading, wrong:** overlap with the other page's drag. Its fix, `e1821eb1`, queued drags strictly one page at a time. Its hosted run (40465159738, 31 fps) stalled at the first walk with `turns {drags: 117, turned: 0}`.
    - **Pattern across all three failing traces:** in headed Chromium (CI under Xvfb), the first drag in a page after the other page's press almost never captures (5 of 561), against 109 of 132 after the same page's press. When both players turn at once, main's driver alternates between pages and every drag fails until a deadline. The strict queue made every drag a switch.
    - **Fix (`3ef3433b`):** a page keeps a shared turn until it faces its waypoint; the other page waits. `turns {drags, turned, waitedMs}` goes into the stall error and the route evidence.
    - **Regression test:** a two-page harness test models the capture behaviour. Main's driver and `e1821eb1` stall both players; `3ef3433b` passes inside a 90 s bound.
  - **Overshoot (run 40459091182, 37 fps).**
    - A fast press about 2 m out carried the owner through the rain-garden lantern waypoint at 6.4 m/s.
    - The loop broke inside 0.15 m while the owner was still moving, and the owner coasted to 0.92 m out, beyond the town's 0.6 m arrival check.
    - **Fix:** at a waypoint, release the keys and, if still moving, wait to stop and measure again.
    - **Reproduced** by the `commons-walk-driver` harness: main's driver fails 11 of 276 fast approaches, this one none. Three of those cases became regression tests that fail on main.
  - The 0.15 m break, 0.6 m confirm and 120 s deadline are unchanged.
  - **Follow-up for the input-trace owner:** record `hasPointerCapture` after the host's own handler, to tell "capture never requested" apart from "requested but never granted".
  - **#699 landed** as `94479146` (lander-updated head `d2f9c73a`). Hosted ran 26/26 on both `3ef3433b` and `d2f9c73a`, including the `commons` shard. Retired with archive `retirement-1WPe73`; evidence is in `evidence/commons-walk-699`.
- **#700, `world-streaming` eviction diagnostic** (task `streaming-eviction-diagnostics-20261027`, requested by river-oaks-e9 after its acceptance pass failed lap 12 on a5857cf4).
  - **The failure:** both players reached the far point, but `residentBytes === 0` timed out after 120 s with no state.
  - **The change:** on a timeout only, the report now covers both tabs. It gives animation frames against draws, graphics state, the stream's counters and chunks, the position and camera ground point in [east, north], and the camera direction.
  - **Likely mechanism, unconfirmed.** Review found the Commons stream unloads at 110 m and adds the Commons centre as a point while the camera can see it. The far point is only about 9.7 m past unload, so a player who overshoots and faces east keeps the Commons resident. e9 reruns once on a main that includes #700. **#700 landed** as `d458c927`; retired (`retirement-XG5lza`).
- **Hosted shard failures since 2026-10-26, from 60 Verify runs.** `preview checks` failed 9 of 71 times: all but one Redis epoch failure predate #698; the exception is one `crime-transport` Redis failure, already with the crime owner. `shared (development)` failed 5 of 71 times: four predate #696, and one is the new mode below. `commons` failed 3 of 71 times (fixed in #699) and `terraces` 3 of 56 times.
- **#701, `crime-shared` counter before the loop** (task `crime-counter-before-loop-20261027`).
  - **The failure:** a hosted run took 112 s, against 37 s for its passing rerun, and all three evade attempts saw `{seen: null}`.
  - **Cause:** the owner page's best-effort shove wait (`.catch`) waited out its 60 s default when the 600 ms gesture was missed. Meanwhile the rival countered every 2.5 s, five landed counters downed the visitor, and the rival disengaged.
  - **Fix:** the wait gives up after 1 s, and a missed counter now records `engagedId` and health. Nothing that asserts changed.
  - **Hosted:** attempts 1 and 2 were cancelled at the 20-min limit for `shared (required)` (installs of 9.8 and 10.3 min); attempt 3 passed 26/26. Landing.
- **#702, one walk driver** (task `shared-walk-driver-20261027`). **Landed** as `7b8bca53` and retired (`retirement-okdRKN`).
  - `preview/e2e/walk-driver.js` serves `east-garden-commons`, `bayou-heights`, `bayou-terraces`, `studewood` and `woodland-heights`. Each now gets the waypoint settle and the page-held turn; bayou-heights' `face()` goes through the same turn. The stall error gains `turns` and `presses`.
  - The walk itself is the Commons driver as merged. On a 260-case sweep it matches main exactly.
  - **Tests:** the two-page `face` and the mixed walk/face cases fail on main's bayou-heights `face()`. Hosted 26/26, including all five district shards.
  - **Dropped:** a frame-rate-independent slow press for the terraces 2 fps crawl. In the harness it made things worse (77 vs 23 of 260 cases failing), so the crawl's mechanism stays open; `presses` in the next stall error should name it.
- **Hosted Playwright install stalls, for Val's CI proposal.** Measured over 759 shard jobs on 2026-10-27: the median `playwright install --with-deps` took 0.2 min, but 58 jobs (7.6%) took 6 min or more, up to 10.4. Seven jobs hit the 20-min shard limit, all on the long `shared (required)` and `heights` shards, and every one had a 5–10 min install. Fixing this needs a CI change (cache the apt dependencies, or give those two shards headroom); timeout changes are not authorized here. The data is in `evidence/walk-driver-702/.runtime/walk-driver-702/install-times.tsv`.
- **Orphan scratch checkouts.** This session left 19 detached comparison worktrees under its scratchpad (bisect, crime, rc, ws, district snapshots and others). Removing them needs Val's explicit authorization for `project:prune --cancel-stale --detached-path`. Until then they stay, and they are listed in `git worktree list`.
- **`office-computer-embed` account-switch race:** river-oaks-e9's journey-only fix. Whether access-entry should reload at all stays a product question.
- **garden-campus-traversal "phone back on the street":** one hosted failure (#675 attempt 1). Its artifact doesn't show the phone's state, so a fix would be a guess. **Proposal for the journey's owner:** make `onLevel`'s failure message include the server's `levelId` and position.
- **Hosted `playwright install --with-deps` mirror stalls** (proposal for Val, not a change). Tonight the step took 9–10.7 min, against 6 s normally, on #649, #676 and #655's runs. That pushed `preview checks`, `preview experience (commons)` and `worlds-and-creator` past their 20 min job limit. Options:
  - cache the apt archives the step downloads;
  - run the browser jobs in the pinned Playwright container image;
  - give the install its own step timeout, with a retry against another mirror.

  The first two change the workflow, so this is Val's call.
