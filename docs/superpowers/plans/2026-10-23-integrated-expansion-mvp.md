# Integrated world-expansion MVP (#582–#587)

## Objective and ownership

Complete the user-authorized District → Bayou Market Commons → District two-player experience with streaming, shared activity, deterministic authored-state preservation, matched visual/performance evidence, and review-ready delivery. The full objective is retained; this ledger is not a substitute for implementation or acceptance.

Task: `integrated-expansion-mvp-20261023`. Owner: `codex:integrated-expansion-mvp-20261023`. Branch: `integration/expansion-mvp-20261023`. Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-expansion-mvp`. Initial pinned destination head: `bf89c12a8eacc1aecd0ec897f660ca18674bd170` (draft PR #611), containing current main `f4aa1670b2073fc6c8c9aeed2b167c7c3e5f6d8f` at the initial remote check.

Initially owned files: this ledger and `docs/acceptance/integrated-expansion-mvp.md`. The user subsequently approved adopting donor copies into this isolated worktree and explicitly authorized commit, push and merge. Other sessions retain their original worktrees. Deployment, issue closure, retirement and interruption of their jobs remain outside this request.

## Reconciliation

- Streaming: `world-streaming-582-583`, owner `codex:world-streaming-delivery-20261023`, dirty source on main f4aa1670 in `/Users/buns/.codex/worktrees/e9e0/river-oaks`. PIDs 80924 (full), 35899 (eager comparison), and 43220 (independent matched review) were confirmed live on 2026-10-23 around 21:01 UTC. Preserve their queue positions and source while running.
- Destination: `destination-slice-584-586`, owner `claude:river-oaks-3d-d7424aaf`, clean published bf89c12a. PR #611 is open/draft and its body still describes older 39fa912e evidence. Its active owner retains the original checkout.
- Authoring: `neighborhood-authoring`, owner `codex:01a16641-4c64-7d93-a452-6846b0e2809d`. Previously registered PIDs 42067/52488 are absent. The retained followup-full-001.log ends in full success and owned Redis shutdown; provenance and actual captures still need inspection before adopting evidence.
- Gate: `world-expansion-gate-587`, owner `claude:world-gate-587-20261022`, uncommitted gate and keyboard recovery work. Its acceptance report assesses a historical blockout revision, not the integrated Market destination.
- Pipeline boundary: PR #611 uses `shared/city-kit/assemble.js`; Studio authoring uses `shared/neighborhood/`. The destination ledger explicitly leaves pipeline reconciliation unresolved. Do not silently replace or discard either.

## Execution and evidence matrix

| Requirement | Authoritative proof needed | Current state / next action |
| --- | --- | --- |
| Pinned integrated candidate | Exact commit plus source manifest incorporating handed-off streaming, destination, and selected authoring/gate changes | Destination base pinned; source handoffs pending |
| Two-player normal-arrival round trip, seating and shared activity | Final-source browser journey with both authoritative poses, activity completion, reconnect, and return without reload | Older destination journey is historical; run integrated journey after fixes |
| Failure recovery and keyboard access | Final-source fault injection, focus/live-region checks, movement guards | Review streaming and gate interfaces; human review stays separate |
| Twenty travel loops and cleanup | Final-source loop receipt, resource counts, event/handle cleanup and bounded retention | Streaming owner's blockout receipt does not prove Market integration |
| Preservation | Regeneration fixtures for edits, additions, deletions, approvals, spawn, terrain, stable IDs and authored landmarks | Compare the two actual pipeline contracts before selecting integration |
| Visual quality and District parity | Inspected pedestrian and matched-camera captures from final source | Existing captures need provenance inspection; new integrated capture required |
| Performance | Matched medians of three warmed 30-second samples; frame/CPU, production transfer, reconnect, renderer resources | Historical per-lane receipts are insufficient; preserve first failures |
| Reachable area | Authoritative movement flood fill on candidate, distinct from reserved bounds | No 3–5× claim; remeasure candidate |
| Verification | Focused regressions, core, isolated-Redis full, final-head hosted checks | Not run in integration worktree yet |
| Delivery | Review-ready PR/stack, reproducible local demo, acceptance matrix, merge/release recommendation | Pending; no publishing or completion claim yet |

## Initial interface audit

The destination main loop directly owns `commonsScene`, calls its per-frame update, exposes it to Lantern Walk, and includes its tree shadow proxies. Streaming instead constructs the Commons scene asynchronously and does not expose that loaded group or call the destination's update hooks. Integration must preserve all four behaviors and clear references on eviction.

The Lantern Walk client caches only the lit-state key, not scene identity. A newly loaded scene with the same authoritative snapshot may therefore miss its lighting update after eviction/reload. This is a concrete regression hypothesis to reproduce before changing code.

Streaming currently budgets a 1 MiB geometry chunk and a visual box ending at ground + 5 m, based on the blockout. Check actual Market geometry size and landmark bounds before carrying those assumptions into the candidate.

## Next step

Inspect completed authoring evidence and final source hashes; reproduce integration hazards using read-only fixtures; obtain explicit source handoffs; then implement the combined scene lifecycle and run scoped regressions before expensive browser gates. Keep the user’s complete goal active.

## Initial execution results (2026-10-23, approximately 21:04 UTC)

Locked `pnpm install --frozen-lockfile` and `uv sync --locked` completed in this worktree. Initial doctor correctly reported the absent Python environment; after uv sync, `pnpm run agent:doctor` passed. No credentials or private runtime state were copied. `node --test preview/tests/city-kit.test.js preview/tests/bayou-market-commons.test.js preview/tests/lantern-walk-client.test.js server/tests/lantern-walk.test.js` passed 24 tests with zero skips; log `.runtime/integration/destination-baseline-tests.log`. This is destination baseline evidence only, not combined acceptance. `git diff --check` passed.

Confirmed defect 1: invoking the production Lantern Walk client with a lit authoritative snapshot, removing its scene, and replacing that scene leaves the replacement without any `setLanterns` call. Receipt `.runtime/integration/lantern-remount-before.json` fingerprints source `0ace09214cc23fb63c21c1a51c15fe8c44a55714517c20d397b601649feee684`. Initial scene received the lit state; replacement did not. DOM and scene were simulated; this proves the client caching defect, not browser acceptance. Fix requires a behavioral regression and scene-identity-aware replay after explicit source handoff.

Confirmed defect 2: actual headless `buildCityKit` geometry for the published Market recipe consumes 2,277,372 bytes (2.172× the streaming wrapper's 1,048,576-byte ceiling), excluding the base pavilion/ramp, textures, and GPU overhead. Actual scene bounds reach 30 m high; the wrapper's visibility bounds stop at ground + 5 m. Receipt `.runtime/integration/market-geometry-before.json`. Feeding the measured bytes to the production streaming scheduler under the wrapper's limits yields one failure, zero attachments, and resource disposal (`market-budget-before.json`, scheduler SHA256 `34de01c0a97396e73d45e802566f86dd14cb66e243ab85d3a7a713adad901745`). The memory refusal is reproduced; the visibility issue remains a source-supported risk needing a camera regression. Do not remove the ceiling; establish an explicit bounded destination budget from actual complete geometry and preserve rejection tests.

Authoring evidence refresh: `followup-full-001.json` passed at 10:59:23 UTC on dirty head 52379be6. All 40 recorded source hashes are unchanged between entry, exit, and this inspection. The separate `followup-browser-001.json` reports successful capture generation in `output/playwright/neighborhood-review-1792749867240`. Inspected three actual images: generated Market south approach, manual Market south approach, and generated Court overview. They demonstrate generated architecture and fixture-relative placement, but sparse open space remains prominent and the manual reference is a blockout. They do not establish parity with the rendered District or final Market destination. Fifteen other captures remain uninspected here. These receipts are source-bound historical authoring evidence, not an integrated candidate pass.

Verified wait: PIDs 80924, 81286, 89950, 43220, 35899 and 60882 remain live. Streaming full log advanced through campus lift traversal; no jobs were restarted or interrupted. The handoff question remains unanswered, and other owners' source files remain untouched.

## Follow-up evidence review (2026-10-23, approximately 21:08 UTC)

Previous goal turn classification: progress (owned worktree and ledger established, baseline executed, two integration defects reproduced). The handoff condition remains unchanged on this second goal turn; no ownership transfer was inferred. Live register reread retains all original owners. The running streaming full log advanced to `garden-campus-suite`, including suite entry, seating, and acknowledged desk save.

Completed inspection of all eighteen authoring images, including both manual starter references, sparse Market, three generated Market variants and three Court variants at overview and pedestrian stations. All 45 browser-capture source hashes match entry/exit/current state. The direct command `node scripts/compare_skill_views.mjs <manual-market-street-south-approach.json> <garden-market-default-south-approach.json>` returned matched metadata. Detailed visual judgments and limits are recorded in the acceptance matrix; these fixtures do not close final destination visual quality.

Measured the actual composed headless Commons scene, including ramp and pavilion: 2,370,180 bytes, 76 meshes, maximum geometry 30 m above ground. `.runtime/integration/complete-commons-geometry-before.json` preserves exact values and bounds. Browser-only tree models and texture/GPU bytes are excluded; do not select a final ceiling from this lower-bound measurement alone. A mathematical narrow-FOV camera probe sees the actual bounds while missing the old 5 m blockout box; `.runtime/integration/landmark-bounds-before.json` explicitly does not claim that its 5° lens is a supported gameplay camera or that a bounding-box intersection proves visible pixels. Actual supported-camera validation remains required.

Created a runnable first-failure regression in task-owned `.runtime/integration/lantern-remount.test.mjs`, importing the actual destination client. `node --test .runtime/integration/lantern-remount.test.mjs` fails at the expected assertion: the replacement scene receives no authoritative lighting update. Log `lantern-remount-red.log` is retained. This is intentionally a local handoff diagnostic until source ownership is transferred and the regression can accompany its fix in the normal suite. No production source changed, and the test has not been represented as passing.

Next available source work requires the pending explicit handoff: implement scene-identity replay, expose loaded scene lifecycle to activity/LOD/shadow consumers, establish an actual bounded resource budget, and cover destination visual bounds. Current owner's live runs must retain their source and queue positions. Final combined tests, demo, PR, hosted gates and human/device acceptance remain incomplete.

## Third-turn blocker audit and terminal donor failure

Previous goal turn classification: progress (eighteen-capture review completed, exact 45-file provenance checked, complete headless geometry measured, and a runnable failing regression added). This turn reread the attached objective and live register. The same explicit ownership handoff remains absent for the third consecutive goal turn. The user has not answered the pending handoff question; automatic continuation does not transfer ownership. The safe independent review has produced concrete fixes, but those fixes and the combined candidate require the handoff. Do not substitute more historical checks for the requested implementation.

Streaming PID 80924 is now absent, and its full receipt is terminal failed at `2026-10-23T21:08:46.074Z`. The experience stage ran 1,200,026 ms and ended with `SIGKILL`, `ETIMEDOUT`; the fifteen preceding stages passed, and shared/IPIC are explicitly `not_run`. The log reaches both players completing Commons chess, but does not prove the remaining reconnect/return journey. The aggregate timeout is observed; a product defect, host contention, or harness timing cause is not established. Retained exact receipt: `.runtime/integration/streaming-owner-full-attempt2-failed.json`; receipt/log hashes and donor paths: `streaming-owner-terminal-observation.json`. This is donor-source evidence, not combined-candidate verification. No rerun or timeout change was made.

PIDs 81286, 89950, 43220, 35899 and 60882 were confirmed live in this turn and remain owned by their original sessions. Do not stop/restart them. Ending their wait would not itself transfer source ownership.

Disposition: blocked on explicit source handoff or user-authorized ownership transfer, after three consecutive observations. Resume by recording exact authorized commits/patches and file scope for streaming, destination, authoring and gate work, then execute the preserved regression/fix sequence. The full goal remains incomplete; no combined PR, final demo, final full/hosted success or release approval is claimed.

## User resume: fresh audit, turn 1

The user reactivated the goal. Re-read the full attachment; retained the original scope and reset the blocker audit. The live register still names the original source owners, without a new handoff to this integration task. The destination's recorded 18:50 UTC handoff belongs to its current owner and is not a transfer here. The integration task is active with a renewed two-hour lease.

New evidence: destination capture PID 81286 is absent and its three PNGs were produced at 21:09:21–25 UTC. Inspected `.runtime/tmp/cap-glass/{arrival,street,court}.png` and the actual capture helper. Market Street shows continuous frontage, a paved lane, tree rows, storefront signs, court furniture and the tower as a distant landmark. Storefront glazing still reads as flat brown panels in these views, despite visible shelving and pendant details; this is a qualitative observation, not a proven shader defect. The capture helper fixes camera position/target and 60° FOV, viewport 1440×900, Sharp quality, reduced motion and Metal Chromium, but has no entry/exit source manifest or per-image metadata and explicitly identifies itself as a review aid. It moves the audit camera, not the walking player; the HUD's District label in these images does not prove a location-label bug. Record and image hashes are in `.runtime/integration/destination-capture-review.json`.

PIDs 89950 (destination journey), 43220 (matched review), 35899 (eager comparison) and 60882 (IPIC diagnostic) were confirmed live after resume. No duplicate run, source change, queue alteration or owner transfer occurred. Continue with terminal results or an explicit source handoff; implementation remains pending rather than falsely complete.

## Resumed audit, turn 2

Previous resumed turn classification: progress (new destination captures inspected). Re-read the objective and live ownership; no source handoff is recorded. Polled the same destination PID 89950, confirmed it live, waited 30 seconds, then confirmed it absent. At that second poll, `data/reports/experience.json` reported `createdAt: 2026-10-23T21:12:16.892Z` and `east-garden-commons`, `failed`, `156.66` seconds. Before the subsequent detail read, the report had reverted to its historical 2026-09-29 contents. The terminal status observation is retained in this ledger, but no raw terminal report was captured and the failure cause is unknown. Do not infer a timeout, product defect, or complete journey from that limited observation. Fresh Market Street and tower PNG modification times likewise do not prove acceptance.

PIDs 43220, 35899 and 60882 remain live; no restart or interruption. The same handoff dependency remains on the second resumed goal turn. Next substantive integration change still requires the user/owners' explicit source handoff. The destination owner must supply its retained terminal failure detail before diagnosing or reusing that run.

## Resumed audit, turn 3: blocked

Previous turn classification: verified wait followed by terminal evidence (destination journey failed, cause unavailable). Re-read the full goal and all four source ownership records on the third consecutive resumed turn. There is still no handoff to this task and no user reply transferring ownership. PIDs 43220, 35899 and 60882 remain live; their continued execution is not ownership transfer. Independent reviews and diagnostic reproductions are recorded; repeating them would not advance the required combined implementation. Mark the goal and task blocked on the explicit handoff. Preserve all source, queued runs, original failures and the isolated integration worktree. Resume when the owners supply exact source handoffs or the user explicitly authorizes adoption into this integration branch; do not stop or edit their live worktrees as part of that adoption.

## Delivery request and current audit

The user approved adopting donor source into the isolated integration branch, then explicitly requested commit, push and merge to main. Ownership approval and merge authorization are now present; the earlier handoff blocker is cleared. Original donor worktrees and running jobs remain protected.

The integration branch remains at `bf89c12a8eacc1aecd0ec897f660ca18674bd170`, with only this ledger and the acceptance matrix untracked. No combined implementation has been made. Remote main is `f4aa1670b2073fc6c8c9aeed2b167c7c3e5f6d8f`. REST confirms destination PR #611 is open, draft, at `c2598c65d2566816b967596661ca924972d43f44`, with a blocked merge state. GraphQL inspection failed due to API rate exhaustion; REST supplied the PR and check evidence.

Hosted run `40029430939` fails the required aggregate `preview` check. The `preview unit` job fails its dependency audit on transitive zod `<4.6.6` (GHSA-mrhx-c7xc-m3w5), before unit execution. The `preview experience (commons)` job reaches both players completing chess, then fails `alice plaza: stalled` on the subsequent route. Exact logs are retained in `.runtime/integration/pr611-unit.log` and `pr611-commons.log`. These failures must be addressed and the final candidate verified before landing; the merge request does not establish a passing candidate.

A fresh `pnpm run verify` on the unchanged integration baseline is running, with output retained in `.runtime/integration/pre-delivery-core.log`. Scope clarification distinguishes completing the combined MVP, delivering destination PR #611, and publishing only the two planning documents. No commit, push, merge or donor edit occurred during this audit.

## Approved integration implementation

Adopted immutable source snapshots from streaming (19 files, base f4aa1670), authoring (44 files, base 52379be6), and gate (11 files, base 638a157f), over destination c2598c65. `docs/acceptance/integrated-expansion-provenance.json` records exact donor hashes. Source files were copied into this isolated branch; no donor worktree or queue position changed. Conflicts in main scene ownership and journey revision selection were resolved for the Market destination.

Ruling: retain both deterministic authoring pipelines — the city kit authors the published Market, while World Studio neighborhood generation remains an offline authoring capability with its own preservation contract — neither compiler replaces the other's saved state or IDs. Cost if wrong: future publication from Studio needs an explicit adapter rather than assuming interchangeable formats.

Ruling: streaming owns the complete Commons presentation lifecycle and supplies the active scene through an attach/detach callback — the main loop retains its existing LOD, shadow and Lantern Walk consumers. Count geometry, morph and instance buffers after landscape readiness under a 16 MiB ceiling; this does not claim texture or total GPU memory bounds. Cost if insufficient: the loader rejects the scene and keeps the entry guard closed rather than allowing entry into absent content. The conservative Market visibility envelope includes the tower and outlying landscape; physical-device visibility/performance remains unverified.

Fixed the reproduced lantern-remount cache defect (scene identity now invalidates the cached lighting snapshot) and loaded-landscape disposal (owned geometry/materials/instance storage released, shared texture maps retained). Both tests were observed red then green. The Market streaming suite now passes twenty headless load/evict cycles; scene hooks wait for landscape readiness and cancellation releases pending allocations. The shared walking HUD owns arrival announcements to prevent duplicate notices and names Bayou Market Commons. Original blockout movement-clearance tests retain their original geometry, while added Market assertions distinguish its expanded sidewalks from the unbuilt reserve.

Baseline core on bf89c12a passed before source adoption; it is not candidate verification. Focused integration initially failed on old blockout revision strings and expectations, now corrected. Authoring focused suites passed, Python reference adapter passed 14 tests, and dependency audit reports no known vulnerabilities after adopting the existing 16eff1a0 Zod/Electron patch. Regeneration attempt 001 completed 14 candidates and 1,928 routes but failed its final source-stability check because the integration owner changed continuous-walk-582.test.js during the run; retain that invalid attempt. Attempt 002 runs with sources held fixed. Candidate core and the queued east-garden-commons browser journey are in progress. No integration commit, PR, merge or full acceptance claim yet.

## Independent review and verification follow-up

Final review used a fresh read-only reviewer. Critical: the main-entry merge resolution lost the Lantern Walk import while retaining its top-level call; restored the import, with browser startup still queued. Important: a restored player east of the rain garden was trapped because the streaming retreat guard rejected lateral movement. The production-solver regression failed at the exact east-face position, then passed after allowing lateral motion without eastward advancement; District entry remains vetoed. The combined focused integration suite passes 32 tests, zero skips. Final: minor (deferred): streaming notices retain the old East Garden Commons name while the arrival HUD names Bayou Market Commons.

Isolated Redis on 127.0.0.1:16493 is task-owned; nine Commons and Lantern Walk tests passed with zero skips. Regeneration003 passed fourteen candidates, 1,928 routes and ten preservation categories before the review import/retreat corrections; a final source-bound run is underway. The dependency patch initially replaced package.json wholesale and dropped the destination script aliases; inspection caught this and restored both aliases before the final focused policy check (2/2 passed). The patch now changes only Electron's version in package.json, alongside the lock and override.

The current authoritative footprint audit measures Gardens 46,477.75 m² versus Market 52,030.75 m² on the 0.5 m grid (5,553 m² added, 1.11948×); 1 m results are 46,549 and 52,130 m² (1.11990×). This is ground sampling only. The same-process simulation includes two and thirty-two fixture players; it is diagnostic, with long-tail ticks on both revisions, not a capacity or performance acceptance pass.

## Verified commit checkpoint

`pnpm run verify` candidate core001 passed all eleven phases. The review corrections were independently covered by the final 32-test focused suite; full exact-commit verification remains next. `node scripts/neighborhood-review.mjs .runtime/integration/regeneration-final` passed with matching entry/exit source manifests, fourteen candidates, 1,928 routes and no failures. The compact committed evidence file retains provenance and explicit scope limits. All original failures remain in the task-owned runtime directory.

The signed commit and draft PR checkpoint contains the combined implementation, tests, donor provenance and acceptance gaps. It does not mark the complete MVP delivered or authorize a deployment. The already queued two-player journey retains its queue position; next run the final commit through isolated-Redis full verification, rendered travel/resource loops, matched performance/captures and required hosted checks before guarded landing.

## PR #623 hosted prerequisite correction

Signed commit 79e6dfbfb7df5a353ae6b88080a44c2b5454ec6e was pushed and GitHub reports its signature valid. Draft PR #623 is open. Hosted run 40039600927 failed Python 3.13 with two neighborhood CLI round-trip failures: the Python job had not installed the Node dependency `three`; Python 3.11 was cancelled by the matrix. Raw log is retained at `.runtime/integration/pr623-python313.log`.

Added the repository's existing SHA-pinned pnpm and Node 24 setup actions plus frozen dependency installation before pytest in the Python job. Installation skips lifecycle scripts because this lane does not need desktop binaries. The actual adapter/Node round-trip tests pass locally (14/14), and the workflow parses with dependency installation preceding pytest. Runtime source is unchanged by this CI-only correction, so the running full verification and queued journey are preserved; hosted checks must run on the new commit.

## Queue timeout and main reconciliation

The first local full run completed its non-browser stages, then failed `security-browser` after 600,015 ms (`SIGKILL`, `ETIMEDOUT`) while still waiting behind seven runs; browser tests never started and later browser stages are `not_run`. Preserve `.runtime/integration/final-full-001-failed.json` and its full log. The standalone Commons journey remains queued in its original position.

Main advanced to 132a75a2, including the already adopted dependency versions and ad488574's verification-runner change that excludes browser queue wait from task deadlines. Merged that main snapshot without altering the running standalone journey; all thirteen runner tests pass. A new full run will use the corrected deadline handling rather than increasing a test timeout or bypassing the queue.

Hosted Python 3.11 and 3.13 passed after the prerequisite correction. The places shard then failed only `contextual-first-visit`: the touch Talk press received the authoritative `travel_cooldown` response; subsequent office journeys passed. Its first-failure log is retained. The journey already handles immediate entry/exit cooldowns, but required the immediately following Talk to succeed. Updated it to accept only the named cooldown refusal with visible explanatory copy, wait for that notice to clear, retry once, and still require the actual conversation. Syntax validation passes; behavioral confirmation awaits the full and hosted journeys. No server cooldown or permission rule changed.

The first workflow-parser check found no local PyYAML module; the standard-library Ruby YAML parser subsequently validated the workflow and dependency-install ordering. The Python adapter test still passes all fourteen cases.

## Full verification attempt 002 timing failure

On signed f3ebaf8981b0636a5b3763bf5eef344381f58489, full002 passed dependency audit and agent tests, then preview tests reported 3,947 passed, one failed and one skipped. The existing penthouse texture idle-slice test measured 51.0 ms against its 40 ms ceiling. Neither the test nor its implementation differs from main132a75a2. The isolated named test passed without changes (one test, zero skips); this does not erase the full-run failure or establish its cause. Preserve `final-full-002-failed.json`, `final-full-002.log` and `idle-slices-isolated.log`. Full003 is running on the same source with the same thresholds.

The standalone two-player journey has acquired its original browser queue turn. The remaining acceptance bundle preserves its queue position and includes twenty rendered loops, keyboard/recovery, matched rendering/performance, authoring review and a task-local production initial-transfer diagnostic. The latter reuses the existing synthetic fixture identity and production game-server static asset handler with the production bundle; it compares Gardens and Market configurations in current source, not an untouched historical build or CDN compression. No result is claimed before execution.

## Local District corner driver correction

The standalone journey001 failed on the owner's District approach before entering Market; Alice reached the gateway. Saved receipt and actual Metal-rendered failure image as `journey-001-failed.json` and `journey-001-failure.png`. The captured position is free, but its direct leg to the next waypoint crosses a solid glass-fronted building corner. The real navigation planner supplies an intermediate corner waypoint. Reproducing with the production walking solver stalls with the browser driver's 0.35 m arrival tolerance and reaches the target with 0.15 m tolerance (`corner-tolerance-red-green.jsonl`). Tightened only the journey driver tolerance to 0.15 m, inside the planner's 0.3 m waypoint clearance, and added the exact captured corner regression. No collision or server authority changed. Journey002 is first in the existing remaining-acceptance queue turn; no duplicate queue entry was added.

Full003 began before this harness/test correction and is retained as evidence of its actual source timing; focused corner verification and the next hosted revision must cover the correction. Full002's timing failure remains unresolved in origin rather than being labelled a product defect or erased by an isolated pass.

## Completed browser checkpoint and remaining failures

On 9b05d745, journey002 passed the full normal-arrival two-player route, shared chess, reconnect with identity/position retention, all five shared lanterns and return home without a reload or page errors. Inspected the Market street, game, tower and court captures. Hosted aggregate preview passed at run40042539937. Rendered authoring review also passed. The matched desktop and phone-viewport two-player District captures retain the baseline composition; phone viewport is desktop GPU evidence only.

Matched collection001 completed 24 warmed thirty-second windows and 36 reconnects, but does not pass all proposed budgets. Desktop solo CPU p95 median rose 17.92%; desktop two-player frame p95 median rose 33.4 to50.0ms (+49.70%) and CPU rose32.52%; phone two-player CPU rose12.95%. Reconnect changed+1.26% desktop and-8.80% phone. Retain the original measurements and variable host load. Added per-frame-phase distributions and stream state to the next audit to investigate before optimization.

Actual production /play/ initial-transfer collection passed three fresh contexts per configuration: Gardens46,044,636 bytes versus Market46,044,644 bytes. This is current-source configuration comparison through the production static handler and fixture auth on uncompressed local HTTP, not historical-main or CDN transfer. The prior all-bundle gzip sum remains separately scoped.

Rendered loops001 failed at startup because the test read a null walking pose before assets finished. The recovery driver now waits for both asset completion and a finite pose. The keyboard gate passed initial failed-load/reload, arrival, authority synchronization and post/rain-garden/reserve collision probes, then stalled beside the Market tree row on its return leg; the tolerated heading error sent it into the tree. Added the captured-position regression and an east-side clearance waypoint. Both drivers now use15cm waypoint tolerance. Six traversal regressions pass; the combined recovery focused suite passes21 tests. Browser confirmation remains queued.

The court capture exposed an interaction defect: the route notice and Lantern Walk status overlapped. Both now share a wrapping vertical container; the gate checks separate, on-screen bounds at desktop and390px width, with explicit space below phone header controls. This presentation correction is awaiting browser verification. Full003 completed shared journeys and is queued for its screening stage; it began before later harness and HUD corrections, so cannot certify the final source on its own. Recovery core is running and the next browser queue turn preserves the original retry handle.
