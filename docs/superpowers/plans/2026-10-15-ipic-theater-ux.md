# IPIC theater: Step outside only near the door, a quieter seated mode, house lights

- **Task:** `ipic-theater-ux` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/ipic-theater-ux-20261015` in `../river-oaks-theater-ux`.
- **Request:** Val, 2026-10-15: "remove the step outside prompt when clearly far from the exit door like
  in the theater and improve the ui ux of the theater expereience".

## Before

- **Step outside and F** showed everywhere inside a walk-in room. In IPIC's auditorium, 34 m and two
  escalator runs from the street door, they still offered to leave.
- **Seated in a recliner**, the screening panel competed with the play dock, the town chat, the idle
  greeting card and the walking card's Meet, Talk and Play.
- **The house lights** stayed at full while the film played.

## Change

- **Step outside only near the door.** `preview/src/room-exit.js` sets `ROOM_EXIT_REACH = 12` m, and
  `nearRoomExit` fails open when a room has no local frame. `walking-ui.js` hides Step outside and ignores
  F unless you are within reach of the room's door. Only IPIC is deeper than 12 m.
- **Seated mode.** `walking-ui.js` sets `body.theater-seated` while `seatedEyeView(sitting)` holds. In
  `ipic-screening.css`, the following step aside while seated:
  - the play dock;
  - the town chat;
  - the idle greeting card;
  - the walking card's Meet nearby, Talk and Play.

  Stand up and any invitation stay. The panel turns compact and dark, with 17 px captions.
- **The panel clears the walking card.** `panelClearance(card, viewportHeight)` in
  `ipic-screening-ui.js` is pure and unit-tested. Every 250 ms the panel measures the walking card and
  sets `--ipic-clear`, so its bottom edge stays 8 px above it, whatever the card's height or breakpoint.
  The stylesheet's 148/156 px offsets remain the floor when standing.
- **Stand up returns on phones.** Below 700 px an open town chat (or play dock) hides the walking card.
  Seated, both are out of sight, so `body.theater-seated:has(.town-chat-dock[open],.visit-tools[open])
  .walking-console` makes it visible again. A phone has no Z key, so Stand up is its way out.
- **House lights.** In `ipic-interior.js` the four lights deepest in the auditorium (`d > 27`) are tagged
  `house`. `houseLightTarget` and `nextHouseLight` in `ipic-screening-ui.js` dim them to 0.25 while the
  film plays and bring them back on pause or stop (time constant 0.45 s). `main.js` scales them.
  `inspect().houseLights` exposes the level.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/room-exit.test.js`, written first | Failed (no module), then 2/2 |
| `node --test preview/tests/ipic-house-lights.test.js`, written first | Failed (no export), then 2/2 |
| `node --test preview/tests/ipic-screening-ui.test.js` with the clearance test, written first | Failed (no `panelClearance` export), then passed (9/9 with the two files above) |
| `node preview/e2e/ipic-runner.mjs` (IPIC visit journey, software rendering) | Passed 8 checks. Seated, with the film started from the seat (synthetic host grant), Stand up is visible, topmost and clear of the panel at 1280 and 390 px, and a tap at 390 stands the viewer up. Two earlier runs failed in my new step: it first required a panel that only shows while a film plays, then the grant named `owner` instead of that fixture's user id. |
| `node preview/e2e/ipic-screening-runner.mjs` | Passed 12 checks, including house lights below 0.5 while playing and above 0.9 after pause |
| Seated capture with Metal ANGLE at 1440×900 and 390×844 (scratch `t3-seated.mjs`, the short playing) | Before the clearance fix it failed: at 1440 the panel overlapped the walking card by 18 px, and at 390 Stand up was hidden (`visibility: hidden` from the open chat) and covered by the panel. After it, it passed: the panel ends 8 px above the card at both sizes, Stand up is visible and topmost, every film control is on screen and topmost, and captions equal the active cue. |
| `pnpm run verify` (core) | Passed: agent 111/111, preview 3267 + 1 skip + 1 todo (the known 1.005 m lounge passage), server 590 + 150 Redis skips, 69/69 |

## Limits

- Software rendering in the journeys, plus Metal Chromium captures on macOS.
- A 390 px viewport, not a physical phone.
- Not a human accessibility review.
