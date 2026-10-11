# Task ownership and retirement

`tasks.json` is the current task register. Dated ledgers under
`docs/superpowers/plans/` retain implementation and verification history. GitHub
is authoritative for PR state; local Git is authoritative for files and refs.
A register entry records the next action, not a substitute for either source.

## Start or resume work

1. Run `git status --short`, `git worktree list` and
   `npm run --silent project:status -- --github --output .runtime/project-status.json`.
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

Run `npm run --silent project:check -- --github` at session start and handoff.
Exit 0 means the register passed validation and no tracked reconciliation gaps
were found; 1 means gaps such as unregistered branches, mismatched PR heads,
expired ownership, or resurrected retired refs; 2 means input/tool failure.
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

Remove a worktree with `git worktree remove` without force. Delete its local branch
only after it is no longer checked out. Use `git branch -d` when ancestry permits;
for a restore-tested archive-backed tip, use `git update-ref -d refs/heads/<branch>
<expected-full-sha>`. Never use `branch -D`, recursive worktree deletion, fabricated
merge commits, or unconditional ref deletion. A failed safety check is a skip.

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
