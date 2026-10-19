# IPIC lounge from IMG_9752–9758 (photo review P8, P10, P11, P12)

- **Task:** `ipic-lounge-photo` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/ipic-lounge-photo-20261018` in `../river-oaks-ipic-lounge`, from main `2d782355`.
- **Decision:** Val chose "Rotate group + red carpet" on 2026-10-18 and authorized merging to main.

## Change

- **P11 (`ipic-plan.js`, `ipic-interior.js`):**
  - the sofa backs onto the west glass guardrail over the escalators (seat line d 20.6, arms at a −5.35 and
    −2.85) and faces into the lounge;
  - the oval table is in front of it, and two barrel chairs are across the table;
  - each sofa place names its stand spot and approach at its front corner beside the table, since the arms
    meet the wall and the escalator head;
  - the seat-back collider follows the facing.
- **P12 (`ipic-materials.js`):**
  - the carpet palette is the photos' bold orange-red with dark swirl lines, sampled from IMG_9753–9755;
  - the pattern is contour lines of a tiling field, about 10 cm apart on a 3 m tile.
  - #469 had darkened it after IMG_9758 alone, which is underexposed. Its test is replaced by one for the
    red, and the PR says so.
- **P8:** six elongated, ribbed woven-rattan cocoons (a new `woven-rattan` material), lit through their open
  bottoms.
- **P10:** barrel chairs whose shell wraps 270° and opens towards the sofa.
- **Routes:**
  - journeys and route tests walk up the west lane, north along a = −1.4 to d 24.5, then west to the
    auditorium doorway;
  - files changed: `ipic-visit.js`, `ipic-photo-views.mjs`, `ipic-exterior-culling.mjs`,
    `scripts/ipic-short/capture.mjs`, and the server and preview interior tests.
- **Review data:**
  - the narrowest public passage is now the tightest public trip; the planter-to-sofa-arm pinch is gone;
  - the lounge route measures 1.6 m (was 1.02 m);
  - both sofa approaches measure 1.09 m and admit the widest accepted body (they measured 0.3 m);
  - the lounge turning radius is 2.66 m (was 1.85 m).
- **Darts:** no seat is in sit reach of the line now. The darts test walks to the sofa before sitting, and the
  line still clears.
- **T2b** looks back at the sofa from between the barrels (manifest and `IPIC_CAMERAS`).

## Checks

| Check | Result |
| --- | --- |
| New tests, written first (P8 cocoons, P10 barrels and their facing, P11 orientation, P12 red) | Failed first for the intended reasons. Now pass; the facing check fails if the barrels are turned round. |
| IPIC, darts, room-exit and contract tests | 79 pass, 1 Redis skip |
| Exports, Blender and `ipic-photo-views.mjs` (Metal) | Passed: 66 meshes; T1–T3 recaptured at `0a80a4a7` with no errors. T2b matches IMG_9758's layout, cocoons, barrels, script wall and carpet tone. |
| `node preview/e2e/ipic-runner.mjs` (visit journey on the new route) | Passed 8 checks, walking the new lounge route |
| `node preview/e2e/ipic-exterior-culling.mjs` | Passed: no problems or errors; seated frame 4.6 ms with culling against 8.1 ms without |
| `pnpm run verify` | Passed on the second run: agent 116, preview 3399, server 753 with Redis skips, 76/76. The first run failed one test, `office-penthouse-furnishings` "short idle slices" (75 ms against its 40 ms budget, at load 13). That test does not touch this branch; alone it passed 3 of 3. |

## Gaps

- Past the guardrail our lounge shows the escalator well and the street facade, not the photo's Tuck Room
  bar, windows and laser-cut screen. That would mean moving the bar, which was not chosen.
- The approved short `ipic-original-v1` shows the earlier lounge. Its capture script now walks the new
  route, and a new cut needs approval again.
