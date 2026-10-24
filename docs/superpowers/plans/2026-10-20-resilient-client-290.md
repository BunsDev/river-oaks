# #290 web recovery, slice 1

## Objective
Implement R1–R4 graphics recovery in place and R5 background input safety, deliver separate draft PRs against main with R6 evidence. No merge, deploy, native work, network-transition or touch-hold expansion.
Authoritative prompt: `/Users/buns/.codex/attachments/d6b8a0a5-bf89-4acc-954d-71b93531a5b9/pasted-text-1.txt` (read in full).

## Ownership
- Session: codex:resilient-client-290 (01a15b5e-d941-7862-9948-f5ecdd3bf041).
- Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-resilient-client-290`.
- Branch: `feat/resilient-client-290-20261020`; base `bd0516fb8117fc04f75e33344ec2efde42810c3b`.
- Files owned: graphics recovery/lifecycle/UI/resources/handoff helpers and tests/J1; main render wiring; render lifecycle/quality/pipeline; environment, reflections, portraits and office skyline; photo retention guard; debug records; testing/graphics docs and this ledger. Exact paths are in the live register.
- T6 runs independently in owned sibling river-oaks-background-input-290 as explicitly authorized by the prompt.

## Baseline
- Primary checkout clean at preflight; four existing worktrees preserved.
- `git fetch origin`: main advanced from 65896c72 to bd0516fb; #567 merged. #309 is now merged (read-only reference).
- Issues #284/#288/#290 refreshed through GitHub; #288/#290 have zero comments.
- `pnpm run --silent project:check --github`: exit 1, 57 existing register/checkout reconciliation gaps. None claims this slice. Full output `/tmp/river-oaks-290-project-check.json`.
- Live agent list contains this root only. Relevant recent rollouts show planning/model capacity failure and unrelated flight work; no existing implementation checkout.
- Open PRs refreshed via REST (GraphQL rate limited). #545 adds character quality publication in render-quality.js; independent of persistence/recovery behavior and can coexist. Do not edit that branch.
- Host load 3.28/3.54/4.72. Listening ports inspected; no processes stopped.

## Tasks
- [x] T0 setup, baseline core verify, baseline context-loss journey.
- [x] T1 pure recovery machine and fake-clock regressions.
- [x] T2 GPU rebuild audit with source/runtime evidence for all seven rows.
- [x] T3 composed pause, rebuild/fencing, accessible status/retry, diagnostics.
- [x] T4 persisted quality step-down and compatibility tests.
- [x] T5 J1 normal restore, loop, timeout, five-cycle resource/listener bounds.
- [x] T6 independent background-input branch, audit, unit/J2/shared verification.
- [x] T7 docs.
- [x] T8 per-PR tests/core/journeys/review/commit/push/draft/evidence comment/register.

## Interface decisions
- T1→T3: `restored()` cannot resume GPU work before T2 rebuild completes. Keep a separate lifecycle pause reason during rebuild and fence it with the loss generation.
- T1→T4: one quality step per failure/retry cycle; a retry must not double-step an already degraded failure.
- Ruling: follow the supplied task ledger and endpoint rather than the skill's separate scratch ledger/commit-per-task scaffolding. This keeps the user-required ledger/register as the sole progress record; tests still precede implementation and a fresh whole-branch review remains required.

## Commands and results
- Worktree creation: passed, base bd0516fb.
- Register claim: passed, task `resilient-client-290-20261020`, two-hour lease.
- Dependency install and agent:doctor: passed; isolated Python environment initialized by uv.

## Decisions for Val
- Signing: `gpg.format` is unset. The one required question was asked at23:37Z after B verified commit60078e7a: configure signing, or push unsigned? Val answered Push unsigned at23:39Z; unsigned task pushes are authorized; both branches have been pushed unsigned. No pending decision.

## Gaps and limits
R1–R5 implementation and required local verification are complete across the two independent branches. Final J1 proves retained-photo downloads and guard exit after the Photo layout fix. R6 is complete for the requested draft endpoint: A draft572 and B draft569 are open with one #290 evidence comment each. B has all19 hosted checks passed; A hosted checks are pending. Not verified: physical GPU/Safari/iOS, VoiceOver, actual bfcache eligibility, Redis/full profile, live auth/voice, native or production acceptance. Skipped core cases are not evidence.

## Next action
Await review of draft572 (graphics) and draft569 (background input); inspect A hosted checks as they complete. No merge/deploy is authorized. Preserve both worktrees and local reports. Tasks stay active for review, not delivered/retired. Current remote heads and check state are maintained in the live register/PRs; dated ledger entries describe their recorded revisions.

## GPU rebuild audit (T2, source and browser evidence)
| Resource | Current evidence | Required action / owner |
| --- | --- | --- |
| Pipeline AO/bloom/MSAA targets and passes | three WebGLRenderer.js `onContextRestore`→`initGLContext` resets properties; `setRenderTarget` lazy-allocates missing framebuffer. Passes redraw every frame. | No content rebuild; release obsolete allocations/listeners at loss (pipeline and scene resource owners), preserving CPU descriptors. J1 initially reproduced growth; five-cycle bounds pass after cleanup, including omitted GTAO/bloom materials. |
| PMREM/environment | materials.js `loadEnvironment` renders HDR once to a target; Three cannot infer source of that target after loss. HDR holds CPU data. | Regenerate PMREM from retained HDR, no repeat download; materials.js. Fence loading callback by loss generation. |
| Shadows | WebGLShadowMap renders auto-updated shadows each frame and target allocation is lazy. | No manual content rebuild. First main view must precede a reflection capture. |
| Resident portraits | resident-portraits.js stores completed CPU data URLs. Its reusable target is repainted on each capture. RAF drain can run while lost. | Preserve completed caches; pause/fence queued captures, resume after graphics readiness. |
| Storefront reflections | reflections.js skips capture while version/position unchanged; PMREM output holds no CPU pixels; partial faces cannot survive loss. | Reset capture state, detach invalid maps, invalidate and recapture all six faces. |
| KTX2/Basis and DRACO | gltf-image-decoder.js uses GLTFLoader and optional TextureLoader; source audit found no KTX2/Basis/DRACO setup in preview/server/scripts JS. Decoded CPU buffers/images remain available. | No decoder rebuild; Three uploads the retained CPU resources. |
| Adaptive measurements | render-quality.js governor keeps old samples/FPS; current resetTime only resets main clock/lastFrame. | Reset sample window and frame timing at recovery while retaining selected quality. |

## T0 checkpoint (in progress)
Dependencies installed successfully. Doctor reports missing local Python environment; baseline core is running its JavaScript phases and may initialize Python via uv. No browser run overlaps it. J1 case a added; still to run against unchanged production code. Uncommitted: this ledger and `preview/e2e/graphics-recovery.js`. Next: collect baseline result, initialize Python if needed, then J1 baseline.

## Preliminary T1/T4/T3 unit work
While baseline verification ran, added independent modules/tests without wiring browser recovery:
- T1 fake-clock tests: initial missing-module failure recorded; implementation passes 9/9. Defaults: 15 seconds from loss to restore, three distinct losses in 120 seconds. The phone's 22.58-second startup failure motivates spanning several startup-length relapses; it is not evidence of a normal restore latency. These are conservative bounded policy choices, subject to device acceptance.
- T4 persistence: old raw mode strings still load; new JSON `{mode,recoveryTier}` retains explicit preference and effective recovery override. Sharpest→Auto→Smoothest; lowest stays Smoothest; manual selection clears override. Four new tests failed before implementation; combined T1/T4 passes 26/26.
- T3 composition: callable disposer gains `setPaused(reason,boolean)`; visibility and graphics/rebuild pauses compose. Existing tests unchanged, new composition test failed then passed; 3/3.
- T2 decoder result finalized: gltf-image-decoder.js uses GLTFLoader plus optional HTML TextureLoader, no KTX2/Basis/DRACO setup anywhere under preview/server/scripts JS. CPU decoded GLTF buffers/images survive and Three reuploads them. No decoder rebuild.
- Full `pnpm test` for new work still pending (baseline suite was started before these files existed).

## T0 complete checkpoint
Baseline `PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH nice -n 19 pnpm run verify`: passed all 11 phases. Console counts: tooling 160 pass / 3 skipped; preview 3699 / 1; server 732 / 212; desktop 115 / 3; Python 145 passed (66 existing warnings). Redis and platform skips are not proof. uv initialized the isolated Python environment; doctor now passes. Receipt `.runtime/agent/core.json`, console `/tmp/river-oaks-290-baseline.log`.
J1 baseline `RIVER_OAKS_E2E_REPORT=graphics-recovery-baseline.json pnpm run test:experience graphics-recovery`: expected red, real game canvas loss captured `fatal:true`, `Preview unavailable`, `playerReady:true`; native restore event completed but fatal recovery assertion failed. Report is ignored local evidence, not committed. Host load 30.65/15.89/9.95, below overload guidance; runner waited for existing browser lock and ran alone. The baseline case asserted the fatal defect; actual frame-stop assertion remains part of final J1.

## T3 interface ruling
Ruling: acknowledge `recovery.restored()` only after GPU rebuild completes, rather than before. This keeps the existing timeout armed across asynchronous HDR startup/rebuild and fences late completions. Cost: the state remains `lost` during rebuild, with the same truthful restoring status. A focused binding test proves the ordering, a second loss/timeout/dispose fences promises, and frame wrappers fence old callbacks (4/4).
Additive `failed(reason)` method reports a rebuild exception immediately instead of waiting for the deadline; contract methods remain intact (10 machine tests pass).
Reflection recapture reset passes a regression for partial cube faces; environment PMREM regeneration from retained HDR passes its resource-release test. Portrait queue pause/resume fences queued RAF callbacks and preserves waiting jobs (focused test passed).

## T3/T4/T7 checkpoint (implementation in progress)
HEAD remains bd0516fb; no commits/pushes yet. Graphics binding/UI now wired; real native restore rebuilds PMREM from retained HDR, resets reflection capture and resumes portrait requests. Async HDR build permission and every frame/rebuild callback are fenced by context generation. Retry retains the extension obtained before loss; getExtension may be unavailable on a lost context. Retry from a live context uses one deliberate loss/restore cycle, without adding event listeners per click.
A one-use sessionStorage handoff for fallback reload retains Settings tab, unsent town-chat draft and photo framing; only the user retry invokes reload. It never stores/replays identity, authoritative position or consequential actions; session/pose come from the existing authorized reconnect. If tab storage refuses, no reload is performed. This fallback still needs browser proof, including actual authoritative position continuity.
54 focused tests passed (machine, binding, reload handoff, render visibility, quality, environment, reflections, portraits, debug cycles). Docs updated with local-only J1 scope and cycle data. Full post-change suite/core and browser success remain outstanding.

### Live browser handle
`RIVER_OAKS_E2E_REPORT=graphics-recovery-first.json pnpm run test:experience graphics-recovery` started; exec session **47431**, log `/tmp/river-oaks-290-j1-first.log`. It is still queued behind a confirmed live peer process **38240** running the repository's multi-journey suite (started 2026-10-20T22:22:01Z). Do not restart or bypass its lock. Poll this same handle or log. No own core gate is running concurrently.

### Independent T6 work
Created/claimed second worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-background-input-290`, branch `feat/background-input-290-20261020`, own ledger there. Source audit and 60 focused tests cover shared background release, office holds and late microphone grants. J2 authored but not run; snapshot resume/other held owners still need browser/full gate evidence.

### Remaining before PR A
- Execute J1: normal restore, loop/retry persistence, timeout, five cycles; verify actual GPU resources/listener bounds (source audit suggests disposal-listener accumulation needs measurement).
- Prove fallback reload and visible avatar with actual render evidence; preserve open UI and focus.
- Full pnpm test and core; affected hud-and-quality/contextual-first-visit journeys.
- Fresh whole-branch review, address material findings, commit after owner recheck.
- Signing is unset; ask the one permitted signing question only once verified commits are ready to push. Complete T6 locally while waiting if needed.
- Push/draft PR, update register, one evidence comment on #290. No merge/deploy.

Uncommitted files are all owned source/tests/docs plus local generated `data/reports/graphics-recovery-baseline.json` (do not stage reports). Next action: poll existing browser handle and diagnose its first actual result.

## J1 first result and diagnosis checkpoint
The first full J1 (session 47431, now terminal) passed in-place restore, preserved modal/session/pose, walking, crash-loop retry/focus/persistence, and timeout. It failed the five-cycle GPU listener bound: 2079, 2690, 3242, 3915, 4526 listeners on the same 2167 scene resources. DOM listeners stayed 66. Memory ranged 356–410 geometries / 115–126 textures; some first-run observations preceded a fully repainted frame. Report `data/reports/graphics-recovery-first.json`, console `/tmp/river-oaks-290-j1-first.log` (local evidence, do not stage reports).
Required isolated repeat is queued: exec **98365**, command `RIVER_OAKS_E2E_REPORT=graphics-recovery-repeat.json pnpm run test:experience graphics-recovery`, log `/tmp/river-oaks-290-j1-repeat.log`. Current peer owner PID36542 is confirmed live. Do not bypass lock or start an owned core/journey concurrently.
Source trace: Three onContextRestore calls initGLContext and replaces GPU caches; old WebGLGeometries/WebGLTextures/WebGLObjects dispose listeners remain attached to retained CPU resources. A new, currently **unwired** scene cleanup helper passes 2 tests preserving shared geometry/image/instance/morph/bone data, shader textures, shadows and deferred canvas-paint intent. Await the isolated repeat before wiring the hypothesis. Private pipeline/probe/portrait targets also need audited cleanup.
A recovery UI regression confirms closing a modal while lost leaves the notice hidden inside it; test is red and fix pending until the repeat ends. Additional discovered GPU owner: the office snapshot skyline is generated once, so it needs invalidation on loss (live skyline redraws). This is required by R2, not an unrelated office feature.
B branch additionally reproduced stale repeated keydown restarting PTT after background release; controls now require a fresh press and the 60 focused tests pass. J2 includes repeated keydown on return.
HEAD unchanged, no commits or pushes. Next: collect repeat J1, wire supported GPU release, fix modal relocation, then verify browser bounds and fallback reload.

## GPU cleanup verified checkpoint
Isolated repeat `graphics-recovery-repeat.json` reproduced listener growth (2175→4619), fixed DOM count66, memory503/136 except one partial frame410/126. Repeat session98365 is terminal (exit1); load7.63/10.53/11.82. Diagnosis confirmed: Three resets GPU caches but leaves resource disposal listeners attached.
Wired `releaseSceneGraphics` on loss plus pipeline/pass, retained HDR/environment, reflection and portrait GPU release. CPU arrays/images/morphs and cached portrait data remain. `RIVER_OAKS_E2E_REPORT=graphics-recovery-cleanup.json pnpm run test:experience graphics-recovery` **passed** (session29411 terminal exit0): listeners1025/1025/879/1025/1025, DOM66 throughout, memory503/136 except410/126 partial capture. All a–d assertions passed, 0 uncaught errors. The original bounds were unchanged. Screenshot from the earlier failed run was inspected: avatar and town visibly rendered after five cycles.
Follow-up within R2: cached office skyline invalidates/releases on loss and recaptures after a restored main frame; storefront probe likewise waits for that main frame so shadows are populated. Focused office/reflection suite65/65 passed, zero skips. Pipeline/resource suite25/25 passed.
Recovery notice now follows modal opening/closing via one observer active only during recovery; UI tests2/2. Quality recovery retains an already reduced Auto scale (e.g.60% does not rise to75% on Smoothest); storage adds `recoveryScale`, manual choice clears it; quality/UI tests20/20 passed. Ruling: preserve the lower existing scale within the selected recovery tier to avoid increasing GPU load; cost is a lower resolution until manual selection.
Added fallback browser cases using real context loss while the app sees an unavailable extension: explicit retry reload, same identity/pose, Settings/chat draft, photo framing after admitted-player readiness. These new cases and changed capture sequencing **not yet run**. No browser active now. B full pnpm test passed3705/3706 with1existing skip (174.24s); B core running exec9836. Do not start owned journeys until it ends.
HEAD still bd0516fb, no commits/pushes. Next: finish B core then J2/shared development; run expanded J1 and final A gates. New A ownership includes graphics-resources, pipeline, office skyline/world-scene/UI and associated tests.

### Main refresh
Fetched origin and fast-forwarded this branch to a35214f38795ced1ee6867aad5c3c2723a7ceaae (#566 archive tooling). No overlapping product files; workflow delta read. No feature commit exists yet. B remains at bd0516fb until its active core gate ends; then fast-forward and verify affected tooling before publishing. Final A gate will include current main.

## Office recapture and fresh review checkpoint (2026-10-20T23:18Z)
Office skyline regression reproduced recapturing while the district remained hidden inside the office. Recovery now temporarily restores district visibility for recapture after a main frame, then reinstates office presentation. `node --test preview/tests/office-skyline.test.js preview/tests/office-ui.test.js preview/tests/reflections.test.js`: 66 passed, 0 skipped, `/tmp/river-oaks-290-office-recapture-green.log`.
Fresh whole-branch read-only review is running. Expanded J1 plus hud-and-quality/contextual-first-visit queued exec12944, report graphics-recovery-local.json, console `/tmp/river-oaks-290-graphics-final-journeys.log`. Review has identified retry generation and fallback shared-link/photo state seams; complete review awaited before one fix pass. All changes uncommitted at a35214f3; baseline core is not final verification.

## Fresh graphics review and one fix pass (2026-10-20T23:19Z)
One read-only whole-branch review found three Important issues, no Critical/Minor. Retry now increments its generation synchronously before entering an accepting state; the timeout→retry→old completion regression failed before and passes after. A validated one-use graphics handoff suppresses startup shared-link travel, preserving the authoritative reconnect pose after walking away from the URL destination. The fallback journey now covers that destination.
Photo handoff was deliberately removed: scalar controls could not retain the base camera or captured File. If Photo mode is open or retains a photo, fallback refuses navigation, keeps the original camera/image, and explains saving/discarding/closing before retry. Other open modal sheets are also guarded; Settings and town-chat draft remain supported in the tab-local handoff. This supersedes earlier ledger claims about serializing photo framing. Ordinary in-place recovery retains all UI without this restriction. Storage refusal also leaves the page and draft intact.
The expanded journey verifies retained camera transform, image URL and successful photo download after refused fallback. All 132 combined focused tests pass, 0 skipped; `/tmp/river-oaks-290-graphics-review-all-focused.log`. Review declined-to-judge items ruled: R5 belongs to B; native/physical/Safari/VoiceOver and network transitions remain explicit non-goals. No second review.
Fetched origin at23:18Z: main still a35214f3; no new delta. All work uncommitted; final journeys and full gates pending. Signing unset; required question unasked until verified commits are ready before first push.

## Final journey checkpoint (2026-10-20T23:26Z)
Combined journey exec12944 ended exit1: graphics cases a–d passed, but new shared-link fallback exact-pose assertion failed. Five-cycle memory geometries[492,491,410,492,492], textures[134,134,126,134,134]; resource listeners[2023,2020,1684,2023,2023]; DOM listeners66 throughout. Original bounds unchanged. HUD/quality and contextual first visit both passed.
Host load38.58 (<100). Following run rule, isolated graphics repeat queued exec36657 with before/after pose diagnostics, report graphics-recovery-fallback-repeat.json and console `/tmp/river-oaks-290-graphics-fallback-repeat.log`. Do not diagnose/fix from a single failure. Final preview/core was already queued (exec42039) and remains serialized. Prior baseline core does not establish final correctness.

B local commit60078e7ad45fa276b4ab68a6ee2d1d144b14eb13 passed final gates/journeys. The single signing question was asked23:37Z and is pending. A final preview/core exec42039 is now running; isolated J1 fallback repeat exec36657 remains queued.

Signing question answered once: Push unsigned. Authorization applies to both task branches; do not ask again. A source remains uncommitted pending verification/fallback resolution.

## Provenance gate correction (2026-10-20T23:40Z)
Full `pnpm test` failed3734pass/1fail/1skip: Garden Office catalog records retain the old materials.js hash. No geometry assertion failed. `node scripts/garden-office-manifest.mjs --write` actually measured all9 forms; diff contains only the9 repeated materials.js SHA updates, with bounds/material counts/geometry/collision records unchanged. `node --test preview/tests/studio-garden-office.test.js`:20passed/0skips. The manifest is now owned in the live register; no active overlapping manifest owner was found. This is required provenance for the shared materials recovery change, not fresh timestamps or an unrelated asset rebuild.
Original gate wrapper42039 ended1 before core began. Final preview/core must rerun after this correction; baseline core remains stale. Isolated fallback repeat36657 still queued. B draft569 and its single #290 evidence comment are open; unsigned pushes explicitly authorized.

## File-by-file handoff

| File | Change and reason |
| --- | --- |
| `preview/src/graphics-recovery.js` | Bounded recovery state machine with injected time and one failure step-down. |
| `preview/src/graphics-lifecycle.js` | Native context binding; generation fences, bounded rebuild and deliberate retry. |
| `preview/src/graphics-recovery-ui.js` | Polite status, focus-preserving retry and relocation into the active modal. |
| `preview/src/graphics-recovery.css` | Readable recovery notice and accessible-sized retry control; reserve flow space for Photo save/discard actions during recovery. |
| `preview/src/graphics-reload-state.js` | One-use Settings/chat handoff and refusal to discard unpreserved UI/photo state. |
| `preview/src/graphics-resources.js` | Release obsolete GPU disposal listeners while retaining CPU resources for restoration. |
| `preview/src/main.js` | Compose graphics pause, resource recovery, reload guard and admitted-player UI restoration. |
| `preview/src/render-lifecycle.js` | One render-loop owner composes visibility and named pause reasons. |
| `preview/src/render-quality.js` | Backward-compatible persisted recovery tier/scale; manual selection clears override. |
| `preview/src/render-pipeline.js` | Dispose obsolete post-processing allocations including otherwise retained pass materials. |
| `preview/src/materials.js` | Retain HDR source and regenerate PMREM only for a current context. |
| `preview/src/reflections.js` | Invalidate partial/cached probes and recapture after the restored main frame. |
| `preview/src/resident-portraits.js` | Pause/fence capture work while retaining completed CPU image caches. |
| `preview/src/office-skyline.js` | Invalidate cached capture, release GPU targets and recapture with district visibility restored. |
| `preview/src/office-world-scene.js` | Forward graphics loss into skyline ownership. |
| `preview/src/office-ui.js` | Expose the existing office resource owner to main recovery. |
| `preview/src/photo-mode.js` | Expose retained-photo presence so fallback cannot discard the File. |
| `preview/src/debug-report.js` | Bounded per-cycle lost/restored/outcome diagnostics. |
| `preview/e2e/graphics-recovery.js` | Real canvas loss/restore, continuity, bounds, retry/timeout and guarded fallback acceptance. |
| `preview/tests/graphics-recovery.test.js` | Fake-clock state, timeout, loop and disposal regressions. |
| `preview/tests/graphics-lifecycle.test.js` | Generation, retry and rebuild ordering regressions. |
| `preview/tests/graphics-recovery-ui.test.js` | Status, focus and modal relocation regressions. |
| `preview/tests/graphics-reload-state.test.js` | One-use scoped handoff and refusal-to-discard regressions. |
| `preview/tests/graphics-resources.test.js` | Shared resource disposal with CPU data retention. |
| `preview/tests/environment-recovery.test.js` | Retained-source PMREM regeneration and target disposal. |
| `preview/tests/render-lifecycle.test.js` | Visibility/graphics pause composition. |
| `preview/tests/render-quality.test.js` | Old preferences, tier/scale persistence and manual override. |
| `preview/tests/render-pipeline.test.js` | Complete pass resource disposal. |
| `preview/tests/reflections.test.js` | Lost partial capture invalidation and restored recapture. |
| `preview/tests/resident-portraits.test.js` | Capture pause/resume and stale-callback fences. |
| `preview/tests/office-skyline.test.js` | Office capture invalidation and visibility restoration. |
| `preview/tests/debug-report.test.js` | Bounded cycle records and copy isolation. |
| `docs/debug-reports.md` | Document graphics-cycle diagnostics. |
| `docs/desktop.md` | Document web graphics recovery settings and retry behavior. |
| `docs/testing.md` | Declare J1 local-only coverage and acceptance limits. |
| `docs/design/garden-office/asset-manifest.json` | Measured provenance refresh for changed shared materials source; form measurements unchanged. |
| `docs/superpowers/plans/2026-10-20-resilient-client-290.md` | Task scope, ownership, audit, verification and delivery evidence. |

## Queue checkpoint (2026-10-21T00:20Z)
Main remains a35214f3 after23:47Z fetch. All A source is still uncommitted; generated reports remain excluded. Isolated fallback repeat36657 now has two preceding runs, corrected preview/core58989 follows another owner full gate. B keyboard-tap follow-up exec39539 remains queued after A. No own runs overlap, no lock bypass or other process changes. File-by-file handoff added. Leases remain owned through01:41Z. Next: collect fallback diagnostics and final gates, diagnose repeated failure if any, then unsigned commit/push and draft/evidence publication.

## Fallback repeat diagnosis (2026-10-21T00:24Z)
Isolated exec36657 ended1, reproducing only the fallback exact-server-position assertion. Load14.35/19.48/21.51. In-place cases and five-cycle bounds passed again: geometry492/492/410/492/492, textures134/134/126/134/134, resource listeners2023/2023/1683/2023/2023, DOM66 throughout.
Diagnostics prove the old assertion sampled a lagging movement acknowledgement: before-loss server north=-1294.1068788628031 while local z=1293.9271516784488; after reload server north=-1293.9271516784488 and local z remained exactly1293.9271516784488. Camera transform was identical; identity unchanged and recoveredGraphicsPage=true. Production recovery preserved the pose; the before-loss server snapshot was stale.
Journey now measures the authoritative snapshot immediately before the explicit retry, after the existing15s failure deadline, and retains exact full-position equality across reload. It adds exact local walking-pose equality too. No sleep, threshold change or skipped case; no production change. Re-run combined J1/HUD/contextual after this evidence-based measurement correction; photo guard case still needs to be reached. Corrected full preview/core exec58989 remains queued, with B follow-up exec39539 after it.

## Corrected full-gate progress (2026-10-21T01:01Z)
Final standalone `pnpm test` passed3735/3736,0fail/1existing skip in128.365s after the measured manifest provenance correction. Console `/tmp/river-oaks-290-graphics-final2-tests.log`. Python3.12 `nice -n 19 pnpm run verify` is now running under exec58989; no own journey overlaps. Core result remains pending.

## Final core passed (2026-10-21T01:05Z)
`PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH nice -n 19 pnpm run verify` passed all11 phases, receipt `.runtime/agent/core.json`, start01:00:47.529Z/end01:04:02.593Z, dirty base a35214f38795ced1ee6867aad5c3c2723a7ceaae. Console `/tmp/river-oaks-290-graphics-final2-core.log`; exec58989 ended0. Counts: tooling168pass/0skip, preview3735pass/1skip, server732pass/212skip, desktop115pass/3skip, Python145pass/66warnings. Build/lint/format/demo/secrets passed. Demo verification expected exit2 is the tested synthetic-domain result. Skips remain unverified scope.
All production changes are now covered by final core and standalone preview. Final corrected J1 plus HUD/contextual exec11327 remains queued; extended fallback/photo evidence and screenshots are still pending, so no A commit/push yet. B expanded J2/contextual passed and its full preview/core now runs independently under the same queue.

## New cycle-sampling failure (2026-10-21T01:25Z)
Combined exec11327 ended1. Normal restore, session/UI continuity, walking, loop/retry/quality and timeout passed; five-cycle DOM66 stayed fixed, but resource bounds failed: geometry405/502/410/492/492, textures126/136/126/134/134, listeners1673/2030/1683/2023/2023. HUD/quality and desktop/touch contextual journeys passed. First sample was lower than subsequent samples; whether capture stages explain it still needs confirmation. Load10.01/14.86/16.87.
Following run rule, repeat graphics alone once with read-only reflection-capture/quality diagnostics and unchanged bounds. Inspect capture progress before any sampling correction; no threshold loosening or sleeps. R4 final proof and extended fallback/photo remain pending despite earlier passing cycles. Production code and passed core are unchanged. B draft569 handoff complete at aad16b97.

## Cycle-sampling diagnosis and correction (2026-10-21T01:31Z)
Isolated exec46096 ended1 and reproduced the low-first-sample bound failure at load11.37/13.23/15.31. Every sampled reflection capture count equalled its pre-loss count (2/3/4/5/6); no sample represented a completed new-context reflection rebuild. Quality stayed Smoothest scale0.75/AOoff. Geometry405/405/410/492/492 and listeners1674/1674/1684/2023/2023 came from different partial cube stages, not comparable rebuilt scenes. Source confirms one cube face per frame and publication only after face6, while render-stats publishes once per second.
Journey now records capturesAtLoss after the native loss event and waits for a strictly newer completed capture before each resource sample. This also proves manual reflection rebuild completion. The five cycles, exact DOM/GPU listener bounds and memory bounds are unchanged; no sleeps, loosened threshold or skipped case. No production change, so final core remains current. Run combined J1/HUD/contextual again to prove equivalent-stage bounds and remaining fallback/photo cases.

## Continuation checkpoint (2026-10-21T01:34Z)
A remains entirely uncommitted at base a35214f3. Production source is unchanged since final preview/core passed. Two journey-only measurement corrections are pending final browser proof: authoritative pose sampled at the explicit retry boundary, and resource counts sampled after a completed new-context reflection capture. Full combined exec3351 is queued behind the active Campus full gate PID35007 plus one other run. Do not bypass the lock or alter those processes. Earlier exec11327 and isolated bounds repeat46096 ended1 with diagnosed partial-stage resource samples.
B delivery endpoint is complete: draft569 head aad16b97a63751af61198ed78037bea3f119bd3a, verified product f6ff7257c64a138166895408a7559dd429c5c4c7; J2 14, contextual15+17, shared46, focused93, standalone3716/1skip, core11 allpassed. Latest hosted head had12success/1neutral/5running/no failures at01:22Z. Exactly one B #290 evidence comment6304277748 exists and is updated.
Both owners unchanged; leases renewed01:06Z through03:06Z. Unsigned push answer applies to both branches; no new question. A final journey remains the only local verification dependency before its commit/draft/evidence and overall goal completion. Preserve generated reports untracked and both worktrees.

Visual inspection at01:34Z: `output/playwright/graphics-recovery-restored-world.png` from the latest isolated run shows the player avatar, street, buildings, trees, sky and UI visibly rendered after in-place restore. This is current Chromium fixture render evidence, not physical-GPU or human-accessibility acceptance. The five-cycle final screenshot still awaits the matching-stage journey pass.

Cross-PR hosted evidence at01:35Z: all19 checks completed successfully on B draft569 head aad16b97a63751af61198ed78037bea3f119bd3a. PR body, existing #290 evidence comment and live register updated; no further B commit was created, preserving that checked head. Earlier B ledger hosted-status checkpoints describe their recorded times; current hosted status is on the PR.

## Completed-capture bounds passed; local prediction assertion (2026-10-21T02:09Z)
Combined exec3351 ended1 only at the added exact-local-prediction assertion. All required resource bounds now pass at completed captures: geometry503/498/503/503/503, textures136 throughout, listeners2033/2023/2033/2033/2033, DOM66; captures strictly advance after each native loss. Authoritative full position and identity match exactly across fallback reload. HUD/quality and desktop/touch first visit pass.
The extra local prediction equality differed0.0005597825m in north while the full authoritative pose remained identical; after reload local x/z exactly match the preserved server x/north. Source contract sends poses every200ms and applies the server snapshot on admission (`multiplayer-client.js`282/413, `walking-ui.js`applyServerPose). Preserve server authority; do not introduce pose replay to retain unacknowledged prediction. At load43.05/24.34/20.03, run the required isolated repeat before correcting the additional assertion to compare resumed local coordinates against the preserved authoritative pose. No production change or tolerance adjustment.

## Authoritative fallback assertion corrected (2026-10-21T02:12Z)
Isolated prediction repeat exec67967 ended1 at the same added local-prediction assertion. Five completed-capture resource bounds passed again (geometries503/502/503/503/503, textures136, listeners2033/2030/2033/2033/2033, DOM66). Full authoritative position and identity again remained exactly equal across reload; the local predicted north differed0.0690192752m before reload and then exactly adopted the preserved server north.
This is the existing200ms pose-send/admission reconciliation contract, not lost authoritative position. The extra assertion now requires resumed local x/z to exactly equal preserved server x/negative-north, while the separate full authoritative-position equality stays unchanged. It does not compare unacknowledged client prediction as if it were authoritative, introduce pose replay, add tolerance or skip a case. No production change. Final combined journey will verify this contract and retained-photo guard/download.

## Photo action obstruction reproduced and fixed (2026-10-21T02:20Z)
Combined exec11745 and isolated exec98807 both failed native Download PNG after all continuity/bounds/retained-camera assertions passed. Repeat hit-testing returned graphics-recovery at the link center; Playwright explicitly reported the aside intercepting pointer events. Screenshot inspection confirmed the notice covered the photo actions. Load36.80 before repeat,25.30 during it.
Recovery CSS now gives an open Photo mode a scrollable column only while the notice is visible: header, notice, active photo/composition content and status each reserve their own space. The retained image/camera are unchanged, and the normal photo layout returns when recovery ends. J1 verifies real PNG downloads at desktop1000px and narrow390px, with screenshots; no forced clicks or skipped checks. This production CSS correction requires fresh focused/full preview/core and final combined journey evidence before commit.

Focused final suite (all graphics modules plus measured manifest regressions):152passed/0skips, `/tmp/river-oaks-290-graphics-final3-focused.log`. Final J1 also exercises discard, close and a successful deliberate retry after saving, so the guard has an accessible exit. Normal photo layout is unchanged outside recovery; all recovery photo UI sits above the non-interactive frame overlay.

## Final UI verification checkpoint (2026-10-21T02:23Z)
A remains uncommitted at a35214f3. All source changes except the final recovery-photo CSS were covered by the prior passed core; that result is superseded for final publication. CSS fix follows two real native-download failures and an exact hit-test showing the notice intercepting the photo link. Focused152/152 pass. Exec47944 is queued behind experience PID76918 and will run standalone preview, core and combined journeys sequentially. No own overlap or lock bypass.
Latest J1 uses complete reflection captures before unchanged bounds; it compares local resumed x/z against unchanged authoritative coordinates, preserving server authority rather than unacknowledged prediction. New native downloads at1000px/390px and discard/close/retry guard exit verify the photo-layout correction. Earlier run IDs11745/98807 ended1 at the demonstrated pointer obstruction. B delivery/evidence and hosted green head remain intact. Owners/leases through03:06Z unchanged; unsigned pushes already authorized. Next: collect final3 gate and publish A if all promised checks pass.

## Exact final verification commands

Focused command below passed152/152 after the photo-layout correction; full gate/journeys remain pending exec15011. The wrapper holds the ordinary shared lock and executes the following commands sequentially.

```sh
node --test preview/tests/graphics-recovery.test.js preview/tests/graphics-lifecycle.test.js preview/tests/graphics-reload-state.test.js preview/tests/graphics-recovery-ui.test.js preview/tests/graphics-resources.test.js preview/tests/render-lifecycle.test.js preview/tests/render-quality.test.js preview/tests/render-pipeline.test.js preview/tests/environment-recovery.test.js preview/tests/reflections.test.js preview/tests/resident-portraits.test.js preview/tests/debug-report.test.js preview/tests/office-skyline.test.js preview/tests/office-ui.test.js preview/tests/studio-garden-office.test.js
pnpm test
PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH nice -n 19 pnpm run verify
RIVER_OAKS_E2E_REPORT=graphics-recovery-release-local.json pnpm run test:experience graphics-recovery hud-and-quality contextual-first-visit
```

## Unchanged furnishings timing failure (2026-10-21T02:37Z)
Exec47944 ended1 at standalone preview:3734pass/1fail/1skip,111.138s. `preview/tests/office-penthouse-furnishings.test.js:200` (surfaces drawn in short idle slices) measured49.0ms against its existing strict40ms limit. Core and journeys did not start. Load12.24/14.16/17.04. Owning furnishings source and test are identical to main a35214f3; this path does not execute graphics recovery or the changed environment loader/CSS.
`node --test preview/tests/office-penthouse-furnishings.test.js` passed15/15,0skips in1.151s, `/tmp/river-oaks-290-furnishings-isolated.log`. No code, concurrency, timeout or threshold changed. Treat the first failure as a load-sensitive wall-clock test pending an unchanged full-gate retry, not as a verified recovery defect or a skip. Final4 logs/report will supersede final3 only after actual success.

## Reconciliation checkpoint (2026-10-21T02:48Z)
`git fetch origin` confirms main remains a35214f38795ced1ee6867aad5c3c2723a7ceaae. Primary checkout is clean. `pnpm run --silent project:check --github` exits1 for58 existing cross-project gaps; none names either #290 task. Both owners remain this session, leases through04:34:56Z. B draft569 remains open against main at aad16b97, all19 hosted checks completed successfully. Final4 exec15011 still waits behind shared-town PID17481; no new local result is claimed. Next action remains final4 collection and A publication after actual success.

## Final4 preview passed (2026-10-21T02:52Z)
Standalone `pnpm test`:3735passed/0failed/1existing skip,3736total,144.152s. The unchanged furnishings wall-time test passed without source or threshold changes. Console `/tmp/river-oaks-290-graphics-final4-tests.log`. Core is now running under the same serialized exec15011; journeys follow only on success. No A commit or push yet.

## Final4 core passed (2026-10-21T02:54Z)
Python3.12 `nice -n 19 pnpm run verify`: all11 phases passed, receipt `.runtime/agent/core.json`, start02:50:42.911Z/end02:54:15.626Z on dirty base a35214f3. Console `/tmp/river-oaks-290-graphics-final4-core.log`: tooling168pass/0skip; preview3735pass/1skip; server732pass/212skip; desktop115pass/3skip; Python145pass/66warnings (5.42s); build/lint/format/demo/secrets passed. Demo verification exit2 is its expected synthetic-domain result. This refresh includes the final Photo recovery layout. Final combined browser journey is now running under exec15011; no publication before its actual result.

## Final browser verification and before-push checkpoint (2026-10-21T02:57Z)
Exec15011 ended0. Final standalone preview and all11 core phases passed, as recorded above. `RIVER_OAKS_E2E_REPORT=graphics-recovery-release-local.json pnpm run test:experience graphics-recovery hud-and-quality contextual-first-visit`: graphics27checks/82.058s, HUD14checks/16.009s, contextual desktop15+touch17checks/31.609s, all passed, no browser errors. Receipt created02:56:27.622Z; report remains untracked local evidence.
Five completed-capture cycles: geometries503/502/503/503/503; textures136 throughout; resource listeners2033/2030/2033/2033/2033; DOM listeners66 throughout; completed captures3/4/5/6/7. Original bounds unchanged. Full authoritative pose and identity remain exactly equal across explicit fallback reload; local walking adopts that authority. Settings/chat draft survive. Retained photo and actual camera remain unchanged; real downloads succeed at1000px and390px; discard/close then explicit retry succeeds without sign-out.
Visually inspected final desktop/narrow retained-photo screenshots: notice, image, save/discard and close controls occupy separate space. Inspected final five-cycle screenshot: avatar, world, sky, lighting and HUD are visibly rendered. Chromium fixture evidence only; no physical-device or human-accessibility claim.
Worktree/branch remain those in Ownership; base/HEAD a35214f38795ced1ee6867aad5c3c2723a7ceaae before the feature commit. T0–T7 and local T8 verification/review are complete; all37 intended source/test/doc paths are owned, generated reports excluded. Three Important review findings were fixed; final gates cover those fixes. No pending decision: unsigned push explicitly authorized. Next: owner check, unsigned commit/push, draft, one issue comment, metadata handoff. No merge/release.

Feature commit `d0d881efff2e3892d03846fe8cce7c8d0940a6c0` created unsigned as authorized; installed staged secret guard passed. Before first push: all product gates complete, main remains a35214f3, only this delivery-metadata ledger update and untracked local reports remain. Next: push feature, open draft, post the single A evidence comment, commit final metadata.

## Draft delivery checkpoint (2026-10-21T02:59Z)
Implementation and required local verification complete. Graphics draft [#572](https://github.com/BunsDev/river-oaks/pull/572) opened against main at verified product `d0d881efff2e3892d03846fe8cce7c8d0940a6c0`. Exactly one graphics [#290 evidence comment](https://github.com/BunsDev/river-oaks/issues/290#issuecomment-6306912515) posted. Background draft [#569](https://github.com/BunsDev/river-oaks/pull/569) remains at `aad16b97a63751af61198ed78037bea3f119bd3a`, all19 hosted checks passed; its one evidence comment is6304277748. Both source branches are independent from main a35214f3.
This final ledger-only follow-up records URLs and completion; product files are identical to the verified feature commit. Before metadata push: re-read owner, `git diff --check`, and installed staged secret guard must pass. No source retest needed for documentation-only handoff. All generated reports remain untracked; no primary edits, merge, deployment, cleanup or production action. A hosted checks are pending and are not part of the completed local proof.

| Requirement | Status at draft endpoint | Evidence |
| --- | --- | --- |
| R1 | Met | J1 polite status, paused frames, exact authoritative position, same identity and retained Settings; unit regressions. |
| R2 | Met | GPU audit, completed reflection rebuilds, advancing frames, visible avatar and walking; screenshot inspection. |
| R3 | Met | Fake-clock deadline/loop tests; J1 timeout, persisted step-down, focus and safe explicit fallback without sign-out. |
| R4 | Met | Five real cycles at completed captures with bounded GPU memory/DOM and resource listeners; stale work fencing tests. |
| R5 | Met | B focused93, J2 14, contextual15+17 and shared46; fresh authorized snapshot after persisted pageshow. Actual browser bfcache eligibility remains unverified. |
| R6 | Met | Both core receipts passed11 phases; docs/ledgers/register current, two draft PRs and exactly one issue evidence comment per PR. |

Decisions for Val: none pending; unsigned pushes were explicitly authorized. Follow-ups remain #290 network transitions, #288 touch-hold, #286 native lifecycle and physical-device/human accessibility acceptance. State: implementation complete, required local verification complete, drafts opened; not merged, not released.

## Review fix pass (2026-10-24, local branch sweep/pr572)
Worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pr572`, created from #572 head f65de07e. Merged main 641655d2 without conflicts. Main's newer GPU resources were audited: Bayou Market kit and character-realism canvas/data textures keep their CPU source, and Three re-uploads them. Shader patches recompile. Commons, rivals and police live in the main scene. Main added no render target, PMREM or cube probe, so the rebuild step misses none of them.
- Restore deadline now counts visible time only. A loss that begins hidden stays out of the three-loss window, and its failure does not lower quality. The notice says "lower settings" only after an actual step-down. Fake-clock regressions failed before and pass after.
- Once a deliberate retry also times out, "Reload graphics" takes the existing guarded reload instead of retrying in place forever. Regressions failed before and pass after.
- The standalone fallback office scene now releases its own scene resources and redraws its RoomEnvironment PMREM. officeUI and the rebuild step are wired to it. Scene and UI regressions failed before and pass after.
Focused: the 16 PR/office files had 167 pass/0 skip. The wider graphics/HUD/quality/office set had 332 pass/0 skip, and `pnpm run build` passed. Not run in this pass: `pnpm run verify` and every browser journey, including graphics-recovery. Not done (follow-ups): low-memory step-down floor (fixed 4096² sun shadow, reflection cubes, character tier never "low"), and a Commons case or default-suite entry for the graphics-recovery journey. After #569 lands, its pageshow `resume` should share the render lifecycle's `resetTime`, which includes `quality.resetTime()`. Next: reviewer core gate, then push.

Integration and gate (2026-10-24, open-pr-sweep-20261024, claude:river-oaks-a3, Val-authorized landing):
- #569's signed head `170dfd7e` is merged in (`410e62d4`), with no conflicts.
- `a7d7a402` shares one `resetFrameTime` between the render lifecycle and #569's pageshow resume. A bfcache restore previously reset the clock by hand but not the adaptive quality measurements.
- Focused tests: 122/122 across graphics, render-lifecycle, background-lifecycle, office, voice, walking and held-button.
- `pnpm run verify` (core) passed: tooling 225/225; preview 3971 passed, 1 skip; server 867 passed, 219 Redis skips; desktop 115 passed, 3 skips; build, Python, demo and secrets.
- The original commits `d0d881ef` and `f65de07e` were unsigned. The branch is rebuilt as one SSH-signed commit on `170dfd7e`, with the tree identical to the verified one. The old head is kept at `refs/sign-branch-backup/feat/resilient-client-290-20261020/f65de07e…`.
- The `graphics-recovery` browser journey still isn't in the default suite and has no Commons case. Adding both, and the low-memory step-down floor, remain follow-ups.
