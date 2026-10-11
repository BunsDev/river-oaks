# Workplace room: door height, measured seated bounds, depth-aware routes (#221 gap)

**Status:** implemented on `fix/workplace-room-envelope`, which is stacked on `fix/workplace-task-sweep` (PR #235).
**Owner:** Claude session `river-oaks-c2` (task `workplace-room-envelope`).
**Source:** finding 6 of the independent #221 evidence review. The door header was 2.4 m, below the 2.45 m `forest-aristocrat` looks. The seated radius of 0.45 m was assumed, not measured. Routes used the body half-width everywhere, ignoring body depth.

## Measurement

[`measure-envelope.mjs`](2026-10-11-workplace-room-envelope/measure-envelope.mjs) drives each of the 22 shared looks on `preview/e2e/fixtures/appearance.html`. It ran on 2026-10-11 in Chromium with Metal ANGLE. Raw output is in [`envelope-measured.json`](2026-10-11-workplace-room-envelope/envelope-measured.json) and is merged into `docs/level-design/workplace-coworking-fixture/avatar-envelope.json`.

- **Standing:** the fixture's rest-pose `Box3`. Every look matches the committed envelope exactly. The tallest are `forest-aristocrat` and `forest-aristocrat-beast` at **2.45 m**.
- **Seated:**
  - The rig is driven through the game's own seat path (`riding`, `ridingKind: 'seat'`, `seatToFloor: 0.45`) for 3 s of animation.
  - Then the skinned vertex bounds of the visible meshes are measured.
  - The plan-view reach from the seat origin is widest for `kai-formal-beast`, `kai-explorer-beast` and `kai-noir-beast`, at **1.264 m**. Legs reach forward about 1.15 m and tails reach back.
  - The old 0.45 m assumption was under half of that.
  - The game lowers the whole avatar onto the seat separately, so seated height isn't measured.

## Changes (`preview/src/workplace-room.js`)

- `AVATAR_ENVELOPE` gains `height: 2.45`, and `seatedRadius` goes from 0.45 to 1.27.
- The room plan gains `door.height: 2.6`, which is 2.45 m plus at least 0.1 m headroom. The graybox's door header is now built from it instead of a hard-coded 2.4 m.
- `validateRoomPlan` adds two checks: the door must be at least 0.1 m taller than the tallest look, and no taller than the room.
- New `bodyClearance(room)`: within about 1 m of the entrance wall plane a body passes straight, so it needs only its half-width. Everywhere else it needs its full 0.888 m turning circle. The validator's routes use it.
- The coworking plan itself needed no change: it validates with the measured seated footprint and the depth-aware routes.

## Checks

- `preview/tests/workplace-room.test.js` has 7 cases, 3 of them new: envelope coverage, door height and an open doorway in the graybox, and a 1.2 m gap that fits a body but not a turning one. The new cases failed before the change.
- Mutation check:
  - Restoring the 2.4 m header fails 1 case.
  - Routing with the body half-width fails 1 case.
- The `workplace-room` graybox harness passed, and the CAM-04 capture shows the taller doorway.
- `node --test preview/tests/*.test.js`: 2596 pass, 1 skip that was already there.
- `pnpm run verify`: core passed.

## Gaps

- Cloth and walking-cycle swing are still not in the envelope. Bounds are taken at rest or at a settled seat.
- The seated footprint is a conservative circle; a tail behind a wall-facing seat may in practice overlap the desk zone.
- The 8-occupant envelope and the art pass are still deferred.
