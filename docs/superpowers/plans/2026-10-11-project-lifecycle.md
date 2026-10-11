# Worktree reduction and project lifecycle

## Objective
Reduce River Oaks branch/worktree accumulation using delivery evidence, and install
repeatable task ownership, reconciliation and retirement methods and skills.

## Ownership
Use the clean, inactive memory-audit worktree for this task; preserve its ignored
diagnostics in place. Branch: chore/project-lifecycle-20261011. Do not alter primary
checkout changes, two in-progress merges, or active world-studio work.

## Plan
1. Inventory every registered worktree/local branch, remote PR and task ledger.
2. Classify delivered, dirty, active, blocked, and unexplained work using exact SHAs.
3. Restore-test archives, preserve ignored evidence, and retire proven delivered
   inactive worktrees/branches. Record skipped candidates with next actions.
4. Add a structured task register, a read-only reconciliation command, workflow
   instructions, and reusable project-management skills with behavioral checks.
5. Run applicable verification; reconcile final live state and hand off gaps.

## Evidence
Initial inventory: 24 worktrees, 26 local branches. External preservation directory:
/Users/buns/worktree-backups/river-oaks-20261011. Initial snapshots and process-owner
inventory recorded there; no credential contents read. Current work is in progress.

## Retirement results
- Retired 8 clean, inactive, delivered worktrees and 11 local branches. No force
  removal, dirty-tree deletion, remote branch deletion, or process termination.
- Exact archive refs restored from the self-contained bundle into a fresh bare
  repository; all 11 SHAs matched and `git fsck --full` passed. Every archived
  local evidence file was hash-compared with its source before tree removal.
- Result manifest: `docs/project-management/retirement-20261011.json`.
- Concurrent integration work created one additional worktree during this round;
  the actual count is now 17 worktrees / 17 local branches (initially 24 / 26).
  The prior memory worktree was reused without removing its ignored diagnostics.
- Dirty primary work, both integration efforts, open PRs, active world-studio,
  and all distinct uncommitted work remain preserved with next actions.

## Tooling and methods
- Added read-only Git/GitHub reconciliation, structural task validation, and drift
  detection; eight focused behavioral tests pass, including a real Git fixture.
- Full tooling suite: 25 passed, zero failures/skips. Both project skills passed
  skill-creator validation. Agent doctor passed prerequisites.
- Registered 28 current/retired tasks. Live reconciliation correctly identifies
  local/PR head differences for store-intros delivery and storybook; these remain
  open ownership/integration work, not false completion labels.
- `npm run verify`: core passed (11 checks), including 141 Python tests. Redis,
  browser, native, live auth and production acceptance are outside this local gate.
- Independent review found owner-preservation and discovered-PR mismatch reporting
  gaps; failing-first regressions reproduced both, fixes passed all 25 tooling tests,
  and follow-up review found no remaining issues. Both skills validated again.
- Live reconciliation retains two legitimate PR-head gaps (#198 and #200).
- Owner thread 01a12968 confirmed ownership of both integration branches; thread
  01a12983 owns PR198 push/merge. Register updated from blocked to active with a
  bounded lease and concrete delivery next actions. Their trees remain preserved.
- Remaining delivery: commit/push lifecycle changes, hosted CI, PR landing and final
  reconciliation. Do not treat local verification as hosted or deployment proof.
