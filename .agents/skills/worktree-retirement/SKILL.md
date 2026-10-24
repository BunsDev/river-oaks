---
name: worktree-retirement
description: Reduce River Oaks local worktrees and branches after proving delivery or redundancy, preserving unfinished work and restore-tested archives; use for an authorized cleanup round, not routine code editing.
---

# River Oaks worktree retirement

Read `docs/project-management/workflow.md`, the task register, and the current
retirement manifest. Start with `git status --short`, `git worktree list --porcelain`,
a fresh non-pruning fetch, and `node scripts/project-status.mjs --github`. The command
only recommends review; it does not check every deletion precondition.

An explicit local cleanup request authorizes proven redundant local retirement.
Audit-only requests do not. Remote deletion and discarding distinct work require
explicit scope approval. Never repeatedly ask approval already supplied by the user.

For each candidate, record the full ref/SHA, path, task, PR reviewed head/merge SHA,
complete aggregate-patch comparison, ownership/activity checks, and ignored-file
inventory. Preserve dirty, locked, primary/default, active, open-PR and uncertain
work. Check running session ownership as well as process CWDs; no CWD match is not
inactivity proof. Missing upstreams and timestamps do not prove redundancy.

For squash/rebase/supersession, require every candidate change to be accounted for
by the reviewed delivered result. Archive its exact tip under a unique local tag;
create a bundle outside all removal targets. It may leave out commits already on
origin's default branch. Restore all refs into a fresh bare repository that can reach
those commits, compare SHAs, and run `git fsck --full`. Preserve restricted
local evidence archives, verified by hashes, separately from disposable generated
caches. Do not print secrets, follow dependency symlinks for deletion, or overwrite
archives. Keep restore commands and checksums in the manifest.

Use `pnpm run project:prune --branch <branch> --expected-head <full-sha>` for a
fresh dry run, and add `--apply` only for the authorized candidate. The command
reads the primary task register, requires a fresh exact-head session release,
restore-tests its own backup, rechecks each mutation and records postconditions.
Run from a checkout outside the removal target. Reconcile blockers; never bypass
the reference-transaction hook or directly remove a worktree to evade checks.

The automated path intentionally preserves aggregate-tree mismatches, ignored
material, submodules and hidden-index flags. Retain local evidence separately and
resolve the precise blocker before rerunning; do not suppress a guard merely
because a branch has a merged PR. Existing archives remain protected.

Record each removal/skip and verify its postconditions. Recount live state, including
concurrent new worktrees. Mark only the removed task refs retired; keep dirty or
pending tasks with specific next actions. Preserve archives and report their restore
location. Do not promise global consolidation while known unfinished work remains.
