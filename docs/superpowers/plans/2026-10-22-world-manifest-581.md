# World manifest foundation #581

## Current status

The requested manifest implementation and local verification are complete in `feat/world-manifest-581-20261022`. Changes remain uncommitted in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-world-manifest-581`; the other owner's expansion checkout is preserved. All 49 focused checks passed. Core passed all 11 phases; the final full gate passed all 18 phases, including 993 Redis tests with zero skips, 16 experience journeys, 25 shared journeys across five fixture modes, and 19 screening checks. Reviewed source/test hashes match `.runtime/world-manifest/source-hashes-reviewed.json`.

Final receipts are `.runtime/world-manifest/core-final.json`, `full-final.json`, `focused-stable-ids.log`, and the retained reports/screenshots in the same evidence directory. The original full attempt's queue timeout remains in `full-first.json`; it is not relabelled as passed. Generated tracked experience/shared reports were retained there before restoring their historical repository versions. Full session 48215 exited 0 and released its browser lock; task-owned Redis session 29505 / PID 55319 exited cleanly after verification. No verification process remains pending.

Four existing unit-test skips remain explicit: the obstructed Vince glazing negative approach and three Windows PowerShell cases on macOS. Local Chromium tests and the inspected phone-sized viewport do not establish physical-device, human accessibility, native Unreal, hosted auth/CI or production acceptance. None of those surfaces was changed by this manifest task.

Next delivery step, if requested: reconcile overlapping manifest paths with the separate expansion owner, retaining its authored Commons partition, then review/commit/publish through the normal workflow. No commit, PR, merge, deployment or worktree retirement has occurred. The implementation goal is complete; delivery remains separate. Historical checkpoints below retain the state observed at their recorded stage.

## Objective and design

Implement the user-requested durable, versioned multi-location manifest while preserving bundled District geometry, IDs, overlays and server authority. Version 1 uses the existing east/north/up metre frame, local rectangular bounds and translation-only transforms, stable location/entry IDs, opaque content revisions, reciprocal edge adjacency and authored/reserved status. Unsupported versions fail closed; legacy District data is validated in place rather than rewritten. A reserved second location demonstrates registration without authorizing movement or loading new geometry. This foundation does not implement the separate expansion, streaming or destination issues.

## Ownership

User explicitly authorized a separate checkout after the live register showed a handoff of the larger expansion to another owner. Task `world-manifest-581`; owner `codex:world-manifest-581-20261022`; branch `feat/world-manifest-581-20261022`; base `52379be6`; worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-world-manifest-581`. Preserve the other owner's checkout. Reuse its public manifest contract/tests as a source snapshot, reduce the bundled fixture to District plus an empty reservation, and record source hashes below. Overlapping paths require reconciliation before delivery; no adoption of the larger dirty expansion tree.

Owned files: `preview/src/world-manifest.js`, `preview/public/data/world-manifest.json`, `preview/tests/world-manifest.test.js`, `preview/src/district-interior-contract.js`, `server/tests/world-manifest.test.js`, `docs/world-manifest.md`, and this ledger.

## Evidence and next actions

- Existing source snapshot: 27 focused manifest/gallery tests passed, zero skips.
- Reproduced defect: `[0,0,1,1]` translated by `[1e20,1e20,0]` validates but collapses all world bounds to `1e20`. Add a failing regression, then fix transformed-bound validation.
- Add round-trip/overflow/malformed cases and compatibility tests for loading and authoritative checkpoint restore.
- Run focused suites and core; document skips and limits. No commit, push, PR, merge or deployment has been authorized by this task.

## Source snapshot SHA-256

- `preview/src/world-manifest.js`: `b9fee74446a0376939e4add8e1ec08a069097d2a94d5dc8ac4b76e0c33dac071`
- `preview/tests/world-manifest.test.js`: `f8bdb5717411a0ef1a0e789b818f1d759f522f797a8648cdda9c2c9f717f8e53`
- `preview/public/data/world-manifest.json`: `ebbf8ff48e2e58bd7c822742626723d29aa050ba70745051438d85bf17e22b4c`

## Implementation checkpoint

Adopted the public v1 contract from the recorded expansion snapshot in this isolated branch. Added validation for transformed-bound precision collapse, zero-area underflow, authored default selection and the pinned legacy District content revision. Integrated registration checks into the existing gallery attachment shared by browser and server. The bundled manifest contains the unchanged District and one empty east reservation; it intentionally does not claim the other checkout's unmerged Commons geometry.

The first regression run failed three expected new cases (collapsed bounds, reserved default, unsupported District content revision); the integration regression failed the expected missing frame check. Logs are retained under `.runtime/world-manifest/river-oaks-manifest-red.log` and `river-oaks-manifest-integration-red.log`. After fixes, the final focused command in `docs/world-manifest.md` passed 47 tests, zero failures/skips; `.runtime/world-manifest/focused.log`. Both default District and Gardens match the legacy composed data exactly, occupied checkpoints restore without migration, and reservation coordinates remain outside walking/flight authority.

`pnpm install --frozen-lockfile` and `uv sync --locked` succeeded. Core doctor passed. Full doctor passed with task-owned Redis `redis://127.0.0.1:16391/0`; Redis process PID 55319, tool session 29505. No environment files or private state were copied. Core verification is running as tool session 65034 with log `.runtime/world-manifest/core.log`. Poll the live session before any restart. The final server test assertions were added before the core server phase began; no product code changed after core started.

Next: finish core, preserve its receipt, run full with the isolated Redis service, inspect source diff/receipts, reconcile status. No delivery action or modification of the other expansion checkout has occurred.

## Requirement audit — complete

| User requirement | Authoritative evidence | Result |
| --- | --- | --- |
| Durable, versioned manifest | Authored `preview/public/data/world-manifest.json`; schema v1 rejects unknown versions; JSON round-trip and additive metadata tests; documented revision/identity rules | Proven |
| Stable identifiers, bounds, transforms, entry points, adjacency, content revisions | Explicit fields and validation in `preview/src/world-manifest.js`; tests for unique IDs, reorder-independent references, translated bounds/entries, round trips, overlap and reciprocal edge adjacency | Proven |
| Bundled District compatibility | Adapter returns the same District object; exact composed-data equality for District and Gardens; gallery/stairs tests; all 16 browser experience journeys passed | Proven |
| Existing multiplayer authority | No pose/room/checkpoint schema or permission changes; reserved walking/flight remain denied; occupied legacy checkpoints restore; final Redis 993/993 and shared 25/25 passed | Proven |
| Second location without rewriting the scene | Bundled empty reservation; authored translated synthetic location registers, serializes and removes without altering District geometry/IDs; existing scene module unchanged | Proven |
| Schema validation and migration/compatibility handling | Malformed, unsupported-version/revision, sparse/nonfinite/overflow/underflow/precision-collapse cases covered; legacy content validated in place; no checkpoint migration needed, confirmed by restore | Proven |
| Small, extensible model | Dependency-free ESM; existing units/frame; translation only; optional metadata; no renderer, transport or framework replacement | Proven by source review |
| Automated tests and repository gates | Focused 49/49, core 11/11 phases, final full 18/18 phases; all reviewed source/test hashes match final files | Proven |

No requested implementation or verification item remains open. Publication and integration with the other owner's larger expansion are future delivery actions, not implied by this task. The manifest registers an empty second location; destination authoring and streaming belong to the separate expansion work and are not claimed here.

## Core verification passed

`PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH pnpm run verify` passed all 11 phases on the uncommitted patch based on `52379be69efd395d624fedd57eeee8e283850a62`. Receipts: `.runtime/world-manifest/core.json` and `.runtime/world-manifest/core.log`. Totals: tooling 201 passed; preview 3,791 passed / one skipped; server 738 passed / 213 Redis skips; desktop 115 passed / three skipped; Python 149 passed; build/lint/format/offline fixture/secret scan passed. The offline fixture verifier's exit 2 is the catalog's expected synthetic blocked result, not a production readiness claim.

`PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH REDIS_URL=redis://127.0.0.1:16391/0 pnpm run verify full` started as session 68502, log `.runtime/world-manifest/full.log`. Core session 65034 has completed successfully. Poll full session 68502; do not duplicate it. Redis remains owned session 29505 / PID 55319. Full/browser and hosted/physical-device acceptance are not yet proven.

## Continuation handoff while full verification runs

The prior recorded goal work is classified as progress: the manifest implementation and tests exist in the expansion checkout and the source snapshot passed 27 focused checks here. Its ownership has since been explicitly handed to another session. This continuation made independent implementation progress in the user-authorized separate checkout, reproduced/fixed validation defects, and completed the focused/core gates. Full session 68502 was polled live at handoff and remains running in preview tests; this is a verified wait, not a terminal result or justification to restart.

`git diff --check` passed. Implementation/test SHA-256 values are saved in `.runtime/world-manifest/source-hashes.json` for comparison at completion. Read-only `pnpm run --silent project:check --github` exited 1 with 77 repository-wide lifecycle gaps and none mentioning this task; receipt `.runtime/world-manifest/project-check.json`. Other owners' records were preserved. Initial inventory had 24 worktrees; current inventory has 30 worktrees and 33 local branches, including concurrently created work. This task created one checkout/branch and removed none. No delivery or retirement performed.

Next action remains: poll full session 68502 and inspect `.runtime/world-manifest/full.log`; keep Redis session 29505 / PID 55319 on port 16391 available until the gate is terminal. Then retain the full receipt, handle any real failures, recheck changed files and hashes, reconcile the live register, and only mark the goal complete when all required evidence is present.

## Continuation: non-browser full gate passed; verified queue wait

The previous goal turn is classified as progress: it implemented the isolated foundation and passed focused/core checks. At this continuation, session 68502 was polled and confirmed live; all five recorded implementation/test hashes still match `.runtime/world-manifest/source-hashes.json`, and the worktree retains only the seven owned source/doc/test changes.

Full verification advanced through all 13 non-browser stages: dependency audit, tooling (201 passed), preview (3,791 passed / one existing skip), Redis server (993 passed / zero skips), desktop (115 passed / three existing skips), production build, Python lint/format/tests, offline fixture/verification, worktree secrets and Git-history secrets. The next stage is security-browser. Current log is `.runtime/world-manifest/full.log`; the full gate is not complete.

The shared queue has six earlier browser runs. The current holder is `issue 580 repeated baseline`, PID 67047; our waiting security-browser wrapper is PID 63437. Both were confirmed live using `ps`, not inferred from the queue file. Full session 68502 remains live and should be polled; no restart, bypass or competing browser run was launched. Redis session 29505 / PID 55319 remains owned for later shared/browser stages. Next action: let the queue advance, inspect the terminal result or any real timeout/failure, then finish the requirement audit and handoff.

## Final audit correction: sparse programmatic coordinates

The preceding turn was a verified wait with new full-gate evidence; session 68502 and its browser queue were revalidated live at this continuation. The final source audit identified a concrete gap: JavaScript `Array.every` skips holes, allowing a programmatically constructed entry point or transform input to omit elevation. JSON parsing cannot produce this shape, but the exported validator/transform helpers also accept programmatic data. The added regression failed as expected; `.runtime/world-manifest/sparse-red.log`.

Changed finite-vector validation to inspect `Array.from(value)`, so omitted components become undefined and fail the same finite-coordinate contract. The complete focused command now passes 48 tests, zero failures/skips; `.runtime/world-manifest/focused-final.log`. Final hashes are recorded separately in `.runtime/world-manifest/source-hashes-final.json`, preserving the earlier snapshot. No other product changes were made.

A fresh core verification runs as session 77971, log `.runtime/world-manifest/core-final.log`. A final production build runs as session 60992, log `.runtime/world-manifest/build-final.log`, before the queued browser phase starts. Full session 68502 spans this small correction: its earlier non-browser phases used the previous helper, so they must not be relabelled as exact-final-source results. Final core plus a final Redis suite will cover the corrected helper; remaining browser phases will use the rebuilt final source. The browser queue advanced from six to five earlier runs; our wrapper PID 63437 remains live. Preserve the existing full run and receipts, then verify both final runs and all remaining phases before completion.

## Final Redis verification passed

`REDIS_URL=redis://127.0.0.1:16391/0 pnpm run test:server` passed 993 tests with zero failures/skips on the corrected source; session 98115 exited 0, log `.runtime/world-manifest/server-redis-final.log`. Final production build session 60992 exited 0; `.runtime/world-manifest/build-final.log`. Final core session 77971 and full/browser session 68502 remain live. The browser queue has advanced to four earlier runs; it has not supplied browser acceptance yet. No further source change is planned.

## Final core verification passed

Final core session 77971 exited 0 with all 11 phases passed. Receipt copied to `.runtime/world-manifest/core-final.json`; console `.runtime/world-manifest/core-final.log`. Final source/test hashes still match `source-hashes-final.json`. Combined with focused 48/48, final Redis 993/993 and the final production build, all implementation requirements have current local non-browser evidence.

The outstanding full run remains live at security-browser queue admission. Its task timer includes time waiting for the lock and is close to the ten-minute limit. If the runner actually terminates with that timeout, retain the failed full receipt and start a new full run under the existing outer `scripts/browser-lock.mjs` wrapper. This acquires the shared turn before starting timed verification tasks; it neither bypasses the queue nor relaxes test deadlines. Do not start that replacement while the existing full process remains live.

## Full timeout retained; replacement waits before timed checks

Original full session 68502 terminated with exit 1. Its security-browser stage was killed by the runner at 600,014 ms with `ETIMEDOUT` while waiting for four earlier browser runs; no security-browser tests started, and reflections/experience/shared/screening were not run. Receipt preserved as `.runtime/world-manifest/full-first.json`; original console remains `full.log`. This is a failed full run due to queue admission, not a passed browser gate.

After confirming that session was terminal and its wrapper PID 63437 absent, started `PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH REDIS_URL=redis://127.0.0.1:16391/0 node scripts/browser-lock.mjs 'world manifest full gate' -- pnpm run verify full`. Replacement tool session 48215, wrapper PID 91772, log `.runtime/world-manifest/full-final.log`. It acquires the normal shared lock before any timed verification task begins; nested runners use the supported inherited lock. No deadline or test is disabled.

At handoff there are nine earlier queue entries (new runs joined while the first attempt waited). Holder PID 40644 and our wrapper PID 91772 were both confirmed live with `ps`. The replacement has not started verification yet. Poll session 48215 rather than duplicating or restarting it. Final core session 77971, final Redis session 98115 and final build session 60992 all exited successfully; their receipts remain separate. Redis session 29505 / PID 55319 port 16391 must stay available for the replacement. Goal remains active until the full gate supplies final browser evidence and completion is audited.

## Test review: stable IDs and extensible fixtures

The preceding turn is classified as progress: the sparse-coordinate defect was reproduced/fixed, final focused/core/Redis/build checks passed, and the queue-timeout recovery was executed only after the old process terminated. The replacement full session 48215 is currently a verified live wait; PID 91772, holder PID 40644 and Redis PID 55319 were rechecked, and no duplicate run was started.

Test review found that malformed-input fixtures depended on the bundled manifest containing exactly two locations in a fixed order. Refactored only the test fixture factory to select the District by stable ID and create its own empty neighbor. The real bundled registry still has direct compatibility validation in preview/server tests. Added a regression that reverses locations and two distinct entries, then resolves identity, bounds, revision, adjacency and world entry coordinates by stable IDs; the District adapter still succeeds when its registration moves in the array.

Final focused command passed 49 tests, zero failures/skips; `.runtime/world-manifest/focused-stable-ids.log`. Only `preview/tests/world-manifest.test.js` changed since the final-core hash snapshot; all product code, bundled data and server tests are unchanged. Reviewed hashes are in `.runtime/world-manifest/source-hashes-reviewed.json`. The queued replacement full run will execute the new test file when its turn arrives. No additional product changes are planned; continue polling full session 48215.

## Full gate: experience journeys passed

Replacement session 48215 acquired the normal browser lock and started the full profile at `2026-10-23T01:29:20.095Z`. All non-browser phases, both security-browser tests, WebGL reflections and all 16 experience journeys passed on the final source, including the test-only stable-ID reorder improvement. The retained experience report is `.runtime/world-manifest/reports/experience.json`. Reviewed source/test hashes still match `source-hashes-reviewed.json`.

Inspected the actual `contextual-mobile.png` first-visit capture: District storefront, character and controls render without an error overlay. Preserved at `.runtime/world-manifest/screenshots/contextual-mobile.png`. This is a local phone-sized viewport sanity check, not a matched visual comparison, physical-device or human accessibility acceptance. Exact composed-data equality and legacy checkpoint restore remain the direct compatibility evidence.

Shared multiplayer journeys are now running; screening follows. Preserve session 48215 and owned Redis until the final result. Do not restore generated tracked reports until all writers have completed and their final receipts are retained.

## Final handoff

The full gate completed successfully after normal queue admission. Final console totals: tooling 201 passed; preview 3,793 passed / one existing skip; Redis server 993 passed / zero skips; desktop 115 passed / three Windows skips; Python 149 passed; security-browser 2 passed; all build, lint, format, synthetic pipeline, dependency audit, secret/history, reflection, experience/shared/screening phases passed. The synthetic demo verifier's expected exit 2 remains the catalog's deliberate blocked-fixture check.

Final full command: `PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH REDIS_URL=redis://127.0.0.1:16391/0 node scripts/browser-lock.mjs 'world manifest full gate' -- pnpm run verify full`. The wrapper acquired the ordinary queue turn before starting the unchanged timed checks. Final focused command is documented in `docs/world-manifest.md`; final standalone core and Redis commands/results remain above.

After retaining fresh reports, restored only `data/reports/experience.json` and `data/reports/shared-experience.json` to their historical HEAD versions. `git diff --check` passed, reviewed hashes matched, and only the seven owned files remain changed/untracked. Task-owned Redis was positively identified before SIGTERM and its tool session confirmed a clean exit. No other process or worktree was stopped or removed. Current inventory: 31 worktrees and 36 local branches; initial inventory had 24 worktrees. This task created one branch/worktree; concurrent owners account for other inventory changes.

Final read-only `pnpm run --silent project:check --github` exited 1 with 81 repository-wide lifecycle gaps, none for `world-manifest-581`; receipt `.runtime/world-manifest/project-check-final.json`. Unrelated lifecycle records were preserved. The task is queued for future delivery/reconciliation with ownership released; it is not marked delivered or retired.
