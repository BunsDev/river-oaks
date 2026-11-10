# CI reliability diagnosis, November 9, 2026

## Objective and ownership

Execute the attached eight-hour goal: reproduce and correct the email-access Settings launcher failure; investigate Character Studio delayed-save/readiness only after the first correction is verified. Preserve all security assertions, timeouts, performance limits, first failures and the twenty consecutive first-attempt main Verify requirement.

Stable task: `ci-reliability-20261029`. Existing owner `claude-session-1a8107da` and clean checkout `/Users/buns/Documents/GitHub/BunsDev/river-oaks-ci-input-frames` at `19aedd7a668b6bad3ff433372a848243b3e7a2c8` remain preserved. This session `codex:01a1beea-beb5-7ae2-b66c-96660e6ff80d` has requested the prompt-required explicit handoff. Until it arrives, work is independent diagnosis only; no source, ownership transfer, commit, publication, merge, release or deletion is authorized by this checkpoint.

Main checkout `/Users/buns/Documents/GitHub/BunsDev/river-oaks`, branch `main`, head `fba811f7a48af94814a8ada65aabd0b9c8b95fc0`; fetched origin/main matches. Four pre-existing untracked retirement ledgers are peer-owned and untouched. Local retirement was evaluated: this goal expressly excludes cleanup and existing candidates/holds remain preserved.

Owned diagnostic files: this ledger and `.runtime/ci-reliability-20261109/`. Required checks: actual first-attempt API/jobs/log/artifact audit; focused reproduction under representative software rendering; failing behavioral regression before correction; focused/core/applicable full/browser/isolated-Redis checks after any source change. No changed behavior exists yet.

## CI audit checkpoint

The corrected latest thirty actual main Verify runs have 22 first-attempt successes and eight first-attempt failures. The current qualifying streak is 1/20 at run `42555489397`, head `fba811f7`. All thirty first-attempt job lists were inspected; no preview job exceeds twenty minutes. Latest `branch=main` API results also contained pull requests whose source branch is named main; these were excluded using event and source repository. The initial unfiltered audit is retained with an explicit nonqualifying filename, not used as acceptance.

First failures include three Settings launcher timeouts, one Character Studio delayed-save/readiness timeout, two campus-traversal failures and two older Ribbonwing landing failures. Later retry success is recorded separately and never counts as first-attempt success. Campus and historical Ribbonwing source repairs are outside this run's two-signature scope.

Authoritative receipts: `.runtime/ci-reliability-20261109/audit.json`, per-run `attempt-1.json`, `jobs-1.json`, raw failing-job logs, artifact metadata and source snapshots. Artifact inspection and complete signature classification are still pending; these results do not prove correction or twenty-run acceptance.

## Initial Settings evidence

Main runs `42480488194` and `42516208861` stop in Playwright's visible/enabled/stable actionability check. Run `42499115705` passes that check then stops while scrolling into view. Each retains the unchanged sixty-second click deadline and the same `hud-navigation.js:7` / `email-access.test.js:189` callsites. All three failure upload steps report no matching PNG. A shared root cause, frozen compositor, event-loop starvation, moving control or overlay is not established by these logs.

Next: inspect artifacts and actual browser launch capability, capture bounded actionability/animation/overlay/scroll/connection/event-loop state, then test one cause hypothesis. Preserve the owner handoff boundary and shared heavy-command queue.

## Explicit handoff and isolation checkpoint

The user explicitly answered “Yes, hand off the task; preserve prior edits.” The stable task owner is now this session, with prior ownership/branch/worktree recorded under `handoff20261109`. No prior source was adopted or removed. Native managed worktree operation `3fa0d1c8-f0bf-478e-aa99-a1de4c5e76bd` created `/Users/buns/.codex/worktrees/3f3f/river-oaks` from exact current main `fba811f7a48af94814a8ada65aabd0b9c8b95fc0`; branch `fix/ci-settings-reliability-20261109`. This ledger moved into that checkout. Original audit receipts remain at the primary checkout's `.runtime/ci-reliability-20261109/`; no private runtime or credentials were copied.

All eight independent failing jobs and aggregate failures were inspected. Five available failure archives match their GitHub API SHA256 digests, and their JSON reports and five PNGs were inspected. Three Settings failures have no diagnostic artifact. `artifact-inspection.json` records the missing data explicitly. A historical diagnostics implementation exists in an owner-retained archive; its previous success does not prove today's cause and its source has not been adopted.

Diagnosis sequence: establish local browser capability; run the unchanged real security journey with bounded external observation; compare page frame/timer progress, launcher geometry/ancestors/hit targets, animations, modal/connection state and actual click events; isolate a causal hypothesis under the same workload. Only after a reproduced cause will a minimal behavioral regression and correction be specified. If the host cannot execute that diagnostic, retain the exact first failure and report the prerequisite blocker rather than guessing.

## Browser and prerequisite checkpoint

The serialized capability probe completed successfully at 06:19:35 UTC: actual Chromium renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`, two animation frames in 31.2 ms and ordinary locator click passed. This proves local SwiftShader capability only. There is no installed Linux/Mesa/Xvfb execution environment identified on this macOS host.

`pnpm install --frozen-lockfile --offline` passed in the owned isolated checkout. Initial doctor exit2 correctly identified absent Python environment; its original receipt is preserved. `uv sync --locked --python 3.13 --offline`, `pnpm run --silent agent:doctor` and `pnpm run build` then passed. No lockfile, dependency approval, source assertions or product code changed.

Sole diagnostic worker exec29346 runs the unchanged `preview/e2e/email-access.test.js` using an external `--import` observer. The wrapper selects macOS headless SwiftShader and installs bounded launcher/timer/frame/long-task/hit-target/ancestor/modal/connection observation; test assertions and deadlines are unchanged. Original root runtime contains the audit; owned worktree `.runtime/ci-reliability/` contains setup and actual journey receipts. Do not change source under the running worker or treat this as Linux/Mesa qualification.

## Reproduced Settings failure, 06:22:53 UTC

The unchanged real email-access journey failed at its original sixty-second Settings locator click. Its call log reached visible/enabled/stable, scroll-into-view, and done scrolling before expiration; the stalled stage varies from the hosted logs, so a shared underlying cause remains a hypothesis. It is a click deadline failure, not an assertion relaxation or fabricated timeout. Test result: 0 pass, 1 fail, 0 skipped; original artifact/log/observer data retained with `first-` prefixes. The source fence matched the original fba source. No product code changed.

Observed at the stalled control: fixed x705.03125/y20/w82.96875/h40 rectangle, visible/enabled/no animations, ordinary pointer events, Settings first in hit testing, visible page, appInert false, gate hidden, joined/playerReady true and one town socket with zero closures. No Settings pointerdown/click event was emitted. A 25.917-second long task preceded admission; later long tasks were 12.040, 13.271, 7.595 and 23.219 seconds. Actual GPU child28584 was at101.9% CPU when inspected; that observation alone does not identify a source function or prove historical Linux/Mesa causality.

Next controlled diagnostic: capture slow actual WebGL calls and main-thread profiler samples during the same unmodified journey; test one rendering-workload hypothesis without force clicks, DOM event dispatch, longer deadlines, disabled security, extra sleeps or product changes.

## Attributed hypothesis and bounded correction plan

The quarter-device-pixel-ratio diagnostic also failed the unchanged sixty-second Settings click, stopping in visible/enabled/stable. This rejects a simple main-canvas fill-resolution explanation. All-GL timing plus an actual CDP CPU profile on the original pixel density reproduce the click failure again. CPU samples attribute77.159 seconds to synchronous `getProgramInfoLog`:38.701 seconds under the storefront reflection `update` and37.827 seconds under the main composer render, plus5.272 seconds in resident portrait readback. Built-code caller identity was checked directly against actual emitted functions; native process stacks were retained but are stripped and insufficient for precise attribution. The reflection path alone consumes much of the interaction deadline on the UI thread. Historical Linux/Mesa causal equivalence remains unproven.

Architecture: prepare the existing reflection capture's shaders with the pinned renderer's `compileAsync` before drawing its first face, restoring renderer state immediately while compilation is pending. Keep existing256px/two-target/one-face-per-frame/shadow/visibility/PMREM/complete-publication contracts. Fence compilation callbacks across graphics release/reset/disposal. Do not change assertions, timeouts, render resolution, materials or security. The existing main compile remains outside this narrow first correction unless evidence requires further work.

- [x] Add a failing behavioral regression in `preview/tests/reflections.test.js`: a deferred real renderer interface must not render a face while shaders are pending; it restores target/face/mip/XR/shadows/visibility immediately, resumes existing six-face publication after readiness, and fences rejection/stale completion after graphics reset/disposal.
- [x] Run the focused regression against original source and preserve the expected failure.
- [x] Implement only `preview/src/reflections.js` shader preparation and lifecycle fencing, then run all reflection regressions.
- [x] Rebuild and rerun the original real email-access journey under the same default SwiftShader observer, without the lower-resolution intervention. Inspect actual click delivery and test result; reject the correction if the original failure remains.
- [x] If verified, run core and applicable full/browser/isolated-Redis verification with the shared queue. Preserve any new first failures. Only then consider the second signature if time remains.

This is an inline execution plan for the already authorized scoped fix. No publication, merge, deployment or cleanup authority has been added.

## First candidate unit checkpoint

Three new behavioral regressions failed against original source because the real probe immediately drew a face while its shader device boundary was cold. After the22-line reflection shader-preparation/lifecycle patch, all11 reflection tests pass with zero skips. `git diff --check` passes. Existing eight regressions retain shadow initialization, disabled/hidden lights, one-face work limit, six-face atomic publication, invalidation, saved renderer/visibility state, transmission exclusions and graphics reset contracts. New tests cover deferred readiness, single pending preparation, state restoration while pending, reset/release/disposal fencing and rejection retaining the prior map.

Sole candidate worker exec48205 now rebuilds and runs the original email-access test with the original observer/default pixel density. Source hashes are frozen in `.runtime/ci-reliability/reflection-candidate-context.json`. No broader verification or correction claim is made before terminal runtime evidence. The original first failure, low-pixel failure and profiler-attribution failure remain retained separately.

## Review and revised candidate checkpoint

Independent read-only review identified the pinned Three helper's mutable `material.currentProgram` readiness race and its `scene.traverse` inclusion of hidden/excluded objects. Two added regressions failed against the first candidate. The revised source compiles a detached capture-visible batch using the actual scene for lighting, snapshots all program variants in the pinned renderer's per-material program map, and gates capture on their exact readiness. It creates no material clones and preserves authored callbacks, geometry and parent ownership. Additional invalidation and synchronous-throw coverage passes. Focused result:15/15, zero skips. One intermediate focused failure (capture material collection depended on fake compiler traversal) is preserved; collection now occurs independently before compilation.

The first candidate delivered a real Settings pointerdown/click at page70.794/70.799 seconds but its overall original macOS test was cancelled at the unchanged120-second limit later in the journey. This remains a non-pass and is not claimed as a verified correction.

The revised actual PCF WebGL regression passed across initial startup and scene reload with no GL errors and complete captures. It now drives real animation frames while asynchronous preparation is pending within a bounded5-second small-fixture window; all original shadow/capture/publication assertions remain. The original, unchanged Metal email-access journey passed in16.53 seconds on the revised source. The separately labelled SwiftShader diagnostic copy uses the source harness's existing software-mode240-second overall/150-second join/60-second click deadlines. Only its module paths/platform guard/render-launch selection differ for the macOS diagnostic; all original assert lines are retained. This does not qualify Linux/Mesa or change the shipped test source. Revised worker exec20392 remains live; source hashes frozen.

## Reproduced correction and final lifecycle review

Revised SwiftShader diagnostic passed the full real admission, Settings, invitations and revocation journey in130.34 seconds using the original CI software deadlines. The Settings click reached the actual control at page62.720 seconds, within the unchanged sixty-second click budget after admission/connection. Both earlier failed source runs and candidate-v1 overall timeout remain preserved. Original Metal journey and actual reflection WebGL passed on that revision. This is local software diagnostic evidence, not proof of historical Linux/Mesa root cause or hosted reliability acceptance.

Re-review found a streamed-material disposal race: pinned Three deletes the underlying program while a retained cold variant can still be polled. Two further regressions failed on the candidate: stalled restart and escaped device readiness exception. Source now restarts shader preparation and discards the partial cube when any retained program was destroyed, and keeps readiness exceptions inside the reflection failure boundary. All17 focused tests pass. Real source remains Three's pinned program lifecycle; no new shader/material/resource registry was introduced.

A final candidate browser worker now reruns reflection unit/build, real PCF WebGL, original Metal journey and the labelled existing-CI-budget SwiftShader diagnostic on the exact final source. Previous revised receipts/events are retained under distinct names. Full/core verification will follow that worker's successful terminal receipt; no source edits while it runs.

## Final source focused/rendered qualification

Final candidate worker exec64015 completed successfully with its source fence matched. Final source:17/17 reflection unit tests; build; actual PCF WebGL startup/reload with complete captures/no GL errors; unchanged original Metal email-access journey; and the labelled macOS SwiftShader CI-budget diagnostic full journey all passed. Final SwiftShader duration142.588 seconds, with actual Settings pointerdown/click at page67.135/67.138 seconds, within the original sixty-second click deadline after connection. The software diagnostic retains240s overall and150s join, exactly the shipped software-mode budgets; no shipped test assertions or timeouts changed. Linux/Mesa, hosted CI and the20-main-run acceptance remain unproven. Final independent source review found no further concrete blockers.

Core and full qualification are now queued/running as one owned serialized worker, with disposable loopback Redis, per-command logs/receipts, explicit source hashes and guaranteed owned Redis shutdown. Preserve this worker and its handle until terminal; do not change source/HEAD while it runs. Generated report changes will be retained with hashes and reviewed before restoring only this checkout's known generated tracked reports. No commit, push, PR, merge, publication, deployment or cleanup was performed.

## Canonical core terminal and full continuation

`pnpm run verify` passed all11 stages at06:53:16 UTC on exact frozen dirty fba candidate: tooling, preview, server, desktop, build, Python lint/format/tests, demo/verification and secret guard. First initial doctor failure remains retained, as do all diagnostic first failures. `pnpm run verify full` is running under the same wrapper exec83464 / PID84518, child Python84531; owned Redis remains live and will be stopped by that same worker after terminal. Full dependency audit already passed. No source changes or duplicate worker were started.

Main advanced independently to455b4194ba67a2de7d81d2fd65fee7bc6f458ee9. REST comparison against fba shows two commits adding only `docs/superpowers/plans/2026-11-09-material-consumer-baseline-739.md`; application source is unchanged. The running candidate/receipts remain pinned to fba and are not relabelled as455b qualification. Refresh the actual main reliability window at handoff.

## Full qualification browser checkpoint

The same full worker exec83464 / wrapper84518 / Python84531 remains live. Full has passed dependency audit,313 tooling checks,5,264 preview passes (one skip/thirty TODO),1,459 Redis server tests with zero skips,134 desktop passes/five skips, build, Python lint/format/215 tests, demo/verification, secret/worktree/history guards, both security browser tests and real reflection WebGL. All16 general world journeys passed, including spatial streets, Computer embed and campus traversal/suite; the separate Commons journey is now running. These remain component results until the overall full terminal receipt.

The preview TODO output includes explicit contrast-bound assertion deficits; they are not thirty passing checks and do not establish human accessibility. No unrelated contrast work was introduced. All first failures remain retained.

A read-only candidate patch is retained at `.runtime/ci-reliability/settings-local-candidate.patch`, SHA256 `643258941335e94822c0fddb33a0167481a6d52b5d1eddb9f989882d7bfb7775`. It includes only the three changed source/test files, not generated reports or this untracked ledger. The final full source fence still matches. No publication or branch/head movement occurred.

## Verified wait: Commons terminal, Five Rooms live

The previous goal turn made implementation/verification progress; this continuation is a verified wait on the same live full worker, not a new run. All16 general journeys and the separate East Garden Commons journey have passed. Full is now in `experience-five-rooms`, already reporting no page errors and a Pink spawn frame1395draws against the unchanged1874pin. These intermediate observations do not replace that stage's terminal result. Shared-town and screening still remain after Five Rooms. Wrapper84518/Python84531 and exec83464 remain live, source unchanged, owned Redis still belongs to the same worker. Continue polling that handle and inspect the final full receipt before any completion claim or source change.

## Settings candidate qualified; second-signature ownership boundary

The original core/full worker exec83464 exited after full passed all20 stages at07:41:08 UTC. The exact final source fence matched. Canonical core11/11 and full20/20 pass; general16, Commons, Five Rooms, all shared journeys and19screening checks passed. Owned Redis84533 stopped with exit0 at07:41:08 UTC. Actual reports were retained byte-for-byte with SHA256 entries under `.runtime/ci-reliability/full/retained-reports/`; only the two known generated tracked reports were restored from HEAD after retention. Working status now contains only the three intended source/test edits and this ledger. `git diff --check` passed. The precise qualified source and evidence index is `.runtime/ci-reliability/settings-qualified.json`. No commit/publication/merge/deployment occurred.

A fresh latest30 main audit now proves2/20 consecutive first-attempt main passes at455b4194 / Verify42574157824; all27newest attempt1jobs and recorded preview budgets pass. The latest30 remain22first-attempt successes/eightfailures. This is normal main activity, not candidate qualification, and no run was dispatched or retried. Old failure artifacts/logs remain retained at the original primary runtime.

There is time remaining for the second signature, but the live register explicitly claims `preview/e2e/character-studio-shared.js` under Five Places and a Studio UI wildcard. Both owners' checked-out copies have no uncommitted diff to that exact file; this does not release ownership. A user question requests only delayed-save/readiness journey logic handoff, preserving their product source and other work. Until answered, perform read-only diagnosis only; do not adopt their source or infer transfer from an expired lease. The original shared journey passed in the canonical local full run, which is not proof that its hosted deadline failure is fixed.

## Final bounded-goal audit and handoff

The user-defined finish line, one reproduced failure with a verified correction left as a reviewable local candidate when publication is not authorized, is met. Requirement-by-requirement evidence is indexed in `.runtime/ci-reliability/completion-audit.json`. This does not complete the broader CI reliability task or close #798: actual main remains2/20, and no candidate hosted/Linux/Mesa, deployment, physical-device or human acceptance is claimed.

The secondary read-only SwiftShader diagnostic passed the unchanged Character Studio shared journey:81 checks in145.592 seconds. Its original pending-on-reopen assertions observed the save held9.654 seconds and the read held9.149 seconds, both within the original15-second request deadline. The historical hosted15.364-second/net::ERR_ABORTED case remains retained and unresolved. No new matching deadline failure was reproduced; no speculative Studio correction or owner source adoption was made. Observer signal-abort events after an already completed response are not request failures; the later short TypeError in this journey belongs to its deliberate lost-acknowledgement fault and successful retry coverage. The narrow source-handoff question remains pending.

Final source: `fba811f7a48af94814a8ada65aabd0b9c8b95fc0` plus uncommitted edits to `preview/src/reflections.js`, `preview/tests/reflections.test.js` and `preview/e2e/reflections-webgl.js`, with this untracked ledger. Patch SHA256 `643258941335e94822c0fddb33a0167481a6d52b5d1eddb9f989882d7bfb7775`; final source hashes still match qualified receipts. Prior owner checkout was reverified clean at19aedd7a668b6bad3ff433372a848243b3e7a2c8. Known generated tracked reports were restored only after hash-verified retention. No source/ref/archive cleanup occurred.

Verification:17 reflection regressions; actual PCF WebGL startup/reload; original Metal email-access journey; existing-CI-budget SwiftShader email-access diagnostic; canonical `pnpm run verify`11/11 and `pnpm run verify full`20/20. Full includes33 shared journeys and19screening checks, and owned Redis exited0. Preview retains one skip and30TODO contrast gaps; desktop retains five skips; Python reports66warnings. First diagnostic Settings failures, the rejected low-pixel hypothesis, initial prerequisite failure and candidate-v1 overall timeout remain preserved. Green local gates do not prove twenty-main-run acceptance.

Delivery state: uncommitted and unpublished, no currentPR, no commit/push/merge/deployment/issue closure. The broader stable CI task remains blocked on authorized delivery and subsequent main-run qualification; secondary file ownership remains with its existing owners until an explicit handoff. Next action: review the retained local candidate, then obtain explicit delivery authorization before publishing it for hosted qualification. Resume secondary correction only after its file-owner handoff and a reproduced cause.

## Authorized hosted delivery continuation, November 10

The new user prompt explicitly authorizes signed commits, candidate push/PR/ready and guarded merge after required gates. No deployment, release, unrelated cleanup or Character Studio takeover is authorized. Reused the exact owned branch/worktree and preserved all first failures. Fresh fetch shows main455b4194ba67a2de7d81d2fd65fee7bc6f458ee9 differs from qualifiedfba only by another task's documentation ledger; a fast-forward brought this candidate to455b without changing any of the five qualified source hashes. Original local17/core11/full20 and actual renderer results retain their fba revision and dirty-source identity. New exact-head hosted qualification remains required.

Independent delivery review is running read-only. Required precommit checks: prior canonical source-matched gates plus fresh focused regression, diff/paragraph/secret preflight and signed commit verification. No unchanged full rerun is justified by the documentation-only main advance. A draft PR will retain the historical first failures and local limitations; observe actual Linux/Mesa security/reflection jobs and all required checks before a sole protected lander. Preserve the global20-main gate and refresh its actual thirty-run window after delivery.
