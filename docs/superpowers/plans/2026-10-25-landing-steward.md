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

## Results (interim, 2026-10-25 04:20Z)

### Finish line

1. **Ticked landing rows.** None were ticked in this session, so this session landed nothing. Through 71's and 33's own landers, nine PRs merged on fresh main, in this order: #657 (c3eae4f5), #648 (26d63a06), #650 (2da76e1f), #651 (4122fe07), #652 (7ad9ffc6), #647 (2c2f2eec), #645 (a437cbbf), #646 (15334aad), #641 (0b9a97c4, 33's own lander). The land queue was empty at 04:02Z. River-oaks-33 retires its own #641 ref (09ab2180) and river-oaks-destination-slice. It archived 460 evidence files to `~/worktree-backups/river-oaks/evidence/bayou-luxe-polish-20261024`, then retired the ref and worktree through the guarded prune (`retirement-OIEqPJ`) and proved restoration.
2. **Register.** Each merged task is `delivered` with `{pr, reviewedHead, merge, tree, checks}`, written by its owner, or by 71 for #650.
   - `project:check --github` went from 86 gaps (23:35Z) to 98 (02:45Z). This session resolved its own share: 6 refs and 5 worktrees retired so far.
   - The net rise is concurrent work:
     - 10 gaps are the sweep aliases, which became retirement debt when a3 marked its task delivered;
     - 6 are new unregistered scratch snapshots from other sessions (71's 3× lane, 3e and a8);
     - the rest are lease and head drift on PRs in flight, and the held #648/#650 releases;
     - 1 is this session's own D12 snapshot record.
3. **Inventory.** It went from 68 worktrees and 73 branches to 78 and 76 (02:45Z). This session removed 3 worktrees and 4 refs; other sessions added more in the meantime. Every blocked candidate is listed under Gaps.
4. **Post-wave acceptance.** Running since 04:02Z on main 0b9a97c4, in river-oaks-71's `scratchpad/rc-0b9a97c4` (`rc-run.sh`: rehearsal, journeys, ABBA + pixel parity, verify full; hosted Verify run 40160333490). River-oaks-71 runs it once on the converged main: rows 2–7, 10 and 11, world-gate-587, and Heights if #649 has merged. It compares against #657's 09bd7a83 numbers using #626's protocol, and posts the single evidence comment on #587 and on #638. This session runs and posts none of it, to avoid duplicates. Pending.
5. **3× lane.** River-oaks-71 took it (23:47Z): #662 (Studewood 2.46×) and #663 (Terraces 2.82×), stacked on #649. This session did no 3× work.
6. **Decisions for Val.** Below.

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
| This session's D12 snapshot (`scratchpad/d12-snapshot`, detached at pushed ea7b8ca1) | Own checkout, not yet stale; direct removal is not allowed | e9 | `project:prune --cancel-stale --detached-path` once it is 12 h untouched, if Val authorizes; it holds no distinct work |

Unreachable owners: messages to river-oaks-91 (#649) and river-oaks-3e (#655, #649 step D), from this session at about 02:50Z and from 71 earlier, were held and expired unapproved, most likely because the permission modes differ. Coordination for #649 and #655 goes through their register entries, which 71 watches.

#655 (river-oaks-3e) stays out of the landing train. An independent review by 71 at 22679471 confirmed two defects (PR comment 6393101060):

- A Commons→Gardens rollback leaves residents walking toward the Commons frozen at the seam. The migration resets only residents already in removed land, and `recoverRoute` restores their stale route.
- A player-placed object on a seam lane leaves eastbound residents pacing without crossing, because the lanes are computed once.

3e can't be reached by cross-session message from 71 or from this session; the PR comment is the channel.

#649 (river-oaks-91, Bayou Heights 2.01×) is not landable yet:

- It conflicts with `main` after #641; both change `preview/src/city-kit/render.js` and `preview/src/east-garden-commons.js`.
- Its first ABBA failed one-client CPU p95 (+24.0% desktop, +18.1% phone). Fix dd682a7b followed, with a fresh ABBA queued by 3e.
- 91 must merge `main` itself. Relays from 33, 71 and this session to 91 expired undelivered, and this session does not touch another owner's branch.

Detached comparison checkouts left alone: 6ff47ba1 (two-player/base-build), d1a5b48b (probe merge), 059a16a6 (streaming F1 review), 2288374f (fidelity timing), the 517 trial/verify/baseline snapshots (river-oaks-32), and the new scratch snapshots of 71, 3e and a8. Each belongs to its recorded or session owner.

## Decisions for Val

1. **#660 (D12).** Hosted 22/22, core passed, local Commons stage passed. Tick it to land through `pnpm run land 660 --owner <session>`, or leave it for review.
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
3. **Checkouts whose owner session is gone.** Release on the owner's behalf, or authorize `--cancel-stale`:
   - #650: `test/screening-s1-postmerge-498-20261024` at 432c649f (river-oaks-56);
   - #645: `fix/locomotion-handoff-637-20261024` at 7e267038 (onfoot-637-640);
   - #646: `feat/onfoot-encounter-640-20261024` at 65c01116.

   Separately, decide whether `feat/onfoot-presentation-640-20261024` (85e202db, unfinished) resumes or is cancelled.
4. **#653.** The core-dump trade-off.
5. **#654.** The #373 version, #372 decisions, Azure setup and #370 identity confirmations.
6. **#641.** Val's call in a3's session was "request changes". River-oaks-33 queued its own lander at 00:38Z; confirm the rework was approved.
7. **D4.** Commons visual, keyboard/screen-reader and target-device sign-off, then an operator's read-only production-state check before any activation under `docs/world-expansion-activation.md`. Activation is outside this goal.
8. **#649.** Tell river-oaks-91 directly to merge `main` (it conflicts with #641) and record a green head plus the fresh ABBA in its register entry. 71 lands it on that signal.
9. **71's landing authority.** River-oaks-71 landed #648, #650, #651 and #652 on the authorization it recorded from its own session: "proceed with all of the above e2e through to full completion". It has since also landed #647, #645 and #646. Confirm that matches your intent, including for #649.

## Next action

- River-oaks-71 finishes the post-wave pass on 0b9a97c4 and posts one evidence comment each on #587 and #638. Then this ledger cites its receipts and is finalised.
- #649 lands only after 91 merges `main` and the fresh ABBA passes (Decision 8). Its ref then needs 91's exact-head release.
- No retirement candidate is left that this session can retire without a Decision for Val (Gaps table).
