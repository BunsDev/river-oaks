# Generated creator-region interior documentation

Objective: make the published creator-region format usable for building-anchored, seeded multi-level interiors without implying that legacy one-room regions are migrated.

Owner: `codex-root-20261014-creator-docs`. Branch/worktree: `docs/procedural-creator-interiors-20261014` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-creator-interior-docs-20261014`, stacked on draft PR #356 head `c2e8f27b0f8b22339370129b28c4a658f6ec6d6a`.

Files owned: `docs/creator-regions.md`, this ledger, plans index, and this task's branch-register entry. The primary checkout's live task register was claimed before worktree creation; unrelated dirty work was preserved.

## Contract checked

- `server/region-package.js` accepts optional `buildings[].interior.generation`, compiles it through the pure generator, and stores the approved plan digest. The package remains schema version 1; legacy interiors without generation retain their existing behavior.
- `preview/src/building-interiors-plan.js` bounds generator version, level count, seeds, unique overrides, targets, materials, placement clearance and roof fit. The documented example uses the sample region's real `moon-pavilion` and its tested two-level form.
- `docs/world-studio.md` describes the preview, authored-edit and untouched-level regeneration controls. The creator-region guide now links that authoring flow to the publishable JSON field and server approval boundary.

## Checks and results

The documented `moon-pavilion` object compiled through `compileRegionPackage` with two approved levels, an overridden concrete floor and a 64-character plan digest. `node --test server/tests/region-package.test.js` passed 13/13 with zero skips. The example uses the exact schema that the server accepts; the test does not exercise a published production world.

`pnpm run verify` passed on the guide and ledger source (`.runtime/agent/core.json`): source checks, preview/server/desktop/Python tests, build and secret scan. Core skips Redis and browser acceptance. `pnpm run plans:index` generated one new index row; `pnpm run test:agent` passed 76/76. The branch register diff adds only this task. `git diff --check` passed. `pnpm run project:check --tasks <primary>/docs/project-management/tasks.json` exited 1 for existing unrelated reconciliation gaps, including an older register stash and missing branches; it did not report this task as unregistered. This is a documentation-only change; browser, target-device, human visual, merge and deployment acceptance are not claimed by this ledger.

## Next action

Verify the exact documented example and limits against the current server compiler, then commit and prepare a draft docs PR with its required checks.
