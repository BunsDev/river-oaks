# Likeness closeout #518 ledger

**Goal:** Close out #518 after delivery. #590, #591, #592 and #615 are merged, and Val approved the rollout gate as NO-GO on 2026-10-23. Prove the gate still holds on current main, sync the issue's acceptance boxes and retire the local 518 branches through the guard. No pilot and no new intake features.

## Ownership and baseline

Owner `claude:river-oaks-71-3e5b45`; task `likeness-closeout-518`. Worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-likeness-closeout-518`, branch `docs/likeness-closeout-518-20261024`, forked from `origin/main` `2cbc4dc470897bd8ee4da059ac8795885ee594c1`. That is 40 commits after `b9e43601`, the #615 merge. A second branch, `fix/prune-cancel-cli-cycle-20261024` (worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-prune-cancel-cli`), carries the tooling fix described under Retirement.

Owned files: `server/tests/character-likeness-unreachable.test.js` and this ledger. On the fix branch: `scripts/project-prune.mjs` (the cancel import only) and `scripts/tests/project-prune-cancel.test.js`. Left untouched: the five 518 branches and their worktrees, the other owners' register entries, and the untracked consolidation ledger in the primary checkout.

## Gate on 2cbc4dc4

- No likeness file changed after `b9e43601`: `git diff --stat b9e43601..2cbc4dc4 -- server/character-likeness-* docs/character-likeness-intake.md` is empty. Outside their own tests, nothing imports `server/character-likeness-*.js` (`git grep character-likeness`).
- **Off by default, and refused in production.** Existing tests cover this: `default off never admits a fixture or allows moderation`, `production refuses enablement` (three environments), and `test configuration cannot override the actual production process`.
- **Peer snapshot and public identity.** Covered by the existing test `likeness receipts and private metadata cannot enter canonical identity or peer snapshots`.
- **Routes and socket handlers.** Until now this rested on a grep alone. The new `server/tests/character-likeness-unreachable.test.js` runs Node's resolver (`module.registerHooks`) from every served entry: `server/start.js`, `server/redis-start.js`, `server/town.js`, `server/vite-town.js`, `api/server.js` and `middleware.js`. Each entry's own body is stopped before it can listen. The test asserts that the walk loaded `server/app.js`, `distributed-app.js`, `world.js`, `redis-backend.js` and `game-assets.js`, and that it loaded no `character-likeness` module. In a control run, the walk from the quarantine test file finds both likeness modules that file imports.
- **Mutation.** Prepending `import './character-likeness-quarantine.js'` to `server/app.js` made the test fail. It named the quarantine, validation and fixture modules. `server/app.js` was then restored, and `git status` shows it clean.
- **Not covered:** the browser bundle (`preview/src`). Vite-only imports do not load under Node. No `preview/src` file imports a server likeness module.

## Checks

- **Focused:** `node --test server/tests/character-likeness-*.test.js`: 54 passed (52 existing plus 2 new), 0 failed, 0 skipped.
- **Core:** `pnpm run verify` (Python 3.13 first on PATH) on 2cbc4dc4, with the new test present as an untracked file. **Passed**, 2026-10-24T06:04:55Z to 06:10:54Z, receipt `.runtime/agent/core.json`. Counts: tooling 218/218; preview 3902 passed with 1 skip; server 869 passed with 219 skips; desktop 115 passed with 3 skips; Python 156 passed; secret scan found no leaks. The server skips are Redis and live-gateway suites, which core excludes, so they are not evidence. The new test passed inside the server stage.
- **`verify full`**, with a disposable Redis (random loopback port, no persistence, shut down afterwards):
  - **#631** (head `e0ff305b`): every non-browser stage passed. Dependency audit: no known vulnerabilities. Tooling 219/219. Preview 3902 passed with 1 skip. Redis server tests 1128/1128 with **0 skips**. Desktop 115 passed with 3 skips. Build, ruff and format passed. Python 156 passed. Demo passed. Secret scan and history scan found no leaks.
  - **#632** (head `c8d6f143`): ran the `server-redis-tests` stage's command (`REDIS_URL=… pnpm run test:server`): 1130/1130 with **0 skips**, the 1128 plus the two new tests. Core had already passed on this content. The lockfile and history match #631's run.
  - **Not run locally:** the browser stages (`security-browser`, `reflections`, `experience`, `shared`, `ipic-screening`). #631's run waited ninth in the shared local browser-lock queue, behind a run that had held the lock since 05:59Z, and I stopped it at 06:50Z. This is a skip, not a pass. Neither change touches browser code. Hosted CI ran the browser journeys on both exact heads: all 22 check runs succeeded on `e0ff305b` and on `c8d6f143`.

## Retirement

Every local tip is a strict ancestor of its merged PR head. The only commits between them are the main merges that the lander adds through GitHub's update-branch. No tip has a commit missing from `main`, so nothing remains to deliver.

| Branch | Local tip | PR (head → merge) | Worktree | Owner |
| --- | --- | --- | --- | --- |
| `docs/likeness-intake-518-20261022` | `1c76017f44f91fb4bff30b42348b9f707b1e0d41` | #590 `57ac5ff7` → `70e1365f` | none | `codex:likeness-intake-518-20261022` |
| `feat/likeness-quarantine-518-20261022` | `9431752c8cfb3080e30c2392e3c6b5bd58df0d14` | #591 `d41daf42` → `f21c9c86` | none | same |
| `test/likeness-gate-518-20261022` | `d9c8c427a2ee05370e52fd3517d805a893aad51a` | #592 `30346d3f` → `b44bc166` | `river-oaks-likeness-518` | same |
| `feat/likeness-consent-audit-518-20261023` | `0c8bb1980fd6c0741c53e00a5707dfa4476a1ee0` | #615 `1da0608c` → `b9e43601` | `river-oaks-likeness-consent-518` | `claude:likeness-consent-518-20261023` |
| `fix/zod-advisory-override-20261023` | `430884521928a9831e16e407c8b9b074163a2de2` | #618 `c22221a8` → `132a75a2` | `river-oaks-zod-audit` | same |

**Evidence archives.** Copies only; nothing was removed. Each archive was written by `scripts/project-worktree-snapshot.py archive`, which restore-tests on write. Afterwards, the hashes and the source inventory were verified with `verify-source`. Each directory is mode 700 and has an `evidence-manifest.json`. Dependency caches are regenerable and were not archived.

- `~/worktree-backups/river-oaks/likeness518-gate-local-evidence-p4kwdoet`: `.runtime` (94 entries, sha256 `0cd4624c…`), `output/playwright` (137, `b5d709fd…`), `data/generated` (7, `44c16879…`).
- `~/worktree-backups/river-oaks/likeness518-consent-local-evidence-poLc9OqV`: `.runtime` (15, `b75fd63b…`), `data/generated` (7, `93025bd6…`).
- `~/worktree-backups/river-oaks/zod618-local-evidence-vAUfHG4D`: `.runtime` (7, `4dda65e1…`), `data/generated` (7, `55b12344…`).

**Guarded dry runs.** I ran `pnpm run project:prune --branch <b> --expected-head <tip>` from outside every target. All five exit 1 with `ownership-not-released`, `session-release-missing-or-stale` and `exact-merged-pr-required`; the three branches with worktrees also show `ignored-data`. No process has its working directory in a target worktree.

**Owner release is unavailable.** ListAgents lists only Claude sessions, and none of them is `claude:likeness-consent-518-20261023`. The Codex owner of `likeness-intake-518` cannot be messaged from here. The workflow says another session cannot invent a release, so none was recorded. The other owners' register entries were left unchanged.

**Tooling findings:**

1. `project:prune` requires the local tip to equal the merged PR head and the two trees to match. A branch landed by `pnpm run land` never matches, because update-branch adds a merge after the last local commit. Every delivered branch therefore stays blocked on `exact-merged-pr-required`. The workflow forbids moving a ref only to make it eligible.
2. A task with several PRs records a single `pr`; `likeness-intake-518` records 592. Prune checks only that PR, so the #590 and #591 branches could not pass even with exact heads.
3. On main, `project:prune --cancel-stale` always exits 13. Since `b3bfeaa6`, the cancel module imports `archiveTip` back from `project-prune.mjs`, which loaded it through a dynamic import from its own top-level await, so the import deadlocks. Fixed on `fix/prune-cancel-cli-cycle-20261024`: commit `e0ff305b`, a static import plus a CLI regression test, which failed with exit 13 before the fix. The focused prune, cancel and archives tests pass 31/31. With the fix, a dry run with `--cancel-stale --stale-hours 5` marks all five branches eligible with no blockers. The latest touch is 2026-10-23T12:25:55Z for the `likeness-intake-518` branches and 2026-10-24T00:23:39Z for the other two.

## Decisions for Val

1. **Retirement path for the five branches.** (a) Authorize `project:prune --cancel-stale --branch <b> --expected-head <tip> --stale-hours 5 --apply` for each exact tip above. That needs the CLI fix, either merged or run from its worktree; the command archives the tip and the full worktree, restore-tests both, and removes them through the guard. (b) Authorize a guard change that accepts ancestry proof, plus multiple PRs per task. (c) Keep the branches.
2. **Issue #518:** close it, or keep it open as deferred-optional.
3. **Merging** the closeout PR and the prune fix PR. Neither merge is authorized in this session.

## Issue sync and PRs

- 2026-10-24T06:15Z: ticked the four #518 acceptance boxes. Each box links its PR and merge SHA; the rollout box links Val's NO-GO ruling. A note says that real-user intake stays NO-GO and the pilot-evidence rows stay unmet. Before ticking, I checked each box's attribution against git history, for example that the decision package was added in #590 and the Rollout gate ruling in #615. The issue is still open.
- Draft PRs: #631 (`fix/prune-cancel-cli-cycle-20261024`) and #632 (this branch). The open-PR sweep session `river-oaks-a3` (task `open-pr-sweep-20261024`) reports that Val asked it to land open PRs. I handed both PRs to it; this session is not authorized to merge.

## Next action

Mark #631 and #632 ready and hand their heads to `river-oaks-a3`. Post one evidence comment on #518. Val's three decisions above remain open.
