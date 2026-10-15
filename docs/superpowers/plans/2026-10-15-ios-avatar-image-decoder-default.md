# iOS resident avatar image decoder default

Objective: keep the normal iPhone Safari town route playable while retaining the
current glTF image decoder on desktop and Android. This is the production follow-up
to the scoped physical control in
[the Safari decoder investigation](2026-10-15-safari-gltf-decoder-investigation.md).

Task: `safari-gltf-decoder-investigation`, branch
`fix/safari-avatar-html-ios-20261015`. Owner:
`codex-root-safari-gltf-decoder-investigation-20261015`. Files owned:
`preview/src/avatars.js`, `preview/src/gltf-image-decoder.js`,
`preview/tests/gltf-image-decoder.test.js`, this ledger, the generated plan index,
and only this task's entry in the primary checkout's live task register.

## Evidence and decision

On physical iPhone 16 Pro Max, the fixture-only `phone-avatar-decoder=html`
control produced a visible city, a connected guest and a 25.25 s readiness
receipt. A later exact normal URL lost WebGL context at 22.58 s and showed
“Preview unavailable” at 25.80 s, with the guest disconnected. The phone used
Apple GPU at 440 × 796. Val also reported a normal tab visible and playable at
one point, but the later normal-mode receipts did not establish a durable ready
state. The control comparison implicates the resident avatar image decode path;
it does not prove a specific WebKit memory failure.

The production change selects Three.js `TextureLoader` for resident avatar glTF
images on iOS WebKit. The same loader selection was exercised by the scoped
physical control. Other glTF loaders and the document's `createImageBitmap`
remain unchanged. The fixture-only override remains available for diagnosis.

## Checks and results

- The new iOS avatar regression failed against the old loader: its glTF parser
  selected `ImageBitmapLoader`. The platform boundary test also failed because
  the selector did not exist.
- After the targeted change,
  `node --test preview/tests/gltf-image-decoder.test.js server/tests/phone-fixture.test.js`
  passed 11/11. The selector covers iPhone, iPad and desktop-mode touch iPad,
  while macOS Safari and Android stay on their existing path.
- `pnpm install --frozen-lockfile` and `uv sync --locked` completed;
  `pnpm run agent:doctor` passed.
- `pnpm run verify` passed the core profile. Receipt:
  ignored `.runtime/agent/core.json` in this worktree. This includes preview,
  server, desktop and Python tests, client build, demo checks and secret scan.
  It excludes physical GPU timing, Redis, browser experience journeys and human
  accessibility acceptance.
- After merging `origin/main` at `873f750e`, `pnpm run verify` passed again on
  the integration branch. The same ignored core receipt records this run.
- An isolated private fixture on port 5186 served this branch to the paired
  iPhone 16 Pro Max. The first `devicectl` Safari launch did not reach the
  fixture; a repeat launch did. Its normal URL had no decoder override. At
  25.14 s it reported Apple GPU at 440 × 796, 964 calls, 111 textures,
  88/102 assets with zero failures, both overlays hidden and zero bounded app
  or console errors. The authoritative town counted one guest and still did
  after another minute. Val confirmed “Town visible and playable” on the same
  5186 normal URL after 30 s. Receipt: ignored
  `.runtime/safari-avatar-ios-normal-ready-20261015.json` in this worktree.
  This is one paired startup success, not a stability or GPU timing pass.
- A second normal URL visit on the same patched branch added the fixture-only
  bounded frame reporter. At 26.66 s it again showed 88/102 assets with zero
  failures, both overlays hidden and one joined guest. Diagnostic receipts
  contained zero app and console errors. The five-second sample at 31.68 s
  had 54 frames with no overflow: 58 ms median interval, 234 ms p95,
  1044 ms maximum, and two intervals over 250 ms. CPU time p95 was 55 ms.
  The Mac load average was about 41–52 during this visit, so these intervals
  are diagnostic, not a controlled phone GPU acceptance result. Val confirmed
  “Town visible and playable” on this repeat's exact normal URL after 30 s.
  Receipt: ignored
  `.runtime/safari-avatar-ios-normal-repeat-20261015.json`.

## Open gates

- Collect a quieter frame sample before evaluating mobile pacing.
- Capture bounded phone frame and portal timing only after the normal route is
  stable. The five-device GPU matrix and human gallery review remain separate.
- Run the remaining verification gates, then land a reviewed PR with exact-head
  hosted `preview` and Vercel checks. Preserve the
  old fixture worktree and its ignored receipts until evidence is archived.

**Next action:** Run the browser experience journey and full gate, then verify
the PR's exact-head hosted checks against current main.
Phone portal and quieter frame timing remain open acceptance work.
