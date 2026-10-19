---
name: project-management
description: Reconcile River Oaks task ownership, branch and PR state, verification evidence and next actions when starting, resuming, handing off or reviewing pending project work.
---

# River Oaks project management

Read `docs/project-management/workflow.md` and the live task register
(`pnpm run --silent register show`, a file in the common Git directory that every
worktree shares; `docs/project-management/tasks.json` is only a committed snapshot),
then the relevant task ledger. Run the read-only
`node scripts/project-status.mjs --github` command from its root. If GitHub is unavailable,
record remote state as unknown; never infer delivery from a local checklist.

Use one stable task for an objective across branch/worktree changes. Record exact
branches, files owned, your session identifier, bounded claim lease, required checks,
latest evidence and a concrete next action. Update at meaningful work boundaries.
Write through `pnpm run register patch <id> --json '{...}'`, which merges your
fields under a short lock and preserves other tasks; never edit the snapshot file.
The register is a coordination record, not an enforced distributed lock. An expired
claim is a review signal.

For a new task, follow an existing register entry, give it a unique id and branch,
and create its task-specific ledger. Prefer reusing an owned clean checkout. Do not
adopt another session's dirty tree or unfinished merge without a handoff. Preserve
unknown ownership explicitly and identify what evidence would unblock it.

Separate implementation, verification, delivery and retirement. Passing tests does
not mean merged. A merged PR does not authorize throwing away local extra files.
Record stale PR-head comparisons as unresolved until full differences are reviewed.
Keep historical receipts intact and link exact revisions/scopes rather than fresh
labels. Only update a task to delivered when the requested outcome is proven.

A round ends with changed task states, actual local worktree/branch counts, delivered
PRs, verification gaps and a next action for each preserved item. For cleanup use the
project `worktree-retirement` skill; ordinary task updates do not authorize deletion,
remote branch changes, production actions, or messages to other people.
