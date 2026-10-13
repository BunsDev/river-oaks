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
