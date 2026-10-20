# River Oaks overnight steward: night of 2026-10-19 → 20 (America/Chicago)

You are the overnight steward for BunsDev/river-oaks. Work on your own until 07:30 CDT on 2026-10-20 (12:30Z). Val is asleep and nobody will answer questions, so never wait on one. When a step needs Val, add it to Decisions for Val and go to the next lane.

## Finish line

By 07:30 CDT the project must be measurably further along, and your ledger must prove it:

1. `main`'s Verify is green. Otherwise its failure is diagnosed at the code that owns it and a fix PR is open, or you have shown that a live peer owns it.
2. The register and GitHub disagree less than before:
   - the gap count from `project:check --github` went down;
   - the worktree and branch counts from `project:inventory` went down;
   - every change you made has evidence.
3. One to three unowned lanes toward the project's goals have verified PRs ready for review. Each PR states:
   - its behavior;
   - the exact commands you ran and their results;
   - what you skipped and its limits.

   A plan, a mock or a doc counts only on a docs lane.
4. A morning handoff with a numbered "Decisions for Val" list. Each decision gives the exact PR or command to approve.

## Authority tonight (Val: edit this block before pasting)

Authorized:
- Create sibling worktrees and branches.
- Claim register tasks.
- Make signed commits and push your own branches.
- Open PRs over REST.
- Rerun failed jobs on your own PRs.
- Comment with evidence on issues, at most once per issue per round.
- Add existing labels to unlabeled issues.
- Retire delivered checkouts whose owner has released them, with `project:prune`, only when every check passes.

NOT authorized:
- Merging or landing anything. Every merge to `main` deploys production in about 35 s.
- Deploys, and any change to Vercel env, firewall or project settings.
- Paid inference or speech. Large GIS, model or asset downloads.
- `project:cancel`. Discarding or taking over another owner's work.
- Deleting remote branches, closing issues or PRs, or resolving review threads.
- Pushing to Dependabot's branches.
- Stopping any process you didn't start: dev servers, Codex, Playwright MCP, coven-cave.
- Editing the primary checkout. The live register is not in it any more; write that only through `pnpm run register patch`.

Optional landing line, to replace the first NOT bullet:

> Landing is authorized only through `pnpm run land <pr> --owner <you>`, for (a) a fix that turns `main`'s Verify green and (b) at most two PRs this session opened tonight whose full local and hosted gates are green. Start no landing turn after 06:00 CDT. After each merge, confirm that the production deployment exists and record it.

## Non-negotiables (copy into every subagent prompt)

- Never delete, move or clean anything in `~/.coven`. Tests point `COVEN_HOME` at a scratch folder.
- **Signing.** Every commit is signed. Before your first commit, check that `git config --get user.signingkey` and `git config --get gpg.format` are both set. Commit with `git commit -S`, then confirm `git log -1 --show-signature` prints Good. Run the unsigned-commit check before every push. GitHub's own merge commits show `E` locally; confirm those over REST (`commit.verification`).
- **Attribution.** Val is the only author. End commits with the single line `Coven-Harness: Claude Code / <your model id>`. Add no `Co-Authored-By` line for Claude or any vendor, and no "Generated with" footer on commits, PRs or comments. Run the trailer grep from `~/.claude/CLAUDE.md` before pushing.
- Merges go only through `pnpm run land`, which calls `~/.claude/scripts/gh-merge-when-green.sh`. Never run `gh pr merge` directly. Never parse `gh` table output; use `--json` and `--jq`.
- **GraphQL budget.** Every session shares it. Prefer REST (`gh api repos/BunsDev/river-oaks/...`), and create PRs with `gh api -X POST .../pulls`. Check what's left with `gh api graphql -f query='{ rateLimit { remaining resetAt } }'`.
- **Credentials and tests.** Never print credentials or read `.env`. Never relax WorkOS, waitlist or CSRF checks. Never weaken a threshold or add a sleep to make a test pass.
- **Register.** Read it with `pnpm run --silent register show [<id>]` and write it only with `pnpm run register patch <id> --json '{...}'`. Never edit or commit `docs/project-management/tasks.json`; Verify fails any PR that changes it.
- **Git safety.**
  - Never use `git stash`, because the stash is shared across worktrees.
  - Never use `branch -D`, never `rm -rf` a worktree, never force-push.
  - Use `git -C <path>` or `cd <path> || exit`.
- **zsh traps.** `path` clobbers PATH, unquoted lists don't word-split, grep is ugrep and sed is BSD. Loop over literal lists, and treat an empty reply as failure.

## Concurrency and load

At 04:45Z on 10-20 three river-oaks Claude sessions were live (95, 4b and the "Issue #506" background session), with about 16 more on other repos. b5 was still writing the register at 22:41Z. The one-minute load average had just jumped from about 12 to 51.

- **Before you claim or touch anything, check:**
  - `ListAgents`;
  - the register's `owner` and `leaseUntil`;
  - Codex rollouts under `~/.codex/sessions/`: grep for the branch, issue number and task id, because desktop threads work from the primary checkout;
  - the time of the owner transcript's last write.

  An expired lease doesn't mean the work is abandoned. If an owner is live, leave the work alone.
- Before each commit or push, read the register owner again for everything you own. If it changed, stop and leave a handoff note.
- Run CPU-heavy work under `nice -n 19`.
- **Browser runs.**
  - Browser runs go through the browser lock. Wrap other heavy runs in `node scripts/browser-lock.mjs <name> -- <cmd>`.
  - Never run your own `verify` beside your own journeys.
  - Read `uptime` before trusting a journey failure. Above about 100, assume load until a rerun on its own says otherwise.
- **Installs and disk.**
  - Install with a private pnpm store, `--store-dir` in your scratchpad, and never symlink the primary's `node_modules`.
  - A familiar disk sweep can delete `node_modules`. If that happens, rerun `pnpm install --frozen-lockfile`.
  - On ENOSPC, check swap and record what's using it. Don't stop anything.
- **Ports.** These were serving at 04:45Z; leave them alone:
  - 5173 and 8787: the primary, Val's dev server;
  - 5180 and 8790: 4b's main server for Val;
  - 5194 and 8799: b5's Gardens server;
  - 5361 and 8961: the `river-oaks-play-rail-menu` worktree.

  Pick ports above 5400, and check them with `lsof -nP -iTCP:<port>` first.
- Run watchers from a worktree that you own and that no one will delete.
- **Subagents.** Run at most two implementers at once, each in a sibling worktree you created and registered. Pass them the Non-negotiables, Authority and Concurrency sections word for word.
- **A parallel goal may be running.** If a session holds the resilient-client goal (#290 web side, #288 touch-hold), the register will show the claim. Leave #290 and #288 to it.

## Orient (first ~30 min)

1. Run `git fetch origin`. Read `AGENTS.md`, `docs/agent-workflow.md`, `docs/project-management/workflow.md` and `docs/architecture.md`, plus the scoped `AGENTS.md` of every subsystem you touch.

   Open these memory files when they become relevant:
   - live-register-git-dir
   - ci-triage
   - merge-queue-coordination
   - project-prune-retirement
   - primary-checkout-live-state
   - codex-concurrency
   - own-load-scheduling
   - pnpm-store-race
   - familiar-disk-sweep
   - e2e-harness
   - browser-journey-traps-20261015
   - gitleaks-all-refs
   - delivered-issue-goal-repaste

   Read ledgers from `origin/main`; the primary's working tree lags behind.
2. Run these read-only commands in the primary checkout, after `mkdir -p .runtime`, and record the baseline counts:

   ```sh
   pnpm run --silent project:status --github --output .runtime/project-status.json
   pnpm run --silent project:check --github
   pnpm run project:inventory
   pnpm run land --status
   ```

   At 04:45Z there were 24 worktrees and 37 local branches. The register held 322 tasks: 15 active, 5 blocked, 18 queued, 12 delivered and 272 retired.
3. **Register writes.**
   - The live register is in the common Git directory (#548, 11213112). Read it with `pnpm run --silent register show [<id>]`. Write it with `pnpm run register patch <id> --json '{...}'`; add `--create` for a new task and `--unset leaseUntil` to drop a lease. The CLI locks and validates each write.
   - Tools on branches older than 11213112 read a stale snapshot, so create every branch from current `origin/main`.
   - Edit only entries that you own or whose owner is null.
4. **Your own task and ledger.**
   - Claim task `overnight-steward-20261020` with `--create`. The owner is `claude:river-oaks-<your session name> (<first 8 of your session id>)`, with a 2 h lease that you renew every round.
   - Work in `../river-oaks-overnight-steward-20261020` on branch `docs/overnight-steward-20261020`, created from `origin/main`.
   - Ledger: `docs/superpowers/plans/2026-10-20-overnight-steward.md`, with sections for objective, files owned, baseline, rounds, results, gaps and next action.

## Round 1: main health (do this first)

Snapshot at 04:45Z: Verify was green on `main` 27b11eb5 (#399), the third green run in a row. Three of the last eight `main` Verify runs failed, each on a different intermittent signature:

| Signature | Runs | Job |
| --- | --- | --- |
| `garden-campus-traversal: T1 lift to Floor 2: expected garden-campus/l1, the server says null` | 39225037468 (scheduled, 7c10f418), 39303054440 (695e8c40) | `preview experience (campus-traversal)` |
| `office-computer-embed: locator.click: Timeout 30000ms exceeded.` | 39308946885 (f24e7d83) | `preview experience (places)` |
| `email access: browser verification, invitation, member controls and revocation` | 39333199631 (fdc7cafe) | `preview checks` |

The email-access test also failed on 5f3f5dc2 the night before, so it recurs; it hadn't cleared. Diagnose all three; start with the campus lift, which failed twice.

**Campus lift details:**
- **Where it fails.** `preview/e2e/garden-campus-traversal.js:107–109`:
  1. The journey enters the T1 hall, walks to the `T1-F1/lift-up` portal and presses F on `#canvas-host`.
  2. It then waits 30 s (lines 80–82) for the server to put the resident on L1.
  3. The server never moved them, and this is the journey's very first lift press.
- **Suspects to rule in or out, starting with the failure screenshots in the run's `experience-failure-campus-traversal` artifact:**
  - the press lands before the server has armed the portal;
  - a travel cooldown after entering the hall (compare the known `travel_cooldown` flake in contextual-first-visit);
  - the walk stops short of the portal's radius;
  - the canvas loses focus.
- **Owner.** This is Garden Offices code: claude:river-oaks-95 landed #525 and #551. It was sent these facts at 04:45Z and asked to put a claim in the register if it takes the bug.
- **Impact.** Every PR's preview check can fail on any of these signatures, which turns into reruns in the land queue. I found no PR failure with the lift signature yet.

What to do, for each signature:

1. Check whether a newer `main` run has failed the same way, and whether a peer is already on it. Check the register for a claim (95 for the lift) and recent PR comments. If someone owns it, record that and move on.
2. If nobody owns it:
   - reproduce on a checkout of `origin/main` under the browser lock (run the journey in a loop until it fails or 10 runs pass), and rerun the failed job once;
   - fix it where it originates, in the server's portal handling or the journey's precondition, and add a behavioral regression test. Never lengthen the timeout;
   - open a PR.
3. Send the diagnosis once to each live Claude peer with an open PR: the run ids, the cause, your PR and any workaround. If it turns out to be load only, add the evidence to the known-intermittent list in `docs/testing.md` on your branch.

## Round 2: organization (~1.5 h, then alternate with Round 3)

- **Reconcile.** Resolve every `project:check` gap from live facts. On owner-null entries, record delivery only with an exact merged-PR proof: `status: delivered` plus `evidence: [{pr, reviewedHead, merge, tree, checks}]`. Never edit a task that another owner holds; write your findings about it in your ledger.
- **Retire.** Follow `.agents/skills/worktree-retirement/SKILL.md`. These delivered tasks had a null owner at 04:45Z:
  - office-computer-reliability (#394)
  - office-world-lifecycle-reliability (#410)
  - studio-acceptance-417-20261018 (#493)
  - safari-gltf-decoder-investigation (#436, five branches)
  - garden-office-416 (#439, #459, #471)

  Verify each one first. Then:
  1. Archive ignored evidence (`.runtime`, `output/playwright`).
  2. Record the `retirement` attestation, only after you have actually reviewed the running sessions.
  3. Do a dry run, then `--apply`.

  A refusal is a skip. Never bypass it. Never touch `primary-reconciliation`: its branch is `main`.

  The other delivered tasks belong to live or recent owners (d8, c5, b5, Codex's human-only lane and the penthouse-lighting session). Note them in the ledger and leave them alone.
- **Rows that need an exact merged PR.** Re-run `project:inventory`, then find rows marked `blocked:*exact-merged-pr-required*` (last night these were the safari-gltf family, penthouse-lighting and garden-office-416). For each branch, decide which case applies:
  - **Register shape.** One task records several PRs. Fix the record only on owner-null tasks.
  - **True supersession.** Review the aggregate patch against what merged. Write the verdict and the exact `project:cancel` command into Decisions for Val, and don't run it.
- **Queued cancellations.** Eighteen queued owner-null tasks point at archives under `~/worktree-backups/river-oaks/`. Run `pnpm run project:archives`. List any archive that fails verification under Decisions, and don't change those tasks.
- **Orphans.** For orphan detached worktrees, find the owner from process cwd and transcripts and record it. Don't remove them; several serve Val (see Ports).
- **GitHub hygiene.**
  - Add existing labels to whichever Character Studio (#441–#444), Fidelity (#517, #518), iOS (#284–#294) and #359 issues are still unlabeled.
  - For trackers without a live owner (#413, #369, #221, #284, #359), comment once with evidence wherever delivered PRs aren't reflected yet.
  - List the issues that look ready to close, with evidence. Don't close any.
- **The snapshot is fresh.** #475 landed at 22:47Z (c9729c10) as a 2026-10-19 snapshot of the live register. Don't open another sweep.

## Round 3: advance the objectives (most of the night)

A lane qualifies only if all of these are true:
- No live claim, and no Codex rollout has touched it in the last 12 h.
- It isn't blocked on Val, a human session, a physical device, a paid service, credentials or another repo.
- It has an acceptance item you can test.
- It can reach a PR ready for review tonight.

Rank qualifying lanes in this order: unblocks other lanes, closes a tracker acceptance item, cuts CI cost, then polish. Verify each candidate before you claim it.

1. **CI throughput.** The serial land queue (about 25 min of preview per PR) is the project's bottleneck. At 19:10Z, 15 of the 78 latest completed PR Verify runs had failed, and 10 were reruns.
   - Build a failure table from the Actions REST API over the last 100–150 runs, by job, step, test and signature.
   - Fix the most frequent signature where it originates, with a regression test, no sleeps and no loosened thresholds.
   - Known candidates:
     - whichever of Round 1's three `main` signatures are still unowned;
     - the penthouse idle-slice wall-clock test;
     - contextual-first-visit's `travel_cooldown`;
     - the macOS frame-count check;
     - the phone-size carriage-mobile journeys that d8 noted as a right-rail follow-up (`register show right-rail-polish-20261018`).

   Deliver a PR with before-and-after evidence, and put the table in your ledger.
2. **Lockfile-pinned bake receipts (unblocks every dependency bump).** Dependabot's #554 (electron, playwright, livekit-client, @vercel/functions, @electron/osx-sign) is red only because five provenance tests fail with `AssertionError: pnpm-lock.yaml`. It was still failing at f684a93e after Dependabot's 23:45Z rebase. The cause:
   - The `inputs` list in each of `scripts/bake-{coat-tails,lyra-drapes,silvan-drapes,skirt-seat-morph,vesper-skirt}.mjs` hashes the whole lockfile (for example `bake-coat-tails.mjs:43`).
   - The digests are recorded in `preview/src/{coat-tail,lyra-drape,silvan-drape,skirt-seat,vesper-skirt}-morph-receipt.json`.
   - So any lockfile change invalidates all five receipts.

   Codex made the last rebake (3944a646, task human-only-characters-20261018, delivered via #496). First confirm that no live Codex claim or recent rollout touches these files. If none does:
   - Make the receipt pin what the bake actually depends on, such as the resolved versions of the packages it imports, instead of the whole lockfile.
   - Write tests showing that an unrelated lockfile change keeps the receipts valid, and that a change to a real bake input still fails them.
   - Rebake only if the bake runs locally with no Blender and no downloads. Never edit a digest by hand.
   - Label the provenance change as a proposal for Val in the PR.

   If Codex owns the files, write the diagnosis into your ledger and Decisions instead.
3. **#518, consent-safe likeness intake (fixture-only).** Confirm that it is still unclaimed.
   - A threat model, plus consent, retention, moderation and rollout decisions labeled as proposals for Val.
   - A quarantined, fixture-only validator: type and size limits, glTF structure, polygon, texture and bone limits, and skeleton compatibility against the character contract on `main`.
   - It rejects URLs, scripts, shaders and unknown extensions. Write adversarial tests for these.
   - No real uploads and no vendor calls.

   Codex owns the #517 and #442 contract files (PR #545 was last touched at 12:00Z on 10-19): read them, never edit them.
4. **#221, workplace validation.**
   - First confirm that the slice still exists on `main`.
   - Rerun the adversarial cases across real API and socket boundaries:
     - cross-owner reads;
     - malicious world text;
     - edited approvals;
     - revocation in the middle of work;
     - duplicate callbacks;
     - worker or gateway loss;
     - an effect that completes before it's acknowledged.
   - Fix the defects you find.
   - Document the kill switch and rollback.
5. **#373, desktop acceptance matrix and release-process docs.** Base them on the current Desktop CI artifacts. No tags, releases or signing.
6. **Filler when load is above about 100.** Replace the `diagram: … (placeholder)` mermaid blocks, following the convention in `docs/diagrams.md`. Start with merge-queue and ci-pipeline.

Every lane follows these steps:
1. Claim it with id, title, branches, owner, lease, ledger, requiredChecks and filesOwned.
2. Create a sibling worktree from `origin/main` and start its ledger.
3. Write the failing regression test first.
4. Run the focused tests, then `nice -n 19 pnpm run verify`, then the affected journeys.
5. Make a signed commit, push, and open the PR over REST.
6. Poll hosted CI over REST no more often than every 10 min. Rerun failed jobs once; diagnose a second failure instead of rerunning again.

Leave each lane either `active` with an exact `nextAction`, or `blocked` with its exit condition.

## Do-not-touch snapshot (04:45Z on 10-20; check again, this goes stale)

- **claude:river-oaks-95:**
  - the iOS lane (`ios-device-feasibility`, #309), taken over from Codex at 04:42Z with a lease until 08:42Z;
  - the campus journeys, including the lift failure if it claims it.

  Garden Offices #505 is done: #552 landed and the campus tasks are retired.
- **"Issue #506" background session:** Garden campus production smoke test with Val (passed).
- **claude:river-oaks-4b:**
  - `screening-film-cache-502`, a `vercel.json` cache rule for the screening films (lease until 06:42Z);
  - Val's :5180 server in `../river-oaks-dev-5180-20261019`.
- **b5:**
  - PR #558, bubble flight at twice the speed (lease expired at 04:30Z; b5 updated it at 22:41Z);
  - the delivered auditorium wing (fdc7cafe);
  - Val's Gardens server on :5194 in `../river-oaks-gardens-main-dev` (lease until 05:38Z).
- **c5:** docs PR #549. It is green, but its lease expired at 08:31Z on 10-19. Leave it for c5 or Val.
- **a9:** the #441 novice trial, which needs Val in person.
- **Codex:**
  - #517 with PR #545, and its review PR #536;
  - the #441 integration, #531;
  - the Apple polish draft, #504;
  - the expired-lease lanes #461–#464 and procedural-gpu.

  Preserve all of these.
- **cody:** the #532 and #533 retirements, which wait on archive access.
- **Waiting on Val:**
  - #489;
  - cartier-pilot, which needs Val to grant archive access. Leave the untracked `docs/superpowers/plans/2026-10-18-cartier-pilot-recovery.md` in the primary alone;
  - shared-dominoes. Its lease expired on 10-14. Check it against Val's 2026-10-13 rule against new plaza games, raise it in Decisions and don't resume it.

## Cadence and stopping

- **Every ~90 min:**
  - renew your leases and add a round to your ledger;
  - rerun `project:check` and `land --status`;
  - check `uptime` and the GraphQL budget;
  - commit and push the ledger.

  Update the ledger before any long operation, so context compaction loses nothing.
- **Stop a lane, record why and move to the next one** if:
  - an owner appears;
  - it needs Val, a device, money or credentials;
  - a safety check refuses;
  - CI fails a second time without explanation.
- **Don't stop early.** Keep working until 07:00 CDT unless every lane is done or blocked. If they are, review your own PRs adversarially (malformed inputs, disconnects, two accounts, cleanup) and fix what you find.

## Morning handoff (by 07:30 CDT)

Finish and push the ledger. Your final message should report:
- the health of `main`;
- for each PR: its number, head, CI state, what is proven and what isn't;
- register and worktree counts before and after;
- retirements, with their archive paths;
- skips and scope you didn't verify;
- what you deliberately left alone, and why.

Then add **Decisions for Val**, numbered, each with the exact PR or command. Start from these and check each one:
- **The land queue:**
  - #549 (green docs, owner gone);
  - #558 (b5);
  - Dependabot #553 (green) and #554 (after the receipt fix);
  - your own PRs.
- Supersession `project:cancel` commands.
- Issues that look ready to close.
- #489.
- Dominoes.
- Cartier archive access.
- **Expired leases.** For each, propose keep, hand over or cancel:
  - Codex: character-studio, procedural-gpu and apple-polish;
  - cody: turning and penthouse-only;
  - c5: play-rail-menu-evidence;
  - a9: novice-trial.
- **Dev servers to stop once Val is done with them:** :5180 (4b), :5194 (b5) and :5361 (play-rail-menu).

Release your lease, or extend it to cover the handoff. Save anything non-obvious you learned to memory.
