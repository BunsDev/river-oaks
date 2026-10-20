# IPIC auditorium: 3× along the building, turned to face lengthwise

## Objective and ownership

Val's request (2026-10-19): make the theater three times wider, because the viewing angles are off, and use modern calculations for the proportions. Val chose the rotated layout over two alternatives: resizing only the screen, or widening across the existing screen wall.

- **What changes:** the auditorium wing is extended 3× along the building and turned to face lengthwise. The screen and the recliner rows are sized from cinema viewing-angle guidance.
- **Task and branch:** register task `ipic-auditorium-rotate-20261019`, owner `claude:river-oaks-b5 (98f10148)`, branch `feat/ipic-auditorium-rotate-20261019`.
- **Worktree:** `../river-oaks-ipic-auditorium`, from `main` `f24e7d83`. No active task owns IPIC code; the IPIC tasks in the register are cancelled.

## Why the angles were off (main `f24e7d83`)

Horizontal viewing angle is `2·atan((W/2)/D)`, for screen width W and eye-to-screen distance D.
- **Screen:** `IPIC_SCREEN` was 12.1 × 3.6 m at d 33.79.
- **Rows:** the recliner rows sat at d 31 and d 28, so D was 2.79 m and 5.79 m.
- **Result:** the front row saw 130° and the back row 92°. The back row lost the bottom 22 % of the image behind the front row's headrests.

The room spans 13.0 m across (a) and 34 m deep (d). Depth is used up, so seat distance can only come from the building's length. The auditorium therefore turns to face along a.

## Guidance used

These come from secondary sources; the EG-18 text itself was not available.
- **Horizontal angle:** SMPTE EG-18 asks for at least 30° from the farthest seat. THX asks for at least 36° from the back row, with about 40° at the ideal seat.
- **Front row:** at most about 60°. The Time-Saver Standards range cited in one source is 61.8° to 33.3°.
- **Vertical angle:** the line from eye to the top of the image stays at or under 35° (EG-18).
- **Sightlines:** a C-value of at least 0.12 m (90–120 mm is "good" to "excellent").

Sources:
- https://cinemaview.in/en/blog/smpte-viewing-standards
- https://forum.frontdesk.co.in/showthread.php?tid=2377
- https://ca.valenciatheaterseating.com/blogs/home-theater-seating/home-theater-viewing-distance
- https://designcollaborative.com/optimizing-sightlines-for-every-seat-enhancing-audience-experience-in-venues/
- https://www.slideshare.net/slideshow/2-auditoriumpptx/257200011

## Geometry as built (IPIC local metres: a across the facade, d into the building, heights over the upper floor)

- **Wing:** a −19.5…19.5 (3 × 13 m) by d 26.0…34.0 (8.0 m). It is a second part of the IPIC room (`addRoomParts`), and its ceiling is 4.4 m over the upper floor. The rest of the room is unchanged.
- **Screen:** on the north end wall (a −19.35), 7.4 m wide along d, centred at d 30. At 2.39:1 it is 3.096 m tall. Its bottom edge is 1.8 m over the front row's floor, which is the rake's focal point.
- **Rows:** eye distances are 12.5, 9.5 and 6.5 m (a −6.85, −9.85, −12.85), 3.0 m apart. The angles are 33.0°, 42.6° and 59.3°; the end seats see 32.3°, 41.1° and 55.9°.
- **Seats:** three per row at d 28, 30 and 32, with 1.35 m aisles along both long walls. The worst off-axis angle is 17.1°.
- **Vertical angle:** 12.5°, 19.0° and 29.5° up to the top of the image.
- **Rake:** solved against the recliner headrest in front (1.545 m tall, 0.63 m behind its seat) with C = 0.12 m. The row floors are 0, −0.507 and −0.907 m from the doorway level. Every row sees the whole image.
- **Entry:** the cinema doorway at a −4.7 (d 26) opens onto a rear foyer behind the back row. A cross-aisle along d 26.7 leads to the side aisle; risers in the aisles are ramps 0.45 m either side, with treads and glow nosings.

### Adjustments logged during the work

1. **Four rows became three.** A 2.2 m pitch, and then 2.4 m, broke the seated-legroom rule. At a 3.0 m pitch the legroom is 0.891 m, as before. Four rows at that pitch would need a 9 m screen to stay within 30–60°, wider than the 8 m wing.
2. **The rake now clears the headrest.** The first rake used the eye of the row in front and hid 27–34 % of the image behind headrests. It was re-solved over the headrest, with the focal point raised to 1.8 m.
3. **The aisle ramp was widened.** Riser ramps went from ±0.25 to ±0.45 m, because the narrower ramp was a 40° slope.
4. **A sun leak was sealed.** The wing's shell leaked a texel of sun along the ceiling and back-wall edge once the district was culled. A single-sided shell casts shadow from its back faces, so the sun's depth there was the ceiling's own underside. A hidden seal slab now sits 0.36 m above the ceiling, the walls rise to it, and both slabs reach over the walls. The culling check found it: 2 px at a channel delta of 10.
5. **The screen e2e learned the scope screen.** It read the old 12.1 × 3.6 m size; it now reads `IPIC_SCREEN`. A 2.39:1 film fills the 2.39:1 screen, so it has no mattes, and the fixture samples mattes only when they are at least 1 % of the screen. The idle texture count now waits until every pose has rendered, because from the square pose the screen hides the rows.
6. **The ground clip stays on the main rectangle.** The first verify failed in `room-ground-clip.test.js`, because the wing counted as room floor that the clip did not cover. The clip only stops street terrain poking through ground-level floors (≤ 0.16 m). The wing's floor is at least 5.09 m up, so the test now expects the main rectangle only. It also fails if a part's floor is ever within 4 m of the street.
7. **The back row is short of THX.** Its 33° meets SMPTE's 30° but not THX's 36°. Reaching 36° with a 7.4 m screen needs a 2.49 m pitch, and that fails legroom. Val can choose a deeper wing if THX's back-row figure matters.

## Files owned

- **Plan, rooms and rendering:** `preview/src/ipic-plan.js`, `store-rooms.js`, `ipic-interior.js`, `ipic-circulation.js`, `interior-exterior-culling.js` and the comment in `room-ground-clip.js`.
- **Data:** `scripts/ipic-review-data.mjs`, which regenerates `docs/ipic-review/circulation.json` and `screen.json`.
- **Contract:** `scripts/office-ipic-contract.mjs`, `docs/design/office-ipic/layout-contract.json` and `camera-manifest.json`.
- **Browser scripts:** `preview/e2e/ipic-visit.js`, `ipic-exterior-culling.mjs`, `ipic-photo-views.mjs` and `fixtures/ipic-screen.js`; `scripts/ipic-short/capture.mjs` and `second-capture.mjs`.
- **Tests:** in `preview/tests`, `ipic-viewing-standards.test.js` (new), `store-rooms`, `ipic-agreement`, `ipic-circulation`, `ipic-interior`, `ipic-house-lights`, `ipic-photo-finishes` and `ipic-screening-view`. Also `preview/tests/room-ground-clip.test.js`. In `server/tests`, `ipic-interior` and `ipic-routes`. In `scripts/tests`, `office-ipic-contract`.
- **Docs:** `docs/ipic-interior.md`.

## Checks

- **IPIC suites:** `node --test` over every `preview/tests/ipic-*`, store-rooms, culling, the server IPIC, darts and rollback tests, and the office-ipic contract test. 132 tests: 131 pass, and the Redis case skips without `REDIS_URL`.
- **Redis case:** `REDIS_URL=redis://127.0.0.1:6491` (a throwaway redis-server) on the IPIC two-coordinator race. 1/1 pass.
- **Review data:** `node scripts/ipic-review-data.mjs --check` reports the data current.
- **GPU visit:** `IPIC_GPU=1 node preview/e2e/ipic-runner.mjs` passed. It walked in through the doorway and down the side aisle and sat in `recliner-1-1`. The seated eye faces the screen, and focus framed the film from 9.50 m. It stood, then walked out to the street. This run came before the seal, which is above the ceiling and off every route.
- **Culling:** `node preview/e2e/ipic-exterior-culling.mjs` passed. All 9 poses decided as expected with 0 changed px, including the 6 wing poses that cull, the doorway and the sideways foyer. Seated frame time was 5.8 ms with culling and 10.2 ms without (p50).
- **Screen fixture:** `node preview/e2e/ipic-screen-runner.mjs` passed 8 checks. 16:9 and 4:3 are pillarboxed, 2.39:1 fills the screen, and 4:1 is letterboxed. Stop restores the material, with 10 textures created and all disposed.
- **Photo views:** `node preview/e2e/ipic-photo-views.mjs` at `43e3e990`, clean (`dirtyPatchSha256` null). The six captures and the receipt are committed in `77aa04f4`. T3 looks down the wing to the screen with alice seated in the middle row; T3-seated is her seat's view over the front row. `office-ipic-contract.test.js` passes 8/8.
- **Core gate, first run:** `pnpm run verify` failed. Agent tests passed; preview tests ran 3,692 with 1 failure (the ground clip, adjustment 6). The later stages did not run.
- **Core gate, rerun:** `pnpm run verify` passed all 11 stages at `f24e7d83` plus this diff (receipt `.runtime/agent/core.json`).
  - Preview: 3,691/3,692, 1 skipped.
  - Server: 729 pass, 212 skipped without Redis or a browser.
  - Agent: 137. Desktop: 76. Python: 145.
  - Build, lint, format, demo and secrets passed.

## Next action

A draft PR is open and hosted CI is the merge gate. Merging waits for Val.

Still open:
- Val's own look at the house in the game.
- Re-probing the second short's close-shot framings in the wing before any new take.
- The THX back-row choice: keep 33°, or deepen the wing for a wider screen.
