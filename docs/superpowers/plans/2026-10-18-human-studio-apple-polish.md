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
