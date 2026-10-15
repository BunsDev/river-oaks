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
