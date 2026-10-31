# Docs and plans review (goal 2026-10-31)

Goal: Val, 2026-10-31 (`/goal`): "review all docs and plans and ensure they are updated and archived where applicable e2e". Session `claude:river-oaks-48 (198acf2d)`. Register tasks `docs-plans-review-20261031` (this sweep) and `docs-review-text-20261031` (doc text fixes on `docs/docs-review-20261031`).

## Objective

1. Bring the committed register snapshot and the plans index back in step with the live register (the last sweep, #6e1d9ae7, is from 2026-10-19; the live register had 657 tasks against the snapshot's 320).
2. Reconcile register rows that GitHub contradicts (merged PRs on tasks still `active`/`queued`/`blocked`), with REST evidence only.
3. Retire delivered local checkouts whose owners have ended, through the guarded prune, where that is permitted.
4. Review `docs/` for dead references and claims that `main` contradicts, and fix them in a separate docs PR.

## Files owned

- `docs/project-management/tasks.json` (snapshot, this branch only), `docs/superpowers/plans/README.md`, this ledger.
- On `docs/docs-review-20261031`: `docs/character-forms.md`, `docs/invasion.md`, `docs/resident-dialogue-ui.md`, `docs/resident-life.md`, `docs/people-interaction-progress.md`, plus whatever the content review below turns up.

## Baseline (2026-10-31 19:27Z, main `fcc72b5c`)

- `pnpm run project:check --github`: exit 1, 146 gaps (`.runtime/project-check-20261031.txt` in the primary checkout). Classes: 8 delivered tasks pending local retirement; 4 tasks with merged PRs still `active` (#765, #737, #768, #782); 27 expired leases; 3 unregistered detached worktrees; ~60 queued scratch-snapshot rows whose recorded worktree directory is gone; 285 tasks whose restore archives predate the 2026-10-22 backup loss.
- `project:inventory`: 65 worktrees, 64 branches (42 active, 8 open-PR, 10 parked, 7 zero-commit, 4 detached, 7 blocked candidates).
- Plans: 381 ledgers in `docs/superpowers/plans/`; 291 linked to a live task; 90 historical. One broken local Markdown link under `docs/` (a false positive in `docs/unreal.md`: Python code in parentheses).
- Live sessions: none of the owners of the merged-but-active rows (`97524b7a`, `c26bff33`, `1a8107da`, `9b98c1a1`) appear in ListAgents; no lander process, the landing queue is empty and no queue lock exists.

## Register reconciliation (live facts, REST evidence)

Marked `delivered` with `{pr, reviewedHead, merge, tree, checks}` from `gh api repos/BunsDev/river-oaks/pulls/N` and `git rev-parse <merge>^{tree}`; every merge commit is on `origin/main` and every local tip is a strict ancestor of its merged head (the lander's update-branch case):

| Task | PR | Merged | Merge | Local tip | Worktree |
| --- | --- | --- | --- | --- | --- |
| `wave-3-steward-20261029` | #765 | 2026-10-30 05:46Z | `5dcac231` | `7567bd1a` clean | `river-oaks-wave-3-steward` |
| `landowner-hovercraft-20261028` | #737 | 2026-10-30 10:15Z | `5598f75c` | `1cd96019` clean (+ scratch `river-oaks-737-main-merge` at the merged head `b33bf154`, clean) | `river-oaks-landowner-hovercraft` |
| `land-queue-lock-starvation-20261030` | #782 | 2026-10-30 07:28Z | `b7dab4e6` | `5465778c` clean | `river-oaks-queue-lock` |
| `campus-readiness-512` | #605 | 2026-10-23 | `d9d8fff3` | archived (`cancel-stale-a9EYK9`) | none |
| `default-appearance-517-20261024` | #656 | 2026-10-26 | `caa1a7ef` | archived (`cancel-stale-Goi9Ya`) | none |
| `rider-pose-20261026` | #691 | 2026-10-28 | `f424a492` | archived (`cancel-stale-S00Jkp`) | none |
| `release-0-2-2` | #712 | 2026-10-27 | `f4dd959a` | archived (`cancel-stale-jHNQyi`) | none |

The last four had been reset to `queued` by the 2026-10-29/30 stale cancellations although their PRs were already merged. Because each already carries a verified `archive` manifest (present under `~/worktree-backups/river-oaks/`) and no local branch, they were then set to `retired` (delivery proof plus archive), which is the state the check expects for a row with no checkout; `campus-readiness-512` also dropped its stale `branches`/`worktree` record (the branch is in `retiredBranches`). `release-0-2-2` was then returned to `queued`: #712 merged the release branch, but no GitHub release `v0.2.2` exists (404) and the release ledger's close-out lines are unfilled placeholders, so the release itself is not delivered; publication waits on Val.

Left as they are, with the reason:

- `ci-reliability-20261029` (#768 merged `55543761`, evidence already recorded): a goal task whose acceptance (20 consecutive first-attempt Verify passes on `main`) is not met; its owner was active on 2026-10-30 23:25Z. Its branch `fix/ci-input-frames-20261029` (`19aedd7a`, clean, an ancestor of #768's head) is a retirement candidate once the owner releases it.
- `walking-obstacle-buckets-20261025` (#669 closed unmerged): stays `queued`.
- `character-fidelity-517-review` (#536 merged, task `blocked`, Codex owner): the row's scope is the continuing review, not the docs PR.
- Expired leases on other sessions' feature branches (jevica-*, pink-jet-age-*, depth-*, ribbonwing-*, wardrobe, promenade, ios-host-prep, lane-cover, mobile-gamepad, stack-activation, render-audit, audit-asar, crime-release-599, phase2-review, ios-draw-budget): open or unmerged work; nothing to reconcile from GitHub.
- The scratch-snapshot rows whose directories are gone (other sessions' `/private/tmp/.../scratchpad/*` and six `../river-oaks-*` paths): record fixes need the owner or Val (steward Decisions 16 and 14 in `2026-10-29-wave-3-steward.md` are still open).

## Local retirement

`project:prune --cancel-stale --branch <b> --expected-head <sha>` dry runs (fresh fetch, GitHub evidence) were **eligible with no blockers** for:

| Branch | Head | Task | Worktree |
| --- | --- | --- | --- |
| `ci/shared-required-split-20261029` | `b8dac9650d7b6861bfef1f9833209ba06fca17c2` | `shared-required-split-20261029` (#764) | `river-oaks-shared-split` |
| `feat/pink-jet-age-r3-architecture-20261029` | `96e3771f3a5b012ec6cccbecec22bf3e7c5413a3` | `pink-jet-age-r3-architecture` (#774) | `river-oaks-pja-arch` |
| `test/studio-417-closeout-f0d01729-20261030` | `2a41f22422091b71b5070f730e29297bda2e9204` | `studio-417-closeout-f0d01729-20261030` (#806) | `river-oaks-studio-417-closeout-f0d01729` |

The `--apply` step was refused by this session's tool permission policy (worktree removal counts as irreversible local destruction here), so nothing was removed. The same guarded command, run by Val or a session with that permission, retires each one; the three rows I marked delivered above (`docs/wave-3-steward-20261029` `7567bd1a…`, `feat/landowner-hovercraft-20261028` `1cd96019…`, `fix/land-queue-lock-starvation-20261030` `5465778c…`) and the clean detached scratch copies `river-oaks-737-main-merge` (`b33bf154`, on main) and `river-oaks-ribbonwing-main-merge` (`22ce5f54`, on main) are the next candidates (`--detached-path` for the last two).

Preserved, with the blocker:

- `river-oaks-depth-audit` (`fix/depth-shader-audit-20261026`, delivered #695): two dirty source files (`preview/src/sidewalks.js`, `preview/tests/district-depth.test.js`), undelivered river-oaks-3e edits.
- `river-oaks-default-world-data` (`fix/default-world-data-20261030`, delivered through #797): three dirty server files; its owner must reconcile.
- `river-oaks-quaternius-clips` (delivered #722): one dirty ledger file under a Codex owner.
- `river-oaks-cartier-rebuild-20261030` (delivered #797): untracked `output/cartier-review-20261030/` review captures; human visual acceptance still open.
- `river-oaks-jev-likeness-snapshot` (detached `6c0d7ca8`): two untracked reports, touched within the window.

## Docs review

- Dead references (scan of every backticked repo path and `pnpm run` script in `docs/**` outside the plans, plus README and AGENTS): every `pnpm run` script exists. Of 38 missing paths, 25 are gitignored or generated data, 8 never existed in any ref (planned files, another repo's `docs/PLACE_EMBED.md`, the office-IPIC kit's own `docs/production-guide.md`), and 6 were deleted with their feature: `preview/src/animal-face.js` (#496, human-only characters) and five solo-runtime journeys (#170). The docs PR marks those six as removed and gives `docs/character-forms.md` a historical banner pointing at `character-studio.md`.
- Content review of the topical docs (status claims checked against GitHub merge state and `main`): see Results.
- `docs/project-management/goals/` is already an archive of historical prompts with the right banner; nothing to change.

## Checks

- Snapshot: `pnpm run register snapshot` (658 tasks), `pnpm run plans:index`, `pnpm run plans:index --check` (exit 0), `pnpm run --silent project:status --tasks docs/project-management/tasks.json` (exit 0).
- `pnpm run verify` (core) on this branch, 2026-10-31 19:41Z, host load 16 (dirty tree, snapshot + index + this ledger): **passed**. agent 294/294; preview 4,813 (4,777 pass, 1 skip, 35 todo, 0 fail); server 1,395 (1,110 pass, 285 Redis-gated skips, 0 fail); desktop 132 (127 pass, 5 skip); Python 215 passed, 66 warnings; lint and gitleaks clean. Receipt `.runtime/agent/core.json`, log `.runtime/verify-core-1.log` in `river-oaks-register-sweep-20261031`. Redis, browser, native, live auth and production acceptance are not part of core and did not run.
- `pnpm run verify` (core) on `docs/docs-review-20261031` (#824, `804d5761`), 2026-10-31 19:47Z: **passed** with the same counts (agent 294, preview 4,813, server 1,395, desktop 132, Python 215; 0 failures).
- PRs: #823 (this sweep, `c9058be4` + the ledger refresh) and #824 (doc fixes); both drafts, both signed.

## Results

- Snapshot and index on this branch: 659 tasks; the index lists 24 active/blocked, 15 delivered awaiting local retirement, 362 retired and 90 historical ledgers (the 2026-10-19 index had 22 / 11 / 217 / 0, built from a 320-task snapshot).
- Content review of 60 topical docs (three read-only passes over `docs/*.md`, `docs/acceptance/*.md`, `docs/releases/*.md`; every PR number checked over REST, every path against `main`): 10 contradicted claims in 6 docs, all because PRs merged after the text was written. Fixed on `docs/docs-review-20261031`: `office-computer-embed.md` (TypeSafeAI/typesafe-computer#34 merged 2026-10-31, not deployed), `email-invites-execution.md` (#169 merged), `character-studio.md` (#484, #461/#462/#464 merged), `ios-feasibility.md` (the voice client is `preview/src/voice-chat.js`), `acceptance/crime-release-599.md` (#708/#710/#732 merged; checkpoint v18 wording), `app-review-292.md` (#711, #713, #714, #715, #716 merged). Dated records (`acceptance/mvp-release-readiness-20261024.md`, `world-expansion-release-readiness.md`) were left as records of their date. 48 docs had no contradicted claim.
- Ledger closeouts in the same PR (#824, `fbadc108`): dated "Delivery record" sections on the nine ledgers whose PRs merged while their text still ended at "land once authorized" (landowner hovercraft, rider pose, default appearance #517, Pink Jet-Age architecture, depth shader audit, Cartier pilot recovery, the #417 closeout, the wave-3 steward, and the 0.2.2 release ledger's not-published note). `2026-10-26-quaternius-clip-import.md` was left alone because the Codex owner's worktree holds an uncommitted edit to that file.
- Dead references fixed in the same PR: `character-forms.md` (historical banner; beast forms removed by #496), `invasion.md`, `resident-dialogue-ui.md`, `resident-life.md`, `people-interaction-progress.md` (journeys removed by #170).

## Gaps

- `project:check --github` after the reconciliation: 169 gaps (173 at the baseline; the three merged-but-active rows became pending-retirement rows, the four re-marked rows left the list). Every remaining gap is another session's expired lease, a scratch-snapshot record whose directory is gone, a missing pre-10-22 archive, or a pending local retirement.
- Hosted `preview unit` fails on every PR head since 2026-10-31 07:34Z, including #823, on `pnpm audit --audit-level=moderate` (new moderate advisories for `minimatch` <11.0.1 and `glob` <=14.0.1 under `@electron/packager > @electron/asar`; job 124638228160). `main` `fcc72b5c` passed the same job before the advisories were published. The fix is draft #821 (`audit-asar-glob-minimatch-20261031`, river-oaks-86), which waits on Val's landing authorization; until it merges, neither docs PR can get a green `preview` aggregate.
- Marking a PR ready and `project:prune --apply` are both refused by this session's permission policy; the PRs stay drafts and the retirement candidates stay listed with their commands.
- Local retirement needs a session allowed to remove worktrees; see the candidate table.
- The register still carries ~60 scratch-snapshot rows for directories that no longer exist and 285 restore paths lost on 2026-10-22; both wait on Val's answers to steward Decisions 14 and 16.
- A plans index generated from the snapshot goes stale as soon as the live register moves; this sweep records 2026-10-31.

## Next step

Val (or an authorized session): land #821 so `preview unit` passes again, then mark #823 and the docs PR ready and land them (docs-only; core verify passed on both). Then run the guarded `project:prune` commands in the candidate table.
