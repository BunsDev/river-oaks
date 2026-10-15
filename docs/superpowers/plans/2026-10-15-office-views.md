# #363 slice 2: bounded local office views

- **Task:** `office-views-363` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/office-views-363-20261015` in `../river-oaks-office-views-363`, stacked on
  `feat/office-seat-claims-20261015` (PR #400) at `7ba96bd0`.
- **Issue:** #363 task "Implement bounded local overview/main-floor/workstation/library/terrace-exterior views".

## Objective

Five fixed local views of the penthouse that move only the visitor's camera: never membership,
authoritative position, collision, privacy or geography. Camera and input restore on Escape, a walking
key, the stairs, a chair, the desk, leaving and every other exit; cuts are instant, so reduced motion
needs no separate path.

## Decisions

1. **Views live in the plan** (`views` in `office-layouts.js`, `[x, height above the level floor, d]`), so a
   test holds every eye inside its floor's bounds and headroom and clear of walls, the stair, furniture and
   chairs. The legacy room has none.
2. **A view is local state only.** No command is sent and moves pause; the server position is untouched.
   The visitor's own body is drawn while viewing (seated when seated); peers stay visible near the visitor.
3. **Control:** a `<select>` in the header (pointer/touch) and **V** to cycle; Escape leaves a view before
   the office. Walking keys, Q, Z and the desk return to walking first.

## Checks

| Check | Result |
| --- | --- |
| Plan, UI and world-scene view tests written first | red (missing exports; 2 UI; 1 scene), then green |
| `node --test preview/tests/office-*.test.js` | 87/87 |
| `node preview/e2e/office-penthouse-runner.mjs` | pending (browser lock) |

## Next

Browser run, core verify, review, PR stacked on #400.
