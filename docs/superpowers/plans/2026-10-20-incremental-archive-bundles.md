# Archive bundles that build on the default branch

Task `incremental-archive-bundles-20261020`, branch
`fix/incremental-archive-bundles-20261020`, worktree
`../river-oaks-incremental-archives-20261020`, owner `claude:coven-cave (8c46d570)`.

## Why

Every `project:prune` and `project:cancel` archive ran `git bundle create <bundle> <tag>`
with no exclusions, so each bundle carried the repository's whole history (418 MB on
2026-10-20), and `restore.git` kept a second full copy (419 MB). A one-commit docs
branch cost about 0.8 GB. Retirement only accepts a tip whose merge is already on the
default branch, so nearly all of that duplicated `main`.

On 2026-10-20, 32 runs between 07:00Z and 09:00Z wrote 22.6 GB to
`~/worktree-backups/river-oaks/` and left the machine with about 1 GB free. The
folder held 80 archives and 40 GB, and the Trash held 82 GB of earlier ones.

## Change

- `archiveTip` in `scripts/project-prune.mjs` is now the single archive step for
  retirement, stale cancellation and detached cancellation.
  - It bundles `<tag> ^<origin default branch>`.
  - A tip already on that branch bundles `<tag> ^<its parents>`, which is just its own
    commit.
  - Without a default-branch ref the bundle stays self-contained.
  - The manifest records `prerequisites` (the bundle's boundary commits) and
    `base: {ref, head}`.
- `restoreTest` restores into a fresh bare `restore.git`.
  - When the bundle has prerequisites, `restore.git` borrows them through
    `objects/info/alternates` pointing at the common Git directory's objects.
  - It uses `git bundle unbundle`, not `git fetch`. With alternates, a fetch sees the
    tip is already reachable and never reads the pack, so a corrupt bundle passed
    (checked by hand and by the new regression test, which fails against a
    fetch-based copy).
  - `git fsck --full` still runs, now over the borrowed objects as well.
- Docs: `docs/project-management/workflow.md` (safe retirement, restore and apply
  sections) and the `worktree-retirement` skill no longer promise a self-contained
  bundle. Restoring a new archive needs a checkout that has the default branch.

Existing archives are untouched. `project:archives` reads both shapes unchanged.

## Checks

- `node --test scripts/tests/project-prune.test.js scripts/tests/project-prune-cancel.test.js scripts/tests/project-archives.test.js`:
  27 passed. New cases cover these:
  - a squash-delivered tip that builds on the default branch;
  - a tip already on the default branch, which holds 3 objects of its own;
  - no default-branch ref, which stays self-contained and restores into an empty
    repository;
  - a corrupt pack that alternates would hide;
  - cancellation;
  - an incremental archive verifying under `project:archives --fsck`.
- Real repository, via a `--shared` scratch clone (no tags added to the real repo):
  - c8f87c83 (merged docs branch): a 2 KB bundle and a 116 KB archive directory, 7.5 s
    including fsck.
  - dd23161f (unmerged, the cancellation case): a 9 KB bundle and 356 KB, 5.5 s.
- `pnpm run verify tooling`: 168 passed, 0 failed.
- Not run locally: the core gate (`pnpm run verify`, which includes the web build and
  the Python suites). This change touches only the tooling scripts; hosted Verify
  covers the rest.

## Gaps and next step

- Each `project:cancel` still tars the whole local worktree, up to 2.1 GB. That policy
  is unchanged here.
- Removing or consolidating the existing 40 GB of archives is out of scope, and is the
  maintainer's decision.
- Next: open the PR, then let the maintainer review and land it.
