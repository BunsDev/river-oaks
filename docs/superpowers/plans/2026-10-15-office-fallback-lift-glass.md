# Office: fallback scene lift behind the penthouse glass

- **Task:** `office-fallback-lift-glass` (live register), owner `claude:river-oaks-penthouse (7a57e655)`.
- **Branch / worktree:** `fix/office-fallback-lift-glass-20261015` in `../river-oaks-office-fallback-lift`, from `origin/main` `cd99570a`.
- **Follows:** #405 (glazed curtain wall), whose ledger listed this gap: the standalone fallback scene builds its own lift outside the same glass.

## Objective

`createOfficeScene` (`preview/src/office-scene.js`) falls back to a standalone scene when the street cannot be borrowed. That scene adds the whole arrival (`buildOfficeArrival()`, cabin and lobby) beside the office and never hid it. In the glazed penthouse, its stone walls and cabin showed through the front glass beyond the solid core once the visitor walked. The fix gives the fallback the same rule #405 gave the shared-world scene, through one helper, so the two scenes cannot drift apart.

## Decisions

1. **One helper, `arrivalBehindGlass(arrival, glazed)`**, in `office-arrival-architecture.js`, next to the `frontDoors` it keeps.
   - Glazed means any layout except the windowless legacy room.
   - Once `frame.done`, it hides every arrival part except the front door panels and closes them (`doors: 0`).
   - `restore()` returns each part to its saved visibility, so a part that was already hidden stays hidden.
2. **The shared-world scene** switches from its inline #405 code to the helper, with identical behavior. #405's own regression in `office-world-presentation.test.js` stays green, unchanged.
3. **The fallback scene** calls `glass.update(frame)` right after `lift.update(frame)`. It owns its lift and disposes it with the scene, so it needs no restore.
4. **The arrival group is named `office-arrival`**, so tests and debugging can find it.
5. **Out of scope:** the fallback's backdrop stays the flat stone colour (`OFFICE_FINISH.stone`). With no street there is nothing to capture for the skyline. `docs/offices.md` now says so, and the bullet's outdated line saying the glass "looks out on the sky backdrop, not the town" (true before #408) is corrected.
6. **Keeping clear of #400/#404:** the hunks stay away from the lines the open #363 seat/views stack edits in `office-scene.js` (camera and `actors.sync`). A new import line and new statements avoid touching their import line.

## Checks

| Check | Result |
| --- | --- |
| New tests written first (`office-scene.test.js`) | helper test red (`arrivalBehindGlass is not a function`). The fallback-scene test drives the real `createOfficeScene` and real `buildOfficeArrival` with a stub 2D context and a recording renderer. It was red with **19** arrival parts drawn while walking the penthouse, against an expected 2. |
| `node --test preview/tests/office-*.test.js` after the fix | 88/88, including #405's world-scene regression unchanged |
| `pnpm run verify` | core passed (`.runtime/agent/core.json`): agent 109/109, preview 3194/3196 (1 skipped, 1 todo), server 572/720 (148 skipped: Redis), desktop 69/69, Python 141 passed, build, ruff lint and format |
| `node preview/e2e/office-penthouse-runner.mjs` (shared-world path, software rendering) | passed 6/6 (main floor admitted, walked to the stair foot, stairs offered only there, landed at the stair head, eye rose 3.800 m, no page errors), Chromium 156.0.8078.4. The scripted path never faces the front glass; the hidden lobby is covered by the node tests. |

## Gaps

- **No browser evidence for the fallback path itself.** The browser fixture always borrows the street, so the standalone scene runs only in the node test, with the real arrival architecture and a stub renderer.

## Next

Independent review, a PR, and landing with Val's approval.
