# IPIC movement and design (2026-10-26)

Task `ipic-movement-design-20261026`. Branch `fix/ipic-movement-design-20261026` from main
c6eba6a3, in the worktree `../river-oaks-ipic-movement-20261026`. Owner:
claude:ios-draw-budget-289 (4c25a886).

Requested by Val on 2026-10-26, with a screenshot of IPIC's reception: "we absolutely must
patch the movement and design inside the IPIC theater. the tuck room entry is busted, the
escalator is broken, there is a roof in the middle of ther escalator, once you're upstairs,
your half a body high, and then inside the theater room itself, the dimensions are
contorted and tons of dead space".

## Objective

- Close the opening under the "IPIC & THE TUCK ROOM" sign in reception.
- Remove the roof across the escalators.
- Keep the walking camera inside the venue upstairs.
- Give the auditorium sensible proportions with no dead space.

Keep `ipicFloor`, the server's collision, the seats, the viewing standards and the
agreement and circulation checks consistent.

## Baseline (main c6eba6a3)

A local capture tool (`preview/e2e/ipic-captures.js`, not committed) walked Jevica, with
Jev, from the street door up both runs, through the lounge and the Tuck Room, and into the
auditorium. The run went through the experience runner from a detached snapshot
(`RIVER_OAKS_E2E_REPORT=ipic-baseline.json`).

At every stop the tool compared the player's pose, the drawn feet and the camera with
`ipicFloor`.

| Stop | Floor | Eye over floor | Feet over floor | Camera over floor | Ceiling over floor there |
| --- | --- | --- | --- | --- | --- |
| Reception door | 0 | 1.68 | 0.07 | 2.38 | 3.6 to 3.81 |
| First run, middle (d 8.95) | 1.48 | 1.68 | 0.08 | **4.08**, at d 5.07 over reception | 2.33 (reception's, under the camera) |
| Landing | 3 | 1.68 | 0.07 | **4.85** | 3.61 |
| Second run, middle (d 16.48) | 4.24 | 1.68 | 0.06 to 0.09 | **4.85**, at d 13.0 over the landing | 2.37 (the landing's) |
| Lounge | 6 | 1.68 | 0.07 | **4.36** | 4.21 |
| Tuck Room | 6 | 1.68 | 0.07 | **4.85** | 4.21 |
| Cinema doorway | 6 | 1.68 | 0.07 | 2.21 | 4.31 |

What the numbers and captures show:

- **The body is not misplaced.** The pose, the drawn feet and the eye agree with the floor
  everywhere.
- **The camera breaks through ceilings.** Indoors, the walking camera's boom
  (`third-person.js`) is cut only by walls and the floor, never by a ceiling. On the runs,
  at the landing and upstairs it rises through the ceiling. The view is then the top of a
  ceiling slab:
  - across the middle of the escalator (`03-flight1-middle`, `05-flight2-middle`);
  - filling the frame (`04-landing-0`, `06-flight2-top-0`, `07-lounge-1`, `08-tuck-room-1`);
  - from above the lounge's hanging cocoons, which then hide half of the player
    (`07-lounge-2`).
- **The landing's ceiling is a roof across the escalator.** It is drawn at 6.7 m over the
  whole width of the first run and the landing, 0.7 m above the lounge floor. From the
  lounge, looking back down the second run, its top crosses the escalator well like a roof.
- **The opening under the sign is a hole.** Reception leaves the side bay west of the first
  run open at d = 6, right under "IPIC & THE TUCK ROOM ↗". That bay has no floor, no
  front and no outer wall, so the street's ground and the next shop's shelves show through
  it (Val's screenshot, `01-reception-door`, `02-lane-foot-1`).
- **The bays beside the second run are open pits.** From the lounge, past the glass
  guardrails, you look down them to the street's ground.
- **The auditorium wing is mostly empty.** It is 39 m × 8 m, but the screen, the three
  rows and the back row's seat backs fill only a −19.5 to −6.2. That leaves 25.7 m of
  empty carpet east of the doorway, ending in a black wall (`10-wing-foyer-0`).

## Design

- **Camera.**
  - A room may give `ceilingAt(east, north)`, the underside of its lowest drawn ceiling.
  - The walking camera's boom stops 0.3 m under it.
  - IPIC's comes from `ipicCeiling(d, a)` in `ipic-plan.js`. The plan and the meshes share
    its heights, `IPIC_CEILINGS`.
- **Escalator well.** One well runs between the run walls from reception to the lounge.
  - It is closed overhead at the lounge's ceiling (10.3 m). Above reception's ceiling, a
    header wall at d = 6 closes it.
  - The run walls rise to the well's ceiling, and a stone fascia continues them over the
    landing.
  - Only the landing's side bays keep their own ceiling (6.7 m).
  - The landing's downlights over the lanes move up under the well's ceiling.
- **Reception.**
  - Walls close both side bays at d = 6, up to the reception ceiling: timber on the west,
    plaster on the east.
  - The sign hangs on the west wall, beside the escalator, instead of across the lane's
    head.
- **Light wells.** The bays beside the second run become wells under the lounge's glass:
  - a stone floor at the landing's level;
  - walls up to the ceiling;
  - a planter in each.
- **Auditorium.** The wing ends at a = −2.9, 0.9 m past the doorway, and is 16.6 m long.
  - The doorway opens onto a 3.2 m cross aisle behind the back row.
  - The screen, rows, rake, seats and viewing standards do not change.
  - The rest of the main rectangle behind the cinema wall becomes back of house. It is
    walled off, and its collider fills it.
  - There are eight house lights over the house instead of sixteen along an empty foyer.

## Checks

- Focused:
  - `node --test preview/tests/third-person.test.js preview/tests/ipic-*.test.js preview/tests/interior-exterior-culling.test.js preview/tests/room-ground-clip.test.js server/tests/ipic-interior.test.js server/tests/darts-ipic.test.js`
  - `node scripts/ipic-review-data.mjs --check`
- Core gate: `pnpm run verify`.
- Browser: `ipic-visit`, and the capture tool against the branch, inspected.

## Results

- **Focused** (the command above; `.runtime/ipic/focused.log`): 152 of 152 pass.
  `node scripts/ipic-review-data.mjs --check` reports the data current. The circulation
  data changes only in the auditorium's turning circle: 2.86 m at (−16.6, 29), where it
  was 4.0 m in the empty foyer.
- **Office and IPIC layout contract:** `scripts/tests/office-ipic-contract.test.js`, the
  references and the kit-fit tests pass, 17 of 17. The contract's wing bounds and note now
  record the shorter wing.
- **The new and changed tests on main c6eba6a3** (copied into a main snapshot; for the
  camera file, `ipicCeiling` is stubbed to Infinity because main has no such export).
  Four fail, as they should, and 35 pass:
  - "below the camera is the floor…": 32 camera poses look down on the top of a ceiling;
  - the extended sight-line test: 496 sight lines leave the interior, through the west bay
    at reception and the lounge's bays (`aW`) and the lanes' sides;
  - "the wing ends at a cross aisle…": the wing ends at 19.5;
  - house lights: 16, not 8.
- **Core gate:** `pnpm run verify` (core, Python 3.12) passed, 23:42–23:52Z at a 1-minute
  load of 24 (`.runtime/ipic/verify.log`, `.runtime/agent/core.json`):
  - 276 of 276;
  - 4178 pass, 1 skipped;
  - 915 pass, 225 skipped (Redis-gated);
  - 120 pass, 3 skipped.
- **Hosted checks on 85913401 (draft #692):** all 22 green, `preview` included.
  - `preview shared (development)` first failed in `crime-shared` ("A timed evade (U) beats
    the rival's telegraphed counter").
  - Main's run 40420131202 (23:29Z) fails with the same message.
  - That one job was rerun and passed.
- **IPIC visit, `node preview/e2e/ipic-runner.mjs`** (Chromium 156, software rendering;
  snapshot of 85913401, 00:09–00:12Z): passed, 11 of 11 checks, no errors. It walks up both
  runs into the auditorium, takes a recliner, focuses the film, stands at 1280 and 390 px,
  and walks back out to the street (`output/playwright/ipic/visit.json` in the snapshot).
- **Branch captures** (snapshot of 85913401, 00:10–00:14Z), compared side by side with the
  baseline:
  - **Fixed.**
    - Stops 03–06: the runs and the landing show Jevica on the escalator, with no ceiling
      top in the frame.
    - Stop 04: the landing was a blank slab and is now Jevica at the foot of the second run.
    - Stops 07-1 and 08-1: the lounge and the Tuck Room were blank slabs.
    - Stop 01: the bay under the sign is a timber wall, where the street showed through.
    - Stop 09-1: the doorway looks along the cross aisle to the wing's end wall.
  - **Unchanged:** 07-0 and 08-0.
  - **Worse, then fixed: 07-lounge-2.** It looks back down the second run from the lounge.
    On main the camera looked down past a cocoon that hid half of Jevica. Kept under the
    ceiling, the camera sat inside the cocoon at (−1.4, 24), whose shell filled the view.
    - The fix: `room.ceilingAt` is now `ipicHeadroom(d, a)`, the ceiling lowered within
      0.35 m of a cocoon's shell to the cocoon's bottom. `IPIC_COCOONS` and `IPIC_COCOON`
      are shared by the plan and the meshes.
    - The new test "in the lounge the camera stays clear of the hanging cocoons…" covers
      every free lounge point on a 0.6 × 0.5 m grid, at 8 yaws and 4 pitches.
    - With `ceilingAt` on `ipicCeiling` alone, it fails: 143 poses come within 0.3 m of a
      cocoon or look through one. With the fix, it passes.
  - **Stop 10, the old foyer (4, 27.4),** can no longer be reached: it is back of house. The
    capture tool stopped there, by design.
- **After the cocoon fix:**
  - focused, 153 of 153 (`.runtime/ipic/focused-2.log`);
  - `ipic-review-data --check` current;
  - `office-ipic-contract.test.js` 8 of 8;
  - `pnpm run verify` (core) passed, 01:01–01:09Z at a 1-minute load of 14 (276 of 276;
    4179 pass, 1 skipped; 915 pass, 225 Redis-gated skips; 120 pass, 3 skipped).
  - An earlier run of the gate at 00:26Z, under a 5-minute load of 67, failed one tooling
    test: "browser queue admission does not consume the command execution timeout". It
    allows 300 ms for a spawned node to start. The same test passed 3 of 3 alone, and this
    branch does not change `scripts/`. Its log is kept in
    `.runtime/ipic/verify-cocoon-1-queue-admission-flake.log`.

## Gaps

- The escalator treads are still static: the escalator is walked, not ridden.
- The Blender review renders and receipts in `docs/ipic-review/` are not re-rendered.
  They show the earlier enclosure and wing.
- The browser captures show 85913401, before the cocoon fix. The fix is covered by the new
  test, not yet by a browser capture.
- The Tuck Room's trailing pothos ends 2.45 m over the floor. The camera may pass among
  the strands' lower ends, but none of the captures showed this.
- Not run: Redis (`server/tests/ipic-routes.test.js`), the full browser suite, WebKit,
  phones, and human visual acceptance.

## Next

Core verify on the cocoon fix, then push it to #692 and recapture the lounge. Merging
needs Val.
