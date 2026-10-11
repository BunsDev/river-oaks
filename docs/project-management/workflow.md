# Task ownership and retirement

`tasks.json` is the current task register. Dated ledgers under
`docs/superpowers/plans/` retain implementation and verification history. GitHub
is authoritative for PR state; local Git is authoritative for files and refs.
A register entry records the next action, not a substitute for either source.

## Start or resume work

1. Run `git status --short`, `git worktree list` and
   `pnpm run --silent project:status --github --output .runtime/project-status.json`.
   Create `.runtime` first when absent. This command reads Git and GitHub; it never
   fetches, checks out, edits tasks, deletes refs, or removes worktrees. Refresh
   `origin` explicitly before delivery or retirement decisions.
2. Find the existing task by branch or objective. Reuse its worktree when you own
   it and its state is understood. Do not create a second integration checkout for
   the same pending PR. Unknown ownership, dirty state or an unfinished merge means
   inspect and coordinate; it does not mean abandoned.
3. Update the register before editing: stable `id`, concrete `title`, exact
   `branches`, `owner` (session identifier), `leaseUntil`, `updatedAt`, `nextAction`,
   `ledger`, `requiredChecks`, and `filesOwned`. Keep one task owner per branch.
   An active claim is a coordination record, not a lock enforced by the tool.
   Inspect the diff again before saving because other agents may update the file.
4. Use `active` only with a named owner and a bounded lease (normally two hours).
   Renew during sustained work. An expired lease requires reconciliation; it never
   authorizes taking another session's changes. Record a handoff before transferring.

## State and evidence

| State | Meaning | Required next action |
| --- | --- | --- |
| queued | Scoped work without an active claim | Name the first concrete investigation or implementation step |
| active | Owned work in progress | Name the next check or change and renew the lease |
| blocked | Work cannot safely proceed in its current state | Record the blocker, owner needed, and exit condition |
| delivered | Requested change landed, with exact proof | Reconcile leftover worktree files before retirement |
| retired | Local branch/worktree removed after delivery proof | Keep restoration location and original SHA |

`evidence` contains PR URL/number, reviewed head, merge SHA and verification
references. A PR merely closed, a green test, branch age, a missing upstream, or
`git cherry` alone is insufficient delivery proof. A merged task with leftover
untracked evidence remains delivered but its checkout is preserved until that
material is reviewed and retained. Cancelling distinct unfinished work requires
specific discard authorization and a recorded reason; do not label it delivered.

Maintain `nextAction`, `updatedAt` and the ledger at each meaningful boundary:
claim, reproduced defect, verification, PR creation/head change, merge, handoff,
and retirement. Do not overwrite historical reports with new timestamps.

## Daily reconciliation and handoff

Run `pnpm run --silent project:check --github` at session start and handoff.
Exit 0 means the register passed validation and no tracked reconciliation gaps
were found; 1 means gaps such as unregistered branches, mismatched PR heads,
expired ownership, delivered tasks retaining local branches, or resurrected retired refs; 2 means input/tool failure.
None of these exit codes proves that the project is complete or safe to delete.
Without `--github`, remote delivery is explicitly unknown. Process CWDs are only
positive activity evidence; absence is not proof that no agent owns a task.

Address gaps by inspecting live facts, then update the register. Never suppress a
mismatch by declaring work done. For local/remote divergence, compare full changes
before choosing a revision. For multiple overlapping worktrees, designate one
integration owner and record source branches, pending merge state and validation.
Do not abort another owner's merge or cherry-pick their partial work implicitly.

At handoff report before/after worktree and branch counts, exact delivered PRs,
checks/skips, preserved tasks and their next actions. Refresh after cleanup: other
agents can create worktrees during the same round. This workflow adds no scheduler
or external PM service; run it at these explicit lifecycle boundaries.

## Safe retirement

Use the `worktree-retirement` project skill. Retirement is a separate decision
from delivery. Recheck clean tracked/untracked state, locks, active processes and
sessions, open PRs, exact refs and ignored data immediately before mutation.
Preserve primary/default, dirty, active, open-PR, missing-proof and uncertain work.

Prefer ancestry proof. For squash/rebase/supersession, compare the entire aggregate
patch against the actual merged commit, including every changed path. Preserve the
exact original ref in an archive tag and self-contained bundle outside removal
paths; restore every ref in a new bare repository and run `git fsck --full`.
Keep ignored reports/private local evidence in a restricted archive and verify its
contents. Do not print credential values or copy private state into another runtime.
Only explicitly identified regenerable dependencies/caches are disposable.

Use `project:prune` below for local removal. It performs non-forced worktree removal
and exact-SHA ref deletion only after its executable checks pass. Never bypass the
reference hook, use `branch -D`, recursively delete a worktree, or fabricate merge
ancestry. A failed safety check is a skip requiring reconciliation.

Remote branch deletion and discarding distinct unfinished work need explicit scope
approval. Local cleanup does not imply either. Preserve archive tags, bundles,
evidence and the restoration manifest; do not prune them as part of the same round.

## Restore

Read the task's `archive` manifest first. Verify its checksum, then fetch the
recorded tag from the bundle into a **new** recovery branch. Create a separate
worktree from that branch. Restore local evidence from its verified archive after
inspection; never apply private state to a live service automatically.

The 2026-10-11 round is recorded in `retirement-20261011.json`; bundles and local
artifacts live under `~/worktree-backups/river-oaks-20261011/`. The register captures
known unfinished work rather than treating this round as global task completion.

## Enforced local retirement

`project:check` exits nonzero while a delivered task retains a non-protected local branch.
Primary/default branches are excluded from retirement debt.
A blocked cleanup stays visible until its evidence is reconciled; do not relabel
the task active or retired to hide the gap.

Use `pnpm run project:prune --branch <branch> --expected-head <full-sha>` to
refresh GitHub/Git evidence and report blockers. Add `--apply` to retire that exact
local branch and its worktree. There is no bulk, force, remote-delete or age-based
mode. The command reads the **primary checkout's** task register so stale copies in
feature worktrees cannot release another owner's work.

Before applying, the task owner must release the delivered task (`owner: null`,
remove `leaseUntil`) and record `retirement: { head, releasedAt, sessionsReviewedAt }`.
Both timestamps must be within two hours. `sessionsReviewedAt` attests that the
owner actually checked running agent sessions; an expired lease or no process CWD
is not sufficient. These are coordination attestations, not authenticated locks.

The command requires the exact merged PR head, its merge on the fetched default
branch, and identical candidate/merge trees. A source branch alias is accepted only
when its full tip SHA exactly matches that merged PR head. Other squash/rebase/supersession cases
remain blocked for aggregate review. It refuses dirty/untracked/ignored material,
submodules, locks, operations in progress, active process CWDs, unknown activity,
open PRs, and missing proof. Retain ignored evidence separately first; this tool
never deletes cache directories or private files to make a checkout removable.

Apply takes a common-Git-directory lock, preserves the exact tip in a unique
archive tag, creates a self-contained bundle outside all worktrees, fetches it into
a fresh bare repository, compares the SHA and runs `git fsck --full`. It then
rechecks ownership, GitHub, activity, worktree registrations and clean state before
non-forced removal and expected-SHA ref deletion. The external manifest records
partial progress as well as success. The primary task register is updated only
after deletion postconditions pass. A multi-branch task remains delivered until
all its recorded branches have been retired.

Backups default to `~/worktree-backups/river-oaks/`; `--archive-root` must point
outside every checkout. Preserve its manifest, bundle, checksum and restore-tested
bare repository. A crash may leave `river-oaks-retirement.lock` in the common Git
directory: inspect its owner activity and external receipts before manually
reconciling it; the tool never steals a lock.

`pnpm install` (prepare) and `sh scripts/install-hooks.sh` install a shared
reference-transaction hook alongside the secret guard in the common Git directory.
All existing worktrees use that absolute hook path, independent of their revision.
Custom hook paths are preserved and require manual integration. It rejects direct local branch deletion (including `branch -D` and
`update-ref -d`) and deletion of archive tags. The guarded command grants a short
exact-ref/SHA permit only after verification. Normal commits, fetches and pushes
are unaffected. Git offers no hook for `git worktree remove` or registration pruning: use this command as
the supported removal path. Hooks are an accidental-deletion guard, not a security
boundary; an explicit hooks override (including an older bootstrap resetting hooksPath) can
bypass them. This command does not install a background cleanup scheduler.
