# Delivery convergence: 2026-10-24

Objective: reduce unresolved delivery state without building features. That means expired ownership claims, open-PR dispositions, register records that disagree with GitHub, issues whose work merged while they stayed open, and retirable local checkouts. Merging, `project:cancel`, closing issues and taking over another session's work are out of scope.

Owner: `claude:river-oaks-a2 (b746bd)`, task `delivery-convergence-20261024`. Worktree `river-oaks-delivery-convergence`, branch `docs/delivery-convergence-20261024`, created from origin/main 4557e70d. This ledger is the only file this task owns. Register writes were made only to this task and to owner-null rows.

## Coordination

`river-oaks-a3` owns `open-pr-sweep-20261024` (lease 10:30Z) and is landing open PRs with Val's authorization. Scope was split by message at 07:25Z. a3 keeps every open PR, the land queue, and the delivery records for `vite-env-dir-20261020`, `world-portal-design`, `consolidation-ledger-publish-20261023`, `human-studio-apple-polish-20261018`, `ipic-screening-switching-498`, `background-input-290-20261020`, `resilient-client-290-20261020`, `campus-challenge-507-20261021`, `two-player-perf-budget-20261023`, `cafe-publication-pilot-420` and `delivery-throughput-20261024`. This task keeps the other stale claims, issue evidence and retirement.

The primary checkout is on `fix/ipic-road-bricks-20261024`, owned by the live `codex:road-bricks-20261024`. No command here changed it. Read-only `register`, `project:check` and `project:inventory` were run from it.

## Baseline (07:24Z, origin/main 4557e70d)

| Measure | Value |
| --- | --- |
| `project:check --github` gaps | 115 (exit 1) |
| Branches / worktrees (`project:inventory`) | 68 / 57 |
| Register | 39 active, 8 blocked, 26 queued, 30 delivered, 295 retired; 24 active leases expired more than 6 h |
| Inventory classes | 39 active, 19 blocked, 5 parked, 5 detached, 2 zero-commit, 1 open-pr, 1 retire-candidate, 0 retire-eligible |
| Open PRs | 17 |

The machine rebooted at about 05:05Z, so no process from before then survives. Liveness was judged from `ListAgents`, Claude transcripts and Codex rollouts written in the previous 6 h that contain a `register patch <id>` for the task, process working directories, and file modification times. A mention of a task id in some other session's output was not counted as ownership.

## Records fixed (owner-null rows)

Each branch below was absent locally with no worktree and no `project:prune` manifest. GitHub's `refs/pull/N/head` still resolves to the merged head, which is an ancestor of origin/main, and every check run on that head succeeded. Each task was set to `retired`, with that evidence and a `githubPullRefs` archive holding the exact restore command. Ignored local evidence these checkouts held is not in any known archive, and each record says so.

| Task | PRs (merged head) |
| --- | --- |
| `office-computer-reliability` | #394 (`b35db84f`) |
| `office-world-lifecycle-reliability` | #410 (`4d258785`) |
| `garden-office-416` | #459 (`c5ebe0a2`), #471 (`f2b9a056`) |
| `studio-acceptance-417-20261018` | #493 (`2c3f46d0`) |
| `safari-gltf-decoder-investigation` | #401, #409, #411, #421, #436 (`d3c8622b`) |
| `desktop-installers` | #399 (`a066f3af`); the record still said "land #399". Remaining #372 scope (the Desktop installer run on main and Azure Artifact Signing) is noted in the record. |

The worktree field was removed from four rows whose path no longer exists and is not registered: `penthouse-dev-preview`, `screening-seek-lead`, `character-studio-441-integration` (still blocked on #517/#442) and `gardens-main-dev-server-20261019` (still blocked for Val). `studio-acceptance-417-refresh-20261015`, which Val cancelled as record-only, moved from blocked to queued to match the other cancelled records.

`project:check` at 07:44Z (main 74c0eab8): 99 gaps. These fixes resolved 15 gaps, and a3's landings resolved 5 more. The landings also added three pending-retirement rows (#608, #622, #589) and one unregistered branch, `sweep/pr628`.

## Stale active claims (24)

| Task | Finding | Disposition |
| --- | --- | --- |
| `vite-env-dir-20261020`, `world-portal-design`, `human-studio-apple-polish-20261018`, `ipic-screening-switching-498`, `background-input-290-20261020`, `resilient-client-290-20261020` | Being landed by `open-pr-sweep-20261024` | a3 records delivery (#589 and #608 merged) |
| `ios-device-feasibility` | #309 merged; branch and worktree gone; owner from 10-13 | Decision 1 |
| `cancelled-feat-character-studio-20261013`, `character-studio-editor-20261015` | #462 and #461 merged by inclusion (merge equals head); #461's head had two failed preview checks | Decision 1 |
| `turning-20261018-cody`, `penthouse-only-20261018-cody` | #532, #533 merged 10-18 | Decision 1 |
| `play-rail-menu-evidence-20261019` | #549 merged | Decision 1 |
| `ipic-journey-approved-film-502` | #556 merged 10-19 | Decision 1 |
| `register-sweep-20261015-e5` | #475 merged 10-19 | Decision 1 |
| `shared-dominoes-sheet` | Sheet PR never landed; no ref, remote, PR, archive or unreachable commit holds it | Decision 1 (queued, marked lost) |
| `novice-trial-441-20261018` | Kit only on `origin/test/novice-trial-441-20261018` (`cfc835cd`); awaits Val's sessions | Decision 1 (queued) |
| `procedural-gpu-acceptance` | Docs delivered (#423); test branch gone; Val-held GPU rows remain | Decision 1 (queued) |
| `dev-server-5180-main-20261019` | Worktree gone; nothing listens on 5180 | Decision 1 (queued) |
| `email-account-transition` | 7 uncommitted files (CI workflow, diagnostics, tests, ledger), all distinct from main; last edit 10-21 | Decision 4 |
| `continuous-walk-582` | 43 entries, 31 distinct; files modified at 05:42Z today | Possibly live: left alone |
| `neighborhood-584-586` | 13 entries, 10 distinct from main and #623 | Decision 4 |
| `neighborhood-authoring` | All 44 entries byte-identical to #623's branch | Decision 4 |
| `world-expansion-gate-587` | 12 entries, 9 distinct (gate journey, location label, keyboard reload fix); waiting for authorization to commit | Decision 4 |
| `phase2-review-582-583` | 21 entries, 15 distinct (review ledger, streaming audits); the F1 patch is for the world-streaming owner | Decision 4 |

Five delivered rows held by sessions that no longer run also had their branches gone. Their merged PRs all verify, and they are in Decision 1 too: `play-rail-menu-20261018` (#503), `right-rail-polish-20261018` (#543), `live-register-20261019` (#548), `penthouse-lighting-20261015` (#473) and `human-only-characters-20261018` (#496). Blocked `character-studio-persistence-20261015` (#464, merged) is included as well.

## Open PRs (14 at 07:42Z)

| PR | Owner | Disposition |
| --- | --- | --- |
| #504, #569, #571, #572, #575, #626, #628, #489 | `open-pr-sweep-20261024` (a3) | Landing or core gates in progress; see its register `nextAction` |
| #623 | `codex:goal-01a16c6e-9a25` (live) | Integration gates running |
| #630 | `claude:river-oaks-3d-d7424aaf` | Session last wrote at 05:01Z, before the reboot; lease ends 08:00Z. Decision 6 |
| #631, #632 | `river-oaks-71` (live) | Likeness closeout; owner records |
| #633 | `river-oaks-bb` (live) | Studio #417 closeout |
| #634 | `codex:mvp-regression-20261023` (live) | Movement pad contrast |

Merged during this round, by other owners: #589 (4557e70d), #608, #622 (74c0eab8), #627, #629.

## Issues

On inspection, none of the 14 candidates named at 06:30Z is finished. Each has unticked acceptance rows, and the 10-22/10-23 status comments name their owners. Most are Val's listening, device, VoiceOver, GPU or commercial rows. The rest are named engineering items: the #371 macOS e2e flake, the #370 Linux crash recovery, and the #486 Computer embed and frame policy. Comments were posted only where merged evidence had not yet been reported:

- #508 ([6381553594](https://github.com/BunsDev/river-oaks/issues/508#issuecomment-6381553594)): #593 merged. #614's ledger recommends closing it, carrying its physical and rendered criteria to #505.
- #505 ([6381553704](https://github.com/BunsDev/river-oaks/issues/505#issuecomment-6381553704)): #593, #605, #606 and #614 merged, with per-child recommendations.
- #443 ([6381553847](https://github.com/BunsDev/river-oaks/issues/443#issuecomment-6381553847)): #578 merged, along with what it leaves for Val.

Ready to close: #508 only, on Val's decision. Keep open: #370, #371, #442, #443, #486, #497, #499, #500, #501, #505, #510, #511, #512.

## Retirement

No branch was eligible for `project:prune`. The blockers fall into three groups:

1. **Tip behind the merged head.** On 11 owner-null delivered branches, the local tip is a strict ancestor of the merged PR head, and the tip is on origin/main. This is the lander's update-branch case. The guard needs an exact head match, and the workflow forbids moving a ref to manufacture eligibility. The branches: `dependabot/uv/python-minor-and-patch-85f7fb1a01` (#553), `docs/likeness-intake-518-20261022` (#590), `docs/procedural-tools-eval-20261023` (#616), `feat/destination-slice-584-586-20261023` (#611), `feat/district-height-audit-20261023` (#620), `feat/jevica-fast-walk-20261022` (#577), `feat/likeness-quarantine-518-20261022` (#591), `perf/character-fidelity-timing-517-20261022` (#602), `test/studio-417-closeout-20261023` (#613, superseded by #617), `test/studio-417-closeout-f4aa1670-20261023` (#617) and `test/studio-review-417-20261022` (#579). See Decision 2.
2. **Unreleased owners.** `codex:505-followup-20261023` holds three branches whose tips equal their merged heads exactly: #606, #614 and #605. No session has written for it since 10-23. The live `codex:mvp-regression-20261023` holds `test/mvp-regression-20261023` (#619, exact). See Decision 3.
3. **Distinct local work.** `feat/crime-melee-597-20261023` is dirty, and its tip is not an ancestor of #612. `feat/crime-police-598-20261023` has two unsigned, unpushed commits that differ from #621's separate implementation (Decision 5).

## Archive loss

`~/worktree-backups` now contains only `river-oaks/`. The 2026-10-11 archive roots are gone, and 504 manifest or bundle paths under `river-oaks/` itself are missing. That leaves 285 register tasks with an archive that no longer exists, including the queued "restore it before resuming" cancellations (`jevica-psyche`, `sdk-phase1`, `world-studio` and others) and `cartier-pilot`. The presence check added on 10-22 already reports this. Restoring from those records is impossible until the files are recovered (Decision 7).

## Decisions for Val

This is the list as presented at 07:50Z. The next section records Val's answers and what was applied.

1. **Release 14 dead-owner rows to retired and 4 to queued.** The rows are listed in the stale-claims table above. Every owner's session has ended, and each retired row's merged PR is verified through its pull ref. Approve, then run it from this worktree: `cd /Users/buns/Documents/GitHub/BunsDev/river-oaks-delivery-convergence && node .runtime/delivery-convergence/retire-owned.mjs --apply`. The script skips any row whose owner has changed. A dry run without `--apply` lists exactly what it writes.
2. **Choose how to retire tips that are ancestors of their merged heads.** Either authorize a small `project:prune` change, or keep the 11 branches above blocked. The change would accept a local tip that is a strict ancestor of the exact merged PR head when that head and its merge are on main, keeping every other guard. A third option is to authorize fast-forwarding each local branch to its merged head, which the 10-23 consolidation round did for one branch.
3. **Release `codex:505-followup-20261023`'s delivered tasks.** These are `campus-followup-505` and `campus-readiness-512`, so their three exact-head branches can be pruned after their ignored evidence is archived. Each prune also needs the task's `pr` set to that branch's PR, because one task records two branches. Leave `test/mvp-regression-20261023` to its live owner.
4. **Decide the dirty checkouts.**
   - `neighborhood-authoring` matches #623's branch byte for byte. After #623 merges: `pnpm run project:cancel --branch feat/neighborhood-authoring-20261022 --expected-head 52379be69efd395d624fedd57eeee8e283850a62`.
   - For `email-account-transition`, `world-expansion-gate-587`, `neighborhood-584-586` and `phase2-review-582-583`: commit and open a PR, hand off, or cancel.
   - `continuous-walk-582` was modified today, so confirm its owner first.
5. **`feat/crime-police-598-20261023`.** Its two unsigned commits are the only copy. Cancel it if #621 supersedes it, or keep it.
6. **`bayou-luxe-polish` needs an owner.** Its session (d7424aaf) stopped before the reboot, and its lease ended at 08:00Z. Its branch is `feat/bayou-luxe-polish-20261024` at 9a81c03f (signed, core passed), in worktree `river-oaks-destination-slice`. `open-pr-sweep-20261024` took over #630 (`commons-activation-rehearsal`) at 08:47Z.
7. **Archive recovery.** Should the 285 records be marked unrecoverable? `river-oaks-33` checked read-only at about 09:00Z: there's no Time Machine destination, and nothing in Spotlight, the Trash or `/Volumes`. The 10-22 audit (`archive-root-audit-20261022`, #576) traced the loss to the move to new hardware, so the old Mac's `~/worktree-backups` is the only likely remaining copy.
8. **Close #508?** That would carry its physical and rendered criteria to #505, as #614's ledger recommends.

## Val's answers and what was applied

Val answered in this session at about 08:55Z and approved D1, D2a, D2b and D3. At about 09:15Z Val approved cancelling all four D4 checkouts and D5's branch, chose to wait on D7, and approved closing #508.

- **D1:** `retire-owned.mjs --apply` wrote all 18 rows: 14 retired with pull-ref evidence and 4 queued with their facts.
- **D3:** released `campus-followup-505` and `campus-readiness-512` from `codex:505-followup-20261023`. `fix/campus-readiness-512-20261021` (dirty, no PR) stays parked.
- **D2a:** `river-oaks-33` opened draft #636 (task `prune-ancestor-tip-20261024`, signed head `d277322a`). It changes only `planRetirement`, the prune tests, `workflow.md` and its ledger. A local tip that differs from the merged head is accepted only when all of these hold:
  - it is a strict ancestor of the merged head;
  - the PR's head ref has the same name as the local branch;
  - the merged head is on main;
  - the tip is not an ancestor of the merge's first parent.

  Merge and tree checks run against the merged head, and the release must still name the local tip. Its author reports `verify tooling` 230/230 and prune 23/23. Not merged; landing is Val's decision.
- **D2b:** owner-null tips that were strict ancestors of their merged heads were fast-forwarded to those heads, then retired as in the next section. `river-oaks-71` is retiring `docs/likeness-intake-518-20261022` and `feat/likeness-quarantine-518-20261022` itself, under Val's #518 authorization, with `project:cancel` at their exact tips. Both were removed from this list. `test/studio-417-closeout-20261023` needed no fast-forward, because its tip is #613's merged head.
- **D8:** #508 closed as completed ([6382364488](https://github.com/BunsDev/river-oaks/issues/508#issuecomment-6382364488)). Its three unchecked criteria are carried to #505.
- **D7:** waiting for Val to check the old Mac. No records changed.
- **D6:** `open-pr-sweep-20261024` took over #630 at 08:47Z. `bayou-luxe-polish` is still unowned.

### Guarded retirements

Each branch went through the same steps: a fresh PR, ancestry and open-PR check; a clean worktree, with no process working in it and no file modified in the last 2 h; the fast-forward where approved; archiving of ignored non-cache evidence (`.runtime`, `output/playwright`, `data/generated`, `data/raw`) as a restricted tarball under `~/worktree-backups/river-oaks/convergence-*/`, restore-tested by per-file SHA-256; removal of that evidence and of named caches only (`node_modules`, `.venv`, `dist`, `__pycache__`, `.pytest_cache`, `.ruff_cache`); a fresh retirement attestation; then the `project:prune` dry run and `--apply`. The prune step writes its own restore-tested bundle manifest.

| Branch | PR | Fast-forward | Evidence archive | Prune manifest |
| --- | --- | --- | --- | --- |
| `docs/campus-followup-505-20261023` | #606 | no | none (no worktree) | `retirement-wXSHdD` |
| `feat/destination-slice-584-586-20261023` | #611 | `10809935` → `8d72756c` | none (no worktree) | `retirement-tzKNgY` |
| `perf/character-fidelity-timing-517-20261022` | #602 | `cec22d3b` → `20b490bd` | none (no worktree) | `retirement-s6eg3m` |
| `docs/campus-followup-505-delivery-20261023` | #614 | no | 58 files, `convergence-docs-campus-followup-505-delivery-20261023-UeFMCp` | `retirement-PBKq6V` |
| `fix/campus-readiness-socket-512-20261023` | #605 | no | 216 files, `convergence-fix-campus-readiness-socket-512-20261023-i5ahH7` | `retirement-wK19SV` |
| `test/studio-417-closeout-20261023` | #617 | `c92edb85` → `5b5a4388` | 36 files, `convergence-test-studio-417-closeout-20261023-fJaCgC` | `retirement-8HZIk2` |
| `test/studio-417-closeout-f4aa1670-20261023` | #617 | `1e0a49d2` → `5b5a4388` | 36 files, `convergence-test-studio-417-closeout-f4aa1670-20261023-79siPF` | `retirement-2zJL5Z` |
| `test/studio-review-417-20261022` | #579 | `bbf642ef` → `71cca92a` | 29 files, `convergence-test-studio-review-417-20261022-6oeV35` | `retirement-KyzQTO` |
| `feat/district-height-audit-20261023` | #620 | `4504defd` → `63daa741` | 10 files, `convergence-feat-district-height-audit-20261023-526qGL` | `retirement-VyhMXh` |
| `feat/jevica-fast-walk-20261022` | #577 | `96fe7642` → `a4bcd72a` | 7 files, `convergence-feat-jevica-fast-walk-20261022-Moi0vp` | `retirement-90jAoV` |
| `dependabot/uv/python-minor-and-patch-85f7fb1a01` | #553 | `49c2a422` → `ba9a9482` | 5 files, `convergence-dependabot-uv-python-minor-and-patch-85f7fb1a01-9Mr0yN` | `retirement-Pxk0VC` |
| `docs/procedural-tools-eval-20261023` | #616 | `69228060` → `07093924` | 145 files (265 MiB, mostly `data/raw`), `convergence-docs-procedural-tools-eval-20261023-TVgvaI` | `retirement-ka620t` |

All paths are under `~/worktree-backups/river-oaks/`. Every original tip that was fast-forwarded is an ancestor of origin/main, so nothing became unreachable. `test/studio-417-closeout-20261023` was first tried against #613, which the guard refused (`aggregate-tree-review-required`): #613 was merged by inclusion, and its recorded merge tree carries main's changes. It was then retired against #617, whose merge tree equals its head. Before the jevica and Python553 retirements, the session-use question the 10-23 consolidation round left open was answered with current facts: no process had its working directory in either checkout, no session had a recent register write for them, and no file had been modified in the previous 2 h.

### Authorized cancellations (D4, D5)

Each ran `project:cancel --branch <b> --expected-head <full sha> --stale-hours <h> --apply` from this worktree, after merging main to pick up #631's import fix. Each window is the widest one the dry run showed as satisfied. The tool archived the exact tip and the full worktree, restore-tested both, removed the checkout and ref, and released the task to queued. The task records now name the archive, and their stale worktree paths were removed.

| Branch | Head | Window | Archive |
| --- | --- | --- | --- |
| `fix/email-account-transition-20261020` | `a35214f3` | 72 h (last touch 10-21 00:59Z) | `cancel-stale-DdrEDR` |
| `test/world-gate-587-20261022` | `638a157f` | 18 h (last touch 10-23 14:03Z) | `cancel-stale-odtQyc` |
| `review/phase2-582-583-20261023` | `f4aa1670` | 10 h (last touch 10-23 22:05Z) | `cancel-stale-m1CDTP` (includes the F1 ride-guard patch) |
| `feat/crime-police-598-20261023` | `26a2f033` | 1 h (last touch: a3's record note at 07:14Z; no file activity) | `cancel-stale-ShLz2n` (keeps the alternate #598 design) |

`project:archives` lists all four, and all 12 prune archives, with no problem flag. The `neighborhood-authoring` cancel waits for #623 to merge, as Val's option stated. Twenty `githubPullRefs` arrays this round wrote were rewritten as flat strings, because `project:archives` read every object-valued `archive` entry as a manifest record.

## Checks

- `pnpm run --silent project:check --github`: 115 gaps at 07:24Z (exit 1); 99 at 07:44Z; 70 at 10:05Z on main 167048c3 (exit 1). Of the 70, 30 are new since baseline, mostly expired leases, pending retirements and unregistered `sweep/*` branches that belong to other live owners.
- `pnpm run project:inventory --json`: 68 branches / 57 worktrees at 07:24Z; 57 branches / 48 worktrees afterwards. Classes afterwards: 35 active, 12 blocked, 6 detached, 4 parked, 2 zero-commit, 2 orphan-no-task, 1 retire-candidate, 1 primary.
- Register: 24 active claims had leases expired more than 6 h at 07:24Z; 5 afterwards. Two are a3's (#569/#572), one is possibly live (`continuous-walk-582`), and two are the neighborhood tasks waiting on #623.
- `PATH=<python 3.12>:$PATH pnpm run --silent project:archives`: the new archives verify; the remaining problems and missing records are from before this round (Decision 7).
- `git fsck --unreachable --no-reflogs`: 363 unreachable commits, none of them from the dominoes sheet, the iOS probe or procedural GPU acceptance.
- Every merged-PR claim above comes from the REST PR record, `git ls-remote origin refs/pull/N/head`, `git merge-base --is-ancestor` against fetched origin/main, and the check runs on the head commit.
- Tooling tests (`node --test scripts/tests/*.test.js` with Python 3.12 on PATH). On `a4c4d487`: 225/225 passed. On the main merge `3c868982`, 225/226 passed. The failure was `land-pr.test.js` "a queued lander wakes on release without waiting for the fallback or touching GitHub early" ("queue release did not wake the lander"), at a load average of about 40. Its log is kept at `.runtime/delivery-convergence/tooling-first-failure-3c868982.log` in this worktree. That file then passed 29/29 three times in isolation. This change touches no code, and the cause of the first failure is not established.
- `gitleaks dir` on the ledger: no leaks.
- No browser, Redis or `verify` run: this lane changed no source.

## Next action

- After #623 merges, cancel `feat/neighborhood-authoring-20261022` at `52379be69efd395d624fedd57eeee8e283850a62` (approved). Confirm `continuous-walk-582`'s owner before touching it.
- The D2a prune-guard change is draft #636 (`river-oaks-33`). It needs review, and landing needs separate authorization. Once it lands, future cases of a tip behind its merged head can retire without a fast-forward.
- After a3's landings, retire their checkouts once each owner releases: #589, #608, #622, #504, #571 and #575 are now pending local retirement.
- Still open: `bayou-luxe-polish` needs an owner (D6), and the archive records wait on the old Mac (D7).
- `fix/campus-readiness-512-20261021` (dirty, no PR) stays parked for review.
