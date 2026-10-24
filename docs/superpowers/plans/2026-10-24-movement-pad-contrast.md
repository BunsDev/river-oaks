# Walking movement control contrast

## Objective and ownership

Restore readable movement arrows and floating notices in the HUD while preserving dark theme, pointer held feedback, keyboard focus and announcement behavior. Task `movement-pad-contrast-20261024`, owner `codex:mvp-regression-20261023`, branch `fix/movement-pad-contrast-20261024`. Own `preview/src/hud-glass.css`, the focused `preview/e2e/walking-controls-contrast.js` browser regression and this ledger. Reuse the regression checkout; preserve other integration owners and their jobs.

## Reproduction

The full-suite narrow capture showed pale arrows on the pale console. Diagnostic `.runtime/mvp-regression/contrast-probe/report.json` uses actual static walking markup and the built walking CSS, in light/dark themes over white/black backgrounds with software-rendering near-opaque glass. The recorded computed colors and alpha-composite calculation give light-theme ratios 1.046–1.113; an inline theme-token correction gives 9.390–10.030. Both before/after images were inspected. The calculation excludes the HUD gradient and live backdrop, so it is a bounded fixture result, not general accessibility acceptance. Initial probe failed before browser launch because the build has two main CSS bundles; its log remains preserved.

## Implementation and verification plan

1. Add a browser regression using the actual loaded HUD, checking six movement controls in light/dark themes and normal, hovered, held and keyboard-focus states. Observe the failure before source changes.
2. Use existing HUD foreground, tile and border tokens for movement buttons, including explicit hover/held feedback. Retain the existing focus ring and input semantics.
3. Run the focused regression, inspect captures, then `pnpm test`, `pnpm run build` and `pnpm run verify`. Obtain independent review and exact-head hosted evidence before guarded delivery.

## Current state and limits

The CSS correction and permanent regression are implemented. The first loaded-HUD run failed during setup; its receipt is preserved. The corrected pre-fix run reproduced arrow and notice contrast failures. Post-fix browser and core verification completed successfully as run 67945. Token arithmetic rejected the dark action/white held pair at 3.672:1; the implemented raised-tile and ink pair remains subject to rendered validation. Independent review found no blocking source defects. Focus checks cover visible focus styling after keyboard input and programmatic focus, not sequential keyboard reachability; pointer checks cover held/release feedback, and notice text is a fixture. This task does not close actual movement, announcement delivery, human screen-reader acceptance, intermittent storefront timeout, Market performance or broader release readiness.

## Floating-notice reproduction added before browser start

Market journey002 captures show dark lantern-result text over scene paving. The notice is absolutely positioned above the console; its tile tint does not receive the console background beneath it. Recorded three inspected image hashes and the separate top-notice overlap in `.runtime/mvp-regression/market-visual-review.json`. Run 38712 was confirmed still queued before extending its harness to check the actual notice surface with fixture text in both themes. The harness now collects all contrast failures and captures before throwing, so the same queue turn covers both defects. Reduced motion avoids transition-state captures. Syntax validation passes; rendered results and all CSS corrections remain pending.

## First loaded-HUD run: setup failure retained

Run 38712 exited1 after64.874s: the movement-controls toggle was hidden because the narrow layout hides the walking console while Town chat is open (`game-hud.css`). Assets102/102 loaded, player ready, Metal rendering and no page errors. Inspected the screenshot and preserved the report, image and exact harness under `.runtime/mvp-regression/contrast-first-setup-failure/`; the original log remains intact. This is not the expected contrast red. Added a real click on the open Town chat summary before opening movement controls; no product CSS changed. Rerun must first establish actual contrast failures.

## Reproduced contrast failures and correction

The corrected pre-fix run finished at2026-10-24T04:24:13Z in7.788s with expected failures: light arrows approximately1.1–1.4:1 across normal, hover, held and focus states; light notice minimum1.81:1 and dark notice minimum1.18:1 over tested backdrop extremes. Preserved the report, exact pre-fix CSS/harness and screenshots with hashes in `.runtime/mvp-regression/contrast-red-002/`. Pointer held/release and focus assertions reported no failures.

Applied scoped CSS rules using theme ink and tile tokens, explicit hover tint, raised tile with focus-colored border while held, and a standalone glass background/filter for notices above the console. Input and announcement code is unchanged. Run67945 queues the focused browser regression followed by `pnpm run verify` (including preview tests and build); independent review is in progress. No passing post-fix or delivery claim yet.

Retirement: this checkout contains active, undelivered contrast work and retained regression receipts, so preserve it. Earlier PR619 delivery does not authorize deleting these later edits. A current project inventory is running; other owners retain their worktrees.

## Independent review

Reviewer `review_hud_contrast` found no blocking source defects. Existing SVG inheritance, pointer handlers, focus outline and polite status markup remain intact. Addressed the minor stale current-state paragraph. Review did not run browser checks; Focused/core verification passed; all ten captures were inspected, with the light-notice occlusion limit below.

## Verified delivery checkpoint

Run 67945 exited 0. `pnpm run test:experience walking-controls-contrast` passed 76 checks in 9.888 s with minimum calculated contrast 5.072:1. `PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH pnpm run verify` passed all eleven core stages, including `pnpm test` and `pnpm run build`; the demo verifier intentionally returned its expected blocked-fixture exit code. Preserved focused/core receipts, exact source hashes and source-only patch under `.runtime/mvp-regression/contrast-handoff/`. CSS and harness hashes still match the focused handoff. Core excludes Redis/full-browser/native/live-auth/production acceptance.

Inspected eight control-state and two notice captures. Arrows, held feedback and focus rings are readable. The dark notice is readable; the light-notice capture is partially covered by the transient District ready badge, so unobstructed light-notice visual acceptance is not established by that image. The PR 623 owner accepted the immutable source-only handoff and will compose it after its current verification, preserving status-stack layout, then obtain candidate browser evidence. This does not transfer task ownership or relabel donor evidence.

Retirement inventory at2026-10-24T06:21Z classified this branch active and the earlier PR619 branch as a retirement candidate lacking owner/session release; no eligible retirement was established. Preserved the inventory at `.runtime/mvp-regression/retirement-inventory-20261024.json`. This active checkout retains undelivered work and raw receipts.
