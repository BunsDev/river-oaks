# IPIC #367: synchronized client playback, accessible controls and media recovery (2026-10-15)

Task `ipic-screening-playback-367` · branch `feat/ipic-screening-playback-20261015` · worktree `../river-oaks-ipic-playback-20261015` · owner claude:river-oaks-1b (f4107618) · parent #359, package #367, against #366's contract (merged as #395, `096a6cdd`).

## Objective

Two admitted viewers watch the same allowlisted clip in IPIC. Each recovers to the authoritative position and keeps its own sound, captions, transcript and exit. A local decoder problem never pauses or restarts anyone else. The film runs on a clearly labelled local fixture until #365's short exists.

## Decisions

- **Fixture media.** `scripts/make-screening-fixture.mjs` uses local ffmpeg only: a `testsrc` pattern with one 660 Hz beep a second, 12 s, in WebM (VP9/Opus, 267 KB) and MP4 (H.264 baseline/AAC, 315 KB), with WebVTT captions. `sources.json` records hashes, durations, provenance (synthetic, no footage, voices, music, artwork or likeness), the transcript and its fixture-only approval. This ffmpeg build has no `drawtext`, so the label lives in the manifest, captions and UI copy rather than burned into the frames.
- **One player, the existing screen.** `buildIpicInterior` exposes its screen material (`userData.screen`). The player puts a `VideoTexture` on that material and restores the original map, emissive map and colours on leave. No interior or renderer is duplicated.
- **Sync profile** (`SCREENING_SYNC`):
  - a 40 ms dead band;
  - rate correction up to 400 ms, with a gain of 0.0004 per ms and at most ±8 %;
  - a seek beyond that.

  Server time comes from `sync` replies (round trip measured, uncertainty half the trip) on entry, every 15 s and on return to the foreground. Snapshot frames carry a fixed 250 ms uncertainty and are used only until a `sync` reply arrives.
- **Local states** are separate from the shared status. `blocked` waits for a gesture with no automatic retries; `error` offers Retry; `unsupported` says so. None sends a command.
- **Sound** starts muted, is opt-in, and plays only inside the auditorium (room-local d ≥ 26); the lounge and street stay silent. Captions are on by default.
- **Host controls** appear only when the server's `sync` says `canHost`. Each intent gets one operation id, and a lost reply is retried once with the same id.
- **Serving.** The standalone server gains video and caption types and single byte ranges (Safari requires them); Vite and Vercel already serve ranges.

## Files owned

- `preview/src/ipic-screening.js`: player and server clock
- `preview/src/ipic-screening-ui.js`: panel, host commands, texture attach and detach
- `preview/src/ipic-screening.css`
- `preview/src/screening-contract.js`: client media fields
- `preview/src/ipic-interior.js` and `preview/src/store-interiors.js`: screen handle
- `preview/src/main.js`: wiring and development-only inspectors
- `preview/public/assets/ipic/screening/**`
- `scripts/make-screening-fixture.mjs`
- `server/app.js`: media types and ranges
- `server/tests/browser-fixture.js`: synthetic host grants
- `preview/tests/ipic-screening*.test.js`
- `server/tests/static-media.test.js`
- `preview/e2e/ipic-screening.js` and `preview/e2e/ipic-screening-runner.mjs`
- `docs/screenings.md`
- this ledger

## Checks

Written test-first in a scratch copy of `main` + #366, then applied to this worktree from `main`.

| Command | Result |
| --- | --- |
| `node --test preview/tests/ipic-screening.test.js`, before the module | failed: module not found |
| same, first runs | two fake-media mismatches with browsers fixed (`load()` resets readyState; `pause()` aborts a pending `play()`). These exposed two controller bugs: a deferred `play()` could start after `dispose()`, and a shared pause turned the aborted play into `error`. Both fixed, and the abort case fails without the fix. |
| `node --test preview/tests/ipic-screening.test.js preview/tests/ipic-screening-ui.test.js` | 11 + 4 pass |
| `node --test server/tests/static-media.test.js`, before the change | failed (`application/octet-stream`, no ranges); after, 1/1 |
| focused set in the worktree (`ipic-screening*`, `screening-contract`, `static-media`, `screenings`, `ipic-*`) | 35/35 |
| `node scripts/make-screening-fixture.mjs --check` | 3 files match `sources.json` |
| `node preview/e2e/ipic-screening-runner.mjs`, run 1 | invalid: my own edit to `preview/src` reloaded the Vite fixture mid-run |
| run 2 | failed: **Start film** did nothing. The panel was mounted inside `#canvas-host`, whose walking drag takes pointer capture, so clicks landed on the host. Fixed: the panel is mounted on the viewport and stops `pointerdown`; it also sits higher, clear of the action bar it overlapped. |
| run 3 | failed: the 12 s fixture ended before the late viewer (loading the town in software rendering, about 20–40 s) joined. Fixed: the fixture is 30 s, both pages load the town first, and the late join is only the trip into IPIC. |
| run 4 | failed: the film ended before the pause step (load average about 50–60). Fixed: the journey pauses right after convergence and takes captures afterwards. |
| run 5 (Chromium 156, SwiftShader, load average about 50) | **passed** all 9 checks: the late viewer joined at the running position; 36 samples over 9 s with spread 43–44 ms (max 44), drift inside the 40 ms band (rate 1); host pause left both on the same frame (0 ms); the viewer's raw transport pause was refused with `screening_host_required`; captions on by default and the transcript opens; leaving IPIC released the viewer's film, panel and video element. Its 390/320 px captures showed the panel squeezed to half the width (`left:50%` with a translate halves an absolute box's shrink-to-fit width). Fixed with `margin-inline:auto`/`fit-content`; the journey now fails if a narrow panel is under 60 % of the viewport. |
| run 6, after the width fix | **passed** all 9 checks again, including the stricter narrow-width check: the late viewer was converged at the first sample; 36 samples over 9 s with a largest spread of 7 ms; host pause spread 0 ms; panels 560 px (desktop), 358 px (390) and 288 px (320) wide. Artifacts in `~/worktree-backups/river-oaks/ipic-screening-playback-367-evidence-20261015/`. |
| `pnpm run verify` (core), after every JS change; only the CSS width fix came later | passed: agent 109/109, preview 3072 pass + 1 existing skip, server 520 pass + 146 Redis skips, desktop 69/69, build, Python 141, secrets |

### Not covered

- T3 runtime captures with the film on the auditorium screen. The journey stays at reception; software rendering is not visual acceptance anyway.
- Real-GPU, Safari and iOS playback. The MP4 fallback and byte ranges exist, but only Chromium ran.
- At 320 px the panel competes with the dismissible hardware banner and an open side dock. This is for design review.
- The browser journey is a standalone runner, like `ipic-runner.mjs`, and is not in hosted CI. It needs a synthetic host grant and two browsers.

## Decisions for Val

1. **Production host.** This client shows host controls only to a server-granted host. Hosting stays off in production until `RIVER_OAKS_SCREENING_HOSTS` names an account (#366).
2. **The real film.** The fixture stands in for #365's original short. Final media, captions and approval are #365's, and #368's final acceptance needs them.

## Next action

Open the PR and land it with `pnpm run land <pr> --owner river-oaks-1b`; then close #367 with the evidence above.
