# Contextual actions and photo UX implementation plan

> Execution: subagent-driven-development for independent photo work; focused tests,
> spec review and quality review before completion. No commit/push/merge authorized
> for this new task by the earlier skill-suite delivery request.

## Goal and architecture

Implement all four improvements in the supplied brief: one primary contextual
walking action with secondary actions available; player-oriented command labels;
session-retained photos with explicit discard/replacement; visible framing values,
output dimensions and current graphics-quality limitation. Preserve E/F/Z keys,
server authority, auth fixtures, focus recovery and the existing plain JS/CSS UI.
Photo storage remains one in-memory capture, not persistent device storage.

Baseline: clean `main` b058391; branch `feat/contextual-photo-ux` in canonical
checkout. Native/reference worktrees own unrelated engine/geometry work.

## Owned files and steps

- [x] Walking: `preview/src/walking-ui.js`, `walking.css`, focused contextual
  action helper/tests and browser journey. Select a stable primary action from
  currently available stand/talk/enter/interact/meet options, expose secondary
  buttons under More actions, revalidate availability on activation. Keep keys.
- [x] Navigation: `preview/src/rail-navigation.js` and existing browser journey.
  Replace rail-oriented commands with Explore/Activities/People/Character/Camera
  language; retain existing shortcuts and search discoverability.
- [x] Photo: `preview/src/photo-mode.js`, `photo-mode.css`, `main.js` integration,
  photo browser regression, optional focused state helper/test, `docs/photo-mode.md`.
  Keep capture through close/reopen/back-to-camera; replace only after successful
  encoding; discard explicitly; bound URLs and invalidate late callbacks. Values
  show degrees/meters, output uses actual crop/cap, quality uses current provider.
- [x] Verification: add/run failing behavior tests first; focused units/browser;
  first visit arrive→destination→enter→interact→photo→walking at wide/narrow sizes;
  keyboard, touch pad and real fixture reconnect. Inspect screenshots. Run core
  gate and applicable shared journey. Record actual results and proof limits.
- [x] Independent spec and quality review, actual diff inspection, final handoff.

## Acceptance and limits

No rendered or human-accessibility claim follows from unit tests. Run real fixture
browser journeys; human keyboard/VoiceOver, camera comfort, native Unreal, live auth
and OS share-sheet completion remain separate evidence. Keep generated historical
reports separate; use task-specific receipts under data/reports and screenshots in
output/playwright. Never read credentials or call paid services.

## Results and next step

Implementation is complete. The canonical branch is `feat/contextual-photo-ux`;
its HEAD advanced to `7c0b697` during concurrent native delivery. This task's web
edits remain uncommitted. Preserve unrelated `unreal/Config/DefaultEngine.ini`
untracked `unreal/Config/DefaultInput.ini`, and concurrent
`docs/superpowers/plans/2026-10-07-desktop-refresh.md`.

Verified so far:

- Focused unit command: `node --test preview/tests/contextual-action.test.js
  preview/tests/photo-camera.test.js preview/tests/keyboard-input.test.js` — 9 pass.
- `npm run verify -- full` with owned ephemeral loopback Redis — dependency audit,
  17 agent tests, 656 preview tests, 379 server/Redis tests (no skips), 9 desktop tests,
  production build, Ruff checks, 139 Python tests and synthetic demo checks passed.
  The expected offline demo verification exit was 2. Worktree secret scan failed;
  remaining aggregate tasks were not run. Metadata-only redacted diagnosis located
  one `generic-api-key` finding at unrelated `unreal/Config/DefaultEngine.ini:22`.
  No credential values inspected, no scanner exclusions added, native work untouched.
- `gitleaks git --log-opts=--all --redact --no-banner --ignore-gitleaks-allow` —
  252 commits scanned; no leaks found.
- `npm run test:experience -- photo-mode` — final photo receipt `photo-ux.json`
  records 35 passing checks. Photo HUD transition delay was reproduced and fixed
  by disabling transitions only while hidden for photo mode.
- `RIVER_OAKS_E2E_REPORT=contextual-acceptance.json npm run test:experience --
  contextual-first-visit rail-navigation photo-mode connection-required sit-and-water`
  exited 0: all five journeys passed (navigation 79 checks, photo 35, reconnect 8,
  sit/water 21). Both desktop and 390px touch-context first-visit runs passed,
  including real touch press/release movement. The journey mixes keyboard, mouse
  and touch: this is not touch-only acceptance. Receipt: `data/reports/contextual-acceptance.json`.
- `npm run verify -- browser` built successfully; email-access security test passed,
  debug-readout failed fetching its dynamic module. Unchanged standalone debug
  test then passed; exact `npm run test:security:e2e` rerun after development Vite
  fixtures stopped passed 2/2, exit 0. Original failure was transient; possible
  optimizer-cache contention was not established and no speculative patch added.
- `npm run test:reflections:webgl` passed real PCF shadows, capture and reload checks.
  `RIVER_OAKS_SHARED_REPORT=contextual-shared.json npm run test:shared` completed:
  17/18 journeys passed, exit 1. The sole failure was an old `character & abilities`
  search in `rail-shared.js`; changed the fixture search to `character` for the
  requested new label while preserving focus, permission and builder assertions.
  `RIVER_OAKS_SHARED_JOURNEY=rail-shared RIVER_OAKS_SHARED_REPORT=contextual-rail-shared.json
  npm run test:shared -- development` then passed, exit 0. All 18 shared journeys
  have passing evidence across the broad run and focused correction rerun; the
  historical broad-run receipt remains failed, not rewritten as an aggregate pass.
- Source quality and final spec reviewers found no implementation blocker.
  Root inspected desktop contextual-action, narrow walking and photo-composition screenshots;
  narrow metadata is visible and underlying HUD hidden. Actions remain scrollable.
- `git diff --check -- preview docs` passed. Global check includes unrelated native
  whitespace; it is not represented as clean.

Final audit: all four requested behaviors and the promised local first-visit,
keyboard, narrow/touch-control and reconnect coverage are implemented and verified.
No implementation blocker remains. The aggregate `full` and first browser-profile
receipts remain failed for the separately recorded reasons; individual remaining
browser tasks and history scan were run to completion. No claim of an aggregate
green gate. No source weakening or scanner waiver was used.

Delivery remains pending: no commit, push or merge for this UX task. Resolve the
native scan finding with its owner and rerun the aggregate gate before delivery.
Human accessibility, touch-only usability, camera comfort, native Unreal, live auth,
actual OS share-sheet completion and hosted CI remain unverified. Preserve branch
until delivery; do not archive a worktree with these undelivered edits.


## Follow-up: remaining blockers

The user explicitly requested finishing verification and resolving remaining
blockers. The generated Android FileServer settings are now within that bounded
follow-up scope: disable the service/network and leave the token empty to prevent
engine regeneration. No other native settings/input or desktop work were changed.
See `2026-10-07-contextual-ux-verification.md` for the root cause and fresh aggregate
run. This supersedes the earlier handoff's unresolved secret-scan status when the
new run completes; the original shared failure report is preserved separately as
`data/reports/contextual-shared-initial.json`.


Final follow-up result: `npm run verify -- full` passed all 16 tasks, including
both secret scans, browser security and all 18 shared journeys in one run. The
local verification blocker is resolved. Current evidence and limits are recorded
in `2026-10-07-contextual-ux-verification.md`. Commit/push/merge remain pending.


Delivery authorization: the user subsequently requested commit, push, merge to
main, comprehensive PR/branch/worktree cleanup, and a release after the queue is
resolved. See `2026-10-07-release-0.1.4.md` for delivery and release evidence.
