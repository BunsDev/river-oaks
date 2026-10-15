# Generated creator-region interior documentation

Objective: make the published creator-region format usable for building-anchored, seeded multi-level interiors without implying that legacy one-room regions are migrated, and keep its hosted creator acceptance reliable.

Owner: `codex-root-20261014-creator-ci` (handoff from `codex-root-20261014-creator-docs`). Branch/worktree: `docs/procedural-creator-interiors-20261014` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-creator-interior-docs-20261014`, stacked on draft PR #356 head `c2e8f27b0f8b22339370129b28c4a658f6ec6d6a`.

Files owned: `docs/creator-regions.md`, `preview/e2e/creator-objects.js`, this ledger, plans index, and this task's branch-register entry. The primary checkout's live task register was claimed before worktree creation; unrelated dirty work was preserved.

## Contract checked

- `server/region-package.js` accepts optional `buildings[].interior.generation`, compiles it through the pure generator, and stores the approved plan digest. The package remains schema version 1; legacy interiors without generation retain their existing behavior.
- `preview/src/building-interiors-plan.js` bounds generator version, level count, seeds, unique overrides, targets, materials, placement clearance and roof fit. The documented example uses the sample region's real `moon-pavilion` and its tested two-level form.
- `docs/world-studio.md` describes the preview, authored-edit and untouched-level regeneration controls. The creator-region guide now links that authoring flow to the publishable JSON field and server approval boundary.

## Checks and results

The documented `moon-pavilion` object compiled through `compileRegionPackage` with two approved levels, an overridden concrete floor and a 64-character plan digest. `node --test server/tests/region-package.test.js` passed 13/13 with zero skips. The example uses the exact schema that the server accepts; the test does not exercise a published production world.

`pnpm run verify` passed on the guide and ledger source (`.runtime/agent/core.json`): source checks, preview/server/desktop/Python tests, build and secret scan. Core skips Redis and browser acceptance. `pnpm run plans:index` generated one new index row; `pnpm run test:agent` passed 76/76. The branch register diff adds only this task. `git diff --check` passed. `pnpm run project:check --tasks <primary>/docs/project-management/tasks.json` exited 1 for existing unrelated reconciliation gaps, including an older register stash and missing branches; it did not report this task as unregistered. Target-device, human visual, merge and deployment acceptance are not claimed by this ledger.

## Hosted creator acceptance failure

Draft PR #357 opened at signed head `94875bffa33afe76d4f9ad698eda9a7dc2d335aa` on #356. Its hosted run `38545421564` passed eight checks, including the required shared suite, but `preview shared (worlds-and-creator)` and its aggregate `preview` failed in `creator-objects.js:83` after 60 seconds waiting for a saved copy. The artifact `11884338342` shows the owner connected with no page errors, the saved design present, zero town creations, and the builder's message “A neighbor is standing there.” The docs commit did not modify this journey. The preview was clear before clicking, but a moving resident occupied the spot before the server accepted the placement. The journey now re-aims after this specific transient rejection, up to four attempts, and continues to require a successful authoritative build and peer rendering.

`RIVER_OAKS_SHARED_JOURNEY=creator-objects RIVER_OAKS_SHARED_REPORT=../../.runtime/creator-objects-pr357-local.json pnpm run test:shared creator` passed on local Mac Chromium: 17 checks in 31.443 seconds with both browsers. `node --check preview/e2e/creator-objects.js` and `git diff --check` passed. `pnpm run verify` passed on the edited journey, task entry and ledger (`.runtime/agent/core.json`, finished 2026-10-14 10:05:06 UTC). Core does not include Redis or browser acceptance; the focused browser journey supplies the latter on local hardware. Hosted Linux software rendering still must rerun on the new head.

## Next action

Commit/push the verified retry on #357, then check all exact-head hosted jobs. Preserve the stack and worktree while broader visual, target-device, and merge gates remain open.

## Main integration, 2026-10-14

PR #356 landed as `f171d7112651d45d61259c830d4d37b8ed9be717`. Merged current main into this branch without conflicts and reconciled the #355–#357 live task rows. The integrated server region-package suite passed 13/13, and `RIVER_OAKS_SHARED_JOURNEY=creator-objects RIVER_OAKS_SHARED_REPORT=../../.runtime/creator-objects-main-merge.json pnpm run test:shared creator` passed with both local browser clients. `TMPDIR=/Volumes/Passport/river-oaks-agent-tmp-contact pnpm run verify` passed core. Hosted exact-head checks remain required after push. This is documentation plus a retry for the specific transient occupied-placement response; server authority and the successful peer-render assertion remain in the journey.
