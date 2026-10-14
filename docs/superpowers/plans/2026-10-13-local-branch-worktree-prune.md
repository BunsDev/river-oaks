# Local branch and worktree pruning, 2026-10-13

Objective: reduce the River Oaks local worktrees and branches to at most ten each, using the exact-head retirement workflow while preserving active and distinct work.

Owned files: this ledger and the primary checkout's live `docs/project-management/tasks.json` retirement records for the candidates handled here.

Starting inventory: 25 worktrees, 29 branches. Refreshed `origin` without pruning and ran `node scripts/project-status.mjs --github`. The primary register was already modified by other sessions; preserve its live state.

Completed this round:

- `feat/office-elevator-access-20261013` at `3cdc45a91b7dcad603ea41685658bac309ec401a`: archived and hash-verified 69 local evidence files at `/Users/buns/worktree-backups/river-oaks/local-evidence-office-elevator-20261013/manifest.json`; removed only the reviewed ignored caches/evidence after archiving. `project:prune` dry run returned `eligible: true`; `--apply` retired the branch and worktree. Restore manifest: `/Users/buns/worktree-backups/river-oaks/retirement-6VI8Pz/manifest.json`.
- `feat/office-desk-workflow-20261013` at `761fe6708ca22b22439a62d7f68df9dcf5ba9ce1`: archived and hash-verified 158 local evidence files, including its untracked experience report, at `/Users/buns/worktree-backups/river-oaks/local-evidence-office-desk-20261013/manifest.json`; cleared the reviewed report and ignored generated files. `project:prune` dry run returned `eligible: true`; `--apply` retired the branch and worktree. Restore manifest: `/Users/buns/worktree-backups/river-oaks/retirement-zLl9TV/manifest.json`.

Verification: both `project:prune --apply` calls reported `status: retired` after bundle restoration and exact-head checks; both local evidence archive checksums still match. `project:check --github` reported 21 existing reconciliation gaps. A final live count observed 24 worktrees and 27 branches, reflecting concurrent work during the sweep. The goal remains open.

Other inspected blockers: `feat/studio-spaces-20261013` has a modified ledger and untracked reports; `fix/route-waypoint-clearance-20261012` and `feat/workplace-slice-20261011` fail the exact merged PR requirement; `fix/workplace-room-envelope` also lacks a merge on default. Open-PR, dirty, active and ambiguous worktrees remain in place.

Next action: refresh live inventory and ownership, then review the remaining delivered clean candidates with full PR/tree evidence. Do not treat an expired lease, old branch, or a saved archive as authority to discard distinct work. Preserve this ledger and all restore archives.

## Continuation inventory

Fresh `git fetch origin`, `git worktree list --porcelain`, local status, and `project-status --github` still show 24 worktrees and 27 branches after another agent created `feat/plaza-darts-20261013`. The restricted machine-readable snapshot is `/Users/buns/worktree-backups/river-oaks/audit-20261013T1900Z.json`. Sixteen worktrees have tracked or untracked changes. The eight clean worktrees include primary/main, active process ownership, open PR ownership, a blocked live acceptance task, a delivered squash case needing full aggregate review, and a superseded PR branch needing exact delivery proof. No additional clean exact-head retirement is currently eligible.

The requested cap requires removal of at least 14 current worktrees and 17 current branches. That cannot be reached through the remaining proven redundant local candidates alone. Distinct unfinished work requires a specific cancellation or migration decision and exact preservation checks; the audit records the refs and current status for that decision.

Latest continuation: refreshed `origin`, local refs, worktree registration and `project-status --github` again. Counts remain 24 worktrees and 27 branches. `feat/workplace-slice-20261011` is an ancestor of main but the guarded `project:prune` path still requires an exact merged PR head; no other `review-retirement` branch appeared. The pending decision is which specific unfinished branches/tasks may be cancelled and removed after preserving local changes. No additional worktree or branch was removed in this continuation.

## Authorized 12-hour cancellation round

Val authorized cancellation based on branches untouched for at least 12 hours. The cutoff was checked against local ref reflogs, all worktree file and directory times, task updates, PR updates, and live process CWDs. Remote branches and PRs were not changed. `project:prune --cancel-stale` was added to enforce that scope through the installed ref guard, with full local-file and exact-tip Git archives restored and checked before non-forced removal. Detached comparison worktrees use the same archive path without deleting a branch ref. The archive helper preserves external symlinks as links and restores hardlinks and file modes. A verified partial receipt can resume if Git leaves nested ignored repository data after its first clean.

Sixteen cancellation receipts (14 branch refs, two detached worktrees) were independently checked against bundle and local-file SHA-256 hashes, archive tag SHAs, and removed path/ref postconditions. Every check passed. Machine-readable results: `/Users/buns/worktree-backups/river-oaks/audit-12h-cancellations-20261013.json`. The World Studio partial cleanup was resumed from `/Users/buns/worktree-backups/river-oaks/cancel-stale-x3cl44/manifest.json` after verifying its nested `.runtime` data. Earlier failed archive attempts remain protected; their source worktrees were untouched until a successful archived run.

Focused pruning tests passed 18/18. The first core `pnpm run verify` reached Python lint and found formatting in the new snapshot helper; that formatting was fixed and the second core run passed. `project:check --github` still reports unrelated reconciliation gaps; its register validation succeeds. A live count at 2026-10-13 19:52 UTC was 14 worktrees and 15 branches, including work created concurrently by other sessions. Every remaining branch and detached worktree had a touch within the previous 12 hours; the earliest currently known next eligibility is the unattached `diag/intro-race-20261013` ref at 2026-10-13 20:51:47 UTC, subject to fresh review. The ten-and-ten goal remains open.

After the final activity recheck was added, the core `pnpm run verify` passed again; `git diff --check` also passed. A final recount at 2026-10-13 19:55 UTC observed 13 worktrees and 14 branches after concurrent work changed the inventory again. This is still above the requested cap; recheck the 12-hour rule before any further cancellation.

## Authorized six-hour batch

Val authorized a new six-hour cutoff. `project:prune --cancel-stale --stale-hours 6` now enforces it; the default remains 12 hours. At 2026-10-13 20:33 UTC, the live evidence check found only `diag/email-join-20261013`, `diag/intro-race-20261013`, and `docs/storybook-decisions` eligible. Newer file/task/PR activity or live process/operation blockers excluded all other refs and the detached comparison checkout.

All three passed separate dry runs and were locally cancelled through the guarded apply path. Restore manifests are `/Users/buns/worktree-backups/river-oaks/cancel-stale-join2g/manifest.json`, `/Users/buns/worktree-backups/river-oaks/cancel-stale-NfyTGn/manifest.json`, and `/Users/buns/worktree-backups/river-oaks/cancel-stale-7cF5pk/manifest.json`. An independent postflight checked each bundle hash, archive tag at exact head, removed local ref/path, and the Storybook local tar hash; all passed. Remote PRs and branches were untouched. Focused prune tests passed 19/19. `pnpm run verify` passed the core gate with receipt `.runtime/agent/core.json`; `git diff --check` passed. `project:check --github` validated the register but reported five live gaps unrelated to these three cancellations: two expired leases, one divergent PR/local head, one pending Studio retirement, and a newly unregistered branch. At 2026-10-13 20:38 UTC, concurrent creation left 14 worktrees and 13 branches. The goal remains open; refresh before selecting another candidate.

## 2026-10-14: tooling round and one retirement (claude-code 69cb4235)

Pickup: the `--cancel-stale` implementation, this ledger and the 2026-10-13 docs
edits above were never committed. They sat in a GitHub Desktop stash of the primary
checkout until 2026-10-14 18:51 UTC, when something popped that stash back into the
primary's working tree (all seven files share one mtime). This round copies them
unchanged onto `feat/prune-tooling-20261014` so they can land, and adds the pieces
the task still lacked. The primary's working tree was not reset or cleaned.

Starting counts (2026-10-14 18:40 UTC, before concurrent work): 20 worktrees and
19 local branches; 18 remote branches already merged into `origin/main` and not
deleted; `delete_branch_on_merge` off; 199 entries under
`~/worktree-backups/river-oaks/`. By 19:30 UTC concurrent sessions had raised the
live count to 24 worktrees and 23 branches (`feat/shared-dominoes-*`,
`release/v0.2.0-20261014`, this branch).

Added on this branch, each with `node --test` coverage on scratch repositories:

- `project:inventory` (`scripts/project-inventory.mjs`): classifies every local
  branch and worktree against the live register, GitHub, process activity and the
  archive index; `--remote` reports merged remote branches with unexecuted delete
  commands. First real run: 1 `retire-candidate`
  (`feat/office-arrival-refinement-20261013`, blocked only by the session release
  and ignored data), 1 `orphan-no-task` (`feat/character-studio-20261013`, zero
  commits), 1 `detached` (`river-oaks-c2-tools`), 9 `open-pr`, 7 `active`,
  3 `parked`; remote: 19 `merged-exact`, 11 `open-pr`, 5 `unproven`.
- `project:check` orphan debt: unregistered detached worktrees and non-retired
  tasks whose recorded worktree path is gone are gaps; `--allow-orphans` downgrades
  only those. First real run found both orphans above plus `ipic-photo-interior`
  pointing at a sandbox path that no longer exists.
- `project:archives` (`scripts/project-archives.mjs`): read-only verification of
  the archive root. First real run: 113 ref archives and 2 evidence archives
  verified, 0 problems, 0 tasks pointing at missing archives (after handling the
  flat 2026-10-11 record shape and `~/` paths); 5 partial first-attempt receipts
  are flagged as superseded by complete archives of the same tip.
- `project:cancel` as the named alias of `project:prune --cancel-stale`.
- `pnpm run land <pr> --delete-remote-branch`, off by default, deletes the landed
  source branch only after the merge is confirmed on the default branch.
- `scripts/project-prune.mjs` refactored so retirement and cancellation share the
  archive, restore, fsck, permit and recheck path (`archiveAndRemove`).

Retired this round through the guarded path:

- `feat/office-arrival-refinement-20261013` at
  `a82becacc46ac7e689935bcc03bef4fc8584706a` (PR #345, merged as `03fd39b8`).
  Local evidence (`.runtime`, `data/generated`, `output/playwright`, 620 files)
  archived and hash-verified at
  `~/worktree-backups/river-oaks/local-evidence-office-arrival-20261013/manifest.json`;
  regenerable caches (`.venv`, `node_modules`, `dist`, `__pycache__`, lint caches)
  removed; task released with a fresh session review (no process CWD or command in
  the checkout). Dry run `eligible: true`; `--apply` returned `status: retired`,
  manifest `~/worktree-backups/river-oaks/retirement-5zZF3C/manifest.json`,
  bundle SHA-256 `755a7dc66dd2b8de9c6f99df506c28f54c37b52a095e35981010db095c6ccac9`.
  Postconditions: worktree directory gone, local ref gone, register task `retired`.

Decisions for Val:

- `feat/character-studio-20261013` (no task, no commits past `main`, clean,
  `node_modules` only) and `river-oaks-c2-tools` (detached at `3fdc842a`, no task,
  clean): cancel through `project:cancel`, or claim them? Both may belong to a
  running session; nothing was removed.
- Remote: 19 merged branches on `origin` could be deleted with the commands in the
  inventory's `--remote` output; `delete_branch_on_merge` and a default-on
  `--delete-remote-branch` remain off until authorized.
- The live register is ~3,800 lines ahead of `main`; a register sweep PR is due
  once the current owners agree.

Next action: land this branch, then rerun `project:inventory` and retire every new
`retire-eligible` branch; counts are still above ten each.

## 2026-10-14 Round 0 and 1 continuation (claude-code aa2272b7)

Worktree `../river-oaks-prune-tooling-20261014`, branch `feat/prune-tooling-20261014`
(PR #375). Task `local-prune-20261013` claimed as `claude:river-oaks-fable (aa2272b7)`.

Round 0 inventory at 2026-10-14T19:33Z (`git fetch --prune`, `git worktree list`,
`git branch -vv`, `gh pr list`, `gh issue list`, `ps`/`lsof` cwd,
`node scripts/project-inventory.mjs --remote --output .runtime/inventory-r0.json`):

- 22 worktrees, 21 branches (the 2026-10-14 baseline of 20/19 grew by two
  concurrent branches). Classes: primary 1, active 6, open-pr 10, parked 3,
  orphan-no-task 1 (`feat/character-studio-20261013`, zero commits past main),
  detached 1 (`river-oaks-c2-tools` at `3fdc842a`, orphan). 0 retire-eligible,
  0 retire-candidate: nothing can be retired through `project:prune` right now.
- Remote: 19 `merged-exact` branches (delete commands listed, none run), 13 open-pr,
  5 unproven. Archives under `~/worktree-backups/river-oaks`: 203 directories,
  92 `retirement-*`, 23 `cancel-*`, every `cancel-*` has a manifest.
- Live sessions: four other `claude` processes with cwd in the primary checkout
  (pids 7150, 23962, 37930, 39352); processes inside worktrees: a Redis server in
  `gallery-contact-shading`, DTService in `ios-probe`, node in `release-0.2.0`, a
  shell in `shared-dominoes-sheet`. No session cwd in `character-studio` or
  `c2-tools`, which is not inactivity proof.
- Open PRs: #376 release 0.2.0 (CLEAN, owned by a codex session), #375 (BEHIND
  main after #374), drafts #350–#358 CLEAN, #349 DIRTY/CONFLICTING (owned by
  `codex-root-20261014-procedural-landing`, lease live: not rebased here), #309
  UNKNOWN (dirty worktree, expired codex lease, DTService running: not touched).
- `project:check --github` on the live register: validates; gaps are the
  unregistered `feat/character-studio-20261013`, two expired codex leases
  (ios-device-feasibility, rider-performance-contact), #309 head mismatch, and two
  no-local-branch tasks (ipic-photo-interior, dependency-prs-265-266-295).
- The primary checkout still holds the stash-popped copies of `.gitignore`,
  `workflow.md`, `project-prune.mjs`, `project-status.mjs` and the three untracked
  cancel files. `git diff feat/prune-tooling-20261014 -- <files>` shows every one
  is an older subset of this branch; nothing in the primary is newer. Left in place.

Round 1 against the goal list: items 1–5 (inventory with the required classes and
both orphan flags, orphan gaps in `project:check` with `--allow-orphans`,
`project:cancel --branch --expected-head [--apply]` writing a queued
restore-before-resume task, `project:archives`, `--remote` with an unexecuted delete
list and opt-in `land --delete-remote-branch`) were already on this branch at
`021f55a2`; the docs for item 6 too. Done this round:

- Merged `origin/main` (#374) into the branch with a signed merge commit
  (`b8064c63`, `merge-tree` clean). Focused suites
  `node --test scripts/tests/{project-prune,project-prune-cancel,project-inventory,project-archives,project-status,land-pr}.test.js`:
  56 pass, 0 fail, 0 skipped. Core `pnpm run verify` at `b8064c63`: passed, 11 tasks (agent, preview, server, desktop, build, python lint/format/tests 141 passed, demo, demo-verify, secrets), receipt `.runtime/agent/core.json`, dirty false.
- Register sweep: worktree `../river-oaks-register-sweep-20261014`, branch
  `docs/register-sweep-20261014` from `origin/main`, draft PR #378. The live file
  (170 tasks) was compared with `main`'s copy (102 tasks) by id: 67 live-only, no
  committed entry newer than its live counterpart. Signed commit `d75ad58b`;
  `project:status --check --github` validates in that worktree.
- Nothing removed: no branch is retire-eligible and the orphans wait on Val.

Decisions for Val:

- The ten-and-ten cap cannot be reached by retirement alone. Thirteen open PRs
  (#309, #349–#358, #375, #376, #378) each hold a local branch, and eleven hold a
  worktree; with `main` that is already over ten branches. Options: (a) cancel the
  local checkouts of drafts #350–#358 through `project:cancel` once their tips are
  confirmed pushed (the PRs stay reviewable from `origin`; restore from the
  archive to resume), or (b) accept the cap as a target for after those drafts
  land or close. Nothing is cancelled without that answer.
- `feat/character-studio-20261013` and `river-oaks-c2-tools`: cancel or claim.
- 19 merged-exact remote branches: run the listed `gh api -X DELETE` commands, or
  enable `delete_branch_on_merge`. Report only; none run.
- The primary's stash-popped prune files: after #375 lands they can be dropped
  (`git checkout -- <four files>` and removing the three identical untracked
  files), but that is a mutation of the live checkout and is not done here.

Skips and unverified scope: Redis, browser, native, live auth. No remote branch or
repository setting changed. No merge.

## 2026-10-14 Round 2: landing, cancellations, remote deletes (claude-code c7385ac6)

Session `river-oaks-fe`, working from the primary at `06f7476b` and this sweep
worktree. Val authorized the landing, the two cancellations, the remote deletes
and the repository setting on 2026-10-14; peers `river-oaks-cd`, `-97`, `-5d` and
`-dc` were asked first and none objected.

- **#375 landed** as `06f7476b10bd7fbb22f9db7c2f158ee38934dd24` (2026-10-14T19:49:16Z)
  through `pnpm run land 375`: Verify passed on `b8064c63`, 17 hosted checks green,
  merge state `CLEAN`. Head `56b63690` (docs-only ledger commit on `b8064c63`);
  merge tree `58c60042` equals the head tree.
- **Retired** `feat/prune-tooling-20261014` at `56b6369000d303b9ebe275caf67344f92b409717`
  (by `river-oaks-5d`, 20:00:00Z): `~/worktree-backups/river-oaks/retirement-j6m3Nu/manifest.json`,
  bundle SHA-256 `cf480cc89e8520b1821978e0c124ba54c83b93759651b005b51382455ad15100`,
  evidence `~/worktree-backups/river-oaks/local-evidence-prune-tooling-20261014/manifest.json`.
  A concurrent register write from `river-oaks-fe` briefly set the task back to
  `delivered`; it was restored to `retired` at 20:01:50Z with the archive record intact.
- **Cancelled** through `project:cancel` (dry run `eligible: true`, then `--apply`,
  both `status: cancelled-local`, no process cwd inside either checkout):
  - `feat/character-studio-20261013` at `3fdc842af742d875a9ce4c78e9195cd2a1ea9273`
    (zero commits past `main`, last touch 2026-10-14T00:33Z, `--stale-hours 6`):
    `~/worktree-backups/river-oaks/cancel-stale-SwztW4/manifest.json`, bundle
    SHA-256 `b15292cc5f9f6e8ef806eead4299e86116b916be98971cda92eca71069e71310`,
    local files tar (11,677 entries) SHA-256 `8c1b56eab4fcf37b1451b8860f1f9d9b352a3bbe4a345a870c8fbcf312e996e4`.
  - detached `river-oaks-c2-tools` at the same commit (last touch 2026-10-13T23:22Z):
    `~/worktree-backups/river-oaks/cancel-detached-ZcsStq/manifest.json`, bundle
    SHA-256 `df08a20957b4e468cd48325431085a0521b712e08aae95a6856bb11b5a70ad45`,
    local files tar (1,973 entries) SHA-256 `fcc4921f6040602e1702cdcc2394a0c579d2d5801ca6f92ad1807aefaac237d6`.
- **Remote branches deleted**: the 19 `merged-exact` refs from the inventory, in one
  `git push` with `--force-with-lease=<branch>:<sha>` per ref, after writing
  `~/worktree-backups/river-oaks/remote-delete-20261014-c7385ac6/manifest.json`
  (branch, SHA, PR, merge commit, `refs/pull/<n>/head` restore command). The
  `feat/office-arrival-refinement-20261013` ref went only after its retirement
  archive (`retirement-5zZF3C`) was fetched into a scratch repository and the
  recovered commit `a82becac` reproduced tree `3eed997b`. `feat/prune-tooling-20261014`
  (56b63690, #375) followed after the local retirement above (same manifest).
- **`delete_branch_on_merge` enabled** on `BunsDev/river-oaks` (`gh api -X PATCH`),
  so landed branches no longer leave remote refs; `land --delete-remote-branch`
  stays available for repositories where the setting is off.
- **Primary checkout**: the stash-popped copies of `workflow.md`,
  `project-prune.mjs`, `project-status.mjs` and the four untracked prune files were
  backed up to `~/worktree-backups/river-oaks/primary-popped-files-20261014-c7385ac6/`
  (each held nothing newer than `main`: the untracked files were byte-identical, the
  tracked ones pre-refactor copies) and discarded; the primary was fast-forwarded
  `489a60e4..06f7476b` with the live register (174 tasks) written back by id
  afterwards. `.gitignore` and `tasks.json` were left as live edits.
- **Counts** after this round: 24 worktrees / 24 branches (primary 1, active 11,
  open-pr 9, parked 3); remote `merged-exact` 0. The ten-and-ten cap still waits
  on the procedural stack (#349–#358, Codex lease live on #349, which is `dirty`
  against `main` after #375), the three parked branches and the expired Codex
  leases listed in Round 1.
- **Register sweep**: #378 refreshed from the live file after the above, with the
  `desktop-platform-identity`, `desktop-package-matrix`, `office-ipic-baseline-360`
  and `office-ipic-engineering-baseline` entries copied as their owners wrote them.
