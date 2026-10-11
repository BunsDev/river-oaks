# Pending delivery integration

Objective: unblock and land PR #198, then integrate the locally verified Places guide and World Studio. Reconcile staged main work before combining overlapping branches. User authorized this delivery goal on October 11.

Workspace: `river-oaks-integration-20261011`, branch `codex/integrate-pending-20261011`. Initial PR head `af4b8b7`; current remote main `20edac0`. Source worktrees remain intact. No credentials/private runtime copied.

## Staged main reconciliation

Primary checkout remains at `c98351a` with 28 staged paths. Its exact staged binary patch is preserved at `/tmp/river-oaks-main-staged-20261011.patch`; original index/worktree remain intact.

- Spatial circulation: two source/test changes, two browser journeys, map/walkability reports and district review are genuine undelivered work. Keep separate from #198; carry the browser fixes in a verified integration commit before Places/Studio. Native night/traversal acceptance remains open.
- Package manager: staged package-lock deletion duplicates #198. Staged pnpm lock differs from #198 by transitive updates (including rolldown, postcss, Node types and osx-sign); preserve it separately, do not silently substitute it for the verified PR lock.
- Story chapters, names, place pillars, SDK proposal, interior-pilot scope and desktop-refresh ledger are unrelated drafts/evidence; preserve staged.
- Native DefaultInput.ini belongs to the separate SDK/input task; preserve staged.
- Existing agent-workflow stash is unrelated and untouched.

## Delivery sequence and owned files

1. PR #198: merge latest main; preserve pnpm commands, HUD navigation, new facade tests, lifecycle checks, greetings and intro routes. Diagnose failing rail journey; run focused checks, core/full local gates and hosted checks; review and merge.
2. Spatial browser corrections: import only reviewed source, focused tests/journeys and scoped ledger; verify. Keep historical generated evidence separate.
3. Places: import its authored source/tests/docs against latest main, adapt to current HUD and pnpm; verify browser/shared/core gates; review and deliver.
4. World Studio: preserve full locally verified authoring + local dual-path Designer implementation, portable skill pack, native IPC and fixtures. Reconcile Vite/index/desktop/server overlaps; verify browser/native/core/full gates; review and deliver. Remaining remote Cave/provider/product scope is explicitly not part of the locally verified work.
5. Verify remote main includes each delivery; reconcile delivered staged paths only after exact evidence, preserving unrelated or divergent work.

## Evidence and gaps

- Read-only repository and GitHub inventory completed. #198 preview log: Birds button locator timed out in rail-navigation; other listed checks passed. No review comments or reviews were returned.
- Frozen pnpm install, locked uv sync and core doctor passed in isolated worktree.
- Seven merge-conflict files resolved in worktree; behavioral verification in progress.
- PR198 reconciliation commits `4fbdf3b` and `8f78e30` were pushed. Neither feature integration nor PR198 is merged yet. Do not archive these worktrees.

## PR198 local reconciliation results

- All seven conflicts resolved, retaining both feature sets and pnpm argument semantics.
- Reproduced rail failure in combined tree: first indoor staff meeting opened the new store intro modal; shortcuts correctly yielded to the modal. Explicitly complete intro before rail assertions. Updated store-intro journey for current HUD.
- `pnpm run test:experience rail-navigation store-intro game-hud`: all three passed. Report `.runtime/integration/pr198-focused-browser.json`.
- `pnpm run verify`: passed all core tasks; `.runtime/integration/core.log`, `.runtime/agent/core.json`. Redis/browser/native remain outside core.
- `pnpm run verify tooling` after catalog/CI changes: 19 passed, zero skips.
- Added store-intro to hosted and full browser acceptance. Independent read-only code review found no blocking issues.
- Full local gate uses owned Redis at loopback port 16411; hosted checks and merge remain pending.

## Combined integration checkpoint

Worktree: `river-oaks-places-studio-integration-20261011`, branch
`codex/places-studio-integration-20261011`, initial base `4fbdf3b`.
Frozen snapshots of both source trees are under
`/tmp/river-oaks-integration-sources-20261011/`; source hashes were rechecked and
have not changed. Source trees and canonical main's staged files remain preserved.

- Imported spatial source/tests and its authored review, then Places and the full
  locally verified Studio/editor/dual-path Designer implementation.
- Reconciled current HUD navigation in travel, saved places, shared journeys and
  spatial acceptance. Retained existing settings dialog and all current suites.
- Review exposed a lost Studio link: sidebar initialization discards the first
  settings child. Moved the link after the Layers label and added browser entry
  through Settings. Red fixture failed; combined green run now passes Studio.
- Review exposed knowledge-pack upgrades rejecting an existing project. Install
  packs by content hash, select the active pack in each prompt, and migrate only
  the exact prior generated AGENTS bytes. Custom instructions and identity bytes
  remain protected. Red test reproduced failure; 18 host/pack checks passed.
- Focused document/scene/spatial/download/asset checks: 36 passed, zero skips.
- Combined browser, desktop smoke and final core/full gates remain in progress.
- PR198 is now owned by the concurrent delivery thread
  `01a12983-1ffc-7ba0-93a0-f3026b435750`; this thread will make no further PR198
  pushes. Its newer commit adds response-aware intro waits. Rebase the combined
  integration on the final merged main before delivery. This coordination avoids
  competing PR histories while preserving both sets of evidence.
- Our earlier full run at `8f78e30` failed contextual-first-visit and photo-mode;
  shared was not run. The delivery thread's final full run passed interaction
  journeys and is completing shared checks. No full success is claimed yet.

The eleven staged spatial/walkability reports are copied byte-for-byte from the
primary index to preserve the review's evidence links. They are historical
October 8 receipts, not current verification. Import hashes are recorded in
`.runtime/integration/imported-historical-reports.json`; no dates/results changed.

## Fresh combined acceptance

- `RIVER_OAKS_E2E_REPORT=places-studio-green.json pnpm run test:experience
  world-studio places-guide places spatial-circulation spatial-streets`: exit 0,
  all five journeys passed. Browser images inspected at desktop and 390 px.
- `node desktop/studio-e2e.js`: exit 0, nine native checks passed.
- `node desktop/designer-e2e.js`: initial run timed out waiting for initial editor
  readiness (15 s, zero checks). Preserved failure in
  `.runtime/integration/designer-native-first.json`. Added failure-state/image
  diagnostics without changing behavior or deadlines; rerun passed all seven
  checks. This does not establish a cause or fix for the initial timeout.
- Independent read-only review found no further blockers in hosted access,
  subprocess/IPC boundaries, packaging or Places routing.
- Imported the final PR198 runtime/test differences through `bc94c21` so the
  combined gate uses its response-aware intro handling and hosted routing fix.
- Added new journeys to full/browser profiles and hosted preview. Tooling 19/19
  passed. Broader desktop regression and full combined gate remain pending.

The broader `pnpm run test:desktop:e2e --dev` run exposed stale legacy sidebar
buttons, then an incorrectly selected Appearance tab for Graphics controls.
Updated the fixture to use current launchers/Graphics, complete account intro
claims before exit, and stub optional provider routes in development mode.
Both failure receipts/logs are retained under `.runtime/integration/`; final
native rerun is pending. An initial invocation without `--dev` was stopped in
its owned process tree before sign-in; it is not acceptance evidence.

Final broad native run: `RIVER_OAKS_DESKTOP_REPORT=desktop-integration-final.json
pnpm run test:desktop:e2e --dev` exited 0 with all native checks and zero page
errors. Moving optional provider stubs from Playwright interception to the local
Vite fixture server allowed the forced-crash replacement renderer to finish
loading. The prior hanging run was explicitly terminated and is not a pass.
The bounded recovery wait now fails instead of hanging indefinitely. Independent
review found no required issues in the fixture updates. Final full verification
runs with owned isolated Redis at `127.0.0.1:16411`.

## Full gate and latest-main reconciliation

- `REDIS_URL=redis://127.0.0.1:16411 pnpm run verify full` exited 0 on October 11
  at 07:04 UTC: all 17 tasks passed. Counts: 19 tooling, 2,586 preview, 415 Redis,
  31 desktop and 141 Python tests; ten experience and nineteen shared journeys.
  The existing Vince glazing negative-approach test skipped because its approach
  is already obstructed; that skip is not evidence about the glass.
- The gate started from the staged candidate, committed unchanged as `9ce3a4a`.
  Its complete binary patch SHA-256 is
  `7872bccb4efa1dc083d778ce264ce0cf35b85129b3d5b2a538f34d65f1dd9572`;
  the committed diff exactly matches the frozen tested patch. Final receipts and
  generated browser/native reports are preserved under
  `.runtime/integration/final-reports/`. Historical tracked receipts were restored
  after preserving the fresh results; no historical result was relabeled.
- Rebased the single feature commit onto the PR198 owner's reconciled head
  `5f409a3` as `ad0c985`. Its tree exactly matches the conflict-free merge
  simulation (`62b782b89325870b8236800acbaf714c54b8be3e`). Differences from the
  full-tested candidate are task tooling, documentation and package-script guards;
  gameplay, native runtime, browser fixtures and CI workflow are unchanged.
- Claimed primary reconciliation and renewed both integration claims. Applied the
  lifecycle owner's post-merge handoff for PR209, whose exact merge is `d3dbe639`.
  No source worktree was retired or modified.
- Primary is currently `20edac0` with all 28 staged paths unchanged. Its complete
  staged patch still hashes to
  `c4631e15712b9592ce377b7ef9b2b13ad44eedae32c8ed4882d90a58b605277a`.
  Eleven reports, two review documents and two source/test files match the candidate
  exactly; two spatial journeys preserve the original assertions with current-HUD
  and store-intro adaptations. The divergent pnpm lock and nine unrelated
  draft/native files remain preserved for the final primary reconciliation.

Next: verify the added task tooling/core gate, await PR198's hosted checks and
squash merge, rebase only the feature commit onto that final main with a tree
comparison, then publish and verify the integration PR. PR198 and this feature
integration remain unmerged at this checkpoint. Live provider/auth, signed
packaging, human accessibility, Unreal and production acceptance remain outside
this local verification scope.

Reconciliation checks finished: `pnpm run verify tooling` passed all 27 tests;
`pnpm run verify` passed all 11 core tasks. Independent final review found no
required findings and verified the preservation hashes. `project:check --github`
exited 1 only for the existing Storybook PR200 local/remote head divergence.
Receipts are retained beside the full result. The next prerequisite is PR198
landing; no additional runtime changes were introduced.
