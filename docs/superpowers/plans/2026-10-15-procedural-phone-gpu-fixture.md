# Procedural gallery phone GPU fixture

## Objective

Allow a physical iPhone Safari browser on Val's private Wi-Fi to reach the
generated gallery acceptance fixture, join as one synthetic guest, and inspect
render timing without changing production authentication or server authority.
This enables the phone row in the [GPU matrix](2026-10-14-procedural-gpu-acceptance.md);
it does not constitute a device result by itself.

## Ownership

- Task: `procedural-phone-gpu-fixture`
- Branch: `test/procedural-phone-gpu-fixture-20261015`
- Files: `server/tests/browser-fixture.js`, `server/tests/phone-fixture-host.js`,
  `server/tests/phone-fixture-decoder.js`, `server/tests/phone-fixture.test.js`,
  `preview/e2e/world-publish.js` (revision readiness wait), the GPU matrix
  plan, this ledger, and
  the generated plans index.

## Changes and checks

- An explicit `RIVER_OAKS_PHONE_FIXTURE_HOST` accepts one loopback, RFC1918, or
  Tailscale IPv4 address and rejects public, wildcard, and DNS hosts. The town
  continues to listen only on `127.0.0.1`.
- Only phone mode issues a synthetic guest cookie on `/auth/session`. The
  regular browser fixture's anonymous entry remains unauthenticated. The HTTP
  ticket and WebSocket still use their existing origin and CSRF gates.
- `?phone-decoder=html` is a phone-fixture-only diagnostic. It disables
  `createImageBitmap` before application modules, causing Three.js to use its
  HTML image fallback for glTF textures. Ordinary fixture visits and all
  production builds retain their normal decoder. This mirrors the control in
  open iOS probe PR #309; its prior physical result is a hypothesis for this
  Safari failure, not proof that the two failures share a cause.
- Focused test: `node --test server/tests/phone-fixture.test.js` passed 3/3,
  including actual HTTP session, rejected origin/CSRF, and authenticated
  WebSocket snapshot.
- After adding the decoder control, the focused test passed 4/4. Its new case
  fetches real Vite HTML, executes the injected script, and checks that normal
  phone and ordinary desktop fixtures omit it. The private LAN server served
  the diagnostic script on `10.0.0.152:5180`.
- The phone-controlled page joined as a guest in local macOS Playwright WebKit
  at 390×844 CSS pixels: `html-images` observed, `createImageBitmap` absent,
  Apple GPU, 780×1688 drawing buffer, 1,118 calls, 4,321,880 triangles,
  223 geometries and 89 textures. This does not prove physical iPhone behavior.
- `pnpm run project:check --tasks <primary>/docs/project-management/tasks.json`
  found no gap for this phone task. It exits 1 on unrelated expired iOS and
  dominoes leases and pending Studio prompt worktree retirement.
- `pnpm run test:server` passed: 503 passed, 0 failed, 141 skipped.
- `pnpm run test:shared development-publish` passed its three journeys:
  `world-publish`, `creator-generated-levels`, and `creator-four-levels`.
- `pnpm run plans:index --check` passed after regenerating the index.
- `pnpm run verify` passed; receipt `.runtime/agent/core.json`.
- After the decoder change, `pnpm run verify` passed again: tooling 109/109,
  preview 3,052 passed/1 skipped, server 512 passed/144 skipped, desktop 69/69,
  Python 141/141. Receipt `.runtime/agent/core.json`.
- The new full gate passed core, Redis server checks, dependency audit, security
  browser, WebGL reflection, and ten experience journeys, then failed the
  shared `world-publish` assertion that the map follows an applied revision.
  The test waited for a truthy region hash and the unchanged world title, both
  of which can precede the new map data. It now waits for the server's exact
  region hash and the new map marker before asserting. The failed full run was
  interrupted after it passed the next nine shared journeys and stalled in
  `resident-names`; `.runtime/agent/full.json` records failure. This change
  still needs a focused rerun and a completed full gate. The first focused
  rerun confirmed that `Revised Moon Arch` reached the SVG map, but Playwright
  timed out because `<title>` is hidden and `waitFor` defaults to visible.
  The wait now uses `state: 'attached'`; the targeted
  `RIVER_OAKS_SHARED_JOURNEY=world-publish pnpm run test:shared development-publish`
  passed with this correction.
- `pnpm run verify` passed after the `world-publish` correction; receipt
  `.runtime/agent/core.json`, log
  `.runtime/procedural-phone-gpu-fixture/core-final.log`. The browser-generated
  `data/reports/experience.json` and `data/reports/shared-experience.json`
  were restored after this run.
- `REDIS_URL=redis://127.0.0.1:16389 pnpm run verify full` passed; receipt
  `.runtime/agent/full.json`. Its disposable loopback Redis was stopped.
- Private-interface smoke: `curl` returned HTTP 200 from `10.0.0.152:5180`
  while the phone fixture ran; this confirms Mac-side binding, not phone reachability.
- Val opened the LAN URL in iPhone Safari: the page loaded, but the guest did not
  join. This is a failed phone fixture check, not a GPU measurement. Mac-side
  requests through the same private address returned an authenticated guest,
  approved waitlist, a ticket, and a WebSocket snapshot. Safari's Console and
  visible access-gate state are needed to localize the phone-side failure. Vite
  logged an unhandled page script error about a missing `og:type` meta element;
  its source and relationship to the join failure are not established. The
  proxy later logged `read ECONNRESET` for a WebSocket; that can also occur on
  a reload and is not proof of a server-side rejection.
- On an unused iOS 26.5 iPhone 16 Pro simulator, the first cold visit showed
  “Connecting to the town…” for over 20 seconds. A later warm reload joined
  and rendered the district; after temporary tracing was removed, the normal
  fixture also joined on the simulator. The trace showed 200 for session,
  waitlist and ticket, followed by a WebSocket upgrade. These are simulator
  debugging results, not physical phone GPU acceptance. The simulator was
  shut down before asking Val for a quiet physical Safari reload.
- Val's quiet physical iPhone reload showed Safari's “a problem repeatedly
  occurred” page crash, and the same message appeared on a second reload
  during paired-device log capture. The visible failure is a WebContent crash
  before the guest joined; no HTTP or WebSocket refusal was established. The
  log recorded a memory pressure event for WebContent PID 85781 at about
  23:28:59 local time and
  roughly 332 MB resident memory; that process was absent from the subsequent
  running-process list. The exact termination reason is still unconfirmed.
  Neither reload is a GPU timing result.
- Val then opened `http://10.0.0.152:5180/?phone-decoder=html` on the same
  physical iPhone and reported “Town joins.” The fixture health endpoint showed
  one connected player. This isolates a working HTML-image decoder control with
  normal AO still enabled; the default route had crashed on prior reloads.
  It is diagnostic evidence, not a production decoder change or a measured GPU
  matrix result. The `?ao=off` control and Web Inspector timings remain pending.
- Integrated `origin/main` at `c1cfd584` after PR #390 landed. The sole
  content conflict was the generated plans index; regenerating it from the
  merged task register retained the phone task, the retired GPU harness, and
  the office computer task. On this integrated tree, the focused phone test
  passed 3/3, `pnpm run verify` passed (`.runtime/agent/core.json`), and
  `REDIS_URL=redis://127.0.0.1:16389 pnpm run verify full` passed
  (`.runtime/agent/full.json`). The isolated Redis service was stopped.
- Integrated subsequent `main` heads `a714a8a5` and `cede4d1c` with signed
  merge commits, regenerated the plans index, and passed the focused desktop
  checks and core verification after each integration. PR #393's hosted Verify
  run 38680848494 passed the aggregate `preview` check at exact head
  `4161fc936a61b1aabee73f67e56e57f189b7e6cb`.

## Gaps and next step

Finish the revised `world-publish` browser check and full gate. Compare the
physical iPhone's `?ao=off` control with the joined HTML-image visit, then
diagnose the default decoder crash before changing production decoding or
render quality. Capture Web Inspector measurements on the phone. Keep PR #393
in draft while the phone fixture and checks are being verified, and recheck
exact-head hosted `preview` after any new commit before landing. Record actual
device results in the GPU matrix only when captured on the phone.
