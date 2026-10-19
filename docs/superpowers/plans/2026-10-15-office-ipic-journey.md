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

## Lead status: final (2026-10-15, 21:20Z)

This is the lead ledger for the #359 goal (session river-oaks-39, owner `claude:office-seats-363`). Summary
page of everything merged today: https://claude.ai/artifact/CWKmY3KwRMiDME7z7H6vKR (private to Val until shared).

**Landed through `pnpm run land`, each authorized by Val in session:**

| PR | Package | What | Merge |
| --- | --- | --- | --- |
| #400 | #363 | Server seat claims, occupied-body clearance, checkpoint v11 | `9149ed72` |
| #403 | #362 | Read-only desk fit check for the supplied kit | `f72a173e` |
| #404 | #363 | Bounded views and the private scene idea prompt | `d53a63e7` |
| #406 | #368 | This journey and the v11 rollback test | `9a7eb234` |
| #407 | #367, #368 | Captions fix, ten-cycle soak, screening profile | `49e96c70` |
| #424 | #368 | T3: a seated recliner viewer sees the screen | `326506f7` |
| #429 | #365 | The approved short (Val: "Approve as is") is the default screening | `1cb2b3a3` |
| #430 | #362 | R19: the kit's measured desk footprints, numbers only | `d8f9cdee` |
| #437 | — | Landing page: residents with access see "Enter River Oaks" | `941dfe6a` |
| #445 | #361 | No barricades: a body on a landing never keeps a visitor off a floor | `372c080b` |
| #446 | — | Say hello: semi-transparent, opened on purpose when you face someone | `c3f6726f` |
| #453 | #364, #367 | Theater UX: Step outside near the door only, seated mode, Stand up reachable, house lights | `2d7a1ef3` |

**Final evidence on main** (software rendering on one Mac, load recorded):
- **This journey:** 30 checks on `2d7a1ef3`, load 24–33, with the late join within 500 ms after 257 ms. Host Start
  plays the approved short since #429; the receipt's `rendering` text still names the fixture, which is stale.
- **Soak:** `node preview/e2e/ipic-screening-soak-runner.mjs 10` passed on `883ed56c` at load 18–33. All 11 joins
  came within 500 ms in 2–17 ms and stayed there (worst 294 ms), and counters stayed flat.
- **The earlier soak failure:** a run on `2d7a1ef3` failed the stay-within rule once (595 ms, load 27–31). That led
  to the seek A/B in `2026-10-15-screening-seek-lead.md`: the fix was not landed, and its branch is parked.

**Issues:**
- **Closed today, at Val's request:** #363, #365, #361, #364, #367 and #368. Each closing comment lists what moved to #359.
- **Open:** #362 (R19 ticked) and #359. The final status is #359 issuecomment-6202245197.

**What keeps #359 open:**
1. Final office art: desks, chairs, monitors and `SCREEN_DYNAMIC`, plus furniture collision beyond the desks and
   O1–O4 captures with real materials.
2. Val's IPIC decisions: the 1.005 m lounge passage, and recliner footrest colliders.
3. Real-GPU, Safari, iOS and touch playback, and a human accessibility and caption review. That also decides the
   parked seek fix.
4. Activation, the 33 m raise, production screening hosts, a hosted CI screening job, and the player's poster.

**Rollback rule:** once v11 seats or the short have run, roll back by configuration on a build that has them,
never by redeploying an older build (`docs/screenings.md`).

**Retirement:** all 12 branches above were retired with `project:prune` on 2026-10-15, about 21:05Z, and every
archive verifies. Evidence is in `~/worktree-backups/river-oaks/<task>-evidence-20261015/`.

**Next action:** none in this lead's scope. The next owner of #359 starts from the list above.
