# Office #361: versioned multilevel office traversal and safe visit migration (2026-10-15)

Task `office-penthouse-traversal-361` · owner claude:river-oaks-1b (f4107618) · parent #359, package #361, after #360's G1 (closed 2026-10-15, contract on `main` at `a714a8a5`).

## Objective

An authorized visitor can use the penthouse main floor, mezzanine, stair, lift and terrace with server-validated support, collision and recovery. The legacy 9 × 7 m office stays the default and the rollback, and grants and private desks survive either way. Nothing is activated: the penthouse is selected only by an explicit server option.

## Decisions taken from the packet (no new schema)

- **Level and portal shape.** The penthouse reuses #349's shape:
  - levels `jevica-office/l0` and `jevica-office/l1`;
  - rooms `<level>/room/<zone>`;
  - portals `<level>/portal/<name>` with `toLevelId`.

  The contract names the mezzanine level `mezz`; it maps to `jevica-office/l1`. The office is not a mapped building, so it stays out of `worldData.buildingInteriors` and the world fingerprint does not change.
- **One generalization of #349.**
  - Its stairs pair by identical XY. The office stair's ends are 10.7 m apart (bottom `[11.8, 4.5]`, top `[11.8, 15.2]`), so pairs name each other through `pairId`.
  - The lift is a portal of kind `lift`, so it is not dressed up as a stair.
  - Both are fixed-endpoint transitions, as #349's stairs are: entry within 1.3 m, a paired landing that must be free. A climb animation is render-only.
- **Geometry source.** `preview/src/office-layouts.js` is the executable plan. Its numbers are the reviewed contract's (shell, levels, terrace openings, stair, lift, anchors, library revision 3). `preview/tests/office-layouts.test.js` fails if the two disagree.
  - The kit's 46 colliders and 32 placements are not imported. Val's import decision (R19) is open, and the goal forbids copying kit bytes. Desk chairs are collision at the contract's seat positions; desks themselves arrive with #362.
- **Building raise.** Raising the tower to 33 m changes the world fingerprint and migrates the production checkpoint on deploy, so it ships with activation, not here (Decision for Val).
- **Checkpoint.** #366 takes version 9 for screenings. The visit migration here takes version 10 and rebases if #366 lands first.

## Pull requests

1. **PR A, layout plan and server authority** (this branch, `feat/office-penthouse-layout-20261015`):
   - the plan module and client-prediction helpers;
   - visits carry `layout` and `levelId`;
   - the `transition` action;
   - movement per level;
   - the layout pinned at `enter` from `RIVER_OAKS_OFFICE_LAYOUT` (default legacy);
   - checkpoint v10 migrates legacy visits;
   - rollback ends incompatible visits;
   - two-client vertical traversal over real transports.

   Nothing renders the penthouse yet, and nothing selects it by default.
2. **PR B, client:**
   - stepping on the admitted floor;
   - a stair and lift control fenced by the visit epoch;
   - avatars and eye at the server-derived elevation;
   - level-aware peer hiding;
   - a graybox of the penthouse drawn from the plan;
   - an unknown layout refuses to render.

## Files owned

- `preview/src/office-layouts.js`
- `preview/tests/office-layouts.test.js`
- `server/offices.js`
- `server/world.js`: office checkpoint version
- `server/tests/penthouse-*.test.js`: new tests avoid `server/tests/office*.test.js`, which the live Codex task `office-computer-reliability` owns
- `preview/src/office-scene.js`
- `preview/src/office-world-scene.js`
- `preview/src/office-ui.js`
- `docs/offices.md`: authority and persistence section only; the operations section is Codex's
- this ledger

## Checks

All work so far is in a scratch copy of `main` at `a714a8a5` with #366's patch applied (this package takes checkpoint v10 on top of #366's v9). Redis runs use a throwaway `redis-server` on 127.0.0.1:16471.

| Command | Result |
| --- | --- |
| `node --test preview/tests/office-layouts.test.js`, before the module | failed: module not found |
| same, with the module | 7 pass, 0 fail (after fixing the test's grid search, which merged cells at exact .5 boundaries) |
| `node --test server/tests/penthouse-office.test.js`, before the server change | 6 fail |
| same, after | 6 pass. The first run's three failures were test paths that walked through a reading chair, the executive desk chair, or past the entry budget; the server was right each time. |
| `REDIS_URL=… node --test server/tests/penthouse-transport.test.js` | 2/2: two real WebSocket visitors on different floors, memory and Redis |
| `REDIS_URL=… node --test server/tests/*.test.js` (with #366) | 715 of 715, 0 skips |
| PR A worktree at `main` `096a6cdd` (with #366) + PR A files: `REDIS_URL=… node --test server/tests/*.test.js` | 715 of 715, 0 skips |
| PR A: `pnpm run verify` (core) | passed: agent 109/109, preview 3065 pass + 1 existing skip, server 526 pass + 147 Redis skips (covered by the Redis run above), desktop 69/69, build, Python 141, secrets |
| PR B client tests (`office-scene`, `office-penthouse-graybox`, `office-ui`), new cases first run against the original UI | the 4 new UI cases fail on the original `office-ui.js`, and pass after |
| PR A + PR B together: `node --test preview/tests/office-*.test.js preview/tests/workplace-office.test.js` | 75 of 75 |
| PR A + PR B together: `node --test preview/tests/*.test.js` | 3076 pass, 1 existing skip, 0 fail |

## PR B checks

PR B worktree `../river-oaks-office-penthouse-client-20261015` on `main` `0a74d0c3`, which includes PR A.

| Command | Result |
| --- | --- |
| `node --test preview/tests/office-*.test.js preview/tests/workplace-office.test.js` | 75 of 75 |
| `node preview/e2e/office-penthouse-runner.mjs`, run 1 | failed: **Take the stairs up** appeared at the stair foot, but the dialog header covered the new button (a pointer could not press it; Q worked). Fixed in `office.css`: the button sits above the movement pad. |
| run 2 (Chromium, SwiftShader) | **passed**: the server admitted `office-penthouse-1` on `jevica-office/l0`; the visitor walked to the stair foot by pointer steering and W; **Take the stairs up** pressed; the server landed the visitor at the stair head on `jevica-office/l1`; the first-person eye rose 3.800 m; no page errors. Captures and report in `~/worktree-backups/river-oaks/office-penthouse-traversal-361-prB-evidence-20261015/`. |
| `pnpm run test:experience office-visit` (legacy regression, after the CSS fix) | passed, all 13 checks: elevator phases, walking, walls, reduced motion, guest refused, request accepted, revocation, revocation during boarding. The tracked `data/reports/experience.json` it rewrote is restored, with a copy kept with the evidence. |
| `pnpm run verify` (core), before the CSS-only fix | passed: agent 109/109, preview 3076 pass + 1 existing skip, server 526 pass + 147 Redis skips, desktop 69/69, build, Python 141, secrets |

Not covered: real-GPU visuals (the graybox renders flat in SwiftShader), touch devices, and a two-browser penthouse run (the two-client floor case is covered over real WebSockets in PR A).

## Decisions for Val

1. **Building raise deploy.** The 33 m raise (your fit decision) changes the world fingerprint, and the production town's checkpoint migrates on that deploy. It is held for the activation step. Say when that deploy is authorized.
2. **Kit import (R19).** Without it, penthouse desks have chair collision only; full furniture collision and art come with #362.

## Next action

PR A landed as #396. Land PR B with `pnpm run land <pr> --owner river-oaks-1b`, then close #361 with evidence.
