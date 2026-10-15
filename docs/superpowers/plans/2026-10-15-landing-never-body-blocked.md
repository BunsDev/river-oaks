# No barricades: a body on a landing never keeps a visitor off a floor

- **Task:** `landing-never-body-blocked` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `fix/landing-never-body-blocked-20261015` in `../river-oaks-landing-unblock`, from main `ee6a044a`.
- **Request:** Val, 2026-10-15: "ensure someone cannot block someone from moving by barracating them in the theater, etc".

## What could block movement

| Place | Rule | Barricade? |
| --- | --- | --- |
| Streets, IPIC and every store room | `pose` checks only static geometry; players never collide | No |
| Standing up from any seat | The stand search ignores other players; #400 keeps the office stand point clear | No |
| Office seats | You cannot sit while anyone is inside your seated envelope, and every required route stays walkable with all other seats taken (#403/#430) | No |
| **Office stairs and lift** | `office_landing_blocked` when anyone stood within 0.7 m of the far landing | **Yes: one person at the stair top, plus one at the lift landing, kept everyone else on the floor below** |
| **Town multi-level buildings** | `level_landing_blocked` when anyone stood within 0.7 m of the far landing | **Yes, the same for the gallery stairs** |

A town seat with someone standing on it still refuses sitting (`seat_blocked`). That doesn't trap anyone, and it is left as is.

## Change

- `officeLandingSpot()` in `office-layouts.js` is used by `server/offices.js` for transitions. A clear landing is used as is. Otherwise the traveller goes to the nearest spot on rings of 0.8–2.2 m around the landing that is free on the floor, reachable in a straight free line from the landing, and at least 0.7 m from every body. With none, the landing itself, since standing visitors do not collide.
- `server/world.js` applies the same rule to `interiorLevel` in the town's buildings. It still refuses a landing that is itself not free; only bodies no longer refuse.

## Checks

| Check | Result |
| --- | --- |
| Tests written first: a new office stair case (a guest on the stair-top landing, then on the stair foot); the lift case and the gallery stairs case changed from "refused" to "lands beside, not on" | 3 failed before the change, all pass after (9/9 in the two files) |
| `REDIS_URL=<isolated> node --test server/tests/*.test.js` | 783/783 |
| `node --test preview/tests/office-*.test.js` | 116 pass |
