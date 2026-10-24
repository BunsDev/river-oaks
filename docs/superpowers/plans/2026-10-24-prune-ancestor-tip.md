# Retire a local tip behind its merged head

Objective: Decision 2a of the 2026-10-24 delivery convergence round (`delivery-convergence-20261024`). `project:prune` should accept a local branch whose tip is a strict ancestor of its own exact merged PR head when that head and its merge are on the default branch, with every other guard unchanged. Val approved it as a draft PR at about 08:55Z, in river-oaks-a2's session.

Owner: `claude:river-oaks-33 (3735c42c)`, task `prune-ancestor-tip-20261024`. Worktree `river-oaks-prune-ancestor-tip`, branch `fix/prune-ancestor-tip-20261024`, created from origin/main `55b88b31`. That base already holds #631 (`549f84f9`), the other recent prune/cancel change. No overlap: #631 touched the cancel module's import cycle, and this change is confined to `planRetirement`.

## Why

The lander updates a branch on GitHub (update-branch) before merging, so the merged PR head is a descendant of the local tip. `planRetirement` required `pr.head.sha === head`, which blocked every such branch with `exact-merged-pr-required`, even though every commit on the tip is already on main. On 2026-10-24, 11 owner-null delivered branches were in this state. The workflow forbids moving a ref only to manufacture eligibility, so a2 fast-forwarded them under the separate Decision 2b. This change covers the cases that come later.

## Change

`scripts/project-prune.mjs`, `planRetirement`: a tip that differs from the merged head is accepted only when all of these hold:

- the tip is a strict ancestor of the merged head;
- the pull request's head branch has the same name as the local branch (the update-branch case, not an alias);
- the merged head is on the default branch;
- the tip is not an ancestor of the merge's first parent, so the merge itself brought it to main. An old main commit that never carried the pull request's work is refused.

The existing checks then run against the merged head: its merge is on the default branch, and the merged head's tree equals the merge's tree. For an exact head this is the same comparison as before. The release attestation must still name the local tip.

Unchanged: every other blocker, the release freshness window, the squash case (an exact head is still needed), archiving and the reference guard. `archiveTip` already bundles only the tip's own commit when the tip is on the default branch.

Docs: `docs/project-management/workflow.md` covers the new case in the proactive retirement table and in the enforced-retirement paragraph.

## Checks

| Check | Result |
| --- | --- |
| New regressions before the change | 2 of the first 3 failed, both on `exact-merged-pr-required`. The third, a negative control for a local commit the merged head lacks, passes either way. |
| Independent review (fresh subagent given the diff only) | No path found that removes work missing from main. Its findings are fixed here: (1) the fixture used the tip's own tree, so reverting the merged-head tree comparison went unnoticed, and main now moves before update-branch; (2) a tip from old main was accepted, now refused by the first-parent check, with a test; (3) `merge-not-on-default` had no test, and now has one; (4) workflow wording. Left as is: inventory still shows `merged(other) #N` for these rows, which is display only. |
| Mutation checks (scratch copies of `scripts/`, not the worktree) | Reverting the tree comparison to the local tip fails 2 tests; dropping the first-parent check fails 1; dropping `merge-not-on-default` fails 1. |
| `node --test scripts/tests/project-prune.test.js` | 23 passed, 0 failed |
| `node --test scripts/tests/project-inventory.test.js` | 5 passed, 0 failed |
| `node --test scripts/tests/project-prune-cancel.test.js` | 8 passed with Python 3.13 first on PATH. Under the shell's bare `python3` 3.9 it gives 4 known failures (`extractall(filter=...)`), unrelated to this change. |
| Read-only inventory on the real repository (`node scripts/project-inventory.mjs --no-fetch`, main `55b88b31`) | Behind-tip branches no longer report `exact-merged-pr-required`; only their release and ignored-data blockers remain. A tip with a commit main lacks (`fix/vite-env-dir-20261020`) and a dirty non-ancestor tip (`feat/crime-melee-597-20261023`) stay blocked. Nothing was changed. |
| `pnpm run verify tooling` on the final source (tracked diff `e1ae1369`) | Passed, 230/230 |
| `pnpm run verify` (core) on the same source, three runs | Run 1 at 09:25Z, 1-minute load 22–33: 229/230, `scripts/tests/agent.test.js:63` "browser queue admission does not consume the command execution timeout" got `failed`, not `passed` (its nested command has 300 ms after admission). Run 2 at 09:32Z, load 13: 229/230, "a queued lander wakes on release without waiting for the fallback or touching GitHub early" hit its 5 s limit. Run 3 at 09:33Z, load 12: passed. That gave agent 230/230, preview 3908 with 1 skipped, server 870 with 219 skipped (Redis, excluded from core), desktop 115 with 3 skipped, Python 156, plus build and the secret scan. Both failing tests are in suites that do not import `project-prune.mjs`, and each suite passed 3/3 in isolation. Host load is a hypothesis, not a proven cause. Both failing logs are preserved in the session scratchpad. |
| Not run | `verify full` (Redis, browser): no runtime, server or browser code changed |

## Gaps and next action

- A task that records several branches under one `pr` (for example `likeness-intake-518`) still blocks the branches whose PR is not that number. That is a register-shape limit, out of scope here.
- No local branch is retired by this PR. The current behind-tip cases are being handled by a2's Decision 2b fast-forwards.
- Next: draft PR only, with no merge without separate authorization. After merge, the owner of each future behind-tip branch releases the local tip and runs the guarded prune.
