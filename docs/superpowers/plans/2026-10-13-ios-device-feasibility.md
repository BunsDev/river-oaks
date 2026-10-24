# iOS physical-device feasibility — #285

## Objective and scope
Pursue #284 through #285–#294. First establish a measured architecture decision with real iPhones. No production host selected yet. Probe code is disposable.

## Ownership
- Task: ios-device-feasibility; owner codex-ios-rollout-20261013.
- Branch: feat/ios-device-probe-20261013; external sibling worktree.
- Own experiments/ios-probe/, scripts/ios-probe.mjs, scripts/tests/ios-probe.test.js, docs/ios-feasibility.md and this ledger.
- Source baseline: 3db6a5f0e381d3e9257bff42c63ac785d08e2ba4.

## Plan
1. Reconcile current source, origin/security and platform support; document hard gates and candidate matrix.
2. Test measurement aggregation and native navigation/configuration boundaries before implementing a WKWebView probe.
3. Build Release simulator/device, install on authorized paired iPhone, capture Safari/WKWebView evidence.
4. Record missing minimum-device/live-auth/human evidence; obtain independent technical review before a go/revise/stop decision.
5. Continue eligible privacy and signing prerequisites; advance production packaging only after #285 passes.

## Required verification
Focused behavioral tests; native build/tests; actual phone measurements with raw samples and exact build/device/workload; core pnpm verification. Full/Redis/browser, CI, physical vs simulated, live auth and human checks remain separate.

## Results
- Live #284–#294 all open with zero comments, no iOS PR or existing iOS task.
- Xcode 26.6 (17F113), iOS SDK 26.5, xcodegen available.
- iPhone 16 Pro Max paired/available; development signing identities present.
- Val authorized team 9LR8Z8UQ9X, bundle ai.typesafe.place.ios-probe, development provisioning and device measurement.
- project:check reports existing unrelated ownership/unregistered-branch/retirement gaps; preserve those tasks.

## Implementation and observed checks
- Disposable WKWebView probe with exact HTTPS top-level policy, bounded Turnstile child frames, isolated measurement world, sanitized local JSONL, native deadline and final drain.
- Experimental system-browser GitHub device flow reuses the existing desktop server exchange; transient credentials remain in memory, redirects are refused, session cookie validated before import.
- Native regression suite: 12 passed. Node collector/summary suite: 11 passed (including termination reporting). Real macOS WebKit fixture loaded the actual scene and collected 21 frame intervals. Final focused checks passed. A redundant WebKit rerun was canceled while waiting behind five other browser jobs; its earlier unchanged-script result remains the available browser evidence.
- Release simulator and development-signed physical builds installed/launched. Initial Info.plist and child-frame issues were reproduced and corrected. Val confirmed Turnstile works.
- Val reported world loaded after GitHub retry, then confirmed frozen/blank view. Current raw recording lacks a GitHub exchange event: isolated flow proof remains open.
- Physical recording 087AB2FD: three ready samples, WebContent terminations at 12:25:05 and 12:25:32 UTC after reload. Last counters: 3,377,648 triangles / 931 calls, Auto scale 1 and occlusion true, native thermal 0. Not a sustained run; cause not established.
- `pnpm run verify` passed: tooling 86, preview 2,737 passed/1 skipped, server 421 passed/134 skipped, desktop 49 passed, Python 141 passed. The subsequent summary regression is covered by the final tooling rerun: 87 passed, zero skipped. Full Redis/browser, hosted CI and signed distribution not verified.
- Independent technical review findings about final drain, deadlines, navigation fences, build metadata, quality metadata, summary frame retention and write failures were addressed. Follow-up auth review found no blocking defect; monotonic auth deadline and cancellation regressions added.
- Native-only collector control also terminated twice (12:37:51/12:38:12 UTC); the injected sampler is not a necessary trigger. The first native trace recorded an exit watchdog, distinct from earlier WebContent failures; Activity Monitor trace exported its table of contents (32.28 seconds, target app exited); 28 exported samples show native-host-only peak footprint 13.35 MiB. WebContent/GPU were not captured, so combined memory and termination cause remain unknown. Browser button corrected to identify the default browser rather than falsely label it Safari.
- Privacy/data inventory (#292) and development-signing prerequisites (#293) recorded in docs/ios-feasibility.md. No distribution or production account changes.

## Evidence
Private `.runtime/ios-probe/`: core.log, auth-green.log, js-green.log, webkit.json, device-build.log, simulator-build.log, install-device.json, launch-device.json and auth-success-records/. Copy only app Documents, never login storage. Original recording 087AB2FD uses the pre-monotonic-clock build. The later C5E6607B control run includes monotonic auth and native-only mode; the Browser-label correction was built afterward. Preserve each build distinction.

## Gaps and next action
#285 remains open: reproduce termination with a targeted trace, establish hosted source and WebContent/GPU memory, compare Safari, then run sustained representative workloads only once stable. Minimum phone, touch/interior/multiplayer/recovery, human accessibility and distribution remain unverified. Verified implementation committed and pushed as 9f2096a9c22890e5f3a5adc43e91f89441ec14e0 (valid SSH signature). Draft PR #309 is open; no merge or issue closure. Do not archive the worktree.

## First-run handoff
- Draft PR: https://github.com/BunsDev/river-oaks/pull/309. Implementation source: 9f2096a9c22890e5f3a5adc43e91f89441ec14e0; clean-source signed rebuild also passed in `.runtime/ios-probe/committed-device/` (subsequently installed for the next reproduction).
- Final Release simulator/device builds and strict code-sign verification passed. Staged secret scan passed; no unrelated files included.
- Browser comparison: Val clarified Safari freezes or reloads while loading. This is human-observed behavior without a correlated Safari trace. Clean-source native-only probe C456B60A reproduced termination five seconds after launch at 12:48:23 UTC. An all-process Activity Monitor capture is being exported to include WebContent/GPU rather than only host memory.
- The task stays active and #285 stays open. Next: target WebContent/GPU memory rather than host-only metrics; preserve security and fidelity until cause is established.
- Worktree contains the ongoing experiment and private raw evidence; it is not ready for retirement or archival.

## Updated-main verification and trace gap
Integrated origin/main at e8a2c8d (email acceptance, settings, dominoes and desktop microphone work). The probe implementation and shared rendering pipeline are unchanged by that integration. `pnpm run verify` passed again: tooling 87, preview 2,750 passed/1 skipped, server 421 passed/134 skipped, desktop 51, Python 141. Receipt/log: `.runtime/agent/core.json`, `.runtime/ios-probe/core-integrated.log`.

The 45-second all-process Activity Monitor capture reached its time limit but has not finished finalizing. `xctrace export` reports `Document Missing Template Error`; a process sample shows remote device symbol-signature lookup. One SIGINT requested normal stop after more than seven minutes. Preserve the raw trace and log; no WebContent/GPU footprint or termination cause has been extracted. This is a tooling gap, not evidence of a memory limit. Next continuation should inspect the existing trace process/output before starting another capture.

## Memory trace recovered; allocation isolation in progress
The existing xctrace process completed successfully after its slow finalization. Exported all-process Activity Monitor rows and filtered only launch-correlated host/WebContent/GPU PIDs. WebContent65040: 27.94→104.83→1,090.88→1,532.33→1,843.17 MiB over4.16s; GPU65041: max355.27MiB; host65037:max13.03MiB. These are sampled process footprints, not allocation peaks or a proven jetsam reason. Raw export/filtered records and before/during process inventory remain in `.runtime/ios-probe/`.

Independent source review points first to concurrent template/image decode: six standard avatars contain206MiB baseRGBA8 pixels; boxwood/fountain-grass add96MiB. Geometry, generated canvases and render targets remain candidates. Avoid counting unused legacy assets or multiplying shared texture pixels by resident count. Hosted source identity still requires proof.

Added explicit `--probe-block-characters`, `--probe-block-landscape`, `--probe-block-materials` controls to the disposable probe. Fixed same-origin asset-directory rules compile before page load; auth paths are unaffected. Start/applied events name excluded groups; summaries flag reduced-content trials as invalid for representative acceptance. Native suite15pass, Node probe suite12pass; Release device build and strict signing verification pass. No production scene settings changed. Physical isolation trial is next; changes are uncommitted pending evidence and final verification.

## Character isolation and same-binary control
Dirty Release build based on5f75a43, native-only: D4AAC246 excluded only the character directory. Host65232/WebContent65237/GPU65238 survived more than60seconds. Its45second Activity Monitor export contains45 samples per process: maximum footprints12.91/1664.83/470.47MiB respectively. Thus character-dependent work is implicated but substantial memory remains without it. Same-binary full-content control461A489D terminated at13:13:39 UTC, four seconds after launch. Raw recordings and traces remain under `.runtime/ios-probe/{no-characters-records,control-full-records,no-characters-memory.trace,no-characters-memory-selected.json}`.

Independent review confirms district initialization does not await character loading, but the exclusion removes cloning, generated face/hair/costume/vehicle work and camera switching as well as image decoding. Navigation finish alone does not prove district rendering. Added an explicit one-shot scene-snapshot option, no RAF installation; a physical follow-up will verify existing whitelisted scene counters. Fixed the review's late rule-compilation callback after Stop by checking recording state before loading. Focused tests now15Swift/13Node passed; signed Release device build passed. Final core/review pending.

The physical snapshot41AAD575 at13:23:44UTC confirms district telemetry:199trees,2planted beds,998calls,3,733,184triangles,270geometries,106textures,0/88residents and playerReadyfalse. PipelineMSAA4/AO/bloom enabled; automatic renderScale0.6. This establishes loaded scene counters, not continuous responsiveness or matched camera/fidelity acceptance. The sampled run explicitly enabled one-shot DOM telemetry; it is distinct from the earlier zero-JS native-only trace. Review found a pending-snapshot-after-termination edge; a document termination flag now fences before/after reads. Added exact-file standard/special rig groups for the next controlled comparison.

## Narrowed rig evidence and verified diagnostic patch
Actual WebKit compilation rejected the first alternating-filename regex before page load (6EC717EF); that failed setup is not a scene trial. Replaced it with individual exact-file rules. Added a real WKContentRuleList compiler regression covering every group, plus filename matching tests.

Same corrected dirty Release binary (source5f75a43; binary SHA in `.runtime/ios-probe/rigs-build.json`):
- Standard rigs excluded:8D7A8CD3, start13:29:37UTC, snapshot13:29:58. PlayerReadytrue,199trees,2beds,0/88residents,739calls,2,927,829triangles,290geometries,117textures. Auto renderScale0.6 and AOfalse, bloomtrue/MSAA4. No recorded termination before the next launch at13:30:35. This is a reduced-workload/camera-dependent diagnostic, not playable acceptance.
- Special rigs excluded:28EF265E, start13:30:35, WebContent termination13:30:39. No delayed snapshot after termination. Leaves standard rigs active and points to their loading/instantiation path; it does not separate decoding, generated face/hair work, or concurrent allocation peaks.

Verification: `swift test --package-path experiments/ios-probe`17passed, including actual WebKit compilation; `node --test scripts/tests/ios-probe.test.js`13passed; Release simulator/device builds and strict codesignpassed. `pnpm run verify`passed: tooling89, preview2750pass/1skip, server421pass/134skip, desktop51, Python141. Core receipt `.runtime/agent/core.json`, log `core-rigs.log`; native logs `rigs-webkit-green.log`, `rigs-build.log`, `rigs-simulator-final.log`. Independent technical review confirmed exact rules and Stop/navigation/termination fences. Project check still reports unrelated lifecycle/ownership gaps. Full browser/Redis, hosted exact-head CI, stable physical performance and auth/distribution acceptance remain separate.

Next: investigate standard avatar template decoding and resident instantiation with bounded full-fidelity loading locally, then obtain physical same-workload proof before selecting any production host. No production scene edits, deployment, merge or gate closure. Keep this worktree active.

## Decoder comparison (continuation)
The preceding turn made progress: diagnostic controls and correlated allocation
records were verified, signed and pushed as25509d6 to draft PR309. This turn
preserves the full rollout objective; no gate is closed.

- Serialized `createImageBitmap` first failed after6seconds (F05634EA). Review
  narrowed the wrapper to immutable Blob inputs, captured plain option values at
  invocation, and passed mutable sources/cropped/exotic calls directly through.
  Corrected run161BA935 observed support and one active decode with20queued, then
  WebContent terminated at13:43:19UTC, four seconds after launch. Serializing
  this API is not sufficient; fetch, GLTF parsing and other allocations remain
  concurrent. Cumulative decoded pixel counters are not footprint measurements.
- HTML-image fallback B847F58B loaded the player and88/88residents by20seconds
  and survived until the next control launch about5minutes later. No asset URLs,
  geometry, resident count or rendering settings were removed by this treatment.
  It makes `createImageBitmap` unavailable only in the probe's main document,
  selecting GLTFLoader's existing TextureLoader path. This remains an experiment;
  color/alpha equivalence and other-library compatibility are unverified.
- The45second steady-state trace `.runtime/ios-probe/html-images-memory.trace`
  has45samples for launch-correlated host65522/WebContent65523/GPU65524.
  Maximum sampled footprints:11.69/1557.27/379.66MiB. It started after loading;
  comparing this directly with the original startup peak is not a matched peak
  comparison. Default-decoder same-binary control6EF987D7 again terminated four
  seconds after launch (13:55:03UTC).
- Added observed decoder-state and asset-progress snapshots after review noted
  that readiness alone can conceal GLTF texture failures. Browser verification
  now also counts console errors and requires settled asset loading with zero
  failures. Initial local browser runs waited behind active shared jobs, then
  failed because the expected WebKit2370 executable was absent. Installed the
  matching browser in an isolated `.runtime/ios-probe/browsers` cache and queued
  the fresh HTML-mode verification; never bypassed the browser lock.
- Sustained full-content runCEE3B6B7 began13:58:11UTC with RAF sampling enabled.
  At21.7seconds it observed HTML mode, imageBitmapAvailablefalse,100/100assets,
  zero failures,199trees,2beds and88/88residents. At90seconds it remained alive
  but only about12fps (RAF median80ms/p9584ms in that drain), Auto scale0.6/AOoff,
  thermal state0. Startup stability improved; sustained30fps is not established.
  A separate startup Activity Monitor capture is finalizing; preserve its handle
  and raw trace rather than restarting on a timeout.

Related upstream context: Three.js issue30416 reports Safari memory growth when
GLTFLoader moved to ImageBitmapLoader. This is consistent with the observed
branch difference, not proof of an identical WebKit defect or termination reason:
https://github.com/mrdoob/three.js/issues/30416

Next: complete the active sustained run and startup trace, verify textures and
render equivalence, then profile the remaining frame-time failure before any
production-host decision. No production global API override is proposed here.


### Decoder validation and interrupted sustained trial

- Val reports the world responds to movement/look with the fallback. This is
  manual interaction evidence, not an interior, multiplayer or performance pass.
- Startup trace `html-images-startup.trace` completed; selected process rows are
  in `html-images-startup-selected.json`. Host65575, WebContent65576, GPU65577 each
  have28samples, maxima13.00/1707.60/444.64MiB. WebContent starts116.86MiB;
  CPU samples exceed100% during startup and later sit around27–36%. These are
  separate sampled process footprints, not a deduplicated total or exact peak.
  Instruments export emitted dylib-overlap warnings; numeric table export completed.
- CEE3B6B7 entered background at14:01:13UTC/182.3seconds, then exited without a
  final recording event. Current process inventory confirmed its host was absent.
  Do not count subsequent wall time as foreground stability or infer exit cause.
- Fresh run409F0F62 began14:18:14UTC with the same dirty Release binary and
  HTML+snapshot flags. At120seconds it was visible, nominal thermal, contextLost0,
  about15fps, Auto0.6/AOoff,619calls/2.594million triangles. The operator was asked
  to keep the probe foreground; a full20–30minute foreground record is pending.
- Local WebKit HTML test passed with100/100assets,failed0,88/88residents,
  observed fallback,35RAF intervals and no page errors. Two HTTP503 console errors
  match exact URLs explicitly refused by the existing offline provider fixture;
  unexpected console errors remain fatal. Earlier failed attempts are retained.
- `image-parity.json` compares38embedded images from the six standard rigs.
  All raw WebGL2 RGBA8 uploads are byte-identical across the two decoders;12
  Canvas2D comparisons differ. Preserve `image-parity-canvas-first.json` as the
  initial result. Raw upload equality is not full shader/scene or iPhone evidence.
- Independent review accepted the missing-texture checks and diagnostic boundary,
  requested a bounded parity deadline and explicit GPU-only success naming; both
  were addressed. Final parity rerun passed with explicit GPU-only success.
  Serialized-mode local WebKit also passed (82RAF intervals, all assets/residents,
  queue maxActive1), while the physical serial-mode termination remains a failure.
  Core passed:95tooling,2750preview/1skip,421server/134skips,51desktop,141Python.
  The fresh focused suite passed19Node tests and
  17Swift tests passed; Release simulator/device builds and codesign passed.
  New local verification harness changes receive fresh focused checks before commit.

Next: finish409F0F62 foreground measurement, retain exact recording limits, and
profile the remaining frame-time failure. No production API override, architecture
acceptance, merge, deployment or issue closure. Keep this worktree active.

Coordination check uses the primary live task register and remains nonzero for
unrelated expired leases, unregistered branches and pending retirements. The iOS
claim is valid; preserve those unrelated tasks and branches.


### Verified delivery and build correlation

Decoder controls and evidence are signed/pushed as
`b1454da3d081d51c119504d438df86f97033c053` on draft PR309. Signature verified;
attribution scan empty and staged secret scan passed. Production remains unchanged.

Run409F0F62 subsequently backgrounded at14:31:08UTC, elapsed773.41seconds
(12minutes53seconds). The retained partial summary has155visible samples and
13,030RAF intervals totaling766.084seconds: p50=66ms,p95=79ms,p99=84ms.
Thermal states remained0; no WebContent termination event was recorded. It is
unfinished, not a continuous20minute workload and not performance acceptance.
Raw copy: `.runtime/ios-probe/html-second-background-records/`; summary:
`html-second-partial-summary.json`. The foreground-availability question remains
pending; do not infer approval or availability from elapsed time.

Contemporary public entry `index-Bnbob92Q.js` imports `debug-report-D_-DtnBR.js`,
whose build metadata names837bf3cae07f0dc9a2441ae3b870a4ca360202cb, captured
14:31:05UTC. Whitelisted filenames, hashes and embedded revision are retained in
`public-build-*.json`. This does not prove what earlier phone navigations loaded;
deployments moved during the investigation. Do not retrospectively assign that
revision to earlier runs or assume same native binary means frozen hosted code.

A small follow-up snapshot now records at most8strictly matched root-relative
Vite entry basenames from at most16module tags. No absolute URLs, queries, inline
scripts, resource history or page content are retained. These are correlation
hints, not proof of loaded bytes/source. Reviewer found no blocker; bounded
iteration and explicit receipt limitations were added.20Node tests passed, core
passed (96tooling; other counts/skips unchanged), local WebKit HTML check passed,
and the signed Release device build passed strict codesign verification. This
follow-up binary is built locally and has not replaced the phone's running app.

Next: inspect existing local pass/object cost measurements, then collect a short
physical CPU/GPU profile when the phone is available; continue the20–30minute
foreground and visual/interior/recovery gates separately. Startup recovery alone
cannot select the production host. Goal remains active; no issue is delivered.


Local cost attribution completed using the repository's existing
`preview/e2e/render-pass-cost.js` and `render-object-cost.js`, adapted only to the
ordinary Bob fixture origin, mobile viewport and HTML decoder in the bounded
`.runtime/ios-probe/profile-local.mjs` runner. Receipt:`local-render-cost.json`.
At120sampled frames, macOS WebKit reports17msmedian/20msp95 with AO enabled;
this is a different device/settings workload and cannot establish phone speed.
RenderPass submits707draws/2.925million triangles at about3.99ms CPU submission;
GTAO adds319draws/1.151million triangles at1.30ms. GPU timer extension is absent,
so no GPU duration is inferred. Leading visible/shadow triangle categories include
mature tree leaves/branches, unnamed meshes, interiors and the player rig. These
suggest physical profiling targets, not permission to remove foliage or residents.
The next device capture must distinguish CPU submission from GPU execution with
current settings/source evidence before proposing a rendering change.


## Physical CPU and Metal attribution (continuation)

The previous turn made progress: signed commits 519bad7 and b1454da, local GPU
image equality, and a partial 12m53s foreground recording. This turn retains the
full rollout scope; no architecture or delivery gate closes.

- Reconciled the clean branch at 519bad7 and draft PR #309. Exact-head CodeQL and all
  five language analyses succeeded. This is not the aggregate preview merge gate.
  Primary main had advanced to d4734807d13b336367103e6f1caaeeb09d4138ee.
- Built and verified a clean 519bad7 Release probe. Receipt:
  `.runtime/ios-probe/identity-clean-binary.json`; binary SHA256:
  `9403f50c03a994cf8dbc4d83eab7c1ddd36d4ea98b92785951c6a8bb75f82a5b`.
  Installation succeeded. iOS refused the first launch because the phone was
  locked. Val then confirmed it was unlocked and open. Relaunched with HTML-image
  and snapshot flags, avoiding the default decoder used by a manual launch.
- Run 5D7DA768 started at 14:42:05 UTC. At 22.2 seconds it observed HTML mode,
  bitmap API unavailable, 100/100 assets, zero failures, 88/88 residents, 199 trees,
  two beds, Auto 0.6/AO off, 739 draws, 2.928 million triangles and four samples.
  The phone reported `index-DvTRKO1F.js`. Public import lookup correlates this to
  `debug-report-Dgsnu5x8.js` and build d4734807. Hashes and limits are retained in
  `profile-hosted-build.json`; this is not a hash of phone-loaded bytes.
- WebContent 65947 Time Profiler capture ran 14:42:49.837–14:43:36.557 UTC.
  `html-webcontent-cpu.trace` was exported through schema `time-profile` into
  `html-webcontent-cpu-samples.xml`; derived summary:
  `html-webcontent-cpu-summary.json`. It contains 16,675 Running samples, each 1 ms:
  total 16.675 seconds of statistical CPU weight, 14.778 seconds on the main thread,
  over a 46.332-second sample span. Unsymbolicated leaves account for 9.762 seconds;
  independent review found 9.584 seconds of those under animation-frame callbacks.
  RAF-inclusive weight is 12.214 seconds. Inclusive weights overlap; these are not
  wall-time percentages or complete JavaScript cost. RAF ancestry cannot identify
  whether a callback belongs to the game, a library or the probe.
- GPU 65946 Metal System Trace ran 14:44:55.889–14:45:27.444 UTC. Raw trace:
  `html-gpu-metal.trace`. Exported schemas: `metal-gpu-intervals`,
  `metal-command-buffer-completed`, and `metal-application-command-buffer-submissions`.
  Despite attaching to one process, raw intervals include compositor activity.
  Analysis strictly selects PID 65946 and state Active: 17,235 intervals with
  a 20.684862976-second union over the 31.173226667-second first-to-last span
  (66.3546%). Vertex union is 17.345059374 seconds; fragment union is 15.756038493
  seconds. They overlap and cannot be added. This is traced active-time coverage,
  not hardware occupancy or device-wide utilization. The 977 GPU frame groups
  have not been matched to game frames. CPU and GPU captures used separate
  windows, so subtraction cannot establish the frame-delivery bottleneck.
- Independent review reproduced every CPU and GPU summary value from the XML.
  Next attribution should time resident updates, reflection capture and
  `pipeline.render` with unchanged content, camera and effective quality,
  preferably during a concurrent GPU capture.
- Safari's developer menu was initially disabled. It was temporarily enabled to
  open Apps and Devices Inspection, which listed the paired iPhone. Attempting
  device selection encountered the UI tool's changed-app guard. Subsequent AX,
  screenshot and rebind calls repeatedly timed out. No JavaScript profile was
  obtained. Restoring the menu preference is pending UI access recovery; Val was
  asked to close the inspection window. No auth, security or network setting was
  changed. Do not force-close unrelated Safari windows.
- Run 5D7DA768 backgrounded at 14:50:48 UTC, elapsed 523.27 seconds (8m43s), after
  both captures. It is partial, includes profiler overhead, and cannot satisfy
  the 20–30-minute unprofiled requirement. Raw copy: `profile-ten-records/`.
  The foreground-availability question remains unanswered; the newer reply
  authorized the completed short profile.

Both traces used `xcrun xctrace record --device <paired-UDID> --attach <PID>`,
with `--template 'Time Profiler' --time-limit 45s` for WebContent and
`--template 'Metal System Trace' --time-limit 30s` for GPU. Both completed and
saved successfully. Raw artifacts remain local under `.runtime/ios-probe/`.

Next: restore Safari's developer-menu preference when UI access returns, then
obtain source-level phase timing with unchanged scene/camera/quality and a
concurrent GPU capture. Sustained unprofiled, interior, multiplayer,
lock/relaunch, minimum-device, auth and visual acceptance remain open.
No production rendering edit, deployment, merge or issue closure. Keep the
worktree active.

### Source phase timing follow-up

Safari UI access recovered. Advanced preferences explicitly showed “Show features
for web developers” unchecked (value 0) after restoration. No JavaScript profile
was obtained; no further Safari action is required from Val.

The existing render audit now partitions synchronous elapsed frame duration into
setup, community, trees, residents, interactions, players, reflections, debug,
pipeline submission and tail. Durations include clock/recording overhead and may
include blocking/descheduling; `cpuMs` retains its existing API name but is not
CPU execution time. They do not measure GPU completion. No scene, camera,
rendering quality, authority or input behavior is changed.

- Default production builds omit the audit. Vite mode `ios-probe` plus
  `?render-audit=1` exposes explicit `start()`, `stop()` and read-only `graphics()`.
- Diagnostic capture retains at most 7,200 frames; overflow is reported and stops
  clocks/allocations. DEV retains the existing 120,000-frame ceiling and crowd
  camera. The diagnostic build omits that camera control.
- Recording is dormant until `start()`. Resume resets the interval boundary and
  reports discontinuities; interrupted evidence must not pass sustained acceptance.
- Independent review identified overflow instrumentation and background-gap
  defects; both were reproduced in focused tests and corrected.
- Final `pnpm run verify` passed: tooling 96, preview 2,756 passed / 1 skipped,
  server 421 passed / 134 skipped, desktop 51, Python 141. Receipt:
  `.runtime/agent/core.json`; log `.runtime/ios-probe/core-phases-final.log`.
- `node --test preview/tests/render-audit.test.js`: 10 passed.
- `pnpm run build` and the explicit diagnostic build passed.
- `pnpm run test:experience render-audit`: passed in Chromium. Its report is
  `.runtime/ios-probe/render-audit-experience.json`. The journey includes a
  host-side 150-second deadline that closes a stalled page.
- `PLAYWRIGHT_BROWSERS_PATH=.runtime/ios-probe/browsers node experiments/ios-probe/verify-render-audit.mjs`:
  all three actual built-bundle cases passed in WebKit. Enabled capture contains
  29 frames with all phase durations finite and summing to total duration;
  stop/restart and camera exclusion passed. Receipt: `built-render-audit.json`.
  The initial failed harness used the landing page; normal production was
  corrected to `dist/preview/play/index.html` before the successful rerun.
- Independent final review found no remaining material issue. Production JS
  contains no audit API markers. These are functional tests, not phone timings.
- Project check exits 1 for unrelated ownership/lifecycle gaps. Native code is
  unchanged; prior native verification remains historical. Full Redis/browser,
  exact-head hosted CI and physical acceptance remain separate gates.

Build locally with:
`pnpm exec vite build --config preview/vite.config.js --mode ios-probe --outDir ../.runtime/ios-probe/diagnostic-build`.
The artifact currently uses this branch's historical scene baseline, not the
newer hosted scene; do not compare it as if only timing changed on the hosted SHA.
It is local only. No deployment or origin/auth configuration change is authorized
by these tests. A concrete hosted integration must be reviewed separately.

### Native phase capture integration

An explicit `--probe-render-phases` launch adds the fixed audit query at the same
allowed HTTPS origin and a **Phases** button. The unchanged production build
returns `unsupported`. On a diagnostic build, capture starts only with foreground
visibility, player/resident readiness and all assets complete without failures.
The native controller stops after approximately 30 seconds, with two-second
response deadlines checked both by timer and monotonic elapsed time. UUID and
navigation fences reject stale callbacks. Background, navigation, Stop, renderer
termination and evidence-write failure retire the capture.

A main-page adapter controls only the existing diagnostic API. Its output is
bounded to 7,200 numeric frame records and independently sanitized by Swift before
writing. It rejects overflow, missing phases, nonfinite/negative durations,
inconsistent phase totals and discontinuities. No credential, arbitrary page
object, script message handler or origin exception is introduced. The CLI reports
phase distributions separately from RAF scheduling and marks instrumented runs
ineligible for unprofiled acceptance.

Independent review found timer-delivery-only acceptance and a write-failure status
overwrite; both are corrected, with a monotonic-deadline regression. Focused Node
checks pass 26 tests; Swift checks pass 21. Built WebKit runs passed all three
cases, including actual adapter capture on the diagnostic bundle and explicit
unsupported results on normal production / missing query. Final Release simulator and development-signed device builds passed, with strict
codesign validation and byte equality for all three bundled diagnostic scripts.
`pnpm run verify` passed (tooling 96, preview 2,756 passed / 1 skipped, server 421
passed / 134 skipped, desktop 51, Python 141). Final independent review found no
remaining material blocker. The summary's no-RAF wording was clarified afterward
and all 26 focused Node tests reran successfully. Evidence: `phase-native-tests.log`,
`phase-simulator.log`, `phase-device.log`, `core-phase-capture.log`,
`built-render-audit.json` under `.runtime/ios-probe/`. The device build is explicitly
marked dirty; no installation or clean-source physical result is claimed.

Hosted source refresh at 15:47:27 UTC observed `index-Ch6g9oIx.js` SHA256
`7cd7ef5cdb2965d745697a09a45912fab0ee578bafb41222c9c16a2e93cc1b92`
and `debug-report-CU0K_xC9.js` SHA256
`10c28b3f6e06637319b9f93641708a2a573a4c51a8ba0e5c8500aeee0030a3ca`,
embedding source `dc65b40044b839796a717f16a71cd0396c553adb`. Both returned HTTP 200
with JavaScript content type. Earlier names changed and a subsequent request to
`debug-report-CflR3oM2.js` returned 404. This is public HTTP evidence, not a phone
byte hash or a reproduction of the earlier freeze. Preserve the fresh receipt
`phase-hosted-build-refresh.json`; the earlier `phase-hosted-build.json` could not
establish a source revision and must not be used as a matched-build claim.

No diagnostic hosting, account/origin change, native installation, physical phase
capture, merge or release occurred in this integration step. A matched source
baseline and concrete deployment proposal remain necessary before the next phone
measurement. The paired iPhone remains connected, but sustained foreground
availability is not inferred from connection state.

### Hosted baseline reconciliation

Integrated `dc65b40044b839796a717f16a71cd0396c553adb` (the observed hosted source)
into the isolated probe branch. No PR was merged and primary main was not changed
by this operation. It brings current username/sign-in, plaza, cycling and studio
work into the experiment without dropping the existing phase boundaries.

`pnpm run verify` passed after integration: tooling 102; preview 2,836 passed /
1 skipped; server 457 passed / 137 skipped; desktop 54; Python 141. The diagnostic
build and all three actual built WebKit cases also passed, including native
adapter capture. Receipts: `core-phase-main.log`, `diagnostic-main-build.log`,
`built-phase-main.log`, and `built-render-audit.json`. This supersedes the earlier
branch-baseline mismatch for the observed dc65b400 source; future hosted changes
still require fresh correlation.
