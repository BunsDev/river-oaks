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

### Draft delivered for review — 2026-10-21 00:00Z

Draft PR: https://github.com/BunsDev/river-oaks/pull/571
Signed head `a95026e487de9500baba534e95d33ff28708c039`, tree
`0d57d2e44e791409d8cf5a5d98c1a965bd486e1e`. GitHub signature VALID; tree matched
`git write-tree` exactly before a soft reset adopted the commit without replacing files.
The staged pre-commit secret guard passed. Vercel created its automatic branch preview;
no production deployment or merge initiated. Task remains active, not delivered/accepted.

Coordinator update: https://github.com/BunsDev/river-oaks/issues/497#issuecomment-6304535273
Hosted Verify run `39518470106`, exact head above, queued/running; watcher exec session
`67222`. Local screen runner remains exec session `49206`, PID 18038, waiting behind
live browser-lock holder PID 3435. Final preview handle `59038` completed successfully.

Current requirement audit (completion still unproven):

| Requirement | Current candidate evidence | Remaining proof |
| --- | --- | --- |
| New film/same-film/epoch replacement, stale play/frame/event work | Focused behavioral regressions, red/green logs, independent review | Matching browser execution |
| Bounded recovery, retry/fallback, policy distinction | Focused tests including paused resume and genuine decode error after policy refusal | Browser recovery and device rows |
| Captions and metadata follow accepted film | Loading/seeking caption regression; S2/S3 callers inspected unchanged | Two-browser journey |
| Dimension changes, full borderless content, orientation and mattes | Existing harness extended to production pipeline; historical receipts retained | Current queued screen run and inspected captures |
| Color response through postprocessing | Actual production GTAO/bloom/OutputPass now used by fixture | Current direct/rendered pixel samples and human design disposition |
| Texture/reference release, exact original material restoration | Borrowed-map/material preservation regression passes | Current GPU counts and resource soak |
| Authority, keyframe repair, cancelled seek workaround preserved | No server/catalog/sync-profile changes; media 11/11 checks | Hosted/two-client integration result |
| Raw timing and frame progress separated from seek requests | Existing sampler retained; new browser receipt will include samples | Actual current run |
| Required gates/review/handoff | Core + final preview + focused + intake pass; independent review; draft #571 and #497 update | Hosted and remaining browser evidence |

Next action is to consume those existing live handles, not rerun unchanged broad suites.
After screen inspection, run the existing two-browser and ten-cycle resource harnesses on
this candidate. Physical Safari/iOS/other GPU and human/production evidence remain named
open rows under #502; no closure or production acceptance inferred.

### Live verification observation — 2026-10-21 00:02Z

Prior turn was progress: exact-tree signed draft #571 and coordinator receipt published.
Screen session `49206` remains live/queued (PID 18038; holder PID 3435 still live).
Hosted Verify `39518470106` has completed Python 3.11 and dependency review successfully;
browser jobs are live and Python 3.13 queued. PR watcher session `67222` terminated because
the shared GraphQL quota was exhausted; this was an observer failure, not workflow failure.
Continued observing the same workflow through REST (`gh run watch`, 60-second interval);
no workflow or local browser process restarted. Core and final preview gates remain passed.

REST workflow watcher is exec session `54420`; local screen remains `49206`.
At the latest observation, hosted preview job `118956245804` was executing `pnpm test`
and its IPIC two-browser step was still pending. These are verified waits on live work,
not failed checks or a reason to restart. Historical raw archive paths from #498 are
not present on this machine; retain their issue receipts as dated reports, and rely on
new candidate artifacts for current acceptance.

### Hosted failure triage — 2026-10-21 00:06Z

Candidate Verify `39518470106` campus-traversal job `118956246081` failed:
`T1 lift to Floor 2: expected garden-campus/l1, the server says null`.
Log: `.runtime/s1-498/ci-campus-traversal.log`; artifact `12310715372`.
This journey and its production paths are unmodified by S1. On exact base `a35214f3`,
Verify `39510636169` was also red: campus job `118930482932` failed the suite's resident
lift to Floor 2 (30-second timeout, buildingId/levelId null). Its campus-traversal job
`118930483074` passed, so this is related baseline evidence, not proof that the identical
traversal failure is deterministic. Baseline log retained as `base-ci-campus.log`.

Active owner: task `campus-readiness-512`, `codex-campus-readiness-512`, independently
investigating readiness and lift acknowledgement. No edits to those owned files. A targeted
retry request `gh run rerun 39518470106 --job 118956246081` was refused (`job ... cannot be
rerun`); no retry actually started. Wait for the existing workflow to finish, then retry
only its failed job(s) once under repository workflow guidance. Keep the failed receipt.
Both hosted Python versions and dependency review passed; screening step still pending.

### Hosted outcome and remaining local evidence — 2026-10-21

Verify `39518470106` attempt 2 passed all jobs including aggregate `preview` after
one actual failed-job retry. The first failed campus receipt remains above. Hosted
preview checks at signed head `a95026e487de9500baba534e95d33ff28708c039` passed the IPIC two-browser journey:
19 checks, 46 rendered attachment-state samples without stale attachment, both approved
films, second-film WebM audio decoding (39389 bytes), captions/transcript, late join
20 ms timeline convergence and 0 ms paused spread. Emulated foreground recovery measured
a presented frame 152 ms from room time, 349 ms after showing. Timeline samples and
attachment-state checks are not pixel or physical-device proof. Host loss paused both
clients without promotion; exit released the panel/video. Log: `ci-preview-passed.log`.
No redundant local two-browser run is needed for unchanged runtime source.

Local screen session `49206` remains queued. Ten-cycle resource soak session `44817`
is separately queued using `node preview/e2e/ipic-screening-soak-runner.mjs 10`.
The uncommitted screen harness now traces the old blue-edge pixel through a held
replacement load and its first three bound frames. It arms the first sample before
applying the switch in the same browser task and arms replacement tracing before
releasing the response. Independent reviewer approved harness SHA-256
`e20017ca6136977f20316e77d8170d48a0471c3ee89f17a678b03c6e08fe7b54`.
This test has not executed yet; claims remain scoped to its sampled pixel/windows.
Runtime source still matches the reviewed, signed commit. `candidate.json` preserves
the committed hashes and separately identifies the pending evidence harness.

### Actual screen receipt — 2026-10-21 01:10:46Z

`node preview/e2e/ipic-screen-runner.mjs` exited 0, session `49206` terminal.
Receipt `output/playwright/ipic-screen/receipt.json`: 10 reported rows, zero page errors;
autoplay sound was allowed, so the policy-refusal row is explicitly unexercised here.
Browser 156.0.8078.4; ANGLE Metal Apple M5 Max. Runtime matches signed a95026e4;
executed harness SHA-256 e20017ca6136977f20316e77d8170d48a0471c3ee89f17a678b03c6e08fe7b54.
The receipt records dirty harness/ledger accurately.

Inspected square captures for 16:9, 4:3 and 2.39:1, seated 4:1 and approved short:
all film edges retained, white marker left of black, expected pillarbox/letterbox and
scope fill. The 4:1 capture's fixture-only status overlay still says error from the
initial offline show because retry does not update that overlay; binding/pixel results
prove retry rendered the film. This is not the production controls or a current error.

Targeted ghost sample at [296,450]: old blue [0,2,228] became idle material [108,116,155]
in all 8 loading frames (generation16, no binding), then black [0,0,0] in the first
3 replacement frames (640x480, generation16). Evidence covers this sampled pixel and
transition, not every pixel or device. Same-film restart and interrupted load passed.
Stop restored the exact original material; 13 created film textures all disposed,
resident count returned to idle. Ten-cycle full-world resource soak is still pending.

Direct/rendered color: gray [128,128,128] -> [140,140,138], white [255,255,255] ->
[227,227,227], black [0,0,0] -> [0,0,0], blue edge [0,15,255] -> [0,2,228]
(top edge [0,0,215]). Lit and 0.25-house-light samples matched exactly. Thus color
is transformed by the configured material/postprocessing path; do not claim original
color accuracy. Fixture uses production GTAO/bloom/OutputPass and ACES exposure0.95,
but not full-world sky lighting. Raw receipt profile mistakenly retained the old
“not the game pipeline” description; corrected only the returned profile text after
execution. Raw receipt preserved, correction/hashes in `screen-provenance.json`.

Raw frame samples remain in receipt.results.frames: presented count9->51, media time
2292->4042ms, currentTime2.271683->4.058521s, measured drift -79..-44ms over 8 samples.
These observed frames are separate from the requested initial 2000ms seek. No sync
retuning, media/keyframe changes, or revival of the cancelled workaround.

Independent evidence review `/root/review_s1`: receipt/ledger/provenance agree; no
misleading acceptance claim or new blocker. Receipt SHA-256
`2e872c18b2e6a3aa38e9ddcaecb2a141b6553fb2555dbec99a3ab3ca50ecbb1e`.
Reviewer inspected structured evidence; image inspection above was by session owner.

### Resource soak and engineering handoff audit — 2026-10-21

`node preview/e2e/ipic-screening-soak-runner.mjs 10` exited 0, session44817 terminal.
Receipt `output/playwright/ipic/screening-soak.json`, SHA-256
`2ea589466607d7ae0ad60be877af12422eced6f29df6a2e6dfef64928c09d364`.
Runtime remained signed a95026e4; runner/source hashes in `soak-provenance.json`.
Chromium156.0.8078.4, SwiftShader, 196808ms, load averages16.5/16.3/17.8.
Seven checks passed: warm-up plus ten entry/exit cycles, film replacement each cycle,
11/11 late joins, caption toggle, narrow 320/390px controls/focus, viewer-only Stop watching.

After all 11 exits: zero screening videos, tracked/loaded/playing media and audio
contexts. Textures49, geometries279, listeners889, documents4, intervals6 and timeouts0
stayed flat. DOM nodes6088->6089 (range6088..6096), no steady growth. One unrelated
media element remains in DOM throughout; do not claim the whole document has no media.

Timeline convergence was2..3ms after sampling began, worst currentTime spread12..89ms.
Presented spread2..59ms with83..87ms uncertainty and2..48ms pairing gap. Viewer pace
8.9..13.4fps, media/wall1.00..1.02; host9.2..12.8fps. These are software-rendered
frame measurements, not native device smoothness. Raw per-cycle timeline/drift/rate
samples and frame-progress summaries are retained in the receipt. Startup separate:
non-warm-up first-frame1462..2854ms, playing1525..2881ms; warm-up first-frame3089ms
and playing9820ms (trip9817ms). Do not equate convergence with startup or requested seeks.

Completion audit of this engineering request: source-generation/retry/fallback/teardown
behavior has focused regressions and review; same-film, replacement, captions and
authority have current browser evidence; aspect/mattes/orientation/pixels/color were
measured and captures inspected; exact restoration/shared ownership has unit plus
actual-screen and soak evidence. Core/final-preview/focused/media/intake gates passed;
hosted Verify39518470106 attempt2 and19-check journey passed at a95026e4. No unchanged
broad suites rerun for this evidence-only follow-up. Remaining delivery: commit reviewed
harness and evidence, update PR and #497 with exact final revision and signatures.

Acceptance remains OPEN for physical Safari/iPhone, other GPUs, listening/headphones/
speakers/voice-chat mix, human color and VoiceOver, full-world lighting comparison, and
signed-in production host smoke (Val/#502). This branch is neither merged nor production
accepted. Existing catalog/media bytes, server authority, keyframe repair and cancelled
seek workaround decision are preserved. No shared S2/S3 UI/control change.

Final structured-evidence review: `/root/review_s1`, 2026-10-21, read-only.
Independently recalculated soak ranges/counters and confirmed receipt hash,11/11
late joins,7 checks, flat resource counts and scoped caveats. No remaining blocker
for engineering evidence handoff; no merge/production acceptance asserted.
Owner/handoff signature: `codex:S1-resume-20261020`.

### Closure readiness resumed — 2026-10-22

Owner `codex:S1-closure-20261022`; clean existing checkout reused after the recorded handoff and ListAgents inspection (no previous owner listed). No merge/deploy authorized. Independent read-only reviewer `/root/review_571` is reviewing the player, fixture and screening tests at `6035a9e4`.

Fresh evidence: all 20 hosted checks at `6035a9e4` succeeded, including `preview`. Fetched main is now `f850abfa` (lander deletion fix #570), so the branch needs an update and new exact-head checks before merge-ready. Local focused command `node --test preview/tests/ipic-screening*.test.js preview/tests/screening*.test.js` passed 74/74 with no skips. `node scripts/make-screening-fixture.mjs --check` matched 11 files / 3 films. Logs: `.runtime/s1-498-closure/`.

Remaining: independent review disposition; full-world direct-video pixel comparison (the existing fixture explicitly uses fixture lights); all requested browser/core checks; update from main; acceptance-box evidence map; one consolidated evidence comment and ready-for-review PR state once supported. Physical devices and human color sign-off stay Decisions for Val / #502. No original media, IDs, durations, server authority or global tone mapping will change.

#### Acceptance-box reconciliation (engineering vs acceptance)

| #498 box (body order) | Evidence and disposition |
| --- | --- |
| 1. Replacement/restart/late callbacks | #513 initial generation fencing; #571 same-film restart and play/event/frame/cue fences. Initial focused 74/74; post-lighting five suites 66/66 with no skips. Independent player review found no actionable defect. |
| 2. Texture and decoder lifecycle | #513 exact borrowed-material restoration; #571 post-fix Metal run restored the material and disposed 13/13 textures; #520 integrated warm-up plus ten-cycle evidence. Fixed-lighting probe resources are cleaned up. Physical-device resource cycles remain #502. |
| 3. Independent mattes/aspect/edges | #513 screen fitting; #571 post-fix real-composer Metal checks passed 16:9, 4:3, 2.39:1 and 4:1 with independent black mattes. Geometry unchanged. |
| 4. Real-renderer direct-video comparison | #571 full-world paired captures exposed double lighting. Fixed-exposure GPU regression failed before and passed after the screen-only emissive correction. Corrected noon/dusk/dawn captures retain all 35 paired samples per hour and nine images; orientation/full content/mattes inspected. Global rendering policy unchanged. Human color approval remains #502 Screen quality, Val. |
| 5. Bounded source fallback/Retry | #513 bounded attempts; #571 gesture gate preserved through fallback. Focused tests and post-fix real-decoder invalid WebM to MP4 fallback passed. Physical Safari/iOS codec behavior remains #502 Replacement/failure. |
| 6. Failure reasons/deadline/local isolation | #513 local failure reasons; #571 terminal/resume deadlines and stale rejection fences. Unit and actual stall/retry checks pass. Chromium allowed autoplay, so refusal is unit evidence only; physical gesture/autoplay is #502 Replacement/failure. |
| 7. Metadata/cues/current frames | #513 metadata binding, #571 cue/event fences and held-response pixels, #520 integrated film changes. Post-fix two-browser run passed 19 checks: second film owns its texture/captions/transcript; no stale image in 59 replacement frames. |
| 8. Authority/synchronization unchanged | No server/catalog/media changes. #513/#520 integration plus #571 post-fix two-browser permission/revision/idempotency and host-loss checks pass. Core passes: preview 3717, server 732, tooling 173, desktop 115, Python 145; exclusions recorded below. |
| 9. Unit/browser/captures/resources/raw timings | #513/#520 historical receipts plus #571 fresh focused/core/Metal/full-world/two-browser evidence retained with hashes. Presented frames advance 8 to 51; two-browser convergence 8 ms and paused spread 0 ms. Additional GPUs, physical devices, listening and human accessibility remain #502. |

Independent reviewer `/root/review_571` passed 52/52 player/screen/UI tests at `6035a9e4` with no actionable defect. Later capture-harness findings were fixed with isolated red/green regressions; the screen-only lighting fix received independent source review and 14/14 screen/capture tests. GPU red/green and corrected full-world captures then passed separately. Review does not establish physical devices or human approval.

#### Decisions for Val

- #502 Screen quality: approve/revise the measured screen color and black levels after the full-world captures are available; no global tone-mapping change proposed.
- #502 Replacement/failure: physical macOS Safari/iPhone Safari decode, fallback and gesture/autoplay; #502 Presented video/Serving-performance: named additional GPUs.
- Separately authorize landing #571 after exact-head CI and review readiness.

#### Live execution checkpoint — 2026-10-22 18:50Z

New test-only files: `preview/e2e/ipic-screen-colour-runner.mjs`, `ipic-screen-colour-capture.js`, and `preview/tests/ipic-screen-colour-capture.test.js`. The full-world runner selects the allowlisted fixture through host UI, pauses it, and captures paired direct-video/world pixels at noon/dusk/midnight. It injects read-only capture instrumentation through the local test route; production source and rendering policy remain unchanged. Raw output is planned under `output/playwright/ipic-screen-colour/`; it has not executed yet.

Independent review found two problems in the first harness draft: extra direct composer render bypassed production culling, and sky-light load failure could pass. The updated harness captures through production `pendingCapture` after normal draw and requires loaded environment, normal mode, enabled AO/bloom, paused/nonseeking video. Seven behavioral capture tests pass. Initial test run failed because the helper did not yet exist; this is scaffold red/green, not a reproduced runtime failure receipt. Browser execution remains required to validate the harness.

Live exec handles: screen `84950`, full-world colour `18754`, two-browser `1483`, core `55752`. Original colour handle `89981` was intentionally terminated while still queued to replace the reviewed harness, not because observation timed out. Browser runs queue behind another live job (PID 37219 verified live); lock respected. Core is running with checkout venv/Python3.12 fallback selected. Poll these same handles before any restart. Logs are in `.runtime/s1-498-closure/`.

#### Current-main update and core result — 2026-10-22 18:52Z

Core completed successfully at 18:49:56Z on `6035a9e4` with uncommitted harness/docs: `PATH="$PWD/.venv/bin:/opt/homebrew/opt/python@3.12/libexec/bin:$PATH" pnpm run verify`. Tooling 168/168; preview 3709 passed / 1 existing skip; server 732 passed / 212 Redis skips; desktop 115 passed / 3 Windows skips; build, Python145, offline fixture (expected blocked domain result), secrets passed. Saved receipt `.runtime/s1-498-closure/core-6035a9e4.json`. Helper tests were added after preview suite discovery, so their separate 7/7 result is the relevant evidence.

GitHub update-branch with expected old SHA created verified signed commit
`ba7647614165a4a4bdfb9276d29e8b85b7f8af37`; local checkout fast-forwarded to it.
It contains current fetched main `f850abfa`. Its only delta from previous head is
#570's lander/workflow change: no preview source/test/browser differences. Focused
base-update + new capture helper check: 27/27 passed, zero skips. Hosted checks
are running on this new exact head; no PR merge or deployment requested.

Capture review follow-up approved pendingCapture/readiness fixes (7/7 independently). The runner now selects the existing Sharpest preset to hold AO/full resolution and records source hashes and dirty paths. Queued colour process18754 was deliberately replaced for that profile/provenance change; current colour handle is `97881`. Other live handles unchanged: screen84950 and two-browser1483. Core55752 finished0. Browser lock remains held by live PID37219; no bypass or duplicate run.

Next: consume those three existing browser handles, inspect all raw color captures, fix any evidenced harness failures, preserve receipts, finish consolidated evidence and #498 box reconciliation, publish verified harness/docs and await exact-final-head CI before marking #571 ready. Physical device/human decisions remain with Val/#502.

Capture regression sensitivity checked after review: isolated helper mutations in `.runtime/s1-498-closure/` reintroduced each reviewed defect separately. Immediate readback (bypassing the scheduled normal draw) fails exactly the draw-order test; removing the environment gate fails exactly the missing-environment test (each 6 passed / 1 failed). The actual corrected helper passes7/7. These are explicit counterfactual regression checks, not historical browser reproductions. Raw red and green logs retained as `colour-direct-draw-red.log`, `colour-missing-environment-red.log`, and `colour-reviewed-green.log`.

#### Hosted audit repair — 2026-10-22 18:54Z

Hosted run39834908805 Python3.13 failed on `opentelemetry-api1.45.0`, CVE-2026-114603 (fix1.45.1); Python3.11 was cancelled by fail-fast. Raw job log: `.runtime/s1-498-closure/ci-python313.log`. This is an actual merge gate, not a screening regression or a flaky-job retry. Registry inspection found campus507 preparing the same narrow patch in its branch and the dependency task handling broader upgrades. Only this owned screening branch was edited.

`uv lock --upgrade-package opentelemetry-api==1.45.1` changed that package block and resolver revision3→5. Independent reviewer compared parsed locks:50 packages both sides, no other version or dependency relationship changes. Exact CI audit: `uv export --frozen --all-extras --no-hashes --no-dev --no-emit-project --format requirements-txt --output-file .runtime/s1-498-closure/requirements-audit.txt` then `uvx pip-audit==2.10.1 --no-deps --disable-pip -r .runtime/s1-498-closure/requirements-audit.txt` passed with no known vulnerabilities. `pnpm run verify python` passed including145 Python tests, lint/format/offline fixture. No optional media/model packs downloaded.

Published verified GitHub-signed commit `9249aa041db5b0cb314f5b8eca53354215eddf7a`, tree `9f141d7f8b9509dfc916c3a650481236cd9a0195`. Pre-commit secret guard passed; fetched tree matched staged tree before adopting via soft reset. No uncommitted harness/docs were included in this dependency-only commit. Evidence increment: https://github.com/BunsDev/river-oaks/pull/571#issuecomment-6348755612 Hosted checks on new head are queued. The earlier run cannot prove this head.

Live browser handles remain screen84950, colour97881, two-browser1483; polled live, queued behind PID37219 verified alive at18:54Z. No duplicate runs. Goal still active: consume actual browser output; inspect captured pixel pairs; publish harness and final evidence map; wait all final-head checks and mark review-ready. No merge, production deployment, issue closure or physical/human acceptance claimed.

#### Hosted screening proof — 2026-10-22 19:16Z

At signed head9249aa04, Verify39835413494 preview-checks job120022305186 passed, including `xvfb-run -a pnpm run test:screening`:19 checks, convergence18ms after sample start, paused spread0ms, no stale frame across52 rendered switch frames, second approved film's own texture/captions/transcript and40682 decoded audio bytes, foreground first presented frame65ms from room/394ms after showing. Audio bytes are decoding evidence, not listening. Raw job log `ci-preview.log` retained under `.runtime/s1-498-closure/`; current hosted proof is distinct from pending local runs. Both Python3.11/3.13 jobs passed with the audit fix.

Campus job120022304859 cancelled after the20-minute job limit, last output being suite-desk save. Its raw log `ci-campus.log` is preserved. No screening failure in that log. A single-job retry request was refused (`job ... cannot be rerun`) while the overall run remains active with worlds-and-creator. No retry execution yet; when the run is terminal, request failed-job rerun once as workflow permits. Do not weaken timeouts or change unrelated campus implementation to hide this result.

Local screen84950, colour97881 and two-browser1483 remain confirmed-live queued processes behind PID37219, whose full verification progressed from experience (passed) to shared (running). No local capture proof yet.

#### Campus retry started — 2026-10-22 19:17Z

Verify39835413494 attempt1 is terminal: all substantive jobs passed except campus, which cancelled at its20-minute limit; aggregate `preview` consequently failed. `gh run rerun 39835413494 --failed` succeeded after terminal state. Attempt2 now runs campus at the same9249aa04 head. This is the one permitted retry; if it fails again, diagnose the evidence rather than repeatedly rerunning. Prior unsuccessful request did not launch a retry. Browser handles84950/97881/1483 remain live queued.

#### Current head green — 2026-10-22 19:26Z

Verify39835413494 attempt2 completed successfully. Campus passed on the one retry; all20 PR status entries are SUCCESS, including aggregate `preview` and CodeQL. Exact head `9249aa041db5b0cb314f5b8eca53354215eddf7a`, base `f850abfac7e8e95ed19448138dd9d66ac9aa6b75`, mergeStateStatus CLEAN, still draft. Fresh fetch + merge-base confirms current main is an ancestor. Raw rollup saved as `.runtime/s1-498-closure/ci-9249aa04.json`. This proves current published head only; future harness/evidence commit still requires its own hosted checks.

Remaining finish line: actual full-world comparison (queued colour97881), requested local screen84950/two-browser1483 results, publication of reviewed harness and ledger, final checklist evidence map and review-ready PR state. No physical/human acceptance or merge/deploy authorization inferred from green CI.
#### Fresh actual-screen result — 2026-10-22 19:32Z

`node preview/e2e/ipic-screen-runner.mjs` (handle84950) completed exit0 at head9249aa04 on ANGLE Metal/Apple M5 Max. Real-decoder stall/Retry, 16:9/4:3/2.39:1/4:1 aspect/mattes, offline/Retry, WebM-invalid→MP4 fallback, interrupted load, same-film restart, and held-response pixel trace passed. Presented frames advanced7→51; Stop restored the material exactly and disposed all13 created textures. Autoplay with sound was permitted, so refusal was not exercised by this browser and remains covered by unit tests/device rows separately.

Inspected the fresh16:9,4:3,2.39:1 square captures and4:1 seated capture: full colored bounds, orientation and mattes agree with samples. The4:1 screenshot retains the fixture status overlay's earlier `error` label after successful Retry; this label is not the current player state, and is an existing harness-display limitation rather than runtime acceptance evidence. Fixture lights at1 and0.25 produce identical sampled grey128→140/140/138, white255→227/227/227 and black0→0. These remain fixture-light measurements, not the still-pending full-world capture or human color approval.

Fresh raw receipt/captures preserved at `.runtime/s1-498-closure/screen-9249aa04/` as well as `output/playwright/ipic-screen/`. The original external lock holder and human-Studio baseline finished; queue now advances behind live PR504 full verification PID1704. Remaining local handles: two-browser1483 and full-world colour97881. Do not restart them.

### Main refresh after #573 — 2026-10-22

Main advanced to `3bae89fb` while the remaining browser sessions were queued. GitHub expected-head update from `9249aa041db5b0cb314f5b8eca53354215eddf7a` produced `210cfbbce3e2fd579e56c1f447411aa86ded57cf`, adopted with `git merge --ff-only`; `git merge-base --is-ancestor origin/main HEAD` passed. The incoming changes add character-tier browser coverage and reports; screening runtime, the pending color harness, and `uv.lock` are unchanged. The prior all-green CI receipt belongs to `9249aa04`; checks for the new head must finish before readiness. Local two-browser session `1483` and full-world color session `97881` remain live in the shared browser queue.

### Local two-browser completion — 2026-10-22

`pnpm run test:screening` (session `1483`) completed with exit 0 at head `210cfbbce3e2fd579e56c1f447411aa86ded57cf`: all 19 checks passed in Chromium 156.0.8078.4, with no reported errors. Convergence below 500 ms occurred at the first sample (11 ms), paused spread was 0 ms, and the fixture replacement showed no stale frame in 51 rendered frames. The second approved film supplied its own 1280×720 texture, captions, transcript and decoded audio (101156 bytes). The emulated hidden/frozen return presented a frame 63 ms from room time, 460 ms after showing. Host loss paused the room without promotion; leaving released the local player. Raw JSON and five fresh panel/chooser images are preserved with SHA-256 hashes in `.runtime/s1-498-closure/two-browser-210cfbbc/`; older soak files were excluded. This is local automated browser evidence, not physical device, listening or human accessibility acceptance. Full-world color session `97881` remains queued behind Campus 507 publication verification.

### Full-world capture exposed follow-up work — 2026-10-22

Color capture session `97881` exited 0 at `210cfbbc`, using normal world rendering, loaded environment and Sharpest AO/bloom on Apple M5 Max Metal. Raw receipt and nine images are preserved in `.runtime/s1-498-closure/colour-before-210cfbbc/` with hashes. Inspection found the requested hour 0 was clamped by the UI to 7; the original midnight label is invalid and must be corrected. The same paused video frame at 2.070319 s differs under noon and dusk lighting: cyan (0,255,255) became (199,241,240) at noon and (178,235,232) at dusk; black became (10,9,9) and (5,4,3), white became (241,240,240) and (235,234,233). Orientation, frame numeral and fitted aspect are intact. The video is bound as both surface and emissive map; independent review is assessing the double-lighting requirement before any readiness claim. Renderer tone mapping remains unchanged. Capture success is not color acceptance.

### Lighting regression and CI checkpoint — 2026-10-22

Independent review confirmed that the borrowed Standard material adds diffuse/specular lighting to the video emission. The proposed screen-local correction replaces outgoing light with the masked total emissive radiance; it preserves renderer tone mapping and borrowed-material restoration. A fixed-exposure GPU regression varies direct and environment lighting on the same paused frame. Session `40205` is queued before applying the correction, preserving a real red baseline. The reviewer accepted its owned PMREM target and guaranteed cleanup; GPU resource-baseline verification remains pending.

The hour-clamping capture defect has a red/green helper regression (8/8 green); the next full-world run requests and asserts noon (12), dusk (19), and dawn (7). Previous hour-0 artifacts remain preserved with their invalid midnight label explicitly recorded above. Hosted Verify run `39845072342` attempt 2 passed at exact head `210cfbbce3e2fd579e56c1f447411aa86ded57cf`, including aggregate `preview`; this does not cover the uncommitted harness or pending shader correction.

### Double-lighting reproduced and corrected — 2026-10-22 21:30Z

The fixed-exposure GPU regression (session `40205`) failed on the unchanged production shader at `210cfbbc`: the same direct grey pixel remained (128,128,128), while its screen sample changed from (134,134,134) to (247,247,246) under added direct/environment lighting. Failure receipt, captures and hashes are preserved in `.runtime/s1-498-closure/lighting-red-210cfbbc/`; the full log is `lighting-red.log`. This isolates added surface lighting from time-of-day exposure changes.

The screen-only shader now assigns masked `totalEmissiveRadiance` to outgoing light, with a new program cache suffix. The existing matte fit, borrowed properties, material restoration, global exposure/tone mapping, geometry and server authority remain unchanged. Five focused suites (player, screen binding, UI, media and capture helper) pass 66/66 with zero skips; fixture integrity and diff whitespace checks pass. Independent production-diff review is running. GPU green session `82193`, corrected full-world capture `40768`, and fresh core `1749` are live; none is yet a pass.

Independent reviewer approved the production lighting diff at source-review level and verified the saved GPU red receipt. Their independent screen-binding/capture run passed 14/14 and diff whitespace checks passed. Review confirms global tone mapping, fog and postprocessing remain unchanged and borrowed-material restoration is intact; it explicitly excludes pending GPU green and corrected full-world capture acceptance. The requested two-browser screening journey is also rerunning after the shader correction.

### Core after lighting correction — 2026-10-22 21:35Z

`PATH="$PWD/.venv/bin:/opt/homebrew/opt/python@3.12/libexec/bin:$PATH" pnpm run verify` exited 0 after the shader correction: tooling 173/173, preview 3717 passed/1 existing skip, server 732 passed/212 Redis skips, desktop 115 passed/3 Windows skips, Python 145 passed, build/lint/format/demo/secret checks passed. The demo verifier returned its expected blocked exit 2. Receipt `core-lighting-210cfbbc.json`, full log `core-lighting.log`, and source hashes `core-lighting-source-sha256.txt` are preserved under `.runtime/s1-498-closure/`. This dirty-worktree core receipt does not establish Redis, GPU/browser, native, human or production acceptance. GPU `82193`, full-world `40768` and two-browser `29647` remain live queued; core `1749` is terminal and must not be polled again.

### GPU red/green and full-world comparison — 2026-10-22 22:28Z

GPU session `82193` exited 0 on Chromium 156.0.8078.4 / Apple M5 Max Metal. At fixed exposure 0.95, the same decoded grey (128,128,128) now renders (134,134,134) under both low and high direct/environment lighting; white is (225,225,225) and black (0,0,0) under both. The unchanged shader had rendered that grey as (134,134,134) versus (247,247,246), so the GPU regression is red then green. Existing aspect/matte, source fallback, held-response stale-pixel, restart and playback checks pass; presented frames advance 8 to 51, Stop restores the material exactly, and all 13 film textures are disposed. No browser errors. Autoplay was allowed, so refusal remains unit/device evidence. Raw successful artifacts are preserved with hashes in `lighting-green-210cfbbc/`, excluding the stale failure image.

Full-world session `40768` exited 0 with normal production rendering, loaded environment and Sharpest AO/bloom. All captures hold the same paused frame at 2.073963 seconds and assert actual hours 12, 19 and 7. Noon exposure is 0.95, dusk/dawn 0.836. At the first sampled row, noon black is (0,0,0), cyan (148,225,224), blue (0,0,225), red (247,4,19), white (225,225,225); dusk/dawn black is (0,0,0), cyan (135,221,219), blue (0,0,219), red (239,0,15), white (220,220,220). Direct pixels and all 35 paired samples per hour remain in the receipt. Direct and three world images were inspected: same numeral/orientation, full content and independent black mattes. Global tone mapping/exposure/postprocessing are preserved, so direct RGB equality is not claimed. Human color/black-level approval remains #502 Screen quality. Fresh receipt plus nine images are preserved with hashes in `colour-after-210cfbbc/`, excluding obsolete hour-0 files. Both artifact directories are under `.runtime/s1-498-closure/`.

GPU `82193` and color `40768` are terminal success; do not poll them again. Two-browser `29647` remains live. Next: consume it, reconcile final checklist, publish verified changes and exact evidence, refresh main and pass final-head hosted checks before marking #571 ready. No merge or deployment authorized.


### Final local evidence reconciliation — 2026-10-22 22:32Z

The final post-fix `pnpm run test:screening` receipt reports passed with 19 checks and no errors: convergence 8 ms, paused spread 0 ms, no stale image in 59 replacement frames, second approved film metadata/captions/transcript and 41112 decoded audio bytes. Emulated foreground recovery presented a frame 44 ms from the room and 353 ms after showing. Host loss paused at 9.965 seconds without promotion. Receipt plus five fresh screenshots and SHA-256 manifest are retained in `.runtime/s1-498-closure/two-browser-lighting-210cfbbc/`; old soak screenshots are excluded. The process handle has expired; the terminal passed receipt and final log are the retained result. Audio decoding is not listening and CDP background emulation is not physical-device acceptance.

All fresh local receipts above describe `210cfbbc` plus the reviewed source patch, whose hashes are recorded in core/full-world evidence. Current main additionally contains character-fidelity #545 and Python dependencies #553. Publish this verified patch, integrate current main, and establish exact-final-head hosted checks before ready status. No merge/deploy/issue closure is authorized.

Remaining #502 rows for Val and the acceptance reviewers: physical macOS Safari/iPhone core journey, codec/fallback/autoplay and foreground recovery; presented-frame timing on additional declared GPUs; screen color/black-level approval; actual listening, local lip-sync and correction audibility; touch, screen reader, keyboard/focus and reduced-motion human review; physical-device warm-up plus ten resource cycles, serving/performance and compatible release/rollback smoke. Existing local fixtures, width emulation and decoded audio are scoped engineering evidence only.

## S1 post-merge pass — 2026-10-24 (Claude Code, task `ipic-screening-s1-postmerge-498`)

### Baseline

#571 merged as `167048c3` from reviewed head `ce2d56b3` (hosted Verify green via `pnpm run land`). That head also carries `31b7edf0`, which this ledger never recorded: a resume's pending `play()` no longer drops the paused film into `loading`. Before that fix, every host Resume and every foreground recovery unbound the texture, flashed "Loading the film…" and blanked captions until `play()` answered. Main `f33c914b` was then reviewed independently and read-only against the S1 requirements.

### Findings and dispositions (PR #650, branch `test/screening-s1-postmerge-498-20261024`)

- **Fixed: missing file while online reported as a decoder failure.** Chromium reports a 404 or HTML fallback as MediaError 4, the same code as an unreadable file. Each encoding is still tried once and the failure is immediate (`decode`, Retry). Then one generation-fenced HEAD per code-4 source corrects the reason to `network` when the server did not send the file.
- **Fixed: stale diagnostics across sources.** `driftMs`, `measuredDriftMs` and `rate` reset with each source. `measuredDriftMs` is not sampled while `element.seeking`, so a seek request is not reported as convergence.
- **Fixed: replayed host reply could move the panel back to an older film.** One `adopt()` revision/epoch guard now covers snapshots, sync replies and host replies.
- **Fixed: a drift seek unbound the screen and recreated the texture.** Chromium drops `readyState` to 1 while seeking. The UI now holds the binding for the same generation and size.
- **Fixed: a file a few ms short of the shared duration restarted from frame 0.** An ended element is not replayed.
- **Unchanged, unreachable: old-epoch view after reset.** The server rejects a wrong epoch, and replay keys include the epoch.
- **Fixed (second review of this diff):**
  - Play film before any decoded frame claimed `ready`; it now stays `loading` under the stall deadline.
  - Play film during a seek.
  - A probe test race.
  - A seek flicker.

  A recheck confirmed all four.

### Evidence

- **Unit, red then green.**
  - Main's player and UI: 7 of 8 new player tests and 2 of 3 new lifecycle tests fail.
  - Focused screening suites at `b612ac51`: 95/95, 0 skipped.
- **Core.** `pnpm run verify` passed on clean `b612ac51` (load 16.8), receipt `.runtime/s1-postmerge/core-final.json`:

  | Suite | Result |
  | --- | --- |
  | Tooling | 237/237 |
  | Preview | 4024 passed, 1 existing skip |
  | Server | 888 passed, 223 Redis skips |
  | Desktop | 115 passed, 3 Windows skips |
  | Python | 156 passed |

  An earlier attempt failed only the known load-sensitive `land-pr` timing test. That test passed 29/29 alone, and its log is kept.
- **Hosted CI.** `b612ac51`: 22/22 success.
  - `ed1b6c29` changes only the e2e fixture page, giving `test-missing` a WebM and an MP4 source.
- **Actual screen, red.** Main `f33c914b` plus only the new checks, on Chromium 156.0.8078.4 with ANGLE Metal on Apple M5 Max:
  - The drift seek left 1 of 40 frames unbound and created a new texture.
  - The missing file reported `decode` with code 4.
- **Actual screen, green.** `node preview/e2e/ipic-screen-runner.mjs` with the receipt's `sourceRevision` at `ed1b6c29` and a clean tree: 12/12 checks passed, no errors.
  - Seek: 40/40 frames bound, 0 textures created. The lowest `readyState` was 1, on 1 seeking frame.
  - Missing files: WebM and MP4 each tried once, both code 4, both `network`, screen unbound.
  - Presented frames advanced 8 → 51.
  - Stop restored the material exactly and disposed all 13 textures.
  - Autoplay with sound was allowed, so the refusal path is unit-tested only.
  - Inspected the 4:3 capture (all four red edges whole, black pillarbox mattes, no stretch) and the seated short capture (full frame, upright).
- **Two-browser journey, green.** `node preview/e2e/ipic-screening-runner.mjs` on the same clean `ed1b6c29` tree: 19/19 checks passed, no errors.
  - Presented-frame spread: median 17 ms and max 33 ms over 16 samples; converged after 4 ms; paused spread 0 ms.
  - The fixture replacement had no stale frame in 74 rendered frames.
  - The second approved film decoded 42392 audio bytes.
  - Emulated background return: first presented frame 1 ms from the room, 33 ms after showing.
  - Host loss paused at 10.08 s without promotion.
  - The profile is headless SwiftShader on one machine, so this is not a GPU timing claim.
- **Artifacts.** Receipts, captures and `artifacts-sha256.txt` (15 files) are in `.runtime/s1-postmerge/`. `green-head.txt` there shows `b612ac51` only because it was written at queue time; the receipts are authoritative.

### Interfaces for S2/S3/S5

- `stats()` adds `seeking` and `presented.shownAt`.
- `attempts[]` items may carry `code`.
- `network` also covers files missing while online. The reason may be refined from `decode` to `network` after one probe round-trip, signalled by `onChange`.
- `createScreeningPlayer` takes an optional `probe`. Public methods are unchanged.
- No server, catalog, media, timeline, permission or cancelled-seek change.

### Retirement

- Old worktree `river-oaks-screening-498-resume` (`fix/screening-lifecycle-498-20261020` at `984a5759`, in main) is blocked: `ownership-not-released`, `session-release-missing-or-stale`, `ignored-data`. Owner `codex:S1-closure-20261022` must release it.
- Orphan `sweep/pr571` belongs to the PR sweep session.

Neither was touched.

### Still open (#502, Val and acceptance reviewers)

- Physical macOS Safari and iPhone journeys: codec fallback, autoplay refusal and foreground recovery.
- Presented-frame timing on further declared GPUs.
- Human color and black-level approval.
- Listening and lip-sync.
- Touch, screen-reader, keyboard/focus and reduced-motion review.
- Physical-device resource cycles.

### Next

Merge current main into the branch, then:

1. Run the focused suites.
2. Push and pass hosted checks on the final head.
3. Mark #650 ready for review.

Merge, deployment and issue closure need Val's authorization. Rollback: revert #650; it has no persisted, media-id or server effect.
