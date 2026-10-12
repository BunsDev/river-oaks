# Primary checkout staged-file handoff

Objective: Val asked to handle the files left staged in the primary checkout on
`main`. Give each one a home, then leave the primary holding only the live task
register.

Owner: Claude Code session `46fc41e0-26d1-4116-956a-7cac77a13769`. Task
`primary-staged-handoff-20261011`. Branch `docs/primary-ledgers-20261011` in
`/Users/buns/Documents/GitHub/BunsDev/river-oaks-primary-ledgers-20261011`, from
`origin/main` at `8c81ba5dec70f2a19859acc3b1905d9903dba431`.

## Backup

Before any change, the full primary state was saved to
`/Users/buns/worktree-backups/river-oaks-primary-staged-20261011/`: HEAD
(`8c81ba5`), the staged and unstaged patches, every staged file from both the index
and the working tree, and the template-integration runtime receipt. Restore test:
rebuilding a temporary index from HEAD plus `staged.patch` reproduced the live
index tree `5642919cda87ac0c4eb4f350f58d2b06d36632c4` exactly.

## Disposition

| Files | Origin | Disposition |
| --- | --- | --- |
| 12 starter-district template files, `docs/starter-districts.md` and its ledger | Cody's local trial integration of #242 on `main` (receipt 14:31Z) | Removed from the primary. Ten are byte-identical to #242's tip. `main.js` and `studio.css` differ only in import and block order, and the ledger is an older copy. #242 carries the reviewed versions. |
| `data/reports/template-integration-browser.json` | Evidence for that local integration | Removed from the primary; kept in the backup. |
| `unreal/Config/DefaultInput.ini` | Native input work | Removed from the primary. A byte-identical copy remains in the `cody/sdk-phase1-input` worktree, which owns it. |
| `pnpm-lock.yaml` (`@electron/osx-sign` 2.7.0 to 2.7.1) | Unowned pending lock refresh, never published | Reverted to `main`'s lockfile. The patch is in the backup. |
| Six unreviewed creative and planning drafts (Charm's story and pillars drafts, Cody's two proposals) | Never committed | Val chose to keep them out of this public repository. Moved, checksum-verified, to a private folder outside every checkout. |
| `2026-10-07-desktop-refresh.md`, `2026-10-08-typesafe-walkability.md`, `2026-10-11-dependency-prs-211-213.md`, `retirement-dependencies-20261011.json`, the delivery note in `2026-10-11-enforced-local-pruning.md` | Routine ledgers and a retirement manifest that their sessions left uncommitted | Committed unchanged in this branch. |
| `docs/project-management/tasks.json` | Live task register | Left in place. `project:prune` reads the primary's copy. |

The five committed files stay staged in the primary until this PR merges. Each
staged blob equals the version in this branch, so the next fast-forward of the
primary absorbs them without a conflict.

## Checks

This branch adds documentation only. No test reads these ledgers or the
retirement manifest, so the core suites were not rerun locally; hosted CI runs them.

- `git diff --cached --check`: clean.
- `python3 scripts/check_secrets.py --all`: no leaks (117 MB scanned).
- `gitleaks dir` with `.gitleaks.toml` on the six changed files: no leaks.
- Primary dev server on port 5173 still serves `studio.html`, `src/studio/main.js`
  and `studio.css` (HTTP 200) after the duplicates were removed. The template
  chooser is absent from the primary's dev build until #242 lands.

## Next

Open the PR and let hosted CI run. Merge after the queued Studio and workplace PRs,
so this docs change doesn't push them behind `main` again.
