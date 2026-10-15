# #368 slice 2: two-account office + IPIC journey and rollback evidence

- **Task:** `office-ipic-journey-368` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `test/office-ipic-journey-20261015` in `../river-oaks-office-ipic-journey`, on top of
  `feat/office-views-363-20261015` (views + scene prompt), which is on `feat/office-seat-claims-20261015` (#400).
- **Issue:** #368 "Required integrated journey" and "feature rollback/reset only in a disposable environment";
  supplies the occupied-seat route receipt for #361/#363.
- **Content:** penthouse graybox and the labelled 30 s screening fixture. Not the approved art or short.

## The journey (`node preview/e2e/office-ipic-journey-runner.mjs`)

The owner account (Jevica, plus a separate explicit IPIC host grant, `RIVER_OAKS_SCREENING_HOSTS=ipic:<owner>`)
and bob (an approved resident without office access), on one loopback town with the penthouse layout:

1. Bob is refused (UI and a direct `enter` command), requests a visit; Jevica accepts in the Offices panel.
2. Jevica rides the elevator and skips the film; bob arrives with reduced motion.
3. Jevica uses **Or write a three-line scene idea** and saves it in My tasks. Bob's desk opens empty. Neither
   public snapshot contains the text, and a direct desk read naming Jevica's account is refused (400).
4. Both stand beside creative desk 01 and race for its chair over two real sockets: one winner, one
   `office_seat_occupied`; the loser sees the winner seated and cannot walk into the seat's envelope; the
   winner stands with Z.
5. Jevica takes the stairs, crosses the gallery and sits in reading chair b; bob walks out to the terrace and
   sees her seated on the mezzanine.
6. Both return to the street; the seat goes with the visit.
7. At IPIC Jevica starts the fixture as host; bob joins late, without host controls, and converges within
   500 ms in under 5 s.
8. Both return to the street with no visit, film or playing video left.

Setup is recorded, not hidden: pages load one at a time, and if the district's 20 s data fetch misses its
deadline the page's own **Reload world data** is used once and listed under `reloads` in the receipt.

## Rollback (`server/tests/office-ipic-rollback.test.js`)

A disposable in-memory town at checkpoint v11 (a seated penthouse visitor, a pending request, Jevica's film
playing) is restored by the same current code with the legacy layout and no host grants: the penthouse
visit and its seat end; grants and requests stay; the film pauses in the same epoch and cannot be resumed
without a grant; the legacy office admits the guest with no seats; the writer stays v11. Re-enabling is
configuration again. This is evidence of existing and #400 behaviour, not a new behaviour, so it passed on
first run. Desks and shared workspace tasks live outside world checkpoints (office-recovery tests).

## Checks

| Check | Result |
| --- | --- |
| `node --test server/tests/office-ipic-rollback.test.js` | 1/1 |
| Journey run 1 | failed in setup: the second page did not load in 120 s (load ~96, other apps) |
| Journey runs 2–5 | failed before the journey's own steps: an outside disk sweep deleted every `node_modules`, then the Playwright cache dropped Chromium 1248 (both restored). Run 4 reached the chair race and found the harness let bob stop beyond the 1.3 m reach (server answered `office_seat_out_of_reach`); the walk now stops within 0.25 m and both racers start 0.9 m from the stand point. |
| **Journey run 6** at `cb4006d5` (load average 23–108, SwiftShader, no reloads) | **passed 30 checks**: refusal (UI and direct `enter`), request accepted in the Offices panel, both arrivals, the scene idea prompt (saves nothing until written; named on writing), private My tasks, bob's desk empty, both snapshots clean, a forged direct desk read refused (400), a two-socket chair race with one winner and `office_seat_occupied`, the envelope blocking the loser, Z to stand, stairs, library reading chair b, bob on the terrace seeing Jevica seated on the mezzanine, the seat released on leaving, bob's late join at 12.9 s without host controls, within 500 ms after 3 ms, both back in town with nothing playing, no page errors. Software rendering on the graybox and fixture: not final art, the approved short, or device evidence. |

## Lead status and resume point (2026-10-15, 11:58Z)

This is the lead ledger for the #359 goal. Heads after merging main `dda596c5` (#411, #415 axe checkpoint
field, #419), all signed, hosted checks green:

| PR | Branch | Head | Hosted |
| --- | --- | --- | --- |
| #400 | `feat/office-seat-claims-20261015` | `d1266a15` | 16/16 |
| #403 | `feat/office-kit-fit-362-20261015` | `8d09e6dc` | 10/10 |
| #404 | `feat/office-views-363-20261015` | `a1abfb84` | 10/10 |
| #406 | `test/office-ipic-journey-20261015` | `9db4e845` | 10/10 |
| #407 | `test/ipic-screening-soak-20261015` | `144b3aa8` | 16/16 |
| #424 | `fix/ipic-recliner-view-20261015` | `d7cc8ea7` | running (ready for review, not a draft) |

| Check on the merged heads | Result |
| --- | --- |
| `REDIS_URL=<isolated> node --test server/tests/*.test.js` at `d1266a15` | 771/771, 0 skipped, 0 todo (includes #415's optional `axeGames` field beside v11 seats) |
| `node --test preview/tests/office-*.test.js server/tests/office-ipic-rollback.test.js` at `9db4e845` | 89/89 |
| `node --test preview/tests/ipic-*.test.js preview/tests/screening-contract.test.js scripts/tests/agent.test.js` at `144b3aa8` | 46 pass, 1 todo, 0 fail |

**#365 short: candidate 1, local only.** `~/Documents/river-oaks-drafts/ipic-short-candidate-20261015/`
(README there). It is a 52.6 s runtime capture on Metal (commit `7712634b`, default office layout, synthetic
identities, idle IPIC screen), delivered as WebM (VP9, 1.41 Mbps) and MP4 (H.264 Main 3.1, 2.04 Mbps), with
8 caption cues, a transcript, a poster and a manifest in the fixture's shape (approval pending).
- Every edge has a black border of at least 4 px.
- Decode check on Metal Chromium: hashes match, durations equal the manifest, no dropped frames, and the cues
  equal the transcript.
- Not committed, allowlisted or played in-world. The repository is public; publication is Val's decision.
- Take 1 was rejected: the office spun about 550° in 6 s, name tags showed through walls, and a door prompt
  was in frame.
- Posted on #365 (issuecomment-6190568373). Lead status posted on #359 (issuecomment-6190568677).

**Blocked on decisions, not engineering:**
- Val: #400's v11 checkpoint. After deploy, roll back by configuration on v11 code; a v10 build cannot take
  the lease from a v11 writer.
- Val/design: R19 kit import and desk footprints (#362, #403 evidence).
- Val: the #365 cut, likeness, lounge artwork (floral texture from `IMG_9761.jpg`, the venue's lettering),
  signage, and the allowlist commit.
- Val: production host grants, a hosted CI screening job, and activation and the building raise (held).
- HUD owners: the greetings panel covers **Play & rides** at 700 px and below.
- Not done: real-GPU playback beyond this Mac, Safari, iOS, physical touch, and human accessibility review.

**T3 from the viewer's own seat (#424).** In the default seated camera, front-row recliner 1-1 showed
recliner leather: the eye kept the downward pitch left by walking. Recliners now name an `eyePitch` at the
screen centre.
- A pre-fix camera fails the visit journey; the fix passes it.
- Metal, with #407's captions merged in uncommitted: 10 checks at 1440 and 390 px.
- Independent review addressed.
- Posted on #368 (issuecomment-6191475574). The #359 status comment is updated.
- Also found: at 390 px, Play & rides is open by default and covers most of the film. It goes to the HUD
  owners and was not changed.

**#365 candidate in this journey (local only, reverted).** Candidate 1 was listed first in `SCREENING_MEDIA`
(52,555 ms) with its media under `preview/public/assets/ipic/screening/`, uncommitted. The journey passed 31
checks: its 30 plus both viewers on `mediaId: "ipic-original-v1"`. The late join came at 9.7 s and was
within 500 ms after 507 ms. Afterwards the tree was clean again. Software rendering, load average 24–26.
Posted on #365 (issuecomment-6191641392). Approval is the only step left: add the entry, commit the media
and `sources.json`, rerun.

**Next action:** once Val approves the short, add `ipic-original-v1` to `SCREENING_MEDIA` and
`sources.json`, then rerun this journey with the short instead of the fixture. Otherwise, watch #424's hosted
checks. Land #400 first when authorised; merging and landing are Val's.
