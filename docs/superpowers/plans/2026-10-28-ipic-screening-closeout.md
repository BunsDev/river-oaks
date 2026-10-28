# IPIC screening closeout: #497 to "experience-ready pending only human/device rows" (2026-10-28)

Session `claude:river-oaks-de (b6b31d)`, goal set by Val on 2026-10-28. Coordinator matrix:
[2026-10-18-ipic-screening-next](2026-10-18-ipic-screening-next.md). Nothing landed earlier is redone here.

- **Tasks (live register):** `ipic-screening-webkit-mp4-502-20261028` (branch `fix/screening-webkit-mp4-502-20261028`,
  worktree `river-oaks-screening-webkit-mp4-502`) and `ipic-screening-packets-497-20261028` (branch
  `docs/ipic-screening-packets-20261028`, worktree `river-oaks-screening-packets-497`). Both from origin/main `91656cec`.
- **Files owned:** `preview/src/ipic-screening.js` (source order only), `preview/tests/ipic-screening.test.js` (one case),
  `preview/e2e/ipic-screen-engine-runner.mjs` (new), `docs/screenings.md` (Encodings), and the four ledgers named below.
- **Not touched:** media bytes, ids and durations; `screening-contract.js`; `server/screenings.js`; WorkOS/CSRF; grants;
  production configuration; other sessions' branches (the old S1 worktree `river-oaks-screening-498-resume` is still
  registered to `codex:S1-closure-20261022` and was left alone).

## Finish line 1: #498, draft #571

Already landed, so the increment is evidence, not code.

| Fact | Evidence |
| --- | --- |
| #571 independently reviewed, findings fixed | `/root/review_s1` reviewed the recovery fixes (11/11) and the diagnostic delta (1/1); the capture-order and environment-readiness findings got red/green regressions (#498 comment of 2026-10-23) |
| #571 green and current, merged | Reviewed head `ce2d56b3`, hosted Verify green via `pnpm run land`, merge `167048c3` on 2026-10-24 09:13Z; `git merge-base --is-ancestor` confirms it on origin/main |
| Post-merge review gaps closed | An independent review of main `f33c914b` found five gaps; #650 fixed them (missing-file reason, per-source diagnostics, replayed-reply guard, seek hold, end of file), 22/22 hosted checks, merge `2da76e1f` on 2026-10-25 |
| In the release candidate | Both merges are ancestors of `v0.2.2` (`f4dd959a`); no screening source changed between the tag and `91656cec` |
| Register | `ipic-screening-switching-498` delivered (#571, `167048c3`); `ipic-screening-s1-postmerge-498` retired (#650) |

The #498 box-by-box map is the 2026-10-23 comment on #498 (nine boxes → #513, #571, #520, #650); the rows it names as
#502's device/human rows are in the packet.

## Finish line 2: #502

| Item | Result |
| --- | --- |
| Stale register entry `ipic-journey-approved-film-502` | Already reconciled: retired on 2026-10-24 with #556's merge `7686554b` as evidence (delivery-convergence-20261024). Nothing to change |
| Compatibility and rollback on the current build | On main `91656cec`: `node --test server/tests/screenings.test.js server/tests/static-media.test.js server/tests/hardening-asset-cache.test.js` **19/19, 0 skipped** (rollback guard with both approved films, historical fixture reset, forged timeline, ranges and types, cache rule). `REDIS_URL=redis://127.0.0.1:62369` (this session's own redis-server, scratch dir, `--save ""`): `server/tests/screenings-transport.test.js server/tests/screenings.test.js` **19/19, 0 skipped** |
| Serving on production (read-only) | 11 files: 206 on a 1 KB range, `accept-ranges: bytes`, right types, `public, max-age=3600, stale-while-revalidate=86400`, `x-vercel-cache: HIT`; lengths equal `sources.json`; the served second-film WebM hashes to the approved `24f08a74`. Receipt: scratchpad `serving-check-20261028T13*.txt` (this machine; summarised in the matrix) |
| Startup, cold against warm | Full GETs of the 12.9 MB WebM from this laptop: 0.49 s (cache-busting query), 3.73 s, 1.13 s; first byte 0.18–0.26 s. A bound, not a benchmark; the matrix row says so |
| MP4-in-WebKit option | Draft PR from `fix/screening-webkit-mp4-502-20261028` (below). Unmerged; offered for the case where Safari plays the WebM silently |
| Device and smoke packet for Val | The matrix's "Device and human runs for Val" section, now with a failure-to-fix table, exact production-smoke steps, the chooser device checklist (#499) and a pointer to the listening form (#501) |

### The option branch

- **Change.** `preferredScreeningType(navigator)` returns `video/mp4` when `navigator.vendor` is `Apple Computer, Inc.`
  (Safari on macOS and every browser on iOS; Chromium reports Google and Firefox nothing), else null.
  `screeningSources(media, element, preferred)` keeps the playable list and moves the preferred type first; it never
  adds an encoding the browser refused. `createScreeningPlayer` takes `preferType` (default from the navigator; tests
  pass their own). One try per encoding per attempt, Retry and every other behaviour are unchanged.
- **Why.** The 2026-10-19 engine check: WebKit answers "probably" for both encodes, the MP4's AAC was audible through
  Web Audio, the WebM's Opus was not measurable. The catalog lists the WebM first, so Safari plays it today.
- **Regression (red first).** `preview/tests/ipic-screening.test.js`, "where the engine is WebKit, the MP4 is tried first
  and the WebM stays the fallback (#502)": failed on main (`preferredScreeningType is not a function`), passes after.
  Focused suites after: **79/79, 0 skipped** (`ipic-screening`, `-lifecycle`, `-ui`, `-screen`, `screening-media`,
  `screening-contract`). `node scripts/make-screening-fixture.mjs --check`: 11 files of 3 films, unchanged.
- **Engine runner (new).** `node preview/e2e/ipic-screen-engine-runner.mjs webkit|chromium` opens the real screen
  fixture page, shows `ipic-two-seats-v1` and records what decoded. WebKit 27.2: vendor Apple, **MP4 first**, one
  attempt `decoded`, 1280 × 720, the film advancing 9.52 → 11.65 s, bound to the screen. Chromium 156.0.8078.4: **WebM
  first**, decoded, advancing. Receipts: `output/playwright/ipic-screen-engine/{webkit,chromium}.json` in the worktree.
  This is Safari's engine, not a Safari or iPhone device, and it does not hear sound.
- **Real screen (Metal, M5 Max, Chromium 156):** `node preview/e2e/ipic-screen-runner.mjs` **12/12** on the branch
  (stall/Retry, four aspects with mattes, offline, fallback, missing files, pending switch, same-film restart, no stale
  edge, drift seek keeps the texture, presented frames 7 → 51, material restored, 13 textures created and disposed).
- **Two-browser journey:** `pnpm run test:screening` **19/19** on the branch (SwiftShader; both approved films; the host
  chose `ipic-two-seats-v1` after the fixture: its own texture, captions, transcript and 45,469 audio bytes decoding;
  background-and-back first presented frame 88 ms from the room; host loss paused at 10.62 s; leaving released the film).
- **Core `pnpm run verify`:** see the log below (filled when the run finishes; a skip is not evidence).
- **Rollback:** revert the PR. No persisted or server effect; no media change.

## Finish line 3: #499, #500, #501

**#499 boxes → evidence** (all on main; the device rows are the packet's step 6):

| Box | Evidence |
| --- | --- |
| Host-only selector with title, duration, poster, audio and captions; the short the named default; silent marked silent | #514 `1a61e448`: `SCREENING_DEFAULT_MEDIA`, `screeningChoices`, `audio`/`poster` per film; `preview/tests/screening-contract.test.js`, `ipic-screening-ui.test.js` (5 cases red on main `153471bc`) |
| Fixture retained for tools, excluded from the public selection; allowlist authority server-side | #514: fixtures only with `?screening-fixtures=1` on a dev build; `server/tests/screenings.test.js` guards (unknown, URL, path, case, `__proto__`, extra fields); the server allowlist unchanged |
| Select/Start only when stopped or ended; Stop before changing; no queue/seek/auto-next | #514 chooser hidden while playing or paused; unit cases; the hosted journey's Stop then choose |
| Start uses the chosen id with epoch, expectedRevision, operationId; film A ended → B; lost-reply retry keeps the id | #514 unit (command) and server tests; #520's journey: a resent start applies once, a reused id with another film is refused |
| Permission rechecked at the service boundary; direct unprivileged, revoked, stale canHost, unknown/cross-venue ids, duplicates, racing hosts | `server/tests/screenings.test.js` (racing hosts, lapsed grant, walking out) and the transport suite on memory and Redis (19/19 with zero skips on `91656cec`, 2026-10-28) |
| Stale or rejected Start syncs and shows the room's state | #514: refusal shows the reason and syncs; unit case; the journey's stale revision, earlier epoch and reused operation id refusals |
| Replacement updates decoder, texture, captions, transcript; neutral poster fallback; no catalog preloading | #513/#571/#650 lifecycle; #556's hosted journey: the second film's own 1280 × 720 texture, captions and transcript; the fixture has `poster: null` and a neutral frame |
| Keyboard/touch selection and labels at 320/390 px with the existing chrome | Hosted journey at `2bb8eaae` and since: select and Start film uncovered and ≥ 44 px at 390 and 320 px (the first hosted run caught a 36 px select; fixed). Emulated widths only: physical touch, keyboard and VoiceOver are packet step 6 |
| Media/manifest validation for display fields; original ids/durations/approvals preserved; how to add a film documented | `preview/tests/screening-media.test.js`, `make-screening-fixture.mjs --check` (11 files of 3 films); `docs/screenings.md` "Adding a film"; #547 added the second film without touching the original |
| Tested chooser with reviewed media; two approved non-fixture entries after S4 | #547 `a4b889e3`: the chooser lists two approved films; #556 `7686554b`: hosted CI chooses and starts the second one |

**#500 boxes → evidence** (engineering on main; listening, voice chat, devices, VoiceOver and the comfort review are
Val's, packet steps 1–4 and 7):

| Box | Evidence |
| --- | --- |
| Focus on screen / Look around; whole film framed; both rows; no room resize | #515 `225acfc9`: `ipic-screening-view.js`; unit (front 103°/back 57° from the seat, so focus looks from the centre line); GPU visit 11/11 normal and reduced motion on main `f24e7d83`; front 80°/back 53.6° in-world (old room; #557 since moved the rows, see the viewing ledger's 2026-10-28 table) |
| Seat and avatar unchanged; Look around restores; Stand up/leave/disconnect/rebuild exit focus | Visit journey checks: seat and avatar unchanged while focused, Look around and a drag return the seated view; standing ends focus at 390 px |
| Reduced motion; keyboard focus restored; keys on buttons leave the world alone; no pointer lock | Visit journey: reduced motion immediate; keys on the focused button keep the avatar seated; Look around keeps keyboard focus; the game has no pointer lock |
| Sound, Volume, Captions, Transcript, Stop watching and exit clear in both views; chrome clearances | Visit journey: Stand up visible, topmost and clear of the panel on desktop and at 390 px; the panel steps aside for More |
| Stop watching reversible through Join screening at the room's time; no hidden decoder | #515; visit journey hosted and on Metal: Join screening returned to the running film at the room's time without a command |
| Start muted; audible unlock in the gesture path; truthful refusal | #515 unit: refused-sound text; the fixture-browser runner's gesture path; refusal itself is unit-only (headless allowed autoplay): packet steps 1–2 |
| Authored stereo mix inside the auditorium; no panner or new audio context; departure stops sound | #515; the soak counts audio contexts flat; the journey: leaving IPIC released the film and video element. Hearing it is packet step 7 |
| Volume works or truthful device-volume guidance | #515: the slider only where setting the element's volume works; "Use your device's volume buttons" otherwise; iPhone row |
| Captions and transcript in both modes, aligned to the actual film; speaker labels and sounds | #547's eleven cues (8 speakers, 3 sounds); #556's journey: the second film's captions and transcript follow it; #571/#650 cue fences |
| Review real dialogue/music, intelligibility, balance, voice-chat coexistence, correction audibility | Machine only (−18 LUFS, speech 10.4–19.5 dB over music, ASR 44/45): **open, Val** (listening form in the second-short ledger) |
| Desktop keyboard, reduced motion, 320/390 px with chrome; named device/human evidence for support claims | Hosted and Metal visit journeys (emulated widths); **devices and VoiceOver open, Val** |

**#501 boxes → evidence:** inventory, script, edit and review owner recorded (`second-short.json`, the second-short ledger);
real dialogue and music produced and measured (candidate B, −18 LUFS, −1.5 dBTP); MP4 and WebM one cut (62.000 /
62.008 s, 1 s keyframes, fast start); captions with speakers and sounds, transcript and poster; provenance per component
in `sources.json`; **Val's approval of the exact bytes on 2026-10-19** (WebM `24f08a74`, MP4 `85b1079e`, VTT `2a6b54e0`,
poster `2e53991c`); registered by #547 `a4b889e3` through single-owner edits; decode, captions, seeks, poster and
manifest verified; draft/fixture/approved/published states kept distinct (#516 tooling, #555 intake fix). **Open:** the
listening record (packet step 7, the form in the second-short ledger). The v2 recut path is prepared there, not run.

## Finish line 4: #497 checklist and #359

- **Checklist reconciled** (the #497 body, with the evidence comment): S1, S2 and S4 ticked with PR/merge evidence;
  S3 and S5 stay open for the human and device rows; the release line stays open until the signed-in smoke is recorded.
- **Version-bound recommendation for #359:** `v0.2.2` (`f4dd959a`), in the matrix's "Release recommendation
  (2026-10-28)". Engineering-ready with both films on the candidate; experience-ready needs the packet; production
  smoke is Val's go.

## Decisions for Val

1. Run the device and smoke packet (or name who does): macOS Safari, iPhone Safari, VoiceOver, touch, other GPUs,
   listening, the film against voice chat, the comfort review, and the signed-in production host smoke.
2. If Safari plays the WebM without sound: land the WebKit MP4 option PR (then a deployment).
3. If listening fails on clarity, clipping or "Westheimer": approve the v2 recut path.
4. #500 design decisions: the portrait hint (A: a status line, recommended) and nameplates in focus (A: hidden while
   focused, recommended), and whether to prototype before or after the device rows.
5. The old S1 worktree `river-oaks-screening-498-resume` (delivered; owner `codex:S1-closure-20261022`, lease expired
   2026-10-23) still needs its owner's release before a guarded prune; this session did not take it over.

## Checks run in this session

| Command | Where | Result |
| --- | --- | --- |
| `node --test server/tests/screenings.test.js server/tests/static-media.test.js server/tests/hardening-asset-cache.test.js` | main `91656cec` | 19/19, 0 skipped |
| `REDIS_URL=redis://127.0.0.1:62369 node --test server/tests/screenings-transport.test.js server/tests/screenings.test.js` | main `91656cec` | 19/19, 0 skipped |
| Production serving read-back (curl, read-only) | typesafe.place | 11 files 206, typed, cached, hash `24f08a74` |
| Six focused client suites | option branch | 79/79, 0 skipped (the new case red on main first) |
| `node scripts/make-screening-fixture.mjs --check` | option branch | 11 files of 3 films |
| `node preview/e2e/ipic-screen-engine-runner.mjs webkit` / `chromium` | option branch | WebKit MP4 first; Chromium WebM first; both decoded and advancing |
| `node preview/e2e/ipic-screen-runner.mjs` | option branch, Metal M5 Max | 12/12 |
| `pnpm run test:screening` | option branch, SwiftShader | 19/19 |
| `pnpm run verify` (core) | option branch | pending at the time of writing; recorded in the log below |
| `node --test scripts/tests/plans-index.test.js` | docs branch | 2/2 |

Not run: the ten-cycle soak (`ipic-screening-soak-runner.mjs 10`); the option changes nothing outside WebKit and the
soak runs Chromium, so the 2026-10-18/19 soak evidence on the same player lifecycle stands. Hosted CI runs on the draft
PRs. No device, human or production action.

## Log

- **12:40–13:05Z:** read the instructions, docs, register, #497–#502, #359 and PR #571/#650 state. Found #571 merged
  (`167048c3`) and #650 merged (`2da76e1f`), both in `v0.2.2`; the stale #502 register entry already retired. Claimed
  `ipic-screening-webkit-mp4-502-20261028`; worktree from `91656cec`.
- **13:05–13:15Z:** regression red on main, then the preference and doc line; 79/79; WebKit and Chromium engine checks;
  server, serving, cache and isolated-Redis suites on main; production serving read back. Background chain started:
  screen runner 12/12 (13:10Z), journey 19/19 (13:12Z), core verify running.
- **13:15–13:40Z:** matrix rows, Val packet, listening packet and v2 dry run, #500 design package, release
  recommendation, this ledger. Claimed `ipic-screening-packets-497-20261028`.
