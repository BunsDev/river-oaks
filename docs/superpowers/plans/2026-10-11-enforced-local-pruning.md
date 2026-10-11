# Enforced local pruning

Objective: executable fail-closed local retirement, with dry-run default and restore-tested backups.

Branch: `chore/enforced-local-pruning`. Reused owned ride-shortcuts checkout; no new worktree created.

## Implementation

- `scripts/project-prune.mjs`: exact-head, released session ownership, GitHub merge/tree proof, activity, clean/ignored/index/operation checks; shared lock; external bundle restored into bare Git and fsck verified; fresh checks before nonforced removal and expected-SHA deletion; external receipt and primary task reconciliation.
- `scripts/project-ref-guard.mjs`, shared hook installer and reference-transaction hook: protect local branch deletion and archive tags; short exact-SHA permit only after verification; installation shared across existing checkouts and preserves custom hook paths.
- Package bootstrap, lifecycle workflow, root instructions and retirement skill use guarded entry point.
- Real Git fixtures cover normal retirement and restoring the bundle; refusal for ownership, unknown activity, dirty/ignored data, locks, open/mismatched PRs, changed heads, branch switching during retirement, hidden index edits, custom hooks, and malformed/expired permits.

## Evidence

- Red/green fixture regressions reproduced the branch-switch and hidden-index deletion hazards before their fixes.
- `pnpm run agent:doctor`: passed prerequisites.
- `pnpm run agent:list`: catalog inspected.
- `pnpm run verify`: passed all 11 core tasks; `.runtime/agent/core.json` and `.runtime/pruning-core-final.log`.
- Tooling: 38 passed, 0 skipped. Preview: 2594 passed, 1 skipped. Server: 317 passed, 107 skipped (core excludes Redis). Desktop: 36 passed. Python: 141 passed, 66 dependency warnings. Build, lint, format and secret check passed. Demo verification expected domain exit 2 passed profile contract.
- Independent reviewer: two P1 findings fixed and reproduced with regression tests; follow-up no actionable findings.
- `sh scripts/install-hooks.sh`: installed shared guards at the common Git directory. `core.hooksPath` points there.
- Live dry run on `feat/map-ui-readability` at `da23a2c1a3fbed97a1e409eaa73c7e7d88b46a9b`: preserved for missing fresh session release, ignored evidence and source-branch/PR mismatch.
- Initial inventory: 25 worktrees. Later: 24 worktrees / 25 local branches after another owner independently retired its dependency checkout. This task removed no real refs/worktrees.

## Limits and next step

Git cannot intercept raw worktree removal or registration pruning; agents must use the supported command. Hooks prevent accidental ref deletion, not intentional configuration overrides. Older bootstrap scripts can override hooksPath. Unknown ownership, ignored evidence, submodules and differing aggregate trees require reconciliation. Task register is advisory coordination; the common lock serializes this tool, not arbitrary noncooperating Git/filesystem writers.

No browser, Redis, native or live-auth checks added for this local tooling change. Hosted CI and delivery remain pending. Preserve this checkout and all task archives until exact delivery and retirement proof are recorded.
