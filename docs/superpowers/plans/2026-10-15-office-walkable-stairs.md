# Office: walk the penthouse stair

- **Task:** `office-walkable-stairs` (live register), owner `claude:river-oaks-penthouse (7a57e655)`.
- **Branch / worktree:** `feat/office-walkable-stairs-20261015` in `../river-oaks-office-walkable-stairs`, from `origin/main` `326506f7`.
- **Request:** Val, 2026-10-15: "enable walking up the stairs". Until now the stair was only a fixed-endpoint transition (Q), as the reviewed #360/#361 contract had it. The treads were visual.

## Objective

Let a visitor walk up and down the penthouse stair with ordinary movement. The server stays authoritative: it derives the height from the position, changes floor only where the stair meets one, and never takes a height or floor from the client. Q and the lift keep working.

## Decisions

1. **One shared rule**, in `preview/src/office-layouts.js`, used by both the server and client prediction.
   - **The lane.** A lane down the stair's middle, a turning radius (0.888 m) clear of each side, belongs to the main floor's plan: the floor whose obstacles hold the stair. The stair stays the contract's numbers, and the contract test is unchanged. The lane runs one turning radius past the foot and the head, so it meets the main floor's and the mezzanine's standing ground exactly.
   - **`officeElevationAt`.** On the lane, the height comes from the position along the run, through the tread nosings: `rise · (d − (d0 − run)) / (d1 − d0)`, clamped. A foot never sinks into a tread, and at most floats one riser (0.173 m) above it.
   - **`officeWalk`.** Samples a move every 0.1 m, like `officeLevelSegmentFree`. It keeps the current floor while the next sample is standing ground at a height within 0.25 m; otherwise it crosses to another floor only if that floor is standing ground at the same height there. So the stair head leads onto the mezzanine and the foot onto the main floor. Side steps onto the flight, steps off the mezzanine edge, and walking into the back of the stair from the main floor under the mezzanine (0 m against 3.8 m) are all refused.
   - **`officeStandFree`.** Floor plan, or the stair lane for its own floor.
   - **`officeStep`.** Client prediction, axis-separated like `stepOfficeLevel`, which stays for its existing callers.
2. **Server** (`server/offices.js`).
   - **Moves.** A move's target must be standing ground on some floor. The budget check runs before the walk, so error codes are unchanged. `officeWalk` then decides the floor, and the visit takes it.
   - **Snapshots.** They report `elevation: officeElevationAt(…)`.
   - **Seats and restores.** Seat claims, and checkpoint restores of standing visits, accept a visitor on the stair (`officeStandFree`). No checkpoint version bump is needed: a stair position is an ordinary main-floor position.
3. **Client.**
   - `office-ui.js` predicts with `officeStep` and tracks the floor the server holds (`heldLevelId`) apart from the predicted one. A move names the held floor, the floor it starts on, so a climb onto the mezzanine is not refused as stale. The client adopts the floor the server answers with. The snapshot sync compares against the held floor and waits while a move is in flight.
   - Both scenes put the eye and the body at `officeElevationAt` for the local visitor. Remote visitors already used the server's `elevation`.
4. **Graybox.** The mezzanine guard opens where the stair arrives (x 10.2–13.4), as in the kit's blockout.
5. **One existing assertion changed** (`penthouse-office.test.js`). Its premise was that "the stair is not walkable from the main floor". It now checks that the stair's sides are never standing ground.

## Checks

| Check | Result |
| --- | --- |
| New layout tests (`preview/tests/office-stairs.test.js`) | red first (missing exports), now 5/5. Covers: nosings, both directions with floor changes, side/back/edge entries refused, standing clear of seats, client stepping matches. |
| New server tests (`server/tests/penthouse-stairs.test.js`) | red first, now 4/4. Covers: a full climb through real move commands (heights only rise, part way up mid-flight, L1 at 3.8 m on top, L0 at 0 at the foot); side step and stale floor refused; a checkpoint mid-flight restores identically; a stair walker does not block a desk chair claim. |
| Graybox (`office-penthouse-graybox.test.js`) | the new guard-opening and body-on-the-stair case was red first (guard continuous), now 9/9. Nothing solid stands in a body anywhere on the lane. |
| `node --test` office, penthouse and seat suites | 136/137 (1 skipped), 0 failed |
| `pnpm run verify` | core passed: agent 111/111, preview 3253/3255 (1 skipped, 1 todo), server 586/735 (149 skipped: need Redis), desktop 69/69, Python 141, build, ruff |
| `REDIS_URL=<isolated redis-server --save ''> pnpm run test:server` | 777/777, none skipped |
| `node preview/e2e/office-penthouse-stairs-runner.mjs` (new browser climb with W, software rendering) | pending: queued fifth on the shared browser lock |

## Gaps

- **Browser journey pending** (above). A local dev server is up for Val to try.
- **Expected conflicts.** #430 (desk footprints) edits the same restore lines in `server/offices.js` and the plan header. Keep both changes: #430's `onFloor` check and this branch's `officeStandFree` agree that a stair position (inside the main floor's bounds) is valid.
- **Not done here.** No side guards are drawn on the flight, and there are no stair sounds or step animation. The avatar glides at the derived height.

## Next

The browser journey under the lock, independent review, then land with Val's approval.
