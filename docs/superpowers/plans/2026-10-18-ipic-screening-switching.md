# IPIC screening: film switching, mattes and source recovery (#498)

- **Issue:** #498 (S1 under tracker #497, umbrella #359). Playback engineer role; design review of the real screen still owed.
- **Task:** `ipic-screening-switching-498` (live register), owner `claude:river-oaks-4b (6191db50)`.
- **Branch / worktree:** `fix/screening-switching-498-20261018` in `../river-oaks-screening-498`, from main `153471bc`.
- **Coordinator ledger:** `2026-10-18-ipic-screening-next.md` (on #502's branch) holds the cross-package matrix.
- **Scope kept:** the existing player, timeline, commands, permissions and sync profile. No host seeking, no revival of
  the cancelled `screening-seek-lead` workaround, no catalog or server change, no renderer-wide colour change.

## What was wrong on main `153471bc`

Each item has a regression that failed on main; output saved with this session's evidence.

1. **A film switch was not fenced.** `load()` did not start a new generation. A play() of the previous film that had
   resolved before the switch marked the replacement `playing` while it was still loading.
2. **One encoding per film.** `pickScreeningSource` took the first `canPlayType` hit; any media error went straight
   to `error`. The MP4 was never tried after a WebM that would not decode.
3. **No failure reasons.** Decode, network and a deliberate abort (MediaError 1, our own reload) all became `error`.
4. **No stall limit.** A load or buffer with no progress spun forever.
5. **The screen kept the first film.** `attach()` returned while a texture existed, so a switch reused the
   previous film's texture and fit, and its last frame stood in for the next film while that loaded. After Stop the
   frozen last frame stayed on the screen under "Waiting for the host to start a film."
6. **Mattes came from the film.** Clamped texture edges smeared the film's own edge pixels across the screen; only
   the bundled films' baked black border made them look black.
7. **Diagnostics hid seeks.** `driftMs` is zeroed after a seek request, and nothing reported presented frames.

## Change

- **`preview/src/ipic-screening.js`** (player):
  - every element load (film switch, fallback encoding, Retry, stop) starts a new generation;
  - `screeningSources()` lists every encoding the browser may decode, and each is tried once per attempt;
  - `failure` is `autoplay`, `decode`, `network`, `stalled`, `playback` or `null`, and MediaError 1 is ignored;
  - `SCREENING_LOAD.stallMs` (30 s) ends a load or buffer that makes no progress;
  - a shared Stop releases the decoder;
  - `stats()` adds `generation`, `source`, `attempts`, `measuredDriftMs` (before correction) and `presented`
    (requestVideoFrameCallback media time and frame count, fenced by generation);
  - `catalog` is a test-only option.
- **`preview/src/ipic-screening-screen.js`** (new, the screen binding): one VideoTexture per source generation and
  decoded size, fitted at the film's aspect; black mattes drawn by the screen's own shader (`onBeforeCompile` zeroes
  everything outside the film's texture square); every borrowed material property restored exactly, own-versus-
  inherited included; one texture resident at a time.
- **`preview/src/ipic-screening-ui.js`**: uses the binding, and binds only once the current source has a decoded
  frame; status text per failure reason; `inspect()` adds the binding, decoded size and the new player fields.
- **Test-only films:** `scripts/make-screening-test-sources.mjs` writes `preview/e2e/fixtures/screening/` (four
  borderless synthetic films at 16:9, 4:3, 2.39:1 and 4:1 with coloured edges, plus one non-film), served by the dev
  server only and never in `SCREENING_MEDIA`.
- **Real-browser checks:** `preview/e2e/fixtures/ipic-screen.html`, which builds the real IPIC interior and screen
  material, with `preview/e2e/ipic-screen.js` and `ipic-screen-runner.mjs`. The two-browser journey
  (`preview/e2e/ipic-screening.js`) now checks Stop and the switch to the fixture frame by frame.

## Interfaces for #499, #500 and #502

- `createScreeningPlayer(...)` keeps its methods. `stats()` only gains fields. `retry()` starts a new bounded attempt.
- `screeningStatusText({ shared, local, failure })`: `failure` is new and optional.
- `inspect()` (`window.__riverScreening`) gains `screen` (`{ key, width, height, fit, texture, counts }`), `decoded`,
  `generation`, `failure`, `source`, `attempts`, `measuredDriftMs` and `presented`. `attached` is now true only while a
  decoded frame of the current source is bound.
- The chooser (#499) needs no player change: a new `mediaId` in the shared view is a switch.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/ipic-screening.test.js` on main `153471bc` with the new regressions | 8 of 24 failed (switch fence, fallback ×2, network, abort, stall, autoplay reason, presented frames) |
| `node --test preview/tests/ipic-screening-screen.test.js` on main | Failed: no binding module |
| Same, on the branch | 24/24 and 4/4; all screening unit tests 37/37 |
| `node preview/e2e/ipic-screen-runner.mjs` (Metal) | Pending: queued behind other sessions' browser runs |
| `node preview/e2e/ipic-screening-runner.mjs` (branch) | Pending |
| Same journey on main (scratch runner, main's code) | Pending: expected to fail at "a stopped film leaves the screen idle" |
| In-world seated-eye capture | Pending |
| `pnpm run verify` | Pending |

## Gaps and owners

- Physical Safari/iOS decode, autoplay and fallback behaviour: not tested; owner #502's device rows (Val's devices).
- Real-screen colour against the direct video in the game pipeline (bloom, GTAO, sky light): pending capture.
- Independent review: none yet; self-review only.

## Next step

Read the queued browser results, inspect the auditorium screen at player height in the game, run `pnpm run verify`,
then commit (signed) and open the PR.
