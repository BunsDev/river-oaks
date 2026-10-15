# Physical Safari glTF decoder investigation

Objective: identify whether the iPhone Safari startup failure blocking the
procedural gallery GPU matrix comes from avatar glTF image decoding, before
changing the production loading policy.

Task: `safari-gltf-decoder-investigation`. Branch:
`test/safari-gltf-decoder-investigation-20261015` in the sibling worktree of the
same name. Draft PR #401 contains signed diagnostic commit `7b5a921f`;
hosted checks are in progress. Files owned: the avatar loader, a small glTF decoder-selection helper
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
  and 28 render calls. Val later answered “Town visible” to the question about
  this visit, after Safari had been switched to the normal URL. Which page she
  saw is being confirmed. The earlier loading-message observation remains a
  distinct failed visit.
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
- `REDIS_URL=redis://127.0.0.1:16621 pnpm run verify full` reached the Redis
  server suite after dependency audit and preview tests (3094 pass, one skip),
  then failed one unchanged voice lease deadline assertion under concurrent
  machine load: `server/tests/voice-reconcile.test.js:100`, expected zero
  leases but observed one. The exact Redis-backed test file passed 6/6 when
  rerun alone. Full browser coverage, secret history and hosted preview did
  not run because the full gate stopped there; `.runtime/agent/full.json`
  records the failure. A green full gate is still outstanding.

**Next action:** Pin Val's visible-town observation to the exact phone URL
and obtain the normal route's WebKit exception. Keep the scoped
decoder helper experimental until the cause is demonstrated; the physical
default-decoder GPU row and broader archetype rollout remain open.
