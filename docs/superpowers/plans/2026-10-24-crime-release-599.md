# Crime release #599 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the optional crime loop release gate against current main while preserving the peaceful default, safety, recovery, accessibility and 32-player budget.

**Architecture:** Reuse the authoritative world, policy/crime/police directors, fenced Redis gateway, existing test fixtures and rendered audit. Add release-specific behavioral coverage and matched measurements; fix only demonstrated defects. Keep production disabled and produce a reviewable checklist and operator playbook.

**Tech Stack:** JavaScript ESM, Node tests, existing Redis and WebSocket transports, Three.js, Playwright, pnpm/uv verification.

**Spec:** GitHub issue #599 and the user's active goal. The user explicitly requested execution of this release gate; implementation proceeds inline within that scope.

## Current checkpoint, 2026-10-24 14:06 UTC

Candidate is fetched main9ee738f8ca12bec54fb0d2a26d6b88a103739921 plus this task's uncommitted baseline fixes. Core004 passed; full002 has passed13 non-browser phases and is queued at security-browser under the existing live runner94756. The supplied owned Redis29774 on16599 remains live. All36 frozen public inputs still match. Do not duplicate/restart those jobs or call partial full verification a pass.

Current scope and open requirements are in `docs/acceptance/crime-release-599.md`; the rollback/operator deliverable is `docs/crime-operations.md`. Baseline policy browser, recovery and tiered measurements are preserved with their exact older source and limits. Absolute timing failures remain open. Live599 now requires #637/#640 and human gameplay-feel acceptance; dependency ownership scope is pending the native user question. No production activation, publication or own commit has occurred. Historical checkpoints below retain their original facts and superseded handles; follow this checkpoint for the current next action.

## Global constraints

No production activation, live account/database operation, paid service, new navigation framework, speculative asset production, weakened assertions, discarded failures or claims of global readiness. PvP remains unavailable until consent and abuse protection are proven. Preserve private state and other sessions' edits. Keep published prose one source line per paragraph.

## Ownership and baseline

Task `crime-release-599`; owner `codex:crime-release-599-20261024`; branch `test/crime-release-599-20261024`; managed worktree `/Users/buns/.codex/worktrees/cc29/river-oaks`; base/fetched main `2cbc4dc470897bd8ee4da059ac8795885ee594c1`. #596/#597 are closed; #598 implementation is merged in #621 with equal reviewed/merge trees. Its issue remains open. The separate `crime-police-598` worktree belongs to Claude and is preserved. #587's release audit owns Commons stall investigation and broad expansion acceptance; consume its receipts without editing its files.

Session-start retirement inventory from this thread found the delivered police branch blocked by owner/session release and ignored evidence; the other police branch remains active. No cleanup authority or eligible unowned candidate is inferred.

## Review focus

- Emergency off must remain usable while an ordinary policy request has a delayed/lost reply; late replies cannot replace the emergency result.
- PvP UI cannot promise player combat when the server has no consent mechanism.
- Attack replays after off, reconnect, capture and writer replacement cannot cause additional damage, stars or relocation.
- Migration rollback cannot be described as downgrading checkpoint16 into an incompatible writer.
- Measurements must include actual capped officers/attack work, preserve stalls and pair identical locations/populations; local fixtures cannot establish hosted or device acceptance.

## Task 1: Safety controls and truthful policy UI

**Files:** `preview/src/world-policy-ui.js`, `preview/tests/world-policy-ui.test.js`.

**Interfaces:** Existing `createWorldPolicyUI({panel,getTown,getEnvironment,command})` and policy snapshots. Preserve the world command contract and existing emergency command.

- [x] Add deferred-command behavioral tests proving emergency off can send before Apply returns, an older Apply reply cannot overwrite its result, and unavailable PvP cannot be offered or advertised.
- [x] Run `node --test preview/tests/world-policy-ui.test.js`; preserve expected failures before a fix.
- [x] Separate emergency pending state from ordinary save state, fence older completions, and present unavailable PvP honestly without enabling player damage.
- [x] Run focused policy UI and world policy suites, then the actual two-client policy journey with the shared browser queue.

## Task 2: Release recovery and shutdown matrix

**Files:** `server/tests/crime-release.test.js`, `server/tests/crime-release-transport.test.js`.

**Interfaces:** Existing `createSharedWorld`, real memory/Redis gateways, authenticated tickets and `worldPolicy`/`attack`/`surrender` commands; no production test helpers.

- [x] Add real multi-client cases for off during pending attacks/capture, retries/reconnect and reporting during surrender; inspect/reuse existing stale-protocol, migration/takeover and transport pressure/failure behavioral cases. Expanded #640 phased actions need their own future cases.
- [x] Run focused tests on an isolated loopback Redis; preserve any first failure, locate its authority boundary and fix only owned, demonstrated seams after claiming paths.
- [x] Record covered invariants and remaining gaps per #599 criterion in the release checklist, including the new unimplemented #637/#640 criteria.

## Task 3: Tiered baseline and crime load audit

**Files:** `server/crime-release-audit.js`, `preview/audit/crime-release.js`, `docs/acceptance/crime-release-599.md`.

**Interfaces:** Existing world/transport and rendered-audit metrics; synthetic local identities only. Reports include exact revision/source hashes, setup, samples and workload observations.

- [x] Measure matched peaceful and crime workloads at 1/8/16/32 players with attack bursts and as many officers as attainable (one-player demand is at most three, global cap is six). Confirm actual observed officer count and accepted/refused attack counts. Baseline4557 results are historical after new-main integration and do not close #640.
- [ ] Record cold/warm tick p95/max, snapshot/checkpoint raw and compressed bytes, RSS/heap, event-loop and real WebSocket responsiveness; measure rendered desktop/phone viewport frame costs through the common browser queue.
- [ ] Derive explicit comparison thresholds from repeat baseline variability and the existing 200ms room tick; do not silently pass a breached threshold. Reproduce and address material regressions before acceptance.

## Task 4: Release checklist, rollback and final verification

**Files:** `docs/acceptance/crime-release-599.md`, `docs/crime-operations.md`, this ledger; additional UI/docs paths claimed before fixes.

**Interfaces:** Consume exact tests/audits from Tasks 1–3, current deployment configuration and existing reporting/moderation controls.

- [ ] Document peaceful experience, zone-entry/exit and safety explanations, keyboard/screen-reader/reduced-motion/contrast findings, reporting access and any necessary tested polish.
- [x] Write operator steps for default-off rollout, controlled fixture activation, schedule changes, emergency disable, monitoring, compatible checkpoint backup/restore and incident response; rehearse locally without production access.
- [ ] Run `pnpm run agent:doctor`, focused regressions, `pnpm run verify`, and isolated-Redis `pnpm run verify full`; retain logs/receipts and stable source hashes. Keep first failures distinct from reruns.
- [ ] Obtain independent whole-branch review, fix important findings with regressions, reconcile current main and produce reviewable commits/artifacts. Publishing/merge is a separate action requiring session authorization; never enable production danger.
- [ ] Audit every numbered #599 item and acceptance criterion, including gaps requiring device/human/hosted evidence. Do not mark the goal complete while required work is missing.

## Progress

2026-10-24: Reconciled main and task ownership; native managed worktree created and exact branch claimed. Locked pnpm and uv installation completed. Read policy/crime/police integration, real transport tests, deployment config and existing performance harness. Source inspection identifies two hypotheses: the UI disables emergency off while Apply is pending, and PvP copy claims combat without a consent path. Neither is yet a verified defect; Task 1 will reproduce them. Existing evidence remains historical and is not relabelled as this branch's acceptance.

## Verified progress and remaining gates, 2026-10-24 06:50 UTC

This goal turn made implementation and evidence progress, followed by verified waits. No commit, push, PR, merge, production account operation or activation has occurred. The source remains based on `2cbc4dc4` with owned working changes. The plan is executed inline under the user's explicit execution goal; no extra design/permission gate is inferred from skills.

Doctor passed after locked pnpm/uv setup. Baseline focused police/policy tests passed 23/23. Emergency control and unavailable PvP regressions failed first and were fixed; the initial focused policy set passed 20/20. An authoritative viewport entry/exit notice then failed first and was implemented outside People; its policy set passed 21/21. A reviewer-found stationary schedule-end notice bug failed first and was fixed, with the latest combined policy/workload regression set passing 23/23, zero skips. First failures remain under `.runtime/crime599/first-failures/`.

Existing real memory/Redis crime, policy, obsolete-protocol, backpressure and transport-failure selection passed 23/23, zero skips. New world pressure/off/replay/restore tests passed 3/3; new memory/Redis reporting-during-surrender/off/replay/reconnect tests passed 2/2. The initial Redis reporting audit assertion used `type` where its durable contract uses `kind`; source and existing tests established that fixture error before correction. Owned AOF crash, mid-arrest writer recovery and quiesced full-key backup restoration into a different synthetic namespace passed 1/1, and also passed in the full server suite. Its first backup attempt corrupted binary DUMP data by decoding text; that failure is preserved and `dumpBuffer` now retains bytes. Neither correction changes production storage code.

Core001 passed all selected phases, with receipt `.runtime/crime599/core-001.json`; it predates the final stationary-notice fix. Full001 remains live as session **12974**, log `.runtime/crime599/full-001.log`, supplied isolated Redis session **29774**, PID **38792**, loopback **16599**, no persistence. All 13 non-browser phases passed: tooling 218/218; preview 3905 passed with one existing skip; Redis/server 1134/1134, zero skips; desktop 115 passed with three existing platform skips; build, Ruff, Python, offline pipeline, worktree/history secrets passed. Its preview log explicitly contains the new viewport-notice test and its server log contains the new AOF/reporting tests. The final notice fix and workload regression were added afterward; run the final current-source core gate after the pending contrast correction. Full001 is now queued at security-browser; preserve the same handle, do not duplicate it. Twelve inputs were pinned before full start and again before browser phases; later review fixes require explicit source-scope reconciliation, not an unchanged-source claim.

The one owned two-browser policy journey remains live as session **17286**, `.runtime/crime599/policy-browser-001.log`. It dynamically loads its journey source after browser-lock admission, so queued assertions now include delayed Apply/emergency ordering, protected PvP control, authoritative danger entry/exit, a real wanted indicator, and computed light/dark contrast over extreme scene backdrops. Contrast must run before a CSS correction: no contrast success is claimed. Capture inspection and keyboard/reduced-motion/actual browser acceptance remain required.

Matched rendering is live as session **76374**, `.runtime/crime599/performance-render-003.log`, output `.runtime/crime599/performance-render-003.json`. Earlier queued rendering001 (session31846/PID11214) was explicitly cancelled with terminal143 to correct a missing waitlist fixture method; rendering002 (session43074/PID59975) was explicitly cancelled with terminal143 for the review's malformed-attack correction. Neither ever acquired the browser lock or produced accepted measurements. They were not restarted because of an observation timeout or queue delay. Preserve rendering003. The shared queue advanced from holder61211 to6388 to51575; latest policy observation is three runs ahead. Queue waiting is not test evidence.

World002 contains 24 matched child-process cases at 1/8/16/32 players, real command bursts, loaded/post-off payloads and memory observations. One player observed three officers, other tiers six. Warm CPU comparisons pass, but wall-time budget breaches at 1/8/32 remain failed. Both 32-player diagnostic CPU profiles mainly sample existing navigation, pedestrian cost and resident clearance work; profile overhead and host scheduling prohibit claiming they isolate an exclusive cause. Raw profiles and baseline/active measurements remain in `.runtime/crime599/profiles/` and `profile-*.json`.

Redis001 contains 16 real fenced/compressed coordinator cases on loopback16599 and failed the eight-player comparison. This shared the owned service with part of full verification, a confound that is recorded rather than used to erase the failure. Redis002 repeated all 16 cases on its own loopback16598 service, passed comparison limits at 1/8/16 but failed 32 (179.890ms active warm-idle p95 versus63.150ms limit), and retained idle ticks over200ms in every tier. No performance acceptance. The dedicated Redis service session10702/PID38833 was cleanly shut down after its audit session82676 returned exit0. Keep the full run's separate Redis29774 alive until all required checks finish.

## Independent review disposition

The requesting-code-review skill explicitly dispatched one read-only independent reviewer, `/root/crime599_review`; the reviewer did not mutate files or run duplicate browser/Redis/full jobs. It found one Important malformed-load defect and two Minor findings. Ruling: regrade provenance omission as Important because this task's reviewable measurements must bind the dirty UI/CSS and fixture data actually measured; complete the source maps. Ruling: regrade the stationary schedule-end message as Important because a required safety warning must distinguish changed rules from a physical zone exit. These rulings cost additional focused regressions and invalidate any claim that the old UI source proves the final behavior.

The rendered workload's old `load-1`/`load-99` attack IDs reproduced `invalid_attack` through the real resolver. A shared audit-only builder now generates valid `crime-audit-*` IDs, is consumed by the harness, and has a real-resolver first/subsequent burst regression. The harness also rejects malformed attack outcomes and requires accepted active attacks independently of seeded stars. Provenance now includes dirty policy UI/CSS, workload helper and fixture data; source captures for new rendering/Redis runs use that corrected list. The schedule-end fix distinguishes danger ending in place, ordinary policy changes and actual departure. Both behavioral review regressions failed before the one fix pass and passed in the combined 23/23 set.

The reviewer declined pending browser/contrast/human/device/hosted/production acceptance and root-cause disposition of wall-time breaches. Those are retained open gates, not silently ruled complete. No deferred minor finding remains from that review, and no extra review loop was started. Further demonstrated failures still require their own preserved regression and appropriate verification.

## Next actions

Poll **17286**, **12974**, **76374** using their existing tool handles. Inspect actual policy screenshots and contrast JSON when produced; preserve any first browser failure, correct demonstrated CSS/interaction faults and rerun the affected journey without bypassing the queue. Finish/render all tiered samples and inspect captures. Investigate/dispose of the retained world/Redis timing failures without weakening limits or making hosted/device claims. Run final current-source core, reconcile source hashes and current main, complete the checklist/playbook evidence and only then prepare signed reviewable delivery. Keep goal active until every actual requirement is proven; production activation remains prohibited.

Continuation checkpoint: final-source core002 is live as session **4700**, `.runtime/crime599/core-002.log`; do not start another core profile while it runs. At the latest verified poll all three browser handles remained live and queued, with the policy journey two places behind confirmed live holder PID94254 (`phase2-full-zod-20261024`). The current lease is renewed through08:55UTC. Current owned source includes the workload helper and its real-resolver regression; all17 paths are recorded in the live register. No checkout/ref/evidence was retired: this branch has undelivered edits and active processes, while both older police worktrees retain their prior ownership and recovery obligations.

## Current-main performance correction and contrast failure, 2026-10-24 07:20 UTC

Policy001 session17286 became terminal exit1 after all functional assertions reached the final contrast check. The actual Metal browser measured wanted contrast as low as1.54:1 light and1.61:1 dark; the new safety notice exceeded9:1. Six evidence files were copied with hashes under `.runtime/crime599/first-failures/policy-browser-001/`, and the actual danger-entry capture was inspected. The wanted HUD now has an opaque theme panel and theme ink. Policy002 remains live as **65232**, `.runtime/crime599/policy-browser-002.log`. Never call the expected corrected ratios proven before it runs.

Core0024700 became terminal exit0 before the CSS/performance corrections. Main advanced through641655d2 and4557e70d (conditional GitHub polling, test deflake and Vite acceptance env isolation); the branch fast-forwarded without conflicts or overwriting owned edits. Changes were inspected, including explicit `envDir:false` in acceptance fixtures. Current HEAD is **4557e70d5ba866e9ae76a74859b5a3280c501c70**. Current-source core003 **52801** became terminal exit0, receipt `.runtime/crime599/core-003.json`. Current isolated-Redis all-server run **9853** passed **1135/1135, zero skips**. Do not start another core or server run merely to restate those unchanged results.

Redis003 was a focused32-player diagnostic with actual per-cycle Node process CPU, isolated Redis CPU counters and a Node CPU profile. Heavy cycles5/19 sample existing `staticFree`, `canTravel`, pedestrian cost, room/ground clearance and grid routing in both arms. Redis CPU across a case was about19–21ms; individual heavy world cycles used about148–222ms process CPU, with additional scheduling/wait time in some wall measurements. This supports investigating the simulation query path rather than calling Redis itself the exclusive cause. The diagnostic comparison still failed and remains preserved. Its dedicated Redis2499/PID78805 was cleanly stopped after terminal audit10401.

The new failing `walking-query-budget.test.js` observed one terrain access for a free Westcreek point outside all salon props. A virtual loader candidate (`.runtime/crime599/walking-fastpath-loader.mjs`) proved the same one-line fast path could skip that query while retaining real prop collision and placed-object height checks;16 tests passed. Twelve interleaved32-player virtual/old-source cases reduced median heavy route tails by roughly20%, with raw samples preserved in `walking-candidate-performance.json`. This was diagnostic evidence only, never product acceptance.

Ruling: extend the implementation scope to the isolated `createWalkingEnvironment.isFree` prop-bound early return, because CPU traces and the operation-budget failure demonstrate unnecessary work on the authoritative route path. Ownership reconnaissance inspected the other active walking checkout: its dirty change adds `guardedStepEnvironment` around line155, while input recovery concerns controller state. This one-line query seam does not touch either; their branches/edits are preserved, and scoped ownership is explicit in the register. This costs broader movement/navigation/Redis verification, without changing collision geometry, budgets, navigation framework or checkpoints.

The actual product fast path passed40 focused geometry/navigation/conversation/placed-object/police checks and the current1135 Redis/server suite. A focused follow-up to the same independent reviewer covered only this new scope, found no correctness issue, and passed the two operation-budget regressions. It did not repeat the earlier review or claim performance acceptance. Provenance lists now include dirty `walking.js` in all three audits. Rendering003 **76374/PID17401** was explicitly cancelled terminal143 while still queued to avoid measuring cached old server code against changed browser code; this was required source correction, not observation-timeout or queue-delay restart.

Current matched rendering is **31202**, `.runtime/crime599/performance-render-004.log`, output `performance-render-004.json`; preserve it. Full001 **12974** remains live, queued at browser phases; its earlier non-browser source is historical and its final receipt cannot silently certify the later walking change. Policy002 **65232** is also queued. Source freeze is recorded in `.runtime/crime599/candidate-4557-source/manifest.json`:36 public source/fixture/lock files copied with hashes, no env/private state, unchanged at the last check.

Actual fixed-source world003 is live as **90822**, `.runtime/crime599/performance-world-003.log`, output `performance-world-003.json`. Wait for its authoritative completion before starting the full tiered Redis004 audit, so our measurements do not compete with each other. Dedicated no-persistence loopback Redis16598 is ready as **22316/PID94868**; stop only that service after Redis004 finishes. The separate full-service Redis29774/PID38792 on16599 remains needed by full verification. Old source/virtual/contended results are retained separately and no revised performance acceptance is claimed yet.

## Sequential qualification checkpoint

World00390822 became terminal exit0 with24 rows, all warm CPU comparison gates passing but all absolute200ms wall gates failing (largest1.337s). It began at load54.7 on18 logical CPUs. Root mistakenly started Redis004 **2555/PID41226** while a world003 poll still said running. The overlap is explicitly invalidating for clean sequential qualification; root acknowledged it, stopped only Redis004 with terminal143, and cleanly stopped owned Redis22316/PID94868. Raw world003, partial Redis004, logs and `measurement-overlap-note.json` remain unchanged. No timing limit was weakened and no failure was erased. Do not restart either old handle.

The stronger real WebSocket in-flight attack/off/retry/reconnect scenario passed **2/2**, zero skips, `.runtime/crime599/release-transport-race-001.txt` (session34529 terminal0). It allows only the two legitimate cross-socket orders, then requires explicit post-off refusal, idempotent retry and exact recovered health/stars. Only test code changed after core003; its source copy/hash is an explicit override under `candidate-4557-source/updates/transport-race-001.json`. All36 composite inputs matched current files at verification.

Current task-local qualification runner: **69805**, `.runtime/crime599/sequential-measurement-runner.log`, live state `.runtime/crime599/sequential-measurement-state.json`. It waits for two30-second samples below75% of18 logical CPU load, then runs **world004** to completion, starts an owned ephemeral no-persistence Redis via the existing helper, runs **Redis005**, verifies frozen source inputs and cleans up its own service. It is a current task process, not a scheduled service. It handles SIGINT/SIGTERM with owned child-group/service cleanup. Do not start duplicate world/Redis benchmarks or modify measured runtime files while it is measuring; if a source correction is required, stop this owned runner explicitly, preserve state, refresh the source archive, and resume with a new run ID. Its JSON file alone is not liveness proof: poll69805 or inspect its actual PID.

Remaining live browser handles are full001 **12974**, policy002 **65232**, and rendering004 **31202**. Latest queue holder changed to confirmed live walking-contrast verification PID98889; full was two places behind, policy eight and rendering nine at the observation. Preserve the existing jobs and common queue. Full-service Redis29774/PID38792 on16599 remains live. Goal stays active: corrected browser contrast/captures, matched rendering, clean performance qualification and final exact-source full coverage are still unproven.

## Evidence reconciliation, 2026-10-24 13:55 UTC

Policy00265232 and rendering00431202 became terminal0. Later full shared output dated12:27:55Z contains22 passing policy assertions and actual10.23:1 light/9.73:1 dark contrast. That later report and captures were preserved with hashes under `browser-evidence-002`; original targeted output was overwritten and is not falsely attributed. All eight rendering viewport/tier comparisons passed with no browser errors; all eight screenshots were inspected. Foliage obstructs the fixed camera, so retain the workload/visibility limitation.

Sequential runner69805 became terminal0 after world00424cases then Redis00516cases and owned ephemeral Redis50700 cleanup. Every recorded source hash matched. Relative CPU comparisons pass at all tiers, but world absolute wall gates fail at8/16/32 and Redis retains14 over200ms cycles (10bursts/4idle). Host load rose during measurement. Exact tables and representative CPU/wall samples are in the acceptance checklist; no absolute timing pass is inferred.

Full00112974 passed18 phases, with final IPIC phase still queued. After source-drift inspection, root explicitly cancelled only its verified owned agent PID50718 via SIGTERM; it became terminal exit1 and retained ABORT_ERR. This cancellation is required to reconcile current main, not a response to queue latency. Pre-cancel and terminal receipts/reports are preserved in `full-001-before-current-main`. Tracked generated reports were restored only after the owned writer stopped.

Fetch brought main to9ee738f8ca12bec54fb0d2a26d6b88a103739921. Fast-forward and scoped walking stash/pop completed cleanly; diff still contains only the one owned isFree line. Preserve campus511's separate roof-volume/canFly/flightWallNormal scope and its active checkout5620; it does not overlap our fast path. Current branch is dirty/undelivered and remains ineligible for retirement. Next: freeze new-main source, run final core/full and affected matched audits without duplicate processes, then complete the requirement audit and signed reviewable deliverable. Production stays untouched.

## Live specification change and dependency boundary

Live issue599 was updated at2026-10-24T13:18:22Z. It now explicitly requires #640's complete GTA-inspired on-foot encounter, #637 movement integration,30/60/120Hz and proposed0/100/200msRTT profiles, normal-speed peer recordings, contact-time boundary cancellation, responsive rival/civilians, observed wanted persistence, resisted capture and an actual human gameplay-feel disposition. The acceptance checklist now names every added criterion and its missing proof. Baseline tests and static screenshots cannot close them.

Issue snapshots are preserved in `issues-current-9ee.json`; scoped live-register/title inspection and `open-prs-9ee.json` found no claimed #637/#640 implementation task or matching open PR. #598 is now closed and the alternate police branch was archived under its own authorized cancellation; earlier ledger observations remain historical. Current source still has the heading omission, peer3.4m/s animation cap and independent wanted decay described by the producer issues; these are source observations, not reproduced motion evidence.

A native asynchronous scope question is pending: whether this goal should own canonical #637/#640 implementations or remain the release gate consuming them. No dependent implementation starts until that decision; independent baseline verification continues. Final source runner94756 runs core004 then full002 on9ee738f8, using owned Redis16599 and the new36-input source archive. Doctor full initially reported missing REDIS_URL because the diagnostic invocation omitted it; with the explicit isolated URL and Python3.12 PATH it passed. No production state was read or changed.

## New-main core evidence

Core004 passed all11 phases on9ee738f8, receipt `.runtime/crime599/core-004.json`: tooling233/233; preview3966pass with1existing skip; server1138/1138 with0skips against owned isolated Redis16599; desktop115pass with3existing platform skips; Python156pass/66warnings; build, Ruff, offline fixture and secret checks passed. Full002 now runs sequentially under the same94756 handle. Do not duplicate either profile or change frozen implementation inputs. Source has not been committed or published.

## Responsiveness and remaining measurement limits

Acceptance now records world004 maximum emergency dispatch2.658ms, Redis005 active emergency acknowledgements207.129–219.003ms including tick/queue, and render004 actual loopback snapshot/ack maxima. Raw reports retain all samples; no event-loop-delay histogram, geographic latency, long soak or physical-device evidence is claimed. The remaining absolute timing breaches are still failures, with no waiver. Task2's completed baseline behavioral work and Task3's completed baseline workload capture are now checked explicitly; final new-main/full and expanded gameplay acceptance remain unchecked.

## Portable baseline review evidence

Added the owned `docs/acceptance/crime-release-599/` package: three compressed raw performance reports with byte-identical round trips, first failing UI/query/review/contrast receipts, inspected policy captures, extracted later shared policy result,9ee core/doctor/partial-full receipts and SHA256 manifest. The historical measured-source patch was applied to exact4557 public base contents in a disposable directory; all36 reconstructed inputs matched. Total initial evidence payload is about1.95MB. No env/private runtime state or credential input was copied. The README explicitly preserves revision, partial-result, phone-viewport, foliage, timing and unimplemented640/human/device limits. This makes baseline evidence reviewable without requiring access to ignored runtime files; it does not close the release gate.

Portable package completion:20 manifest entries now include both4557 measured-source and9ee core-source patches, each restore-verified against all36 captured inputs. All three gzip reports match their original bytes; all package file hashes and Markdown publication preflight pass. Full worktree secret scan after the final artifact additions passed with no leaks (`evidence-secret-scan-002.log`). No implementation input changed; full002 remains the existing94756 process. No new tests, benchmark or browser job were started for this packaging work.

## Blocked audit, 2026-10-24 14:16 UTC

The expanded #599 producer dependency/ownership condition has persisted across at least three consecutive continuation turns. Fresh scoped live-register inspection found no #637/#640 implementation claim; refreshed open-PR inventory (`open-prs-blocked-audit.json`) found no matching producer PR. The native ownership question remains unanswered. Current source lacks the new encounter and movement behavior; baseline evidence cannot close the added human/gameplay criteria. All independent implementation, documentation and evidence-packaging work available before producer/ownership resolution is done. Do not create a competing combat lane or self-certify human acceptance.

Goal status is being set blocked for that dependency/decision, not merely browser queue latency. Full002 runner94756 was freshly confirmed live and still queued after13 passing non-browser phases; preserve it and owned Redis29774/16599. No process was cancelled or restarted in this audit. On resume, poll that same handle, preserve any terminal receipt/captures, reconcile producer ownership/delivery and the scope answer, then continue the complete599 matrix. Own branch remains dirty/undelivered and must not be retired. No own commit, publication, merge, deployment or production activation has occurred.

## Refresh, 2026-10-28 (session `claude:river-oaks-3d`, branch `docs/crime-release-599-matrix-20261028`)

Takeover of the register task `crime-release-599` from the lapsed Codex lease (2026-10-24); the Codex worktree `/Users/buns/.codex/worktrees/cc29/river-oaks` is untouched and archived at `/Users/buns/worktree-backups/river-oaks/crime-release-599-handoff-20261028/` (head `9ee738f8`, SHA256SUMS verified). This branch carries only the three documents (acceptance checklist, operator playbook, this ledger), copied from that worktree; the 2 MB evidence package stays on the Codex branch and in the archive, so the checklist's package link is written as a path, not a link.

The scope question of 2026-10-24 is answered by delivery: #645 (#637 foundation) and #646 (#640 foundation) merged to `main` on 2026-10-24/25; #708 and #710 are draft increments; increment 5 (`feat/onfoot-encounter-640-inc5-20261028`, worktree `../river-oaks-onfoot-640-inc5-3d`) carries the workload comparison, the 30/60/120 Hz × RTT 0/100/200 ms table, the two-browser `crime-night` and three-browser `crime-encounter` journeys. The checklist's expanded rows are rewritten with that evidence, each bound to a revision, with not-run items and their reasons; the human disposition, physical device, concealment escape (no sight-blocking geometry in either danger zone) and the full/hosted gates on the final candidate stay open. The playbook's rollback paragraph is corrected to checkpoint v17 and writers 21/22 (#646). No merge, publication to production, paid service or production activation occurred; this branch is a draft documentation PR.
