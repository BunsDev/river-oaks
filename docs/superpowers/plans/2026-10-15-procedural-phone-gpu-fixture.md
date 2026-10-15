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
  `server/tests/phone-fixture.test.js`, the GPU matrix plan, this ledger, and
  the generated plans index.

## Changes and checks

- An explicit `RIVER_OAKS_PHONE_FIXTURE_HOST` accepts one loopback, RFC1918, or
  Tailscale IPv4 address and rejects public, wildcard, and DNS hosts. The town
  continues to listen only on `127.0.0.1`.
- Only phone mode issues a synthetic guest cookie on `/auth/session`. The
  regular browser fixture's anonymous entry remains unauthenticated. The HTTP
  ticket and WebSocket still use their existing origin and CSRF gates.
- Focused test: `node --test server/tests/phone-fixture.test.js` passed 3/3,
  including actual HTTP session, rejected origin/CSRF, and authenticated
  WebSocket snapshot.
- `pnpm run test:server` passed: 503 passed, 0 failed, 141 skipped.
- `pnpm run test:shared development-publish` passed its three journeys:
  `world-publish`, `creator-generated-levels`, and `creator-four-levels`.
- `pnpm run plans:index --check` passed after regenerating the index.
- `pnpm run verify` passed; receipt `.runtime/agent/core.json`.
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

Compare a physical Safari visit with `?ao=off` against the crash, then isolate
the startup render allocation if it still fails. Resolve the WebContent crash,
verify the guest joins, and capture Web Inspector measurements. Keep PR #393 in
draft until the phone fixture works on the device; recheck exact-head hosted
`preview` after any new commit before landing. Record actual device results in
the GPU matrix only when captured on the phone.
