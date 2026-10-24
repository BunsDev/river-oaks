# Task ownership and retirement

The live task register is one JSON file in the common Git directory
(`.git/river-oaks-tasks.json`, printed by `pnpm run --silent register path`). Every
worktree shares it, and claims, releases, `project:status` and `project:prune` use it.
It is changed only under a short lock, and Git never reads or writes it, so a pull,
a branch switch or a GUI client's stash cannot move it.
`docs/project-management/tasks.json` is a committed snapshot of it, updated only by
[register sweeps](#register-sweeps); feature PRs must not change it (Verify fails
them). Dated ledgers under
`docs/superpowers/plans/` retain implementation and verification history. GitHub
is authoritative for PR state; local Git is authoritative for files and refs.
A register entry records the next action, not a substitute for either source.

## Start or resume work

1. Run `git status --short`, `git worktree list` and
   `pnpm run --silent project:status --github --output .runtime/project-status.json`.
   It reads the live register from any worktree (`--tasks <file>` reads a file instead).
   Create `.runtime` first when absent. This command reads Git and GitHub; it never
   fetches, checks out, edits tasks, deletes refs, or removes worktrees. Refresh
   `origin` explicitly before delivery or retirement decisions.
2. Find the existing task by branch or objective. Reuse its worktree when you own
   it and its state is understood. Do not create a second integration checkout for
   the same pending PR. Unknown ownership, dirty state or an unfinished merge means
   inspect and coordinate; it does not mean abandoned.
3. Update the register before editing: stable `id`, concrete `title`, exact
   `branches`, `owner` (session identifier), `leaseUntil`, `updatedAt`, `nextAction`,
   `ledger`, `requiredChecks`, and `filesOwned`, with `status` (`queued`, `active`,
   `blocked`, `delivered` or `retired`). Keep one task owner per branch. Status and
   prune find a task's PR only through `pr` (a number). Delivered and retired tasks
   need `evidence`, an array of `{pr, reviewedHead, merge, tree, checks}`. Retired
   tasks also need `archive`. `deliveryPr` is informational.
   Write it with `pnpm run register patch <id> --json '{"status":"active",...}'`
   (`--create` adds a new task, `--unset leaseUntil` removes a field). The patch
   merges your fields into the current entry under the register lock, stamps
   `updatedAt`, and refuses a change that would make the register invalid.
   An active claim is a coordination record, not a lock enforced by the tool.
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

## Landing a pull request

`main` requires an up-to-date branch, so merges are serial. GitHub's merge queue
needs an organization-owned repository, so sessions on this machine share a local
queue instead:

```sh
pnpm run land <pr> [--owner <name>]   # take a turn, update, verify, merge
pnpm run land --status                # who is queued
```

- **The queue:** the queue and its lock live in the common Git directory, so every
  worktree shares them. An entry whose process has died is dropped.
- **Waiting for a turn:** directory notifications wake a waiting lander when the queue changes. Every wake rechecks the owned entry and position under the existing lock. The 30-second timer remains a fallback for missing notifications, unavailable watchers and dead processes; hosted-check polling is unchanged.
- **On its turn:** the lander updates the branch from `main` with GitHub's
  update-branch, whose commits are verified, and waits for Verify. If Verify fails
  it reruns the failed jobs once; if they fail again, it stops. Then it hands the
  merge to `~/.claude/scripts/gh-merge-when-green.sh`, or the path in
  `RIVER_OAKS_MERGE_GUARD`, and refuses if the guard is missing.
- **When main moves first:** the lander updates the branch and goes again.
- **It stops on:** a conflict with `main`, or any other refusal by the guard.

The queue only orders sessions that use it. Landing still needs the same merge
authorization as any other merge.

**Unsigned commits.** The merge guard refuses any unverified commit, and most
sessions here cannot sign locally. Before landing, run `pnpm run sign-branch
<branch>`: it lists the unverified commits and the rebuild it would make. With
`--apply` it rebuilds the branch's own changes on current `main` as one commit
through GitHub's `createCommitOnBranch` (which GitHub signs) on a temporary branch,
checks that the new tree equals `main` merged with the old head, that `main` is its
only parent and that GitHub verified it, then moves the branch with
`--force-with-lease` on the exact old head. The old head is kept at
`refs/sign-branch-backup/<branch>/<sha>` in the local repository, and the temporary
branch is always deleted. It refuses conflicts with `main` and anything other than
regular-file changes (executable bits, symlinks, submodules). The branch's commits
become one, so use it for your own branches, not someone else's history.

**Waiting on GitHub.** Every session on this machine shares one account's API
quota, and it ran out several times on 2026-10-23, stalling landing and signing. Do
not poll with `gh pr view`/`gh pr checks` loops or `gh pr checks --watch`: they
spend GraphQL points on every turn (`gh pr checks` costs 2). Use
`pnpm run pr:wait <pr>` (until merged) or `pnpm run pr:wait <pr> --until checks`
(until every check on the current head finishes; exit 1 if one failed). It polls
REST with the previous ETag, so an unchanged answer is a free 304, and it waits for
the quota reset when fewer than 200 requests remain. The lander polls the same way.

### Delivery cadence

Reduce idle time around the existing checks before adding more orchestration. The [eight-PR timing audit](../superpowers/plans/2026-10-23-delivery-lifecycle.md#timing-baseline) found a median 25.3-minute Verify span, including reruns, and 32 seconds from its last job completing to merge. Shortening the lander's 30-second polling interval cannot remove that CI work. These measurements describe their recorded revisions, not a permanent performance guarantee.

1. Before editing, identify the required local profiles, focused regressions and hosted checks from the changed scope, task instructions and current ruleset. Record the exact commands and why they are needed. Keep required coverage; a narrow pass cannot replace a broader gate. Full/Redis/browser verification remains required when the task or changed seam requires it; do not run another identical gate merely to restate an unchanged result.
2. Pass all required precommit verification and review before making a signed commit. Then publish an authorized draft increment promptly. Only checks that the task and repository permit after commit may overlap hosted validation; label those pending in the PR. This cadence never overrides a stronger precommit gate or claims readiness before required checks pass. Respect the local heavy-command/browser queue; overlapping hosted CI does not authorize competing local browser runs.
3. Associate every receipt with its actual source head and dirty state. Preserve first failures. Do not amend a verified source head solely to add passing timestamps: update the live register and PR evidence, then include any required final ledger checkpoint as an explicitly verified documentation increment. A main integration creates a new head and requires fresh hosted checks; earlier local evidence keeps its original scope.
4. As soon as required local checks and review pass and existing authorization covers merge, mark the PR ready and run `pnpm run land <pr> --owner <session>`. Do not wait for another routine confirmation or for cleanup. Use one lander per PR. Poll its existing handle/process and inspect hosted jobs until it exits; an observation timeout does not justify a duplicate lander or verification run. Resolve concrete failures in scope and retain the first failing receipt.
5. Confirm the actual PR merge and its ancestry on freshly fetched main before marking delivered. Record reviewed head, merge SHA, required check results and remaining acceptance limits. Then run the retirement rule below outside the landing queue. A green head, a successful lander invocation and a deployment status are separate evidence; none replaces actual merge confirmation.

For timing comparisons record local check start/end, landing enqueue/turn, each main update, hosted run/attempt and per-job start/end, final required-check completion, merge confirmation and, separately, deployment availability. Name missing timestamps instead of deriving queue time from PR age or commit dates. Compare equivalent coverage and separate workflow changes, runner contention and reruns; modeled overlap savings are not an observed before/after improvement.

## Local browser runs take turns

Browser journeys from several sessions at once starve this machine. On 2026-10-11,
load averages of 285 to 384 made journeys fail with dropped town connections and
timeouts that looked like code bugs. The shared town and experience runners, and the
security, reflections and trees scripts, now take turns through a queue in the
common Git directory (`scripts/browser-lock.mjs`):

- **While another run holds the lock,** a run prints who holds it and waits.
- **Released on any exit,** including a failure or an interrupt. An entry left by a
  process that died is dropped.
- **Nested runs pass straight through:** a run started by a run that holds the lock
  doesn't wait on it.
- **Hosted CI skips the lock** (`CI=true`), as does `RIVER_OAKS_BROWSER_LOCK=off`
  for a deliberate exception.
- **Wrap any other heavy command** with
  `node scripts/browser-lock.mjs <name> -- <command>`.

## Register merges and stashes

The live register is not in the working tree, so merges, rebases, pulls and stashes
never touch it. Older instructions had sessions edit the primary checkout's
`docs/project-management/tasks.json` directly. Every read of the live register
(`register`, `project:status`, `project:prune`, `project:inventory`) absorbs such an
edit by task id, then puts the tracked file back to its committed text, so the
primary checkout stays clean:

- An entry changed on one side takes that side, including a deletion.
- An entry changed on both sides takes the newer `updatedAt`.
- A deletion never discards an edit made on the other side.

The committed snapshot still merges through the same rules: `.gitattributes`
routes it through a merge driver that `pnpm install` installs with the other shared
hooks (`install-project-hooks.mjs`). Without the driver, for example in a fresh
clone before `pnpm install`, Git falls back to its line merge.

A tracked copy with conflict markers is not absorbed; `project:status` names the
markers and exits 2. Find them with `grep -n '^<<<<<<<' docs/project-management/tasks.json`,
merge the two sides by task id, and the next read absorbs the result.
`project:check` still reports any stash that holds register edits; the next read
absorbs them once they are popped, or merge them in with `register patch`.

## Daily reconciliation and handoff

Run `pnpm run --silent project:check --github` at session start and handoff.
Exit 0 means the register passed validation and no tracked reconciliation gaps
were found. 1 means reconciliation gaps:

- unregistered branches or mismatched PR heads;
- expired ownership;
- delivered tasks that still have local branches;
- resurrected retired refs;
- a stash that holds register edits;
- a recorded PR that can't be found;
- a delivered task whose PR isn't merged, or a merged PR whose task isn't delivered;
- an unqueued, unretired task with no local branch.

2 means an input or tool failure, including a register that fails validation.
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

Use the `worktree-retirement` project skill (`.agents/skills/worktree-retirement/SKILL.md`). Retirement is a separate decision
from delivery. Recheck clean tracked/untracked state, locks, active processes and
sessions, open PRs, exact refs and ignored data immediately before mutation.
Preserve primary/default, dirty, active, open-PR, missing-proof and uncertain work.

Prefer ancestry proof. For squash/rebase/supersession, compare the entire aggregate
patch against the actual merged commit, including every changed path. Preserve the
exact original ref in an archive tag and a bundle outside removal paths. The bundle
may leave out commits already on origin's default branch. Restore every ref into a
new bare repository that can reach those commits, and run `git fsck --full`.
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

### Proactive retirement rule

Evaluate candidates at session start, immediately after each verified merge and before handoff. This is an agent lifecycle obligation, not an unattended deletion scheduler or new cleanup authority. When local retirement is authorized, finish every eligible candidate in the same session after delivery evidence is secured. Never hold the landing queue while archiving or pruning. Preserve blocked work and continue with independent candidates; report each blocker, responsible owner and exact next action.

| Current evidence | Required action |
| --- | --- |
| Exact delivered head, fresh owner release and session review, no activity, all guard checks satisfied | Dry-run and apply guarded local retirement from outside the target. |
| Delivered, but local evidence or ignored material remains | Preserve required material in a restricted external recovery archive, verify hashes and restoration, identify regenerable caches explicitly, then reassess the guard. Do not delete unknown ignored files. |
| Active owner/session/process, dirty work, open PR, unfinished operation or uncertain ownership | Preserve. Ask the owner for a handoff/release when needed; record who must act and what evidence would unblock retirement. An expired claim is not a release. |
| Local tip a strict ancestor of the merged head of a pull request from the same branch, with that head on the default branch | The lander's update-branch case: release the local tip and run the guarded retirement as for an exact head. |
| Squash/rebase/supersession or any other local tip differing from the merged PR head | Account for the complete aggregate difference and preserve the exact tip. Keep blocked until supported tooling accepts the evidence; never move a ref solely to manufacture eligibility. |
| Old branch, missing upstream/checkout, missing archive or expired lease | Investigate and name the missing evidence. None proves redundancy or abandonment. |
| Distinct unfinished work | Preserve unless explicit cancellation authority covers that exact work. A cleanup request does not authorize cancellation. |

For each proposed removal, record branch/full SHA, worktree, task, reviewed PR head, merge SHA, fresh ancestry/tree evidence, running-session review, process activity and tracked/untracked/ignored inventory. The owning session must release its task and record the exact-head retirement attestation described below; another session cannot invent that release. A missing CWD match is not proof of inactivity.

Use the existing commands; placeholders below must be replaced with the inspected candidate. `project:inventory` classifies evidence but does not replace the prune guard. Run `--apply` only after reviewing that candidate's successful dry run and satisfying its authority, activity and recovery requirements:

```sh
pnpm run project:inventory --json --output /tmp/river-oaks-retirement-inventory.json
pnpm run project:prune --branch <branch> --expected-head <full-sha>
pnpm run project:prune --branch <branch> --expected-head <full-sha> --apply
```

After apply, verify the local ref and worktree registration are absent, the external manifest records successful restoration/removal and the register records the correct retired branches. Recount fresh state because other sessions may create work concurrently. For each retained row, keep its owner (or explicitly unknown owner), blocker and concrete next action in the task ledger or an identified inventory receipt. Mark delivered only with merge proof and retired only with removal and recovery proof. Leave remote refs and recovery archives untouched unless separately authorized.

When the maintainer explicitly authorizes cancellation of local work untouched for
a stated duration, `project:prune --cancel-stale --branch <branch> --expected-head
<full-sha> --stale-hours <hours>` provides a separate dry run (default: 12 hours);
`--apply` archives the exact Git tip and
the full local worktree, restore-tests both, then removes the local checkout and
ref through the installed guard. It checks file and directory times, reflog, task
and PR updates, and running process CWDs before removal. Use `--detached-path
<absolute-path>` instead of `--branch` for an old detached comparison checkout.
An open remote PR or remote branch is left intact. If a nested ignored repository
survives the first clean, use `--resume-manifest <manifest.json> --apply` only after
reviewing that partial receipt; the resume checks archive hashes and the remaining
files before finishing. The authorized duration is a selection boundary, not delivery
proof or blanket approval to cancel newer work.

## Restore

Read the task's `archive` manifest first. Verify its checksum, then fetch the
recorded tag from the bundle into a **new** recovery branch, in a checkout that has
origin's default branch. Since 2026-10-20 a bundle holds only the commits that branch
lacked; the manifest lists the commits it builds on as `prerequisites`, and an empty
list means the bundle is self-contained. Create a separate
worktree from that branch. Restore local evidence from its verified archive after
inspection; never apply private state to a live service automatically.

The 2026-10-11 rounds are recorded in `retirement-20261011.json`,
`retirement-20261011-round2.json`, `retirement-20261011-final.json`,
`retirement-delivered-sources-20261011.json` and
`retirement-dependencies-20261011.json`. Their bundles and local artifacts live
under `~/worktree-backups/` (`river-oaks-20261011*`,
`river-oaks-dependencies-20261011`). Later `project:prune` runs write a
`manifest.json` next to each bundle under their archive root (default
`~/worktree-backups/river-oaks/`). The register captures
known unfinished work rather than treating this round as global task completion.

## Enforced local retirement

`project:check` exits nonzero while a delivered task retains a non-protected local branch.
Primary/default branches are excluded from retirement debt.
A blocked cleanup stays visible until its evidence is reconciled; do not relabel
the task active or retired to hide the gap.

Orphan debt is a gap as well: a local branch or a detached worktree that no task
records, and a non-retired task whose recorded `worktree` path no longer exists.
Claim the checkout, cancel it (below), or fix the record. `project:check
--allow-orphans` still prints those gaps, as warnings, but exits zero for them so
a session mid-task is not blocked by someone else's stray checkout; every other
gap still fails.

Use `pnpm run project:prune --branch <branch> --expected-head <full-sha>` to
refresh GitHub/Git evidence and report blockers. It fetches `origin` and calls the
GitHub API, so it needs network access and `gh` authentication. Exit 0 means
eligible (or retired with `--apply`), 1 means a dry run found blockers, and 2 means
an error, including a blocked `--apply`. Add `--apply` to retire that exact
local branch and its worktree. There is no bulk, force, remote-delete or age-based
mode. The command reads the **live** task register (the common Git directory), so
stale snapshot copies in feature worktrees cannot release another owner's work.

Before applying, the task owner must release the delivered task (`owner: null`,
remove `leaseUntil`) and record `retirement: { head, releasedAt, sessionsReviewedAt }`.
Both timestamps must be within two hours. `sessionsReviewedAt` attests that the
owner actually checked running agent sessions; an expired lease or no process CWD
is not sufficient. These are coordination attestations, not authenticated locks.

The command requires the exact merged PR head, its merge on the fetched default
branch, and identical merged-head/merge trees. A source branch alias is accepted only
when its full tip SHA exactly matches that merged PR head. The lander updates a
branch on GitHub before merging, so a local branch can stop short of its merged
head. Such a tip is accepted only when all of these hold:

- it is a strict ancestor of the merged head;
- the pull request's head branch has the same name as the local branch;
- the merged head is on the default branch;
- the tip was not already on it before the merge (the merge's first parent).

The release still names the local tip. Other squash/rebase/supersession cases remain
blocked for aggregate review. It refuses:

- dirty, untracked or ignored material;
- index flags (assume-unchanged or skip-worktree) and submodules;
- locks, operations in progress, active process CWDs and unknown activity;
- protected or primary branches;
- a changed head, or a previously retired branch reappearing;
- open PRs and missing proof.

`node_modules`, `.venv`, `dist` and other caches count as ignored data, so archive
evidence such as `.runtime` and `output/playwright` first, then remove the caches. Retain ignored evidence separately first; this tool
never deletes cache directories or private files to make a checkout removable.

Apply takes a common-Git-directory lock and preserves the exact tip in a unique
archive tag. Outside all worktrees, it bundles only the commits that origin's
default branch lacks. A tip already on that branch gets just its own commit, and
without a default-branch ref the bundle is self-contained. It restores the bundle
into a fresh bare repository that borrows the branch's history from the common Git
directory (`objects/info/alternates`), compares the SHA and runs `git fsck --full`.
The restore uses `git bundle unbundle`, not `fetch`: once alternates reach the tip,
a fetch never reads the pack, so it would accept a corrupt bundle. Archives written
before 2026-10-20 copy the whole history twice, about 0.8 GB each. It then
rechecks ownership, GitHub, activity, worktree registrations and clean state before
non-forced removal and expected-SHA ref deletion. The external manifest records
partial progress as well as success. The primary task register is updated only
after deletion postconditions pass. A multi-branch task remains delivered until
all its recorded branches have been retired.

Backups default to `~/worktree-backups/river-oaks/`; `--archive-root` must point
outside every checkout. Preserve its manifest, bundle, checksum and restore-tested
bare repository, which reads the common Git directory's objects. A crash may leave
`river-oaks-retirement.lock` in the common Git directory: inspect its owner activity
and external receipts before manually reconciling it; the tool never steals a lock.

`pnpm install` (prepare) and `sh scripts/install-hooks.sh` install a shared
reference-transaction hook alongside the secret guard in the common Git directory.
All existing worktrees use that absolute hook path, independent of their revision.
Custom hook paths are preserved and require manual integration. It rejects direct local branch deletion inside any ref transaction (including `branch -D`, and by the same rule `branch -m`; `main` and `master` can never be deleted, even with a permit) and
`update-ref -d`) and deletion of archive tags. The guarded command grants a short
exact-ref/SHA permit only after verification. Normal commits, fetches and pushes
are unaffected. Git offers no hook for `git worktree remove` or registration pruning: use this command as
the supported removal path. Hooks are an accidental-deletion guard, not a security
boundary; an explicit hooks override (including an older bootstrap resetting hooksPath) can
bypass them. This command does not install a background cleanup scheduler.

## Inventory, archives and remote branches

`pnpm run project:inventory` lists every local branch and worktree with its task,
owner, upstream state, matching pull request, cleanliness, process activity and
any archive of the same tip, and classifies each one: `primary`, `active` (an
owner; `lease-expired` is a flag, not a release), `open-pr`, `detached`,
`orphan-no-task`, `zero-commit`, `parked` (a queued or blocked task),
`retire-candidate` (delivered at the exact merged head; only the session release
is missing), `retire-eligible` (`project:prune` would accept it now) or
`blocked:<reasons>` (the same blockers `project:prune` reports). It reads the
live register and GitHub (`--no-github` skips that), fetches
without pruning (`--no-fetch` skips that), and changes nothing. `--json` and
`--output <file>` give the machine-readable report.

`--remote` adds the branches on `origin`: `merged-exact` when a merged pull
request's head is that exact tip and its merge commit is on the default branch,
`merged-ancestor-review` when the tip is an ancestor of the default branch without
such a pull request, `open-pr`, `merged-pr-not-on-default` or `unproven`. For
`merged-exact` branches it prints `gh api -X DELETE` commands and never runs
them: remote deletion still needs explicit approval, and a branch whose local
copy is still present stays listed for review. `pnpm run land <pr>
--delete-remote-branch` deletes only the landed pull request's source branch,
only after the merge commit is confirmed on the default branch, and is off by
default. GitHub's delete-branch-on-merge setting is on for this repository, so
the branch is usually gone already; the lander reports that and still succeeds.
Turning the flag on by default is a maintainer decision.

`pnpm run project:archives` indexes `~/worktree-backups/river-oaks/` (or
`--archive-root`): for each `manifest.json` it checks the bundle's SHA-256, that
`restore.git` resolves the archive tag to the recorded head (`--fsck` also runs
`git fsck --full` there; `--files` also hashes the local-file tars), whether the
archive tag is still present locally, and which register task references it,
including the flat 2026-10-11 record shape and `~/` paths. A partial receipt
left by a failed first attempt is flagged `superseded-by-complete-archive` when a
complete archive of the same tip exists; evidence manifests are listed without
verification. Tasks whose `archive` records point at a missing manifest are
reported. It exits nonzero for an archive that no longer verifies and writes
nothing. Deleting or moving anything under the archive root is out of scope for
every command here.

`pnpm run project:cancel` is `project:prune --cancel-stale` under its own name;
the authorization, cutoff and guard rules above apply unchanged.

## Register sweeps

The committed `docs/project-management/tasks.json` is a snapshot of the live
register for history and review. It drifts by design. When it should be refreshed,
open a docs-only register sweep PR from current `main` on a
`docs/register-sweep-<date>` branch (the only branches Verify lets change it):

1. Claim the sweep as its own task in the live register.
2. Write the snapshot: `pnpm run register snapshot` in the sweep worktree writes the
   live register to its `docs/project-management/tasks.json`.
3. Regenerate the plans index (`pnpm run plans:index`), validate with
   `project:status --tasks docs/project-management/tasks.json`, and merge.
