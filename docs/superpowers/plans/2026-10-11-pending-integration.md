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
- No integration commit, push or merge yet. Do not archive this worktree.

## PR198 local reconciliation results

- All seven conflicts resolved, retaining both feature sets and pnpm argument semantics.
- Reproduced rail failure in combined tree: first indoor staff meeting opened the new store intro modal; shortcuts correctly yielded to the modal. Explicitly complete intro before rail assertions. Updated store-intro journey for current HUD.
- `pnpm run test:experience rail-navigation store-intro game-hud`: all three passed. Report `.runtime/integration/pr198-focused-browser.json`.
- `pnpm run verify`: passed all core tasks; `.runtime/integration/core.log`, `.runtime/agent/core.json`. Redis/browser/native remain outside core.
- `pnpm run verify tooling` after catalog/CI changes: 19 passed, zero skips.
- Added store-intro to hosted and full browser acceptance. Independent read-only code review found no blocking issues.
- Full local gate uses owned Redis at loopback port 16411; hosted checks and merge remain pending.
