# Campus #507 challenge and finish

## Goal / scope
Inspect current real district from both long sides and the actual existing office outlook; verify 6/7/6 storeys, parapet/foliage caps, retained IPIC edge/no east road; traverse ground beneath both bridges and former garage entrances; rebuild and disable the revision; fix demonstrated owning-source defects. Local implementation, tests, captures and acceptance documentation. No merge, deployment or production claim. No commits/push/remote updates inferred from issue text alone.

## T0 checkpoint
- Owner: codex:campus-challenge-507:01a15b91; task campus-challenge-507-20261021.
- Worktree: /Users/buns/Documents/GitHub/BunsDev/river-oaks-campus-challenge-507
- Branch: test/campus-challenge-507-20261021; baseline a35214f38795ced1ee6867aad5c3c2723a7ceaae.
- Primary clean. New external sibling worktree; no private env/runtime copied.
- User goal is issue507 follow-up2 verbatim. Main includes #507/#508/#511/#512 and rollback #551; old source ledgers are historical evidence, not fresh checks.
- Contract: layout3.2, river-oaks-gardens-3, default/rollback river-oaks-garage-1. Garage osm-way-625330790, base18.25939m; occupied floors6/7/6; parapets26/30/26, full caps28.1/32.1/28.1m above datum.
- Active campus-readiness-512 owns office/suite/readiness browser files and docs/testing.md. This task excludes those paths. No competing active owner found for shell geometry, district overlay, matched-view runners or shell regression scope.
- Applicable root/preview/server instructions, project workflow, architecture and world-direction read. Using reference-scene-comparison, player-path-collision and world-workflow skills. No claim of validating those skills as a separate suite.

## Requirements / tasks
- R1/T1: verify source identities, dimensional/silhouette/context invariants and current rollback/destination/support behavior; focused tests with source hashes.
- R2/T2: inspect matched current runtime east/west views, under-bridge views, and actual office outlook (contract camera05 alone is approximate, not sufficient).
- R3/T3: traverse both bridge ground routes and old entry positions in actual authoritative world, rebuild/disable; verify no ghost collision, duplicate assets, dangling supports or stale destinations. Add regression only for demonstrated gaps.
- R4/T4: fix findings at owning seam, rerun affected tests/captures and required core/full gates; document proof limits and checklist.

## Evidence and baseline
Commands/tests not run yet. Existing focused suites cover overlay byte-roundtrip, point clearance/flood connectivity, authored storeys/openings/disposal and authoritative under-bridge walking. Inspect coverage before duplicating. Existing resource runner reloads district in one context; actual office runner currently targets garage/default unless explicitly passed the campus revision.

## Next action
Install locked dependencies, run doctor/catalog, focused campus geometry/support tests. Queue selected matched views with both revisions. Inspect lifecycle/disabled destination consumers and design actual office/route acceptance using existing fixtures. Preserve screenshots/receipts with source hashes. Keep local queue waits distinct from execution.

## T1 checkpoint — focused baseline and runtime evidence preparation
- Locked pnpm/uv installs completed; agent:doctor core passed; agent:list inspected. No provider env copied.
- Focused baseline command: `node --test preview/tests/garden-campus-layout.test.js preview/tests/garden-campus-district.test.js preview/tests/garden-campus-finish.test.js server/tests/garden-campus-district.test.js server/tests/garden-campus-support.test.js server/tests/district-gardens-checkpoint-migration.test.js`: 54 passed, 0 failed, 2 Redis skips (56 total). Log `.runtime/campus-challenge/focused-baseline.log`. Skips are newer-epoch Redis coordinator and Redis ticket/WebSocket revision proof, not established passes.
- Added five-cycle rebuild/disable regression in garden-campus-district.test.js: unique destinations/buildings, populated room-cache removal, disabled support/shell, byte-exact original district restoration. Suite 12 passed, 0 skipped; `.runtime/campus-challenge/rebuild-regression.log`. No runtime defect demonstrated by this model-level test.
- Extended existing green-roofs-office runner with validated garage/gardens argument, candidate-specific output, campus/layout source hashes and served-revision assertion. Preserves real office admission/terrace walking and existing outlook. Syntax check passed; browser outcome not yet known. Its roof-gardens view may not frame the campus adequately; inspect captures before accepting office-outlook criterion.
- Matched views command: `node preview/e2e/garden-campus-render-views.mjs both --hours day --cameras 11-east-long-side,12-west-long-side,02-street-under-b12,14-street-under-b23,05-office-terrace-outlook`. Live process handle 86210, waiting in shared browser queue; log `.runtime/campus-challenge/matched-views.log`. Contract camera05 is supplementary, not actual office proof.
- Actual office command: `node preview/e2e/green-roofs-office.mjs gardens`; log `.runtime/campus-challenge/actual-office.log`. Preserve its live handle; no duplicate launch.
- No production geometry changes, commits or remote updates. Core/full not run for this candidate. R2/R3 runtime inspection, old-entry routes, resource rebuild/disable and final gates remain open.
- Next: poll existing browser processes; inspect actual images and source-bound results, then address any demonstrated source defects. Add isolated Redis proof and run required gates after final scoped changes. Do not bypass queue or touch peer readiness files.

## T1/T3 checkpoint — entry seams and isolated Redis
- Previous turn classified progress: test/harness edits and fresh baseline evidence. Browser handles86210 and96844 re-polled live; both still queued, not failed. No restart.
- Added authoritative bidirectional entry seam test in server/tests/garden-campus-district.test.js. Starts at a legal T1 hall arrival, then walks 0.12m maximum increments through E1 south, E2 west under B12, E3 north and back; retains ground altitude and null upper-level identity. `node --test --test-name-pattern='former garage entry' server/tests/garden-campus-district.test.js`: 1 passed, 0 skipped. Log `.runtime/campus-challenge/entry-routes.log`. Source entry labels are contract garage vertices/lanes, not a claim about surveyed historical garage doors.
- Owned ephemeral loopback Redis (random reserved port, temporary directory, persistence off) started by Python subprocess; ran `node --test server/tests/garden-campus-district.test.js server/tests/district-gardens-checkpoint-migration.test.js` with REDIS_URL bound only to that owned service. 17 passed, 0 skipped; process47147 exit0; service terminated in finally. Log `.runtime/campus-challenge/redis-focused.log`. This run preceded addition of entry test, which was verified separately.
- Resource command queued live handle26182: `node preview/e2e/garden-campus-render-resources.mjs gardens=gardens --rounds 1 --rebuilds 3 --frames 60 --out campus-challenge-resources`. Log `.runtime/campus-challenge/resources.log`. This is a same-candidate rebuild/resource check, not a comparative performance budget.
- Required core gate launched with worktree .venv/bin first in PATH, nice19; log `.runtime/campus-challenge/core.log`. Outcome pending.
- Next: collect existing jobs and inspect captures; ensure actual office view frames campus. Browser disable/client destination teardown still requires evidence beyond the model-level regression. Full gate remains required and unrun. No runtime defect found so far, no geometry alteration justified yet.

## T3 checkpoint — real client disable harness prepared
- Previous turn made progress (entry regression, Redis evidence). Re-polled core36155 and browser86210/96844/26182: all live, no restart. Current queue holder PID3435 independently observed alive; queue delay is not a test failure.
- Core tooling phase passed168, zero skips; preview phase running. No overall core claim.
- Added `preview/e2e/garden-campus-revision-lifecycle.mjs`, syntax checked. Existing fixture starts campus, selects a campus destination, performs real Reload, verifies four unique campus destinations, then stops its owned server and restarts a garage fixture at the same web origin. Requires actual manifest default, automatic client reload, hidden campus UI, absent campus root/destinations, and retained ordinary destinations. Does not forge snapshots or manifests. Server state resets; this is not Redis checkpoint evidence. Vite may trigger the reload, so it does not independently prove multiplayer revision-fence timing.
- Command `node preview/e2e/garden-campus-revision-lifecycle.mjs`, live handle70057, log `.runtime/campus-challenge/revision-lifecycle.log`. Queued, no pass yet. Captures/results intended under output/playwright/campus-challenge-revision-lifecycle.
- Existing running handles: matched86210, actual-office96844, resource26182, core36155, revision-disable70057. Preserve each; inspect terminal result before relaunch.
- Next: collect jobs; image inspection and resource growth evaluation remain mandatory. If office roof-gardens view does not show candidate, add an actual-office-position camera aimed at campus with explicit camera metadata. Full gate remains required. No runtime source change justified by current passing tests.

## Historical evidence applicability review
- Inspected docs/design/garden-campus/finish/receipt.md, sheet-day.jpg and resources-2026-10-18.json. Historical sheet shows three stepped masses, retained neighboring roofs and both bridge openings, but is not current candidate proof.
- Compared recorded source hashes: only garden-campus-finish.js matches; garden-campus.js, planting, district overlay, main.js and district.js differ. Therefore retain old receipt as dated comparison, not current resource/visual acceptance; fresh jobs are warranted.
- Old resource receipt also reported nonzero rebuild growth (gardens +10 geometries/+10 textures). Those values cannot be called zero-leak proof; current runner output must be examined by per-cycle slope and ownership, and any confirmed campus-owned growth fixed at source.

## Contract artifact validation
- `node scripts/garden-campus-views.mjs --check`: exit0, ok:true, findings0, stale[]. Reported T1 6F roofz25, T2 7F roofz29, T3 6F roofz25; B12 23m z13, B23 15m z13;43 suites. This confirms source/generated contract agreement, not visual acceptance.
- Subsequent core36155 and matched86210 polls confirmed both live. Queue holder3435 confirmed alive after bounded50-second wait. No cancellation, restart or timeout inference.

## Acceptance checklist (candidate a35214f3 + listed local test/harness diff)
| Criterion | Evidence inspected | Current disposition |
| --- | --- | --- |
| 6/7/6 occupied storeys | focused shell/finish/layout tests; generated contract check | source geometry passes; current east camera11 visibly reads6/7/6 |
| Parapet/foliage silhouette | actual mesh-bound finish regression, contract caps | geometry, side silhouettes and actual aimed terrace views inspected locally; far towers occlude each other |
| Retained IPIC edge/no invented east road | overlay preserves other buildings/collision; exact source rollback and layout wall validation | source invariants and inspected matched side context pass locally |
| Ground beneath B12 and B23 | authoritative server walk and ground/level assertions in baseline | authoritative route tests pass; current cameras02/14 inspected, fixed captures do not themselves prove traversal |
| Former garage entry positions | bidirectional E1/E2/E3 server sweeps | passes locally at authored contract seams, not surveyed historical doorway proof |
| Rebuild/disable no stale model destinations/support | five-cycle overlay/room-cache/door/support regression | passes model layer |
| Rebuild no duplicate/retained render resources | resource job26182 | current run exited0; initial+10/+10 then plateau across3 reloads; initial retention unattributed |
| Real browser disable clears destination/UI | contract-correct30114 exited0, result.json inspected | local rebuild and same-origin garage restart passed; automatic reload source is not independently isolated |
| Actual existing office outlook | aimed58399 exited0; both actual terrace captures inspected | local silhouette inspected; farther towers occluded, count supplied by east view |
| Side/under-bridge captures | matched86210 exited0; sheet and full-size11/12/02/14 inspected | local day captures inspected; no visible dangling bridge connections in these poses |
| Redis rollback and revision transport | isolated Redis17/17 | passes locally, no production switch |
| Required core/full | core36155 exit0; controlled full55477 exit0, all18 phases passed; original full timing failure preserved | required local gates passed; skips and excluded acceptance below |
| Concrete defects/review findings | current source tests, matched/actual-office images, authoritative routes, rebuild/disable receipts and full gate | harness framing/contract assumptions corrected; no demonstrated campus runtime defect in exercised scope |

No row closes visual, production, physical-device or full-release acceptance based on source tests alone.

## Required core gate complete
- core36155 exited0. `.runtime/agent/core.json` status passed, all11 phases passed. Command `PATH="$PWD/.venv/bin:$PATH" nice -n 19 pnpm run verify`; log `.runtime/campus-challenge/core.log`.
- Tooling168pass0skip; preview3700pass1skip; server733pass212skips; desktop115pass3skips. These skips remain excluded scope, not passes. Python/build/lint/format/demo/secrets phases passed. Synthetic demo-verify's domain-blocked report is its documented expected exit2.
- Required full gate launched with owned ephemeral loopback Redis/temp directory, PATH worktree .venv first, nice19, timeout14400s. Uses pnpm run verify full and normal browser queue; never FLUSHDB. Log `.runtime/campus-challenge/full.log`, receipt `.runtime/agent/full.json`. Wrapper terminates only owned Redis in finally. Do not duplicate/restart while live.

## Full gate failure triage
- Full31539 terminal exit1; stopped at preview-tests. All later full phases not_run, owned Redis cleaned by wrapper. Preserved receipt `.runtime/campus-challenge/full-first-failure.json` and log full.log.
- Failure: office-penthouse-furnishings.test.js:218 idle-slice max66.1ms versus required<40ms. No edits in test or source module; same check passed in core candidate run. Implementation uses6ms remaining-time budget, test wraps callback with wall elapsed time (thus scheduler preemption contributes).
- One diagnostic isolated command `node --test --test-name-pattern='surfaces are drawn in short idle' preview/tests/office-penthouse-furnishings.test.js`:1pass0skip,867ms suite; log idle-slice-isolated.log. Host-load sensitivity is supported but precise scheduling cause unproven. No threshold/assertion weakened and no source change made on this evidence.
- Full is FAILED, not waived. Do not loop retries; a controlled required-gate attempt after competing work subsides remains appropriate. Browser evidence jobs remain live queued. Peer holder inspected read-only: its experience suite completed and shared suite genuinely started, so lock is not stale and must not be bypassed.

## Controlled full verification scheduled
- Browser jobs re-polled live; queue holder still in actual shared suite, not stale.
- One controlled full attempt queued as handle56385 through `node scripts/browser-lock.mjs 'Campus controlled full gate after evidence' -- .venv/bin/python .runtime/campus-challenge/run-full-controlled.py`; queue log full-controlled-queue.log.
- Wrapper starts only after all four current evidence result.json files say passed and candidate JS/JSON changed/untracked-file hashes match controlled-source-hashes.json. If a prerequisite fails or source changes, it exits without running full; inspect before rescheduling.
- Controlled environment differs from failed first run: owns the shared browser lock for whole gate, normal scheduling priority (no nice19), isolated ephemeral Redis, source fixed. Original full-first-failure.json/full.log retained. This is one planned environment-control experiment, not repeated retries to manufacture green.
- Wrapper records full-controlled.log, owns process-group termination on timeout and Redis cleanup. A successful runner status still does not approve images or resource slopes; those require direct inspection.

## Office framing precheck / queue advancement
- Queue advanced from holder3435 (full passed) to live experience holder4182. Our matched job now7 ahead. This is a progressing serialized queue, not a stale lock or terminal blocker.
- Source-derived actual office roof-gardens camera using officeLobbyFor + ARRIVAL + office layout: scene eye[-2719.8313,44.5288,1393.8510], target[-2736.5084,27.5288,1359.6915]. Campus centre[15,100,16] maps[-2704.9664,34.2594,1267.8129],37.04deg off-axis. This is an analytic framing precheck, not captured camera evidence. Existing 62deg vertical FOV/800x600 may put campus centre near frame edge; inspect screenshot before accepting or add a correctly aimed view from the admitted office if necessary.

## Current matched views and actual office inspection
- Matched job86210 exited0; output/playwright/garden-campus-render-views/result.json status passed. Inspected sheet-day.jpg and full-size gardens cameras11 east,12 west,02 belowB12 and14 belowB23. East elevation visibly reads6/7/6 floor bands; central tower one storey taller. Roof parapets/headhouses and bounded sparse rooftop trees visible; foliage hangs from terrace edges. Both bridge slabs meet adjacent tower facades without visible dangling supports in these poses.
- West view retains the neighboring IPIC roof/edge in the foreground; it occludes lower campus storeys, so east view supplies storey recognition. East foreground is a paved pedestrian promenade with planted strips/trees, no new parallel asphalt carriageway; pre-existing cross streets remain. These are local day15 Smoothest1280x800DPR1 captures, not all-angle/production proof. Ground traversal authority remains covered by recorded server walk regressions; fixed camera images alone are not movement proof.
- Actual office job96844 exited0; output/playwright/green-roofs-office-gardens-challenge/result.json status passed, revision gardens, source hashes included. Inspected roof-gardens-0.png: real office UI and adjacent retained roof are visible, but campus is cropped at right and behind top UI. This does NOT close the requested campus silhouette from actual office; an aimed capture from actual office remains required. Contract camera05 is approximate and cannot substitute for it.
- Resources26182 and realdisable70057 still live when polled. Full56385 remains dependent on those results. No runtime defect inferred solely from incomplete framing.

## Rebuild resource result and office framing follow-up
- Resources26182 exited0; output/playwright/campus-challenge-resources/result.json status passed, errors[]. Same-view rebuild0/1/2/3: geometries560/570/570/570, textures181/191/191/191, programs147/146/146/146, drawcalls1402 throughout. Initial+10 geometry/+10 texture retention plateaus after first reload; no continuing per-rebuild growth or duplicated draw submissions observed across three reloads. Cause of initial retained resources is not yet attributed; do not claim zero leakage from runner status alone.
- Aimed actual-office diagnostic launched as58399 using ignored helper .runtime/campus-challenge/actual-office-aimed.mjs, log actual-office-aimed.log, output green-roofs-office-gardens-aimed-challenge. Reuses approved fixture/admission/terrace journey and normal pointer yaw to face campus centre; asserts visitor position unchanged and records actual camera before/after. Captures UI-present and visibility-hidden screenshot only (no runtime scene/camera override). Pending; verify actual framing and yaw result. Source runtime and tracked candidate unchanged by this helper.
- Realdisable70057 remains live and holds queue; full56385 follows. Aimed58399 queues normally behind existing work.

## Disable harness failure and correction
- Disable70057 exited1: destination selectOption timed out because the legacy directory control is hidden in the current Places UI. No world-disable action ran; observations[] and failure screenshot show ordinary live district. Preserved .runtime/campus-challenge/disable-first-failure.json. This is a harness visibility assumption, not demonstrated runtime stale-state behavior.
- Corrected lifecycle harness to reuse existing garden-campus-traversal.js select.value/change contract and assert the selected value. Test scope is state teardown, not accessibility of hidden legacy UI. node --check and git diff --check passed. Corrected run72414 queued; log revision-lifecycle-corrected.log.
- Controlled full56385 exited1 before launching verification because the lifecycle success receipt was absent. No second full gate actually ran. Updated only the corrected lifecycle script hash in controlled-source-hashes.json; next controlled gate must follow corrected lifecycle and preserve first full failure.

## Actual terrace silhouette inspected; legacy garage manifest contract
- Aimed58399 exited0, status passed, errors[]. Inspected campus-aimed-clean-0.png and -1.png in green-roofs-office-gardens-aimed-challenge. Both actual walking cameras at altitude44.408815564 show campus roofline beyond terrace furniture/glass; nearest tower partially occludes farther towers. Parapets/headhouses and sparse foliage remain readable; no independent storey count from this occluded angle. Camera positions unchanged by aiming; actual authenticated terrace journey supplied the eye, no render camera override. Side camera11 remains6/7/6 count evidence. Proven normal-pointer capture sequence integrated into owned green-roofs-office.mjs; syntax/diff checks passed.
- Corrected disable72414 exited1 after successful selected/rebuilt destination assertions: expected200 from garage /api/world-data, got404. server/app.js only registers manifest route with catalog or districtRevision; main.js defaultWorldManifest deliberately falls back to garage on non-OK response. This fixture has neither after disable. Preserved disable-second-failure.json. Harness now asserts documented404 and retains all campus UI/destination removal checks; no runtime semantics or assertions weakened to hide a product failure. Contract-correct run30114 queued, log revision-lifecycle-contract.log.
- Full91652 again refused before starting verification because no successful disable receipt exists. Updated two changed harness hashes for the next guarded run. No repeated full test attempt yet.

## Revision disable passed; guarded full running
- Contract-correct30114 exited0. Inspected output/playwright/campus-challenge-revision-lifecycle/result.json and garage.png. Selected campus:T1-F1-hall initially; after Reload exactly4 unique campus destinations remain and selection resets to ordinary destination. After actual same-origin fixture restart to garage: zero campus destinations, campusHidden true, campusRoot false, playerReady true, ordinary destinations retained. Runtime source hashes unchanged.
- Screenshot shows restored ordinary street; the receipt, rather than off-campus image alone, supplies destination/root assertions. Fresh fixture state and possible Vite automatic reload remain explicit limits; this is not production switching or independent revision-fence timing proof. Redis migration remains separate17/17 evidence.
- Guarded full55477 has started pnpm run verify full with owned isolated Redis after receipt/hash preconditions passed. Current tooling output live; do not duplicate or restart. Latest runner includes corrected lifecycle contract and integrated aimed-office capture.

## Final local challenge audit / handoff
- Candidate remains a35214f38795ced1ee6867aad5c3c2723a7ceaae plus the four owned test/harness files and this ledger; branch test/campus-challenge-507-20261021, worktree above. Runtime campus sources unchanged; revision river-oaks-gardens-3, layout3.2; default river-oaks-garage-1. Controlled source hashes rechecked after full: no changed JS/JSON inputs.
- Full55477 exited0; `.runtime/agent/full.json` all18 phases passed. Command inside guard: `PATH="$PWD/.venv/bin:$PATH" pnpm run verify full` with owned ephemeral REDIS_URL, normal priority and shared browser lock. Log `.runtime/campus-challenge/full-controlled.log`. Tooling168/168; preview3700pass/1skip; server987pass/0skip; desktop115pass/3skip; reflection2/2. Required experience journeys (including all three campus journeys), shared journeys and IPIC screening passed. The original idle-slice failure and both harness failures remain preserved; no assertion or timing threshold weakened.
- R1: shell6/7/6, mesh silhouette bounds, retained neighboring geometry, overlay exact roundtrip and disabled support/destinations verified by focused and full tests. R2: both long sides and both under-bridge poses inspected; real authenticated office terrace aimed by ordinary input inspected twice. R3: both ground bridge routes covered by authoritative walker tests; E1/E2/E3 traversed bidirectionally in actual world commands; five model cycles and real browser reload/garage restart verified. R4: concrete harness defects addressed at harness source, checks passed, candidate-specific evidence/checklist recorded. No collision/geometry change was justified by these results.
- Resource scope: current renderer counts560→570→570→570 geometries and181→191→191→191 textures, constant1402 draws. Three campus build/disposal unit cycles verify all owned geometry/material disposal and shared-map reuse. No accumulating duplicate assets were demonstrated in the exercised cycles. Initial whole-district+10/+10 remains unattributed; zero retained resources, indefinite-soak behavior and universal leak freedom are NOT proven or closed. This is a recorded limit, not a diagnosed campus defect or a production release gate waiver.
- Other limits: local Chromium/Metal and fixture identities only; office view has natural tower occlusion; authored former-garage seams are not surveyed doorways; server restart uses fresh state and may reload through Vite rather than isolated revision-fence timing. Redis migration is separately tested. No live WorkOS, native Unreal, physical-phone/GPU performance, human accessibility, production enablement or release acceptance claimed.
- Generated full-gate reports copied to `.runtime/campus-challenge/full-experience.json` and `full-shared-experience.json`; tracked historical reports restored to HEAD, leaving only intended source/test/docs changes. Screenshots/results remain in the listed output/playwright directories.
- Local challenge inspection and verification are complete within the stated finite scope. No commits, push, PR publication, issue closure, merge or deployment performed. Delivery next step: review the five-file local change and authorize any desired commit/PR; retain this checkout and evidence. Do not label the task delivered without exact PR/merge evidence.

## Explicit ownership handoff — 2026-10-22T18:43:44.420056+00:00
Recorded owner thread 01a15b91-4fd2-7e20-9b2d-8bbc7cf341ef hands off task campus-challenge-507-20261021, branch test/campus-challenge-507-20261021, and its five-file uncommitted audit to session 01a164eb-7dac-7452-bca9-550138cd061a. This is explicit permission to use this checkout/diff for fresh verification, signed commit, push and PR publication under the user authorization conveyed in the handoff request. Preserve existing evidence and limits; reconcile current main and overlap before publication. No merge, deployment, issue closure, destructive cleanup or separate campus-readiness-512 branch takeover is authorized. This session performs no implementation/publication. Old verification applies only to the recorded candidate; recipient must establish fresh applicability and evidence.

## Publication increment — 2026-10-22
- Explicit owner handoff received; original branch/checkouts reused, original audit credit retained above. Fast-forwarded from a35214f3 to f850abfa (landing tooling only); five audit files preserved. No runtime revision, environment configuration or geometry changed.
- Fresh focused/core/full and exact-head hosted checks remain required. Historical receipts preserved under `.runtime/campus-challenge/publication-20261022/prior-*.json` before new gates.
- Publication authorization covers signed commit, push, PR and one evidence comment per increment; it excludes merge/land, deployment and issue closure.

## Decisions for Val
Visual review remains a human decision. Record reviewer, date, candidate revision and any rejected pose here; do not treat automated passes as sign-off.
- [ ] Inspect camera 11 east: exactly 6/7/6 occupied floor bands, center tower taller, parapets/headhouses/foliage within intended silhouette.
- [ ] Inspect camera 12 west: retained IPIC roof/wall and surrounding building/road identities; account for foreground occlusion.
- [ ] Inspect cameras 02 and 14 under B12/B23: bridge anchors meet facades, usable ground plane, no dangling supports or invented east road. Use authoritative walking tests for movement proof.
- [ ] Inspect both aimed actual-office terrace captures: skyline/parapet/foliage legibility from the admitted walking position; far towers naturally occlude and this pose cannot count all storeys.
- [ ] Compare matched plan/aerial/street/outlook context against #506 and the recorded source revision; dimensional claims require contract tests.
- [ ] Accept or request further investigation of the finite resource receipt: geometries 560→570→570→570; textures 181→191→191→191; initial +10/+10 is unattributed, not zero-retention proof.
- [ ] Accept the entry-evidence boundary: E1/E2/E3 are authored seams, not surveyed historical doors. No production/device/accessibility sign-off is implied.

## Acceptance evidence map for publication
These rows map all six #507 acceptance boxes without declaring unproven human or production acceptance. #523 merged as `5bb321ba07d1034fee214d089ac6146e5f55d514`; that merge is verified via GitHub. The user's production statement is context, not a fresh deployment inspection by this audit.

| #507 acceptance box | Evidence | Boundary |
| --- | --- | --- |
| Exact parcel replacement and retained context | #523; preview garden-campus-district tests assert garage ID/collision removal, unchanged other buildings/rings and retained provenance; matched views 11/12 | Local fixture images; no fresh production visual assertion |
| Contract storeys, terraces, parapets, openings | garden-campus-layout/finish tests and generated contract check; view 11 reads 6/7/6, view 12 gives opposite side | Dimensions come from contract assertions; occluded views cannot establish all floor counts |
| Clear ground entry and bridge routes | server garden-campus-district tests: E1/E2/E3 bidirectional 0.12m sweeps, halls/café doors, both under-bridge routes and ground-level identity; preview walking/support tests; views 02/14 | Authored seams are not surveyed doors; screenshots alone are not traversal proof |
| No old collision/entrances/destinations; rollback input | Preview byte-exact detach/rebuild and five-cycle room-cache/support regression; server fingerprint/checkpoint and Redis transport/migration tests; browser revision-lifecycle receipt | Same-origin fixture restart has fresh state; automatic reload may be Vite, not independently isolated revision-fence timing |
| Rebuild/disposal without accumulation | Model rebuild and owned geometry/material disposal tests; resource receipt with three reloads and constant 1402 draws | Whole-district initial +10 geometries/+10 textures is unattributed, then plateaus; no universal zero-retention or indefinite-soak claim |
| Matched recorded-revision captures | matched-view result/sheet and images 11/12/02/14, actual-office aimed captures 0/1; resource run includes aerial measurements; historical plan/contract capture references retained | Approximate camera 05 cannot replace actual-office evidence; plan/aerial/visual approval remains on Val checklist |

Publication review rechecked the saved office (18 sources), revision-lifecycle (6 sources), and resource (6 abbreviated SHA-256 sources) receipts against current files: all match. Main's intervening diff changes landing tooling only. Re-inspected matched day sheet and actual aimed terrace image: nearest tower occludes farther towers, so no complete floor count from that outlook. Historical source applicability does not substitute for required fresh core/full/hosted gates.

Fresh focused command: `node --test preview/tests/garden-campus-layout.test.js preview/tests/garden-campus-district.test.js preview/tests/garden-campus-finish.test.js server/tests/garden-campus-district.test.js server/tests/garden-campus-support.test.js server/tests/district-gardens-checkpoint-migration.test.js`: 58 tests, 56 passed, 2 Redis skips, 0 failures. Log `.runtime/campus-challenge/focused-publication.log`; the two skips remain pending isolated Redis verification.

### Publication continuation checkpoint
- Fresh core process handle `75375` remains live, log `.runtime/campus-challenge/publication-20261022/core.log`; do not duplicate/restart. This run began before commit, so exact-head verification remains required after signed publication commit.
- Fresh integrated aimed-office runner handle `94630` remains live queued behind other browser work, log `.runtime/campus-challenge/publication-20261022/office.log`. Prior output preserved in `publication-20261022/prior-office-captures`; prior aimed-helper images remain intact. Queue holder PID 37219 was confirmed live during this checkpoint.
- Focused handle `80711` terminated exit 0 (56 pass, 2 Redis skips). Contract `node scripts/garden-campus-views.mjs --check` passed with findings 0/stale []; both edited harnesses pass `node --check`; `git diff --check` passes.
- SSH signing preflight succeeded using the existing ssh-agent identity; use per-command `git -c gpg.format=ssh -c user.signingkey=/Users/buns/.ssh/id_ed25519.pub commit -S`, without changing shared Git signing configuration. No credential values were read.
- Prepared ignored `publication-20261022/run-full.py` from the inspected previous controlled wrapper, with new log locations and expected-HEAD check. Before launching after signed commit, write `head.txt` and SHA-256 `source-hashes.json` for the four JS audit files; it acquires no lock itself and must be launched through normal `scripts/browser-lock.mjs`. It owns ephemeral loopback Redis and cleans only its own process. Not launched yet.
- Next: poll the two existing handles, inspect any actual failure, record precommit core outcome; signed commit the five files, push and open reviewable PR (no auto-close keyword). Run required exact-head core/full and monitor hosted checks including campus/campus-traversal. Publish one evidence comment with completed evidence and candid remaining limits, then update task tracking. No PR or remote comment has been created yet.
