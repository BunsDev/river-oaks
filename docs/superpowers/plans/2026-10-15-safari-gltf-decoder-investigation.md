# Physical Safari glTF decoder investigation

Objective: identify whether the iPhone Safari startup failure blocking the
procedural gallery GPU matrix comes from avatar glTF image decoding, before
changing the production loading policy.

Task: `safari-gltf-decoder-investigation`. Branch:
`test/safari-phone-error-receipt-20261015` in the existing diagnostic sibling
worktree. The prior frame-receipt branch
`test/safari-phone-frame-receipt-20261015` delivered PR #409. The first diagnostic branch
`test/safari-gltf-decoder-investigation-20261015` delivered PR #401, merged at `67388f8dd894601833366d8d355e7e8d20726809`
on 2026-10-15. Files owned: the avatar loader, a small glTF decoder-selection helper
and its focused test, the phone fixture's test-only control and regression, this ledger, and
this task's register entry. The separate iOS probe #309 worktree has dirty work
owned by another session and is preserved untouched.

## Evidence before this experiment

- On the physical iPhone 16 Pro Max, the ordinary fixture and `?ao=off` both
  caused Safari's “a problem repeatedly occurred” page before guest join.
- The same phone joined with the fixture-only `?phone-decoder=html` control,
  which makes `createImageBitmap` unavailable before app modules load. A second
  visit against merged main `9d83cd31` joined again; the authoritative fixture
  reported one player, but Web Inspector was disabled on the device, so no
  renderer or timing sample was captured.
- The iOS probe's native same-binary comparison also survived with HTML image
  decoding and terminated with the default decoder. Its sampled WebContent
  footprint and parity checks are recorded in #309; those are not a proven
  jetsam reason or production performance acceptance.
- Three.js `0.186.1` creates `ImageBitmapLoader` in each `GLTFParser` when
  `createImageBitmap` exists on Safari 17+. `GLTFLoader.register` callbacks run
  after parser construction and before texture dependencies load. The browser
  source has five glTF loader sites; the standard resident rigs use the loader
  in `preview/src/avatars.js`.

## Single hypothesis and controls

Hypothesis: ImageBitmap decoding of the standard avatar glTF textures is the
necessary trigger for this fixture's Safari startup termination. A test-only
URL control will switch **only** the avatar `GLTFLoader` to `TextureLoader` while
leaving `createImageBitmap`, every other glTF loader, AO, geometry, and the
normal page untouched. If that control joins where the normal page crashes,
the avatar decode path is implicated. If it crashes, investigate other glTF
assets or concurrent allocations without stacking speculative fixes.

First verify a focused test proves the parser chooses the expected loader only
under the control. Then compare normal, avatar-only, and global HTML controls
on the same physical phone using the isolated fixture. Record fixture health,
asset readiness, WebContent process identity and exact source revision.

## Results

- `node --test preview/tests/gltf-image-decoder.test.js` first failed because
  the scoped loader did not exist. After the helper was added, it passed and
  proved a glTF parser selects `TextureLoader` only under the control without
  replacing the document's `createImageBitmap` function. The avatar integration
  assertion then failed against the unchanged avatar loader, passed after its
  one-line factory call, and the combined focused suites passed 6/6.
- On the same physical iPhone and private fixture at port 5184, the ordinary
  URL did not join after 35 seconds (`/health` players 0). The avatar-only URL
  joined within about 20 seconds and still had one authoritative player after
  another 45 seconds. This is server-side join evidence; the phone's visual
  state and full asset readiness are not yet confirmed.
- The global `?phone-decoder=html` control, visited next on that fixture, did
  not join after 40 seconds. Vite forwarded 14 `THREE.GLTFLoader: Couldn't load
  texture blob:...` console errors during this visit. The same global control
  had joined in earlier physical visits, so this run shows that the fallback
  outcome varies with visit conditions; it cannot be treated as a reliable
  production remedy or a direct performance comparison.
- The fixture was stopped normally. No normal-route browser screenshot,
  WebContent termination reason, asset count, texture parity, or GPU timing was
  captured. The client Web Inspector remains unavailable until enabled on the
  device. The production decoder is unchanged on this branch.
- Val confirmed that the avatar-only page from the first visit still showed a
  loading message. Server join alone therefore did not establish a working
  view. A new fixture-only, opt-in report now sends bounded asset, loading,
  renderer and render-call data back to the private fixture at 5 and 25 seconds.
  Its focused test passed with the decoder tests (7/7); it is absent from the
  ordinary fixture and production build.
- On a fresh avatar-only visit to that same physical phone at port 5184 with
  `phone-report=1`, the fixture reported one joined player. The 25-second
  report showed `Apple GPU`, viewport 440 × 796, 964 render calls, 107
  textures, assets 88/102 with zero failures, and the in-app loading overlay
  hidden. Its first scheduled report ran at 11.4 seconds, with assets 43/66
  and 28 render calls. Val later answered “Town visible,” but could not tell
  whether she saw this URL or the later normal URL. No single visit therefore
  has both confirmed visual and telemetry evidence. The earlier loading-message
  observation remains a distinct failed visit.
- `uv sync --locked`, `pnpm run agent:doctor`, the focused decoder and phone
  fixture suites (7/7), `pnpm run plans:index --check`, and `pnpm run verify`
  passed. The core receipt is `.runtime/agent/core.json`. Project check
  against the primary live task register reported four unrelated ownership
  and retirement gaps, none for this task.
- A same-fixture normal decoder visit reported Apple GPU and 1,140 render
  calls at 25.8 seconds, but its in-app loading panel said “Preview
  unavailable,” assets were only 75/102 with no loading-manager failure, and
  the authoritative town had zero players. That is an app startup failure,
  despite a live WebGL context. A repeat normal visit after extending the
  reporter to include the loading message sent two early reports around
  11 seconds: assets 7/66 and 8/72, the panel still said “Laying the stone
  and lighting the sky…,” and render calls stayed at 28. Neither page sent
  its 25-second report; the town still had zero players after another 22
  seconds. The raw repeat records are in ignored
  `.runtime/safari-gltf-decoder-investigation/normal-control-20261015.json`.
  We did not obtain the fatal WebKit exception or prove that avatar textures
  alone caused the failure.
- Safari's developer menu on the Mac was restored to its original off state
  and confirmed in Safari Settings. The physical phone still has no Web
  Inspector connection for an exact exception or bounded GPU frame sample.
- The earlier “Connecting to the town…” wording is rendered by
  `preview/src/multiplayer-client.js` in `.multiplayer-gate`, independently of
  the `#loading` scene overlay. The fixture report now includes the gate's
  visible state and bounded status text. Its focused regression failed before
  this addition and passed afterward (7/7 combined). A fresh physical scoped
  launch sent no report and never joined (`/health` players 0) after 50
  seconds; it adds no renderer or gate evidence. The fixture was stopped.
  `pnpm run verify` passed again after this change, with the updated core
  receipt at `.runtime/agent/core.json`.
- `REDIS_URL=redis://127.0.0.1:16621 pnpm run verify full` reached the Redis
  server suite after dependency audit and preview tests (3094 pass, one skip),
  then failed one unchanged voice lease deadline assertion under concurrent
  machine load: `server/tests/voice-reconcile.test.js:100`, expected zero
  leases but observed one. The exact Redis-backed test file passed 6/6 when
  rerun alone. Full browser coverage, secret history and hosted preview did
  not run because the full gate stopped there; `.runtime/agent/full.json`
  records the failure. A green full gate is still outstanding.
- A full retry with the same isolated Redis service reached the server suite
  and failed a different unchanged transport deadline:
  `server/tests/offices-transport.test.js:30`, “Office command timed out.”
  The exact file then passed 2/2 alone with Redis. The latest
  `.runtime/agent/full.json` and ignored
  `.runtime/safari-gltf-decoder-investigation/full-gate-retry.log` record this
  run. Browser coverage still did not start locally. A third full run should
  wait for the other active machine verification to finish.
- On a later controlled physical iPhone visit, `devicectl` launched the exact
  private fixture URL
  `http://10.0.0.152:5184/?phone-avatar-decoder=html&phone-report=1&render-audit=1&motion-debug=1`.
  Val stayed on that tab and answered “Town visible and playable” after 30
  seconds. Its paired fixture reports showed, at 5.35 seconds, 3/14 assets,
  zero failures, the scene overlay and connection gate visible, Apple GPU,
  440 × 796 viewport, and zero render calls. At 25.52 seconds, they showed
  88/102 assets, zero failures, both overlays hidden, 955 render calls and
  98 textures. The authoritative town reported one player. This confirms
  visible play and matching telemetry for this scoped control on this visit;
  it does not establish normal-decoder recovery, frame pacing or a WebKit
  failure cause. The earlier loading-message visit remains a distinct failure.
  The raw reports are saved in ignored
  `.runtime/safari-gltf-decoder-investigation/scoped-control-confirmed-20261015.json`
  in this worktree.
- The private phone fixture now accepts an additional explicit
  `?phone-frame-report=1&render-audit=1` control. It waits for both scene and
  connection overlays to clear, captures five seconds through the existing
  render audit, and stores at most 1,200 interval/CPU pairs plus its overflow
  flag in `/__phone_readiness`. It does not run in the ordinary fixture or a
  production build. The focused decoder and fixture suites passed 8/8,
  including a VM-driven readiness transition, receipt round trip, and invalid
  frame rejection. No physical frame receipt has been captured yet.
- `pnpm run verify` passed after the frame-report change; the core receipt is
  `.runtime/agent/core.json`. The host still had a concurrent full gate and
  load averages above 250, so a physical frame-time run at this moment would
  be confounded by host load.
- Signed PR #409 reached reviewed head
  `5605c1cd8d5484ccd1c36a35271711047e49edb9`; all 16 hosted check
  runs and the Vercel status passed. It merged through the REST endpoint at
  `cc7f5561e925a4976692ce91bcfc7900ee4f9655` on 2026-10-15
  08:47:09 UTC. Its physical frame receipt was pending at merge.
- A new physical iPhone launch at the exact scoped URL plus
  `phone-frame-report=1` sent two readiness reports and a five-second frame
  sample. At 25.52 seconds, the scene and connection overlays were hidden,
  Apple GPU reported 964 calls and 98 textures, assets were 88/102 with zero
  failures, and the authoritative town had one player. The sample at 30.26
  seconds contained 55 intervals, no overflow, 61 ms median, 265 ms p95,
  542 ms maximum, CPU p95 33 ms and four intervals over 250 ms. The Mac host
  load average was about 158 during collection and the guest later
  disconnected. Val's visible-state confirmation for this specific visit is
  pending. This is a diagnostic receipt, not a valid performance acceptance
  result. Raw data:
  `.runtime/safari-gltf-decoder-investigation/scoped-frame-sample-20261015.json`.
- A subsequent normal-decoder launch at the same fixture with readiness and
  frame reporting sent one early report at 10.50 seconds: assets 7/66, both
  overlays visible, 28 render calls, 25 textures and Apple GPU. Safari also
  reloaded an older avatar-control tab, which sent its own early report
  (assets 2/7, viewport 300 × 150). Neither tab sent a 25-second report or
  frame sample, and the authoritative town had zero players after 60 seconds.
  Host load average reached about 343. This attempt does not isolate a
  default-decoder cause because two tabs and high host load confound it. Raw
  records: `.runtime/safari-gltf-decoder-investigation/default-control-20261015.json`.
- CoreDevice's `systemCrashLogs` inventory exposed no same-time WebKit,
  Safari or Jetsam file for the 08:49–08:54 UTC visits. The latest visible
  WebContent entry was a CPU-resource report at 00:30 local time; this absence
  does not prove Safari avoided a process termination. The installed
  `idevicesyslog` could not identify the paired iPhone, so it did not provide
  a live error stream.
- The private fixture's next opt-in control `?phone-errors=1` now imports the
  app's existing redacted diagnostic collector and reports only four recent
  error, console and network summaries at 5, 15 and 25 seconds. It does not
  alter the decoder or production build. The focused decoder and fixture
  suites passed 9/9. `pnpm run verify` passed after this change and the
  generated plan index update; `.runtime/agent/core.json` is the receipt.
  A physical error receipt is pending.
- Signed PR #411 reached ready head `b3baa60cf142ffa107fdb6d625d9c7ff45973467`
  after #402 merged. All hosted check runs and Vercel status passed at that head.
  A Chromium smoke of the full town page captured the diagnostic collector and
  a successful fixture POST, but the test ended before the busy page's GET
  observed the stored report. A narrower browser smoke loaded the real
  injected module and collector without starting the town; its five-second
  receipt was stored with the synthetic console error (one report, console
  one entry, POST 204). Temporary tracing markers were removed; source matches
  the reviewed head. This proves the fixture reporter path, not physical
  Safari delivery or default-decoder recovery.

- PR #411 merged at `dda596c58477e646ea6ae636eba9ca708562b2a6` on 2026-10-15 10:13:05 UTC from signed head `4559778b4f3e48c4d73d25e73668c93accd1ba35`. The reviewed head had 16/16 hosted check runs complete with required aggregate `preview` and Vercel green; the local core gate and focused tests 9/9 passed after both main refreshes. There were no review comments or pending review threads.
- A physical iPhone 16 Pro Max visit to the exact merged-source private fixture URL `?phone-avatar-decoder=html&phone-report=1&phone-errors=1&render-audit=1&motion-debug=1` produced a 25.26-second readiness report: Apple GPU, 440 × 796 viewport, 964 calls, 110 textures, assets 92/102 with zero failures, both scene and connection overlays hidden. The diagnostic receipts arrived at about 11.2, 21.9 and 25.2 seconds, with zero app errors and zero console errors; the bounded network summaries included slow successful loads and 403 provider settings responses. The authoritative town had one connected guest. Val confirmed “Town visible and playable” on this same URL after 30 seconds. Mac host load was about 6–24 during collection. This proves physical delivery of the scoped reporter and playable avatar-only control; it does not prove default-decoder recovery or phone GPU pacing. Raw receipt: ignored `.runtime/safari-gltf-decoder-investigation/scoped-error-sample-20261015.json` in this worktree. The fixture was stopped.
- At unchanged code head `4559778b4f3e48c4d73d25e73668c93accd1ba35` (only this ledger dirty), `REDIS_URL=redis://127.0.0.1:16621 pnpm run verify full` passed from 10:21:45 to 11:00:28 UTC with an isolated loopback Redis service, then Redis was stopped. All 17 profile tasks passed, including Redis server tests (762/762), security browser, reflections, experience journeys, and shared multiplayer/creator four-level journeys. Preview tests were 3,177 pass, one skip and one TODO; the TODO is IPIC lounge circulation at 1.005 m against a 1.01 m target, so that clearance is not verified. The demo verifier's exit 2 was the profile's expected blocked fixture result. Receipt: ignored `.runtime/agent/full.json`; log: ignored `.runtime/safari-gltf-decoder-investigation/full-gate-final-20261015.log`. This full gate does not cover the physical GPU matrix or human accessibility review.
- The live task register records #401, #409 and #411 as merged evidence and has no current `pr`, because the investigation remains active after those deliveries. `pnpm run project:check --github` no longer reports Safari-specific gaps. It still exits nonzero for other tasks’ ownership and retirement gaps. Ignored receipts remain in this worktree; preserve it until the normal-decoder investigation and archive review are complete.
- PR #421 published this evidence ledger and the generated plan index. Its reviewed head `57445dfd21d4ca5af10c16d394e0164cde40ffbe` passed all 15 hosted checks, including aggregate `preview`, and Vercel; GitHub REST merged it at `ff24fdcd40ba20025a2a4ebfad2a23e4361d8ccd` on 2026-10-15 11:30:10 UTC. The live task register has the merge evidence and keeps the investigation active.
- A fresh normal-decoder fixture was started on private port 5185 with authoritative town on loopback 8793. `devicectl` reported a successful Safari launch of `?phone-report=1&phone-errors=1&render-audit=1&motion-debug=1` on the paired iPhone, but over two minutes the fixture had zero readiness reports and zero guests; connection samples showed only the listening server. This attempt does not establish a page-render or decoder outcome; Val's visible-screen report is pending. Both phone fixtures were stopped.

**Next action:** Confirm the iPhone's visible Safari screen and make one
normal-decoder visit to the isolated port 5185 fixture, collecting bounded
readiness and error receipts. The WebKit failure cause, physical GPU matrix and
broader archetype rollout remain open; keep the scoped decoder helper
experimental.
