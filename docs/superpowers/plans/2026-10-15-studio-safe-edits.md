# World Studio safe edits (#414, parent #413)

## Objective and ownership

Prevent accepted template-guided furniture edits from breaking required routes;
retain recoverable v1 drafts, one-batch undo and local save context. Branch
`fix/studio-safe-edits-414`, owner `codex-root-studio-safe-edits-414-20261015`.
Base/source: `dda596c58477e646ea6ae636eba9ca708562b2a6` (origin/main at pickup).
Primary live register claimed; other tasks and credentials preserved. The initial
handoff preserved uncommitted work; Val later requested continuation into signed
commit/draft-PR delivery. Merge, deployment and production operations remain excluded.

Own document/space validation, data-only world extraction, one route helper,
final inspector/gizmo/designer transaction integration, compact findings,
focused Studio tests, existing Studio journey and guidance. Shared world,
physics constants, assets and the #359 office work remain outside this scope.

## Recorded baseline, before implementation

2026-10-15: #413 and #414 read in full; no comments or linked implementation PRs.
Root/preview instructions, architecture, world direction, agent/project workflow,
World Studio, document/history/storage, recipes, walking, renderer, inspector,
gizmo, designer/chat and their tests inspected. Primary initially `1ebb44c9`,
only live register dirty; fetched remote main `dda596c5`. 18 existing worktrees;
created one isolated sibling for this scope. Project status receipt:
`/tmp/river-oaks-safe-edits-status.json` (unrelated lifecycle gaps preserved).

All four recipes have bounds `[-12,-11,12,10]` metres and arrival `[0,-8.5]`.
Controller: `walking.js`, radius 0.35 m, eye 1.68 m, support step <0.4 m,
normal speed 1.65 m/s, fixed 120 Hz substeps. Axes `(east,north,up)` map to
`(east,up,-north)`. Do not substitute the separate office controller envelope.

| ID | Objects | Existing required walk targets (east,north) |
| --- | ---: | --- |
| house | 44 | living (-2,-2), kitchen (-1,4), bedroom (2,3), bathroom (4,-2), patio (-2,-8) |
| office | 42 | reception (0,-4), work area (-2,1), meeting (3,1), kitchenette (-1,5) |
| boutique | 37 | sales (0,0), checkout (-4,3), fitting one (4,4), fitting two (6.5,4) |
| cafe | 41 | seating (0,-2), service (0,1), preparation (0,4.5), terrace (3,-8) |

Reproducible player-height camera stations for the next visual review: entry
`[0,-8.5]` facing north; primary = first listed target facing north; secondary =
third listed target facing north; exit = entry facing south; eye 1.68 m.
These are defined stations, not a claim that all station captures exist.
Baseline actual browser captures: `.runtime/safe-edits/baseline/`, including
`world-studio-template-2.png` and `world-studio-space-walk-2.png` for Garden Office.
Known defect: moving waiting-sofa to `(2,.9)` size `(.8,1.8)` blocks the meeting
opening while spawn stays clear. Existing stock grid-point tests do not assess
edits or movement segments. Visual realism and physical-device evidence unreviewed.

## Checks and evidence

- `pnpm install --frozen-lockfile`: passed, no credentials copied.
- `pnpm run agent:doctor` initially reported missing worktree Python environment;
  `uv sync --locked` installed it and the repeated doctor passed. `pnpm run agent:list` ran; initial receipts in
  `/tmp/river-oaks-safe-edits-{doctor,profiles}.txt`.
- `node --test preview/tests/studio-space-templates.test.js`: 4 passed, 0 skipped.
- `RIVER_OAKS_E2E_REPORT=studio-safe-edits-baseline.json pnpm run test:experience world-studio`:
  passed under repository browser lock, no page errors; `.runtime/safe-edits/reports/studio-safe-edits-baseline.json`.
- `node --test preview/tests/studio-safe-edits.test.js`: expected RED, 0 passed,
  1 failed, “Missing expected exception.” `.runtime/safe-edits/red.txt`.
  Structural validation and spawn clearance pass for the blocked candidate.

## Tested interface and source/profile version

Local implementation and verification complete; delivery/review remains queued.
The unchanged base HEAD is `dda596c58477e646ea6ae636eba9ca708562b2a6` plus this
uncommitted patch. Exact SHA-256 values for all 16 changed or relevant source/test
files, including unchanged `walking.js` and the catalog, are recorded in
`.runtime/safe-edits/source-manifest.json`; `.runtime/safe-edits/implementation.patch`
retains the source patch, including the new helper and tests. No commit/PR/merge
or deployment was performed. This is a tested local interface handoff for
#413/#414 and the #416 pilot owner, not proof of tracker delivery.

- `spaceAssessmentContext(templateId)` returns `{templateId, profileVersion:1}`.
  Four profiles use the existing recipe destinations and fixed recipe exit;
  required role IDs/kinds are explicit in `space-templates.js`. Names/labels do
  not grant identity. Profile changes increment the document revision and
  invalidate proposals. Future/unknown versions remain not assessed and the UI
  supports directly selecting a current program.
- `assessSpace(space, context, {revision, maxWork})` is the bounded pure helper.
  Result: `status` (`passed`, `blocked`, `not-assessed`), revision/context,
  controller `studio-walking-v1`, radius 0.35 m, eye 1.68 m, grid 0.25 m,
  work count, findings and paths. The default/hard maximum is 30,000 work units
  (expanded nodes and uncached edge checks). Exhaustion blocks. Grid nodes use
  integer offsets from arrival; every accepted edge runs `stepWalking` in both
  directions, including support checks. This is the existing discrete movement
  model, not a new continuous physics engine. Paths connect every destination
  to arrival and the fixed exit. Route output is current-assessment evidence,
  never a saved certification.
- `buildSpaceWorld` moved into the data-only `space-document.js`; its existing
  renderer export remains compatible. No collision radii, axes, limits,
  authority or rendering geometry changed.
- `doc.commitCandidate(value, {baseRevision, signal})` and existing inspector
  mutations share final validation/assessment. `doc.assessCandidate` permits
  detached preview but does not commit. `createStudioEditPreview` stages at most
  64 furnishing operations without saving or history; final structural, spawn,
  bounds and route checks still apply. Valid batches create one undo item.
- `doc.open(value, {assessmentContext})` deliberately admits structurally valid
  recoverable drafts, including route-invalid drafts. New template selection
  supplies context explicitly; bare imports clear it. Undo/redo snapshots keep
  both data and context. Stale revisions, cancelled requests, aborted candidates
  and cancelled/stale gizmo drags cannot commit.
- Local save shape: `{revision, region, assessmentContext:{templateId,profileVersion}}`;
  the optional two-field sidecar is bounded (ID <=32, integer version 1–10000).
  Bare v1 remains unchanged: export/import loses the sidecar and displays not
  assessed. Unknown context cannot pass; local conflicts and storage failures
  preserve current data/context. Route-invalid recovered drafts can save/export.
- Findings include `ruleId`, target/object IDs, route, revision and repair text.
  Existing selection/framing/inspector controls focus changed or nearby objects.
  Escape cancels a drag without accepting its preview or starting a stray orbit.
  Required-role restoration can use the original backup JSON for a missing ID;
  existing objects retain the inspector's kind control.

## Final evidence and completion audit

All commands below ran in the isolated worktree, with source frozen for final
runtime verification. Every browser/native run used the common repository queue.

| Requirement/gate | Current evidence |
| --- | --- |
| Four-template baseline and actual Garden Office before capture | Baseline table and 4/4 tests above; `.runtime/safe-edits/baseline/world-studio-template-2.png` and `world-studio-space-walk-2.png`, inspected |
| Previously accepted spawn-clear blocked meeting route | Expected failure in `red.txt`; fixed case passes in `studio-final-green.txt`; candidate retains data/revision/history |
| Final-only batch semantics, one undo/redo | Route-invalid intermediate batch passes; additional arrival-obstructed intermediate case first failed in `batch-spawn-red.txt`, then passed after detached staging; invalid final spawn/footprint still refused |
| Thin/rotated obstruction and checked return/exit | Free-endpoint segment regressions plus every returned segment replayed in both directions for all four profiles; support-height regression |
| Sidecar provenance and compatibility | Local reopen, unprofiled/name-independent imports, unknown/future versions, malformed files, region tests, stale saves/storage failures and byte-content-equivalent parsed v1 round trips |
| Stale/cancel/budget/required roles | Replace/undo/profile/reopen fences, cancelled designer and aborted candidate, budget exhaustion including Add, deleted/renamed/changed-kind required roles, fixed exit against relocated spawn |
| `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js` | **75 passed, 0 failures, 0 skips**; `.runtime/safe-edits/studio-final-green.txt` |
| `pnpm run test:desktop` | **69 passed, 0 failures/skips**, also rerun by final core |
| `RIVER_OAKS_E2E_REPORT=studio-safe-edits-accepted.json pnpm run test:experience world-studio` | **Passed**, 23.057 s, zero page errors; `.runtime/safe-edits/browser-accepted.txt` and `reports/studio-safe-edits-accepted.json` |
| Actual Studio repair journey | Inspector rejection, unchanged saved candidate, object focus, repair, undo/redo, local reopen, bare invalid import, explicit program selection, future-version reselection, four templates and existing region journey; actual gizmo intermediate/cancel/commit tested |
| `node scripts/browser-lock.mjs studio-safe-edits-desktop -- node desktop/studio-e2e.js` | **11 checks passed**; native profile reopen, bare-v1 space export/import, region export, isolation, unload choices and crash recovery; `desktop-accepted.txt` / `desktop-accepted.json` |
| `pnpm run verify` | **11/11 tasks passed**; tooling 109 pass; preview 3197 pass / 1 skip / 1 TODO; server 572 pass / 148 Redis skips; desktop 69 pass; Python 141 pass. Total **4088 passed, 149 skipped, 1 TODO**. Build, Ruff, demo and worktree secrets passed. `core-accepted.txt` / `core-accepted.json` |
| Patch hygiene | `git diff --check` passed; generated reports moved into owned `.runtime/safe-edits/reports/`, no unrelated tracked report replacement |

The demo verifier's exit 2 is its expected synthetic-fixture blocked result,
recorded as passed by the existing core profile. Core success does not certify
Redis/full/browser scope by itself. Full/isolated Redis was not run because this
patch changes only local Studio boundaries; the separate affected browser/native
journeys above ran explicitly. Hosted checks, packaged distribution, live auth,
physical-device performance and human keyboard/VoiceOver acceptance remain
unverified and are not implied by these results.

Final captures inspected: `output/playwright/world-studio-safe-edit-blocked.png`,
`world-studio-safe-edit-reopened.png`, and `world-studio-safe-edit-narrow.png`.
The blocked capture shows rejected-route details and selection buttons alongside
the visible world; narrow capture shows the program/status without horizontal
overflow. macOS browser harness uses Chromium/ANGLE Metal on this Apple M3 Max;
these are functional captures, not target-device performance certification.
Four-template assessment receipt: `four-template-assessment.json` (368–4724 work
units; 12–83 ms in a concurrent verification run). Earlier focused cold timings
were 4–31 ms; no universal frame/performance threshold is claimed.

One browser attempt failed when an imported source module changed at precisely
11:20:47Z, reloading the editor and removing the selected inspector during the
journey (`reports/studio-safe-edits-browser-final.json`). The captured state read
“Saved draft reopened”; this was diagnosed before rerunning with frozen source.
Both subsequent frozen-source journeys passed, including Escape cancellation.
A focused regression caught an accidentally changed missing-operations error
message during staging work; the original message was restored before the final
75/75 and core runs. No repeated unchanged full-suite retry was used.

## Initial handoff / exact next action

The task is queued for Val/design review in the primary live register, with the
session claim released and the verified source/captures retained. Review the
current recipe destination/role table for #416, then authorize commit/PR delivery
if desired. The pilot can consume `spaceAssessmentContext`, `spaceRouteProfile`,
`assessSpace`, and the final document transaction interface above without waiting
for art or publisher work. No external issue comment was posted.

Do not retire/archive this worktree: it contains the complete uncommitted patch
and local evidence. No delivered/retired task status, PR, merge or production
acceptance is claimed. Other owners' tasks/worktrees remain preserved.

Handoff reconciliation: initial inventory was 18 worktrees / 20 local branches;
final inventory is 18 worktrees / 21 local branches (other owners changed their
own inventory during this session; this task created one worktree/branch and
removed none). `project:check --github --tasks <primary>/docs/project-management/tasks.json`
returned 1 for five unrelated gaps: expired iOS/dominoes ownership, iOS PR-head
mismatch, and two pending office retirements. No #414 gap was reported. The
register remains valid. Final `plans-index --check` and `git diff --check` passed.
Implementation patch SHA-256: `5aaccf73ba85be432fa240ca1ff75cf5bf0a3e48463a9d238a1907b76af1dc8d`.
After final runtime gates, the thin-obstacle test was made explicit about its
wall / rotated chair / rotated sofa fixtures and the focused suite reran 75/75;
runtime source hashes remained unchanged. The manifest records this distinction.


## Resumed delivery and independent review (2026-10-15)

Val requested continuation and then retry. Reclaimed the primary live task and
continued into verified commit/draft-PR delivery. Fast-forwarded this owned branch
to current main `cd99570a6d1ff4171c83637744d38cc8131a2684`, restoring only this
session's recorded stash. No upstream Studio/walking/native source overlaps;
register merge and generated index reconciled. Other worktrees were preserved.
The earlier no-commit handoff and its hashes are historical evidence.

Fresh review identified two Important gaps, both addressed:

- A maximum-size synthetic blocked layout took about 506 ms synchronously, which
  established the need for a worker under the issue's explicit latency exception.
  Studio now supplies `assessmentRunner` to the document; a dedicated module
  worker runs the existing pure assessment. One bounded active job is allowed;
  supersession, abort and editor teardown terminate it. Worker errors and a
  10-second transport timeout fail closed. The pure synchronous helper remains
  available to offline tests; the browser never runs its route search directly.
- A recovered draft missing `meeting-table` could not restore that protected ID
  through ordinary Add. `doc.restoreRequiredRoles()` now reconstructs absent
  required IDs from the explicitly selected recipe and repairs their kinds,
  preserving all other object data. The full restoration candidate uses the
  same final route/structural checks, creates one undo entry, and rolls back
  completely if it would block arrival or another required route. The existing
  findings panel offers **Restore required furnishings**.

Browser mutations may now return promises. Their candidates remain detached
while checking; revision/context/signal are rechecked after the worker response.
`refreshAssessment()` checks accepted state without blocking render, displays a
pending state, and ignores superseded results. Rejected refresh promises are
cleared so the same revision can retry. Background completion updates only the
assessment section, preserving active inspector text. Undo/open/reopen/profile
changes cancel pending jobs. Walkthrough cancels pending edits; its pointer/touch
return control stays available, and returning restarts any cancelled refresh.
Agent/designer preview/apply await assessment, lock duplicate apply, and retain
cancellation. Their detached preview API and existing 64-operation limit remain.

Review-specific behavioral evidence:

- `studio-safe-edits-async.test.js` initially failed 0/7 before the APIs existed;
  its final 8/8 includes isolated async commits, blocked/failed worker rollback,
  ignored late replies after open/undo/profile/restore, caller abort, pending
  accepted-state refresh, retry after abort, missing-role reconstruction and
  invalid-restoration rollback.
- `studio-assessment-runner.test.js` passes 3/3, including execution of the actual
  module worker in a real Node worker thread, worker termination on replacement/
  abort/disposal, ignored late messages, transport/error cleanup.
- Browser journey adds missing-table/sink restoration, preserves unrelated objects,
  tests whole-restoration undo/redo, and uses the actual pointer return from walks.
- Fresh final read-only review found no remaining Important or Critical findings.
- `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js`:
  **86 passed / 0 failed / 0 skipped**, `.runtime/safe-edits/delivery-focused.txt`.
- Worker-backed `world-studio` journey: **passed 24.885 s, zero page errors**;
  `data/reports/studio-safe-edits-worker-browser.json` (retained under `.runtime`
  before delivery). Source was frozen before the browser began its fixture.
- `pnpm run verify`: **11/11 tasks passed** on current-main implementation;
  tooling 109, preview 3223 pass / 1 skip / 1 TODO, server 572 pass / 148 Redis
  skips, desktop 69, Python 141. Total **4114 passed / 149 skipped / 1 TODO**.
  `.runtime/safe-edits/review-core.txt` and `.runtime/agent/core.json`.
- The first native rerun reached nine checks before a fixture's absolute prompt
  count raced with the added bare-import/reload discard prompt. Its navigation/
  close checks now count exactly one new prompt per action relative to their
  own baseline. No application permission or unload behavior was relaxed.
  Native/agent/designer final receipts are recorded below when settled.

Delivery remains separate from merge/production/human acceptance. No merge,
deployment, paid provider call, or production operation is authorized or performed.

Final resumed receipts: native Studio **11/11** (`review-native-fixed.txt`),
synthetic agent **13/13** (`review-agent-native.txt`), designer **9/9**
(`review-designer-native.txt`). All passed through the shared browser queue;
agent/designer use synthetic executables and local acceptance identities, with
no paid inference or real-provider authentication. The agent test now waits for
the assessed batch's actual applied status before reading its changed values.
Final source/profile hashes: `.runtime/safe-edits/delivery-source-manifest.json`.
The original source manifest and patch above remain historical, unchanged.
Signed commit and draft PR are the remaining delivery actions; merge is excluded.
