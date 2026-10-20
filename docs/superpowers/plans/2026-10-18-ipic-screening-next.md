# IPIC screening, next milestone: choose a film, watch together, return to the world (#497)

Coordinator ledger for tracker #497 and packages #498–#502 (umbrella #359). #502 owns this evidence matrix.

- **Owner:** `claude:river-oaks-4b (6191db50)`. Tasks are in the primary's live register: `ipic-screening-switching-498`,
  `ipic-screening-chooser-499`, `ipic-screening-viewing-500`, `ipic-screening-second-short-501`,
  `ipic-screening-second-short-register-501` (#547), `ipic-screening-acceptance-502` and
  `ipic-screening-ledgers-delivered-497` (this update). All but the last two are retired.
- **Baseline:** main `153471bc` (2026-10-18 12:4xZ). The tracker's planning SHA `a5e2a8ec` and #496's `3592780c` are
  evidence only, not reset targets.
- **Milestone:** an authorized host chooses between two approved shorts. A friend joins partway, and both watch on
  IPIC's screen with their own sound, captions and optional screen-focused camera. Both then return to the lounge
  and street cleanly.

## Packages

| # | Package | Branch / worktree | State | Next action |
| --- | --- | --- | --- | --- |
| S1 #498 | Switching, mattes, fallback, failure states | **#513**, merged `1b38e44d` (2026-10-18 21:04Z) | Deployed 21:05:06Z; retired | — |
| S2 #499 | Host-only approved-film chooser | **#514**, merged `1a61e448` (21:45Z) | Live with #529's deploy (22:02:21Z); retired | — |
| S3 #500 | Screen focus, Join screening, local audio | **#515**, merged `225acfc9` (22:29Z) | Deployed 22:29:46Z; retired | Val: the film against live voice chat |
| S4 #501 | Second short "Two Seats, One Screen" | **#516** tooling, merged `b76ab77c` (2026-10-19 05:02Z); **#547** the approved film, merged `a4b889e3` (05:42Z) | Val approved the exact bytes (04:10Z); deployed 05:03:12Z and 05:43:17Z; production serves the approved bytes; both retired | Val: listening on headphones and a device speaker |
| S5 #502 | Evidence matrix, device/human rows, release handoff | **#520**, merged `7fcce0f6` (2026-10-18 23:31Z), `test/screening-acceptance-502-20261018` | Deployed 23:31:50Z. The worktree still serves Val's local dev server on :5180 | The two-film journey on main with both approved films; Val's device rows |

Integration order: #498 → #499 → #500 → #502. #501 runs in parallel, and until it delivers, #499, #500 and #502
work on the fixtures. Shared hunks get one owner at a time: `ipic-screening-ui.js` and its CSS (#498 lifecycle, then
#499 chooser, then #500 viewing) and the catalog (`screening-contract.js` and `sources.json`: #499, then #501's
registration).

## Checked at pickup

- **`ipic-final-evidence-20261018`** (blocked, owner none) parks `verify/ipic-final-20261018` at main `dd9b61ee` with no
  commits. Its evidence is the latest acceptance baseline for this milestone: the journey passed 30/30 and the warm-up
  plus ten-cycle soak passed (#359 issuecomment-6248475151). Its worktree was last touched about 09:56Z. Its
  `nextAction` says to cancel it with `project:cancel` once the 12 h cutoff passes (about 21:56Z). I have not acted on
  it: the cancellation needs Val's authorization in this session.
- **`screening-seek-lead`** was cancelled with Val's authorization on 2026-10-18 and superseded by #472's one-second
  keyframes. Its archive is `cancel-stale-HYddp1`. **Do not resume it.** No package revives a seek workaround or adds
  host seeking.
- **Production (#359 issuecomment-6248836713 and -6249014217):** the Jevica-account IPIC host grant is deployed with no
  expiry. Val reported Start film appearing for that account. No signed-in Start, and no viewer result, has been
  recorded. Neither the grant nor the deployment is re-requested here.

## Evidence levels

`unit` (node tests) · `fixture-browser` (preview/e2e/fixtures/ipic-screen.html: real decode, real screen material) ·
`journey-sw` (two real browsers, SwiftShader or Mesa) · `in-world-gpu` (the game on Metal ANGLE, captures at player
height) · `device` (a named physical device) · `human` (a named reviewer). Emulated widths and WebKit automation are
not device evidence. Self-review is not independent review.

## Acceptance matrix

| Case | Package | Owner | Evidence so far | Result | Next action |
| --- | --- | --- | --- | --- | --- |
| Switch original → fixture → original; a late play is fenced | #498 | 4b | unit (failed on main 153471bc, passes on the branch); journey-sw on hosted CI (Linux, Mesa) at `6eee1ce9` | pass | — |
| Different decoded sizes get a new texture and fit | #498 | 4b | unit; fixture-browser (Metal, M3 Max): one texture per film, 10 created and 10 disposed; journey-sw on hosted CI: fixture 640×360 replaced short 1280×720 | pass | — |
| Black mattes drawn by the screen; borderless 16:9, 4:3, 2.39:1, 4:1 | #498 | 4b | fixture-browser: mattes 0,0,0; all four edges show the film's own colour; orientation right | pass | Val: in-world design review |
| Real-screen colour against the direct video | #498 | 4b | fixture-browser: black 0→0, grey 128→143, white 255→227 (global ACES 0.95), same with house lights at 1 and 0.25 | measured; no change made | Val: design review |
| One try per encoding; Retry is a new attempt; the decoded encoding is recorded | #498 | 4b | unit; fixture-browser: non-film WebM → decode, MP4 → decoded | pass | Safari/iOS device row |
| Autoplay refusal versus decode, network, stall and abort | #498 | 4b | unit; fixture-browser: stall → Retry plays, offline → network → Retry plays, interrupted load quiet. Headless allowed sound autoplay, so the refusal path is unit-only | pass (refusal: unit only) | device row (iOS Safari refuses sound autoplay) |
| A paused film's frame reaches the screen | #498 | 4b | Found by fixture-browser run 2 (screen black for a paused frame; main has the same behaviour); fixed in `3561d5ba` | pass | — |
| Stop leaves the screen idle; no stale frame while loading | #498 | 4b | journey-sw on main 153471bc: **failed** (`{state: idle, attached: true}`). in-world-gpu, seated eye: main stays attached after Stop, and 3 of 4 switch frames showed the old film; the branch was idle, 0 of 44. Hosted CI at `6eee1ce9`: "no stale frame in 64 rendered frames" | fail on main, pass on the branch | — |
| A paused film that never loads is reported stalled | #498 | 4b | Found by fixture-browser run 1; the unit regression failed before the fix. Fixture-browser (`IPIC_GPU=1 node preview/e2e/ipic-screen-runner.mjs`, Metal, M3 Max, Chromium 156.0.8078.4): run 4 on #498's branch, and again on main `f24e7d83` (2026-10-19 19:32Z), 8/8: a load that never progresses reports “stalled” after the limit, and Retry then plays it | **pass** | — |
| Presented frames (requestVideoFrameCallback) and raw drift | #498, #502 | 4b | unit; the #502 sampler in the integrated soak (#520 `2df7a0a8`, 17:15–17:20Z, load 29–53, SwiftShader): in each of 11 cycles the two viewers' presented frames were 8–34 ms apart (measurement uncertainty 85–94 ms), and the viewer's media advanced at 1.01–1.05 × wall time | pass | — |
| Host-only chooser; fixture excluded; client claims ignored | #499 | 4b | unit: 5 client regressions failed on main 153471bc and pass; server guards pass on both. Hosted journey (Mesa) at `2bb8eaae`: the chooser shows 2 films with the short chosen ("0:53 · Silent · English captions"); the viewer has none; a choice alone changes nothing shared; the select and Start film are on screen, uncovered and at least 44 px tall at 390 and 320 px (the first hosted run caught a 36 px select on Linux; fixed) | pass | Val: keyboard, touch and VoiceOver on a device |
| Ended film A, chosen film B; lost-reply retry keeps the operation id | #499 | 4b | unit (command), server (A ended → B; race; same id with another film refused); hosted journey: the host chose the fixture after the short and started it | pass | — |
| An unknown film (from a newer build) is unsupported, never the previous film | #499 | 4b | unit: failed on main (kept playing the previous film) | pass (unit) | — |
| Focus on screen / Look around; seat and exit unchanged | #500 | 4b | unit: the seated eye needs 103° (front) / 57° (back), so focus frames from the centre line. Hosted visit journey (Mesa) on #515's heads. GPU visit (`IPIC_GPU=1 node preview/e2e/ipic-runner.mjs`, Metal, M3 Max, Chromium 156.0.8078.4, 1280 × 800) on `0adfc53e` and again on main `f24e7d83` (2026-10-19 19:17–19:23Z), normal and reduced motion: 11/11 each, the whole film framed above the panel at 80° from 3.75 m (row 2.79 m); seat, avatar and Stand up unchanged; Look around and a drag return the seated view. In-world focus inspection on `0adfc53e`: both rows fit (front 80° from 3.49 m, back 53.6° at 5.79 m) | **pass** | Val: device rows |
| Stop watching → Join screening at the room's time | #500 | 4b | The visit journey's step, hosted (Mesa) and on Metal on main `f24e7d83` in both motion settings: Stop watching released the film, and Join screening returned to the running film at the room's time without sending a command | **pass** | — |
| Truthful sound/volume; no audio after leaving | #500 | 4b | unit (slider only where volume works; refused-sound text) | pass (unit) | device rows |
| Second approved film with dialogue and music | #501 | Val (media, approval) | `ipic-two-seats-v1`, approved 2026-10-19 as exact bytes (WebM `24f08a74`, MP4 `85b1079e`, captions `2a6b54e0`, poster `2e53991c`). Intake, decode (Chromium 156, Metal) and in-world playback in both rows passed; 79/79 media and contract tests on main `a4b889e3`; production serves the same bytes. Details: `2026-10-18-ipic-second-short.md` | **pass** (approved, registered, deployed) | Val: listening (below) |
| Two films, two clients, late join, pause/resume/stop | #502 | 4b | Hosted journey (Mesa) on every head: two browsers, late join, pause, stop, the host choosing and starting a second film (the labelled fixture). Integrated soak: 11 late joins, each converged within 500 ms in 3–9 ms (worst spread after 15–283 ms). With the second **approved** film: the two-browser journey on main `a4b889e3` (local, SwiftShader, 2026-10-19 05:47–06:18Z, load 9–18) passed 18 checks. The host chose `ipic-two-seats-v1` and started it, and it replaced the first short with its own 1280×720 texture, with no stale frame in 53 rendered frames. Its captions, transcript and audio (37,657 bytes decoded) followed it. The background-and-back first frame was 254 ms from the room, and host loss paused at 9.72 s. Since this update the committed journey (`preview/e2e/ipic-screening.js`, hosted CI's `pnpm run test:screening`) plays all three: the short, the fixture, then the host chooses `ipic-two-seats-v1` and starts it, and the viewer gets its own 1280×720 texture, captions, transcript and decoded audio. Local run on `f24e7d83` plus the change (SwiftShader, 2026-10-19 19:28–19:31Z, load 21–48): 19/19, the second film's WebM decoding 45,870 audio bytes; background-and-back 127 ms from the room. Three earlier runs on the candidate at load 20–53 failed load-bound steps | **pass** with both approved films (local) | Hosted CI on the PR that adds the step |
| Host loss, stale or duplicate commands, competing hosts | #502 | 4b | Server unit tests: leaving town, walking out and a lapsed grant pause at the server position; two hosts racing (one wins, the other is stale). Journey: a resent start applies once; stale revision, earlier epoch and reused operation id refused. Journey (local, SwiftShader, 18:33Z): the host walks out mid-film; the server paused at 10.571 s, the viewer's element paused at 10.571 s, no host controls, nobody promoted (also 19.662 s on the 17:39Z run) | pass | — |
| Interrupted loads, offline, background/foreground | #502 | 4b | fixture-browser (#498): stall → Retry plays, offline → network → Retry plays, interrupted load quiet. Journey (emulated; headless Chromium keeps background tabs visible): the page marked hidden, its film paused as Safari pauses hidden media, its JavaScript frozen 8 s (CDP `Page.setWebLifecycleState`), then shown. The film had not moved while away; 254 ms after showing it had seeked, and its first **presented** frame (requestVideoFrameCallback) came 338 ms after showing, 59 ms from the room. Finding: disconnected beside a seat, `shared-seating-ui.js:51` throws every frame before the draw (seen in the 17:00Z #501 capture); the guard is in open PR #489, not duplicated | pass (emulated) | A phone lock and app switch are device rows (Val) |
| Warm-up plus ten cycles of resources with a film change | #502 | 4b | Integrated soak on #520 `2df7a0a8` (#498 + #499 + #500 `b9d78b86` + #502), 17:15–17:20Z, load 29–53: warm-up plus 10 cycles, each changing the film from the short to the fixture (its own 640×360 texture on screen in 1.1–4.1 s). Startup per cycle: first presented frame 1.8–3.9 s after the trip in began (7.9 s on the cold first cycle). No growth in media elements, audio contexts, intervals, documents, textures or geometries; DOM nodes 5,923 → 5,941, listeners flat. Baseline on main: 11/11 with one film | pass | — |
| Serving: MIME types and byte ranges on the intended path | #502 | 4b | Production, read-only, 2026-10-18 ~14:45Z: a 1 KB `Range` GET of each file on typesafe.place returned 206 with `accept-ranges: bytes`. Types: `video/mp4`, `video/webm`, `text/vtt; charset=utf-8`, `image/jpeg`. Total sizes match `sources.json`: 13,313,704; 9,289,288; 486; 93,773 | pass (types and ranges) | Val: the cache decision below |
| Serving: caching | #502 | Val (decision) | The same responses: films and captions are `cache-control: private, no-store` with CDN `MISS`, because `vercel.json`'s non-image `/assets` rule (from #98, written for the gated `.js` and `.css`) also matches `.mp4`, `.webm` and `.vtt`. Every visit re-downloads 9–13 MB per film. The poster is `public, max-age=3600` | finding | Proposal below; production config, so Val decides |
| Rollback: retained ids and durations, compatible build | #502 | 4b | Server test on #520: a checkpoint whose timeline and receipts name both films restores playing (the second film resumes) and stopped, and a resent start after the restore applies once. Older client, newer catalog: #499's unknown-film path (unsupported; no other film's frames or text). Unknown id in a checkpoint: fails closed (existing test) | pass | — |
| Isolated Redis (diff-required for #499's server tests) | #502 | 4b | `REDIS_URL` on a private redis-server (port 16591, scratch dir): screenings transport + screenings tests 17/17, 0 skipped. Full server suite on the same Redis at load 138–154: 911/916, 4 failed (timeout-bound real-socket tests). The files with failures, rerun alone at load 65 (16:31Z): 33/33, 0 skipped | pass (the 4 failures were load) | — |
| macOS Safari (real) | #502 | Val (device) | — | **unassigned device run** | Val runs it; the steps go in the #502 handoff |
| iPhone Safari (physical) | #502 | Val (device) | — | **unassigned device run** | as above |
| Other GPUs (beyond Apple M3 Max) | #502 | Val (device) | — | unassigned | name the devices |
| VoiceOver and keyboard human review | #502 | Val (human) | — | unassigned | Val, later (#359) |
| Listening review of dialogue and music | #500, #501, #502 | Val (human) | Measured, not heard: speech over music 10.4–19.5 dB per line (median 16.9); −17.9/−18.0 LUFS, −1.6/−1.5 dBTP | **unassigned listening run** | Val: headphones and a device speaker (device runs, step 4) |
| Signed-in production host Start plus a viewer | #502 | Val (production) | Val-reported: Start film appears | unverified | Val's go only |

## Device and human runs for Val (not automated; emulation is not evidence)

Run these on a build containing #513–#515: a Vercel preview of #515, or production after release. Use two accounts:
the Jevica host account and any approved viewer. Record the device model, OS and browser version, and a pass, fail or
note for each step. Screen recordings help.

1. **macOS Safari (current), host account.** Walk into IPIC and sit in a recliner.
   - Choose the film in **Film**, then **Start film**: the screen shows the whole film with black mattes, the right way
     round.
   - **Sound on**: you hear the film (the approved short is silent, so listen to #501's film once approved). If Safari
     refuses, the status asks for **Play film** and does not claim sound.
   - **Volume**: drag the slider; the level changes.
   - **Focus on screen**, then **Look around**, then drag the view: focus ends each time, and you are still seated.
   - **Stop watching**, then **Join screening**: you rejoin at the room's time.
   - **Stand up**, then **Step outside**: the movie sound stops at once.
2. **iPhone Safari (physical), viewer account,** joining while the film plays.
   - The film starts muted. **Sound on** works after a tap, or the status asks for Play film.
   - No volume slider is offered; the device buttons control the level.
   - Captions are readable and the transcript opens.
   - **Focus on screen** in portrait (expected: the whole film may not fit) and in landscape.
   - **Stand up** stays reachable in both views.
   - Lock the phone for 30 s and come back: the film recovers to the room's time.
3. **VoiceOver (macOS or iOS).** Every control has a spoken name and state (Sound on/off, Captions, Transcript, Focus on
   screen / Look around, Stop watching, Join screening, Film); focus order and the way out are clear.
4. **Listening (after #501 is approved),** on headphones and a device speaker. Dialogue is intelligible over the music,
   and the movie and voice chat balance. Note whether the ±8 % sync correction is ever audible.
5. **Production host smoke (only with Val's go).** The Jevica account starts the film in production, and a second
   account sees it play. This is the first signed-in host action on production.

## Proposal for Val: cache the films (not applied)

- **Candidate.** In `vercel.json`, give `/assets/ipic/screening/*.(mp4|webm|vtt)` the image rule's
  `public, max-age=3600, stale-while-revalidate=86400`, ahead of the `private, no-store` rule. File names are
  per film version but are not content hashes: #472's re-encode kept the same names. So keep the cache short,
  not `immutable`.
- **Impact.** A returning viewer within an hour skips a 9–13 MB download, and Vercel's CDN can serve the bytes.
  The films are not gated (only `.js`, `.css` and `/data/` are), so nothing private would be cached.
- **Risk.** After a future same-name re-encode, a viewer could play cached old bytes for up to an hour. Durations
  are validated from the allowlist, so a mismatch shows as a slightly wrong length, not a crash.
- **Rollback.** Remove the rule and redeploy the same build.
- **Needs:** a deployment, which is Val's go. Not part of this milestone's acceptance unless Val says so.

## Release recommendation (2026-10-18, version-bound)

- **Candidate:** the stack as it lands, in order: #513 (#498) → #514 (#499) → #515 (#500) → #520 (#502), each by
  `pnpm run land <pr>`, which brings each branch up to date with main and waits for its required `preview` check.
  The release is the main merge commit of #520. #516 (#501's tooling) lands independently; it adds no media.
- **Readiness:** **engineering-ready on fixtures** once the remaining rows above pass (the extended journey and #500's
  GPU rerun). **Not two-film experience-ready:** the second approved film (#501, Val) and the device and human rows
  are open. **Not production-delivered:** nothing is merged or deployed.
- **Authority still needed, all Val's:**
  1. **Approval to land each PR.** Every merge to `main` deploys production within about 35 s, so landing is also the
     production go. A pause between merges leaves production on a consistent intermediate build: each package is
     compatible with the one before it.
  2. **#501:** approval of the exact bytes, script, synthetic voices, likenesses and music; then its registration on
     #499's branch (or a follow-up PR after #514 lands).
  3. **The signed-in production host smoke:** the deployed Jevica grant (`ipic:user_01M402HKJYDTH1QJM5NAQDZ4HH`, no
     expiry) is unchanged and not re-requested. The first signed-in Start in production, with a second account
     watching, is Val's go only (device runs, step 5).
  4. **The film cache proposal** (below): a production configuration change, separate from this release.
- **Disposition of the signed-in host smoke:** not run. Prepared steps are in the device runs above. Nothing here
  depends on it for engineering readiness; it is required for production-delivered.
- **Compatible rollback:** revert the merge on main (a new deployment of a compatible current build). Keep every media
  id and duration: `ipic-original-v1` and `ipic-fixture-v1` stay in `SCREENING_MEDIA`, and the server allowlist is
  unchanged by this stack. Checkpoints stay v11, and timelines and receipts naming either film restore (server test on
  #520). An older client meeting a newer film shows "needs a newer version", never another film's frames (#499).
  Leaving the venue restores the screen's own material (#498). Do not redeploy a build from before #429, and never
  edit production checkpoints.

## Release outcome (2026-10-19)

Val approved each landing, and each went through `pnpm run land <pr>`. Every merge deployed production.

| PR | Merge on main | Production |
| --- | --- | --- |
| #513 (#498) | `1b38e44d`, 2026-10-18 21:04Z | 21:05:06Z |
| #514 (#499) | `1a61e448`, 21:45Z | no status of its own; live with #529's deploy, 22:02:21Z |
| #515 (#500) | `225acfc9`, 22:29Z | 22:29:46Z |
| #520 (#502) | `7fcce0f6`, 23:31Z | 23:31:50Z |
| #516 (#501 tooling) | `b76ab77c`, 2026-10-19 05:02Z | 05:03:12Z |
| #547 (#501, the approved film) | `a4b889e3`, 05:42Z | 05:43:17Z |

- **Engineering-ready with both approved films.** The second approved film is registered and served byte for byte.
  The two-browser journey on main `a4b889e3` passed 18 checks with it as the second film.
- **Two-film experience-ready: not yet proven.** Listening, voice-chat balance, macOS and iPhone Safari, other GPUs
  and VoiceOver are Val's runs and are unassigned.
- **Production-delivered: code and media yes; signed-in host smoke no.** It is still Val's go only, and the deployed
  grant is unchanged.
- **Withdrawing the second film is not a plain revert of #547.** That would delete its catalog entry, and the server
  would then refuse a saved timeline that names `ipic-two-seats-v1`. Instead, ship a compatible build that drops it
  from `screeningChoices` and keeps the entry, its venue and its duration.

## Boundaries

No deployment, production configuration or grant change, signed-in host action, media publication, paid service,
production database or checkpoint operation without Val's explicit go. For any of these, prepare the candidate, its
impact and a rollback that keeps media ids and durations and restores the original screen material on a compatible
build. Commits are signed (`git commit -S`) and carry `Coven-Harness: Claude Code / claude-opus-5-5`, with no
model co-author line. Merges go through `pnpm run land <pr>`, only after Val approves.

## Log

- **12:44–13:30Z:** read #497–#502, the latest #359 receipts and the instructions; claimed the five tasks; created
  worktrees 498, 501 and 502. #498: regressions failed on main and pass on the branch; browser runs are queued behind
  other sessions' runs. #501: intake check and docs drafted.
- **13:30–14:20Z:** #498 committed (`3c440796`, `e602cdcc`, `45a9f401`) and #499 committed (`490f1ed0`, merges up to
  `af4c4942`), both signed. Core verify was green on both apart from the pre-existing penthouse idle-slice load flake,
  which fails alone on main too. Main-baseline evidence: the journey fails at Stop, and the in-world capture shows the
  frozen frame and stale switch frames. At about 14:05Z the disk filled (ENOSPC on the shared browser-lock file),
  killing the branch journey and both soaks. I freed my own regenerable `.venv` and `dist` caches; the runs are queued
  again. The first fixture-browser run found the paused-load stall (fixed in `45a9f401`). #500 implemented on
  `feat/screening-viewing-500-20261018`.
- **14:20–16:30Z:** #500 committed and stacked; #502's frames sampler, the soak's film change and the rollback guard
  committed; #501's script, voices, score and cut tooling committed on #516 (no media). Hosted CI went green on every
  head. Main moved to `1d8740ad` (#448, #468, #477, #484): the stack is 27 commits behind and merges cleanly
  (`git merge-tree`); `pnpm run land` updates each branch when it lands. Local browser runs waited on machine load
  (100–456). At 16:08Z the coven-cave dev server held 12 GB with swap at 30.3 of 31.7 GB; Val approved stopping it.
- **16:30–17:25Z:** the integrated soak passed on #520 (11/11, with the film change each cycle). The isolated-Redis
  rerun passed alone (33/33). #500's in-world Metal captures showed the panel over the focused film; fixed on
  #515 (`0adfc53e`, hosted CI green). #501's first real capture was unusable (load 212, sockets dropped); #516
  (`847aa444`) now refuses such takes, and a retake is queued. The two-browser journey gains host walk-out and an
  emulated background-and-back step.
- **2026-10-18 17:25Z – 2026-10-19 06:00Z:** Val approved landing the stack (#513 → #514 → #515 → #520), then #516.
  - **#501's second short.** Recast take 2 (19:55Z) was healthy. Candidate A's music bed left two lines under 10 dB
    of speech over music. Candidate B (bed 0.38) measured 10.4–19.5 dB, and Val approved its exact bytes at about
    04:10Z.
  - **Landing.** #547 registered the film, and Val approved landing it. Production serves the four approved files
    with the approved hashes.
  - **Journey.** The two-browser journey on main `a4b889e3`, with both approved films, passed 18 checks at load 9–18.
  - **Retirement.** All delivered worktrees are retired except #502's, which serves Val's local dev server.
- **2026-10-19 19:17–19:32Z, post-merge runs on main `f24e7d83` (Metal, M3 Max, Chromium 156.0.8078.4):**
  - the GPU visit passed 11/11 at normal motion and 11/11 at reduced motion;
  - the fixture-browser screen runner passed 8/8.

  The committed two-browser journey gains the second approved film (19/19 locally).
