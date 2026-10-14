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
