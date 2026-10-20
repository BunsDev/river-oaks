# TypeSafe Place iPhone probe

Disposable #285 experiment. It loads the actual hosted play entry in a restricted
WKWebView, collects local diagnostic timing/thermal/lifecycle records, and exposes
WebKit inspection. It is not the #286 production app or a TestFlight candidate.
No API keys, developer env files, fixture identities or native execution bridge
are bundled. The private local recording directory is the app's Documents folder.

## Build and test

From the repository root, with pnpm/uv dependencies installed:

```sh
node --test scripts/tests/ios-probe.test.js
swift test --package-path experiments/ios-probe
xcodegen generate --spec experiments/ios-probe/project.yml
xcodebuild -project experiments/ios-probe/TypeSafeProbe.xcodeproj \
  -scheme TypeSafeProbe -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .runtime/ios-probe/simulator CODE_SIGNING_ALLOWED=NO build
```

A device build uses the explicitly authorized development team. Set metadata from
this checkout; `sourceDirty=true` requires retaining the patch and app hash with
the run. Do not label a dirty build as a clean source revision.

```sh
xcodebuild -project experiments/ios-probe/TypeSafeProbe.xcodeproj \
  -scheme TypeSafeProbe -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath .runtime/ios-probe/device \
  DEVELOPMENT_TEAM=9LR8Z8UQ9X \
  PROBE_SOURCE_SHA="$(git rev-parse HEAD)" PROBE_SOURCE_DIRTY=true \
  -allowProvisioningUpdates build
codesign --verify --strict .runtime/ios-probe/device/Build/Products/Release-iphoneos/TypeSafeProbe.app
```

`-allowProvisioningUpdates` is authorized for this development probe only. This
creates no App Store submission. Generated Xcode/Swift build products are ignored.
Inspect the built Info.plist: bundle ID `ai.typesafe.place.ios-probe`, device family
`[1]`, ProbeEntry `https://typesafe.place/play`, actual ProbeConfiguration `Release`,
and correct ProbeSourceSHA/ProbeSourceDirty. AppDelegate uses a single window;
there is no generated empty scene manifest.

Install/launch using a device identifier obtained from `xcrun devicectl list devices`:

```sh
xcrun devicectl device install app --device "$PROBE_DEVICE" \
  .runtime/ios-probe/device/Build/Products/Release-iphoneos/TypeSafeProbe.app
xcrun devicectl device process launch --device "$PROBE_DEVICE" \
  --terminate-existing ai.typesafe.place.ios-probe
```

The recording starts on launch and ends after at most 30 minutes of active native
runtime, or with Stop. Returning after suspension also checks the deadline.
Reload marks a navigation within the same recording. Relaunch starts a new file;
existing files remain. A killed process leaves an explicitly unfinished recording.
A timed-out final drain is recorded as incomplete. Idle sleep is disabled only
while the recording is active; intentional locking/backgrounding remains possible.

Use an approved account. Email uses the unchanged hosted Turnstile/OTP path. The
required `about:blank`/`about:srcdoc` child frames are allowed; top-level origins
remain restricted. GitHub opens an ephemeral system authentication sheet, runs the
existing WorkOS device flow, and imports only a validated session cookie from the
existing server exchange. Pick GitHub in that sheet; other providers are rejected.
Canceling the sheet cancels polling. No credential value appears in probe logs.
Do not enable paid voice/inference or issue unapproved OTP sends for a benchmark.

## Collector control experiment

Launch with `--probe-native-only` after the bundle identifier in `devicectl device
process launch` to omit the injected collector and all periodic JavaScript reads.
Only sparse native navigation/auth/lifecycle events are written. The start record
names `measurementMode: native-only`; this run produces no scene timing. Compare
it with the same build's default mode before attributing a failure to the scene.
The native origin policy and login behavior remain identical.

For allocation diagnosis, append `--probe-block-characters`,
`--probe-block-landscape` or `--probe-block-materials`. These explicitly omit only
the selected same-origin asset directory using WebKit content rules. Multiple
groups can be combined; unknown block flags fail configuration. The toolbar and
start record identify the diagnostic run, and an `asset-isolation-applied` event
confirms the rule compiled before loading. Failure to compile prevents page load.
These runs omit required visual content and cannot count toward gameplay,
fidelity or architecture acceptance. Use them to locate an allocation class,
then verify any actual fix with every asset enabled. Auth routes and challenges
are outside the block patterns.

## Local WebKit check

```sh
pnpm exec playwright install webkit
node experiments/ios-probe/verify-webkit.mjs
```

The script takes the repository browser lock, uses the existing loopback browser
fixture with ordinary Bob, checks actual scene readiness and geometry, and saves
`.runtime/ios-probe/webkit.json`. Optional `/v1` calls receive fixture-unavailable
responses. The test does not change production identity, auth or rendering. This
is macOS WebKit evidence, not Safari on an iPhone or signed-device acceptance.

## Retrieve and summarize

Copy only Documents, never the entire app container (which contains login state):

```sh
mkdir -p .runtime/ios-probe/device-records
xcrun devicectl device copy from --device "$PROBE_DEVICE" \
  --domain-type appDataContainer --domain-identifier ai.typesafe.place.ios-probe \
  --source Documents --destination .runtime/ios-probe/device-records
node scripts/ios-probe.mjs .runtime/ios-probe/device-records/probe-RECORDING-ID.jsonl
```

Retain each original capture in a distinct directory when comparing runs. A
summary never marks architecture acceptance. Record source/app hash, hosted
content version, OS/device model, charging/ambient conditions, settings,
orientation, workload, actors, start/end and operator actions alongside it.

The sampler records raw foreground RAF intervals only while the scene's
`playerReady` marker is true. Intervals are **browser scheduling opportunities**,
not GPU durations or instrumentation of the game's render loop. Ready time is
measured from document navigation, not process launch. Native elapsed time and
navigation IDs distinguish reloads. Geometry/texture counts are object counts,
not bytes. Quality mode, scale and occlusion identify workload changes.

No page text, navigation URLs/queries, cookies, typed input, chat or provider
tokens are collected. Scene snapshots include up to eight strictly matched
`index-*.js` entry filenames from root-relative `/assets/` module scripts, so a
later public bundle lookup can correlate the loaded build without page content.
Filenames are correlation hints; their presence does not verify loaded bytes or
the hosted source revision. Missing filenames leave that correlation unavailable. WebContent/GPU memory is explicitly unavailable; collect it separately
with Instruments. Missing/overflowing/invalid samples and partial files cannot be
turned into a passing run. Resource timing is bounded and may omit cross-origin
transfer sizes; a zero size is not proof of no download. WebGL loss/restoration
counts support lifecycle diagnosis but do not prove automatic recovery.

## Safari comparison and remaining measurement

Open `https://typesafe.place/play` explicitly in Safari. The Browser button opens
the configured default browser, which is not necessarily Safari; identify the app
before labeling a comparison. Safari has its own login storage. Use Safari's device Web Inspector to load `Web/probe.js` in the main
page, then call `IOSProbe.install()`. At the end, evaluate
`JSON.stringify(__iosProbe.stop())` and save the result with device/workload
metadata. Injection starts after navigation, so this method does **not** measure
cold ready time; record that separately with Web Inspector/Instruments. It has no
native thermal reporter. Do not change User Agent mid-session.

Use actual Safari and WKWebView separately on each supported device. Record a
fixed route, repeated interiors, lock/resume and network transitions. Collect
render/GPU and combined app/WebContent memory using Instruments, with source-linked
raw traces; recording only the small native host process is insufficient. Keep
profiling overhead visible and compare an unprofiled run. Minimum-device,
multiplayer workload, human accessibility and production-distribution evidence
remain open until actually exercised.

For asset-isolation diagnostics, add `--probe-scene-snapshot` to explicitly opt
into one sanitized DOM telemetry read 20 seconds after each completed navigation.
This can accompany `--probe-native-only`; it does not install the RAF collector.
The start record identifies the option, and `scene-snapshot` contains only
whitelisted numeric render/pipeline/landscape/resident counters and readiness
booleans. Missing telemetry stays absent. A missing snapshot does not prove an
empty scene, and these reduced-content trials cannot satisfy acceptance.

Narrower alternatives are `--probe-block-standard-rigs` (the six exact
`woman-{casual,tailored,daywear}.glb` / `man-{casual,tailored,workwear}.glb` files)
and `--probe-block-special-rigs` (`jevica.glb` / `prince-jev.glb`). These leave
portraits, reference images and other models untouched. They are asset groups,
not an NPC/player split: player appearances can use either group. Camera and
automatic render scale may diverge after a failed player load; record that limit.

## Decoder controls

Two explicit, mutually exclusive experiments keep all asset URLs and render
settings unchanged:

- `--probe-serialize-decodes` queues the main page's immutable Blob
  `createImageBitmap` calls one at a time. Plain option values are captured at
  invocation; mutable sources, cropped overloads and exotic options use the
  original API immediately. This is a scheduling hypothesis, not a production fix.
- `--probe-html-images` makes `createImageBitmap` unavailable in the main page
  before modules load, selecting Three's existing `TextureLoader`/HTML image
  fallback. The feature override is document-local, not a changed User Agent.
  Color/alpha equivalence, other library compatibility and memory benefit require
  separate validation before any production proposal.

Both flags appear in start metadata and invalidate unchanged-baseline acceptance.
With `--probe-scene-snapshot`, decoder experiments read numeric scene telemetry at
2 and20seconds after navigation, with Stop/navigation/termination fences. Serialized
decode counters identify support, queue activity and cumulative RGBA output-size
estimates. Those estimates are not measured memory or retained allocations.
`--probe-native-only` suppresses the RAF collector, but these explicit decoder
flags still inject their treatment in the main page. Default launches inject none
of these decoder changes.

Local full-scene checks use the existing loopback fixture and browser queue:
`node experiments/ios-probe/verify-webkit.mjs --serialize-decodes` or
`--html-images`. They require all store residents and the player to load without
page errors. macOS WebKit success is not physical iPhone acceptance.

The local `verify-webkit.mjs --html-images` check requires all residents and assets,
zero asset failures, observed decoder state, and no unexpected console/page errors.
Only HTTP 503 console errors whose exact URL was explicitly refused by this
harness's optional `/v1` route count as expected fixture errors; URLs are not saved.

`node experiments/ios-probe/verify-image-parity.mjs` compares the six shipped
standard rigs' embedded images using both Canvas2D and raw WebGL2 RGBA8 uploads.
It uses original authenticated fixture bytes, no resize, and a 60-second deadline
per rig. The receipt distinguishes GPU equality from Canvas equality; neither is
full material/shader or physical-device visual acceptance. Each image releases its
bitmap, object URL and canvas; each rig releases its GPU resources. Use
`PLAYWRIGHT_BROWSERS_PATH=.runtime/ios-probe/browsers` if browsers were installed
in the probe's isolated cache. Both harnesses honor the shared browser lock.

### Bounded source phase timing

The ordinary production build omits this API. Build a separate diagnostic artifact:

```sh
pnpm run build
pnpm exec vite build --config preview/vite.config.js --mode ios-probe --outDir ../.runtime/ios-probe/diagnostic-build
node experiments/ios-probe/package-hosted-diagnostic.mjs
PLAYWRIGHT_BROWSERS_PATH=.runtime/ios-probe/browsers node experiments/ios-probe/verify-render-audit.mjs
pnpm run test:experience render-audit
```

Only the diagnostic artifact with `?render-audit=1` exposes
`window.__riverRenderAudit.start()`, `.stop()` and read-only `.graphics()`.
Start once the full scene is ready; stop after the intended trace window. Save
start/end graphics, content readiness, camera/workload and concurrent native trace
identity. No camera control is exposed in the diagnostic build. The development
capacity harness retains its existing crowd camera.

Each frame includes the existing `intervalMs`/`cpuMs` and numeric `phasesMs` for
setup, community, trees, residents, interactions, players, reflections, debug,
pipeline and tail. `cpuMs` is the legacy field name for synchronous elapsed time,
including instrumentation, blocking and descheduling; it is not CPU execution or
GPU completion. The diagnostic buffer retains at most 7,200 frames and stops
recording with `overflow: true` when exceeded. Any overflow invalidates the sample.
Resume clears the interval boundary and records `discontinuities`; such a sample
cannot prove uninterrupted foreground acceptance. Timings remain dormant until
explicitly started and after stopping.

The built verification serves generated bundles only inside the existing offline
loopback fixture, requiring the real scene's assets and residents. It checks normal
production with the query, diagnostics without it, enabled timing, and the packaged
`/ios-probe/` entry with timing. Normal
production uses `dist/preview/play/index.html` because the build's root index is
the landing page. Both harnesses honor the browser queue and bound each journey to
150 seconds. Results are local functional evidence, not physical performance.
The artifact has not been deployed; hosting/origin/auth integration requires a
separate concrete review and deployment authorization.

Launch with `--probe-render-phases` to add the native **Phases** button and the
separate `/ios-probe/?render-audit=1` entry on the existing HTTPS play origin. This does not enable
timing in an ordinary hosted production build: the button reports `unsupported`
until an explicitly built diagnostic client is hosted. Default launches omit the
adapter and button. The Browser button continues to open the ordinary play entry.

After the entire scene is ready, tap **Phases** once to record approximately
30 seconds. Start/stop replies each have a two-second timer plus a monotonic
elapsed-time fence; late callbacks cannot become evidence if timer delivery was
delayed. Navigation, background, Stop, renderer termination and write failure
cancel the capture. A per-capture owner token prevents an old callback from
stopping or draining a newer capture. JavaScript and Swift independently retain
only fixed statuses and bounded finite numeric phase records, never arbitrary
main-page objects. There is no page-to-native message handler.

Use the ordinary RAF collector and `--probe-scene-snapshot` alongside phase capture
to retain quality/content and entry-file correlation, plus an external run record
of camera/workload, exact hosted artifact and concurrent Metal trace. Phase timing
adds overhead and cannot pass unprofiled thermal/performance acceptance. The JSONL
contains `phase-capture-start`, `phase-capture`, cancellation or unavailable events.
The summary reports per-capture phase distributions, elapsed duration and covered
frame intervals separately from RAF statistics, without claiming GPU completion.

### Prepare the hosted diagnostic entry

The packager adds `/ios-probe/index.html` and new hashed JS/CSS to the ordinary
build. All generated game chunks stay under `/assets/`, where the existing
WorkOS/waitlist asset gate applies. Normal `/play/index.html`, the landing page,
existing assets, middleware, server routes and deployment configuration remain
unchanged by packaging. Conflicting filenames and destination directory links
fail before writes; identical files make reruns idempotent.

```sh
node --test experiments/ios-probe/package-hosted-diagnostic.test.mjs
node experiments/ios-probe/package-hosted-diagnostic.mjs --config
```

The second command writes an ignored alternate Vercel configuration at
`.runtime/ios-probe/vercel-diagnostic.json`. It changes only `buildCommand` to
build normal production, build diagnostic mode separately, then package the new
entry. It does not deploy. The normal `vercel.json` and ordinary Git deployment
remain unchanged. Vercel's `--local-config` option selects this prepared file
for an explicitly authorized deployment.

Deployment is a full-site operation, even though packaging only adds diagnostic
files. Before requesting execution, record the source SHA, normal/diagnostic
hash receipt, tests and independent review. Before execution, refresh the current
production source/deployment and reconcile any newer main changes with verification;
never promote an older baseline over unrelated production changes. The intended
project is `river-oaks` in scope `0xbuns`, retaining `https://typesafe.place` and
existing authentication/environment/DNS settings. No deployment is authorized by
this README or by development signing permission.

After authorized deployment, verify the `/ios-probe/` entry, ordinary `/play`,
signed-out protected-asset refusal and source/hash correlation before installing
and measuring the phase-enabled native probe. An ordinary deployment removes the
extra diagnostic entry. Record that cleanup plan; rollback of a previous full
site deployment can revert concurrent work and requires its own explicit scope.
Do not describe local fixture tests as hosted authentication or physical evidence.
