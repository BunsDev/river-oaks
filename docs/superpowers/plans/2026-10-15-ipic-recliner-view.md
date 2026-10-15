# #368 T3 finding: a seated IPIC viewer sees the recliner, not the screen

- **Task:** `ipic-recliner-view-368` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `fix/ipic-recliner-view-20261015` in `../river-oaks-ipic-recliner-view`, from main
  `dda596c5`.
- **Issue:** #368, actual-screen T3 review (tracker #359). It does not overlap #422, which is test-only and
  changes `preview/e2e/ipic-screening.js`.

## Finding

The T3 review captured what a seated viewer actually sees, on Metal, at 1440×900 and 390×844, with the
fixture playing and Captions on. The frame was recliner leather, not the screen.

- `debug pickAt` at the frame centre named `Auditorium: ipic-cognac-leather`.
- The camera faced the screen: yaw −1.585, with the screen centre 18° off-axis for recliner 1-1.
- Dragging the view did not help.

**Cause: the pitch a walk leaves.** This was corrected by independent review; my first account blamed
the camera boom.
- The walking camera's boom already collapses to the seated eye in every recliner and both sofa places.
  Its first sample, 0.1 m back, lands in the seat-back collider once the 0.35 m body radius is added.
  The pre-fix mutant shows the same: `offset: 0`.
- That eye kept the pitch it had while walking. The journeys' `face()` and watering use `lookAt(..., 0.9)`,
  which looks down. So the front row saw its own footrest and cushion.
- From the back row, even a level look hits the backs of the row in front, 2.43 m away.
- #402's T3 frames used the dev review camera, so nothing before this saw the default view.

## Change

- **`preview/src/ipic-plan.js`:** each recliner seat site names `eyePitch`, the pitch that aims the seated
  eye at the screen centre. The seated eye is 0.65 m above the cushion, as `walking-ui.js` places it. The
  pitch is 0.44 rad for the front row and 0.22 rad for the back row. The lounge sofa, benches and café
  chairs get no `eyePitch`.
- **`preview/src/world-interactions.js` and `server/world.js`:** `resolveBenchSeat` and `publicSeat` pass
  `eyePitch` through. The checkpoint still stores only `{buildId, slot}`, so there is no version change.
- **`preview/src/third-person.js`:** adds `seatedEyeView(sitting)` and `pitchAfterSeatChange(before, after,
  pitch)`.
- **`preview/src/walking-ui.js`:**
  - sitting in such a seat sets the pitch at the screen; this is the fix;
  - a reconnect or correction on the same seat keeps the sitter's own look;
  - standing levels the pitch;
  - the camera uses the seated-eye path in such seats explicitly, rather than relying on the boom
    collapsing (defensive);
  - a `cameraView` getter exposes the current mode.
- **`preview/src/main.js`:** the dev hook `__riverCarriage()` reports `camera: {view, position}`.
- **`preview/e2e/ipic-visit.js`:**
  - the visit sits in front-row recliner 1-1, the T3 seat, or else the next free one, choosing only
    seats the page offers as enabled;
  - after sitting through the UI, the view must be `eye`, the camera must be at the seated eye within
    1 cm, and the pick at the frame centre must be `ipic-cinema-screen`;
  - after Z, the view must be `third-person`;
  - the exit goes forward and round by the left aisle.

## Checks

| Check | Result |
| --- | --- |
| Red first: `node --test server/tests/ipic-interior.test.js preview/tests/third-person.test.js` before the change | 2 failed: no `seatedEyeView` export; recliners had no `eyePitch` |
| The same after the change | 5/5 |
| `node --test preview/tests/third-person.test.js preview/tests/ipic-*.test.js server/tests/ipic-*.test.js server/tests/seating.test.js server/tests/world-interactions.test.js server/tests/screenings*.test.js` | 73 pass, 3 Redis skips (no `REDIS_URL`), 1 todo, 0 fail |
| `node preview/e2e/ipic-runner.mjs` run 1, before the route change | failed at the sit: a townsperson held recliner 0-0, the journey's fixed choice (residents use IPIC seats since #364) |
| Mutants 1–3 | not faithful: they kept the new pitch-on-sit, which is the fix itself; mutant 3 also showed the walking grid closes the gaps between front-row seats (exit now goes round by the left aisle) |
| **Mutant 4**: pre-fix camera (no eye view, no pitch on sit), recliner 1-1 | **failed as intended**: `{"view":"eye","offset":0,"centre":["ipic-cognac-leather"]}` (the getter still claims eye; the pick shows leather) |
| **Fixed**, recliner 1-1 | **passed 5 checks**: escalators to the auditorium, server-confirmed seat, seated eye with the screen at the frame centre, Z restores the walking camera, back out to the street |
| `pnpm run verify` (core, before the e2e route change) | passed: agent 109/109, preview 3178 + 1 skip + 1 todo, server 573 + 148 Redis skips, 69/69, Python 141 |
| Metal T3 seated capture, recliner 1-1, #407's captions fix merged in uncommitted (then aborted), load 7.5–15 | **passed 10 checks** at 1440 and 390 px: seated eye (`offset` 0) on `ipic-cinema-screen`; the film plays on the screen texture; the caption line equals the active cue and is topmost |
| Independent review of f6202078 | 1 bug: the journey also offered seats the page had disabled, so a seat a townsperson already held would wait out the timeout. Now only enabled seats are tried. Nit: the stated cause was wrong (corrected above). Nit: re-confirming the same seat reset a dragged look; `pitchAfterSeatChange` now keeps it (unit test red → green). Nit, already present before this change: `data-camera-mode` and V say third person while seated. Noted, not changed. Verified: eye and screen frames agree, every `sitting` path, nothing leaks into checkpoints or commands, all 8 recliners raycast to the screen. |
| After review: `node --test preview/tests/third-person.test.js server/tests/ipic-interior.test.js` | 6/6 (the new pitch test failed first: missing export) |
| After review: `node preview/e2e/ipic-runner.mjs` | passed 5 checks at recliner 1-1 |
| After review: `pnpm run verify` (core) | passed: agent 109/109, preview 3179 + 1 skip + 1 todo, server 573 + 148 Redis skips, 69/69 |
| After review: `REDIS_URL=<isolated> node --test server/tests/*.test.js` | 763/763, 0 skipped |

## Not in this change

- Phone portrait shows only the middle of the screen from the front row: a 390 px wide view at the
  vertical FOV of 67° covers about 34° across. Dragging still looks around.
- The camera boom still ignores furniture elsewhere. Only seats that name `eyePitch` change.
