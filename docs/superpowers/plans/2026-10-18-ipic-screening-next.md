# IPIC screening, next milestone: choose a film, watch together, return to the world (#497)

Coordinator ledger for tracker #497 and packages #498–#502 (umbrella #359). #502 owns this evidence matrix.

- **Owner:** `claude:river-oaks-4b (6191db50)`. Tasks are in the primary's live register: `ipic-screening-switching-498`,
  `ipic-screening-chooser-499`, `ipic-screening-viewing-500`, `ipic-screening-second-short-501` and
  `ipic-screening-acceptance-502`.
- **Baseline:** main `153471bc` (2026-10-18 12:4xZ). The tracker's planning SHA `a5e2a8ec` and #496's `3592780c` are
  evidence only, not reset targets.
- **Milestone:** an authorized host chooses between two approved shorts. A friend joins partway, and both watch on
  IPIC's screen with their own sound, captions and optional screen-focused camera. Both then return to the lounge
  and street cleanly.

## Packages

| # | Package | Branch / worktree | State | Next action |
| --- | --- | --- | --- | --- |
| S1 #498 | Switching, mattes, fallback, failure states | draft **#513**, `fix/screening-switching-498-20261018` | `6eee1ce9`: hosted CI all green, including the extended screening journey on Mesa; ipic-screen-runner passed | Ten-cycle soak (load-gated), then ready for review |
| S2 #499 | Host-only approved-film chooser | draft **#514** (base: #498's branch) | `f85060f3`: hosted CI running | Local chooser journey (load-gated) |
| S3 #500 | Screen focus, Join screening, local audio | draft **#515** (base: #499's branch) | `0526fd42`: hosted CI running | Visit journey, normal and reduced motion (load-gated) |
| S4 #501 | Second short "Two Seats, One Screen" | draft **#516** (tooling only, no media) | Val chose a new in-game scene (14:30Z). Script, voices, score and cut/mix are ready; the dry run is an engineering candidate | In-game capture (load-gated below 40), the cut, the checks, then Val's review of the bytes |
| S5 #502 | Evidence matrix, device/human rows, release handoff | `test/screening-acceptance-502-20261018`, `../river-oaks-screening-502` | active | Presented-frame sampler for the journey and soak; baseline on main |

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
| A paused film that never loads is reported stalled | #498 | 4b | Found by fixture-browser run 1; unit regression failed before the fix | pass (unit) | fixture-browser rerun |
| Presented frames (requestVideoFrameCallback) and raw drift | #498, #502 | 4b | unit | pass (unit) | #502 sampler in the journey and soak |
| Host-only chooser; fixture excluded; client claims ignored | #499 | 4b | unit: 5 client regressions failed on main 153471bc and pass; server guards pass on both | pass (unit) | journey-sw (host chooses the fixture in the chooser; 390 and 320 px) |
| Ended film A, chosen film B; lost-reply retry keeps the operation id | #499 | 4b | unit (command), server (A ended → B; race; same id with another film refused) | pass (unit, server) | journey-sw |
| An unknown film (from a newer build) is unsupported, never the previous film | #499 | 4b | unit: failed on main (kept playing the previous film) | pass (unit) | — |
| Focus on screen / Look around; seat and exit unchanged | #500 | 4b | unit: the seated eye needs 103° (front) / 57° (back); centre-line framing fits within 80° | pass (unit) | journey-sw (`ipic-visit.js`, both motion settings), in-world-gpu capture |
| Stop watching → Join screening at the room's time | #500 | 4b | — | implemented | journey-sw |
| Truthful sound/volume; no audio after leaving | #500 | 4b | unit (slider only where volume works; refused-sound text) | pass (unit) | device rows |
| Second approved film with dialogue and music | #501 | Val (media, approval) | intake tooling (unit) | **blocked** | Val's choice of source, voices, music and likeness |
| Two films, two clients, late join, pause/resume/stop | #502 | 4b | baseline: dd9b61ee journey 30/30 (one film) | pending | after #499 |
| Host loss, stale or duplicate commands, competing hosts | #502 | 4b | baseline journey (stale/replay) | pending | extend |
| Interrupted loads, offline, background/foreground | #502 | 4b | — | pending | — |
| Warm-up plus ten cycles of resources with a film change | #502 | 4b | baseline: dd9b61ee soak 11/11 (one film) | pending | extend the soak with a film change |
| Serving: MIME types and byte ranges on the intended path | #502 | 4b | Production, read-only, 2026-10-18 ~14:45Z: a 1 KB `Range` GET of each file on typesafe.place returned 206 with `accept-ranges: bytes`. Types: `video/mp4`, `video/webm`, `text/vtt; charset=utf-8`, `image/jpeg`. Total sizes match `sources.json`: 13,313,704; 9,289,288; 486; 93,773 | pass (types and ranges) | Val: the cache decision below |
| Serving: caching | #502 | Val (decision) | The same responses: films and captions are `cache-control: private, no-store` with CDN `MISS`, because `vercel.json`'s non-image `/assets` rule (from #98, written for the gated `.js` and `.css`) also matches `.mp4`, `.webm` and `.vtt`. Every visit re-downloads 9–13 MB per film. The poster is `public, max-age=3600` | finding | Proposal below; production config, so Val decides |
| Rollback: retained ids and durations, compatible build | #502 | 4b | docs/screenings.md rule | pending | test with a two-film checkpoint |
| macOS Safari (real) | #502 | Val (device) | — | **unassigned device run** | Val runs it; the steps go in the #502 handoff |
| iPhone Safari (physical) | #502 | Val (device) | — | **unassigned device run** | as above |
| Other GPUs (beyond Apple M3 Max) | #502 | Val (device) | — | unassigned | name the devices |
| VoiceOver and keyboard human review | #502 | Val (human) | — | unassigned | Val, later (#359) |
| Listening review of dialogue and music | #500, #502 | Val (human) | — | blocked on #501 | — |
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
