# Human characters and Apple platform polish

## Objective and authorization
Implement the user's full attached goal: audit current main, measure a baseline, improve human realism, Studio reliability/usability and iOS/macOS runtime performance, preserve Jevica-only invitations, and deliver a verified reviewable PR plus acceptance report. No merge or deploy authorized. No paid services or large asset downloads without approval.

## Baseline
Start revision: 153471bc2075e0d02e764a97b0a72129d6da5207 (current origin/main at checkout creation). Prior #496 is included. Existing task owners for Studio, device probes and GPU acceptance retain their worktrees and unfinished work; this task uses a separate checkout. Existing user dev server remains untouched.

## Requirements and evidence plan
- Human-only playable catalog; inspect existing licensed faces/skin/hair/clothes/footwear/lighting in standing, walking, seated and transitions. Capture rendered evidence, diagnose intersections and grounding, then fix measured highest-impact defects.
- Studio preview/edit/save/restore: desktop/phone browser journeys, races/failures, touch/keyboard, orientation, safe areas, horizontal and nested overflow checks.
- Apple compatibility: actual available WebKit/Safari execution. Keep macOS WebKit phone emulation distinct from a physical iPhone. Record browser, OS, GPU, viewport, DPR and rendering mode.
- Performance: matched warmup and sampling windows before/after; loading, frame p50/p95, renderer resources and repeat-open lifecycle. Do not infer GPU memory from JS heap or frame cost from RAF alone.
- Office authority: invitation, owner identity and revocation regressions continue passing.
- Delivery: focused tests, core/full verification with isolated Redis, hosted checks, reviewable PR and concise acceptance report; no merge/deploy.

## Files owned
Initially: this ledger and new task-scoped browser baseline harness/report. Add precise runtime ownership only after baseline diagnosis; preserve others' edits.

## Execution
1. Reconcile ownership and baseline from main.
2. Capture desktop Chromium/WebKit and phone WebKit baseline; inspect images and identify priority defects.
3. Implement measured fixes in small verified increments.
4. Repeat matching captures/metrics and functional/authority regressions.
5. Run required local/hosted gates; deliver PR and report with explicit physical-device and human-review gaps.

## Current state
Claimed in primary live task register. Baseline and implementation pending. No completion or visual/device acceptance claimed.

Initial audit: isolated checkout created from 153471bc; pnpm frozen install and uv locked sync complete; agent doctor passes. New task-scoped baseline harness measures desktop Chromium/WebKit and phone-sized touch WebKit without changing runtime code. WebKit prerequisite installed locally. First Chromium Sable screenshot captured and inspected (output/playwright/apple-polish-baseline/chromium-desktop-sable.png): expanded controls fit, but dress waist seam and weak floor contact warrant investigation. Initial multi-character run interrupted after stalling in page evaluation while host disk space was 1.1 GB; no clean timing baseline claimed. Browser and fixture exited, shared lock released. Harness corrected Silvan appearance mapping, incremental receipts and cleanup errors; dedicated WebKit desktop baseline now running. Existing 5173 server preserved.

First measured implementation: WebKit desktop baseline completed for Sable/Jevica/Silvan (RAF p95 19/25/18 ms); phone-sized WebKit Sable p95 18 ms. Native selects were 20 px and range input box 3 px. Explicit 44 px select/range sizing and pointer-entry focus restoration implemented. Phone follow-up passed all eight control/keyboard/touch/orientation/focus checks; p95 20 ms, no performance improvement claimed. Build passed. Desktop and standard Studio regressions running. Acceptance report introduced at docs/acceptance/human-studio-apple-polish.md; rendered realism, resource/lifecycle optimization, office authority and full gates remain pending. Initial Chromium multi-character run was interrupted; its capture is visual evidence only. Clean separate Sable Chromium run recorded max frame interval 650 ms, requiring investigation/repeated stable-host sampling.

Verification boundary: focused Studio/draft/loading/guide tests passed 10/10. WebKit desktop follow-up reached observed character and completed its control checks but final receipt writing failed ENOSPC; do not count it as a passing run. Standard Studio browser suite also stopped on ENOSPC writing the shared browser queue. Both processes are terminal. Removed only this checkout's generated dist (179 MB); host free disk recovered to 4 GB. Fresh desktop controls and standard browser regression runs now queued sequentially. Preserve partial reports as interrupted evidence. No commit yet.

Further measured progress: standard Chromium Studio 43 checks and layout 4 checks passed; WebKit desktop control retry passed. Source changes now include IntersectionObserver suspension/resumption, explicitly disposed 1024 shadow map, and flex-sized preview to avoid the larger controls covering feet. Offscreen draws measured 1176/sec before and zero after; resumption positive. Shadows increase visible draw calls (1239 to 2460 per one-second sample); short phone Sable p95 18 ms, max255, no claim of sustained GPU improvement. Nine phone controls/visibility assertions passed and image inspected. Hero/portrait/loading focused tests passed8/8. WebKit desktop all-three-look + five-open-close lifecycle run live session21512, then Sable five-pose baseline queued in session from poses-baseline.log. Full goal and gates remain incomplete.

Rendered audit found Sable side torso clipping despite the old pose gate passing. Measured8–13mm penetration and reused the existing Jevica fit routine through an owned/cached geometry wrapper. New Sable and original Jevica fit tests pass2/2; pose browser rerun passed and standing/seated captures inspected with side gap removed. Kept original Jevica test intact after initially choosing a colliding test filename; new regression is sable-bodice-fit.test.js. Earlier experimental side-only raster fit was replaced, not shipped. Final implementation is character-bodice-fit.js + romance-look.js integration. Before/after pose captures and reports retained. Full wardrobe browser session40994 active; isolated Redis50736 live session49674; full verification queued behind wardrobe under browser lock (see .runtime/apple-polish/full.log). No commit or PR yet; full objective incomplete.

The full wardrobe audit completed55 rows with no automated failures, but inspected Lyra/Vesper seated side captures exposed the same skipped bodice fitting. Stopped the queued (not yet started) full gate, added a regression that failed on those looks, and applied the shared fitting wrapper to every non-Jevica look that actually contains the source bodice; Jevica retains her existing costume-owned fit. Source geometry, topology and human identities stay unchanged. Full wardrobe rerun follows focused fit tests in session72320; full verification requeued using isolated Redis50736. Earlier full session83743 was explicitly terminated before checks started. Keep goal active pending these checks, image review, acceptance report and PR.


### Resume audit — 2026-10-18 13:05 UTC

Re-read the original objective. Full verification session 66899 remains live, with dependency audit and agent tests passed and preview tests running. Native Safari session 72837 remains queued. Wardrobe session 72320 exited zero; all 55 cases passed. Inspected additional final feminine Silvan, Kai explorer, and Jevica seated captures and documented visual limits in acceptance report. No merge/deploy and no completion claim. Primary local main is a5e2a8ec, but an explicit fetch confirms origin/main remains at this branch base 153471bc; do not conflate another checkout’s local commits with published upstream.


### Verification and delivery preparation — 2026-10-18 13:08 UTC

Full gate advanced: 121 tooling tests passed; preview suite 3,525 passed, zero failed, one skipped (3,526 total). Server tests with isolated Redis now running. Final Chromium/WebKit desktop and touch acceptance queued as session 83463, log `.runtime/apple-polish/final-browser.log`, with controls, visibility, and five-cycle lifecycle assertions. Native Safari remains queued as session 72837.

Copied only this task into the branch register and regenerated the plan index. `node scripts/plans-index.mjs --check`, acceptance-harness syntax check, and `git diff --check` passed. Live `project:check` reports repository-wide retirement/ownership, stash, and unrelated missing/unregistered-worktree debt; no permission to discard or reconcile other owners' work is inferred. Details retained in `.runtime/apple-polish/project-check.log`.


### Server and build gates — 2026-10-18

Full verification passed all 914 server tests with Redis (no skips), including Jevica-only office authority and real memory/Redis invitation/revocation transports. Desktop tests, build, Python lint/format, all 141 Python tests, and the demo/expected-exit demo verifier have passed; secret scans and browser journeys remain. Preview's single skip was the existing Vince glazing approach obstruction, not coverage of the glass itself. Expanded acceptance report with a requirement matrix and exact measured loading/resource values, retaining cache/host and unavailable WebKit heap limitations.

Core command queued under session 67924, `.runtime/apple-polish/core-final.log`; preserve the live queue rather than restart. Final browser session 83463 and installed Safari session 72837 remain behind full session 66899. Live project check exited 1 for unrelated registry debt; its evidence is retained and no other ownership was changed.


### Cleanup review and browser gate progress

Reviewed shared fitting ownership and found the existing headless-rig early return could strand the newly allocated fitted geometry. Moved fitting after head validation and added a real-rig headless regression. All eight combined bodice/romance tests passed (`.runtime/apple-polish/fit-review.log`). Full preview tests preceded this small change; queued core will cover the final source.

Corrected acceptance source-digest timing to occur after acquiring the shared browser lock, so queue-time edits cannot silently invalidate provenance. Intentionally terminated final browser session 83463 while it was still queued (confirmed exit 143, no browser started), then requeued corrected harness as session 68347. Syntax check passed. Native Safari 72837 and core 67924 remain live/queued. Full session 66899 passed secret scans, security browser tests and reflections, then passed player and multiplayer lifecycle journeys; broader experience run continues. No commit/PR or completion claim yet.


### Draft PR delivery increment

Signed implementation commit `1c9c36c15bf189a33bf3d8bf9296d79ca7393dad` pushed; signature reports `G`, attribution check printed nothing, staged secret hook passed. Opened draft PR https://github.com/BunsDev/river-oaks/pull/504. Hosted Python 3.11/3.13, dependency review and CodeQL passed; remaining jobs running. PR is conflict-free against published base `153471bc2075e0d02e764a97b0a72129d6da5207` and remains draft pending acceptance.

Local full run passed first-visit desktop/touch, store introduction, photo, rail navigation, places guide, World Studio and spatial circulation; spatial-streets now running. Later shared-account/office/browser checks, installed Safari, final measurements and literal core remain required. Do not mark delivered or retire: the goal authorizes a reviewed-ready PR, not merge/deploy. Generated `data/reports/experience.json` remains owned by the active runner; preserve its result before restoring tracked generated evidence at the end.


### Full experience completion

Full gate's 12 experience journeys passed, including spatial-streets and office desk/visit. Copied the runner report to `.runtime/apple-polish/full-experience.json` before restoring only its tracked generated file. Shared suite now runs with ANGLE Metal on Apple M3 Max; its `data/reports/shared-experience.json` is active runner output and must remain untouched until completion. At the latest hosted poll only `preview shared (required)` remains in progress; no failures. Safari/core/final-browser handles remain queued and live.


### Initial implementation head CI

All hosted checks, including required aggregate `preview`, passed on signed head `1c9c36c15bf189a33bf3d8bf9296d79ca7393dad`. Aggregate evidence: https://github.com/BunsDev/river-oaks/actions/runs/39130603519/job/117687248787. Full check API receipt retained at `.runtime/apple-polish/hosted-initial-head.json`. This is exact-head CI proof for the implementation commit; later report commits need their own checks. Classic branch-protection endpoint returned 404, so do not infer current protection configuration from it; the repo's documented aggregate gate is green. Local full shared suite remains live; no completion or merge claim.


### Local shared-suite failure investigation

`multiplayer-exclusivity` failed after 63.673s: owner lost its local ride after a server snapshot reported vehicle rolls. No page errors; catch diagnostics were empty because the journey's finally closed both tabs first. Full session 66899 continues other journeys. All16 hosted checks passed this head, but that does not erase the local failure.

Read systematic-debugging skill and traced client corrections to walking-ui.applyServerPose, which unconditionally stops transport; the triggering correction is not yet established. Added temporary pre-close ride/pose/server/status diagnostics to the failing assertion, without weakening it or changing runtime behavior. Focused required-mode retry queued as session87487, `.runtime/apple-polish/exclusivity-retry.log`. Original test saved at `.runtime/apple-polish/exclusivity-original.js`. Need distinguish reproducible runtime fault from fixture ordering/timing before proposing a fix. Preserve the full failed report when runner exits.


### Completion of remaining coverage after shared failure

Resident names, sit-and-water and greetings passed; character-studio-shared now running. Confirmed scripts/agent.mjs stops later stages after shared failure, so queued the configured IPIC screening command separately (`pnpm run test:screening`, `.runtime/apple-polish/screening-followup.log`). This preserves required coverage rather than allowing the full-profile early exit to omit it. Focused exclusivity diagnostics now retain up to twelve server corrections with rejection error codes before tabs close. No runtime fix is proposed without reproduction evidence.


### Full terminal result and native Safari prerequisite

Full session66899 exited1: all stages through experience passed; shared had23 passed/1 failed (multiplayer-exclusivity), screening not_run due stop-on-failure. Preserved `.runtime/apple-polish/full-first-receipt.json` and `full-shared.json`, then restored the tracked generated shared report. Character Studio shared and creator objects both passed. No full-pass claim.

Native Safari72837 exited1 before creating a browser session: Safari requires Allow remote automation in Settings/Developer. Asked the user asynchronously to enable it or explicitly retain native Safari as unverified; continue independent work. Core67924 is now running. Final browser68347, diagnostic87487 and screening43701 remain queued. Primary task lease renewed for two hours. Do not restart terminal full blindly; diagnose the one failing journey and complete omitted screening coverage.


### Direct Safari fallback and core wait

Computer-use skill read; node_repl @oai/sky imported successfully (target mac). Existing phone fixture accepts127.0.0.1 and supplies a guest through its normal fixture session endpoint, allowing direct native Safari UI acceptance without changing browser settings or production auth. Queued runtime-only native-ui-fixture.mjs as session25239; when ready, read `.runtime/apple-polish/native-ui-origin.txt`, use only node_repl/sky for UI, and create `.runtime/apple-polish/native-ui-stop` after inspection so it releases fixture and lock. Fixture has a15-minute bound after acquiring the lock. User informed remote-automation setting change is unnecessary for this fallback.

Core67924 remains live with one preview child, silvan-drape.test.js (PID78835 at inspection), still consuming CPU. At14:01UTC host load was65.59/66.71/73.70 with32% memory free. Do not terminate or restart solely for a quiet log; wait for authoritative exit/receipt. Other queued jobs remain unchanged.


### Final automated browser pass and bounded core retry

Core67924 exited1 after566s:3525 passed,1 failed,1 existing skip. Failure is unchanged office-penthouse-furnishings wall-time idle-slice assertion65.9ms against40ms; all checks were executed unchanged. Preserved core-first-receipt.json. Queued complete core check set with only preview test-file concurrency limited to4 (runtime scriptcore-bounded.mjs, session7698, Redis50736, explicit commands in core-bounded-receipt.json); no assertion thresholds changed. NODE_OPTIONS does not allow test-concurrency, so the runtime wrapper uses Node's explicit CLI option instead.

Final browser68347 exited0: Chromium/WebKit desktop and WebKit touch,3 looks each, no page errors,6/6/9 control checks and5 cleanup cycles per case. Silvan touch draw windows5664/0/5760 confirm offscreen suspension. Recorded source digest and exact implementation revision in docs/acceptance/apple-studio-final-measurements.json; inspected/copied final Sable desktop/phone captures. Updated report with exact latest metrics while retaining earlier outliers and memory/performance limits. Ride diagnostic87487, screening43701, nativeUI25239 and bounded core7698 are queued behind another owner's IPIC run; do not interrupt it.


### Fresh ride pass, sequence reproduction, and queue/storage recovery

Focused ride87487 exited0 in80.517s with local riding true, server rolls, and no corrections. Saved `.runtime/apple-polish/exclusivity-fresh.json`, restored tracked generated report. This does not explain the full-suite failure. Added temporary env-gated prefix diagnostics to replay multiplayer and indoor-npcs in fresh contexts on the same town before the original exclusivity assertions; queued session5674 (`exclusivity-sequence.log`). Preserve/revert these temporary test edits after investigation; no runtime fix guessed.

NativeUI25239 and bounded-core7698 terminally failed in queue bookkeeping with ENOSPC before their work began. Disk recovered to4.5GB without our deletion; no cleanup performed. Saved first logs, requeued nativeUI47961 and bounded-core99633. Screening43701 also exited1, but for a distinct90s player-ready timeout: inspected failure screenshot showed SwiftShader hardware-acceleration warning and connecting town. Saved swiftshader report/screenshots. Queued runtime-only screening-metal.mjs as32208: identical fixture and screening assertions, only Chromium launcher changed to ANGLE Metal; this is native-GPU local coverage, not a software-renderer pass. No production auth or renderer code changed. Order: sequence5674, nativeUI47961, Metal screening32208, bounded core99633, subject to other owners' prior queue entries.


### Resumed objective and live verification

Reread the original objective at14:15UTC. Previous prompt-only reply made no implementation progress; resumed the existing goal rather than creating a replacement. Confirmed all four process handles live (5674,47961,32208,99633), and independently confirmed the other owner's preceding screening process45380 was running. Sequence5674 has since acquired the queue and started multiplayer-exclusivity on native ANGLE Metal. Updated the acceptance report to distinguish the passing fresh ride reproduction, running sequence reproduction, failed SwiftShader readiness and pending Metal follow-up. No gate is newly claimed passed; native Safari UI remains queued.


### Sequence reproduction and installed Safari evidence

Session5674 exited0: multiplayer and indoor-npcs prefixes passed, then multiplayer-exclusivity passed on the same fixture. Preserved exclusivity-sequence.json, restored the tracked generated report and original exclusivity test. This does not erase the initial full-suite failure. NativeUI47961 acquired the queue at origin127.0.0.1:52711. Opened a new private Safari window through sky; observed town load and Studio rendering. The window changed independently from Aurel to feminine Silvan with Portrait/Golden hour controls; computer-use reported user changes. Captured native-safari-studio.png in runtime evidence, showing rendered human preview and visible desktop controls/footer. Asked whether the user is using the window and avoided further UI actions; do not count independently changed controls as agent-executed tests. Fixture retains its bounded15-minute lifetime.


### Native fixture released and screening wrapper repair

Stopped owned native fixture via its stop marker;47961 exited0 and released the queue, leaving Safari window untouched. Native evidence and limitations are in the report with a tracked screenshot. Metal screening32208 exited1 on ERR_MODULE_NOT_FOUND: the copied runner evaluated the original journey relative to its runtime directory, so ./hud-navigation.js resolved incorrectly. Preserved import-failure log/receipt and corrected only that runtime wrapper import path; original product/journey sources unchanged. Bounded-core99633 acquired the queue and is running tooling checks. Hosted16 checks reconfirmed successful at1c9c36c1.


### Complete core follow-up passed

Session99633 exited0. core-bounded-receipt.json records every core task passed:121 tooling;3526 preview passed,0failed,1existing skip;914server passed with Redis and0skips;76desktop;build;Python lint/format and141tests;demo and expected-exit verifier;secret scan. Only preview test-file concurrency differs from the default invocation, recorded explicitly in receipt/report. The prior default core failure remains preserved. Runtime source digest still matched final browser measurements before this run. Metal screening48566 remains queued; do not call full verification green.


### Screening passed and acceptance artifacts ready

Corrected runtime wrapper48566 exited0. Metal screening passed12 checks, convergence3ms and paused spread0ms; preserved receipt and included outcomes in docs/acceptance/apple-studio-verification.json. This does not convert the failed SwiftShader readiness run into a pass. Core follow-up completed, so isolated Redis50736 shut down without persistence; native fixture already stopped. Native Safari window left untouched because concurrent interaction was observed. Acceptance report contains final source-matched measurements, desktop/touch/native screenshots, failed gate outcomes and passing follow-ups, with physical-device/human/production limits. Remaining: signed acceptance commit, push, final-head hosted checks and requirement-by-requirement delivery audit.
