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
| Same journey on main (scratch runner, main's code) | **Failed** at "a stopped film leaves the screen idle": `{state: idle, attached: true}`, the short's last frame kept after Stop |
| Hosted CI at `6eee1ce9` (Linux, Mesa) | All checks green. The two-browser journey: Stop leaves the screen idle, and the fixture (640×360) replaced the short (1280×720) with its own texture, with no stale frame in 64 rendered frames |
| Integrated soak (#520 `2df7a0a8`: #498 + #499 + #500 + #502), `node preview/e2e/ipic-screening-soak-runner.mjs 10`, 17:15–17:20Z, load 29–53, SwiftShader | **Passed.** Warm-up plus 10 cycles, each changing the film from the short to the fixture: its own 640×360 texture on screen in 1.1–4.1 s; 11/11 late joins within 500 ms in 3–9 ms; presented frames 8–34 ms apart; no growth in media elements, audio contexts, textures or geometries. Main's baseline soak (one film): 11/11 |
| `pnpm run verify` at `3c440796` | Agent 121/121; preview 3,538/3,540 (one existing skip; one failure is the pre-existing `office-penthouse-furnishings` "short idle slices" 40 ms budget at load 50–100, which fails alone on main too: 200.7 ms on main, 115.2 ms on the branch). The remaining stages, run with `node scripts/agent.mjs verify`: server 668 + 204 Redis skips, desktop 76/76, build, python 141, security: all passed |

## Gaps and owners

- Physical Safari/iOS decode, autoplay and fallback behaviour: not tested; owner #502's device rows (Val's devices).
- Real-screen colour against the direct video in the game pipeline (bloom, GTAO, sky light): pending capture.
- Independent review: none yet; self-review only.

## Next step

Done: browser results, the in-world screen at player height, `pnpm run verify`, signed commits and draft PR #513
(hosted CI green). Remaining: Val's approval, then `pnpm run land 513` before #514, #515 and #520. Device rows
(Safari/iOS, other GPUs) and the colour design review stay with Val under #502.

## S1 resumed audit — 2026-10-20 (Codex)

Owner `codex:S1-resume-20261020`; task `ipic-screening-switching-498` resumed after
verified delivery/retirement of #513. Follow-up branch `fix/screening-lifecycle-498-20261020`,
checkout `../river-oaks-screening-498-resume`, base `a35214f3`. The historical next-step
above is superseded: #513, #514 and #515 are merged. Their evidence remains dated evidence.

Objective: audit source generations, bounded recovery, captions, resource ownership and real
screen output against the current candidate. Preserve media bytes, keyframe repair, cancelled
seek workaround and server authority. S2/S3 interfaces inspected in current code and latest
#499/#500 handoffs; no public API or host-control changes planned.

Owned follow-up files: player, focused player tests, this ledger; screen/browser harness
extensions only for missing evidence. Shared UI/catalog/CSS remain unmodified.

Reproduced with four new behavioral tests on current main (26 old pass, four new fail):
- Same-film Start with an intervening Stop absent from the received snapshots retains the old
  pending play and marks the new screening playing instead of loading.
- A play promise resolving after the stall deadline revives error state and sound.
- `canplay` moves to ready and exempts an unresolved play promise from the stall limit.
- A cancelled old frame callback that arrives anyway schedules another callback chain; disposal
  only knows the last handle.

Minimal candidate fences same-film screening/epoch replacements, terminates pending work on
failure, applies the ready-to-play timeout and stops stale frame callbacks before rescheduling.
Player 30/30 and focused screening/media/binding/UI suite 52/52 pass, no skips.
Raw logs: `.runtime/s1-498/`. `pnpm install --frozen-lockfile`, `uv sync --locked` complete;
`pnpm run agent:doctor` passes. Initial fixture hash/duration command blocked: ffprobe missing
from PATH (unit media hash/keyframe checks passed). Browser screen run started; not yet evidence.

Still required: event/caption boundary audit, actual candidate browser/resource checks,
postprocessing color comparison, required core gate, review, exact media hashes and #497 update.
Physical Safari/iOS/other-GPU and human color/listening/accessibility evidence remain open with
Val/#502. No production action or acceptance claim. Repository-wide project:check reports
pre-existing missing worktree/branch reconciliation debt; no unrelated records changed.

### Review and verification delta (same session)

- Added current-element checks for queued media events: an error event with a cleared error
  property consumed the new source's fallback; a queued canplay/playing could falsely mark it ready.
  Regression failed before the guard. Captions now hide during loading/seeking/failure; the same-film
  stale-cue regression failed before this change.
- Independent reviewer `/root/review_s1` found two P2 issues: blocked autoplay was suppressing
  genuine decoder errors, and pending resume from paused escaped the stall deadline. Both new
  regressions failed before fixes. Fallback now preserves the gesture requirement, and every play
  waits under the loading/buffering deadline. Reviewer independently rechecked 11 focused tests,
  all passing; code review ready subject to gates/browser evidence. Reviewed player SHA-256:
  `f69a277a846956e9b7580377318079b9ae72d90d2f797d943c2ef1f0d2eb71a7`.
- Self-review caught failure fencing cancelling frame observation after gesture unlock; restored
  observation on unlock with a regression. This was introduced and resolved within the candidate.
- Focused player/UI/binding/media command now passes **58/58, zero skipped**. Borrowed textures,
  shader hooks and material survive binding release; only the owned film texture is disposed.
- `node scripts/make-screening-fixture.mjs --check`: **11 files / 3 films match sources.json**.
  Installed local ffmpeg/ffprobe through Homebrew to unblock duration checking; no film regenerated.
- First core run failed agent archive tests because PATH selected system Python 3.9 (`extractall`
  lacks `filter`). Rerun with `PATH="$PWD/.venv/bin:$PATH" pnpm run verify` uses Python 3.13.16;
  agent tests pass that boundary, full result pending. Original receipt preserved as
  `.runtime/s1-498/core-system-python.json`; logs retain actual failures/skips.
- Existing screen fixture now calls production `createRenderPipeline` with GTAO, bloom and
  OutputPass. Browser test adds same-film restart without Stop and records before/after texture
  and raw position. This still uses fixture lighting, so it is not full-world sky-light evidence.
- Browser process remains queued behind live `node scripts/browser-lock.mjs` PID 3435 (garment
  provenance full gate); lock respected. No current rendered/color/resource pass claimed yet.
- `.runtime/s1-498/candidate.json` records base, branch, SHA-256 of candidate source/tests/harness
  and all media files. No commit, merge, deployment or production operation performed.

Next executable actions: poll live core session and browser runner; inspect failures if any,
review real captures/color samples, then run two-browser journey and proportional resource check.
Refresh candidate hashes if code changes. Update #497 with exact evidence and keep missing criteria open.

Progress receipt published to #497:
https://github.com/BunsDev/river-oaks/issues/497#issuecomment-6304411629

Live handles at this handoff: exec session `24271` (core, PID 80628; preview finished,
server started); exec session `49206` (screen runner PID 18038; browser queue waiting
behind live PID 3435). Poll these handles rather than starting duplicates. Core began
before the final review fixes, so validate the final changed preview slice after it;
do not attribute an earlier loaded test file to later source edits. The full 58-test
focused result and independent reviewer signature match the final player hash above.

### Continuation — 2026-10-20 23:56Z

Previous turn was progress (reproduced defects, patch, regressions, review and coordinator update).
Re-polled the existing core and screen runner; neither was restarted.

- Corrected-Python core gate **passed**: agent 165/168 (3 media-intake skips before ffmpeg
  installation), preview 3707/3708 (existing obstructed Vince glazing negative-test skip),
  server 732/944 (212 Redis skips), desktop 115/118 (3 Windows PowerShell skips), production
  build, Ruff/format, Python 145 tests, offline fixture and secret guard passed. Offline
  verification's expected blocked result is not production evidence.
- After ffmpeg installation, `node --test scripts/tests/ipic-short-intake.test.js` passed
  **7/7, zero skipped**, covering the three media-intake rows skipped by that core run.
- Final audit reproduced a diagnostic defect: successful gesture recovery retained an
  `autoplay` attempt result after actual decoding. `decoded()` now recognizes a valid decoded
  event after policy refusal too, without changing the gesture gate. Existing regression
  extended, failed first, then passed. Focused suite remains **58/58, zero skips**.
- Independent reviewer `/root/review_s1` approved this diagnostic delta and independently
  ran its regression (1/1). Final player SHA-256 is
  `46772895d863cf2626dc09a71be0c2ce70dde23a693d3dd4dd4abf6f7321f539`;
  `.runtime/s1-498/candidate.json` refreshed. The earlier review signature remains historical.
- Final candidate preview gate `PATH="$PWD/.venv/bin:$PATH" pnpm run verify preview` is live
  in exec session `59038` (agent PID 67357, node tests PID 67582; current remaining worker
  PID 83653, `silvan-drape.test.js`). No failed result or timeout yet; do not restart it.
- Screen runner session `49206`, PID 18038, remains queued behind live PID 3435; no rendered
  result. The original core handle `24271` completed successfully and is now closed.

Next: finish final preview gate; prepare a draft PR using GitHub-signed commit API because
this environment has no local signing executable, comparing the resulting tree with staged
files before adopting it locally. Then consume the existing screen runner, inspect output,
and run two-browser/resource checks. Keep missing criteria open; no merge/deployment authority
is inferred. No changes to shared S2/S3 hunks or media bytes.

### Draft candidate gate — 2026-10-20 23:58Z

`PATH="$PWD/.venv/bin:$PATH" pnpm run verify preview` completed: **3709 passed / 3710,
zero failures, one existing obstructed Vince glazing skip** (302.9 s). This run covers the
final player revision `46772895…` and includes both independent-review fixes. Combined with
the completed core run and 7/7 media-intake rerun, the code is ready for a draft PR; browser,
postprocessing/color and same-candidate resource evidence remain pending. Screen process
18038 remains live and queued behind live PID 3435. No duplicate browser runner started.
