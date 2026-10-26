# Landing steward: 2026-10-24 draft wave

## Objective

Turn the authorized part of the 2026-10-24 draft wave (#641, #645–#659) into verified merges on a green `main`, retire what they deliver, re-prove the expansion gates once on the final `main`, then open the 3× reachable-ground lane. Goal prompt: written 2026-10-24 23:30Z for Val (`landing-steward-20261024`).

Owner: `claude:river-oaks-e9 (15dd41cd)`. Worktree `river-oaks-landing-steward`. Branches: `docs/landing-steward-20261024` (this ledger), `fix/experience-commons-stage-20261024` (D12).

## Authority as received

Val set the goal without ticking any landing row, so this session is **not authorized to land**. It runs no lander, marks nothing ready and merges nothing.

River-oaks-71 (`convergence-3x-20261024`) runs a parallel goal. It reported that Val told it, at about 23:35Z, to "proceed with all of the above e2e through to full completion … I will be asleep". It treats that as landing authorization for the green Phase 1 PRs, through `pnpm run land` only, with #641, #653 and #654 held. That authorization was given in 71's session, not this one. This ledger records 71's landers but does not adopt their authority.

## Split with the parallel sessions

| Session | Task | Owns |
| --- | --- | --- |
| river-oaks-71 | `convergence-3x-20261024` | Every Phase 1 lander, serially. The post-wave Commons/Heights RC rerun. The 3× lane (handed over at 23:47Z) |
| river-oaks-e9 (this) | `landing-steward-20261024` | Guarded retirement, D12, readiness audit, Decisions for Val |
| river-oaks-33 | `commons-final-rehearsal-20261024`, `bayou-luxe-polish` | Its own lander for #657 (Val: "land it as docs"). #641 rework (Val: request changes) |
| river-oaks-a3 | `open-pr-sweep-20261024` | Finished and released at 23:36Z; lands nothing |

## Baseline (2026-10-24 23:35Z)

- `main` 1fd53fb9; Verify and "Push on main" green. Land queue empty. Load about 10.
- `project:check --github`: **86 gaps**; 73 branches, 68 worktrees, 428 tasks (`.runtime` receipt kept in the scratchpad).
- `project:inventory`: 68 worktrees, 73 branches; 46 active, 13 blocked, 12 detached, 5 open-PR, 9 parked, 1 retire-candidate, 2 zero-commit.
- Open PRs: 16, all draft except #657. Hosted: 15 green on the current head, #649 in progress with one failure. Every commit on every open PR is verified. No PR has a review thread.

## Readiness audit (23:40Z)

| PR | Owner (live?) | Hosted | State | Left before landing |
| --- | --- | --- | --- | --- |
| #650 | river-oaks-56 (not listed live) | 22/22 | clean | Val review |
| #657 | river-oaks-33 (live) | 22/22 | behind, ready | 33's lander armed |
| #648 | river-oaks-bc (live) | 22/22 | behind | Mark ready |
| #645 | onfoot-637-640 (gone) | 22/22 | behind | Full verify passed on the head. Human feel review requested |
| #646 | onfoot-637-640 (gone) | 22/22 | behind | Head is a GitHub update-branch merge; local full verify ran on 83a1c4f6 |
| #647 | river-oaks-a8 (live) | 24 + 5 skipped | behind | Owner's `verify full` run 3 in progress |
| #655 | river-oaks-3e (live) | 22/22 | clean | Local browser stages queued |
| #656 | river-oaks-32 (live) | 22/22 | clean | Local browser evidence queued |
| #658, #659 | river-oaks-f1 (live) | 22/22 | clean | Browser evidence queued |
| #651, #652 | river-oaks-7c (live) | 29/29 | behind | Val review |
| #653 | river-oaks-7c | 29/29 | behind | Val: core-dump trade-off |
| #654 | river-oaks-7c | 22/22 | behind | Val: #373/#372/#370 answers |
| #641 | river-oaks-33 | 24/24 | behind | Val requested changes; owner reworking |
| #649 | river-oaks-91 (live) | in progress | blocked | Hosted not green yet |

Shared files set the landing order: `desktop.yml`/`desktop/e2e.js`/`docs/desktop.md` (#651–#654); `shared-runner.js` (#645, #656); `city-kit/render.js`, `east-garden-commons.js` (#641, #649); `preview/src/main.js` (#647, #649); `server/redis-room.js` (#646, #649).

## Rounds

### Round 1 (23:35Z–)

- Orient, baseline, claim. Messaged a3 (sweep owner) and agreed the split with 71.
- **Retirement.**
  - All 12 released sweep refs failed the guard's dry run. The guard reads one `task.pr` and one exact `retirement.head` per task; the sweep's release said "per-branch".
  - a3 split the two refs that pass the merged-PR check into standalone tasks with exact-head releases (23:40:17Z).
  - Retired `fix/studio-preview-software-shadows-20261024` at 43e6380c, exactly #642's head. Archive `~/worktree-backups/river-oaks/retirement-Gqav1Y`, bundle sha256 `02be07b4…`.
  - Retired `fix/cafe-journey-on-request-20261024` at 62105c2e, a behind-tip ancestor of #644's head a07ed71c, together with worktree `river-oaks-pr-sweep-2`. Archive `retirement-2pPJc0`, bundle sha256 `8cdc44db…`.
    - First, its ignored `.runtime` and `data/generated` (9 files) were archived to `~/worktree-backups/river-oaks/evidence-landing-steward-20261024/pr-sweep-2/`. The tar and per-file SHA-256s were verified by extraction (9/9 OK).
    - Regenerable caches (`node_modules`, `.venv`, `dist`, `__pycache__`, `.pytest_cache`, `.ruff_cache`) went to the Trash.
  - Blocked, preserved:
    - The ten `sweep/prNNN` aliases (489, 504, 569, 571, 572, 575, 623, 626, 628, 630). Each tip is on `main` and is an ancestor of its PR head, but the name differs from the PR's head ref, and the guard only accepts an alias whose tip equals the merged head. Needs Val's `--cancel-stale` decision or a guard extension.
    - Their worktrees: river-oaks-pr-sweep-3, pr489, pr569, pr572, pr623.
    - Detached `river-oaks-pr-sweep` (e17fd94d), with an untracked sweep ledger and two café reports to archive first.
    - `test/mvp-regression-20261023` (#619, delivered): owner `codex:mvp-regression-20261023` has not released it, and its worktree now holds `fix/movement-pad-contrast-20261024`.
- **D12** (see below). Signed `ea7b8ca1` (signature checked Good locally); draft **#660**. The `build` + `experience-commons` stage run was queued from detached snapshot `scratchpad/d12-snapshot` (task `landing-steward-d12-snapshot-20261024`) at about 23:54Z, 8th in the browser queue.
- **Merges observed** (71's landers):
  - #657 → c3eae4f5 (23:49:06Z). River-oaks-33 retired its own ref, task `commons-final-rehearsal-20261024` retired.
  - #648 → 26d63a06 (reviewed head bbd68da9). River-oaks-bc split `docs/campus-readiness-ledger-512-20261024` into `campus-readiness-ledger-512-pr648-20261024`. Release is held while bc's local `verify full` attempt 4 runs in `river-oaks-readiness-ledger-512` (pid 1544, its own Redis :57205). bc will release at exact head 85d66e97 when it finishes; archive `.runtime/readiness-ledger` first.
  - #650 → 2da76e1f (reviewed head b7b9e5d0). 71 marked `ipic-screening-s1-postmerge-498` delivered. Its owner, river-oaks-56, is no longer a live session (not in ListAgents since 23:35Z), so nobody can give the exact-head release. The task stays **preserved**: branch `test/screening-s1-postmerge-498-20261024` at 432c649f, worktree `river-oaks-s1-postmerge-498`. It needs Val's release or `--cancel-stale` decision; no release was inferred.
  - #651 → 4122fe07 (reviewed head 12ae37ac). 7c released `desktop-macos-e2e-371-20261024` at exact head d0be556f (behind-tip) at 00:34:43Z.
    - Archived `.runtime` (verify receipts at 67203a6a and b3127a6b, cited by #654) and `data/generated` to `evidence-landing-steward-20261024/desktop-macos-e2e/` (9/9 OK).
    - Caches, including the 533 MB `dist`, went to the Trash.
    - The dry run was eligible; applied. Retired the ref and worktree `river-oaks-desktop-macos-e2e`. Archive `retirement-T00qVG`, bundle sha256 `0e1ddadc…`. 7c independently verified the bundle and the evidence tar.
  - #652 → 7ad9ffc6 (reviewed head 65aef4ac). 7c released `desktop-electron-cache-371-20261024` at exact head 04228bec (behind-tip) at 01:56:12Z.
    - Archived the four `.runtime/agent` receipts plus `data/generated` to `evidence-landing-steward-20261024/desktop-electron-cache/` (10/10 OK).
    - The dry run was eligible; applied. Retired the ref and worktree `river-oaks-desktop-electron-cache`. Archive `retirement-M02i7C`, bundle sha256 `0a0c88ad…`.
  - Remote branches: the repository has `delete_branch_on_merge: true`, so GitHub deleted each merged PR's head branch about 2 s after the merge (for example `head_ref_deleted` at 00:32:20Z for #651 and 01:55:30Z for #652, actor BunsDev). This session deleted no remote ref. The `diag/*` push-only refs remain on origin.
  - Observed: #641 entered the land queue under river-oaks-33's own lander at 00:38:46Z. Val's earlier call in a3's session was "request changes"; whether Val approved the rework was not checked from this session.

## D12: the Commons journey gets its own local stage

- **Problem.** The local `experience` stage ran 17 journeys under one 1,200,000 ms deadline, with `east-garden-commons` last.
- **Evidence.** These are the receipts that existed at 23:50Z (`.runtime/agent/full.json` and `data/reports/experience.json` in 16 worktrees, read only).
  - Of 14 runs with an experience result, 4 failed at 1,200,016–1,200,064 ms with ETIMEDOUT (expansion-mvp, locomotion-637, mvp-regression, release-readiness), and a fifth (human-studio-504) failed at 1,198,616 ms. Passing runs took 879,817–1,177,485 ms (onfoot-640 used 98% of the deadline).
  - The Commons journey alone took 163–240 s on Metal (fidelity-timing-517 163 s, campus-510 221 s, resident-locations 240 s).
  - The other 16 journeys took 864–894 s in those runs.
- **Change.**
  - `east-garden-commons` moves to a new `experience-commons` browser task, with the 10-minute default deadline, in both the `browser` and `full` profiles, right after `experience`. Experience keeps its 1,200,000 ms deadline and the other 16 journeys.
  - `scripts/agent.mjs` passes a task's own `env` to its command only, so the new stage writes `data/reports/experience-commons.json` instead of overwriting `experience.json`. That file is ignored by Git.
  - `docs/agent-workflow.md` lists the real journeys (the old text said thirteen), the new stage and its evidence.
  - Hosted CI is unchanged: it already runs Commons as its own `preview experience (commons)` shard.
- **Regressions** (`scripts/tests/agent.test.js`):
  - "a task env applies to its own command only";
  - "the Commons journey runs in its own stage with its own report".
  - On main's code (scratch `git archive HEAD` plus the new test file): **2/2 fail**. With the change: **3/3 pass**, including the catalog test.
- **Gates:** see Results.

## Results (final, 2026-10-26 16:45Z)

### Finish line

At handoff:

- **Met:** items 1, 2 and 3 for this session's share, and item 6.
- **Item 4: met on the rerun.** The first pass, on 0b9a97c4, was a no-go; 71 commented on #587 and #638 at 15:34Z.
  - Val then chose "Fix both harness rows, rerun", in river-oaks-33's session at about 22:20Z.
  - #672 and #675 fixed the measurements.
  - 71's rerun on main cb83c7cd met #587 conditions 1–3, so the engineering gate is a **go** (#587 comment 6407077852, 2026-10-26 02:46Z).
  - This session checked that rerun's receipts itself (item 4, "Rerun").
  - Conditions 4 (Val's visual and device sign-off) and 5 (production state) stay open, and activation stays off.
- **Item 5:** this is 71's 3× lane. #662 and #663 stack on #649, which waits on Val.

1. **Ticked landing rows.** None were ticked in this session, so this session landed nothing. Through 71's and 33's own landers, nine PRs merged on fresh main, in this order: #657 (c3eae4f5), #648 (26d63a06), #650 (2da76e1f), #651 (4122fe07), #652 (7ad9ffc6), #647 (2c2f2eec), #645 (a437cbbf), #646 (15334aad), #641 (0b9a97c4, 33's own lander). After the sleep window, 71's lander merged #658 (e8207b2b at 12:16:15Z, reviewed head 48f8f511; f1's #288 half). That makes ten. The land queue was empty again at 12:17Z and at 14:41Z. After Val's rerun choice, 71's landers also merged the two harness fixes and a journey follow-up, and 71 retired each ref at its exact head: #672 (d23fc556), #675 (cb83c7cd) and #676 (cb403ba2, 2026-10-26 08:43Z). River-oaks-33 retires its own #641 ref (09ab2180) and river-oaks-destination-slice. It archived 460 evidence files to `~/worktree-backups/river-oaks/evidence/bayou-luxe-polish-20261024`, then retired the ref and worktree through the guarded prune (`retirement-OIEqPJ`) and proved restoration.
2. **Register.** Each merged task is `delivered` with `{pr, reviewedHead, merge, tree, checks}`, written by its owner, or by 71 for #650.
   - `project:check --github` went from 86 gaps (23:35Z) to 98 (02:45Z), then to 110 (12:17Z), was 108 at 14:41Z, and was 119 at 2026-10-26 16:41Z (other sessions' new evidence checkouts and tasks). This session resolved its own share: 7 refs and 5 worktrees retired. Its one remaining gap is the D12 snapshot record (`no local branch`), which clears when that detached snapshot is retired (Decision 2).
   - The rise to 98 is concurrent work:
     - 10 gaps are the sweep aliases, which became retirement debt when a3 marked its task delivered;
     - 6 are new unregistered scratch snapshots from other sessions (71's 3× lane, 3e and a8);
     - the rest are lease and head drift on PRs in flight, and the held #648/#650 releases;
     - 1 is this session's own D12 snapshot record.
   - The rise from 98 to 110 is mostly the sleep window: active leases expired on `account-safety-292-20261024` (4 branches), `convergence-3x-20261024`, `studewood-3x-20261024` and `bayou-terraces-3x-20261025`. The rest is:
     - the delivered #645/#646 refs, now pending retirement under a gone owner (Decision 3);
     - #655's head moving;
     - `garden-campus-510-verify-20261025`;
     - other sessions' new scratch snapshots.
   - This session's own new gap was `landing-steward-20261024: local and PR heads differ (#668)`. A task can record one PR, and this task held both the ledger branch and the D12 branch. At 12:25Z the D12 branch moved to its own task, `experience-commons-stage-20261024` (`pr` 660, same owner and ledger). Each branch now has exactly one task and one PR, which the guarded prune also requires.
3. **Inventory.** It went from 68 worktrees and 73 branches to 78 and 76 (02:45Z), then 86 and 76 (12:17Z), and 87 and 75 at 14:41Z. Detached checkouts went from 12 to 28. This session removed 3 worktrees and 4 refs; other sessions added more in the meantime. Every blocked candidate is listed under Gaps.
4. **Post-wave acceptance.** Running since 04:02Z on main 0b9a97c4, in river-oaks-71's `scratchpad/rc-0b9a97c4` (`rc-run.sh`: rehearsal, journeys, ABBA + pixel parity, verify full; hosted Verify run 40160333490). River-oaks-71 runs it once on the converged main: rows 2–7, 10 and 11, world-gate-587, and Heights if #649 has merged. It compares against #657's 09bd7a83 numbers using #626's protocol, and posts the single evidence comment on #587 and on #638. This session runs and posts none of it, to avoid duplicates. The host sleep (below) invalidated 71's first journey results, so 71 reran them. At 12:16Z 71 reported that its Phase 2 RC evidence is on 0b9a97c4, before #658. #658 changes touch controls, not Commons content, and 71 records that scope in its go/no-go. **Done, verdict no-go**, on RC 0b9a97c4 (main after #641; #658 came later and changes touch controls only). The verdict is in ledger #664 and comments [#587 6399590750](https://github.com/BunsDev/river-oaks/issues/587#issuecomment-6399590750) and [#638 6399591964](https://github.com/BunsDev/river-oaks/issues/638#issuecomment-6399591964), both posted 15:34Z. This session ran and posted none of it.

   - **Met, with the host awake:**
     - rehearsal 26/26 and 28/28;
     - `world-gate-587` (26 checks) and `east-garden-commons` (10 checks);
     - ABBA frame and CPU within budget;
     - `verify full` attempt 2 passed all 18 stages. Attempt 1 failed on the `land-pr` lander-wake intermittent and is kept.
   - **Failed as written:**
     - **`world-streaming` GPU bound:** textures +13 against a limit of +10. 71 first attributed it to #641, because pre-#641 15334aad passes 286/286. **71 has since withdrawn that** (message to this session, after 15:50Z):
       - An instrumented rerun on 0b9a97c4 shows the extra textures on client 0 belong to three skinned avatars. Each has a 16×16 and a 4×4 bone texture plus a morph-target array texture, first drawn after the warm-up laps.
       - Client 0 is the only tab put through the journey's two WebGL context-loss probes. Three.js resets its counters on restore, so anything not redrawn during warm-up is counted later.
       - The step is +9 to +13 depending on the baseline, and that rerun passed at +9.
       - 71 calls it a journey measurement artifact, not a leak, and is correcting #587, #638 and #664. This session has not checked the rerun itself.
     - **ABBA phone reconnect:** +44.5% against a limit of 20%. 71's leading explanation is the client's random 500–1,000 ms `retryDelay(0)`, sampled once per arm. That cause is unproven.
   - **Open:** Val's sign-off and production state.
   - **Receipts,** local to 71's session under `/private/tmp/claude-501/-Users-buns-Documents-GitHub-BunsDev-river-oaks/9c88b6de-e475-455e-844a-4de2cda13c1e/scratchpad/rc-out2-0b9a97c4/`. This session checked these SHA-256 prefixes:

     | File | SHA-256 prefix |
     | --- | --- |
     | `full-attempt2.json` (`passed` at 0b9a97c4, 18 results) | `3f3615248cbc6333` |
     | `rc-journeys-0b9a97c4.json` | `d9be195903e497b1` |
     | `compare-rc-gardens-vs-commons.json` | `ad9aa6c90379bc04` |

     The receipt records `dirty: true`. In the snapshot, only report outputs changed: the runs rewrote tracked `data/reports/experience.json` and `shared-experience.json`, and added untracked bisect and RC journey reports. The source still matches 0b9a97c4.

   **Rerun on main cb83c7cd: go for conditions 1–3** (#587 comment 6407077852; 71's ledger #664).
   - **Fixes.**
     - #672: reconnect is now the median of 5 rejoins, each waiting out the 500–1,000 ms retry delay.
     - #675: a third fixture client takes the failed import and both context-loss probes, then leaves before the two GPU-bounded clients connect.
     - Together they answer Decisions 6 (world-streaming row) and 10.
   - **This session checked these receipts read-only,** under `/private/tmp/claude-501/-Users-buns-Documents-GitHub-BunsDev-river-oaks/9c88b6de-e475-455e-844a-4de2cda13c1e/scratchpad/rc-out-cb83c7cd/`:
     - `verify-full-receipt.json`, sha256 `8502800676dbffa0`: `passed` at cb83c7cd, all 18 results passed, 01:03–02:45Z.
     - `compare-gardens-vs-commons.json`, sha256 `447ab8b7604c0d1d`: both arms are at cb83c7cd and no row is over budget. Reconnect is desktop −14.2% and phone +7.2%, against a budget of 20%. CPU p95 is +4.2% / +3.6% on desktop and +1.6% / 0.0% on phone.
     - `ws-attempt2-journey-….json`, sha256 `7babb536a6fc1f5b`: world-streaming `passed`, 290 checks, 0 resource violations.
     - The attempt-1 receipt (`journey-2026-10-26T00-17-11.347Z.json`) is kept: `failed`, "Reload 1 player 1 stalled" on a route corner. 71 attributes this to route clearance in the journey; #676 then widened the walked routes' clearance.
     - Both cb83c7cd snapshots (`rc-cb83c7cd`, `ws2-cb83c7cd`) are at cb83c7cd. Their only tracked changes are the generated `data/reports/` files.
   - **Hosted Verify** run 40247308809 passed 20 jobs with 1 skipped, after one rerun of the failed `preview shared (development)` job. Its first attempt failed only on the recurring `crime-shared` timing flake, and that log is kept. This session did not open that run.
   - **Not covered.** #638 has no separate rerun note; 71's #638 comment from 15:34Z covers the first pass. #676 merged after the rerun and changes only the world-streaming journey's routes.
5. **3× lane.** River-oaks-71 took it (23:47Z): #662 (Studewood 2.46×) and #663 (Terraces 2.82×), stacked on #649. This session did no 3× work.
6. **Decisions for Val.** Below.

**Host sleep, 2026-10-25 05:03–09:05Z.** `pmset -g log` shows idle sleep at 00:03 local time, then maintenance sleeps with dark wakes until 04:05 local. Browser and timing evidence collected in that window is invalid; this includes 71's first post-wave RC journey results on 0b9a97c4 and 3e's round-3 ABBA for #649. River-oaks-71 then started a bounded `caffeinate -ims -t 21600` (its own PID, until about 15:07Z). None of this session's evidence falls in that window: core 23:45–23:51Z, D12 stage 23:52–02:38Z, tooling 02:42–02:47Z, retirements 23:41–04:03Z.

### D12 (#660)

| Check | Head | Result |
| --- | --- | --- |
| New regressions on main's code | 1fd53fb9 + test | 2/2 fail |
| New regressions plus catalog test | working tree | 3/3 pass |
| `pnpm run verify` (core), 23:45–23:51Z, load 19–34 | 1fd53fb9 + D12 diff (= ea7b8ca1 tree) | passed: tooling 276/276, preview 4,089 + 1 skip, server 889 + 225 Redis skips, desktop 115 + 3 skips, Python 170, build, demo, demo-verify, secrets |
| Hosted | ea7b8ca1 | 22/22, aggregate `preview` green |
| `build` + `experience-commons` through the queue, clean snapshot | ea7b8ca1 | passed. Commons 237,394 ms (deadline 600,000), queue 9,714,978 ms. Report ignored, tracked `experience.json` untouched (comment 6392552786) |

Ledger branch gate (`docs/landing-steward-20261024` on main 7ad9ffc6, docs only):

- `pnpm run verify tooling` **failed twice**: 273/274 at 02:42Z and again at 02:44–02:46Z, load 11–27. Both times it was `scripts/tests/land-pr.test.js:122`, "a queued lander wakes on release without waiting for the fallback…", which hit its 30 s fallback.
- That test passed 3/3 alone and the whole file passed 29/29 twice alone. `plans-index.test.js` passed 2/2.
- A third full run at 02:47Z, load 20–26, **passed 274/274**.
- No script changed between 1fd53fb9, where core's tooling stage passed 276/276 with the D12 tests, and 7ad9ffc6. This matches the documented core/tooling timing intermittent; its cause is unproven.
- First-failure logs: `scratchpad/tooling-ledger-first-failure.{log,json}`, `tooling-ledger-2.log`.
- Later ledger commits: 274/274 at 12:19Z (220cbd14 content). For the handoff edit, the same test failed once more, 273/274 at 14:43Z, load 5–8 (`scratchpad/tooling-ledger-5.{log,json}`). The test file plus `plans-index.test.js` then passed 31/31 alone, and the full profile passed 274/274 at 14:45Z (`tooling-ledger-6.log`).
- The edit correcting world-streaming hit the same test twice: 273/274 at about 16:55Z (`tooling-ledger-9.log`, `-10.{log,json}`). The test file plus `plans-index.test.js` then passed 31/31 alone, and the full profile passed 274/274 at 16:59Z (`tooling-ledger-11.log`).

Not run on #660: the 16-journey `experience` stage and the remaining browser and full stages. Receipts: `~/worktree-backups/river-oaks/evidence-landing-steward-20261024/d12-snapshot/` (SHA256SUMS).

### Retirements by this session

| Ref | Head | PR → merge | Worktree | Archive |
| --- | --- | --- | --- | --- |
| fix/studio-preview-software-shadows-20261024 | 43e6380c (exact head) | #642 → df6231cb | none | retirement-Gqav1Y |
| fix/cafe-journey-on-request-20261024 | 62105c2e (behind tip) | #644 → 269a7ed5 | river-oaks-pr-sweep-2 | retirement-2pPJc0, evidence pr-sweep-2/ |
| fix/desktop-macos-e2e-371-20261024 | d0be556f (behind tip) | #651 → 4122fe07 | river-oaks-desktop-macos-e2e | retirement-T00qVG, evidence desktop-macos-e2e/ |
| ci/desktop-electron-cache-371-20261024 | 04228bec (behind tip) | #652 → 7ad9ffc6 | river-oaks-desktop-electron-cache | retirement-M02i7C, evidence desktop-electron-cache/ |
| feat/garden-campus-510-20261024 | 0918a012 (exact head) | #647 → 2c2f2eec | river-oaks-campus-510 | retirement-8tYXT0, evidence campus-510/ (193 files) |
| docs/campus-readiness-ledger-512-20261024 | 85d66e97 (behind tip) | #648 → 26d63a06 | river-oaks-readiness-ledger-512 | retirement-SQgtF0, evidence readiness-ledger-512/ (220 files) |
| feat/touch-network-288-20261024 | 4d870774 (behind tip of the lander's update-branch head 48f8f511) | #658 → e8207b2b | none | retirement-i15gPN, bundle sha256 `8ea3132e…` (12:20:41Z; f1 released at 12:18:58Z) |

Each one had a fresh exact-head owner release with a session review, archived ignored evidence (verified by extraction), a dry run with no blockers, then `--apply` from `origin/main` tooling. Afterwards the local ref and the worktree registration were confirmed absent. GitHub's `delete_branch_on_merge` had already removed each PR's head branch on origin; this session deleted no remote ref.

## Gaps

| Candidate | Blocker | Owner | Next action |
| --- | --- | --- | --- |
| `sweep/pr489`, `pr504`, `pr569`, `pr571`, `pr572`, `pr575`, `pr623`, `pr626`, `pr628`, `pr630`; worktrees river-oaks-pr-sweep-3, -pr489, -pr569, -pr572, -pr623 | `exact-merged-pr-required`: an alias name differs from its PR's head ref. Every tip is already on `main` and is an ancestor of its merged PR head, so nothing is unique | Released by a3; needs Val | Decision 2 |
| Detached `river-oaks-pr-sweep` (e17fd94d, on `main`) | Detached; holds a3's untracked sweep ledger and two café reports | Released by a3; needs Val | Untracked files are already archived to `evidence-landing-steward-20261024/pr-sweep-untracked/` (3/3 OK). Decision 2 |
| `fix/campus-readiness-512-20261021` (a35214f3), worktree river-oaks-campus-readiness-512 | Owner keeps it pending Val's cancel decision | river-oaks-bc | Val: `project:cancel` or `--cancel-stale` for that exact head |
| `test/screening-s1-postmerge-498-20261024` (432c649f, #650), worktree river-oaks-s1-postmerge-498 | Owner session river-oaks-56 is gone; no exact-head release is possible | Val | Decision 3 |
| `test/mvp-regression-20261023` (16eff1a0, #619) | Not released by `codex:mvp-regression-20261023`; its worktree now holds `fix/movement-pad-contrast-20261024` | Codex owner | Original owner releases both refs |
| Detached `river-oaks-campus-510-review` (2586c39a, an ancestor of #647's merged head); only untracked item is a dangling `node_modules` symlink | Detached; needs `--cancel-stale` | Released by a8; needs Val | Decision 2 (add `--detached-path /Users/buns/Documents/GitHub/BunsDev/river-oaks-campus-510-review`) |
| `fix/locomotion-handoff-637-20261024` (7e267038, #645 → a437cbbf), worktree river-oaks-locomotion-637, plus detached `scratchpad/baseline-637` and `inc2-tree` of session 728d6f06 | Owner `claude:onfoot-637-640-728d6f06` is gone; no exact-head release is possible | Val | Decision 3 |
| `feat/onfoot-encounter-640-20261024` (65c01116, #646 → 15334aad), `feat/onfoot-presentation-640-20261024` (85e202db, stopped by the user; one untracked test), worktrees river-oaks-onfoot-640 and river-oaks-onfoot-presentation-640 | Same gone owner. The presentation branch is unfinished distinct work and must be preserved | Val | Decision 3 for the encounter ref. The presentation lane needs Val's resume or cancel decision |
| f1's detached `613f8aea…/scratchpad/baseline-288` (4d870774; ignored reports and receipts only) | Detached; needs `--cancel-stale` | Released by f1; needs Val | Decision 2 (add `--detached-path` for it). The lane worktree river-oaks-touch-network-288 holds #659's `fix/network-drops-290-20261024` (task `network-drops-290-20261024`, held for Val) and stays |
| This session's D12 snapshot (`scratchpad/d12-snapshot`, detached at pushed ea7b8ca1) | Own checkout, not yet stale; direct removal is not allowed | e9 | `project:prune --cancel-stale --detached-path` once it is 12 h untouched, if Val authorizes; it holds no distinct work |

Unreachable owners: messages to river-oaks-91 (#649) and river-oaks-3e (#655, #649 step D), from this session at about 02:50Z and from 71 earlier, were held and expired unapproved, most likely because the permission modes differ. Coordination for #649 and #655 goes through their register entries, which 71 watches.

#655 (river-oaks-3e) stays out of the landing train. An independent review by 71 at 22679471 confirmed two defects (PR comment 6393101060):

- A Commons→Gardens rollback leaves residents walking toward the Commons frozen at the seam. The migration resets only residents already in removed land, and `recoverRoute` restores their stale route.
- A player-placed object on a seam lane leaves eastbound residents pacing without crossing, because the lanes are computed once.

3e can't be reached by cross-session message from 71 or from this session; the PR comment is the channel.

#649 (river-oaks-91, Bayou Heights 2.01×) now has its evidence; only merge authorization is missing (comment 6396682443, 10:47Z):

- Its first ABBA failed one-client CPU p95 (+24.0% desktop, +18.1% phone), and fix dd682a7b followed.
- The branch was then merged with `main` (0cc09391).
- 3e's round 3, main 0b9a97c4 against 0cc09391, ran under `caffeinate` from 09:54 to 10:24Z with no sleep or wake event, and met every gated limit. The worst case was desktop two-client CPU p95 at +1.0%. Round 3's first attempt fell in the sleep window and is kept as an invalid first failure.
- Head 4c3fddc3 passed hosted Verify 16/16 (run 40184892076), including `preview experience (heights)`.
- It is a draft, and since #658 it is behind `main` again. At 14:35Z 91 was merging e8207b2b into it, which has no file overlap with #658. After that come core verify, the Redis suites, hosted Verify, and a round-4 ABBA plus cold transfer by 3e on the new pair.

Detached comparison checkouts left alone: 6ff47ba1 (two-player/base-build), d1a5b48b (probe merge), 059a16a6 (streaming F1 review), 2288374f (fidelity timing), the 517 trial/verify/baseline snapshots (river-oaks-32), and the new scratch snapshots of 71, 3e and a8. Each belongs to its recorded or session owner.

## Decisions for Val

1. **#660 (D12, task `experience-commons-stage-20261024`).** Hosted 22/22, core passed, local Commons stage passed. Tick it to land through `pnpm run land 660 --owner <session>`, or leave it for review. On 2026-10-26 it is behind main but merges cleanly (`git merge-tree` against cb403ba2); it needs an update from main and fresh hosted checks before it lands.
2. **The ten sweep aliases and detached `river-oaks-pr-sweep`.** Each needs either an authorized cancel or a guard extension.
   - **Cancel.** Authorize, for example, `pnpm run project:prune --cancel-stale --branch sweep/pr489 --expected-head a4ca4cdf6bb7b59e6ab413dfd6a010b827a98347 --apply`, and the same for:
     - pr504 350290dc…
     - pr569 170dfd7e…
     - pr571 33cb9db9…
     - pr572 13a5df57…
     - pr575 1e03d9b0…
     - pr623 6bdc0d48…
     - pr626 ee6b7a15…
     - pr628 fdf09a99…
     - pr630 a286f833…

     and `--detached-path /Users/buns/Documents/GitHub/BunsDev/river-oaks-pr-sweep`. These tips are already on `main`, and the tool archives and restore-tests each one first. They become eligible once they're 12 h untouched (a3's last activity was about 19:10Z on 10-24).
   - **Guard extension.** Alternatively, approve a guard change that accepts an alias tip already on the default branch when the task names its PR.
   - The same `--cancel-stale --detached-path` decision covers the released detached checkouts `/Users/buns/Documents/GitHub/BunsDev/river-oaks-campus-510-review` (a8) and f1's `…/613f8aea-2db9-4bac-9c06-8257adaa8ba5/scratchpad/baseline-288` (expected head 4d87077436de45a3d31196d2f40df05d7d07d24b).
3. **Checkouts whose owner session is gone.** Release on the owner's behalf, or authorize `--cancel-stale`:
   - #650: `test/screening-s1-postmerge-498-20261024` at 432c649f (river-oaks-56);
   - #645: `fix/locomotion-handoff-637-20261024` at 7e267038 (onfoot-637-640);
   - #646: `feat/onfoot-encounter-640-20261024` at 65c01116.

   Separately, decide whether `feat/onfoot-presentation-640-20261024` (85e202db, unfinished) resumes or is cancelled.
4. **#653.** The core-dump trade-off.
5. **#654.** The #373 version, #372 decisions, Azure setup and #370 identity confirmations.
6. **#641.** Val's call in a3's session was "request changes". River-oaks-33 queued its own lander at 00:38Z; confirm the rework was approved. *World-streaming row: answered.* Val chose "Fix both harness rows, rerun", #675 merged, and the rerun passed (Results item 4). The text below is the record from before that. 71 first attributed the `world-streaming` row-10 texture failure to #641. It has since withdrawn that: the extra textures are avatar textures first drawn after the context-loss probes reset Three.js's counters (Results item 4). Decide whether the journey's measurement is fixed, for example by redrawing the avatars during warm-up or taking the baseline after the probes, before that row is judged. This session changes no budget.
7. **D4.** Commons visual, keyboard/screen-reader and target-device sign-off, then an operator's read-only production-state check before any activation under `docs/world-expansion-activation.md`. Activation is outside this goal.
8. **#649.** The six finish-line items and round 3 of the ABBA are complete, and #638 comment 6399775462 (15:51Z) reports the gate met again on the next pair, 525856e2. Decide whether it lands. On 2026-10-26 it is three harness merges behind main, according to 71's register entry. If it does, it needs an update from `main` (behind after #658) and then a green hosted run before `pnpm run land`. Its stacked 3× PRs #662 and #663 follow it.
9. **71's landing authority.** River-oaks-71 landed #648, #650, #651 and #652 on the authorization it recorded from its own session: "proceed with all of the above e2e through to full completion". It has since also landed #647, #645, #646, #658, and after your rerun choice, #672, #675 and #676. Confirm that matches your intent, including for #649.
10. **Phone reconnect row.** *Answered:* Val chose "Fix both harness rows, rerun". #672 merged, and the rerun reads phone reconnect at +7.2% (Results item 4). The record from before that: ABBA measured +44.5% against the 20% limit on RC 0b9a97c4. Decide whether to investigate it as a regression, or to have the protocol control or repeat-sample the client's random `retryDelay(0)` before the row is judged. No limit was changed. 71 is drafting an opt-in harness option for this (`--reconnects=5 --reconnect-backoff=skip`). Its smoke run on main measured desktop 197–247 ms (median 216) and phone 67–185 ms (median 68).

    This session checked these facts read-only:
    - In `compare-rc-gardens-vs-commons.json`, both arms are the same head 0b9a97c4, so the rows compare Gardens with Commons on one build.
    - The phone row is 742 → 1,073 ms (+44.5%), the only row over its limit. In the same run, desktop reconnect moved 1,153 → 938 ms (−18.7%).
    - `retryDelay(0)` in `preview/src/connection-policy.js` returns `round(500 + random() × 500)` ms. That uniform 500 ms span alone can account for the 331 ms phone difference when each arm is sampled once.
    - Neither `connection-policy.js` nor `multiplayer-client.js` changed between 15334aad and 0b9a97c4.

    This fits 71's noise explanation but does not prove it. A seeded `random` in the harness, or several samples per arm, would settle it.

## Next action

This session handed off at 2026-10-25 14:45Z, recorded the first post-wave verdict at 15:50Z, and recorded the rerun on 2026-10-26 at 16:45Z.

- **Post-wave pass:** met on the rerun. The engineering gate is a go on cb83c7cd (Results item 4). Activation still needs Decision 7 (conditions 4 and 5).
- **Val:** Decisions 1–5 and 7–9 are open. The world-streaming half of Decision 6 is answered; confirming #641's rework is still open. Decision 10 is answered.
  - Landing #660 (Decision 1) requires a ticked row and a lander. After it merges, `fix/experience-commons-stage-20261024` is released at its exact head and retired through the guarded prune.
  - The cancel decisions (Decisions 2 and 3) unblock the remaining retirements in the Gaps table.
- **#649** lands only on Val's authorization (Decision 8). Its ref then needs 91's exact-head release.
- **Register:**
  - `landing-steward-20261024` and `experience-commons-stage-20261024` are `blocked` on Val with owner e9.
  - `landing-steward-d12-snapshot-20261024` is `blocked` on Decision 2.
  - None of the three holds a running process or uncommitted edit.
