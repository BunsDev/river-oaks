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
8. **A paused film that never loads looked paused forever** (found by the first `ipic-screen-runner` run). When
   joining a paused film, the local state went straight to `paused` before any frame had decoded. A load that
   never arrived was never reported, and the viewer saw nothing and had no Retry. The player now stays `loading`
   until a frame decodes, so the stall limit applies. A regression covers it.
9. **A paused film's frame never reached the screen** (found by `ipic-screen-runner` run 2: the screen read 0,0,0 where
   the direct video read the film's blue edge). three.js uploads a VideoTexture when requestVideoFrameCallback fires,
   and a paused element that has just loaded or seeked presents no new frame. A viewer joining a paused film, or one
   whose autoplay was refused, saw a black screen. main's `attach()` had the same behaviour. The binding now uploads
   the current frame on binding and after each paused seek (`3561d5ba`, with a regression).

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
| `node preview/e2e/ipic-screen-runner.mjs` (Metal), run 1 | Failed at its first step (stalled load on a paused film): item 8 above, a real defect, now fixed |
| Same, run 2 (`45a9f401`) | The stall step passed, then the screen was black for a paused frame: item 9, fixed in `3561d5ba` |
| Same, run 3 (`3561d5ba`) | Failed on the check's own baseline (resident textures counted before the interior's maps uploaded); fixed in `fc55a2de` |
| Same, run 4 (`3561d5ba` + `fc55a2de`'s fixture change), Chromium 156, ANGLE Metal, Apple M3 Max, 1440×900 | **Passed, 8 checks.** Every aspect (16:9, 4:3, 2.39:1, 4:1) has black mattes (0,0,0) just outside the film and halfway out, and all four film edges show the film's own colour: whole, unstretched, the right way round. Stall reported, then Retry played. Non-film WebM → MP4 decoded. Offline → network failure, then Retry played. A switch during a load is quiet. One texture resident per film; 10 created, 10 disposed; Stop restores the material exactly. Presented frames advanced 7 → 52 in 2 s. Captures are in the session evidence |
| Colour, the same run (16:9 test film, paused, square-on view) | Screen against the direct frame: black 0 → 0; grey 128 → 143; white 255 → 227. Identical with house lights at 1 and 0.25: the film is not lit twice. The difference is the game's global ACES tone mapping (exposure 0.95) on the screen's emission. Black is exact and white is not washed out, so no screen-specific change was made; a renderer-wide change is out of scope. For design review |
| In-world, seated eye of recliner 1-1, Metal ANGLE, real pipeline (scratch `world-screen-runner.mjs`) | Branch `e602cdcc`: after Stop the screen is idle (its own material, not attached); switching to the fixture, 0 of 44 frames showed a frame while loading. Main `153471bc`: after Stop the screen stayed attached on a frame of the short, and 3 of 4 logged switch frames showed the old film while the new loaded |
| `node preview/e2e/ipic-screening-runner.mjs` (branch), run 1 | Not run: the disk filled (ENOSPC on the shared browser-lock file) |
| Same journey on main (scratch runner, main's code) | Pending: expected to fail at "a stopped film leaves the screen idle" |
| In-world seated-eye capture | Pending |
| `pnpm run verify` at `3c440796` | Agent 121/121; preview 3,538/3,540 (one existing skip; one failure is the pre-existing `office-penthouse-furnishings` "short idle slices" 40 ms budget at load 50–100, which fails alone on main too: 200.7 ms on main, 115.2 ms on the branch). The remaining stages, run with `node scripts/agent.mjs verify`: server 668 + 204 Redis skips, desktop 76/76, build, python 141, security: all passed |

## Gaps and owners

- Physical Safari/iOS decode, autoplay and fallback behaviour: not tested; owner #502's device rows (Val's devices).
- Real-screen colour against the direct video in the game pipeline (bloom, GTAO, sky light): pending capture.
- Independent review: none yet; self-review only.

## Next step

Read the queued browser results, inspect the auditorium screen at player height in the game, run `pnpm run verify`,
then commit (signed) and open the PR.
