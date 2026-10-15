# Character Studio #440–#444 execution ledger

## Objective and sequence
Deliver all five issue acceptance criteria: #440 contract and baseline; #441
reversible editor; #442 validated assets and native 4K capture; #443 authoritative
persistence and replication; #444 complete verification and release decision.
No merge, deployment or paid provider calls are authorized.

## Current ownership and status
Task `cancelled-feat-character-studio-20261013`; session
`codex-character-studio-20261015`; checkout `../river-oaks-character-studio`;
branch `feat/character-studio-editor-20261015`, stacked on contract PR #457.
The primary live register owns coordination. This checkout originally started
at `6dac1b21`; current editor base is `b6ef443e`. Preserve the earlier archive at
`3fdc842a` and all other sessions' work. Do not archive this active checkout.

| Issue | Evidence and remaining work |
| --- | --- |
| #440 | Verified contract, actual human/fox fixtures, measured baseline and draft PR #457. Research report unavailable; maintainer review outstanding. |
| #441 | Local reversible editor implemented; 21 desktop/touch/keyboard/recovery browser checks passed. Core/regression/final wave checks pending; editor PR not yet created. |
| #442 | Sable color slots validated on actual rigs; native 4K helper has 3 unit tests but is not wired/browser verified. Walking skirt clipping, catalog/pose/asset quality, golden/device/crowd measurements remain. |
| #443 | No server publication changes yet. Durable owner drafts, immutable revisions, CAS/retry/rollback/deletion and authoritative peer integration remain. |
| #444 | Full two-player/failure/device/accessibility/usability/rollout acceptance remains. Automation is not human acceptance. |

## Current next action
Finish the existing queued verification processes, inspect rendered evidence,
record exact results and deliver a signed editor-only commit/stacked draft PR.
Keep the unfinished portrait helper out of that commit. Continue #442 rendering
and compatibility, then #443 publication and #444 acceptance. No merge/deploy or
paid provider authorization. Named physical phone and golden targets are pending.

## Historical first-increment evidence
Inspected root, preview and server instructions, architecture and lifecycle docs.
Earlier archived player-avatar/shared-appearances/avatars match their old base;
no dirty implementation was recovered. Deep Research report was neither supplied
nor located; do not attribute invented conclusions to it.

## First increment results (2026-10-15)
- Added `character-definition.js`, pinned `character-assets.js`, actual rig tests
  and `character-contract` browser fixture. Player loader now resolves contract.
- `pnpm install --frozen-lockfile`, `uv sync --locked`: passed; no env copied.
- `pnpm run agent:doctor`: initially missing Python environment; passed after sync.
- `node --test preview/tests/character-definition.test.js preview/tests/beast-forms.test.js`:
  14 passed, 0 failed/skipped (`/tmp/river-studio-contract-tests.log`).
- `pnpm run build`: passed (`/tmp/river-studio-build.log`).
- Core verify running; tooling and preview suites passed in runner receipt;
  server suite running. Final result not yet established.
- Browser `player-forms beast-movement` and `character-contract` queued behind
  live browser-lock owner PID 65043; no bypass. No rendered evidence yet.
- Read-only independent contract review: no blocking correctness/security or
  permission regressions; contract suite rerun 6/6. Review explicitly retains
  missing rendered/performance and full-issue acceptance gaps.
- GLB inventory measured in design doc; does not establish runtime performance.
- Archived player-avatar/shared-appearances/avatars source bytes match recorded
  archive base `3fdc842a`, so there was no dirty implementation in these seams
  to recover. Archive and all unrelated work remain preserved.
- Progress posted to #440: https://github.com/BunsDev/river-oaks/issues/440#issuecomment-6201228854

## Historical acceptance audit before first checks finished
#440 decision/contract/fixture implemented, pending final verification, rendered
inspection and reviewable PR link. Research report inaccessible. No claim of
completed baseline or downstream issues. #441 editor, #442 compatibility/4K,
#443 durable publication/replication and #444 E2E/usability/release remain open.

Follow-up: continue this same checkout/task; inspect live handles and receipts,
finish queued checks without restarting live runs, inspect human/beast captures,
record baseline, then commit verified increment and open PR. Continue #441–#444
in dependency order; do not merge, deploy or use paid providers.

Core gate finished: `pnpm run verify` exit 0; `.runtime/agent/core.json` status
passed. Tooling 112/112; preview 3302 pass, 1 skipped, 1 todo; server 598 pass,
153 Redis-dependent skips; desktop 69/69; Python 141 passed (66 warnings).
Build, lint/format, synthetic demo verification and secret scan passed. This
excludes Redis, browser, native, live-auth, target-device and human acceptance.

Browser gate finished on the first increment:
- `pnpm run test:experience player-forms beast-movement`: passed, 139 + 17 checks.
  Preserved report `.runtime/character-studio/forms-and-movement.json`.
- `pnpm run test:experience character-contract`: passed, 4 checks; report
  `.runtime/character-studio/contract-browser.json`; both 1440×1000 screenshots
  inspected with actual rendered human/fox geometry and textures visible.
- Short whole-world p50/p95 frame intervals: human 16.7/33.3 ms; fox 16.7/33.4 ms.
  Full statistics and evidence limits recorded in design doc. Proposed desktop
  p95 target is not met by this sample; no final quality/performance claim.
- Signed commit `0730ff45` pushed; signature verified and forbidden-attribution
  check printed nothing. Background Git pack-refs hit installed ref guard;
  commit and push succeeded, no guard bypass performed.
- Draft PR https://github.com/BunsDev/river-oaks/pull/457; no merge authorization.

#440 now has a reviewed design, versioned contract, actual human/beast fixtures,
permission/migration tests and measured/rendered baseline in this PR. It remains
open pending maintainer review. Full goal remains active: next implement #441's
staged reversible editor using compatible authored controls, coordinate #442
catalog/preview rendering, then #443 publication and #444 acceptance. Native 4K,
modular customization, Redis publication, crowd/device matrix and human usability
are still unimplemented/unverified. Do not archive this active checkout.

## Editor increment (#441 with #442 compatibility seam)
Branch `feat/character-studio-editor-20261015` stacked on #457, same checkout.
Previous turn classified as progress: implemented, verified and pushed contract.

Design: a garden atelier with a large slate-green cyclorama/live character on the
left and a compact paper control panel on the right. Reuse Optima/Candara display,
Avenir body and existing forest/ink/paper tokens; accent colors come from the
character wardrobe. The character itself is the focal point. Mobile stacks the
preview over scrollable controls. Native modal focus, touch sliders, keyboard
controls and reduced motion are required.

Implement validated Sable dress/hair palettes first, on both actual forms; preserve
v1 authored definitions, introduce v2 for customization. Stage locally with bounded
undo/redo, deterministic randomize, comparison and owner-scoped favorites. Separate
preview scene with disposal and late-load fences; idle/walk/greet preview plus
camera, lighting and turntable. Existing town appearance stays authoritative;
custom publication is #443, and the UI must clearly label session-only drafts.

Checks: state/history/ownership tests, actual rig material isolation/restore tests,
editor browser desktop/mobile/keyboard/reduced-motion/cancel journey, captures,
core verification and review. No claim of full #441 until all criteria proven.

Editor implementation now includes strict v2 Sable dress/hair palettes (v1 remains
readable), authored material slots with restoration/sibling isolation tests,
bounded draft history, full/portrait camera, daylight/warm light, idle/walk/wave,
turntable, compare, randomize and owner-scoped favorites. Publishing remains #443.
Focused contract/state/material/beast suite: 20 passed, no skips. Production build
passed. Review found stale failure and storage fallback issues; fixed with a
latest-load loop, late-disposal regression tests and session fallback preservation.
Recovery/state/material suite: 8 passed. Core and browser checks still running or
queued; their completion must be inspected before commit. Previous #457 hosted
checks now all success/neutral at b6ef443e; no merge performed.

Verification recovery: initial editor journey passed its desktop interaction path
and produced inspected human/fox color captures, then timed out at 30 s while the
separate phone context loaded. Added the runner's 60 s timeout to new contexts and
loading diagnostics; no production behavior was relaxed. Animation inspection found
Wave used the wrong action name; mapped it to the existing `greet` animation.
Resident gesture regressions: 9 passed. Full core first attempt: tooling 112 pass;
preview 3310 pass, 1 existing skip, 1 existing todo; server 597 pass, 153 Redis skips,
1 socket-rotation timeout. Remaining core tasks did not run. Isolated unchanged
rotation suite then passed 4 memory tests with 2 Redis skips. Retained first receipt
in `.runtime/character-studio/editor-core-first.json`; full gate rerun queued under
the shared browser lock to reduce simultaneous heavy work.

Next #442 implementation seam after editor verification: pin receipt/license and
compatibility metadata for existing GLBs and generated overlays, reuse photo-mode
capture lifecycle for a separate native 3840x2160 target, record deterministic
camera/pose/light/color settings and actual render-target dimensions. Compare
repeated captures on the available M3 Max before defining tolerances; do not claim
a physical phone budget from emulation. Requested target desktop/phone models.
Then #443 extends existing account preferences with validated owner drafts and
immutable publication references, preserving current account initialization,
heartbeat reconciliation and two-second appearance cooldown. No server changes
have been made in this editor increment.

Live `project:check --tasks <primary>/docs/project-management/tasks.json` fails on
pre-existing register/worktree discrepancies outside this task (including missing
penthouse-dev-preview checkout and office-lift-ride-level branch). No unrelated
records or checkouts were changed. This task's live claim remains active and its
lease/next action were refreshed while verification waits in the shared queue.

Editor rerun passed 21 browser checks (91.323 s), including reduced motion,
keyboard, desktop history/compare, storage fallback, keep/discard recovery, phone
touch/no overflow and focus return. Phone and desktop captures inspected. Walk
capture exposed thigh/skirt penetration in the existing rigid skirt; #442 remains
open. Further inspection of resident-gestures.js confirmed `wave` is supported and
is distinct from `greet`; restored the original wave mapping (the interim greeting
capture does not prove a raised-arm wave). A fresh pose capture is still required.

While queued, started the #442 native portrait helper and three focused tests:
dedicated 3840x2160 HDR target, matching tone-map/sRGB output pass, exact row flip,
and restoration on success/failure. All 3 tests pass. These files are not yet wired
to UI or browser verified and must remain outside the editor-only commit until the
next render increment is verified: character-portrait.js and its test.

Full core rerun passed under the shared lock: tooling 112; preview 3313 pass,
1 existing skip, 1 existing todo (includes 3 uncommitted portrait prototype tests);
server 598 pass/153 Redis skips; desktop 69; Python 141 passed. Build, lint/format,
demo expected-status verification and secret scan passed. Receipt retained at
`.runtime/character-studio/editor-core-passed.json`. No production/live auth,
Redis, native, physical-device or human acceptance is implied. Existing appearance,
movement, lifecycle and navigation browser regressions are now running.

All four editor regressions passed on the final source:
`pnpm run test:experience player-forms beast-movement player-lifecycle rail-navigation`.
Report retained at `.runtime/character-studio/editor-regressions.json`. Fresh
wave/editor capture remains queued behind a live IPIC soak; no bypass or fabricated
result. Editor draft PR may be reviewed with this precise visual gap and the known
walking skirt defect; full issue acceptance remains open.

## Editor PR delivery and continuation
Signed commit `bf0f8aacb04933d7236f20ed10efc49a7f0ca392` pushed; SSH signature
verified and prohibited-attribution check printed nothing. Draft PR
https://github.com/BunsDev/river-oaks/pull/461 is stacked on #457. No merge.
Progress: #441 comment 6202027703; #442 updated with material evidence, skirt
clipping and the unintegrated native 4K prototype. Full goal remains active.

Resume the same checkout/task. First inspect `/tmp/river-studio-editor-browser-final.log`
and session 28249 (queued editor/wave capture); do not restart a live run. Its report
will be `data/reports/character-studio-editor-final.json`. Inspect the wave screenshot,
record any defect and update #461's pending capture note. Then create the next
stacked render branch from the verified editor head, retain the uncommitted
`preview/src/character-portrait.js` and `preview/tests/character-portrait.test.js`,
and implement #442 native hero capture with browser dimension/color/lifecycle
verification and actual-rig skirt fitting. Do not claim 4K integration from the
helper tests. Continue #443 and #444 after that. Preserve this checkout; it contains
undelivered portrait code. Hosted/editor review, physical-device targets, human
acceptance and all downstream criteria remain explicit gaps.

## Render increment (#442)
Previous goal turn was progress: signed editor implementation/evidence pushed in
#461 and 253 regressions/core passed. Revalidated #461 open/draft at 93f29271,
primary main now a5697b57, owned checkout preserved with only portrait helper/test
untracked. Final editor/wave session 28249 remains live and queued; do not restart.
New stacked branch `feat/character-studio-render-20261015` uses this same checkout.

Objective: native 3840x2160 export with deterministic neutral hero pose, documented
camera/light/color settings and validated identity; async load/encoding fencing,
resource disposal and pixel/dimension verification. Then address the observed
walking skirt intersection with actual geometry/rig regression and rendered poses.
Files owned recorded in primary tasks register. Keep existing appearance authority.

Final editor/wave journey completed on unchanged #461 code: 21 checks passed in
89.982 s. Wave capture inspected: arm visibly raised, actual rig remains rendered.
Report `.runtime/character-studio/editor-browser-final.json`; #461 body updated.
Previous pending wave gap is resolved; walking skirt clipping remains separate.
Hero scene and readback unit tests now 6/6: canonical owner/identity, fixed neutral
camera/pose, failure cleanup, native target dimensions, row orientation, state
restoration and incomplete framebuffer rejection. No browser/4K acceptance yet.

Native export is now integrated: dedicated HDR/output targets, fixed hero rig,
neutral pose, camera, daylight and 2048 shadow map; canonical edited identity in
human/fox PNGs. Initial portrait browser run passed 11 checks in 13.494 s and
allocated actual 3840x2160 GPU targets. Both exports inspected. Repeated decoded
pixels had maximum/mean error zero on this machine; no approved golden implied.

Replaced the rigid Sable skirt with weights on the existing pelvis/thigh skeleton.
The old code fails the actual-geometry regression at +0.45 stride: 8/114 covered
upper-thigh points exposed. New human and fox fixtures pass five opposing stride
angles and transformed parents. Geometry counts remain unchanged. Updated walking
capture inspected: previously protruding upper thigh is covered. Full pose,
wardrobe and view matrix remains open.

`pnpm run test:experience character-studio` passed 21 checks in 86.032 s on the
new render integration. First `pnpm run verify` passed: tooling 112, preview 3318
pass/1 existing skip/1 todo, server 598 pass/153 Redis skips, desktop 69, Python141.
Receipt `.runtime/character-studio/render-core-before-review-fixes.json`.

Independent review found two P2 lifecycle defects: edits could clear an in-flight
capture lock; Before/after could retain a download for the wrong shown definition.
Both reproduced with browser regressions, then fixed. In-flight work remains
bounded across edits/close/reopen; export key tracks the actual shown definition.
Re-review found no remaining blocker. Final portrait journey passed 15 checks in
13.418 s, including both red/green regressions and unsupported hardware, with
identical repeated decoded pixels. Report `.runtime/character-studio/portrait-browser-final.json`.
Final focused command `node --test preview/tests/character-portrait.test.js
preview/tests/character-hero.test.js preview/tests/skirt-skinning.test.js
preview/tests/character-studio-materials.test.js preview/tests/reference-batching.test.js`
passed 13, no skips; build passed. Final core gate rerun in progress after fixes.

Final core gate passed after both review fixes. Receipt
`.runtime/character-studio/render-core-final.json`: tooling112, preview3318 passed
(1 existing skip/1 todo), server598 passed (153 Redis skips), desktop69, Python141
(66 warnings), build/lint/format/demo expected-status/secrets all passed. Tested
patch is the render implementation based on editor head93f29271. No source changes
after these final checks. Live project:check remains exit1 for unrelated existing
ownership/retirement/missing-checkout records; this task remains owned and active.

Signed render commit749353bc546d5f2822713cc952730dd083e9d9bf pushed after signature
and prohibited-attribution checks. Draft PR https://github.com/BunsDev/river-oaks/pull/462
stacked on #461. Issue #442 progress: issuecomment-6202398265. No merge/deploy.

Next increment objective: audit pinned shipped GLBs against source/license receipts,
actual skeleton/skin weights/positions/indices and embedded texture metadata.
Record measured base asset costs and explicit compatibility from the authoritative
appearance mapping, keeping v1/v2 persisted definition shape unchanged. Negative
fixtures must exercise invalid bytes, receipts, skeletons, weights and textures.
Owned files: scripts/character-assets-audit.mjs, scripts/tests/character-assets-audit.test.mjs,
preview/src/character-compatibility.js, preview/tests/character-compatibility.test.js.
No paid downloads or source receipt regeneration. Complete procedural licensing,
full pose/crowd/device matrix and human approval stay open.

Catalog increment now implements explicit immutable compatibility for all authored
looks and the shared 53-bone rig. Studio color support delegates to this registry
without changing v1/v2 payloads. New build audit checks pinned bytes and CC0 source
receipts, bounded embedded buffers, skeleton/binds/node transforms, geometry,
weights, sparse morphs, WebP headers and texture references; actual-asset negative
fixtures cover tampering, source/license mismatch, invalid geometry/skin/morph and
textures. Review exposed empty/zero-scale transforms passing the initial audit;
red regression reproduced it, then arity/quaternion/affine/non-singular effective
transform validation fixed it. Re-review found no remaining blocker.

Focused command `node --test scripts/tests/character-assets-audit.test.js
preview/tests/character-compatibility.test.js preview/tests/character-definition.test.js
preview/tests/character-studio.test.js`:16 passed, no skips. Audit CLI passes all
three base rigs; `.runtime/character-studio/asset-audit.json` records measured
vertices/triangles, local bounds, morph position deltas and 31/37/29MiB RGBA8 base
texture estimates. Header validation does not decode images or prove GPU budgets.
Catalog-backed portrait journey passed15 checks; report
`.runtime/character-studio/catalog-portrait.json`. Core gate in progress.

Hosted render head749353bc: aggregate preview failed because shared(development)
failed; other listed checks passed. Investigating the failed job log. No hosted
acceptance or merge claimed. No source or dependency change should be made merely
to hide a failing test; determine its owning seam first.

Catalog core gate passed before the subsequent rail focus fix; receipt
`.runtime/character-studio/catalog-core.json`. Hosted failure root cause confirmed:
new Studio trigger precedes the character picker, so Character command's generic
`.player-controls` jump focused that first button. Existing rail-shared assertion
failed locally too. Changed only its destination to the selected character radio.
Existing shared journey now passes on full Metal rendering; report
`.runtime/character-studio/rail-shared-green.json` and preserved red counterpart.
Review found no blocker. Final core rerun after this line is in progress. Generated
shared-experience report restored after preserving both runs; no unrelated evidence
will be committed.

Final catalog/focus core gate passed: tooling117; preview3319 pass/1 existing
skip/1 todo; server598 pass/153 Redis skips; desktop69; Python141 with66 warnings.
Build, lint/format, demo expected-status and secrets passed. Receipt
`.runtime/character-studio/catalog-rail-core-final.json`. Tested dirty patch is this
catalog/audit and one-line rail change on render head749353bc; no further runtime
changes after verification. Shared rail journey passed17 checks in9.096s; catalog
portrait passed15 in11.988s. Full five-issue goal remains active.

Next: push the verified audit/focus increment to #462, inspect hosted checks, then
complete #442 human/fox idle/walk/run/sit/wave/prowl/lope rendered matrix with the
existing Jevica fixture and actual avatar.update locomotion fields. Capture
clipping/attachment failures, not just dimensions. Pin hero reference environment,
measure isolated/crowd costs and resolve procedural dependency/provenance scope.
Physical device targets and human acceptance remain missing inputs. #443 durable
drafts/immutable publication/CAS/replication and #444 broad acceptance remain
unimplemented. The #461 parent still lacks this focus correction; reconcile the
stack/backport before any future landing. No merge/deploy authorization. Preserve
this active checkout and all three draft PR branches.

Audit/focus commitb21bf7b85103254dcd792207fe26b2722def9fbc signed, signature and
attribution checked, pushed to draft #462. PR title/body rewritten around final
asset audit + portrait + skirt + focus scope. Hosted checks must be verified on the
new head; prior failed run is not success. Goal/task remain active and checkout
preserved. Resume exact next actions above using live register and existing PRs.
