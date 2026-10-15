# #363 slice 1: penthouse seat claims and occupied-body clearance

- **Task:** `office-seat-claims-363` (live register in the primary checkout), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/office-seat-claims-20261015` in `../river-oaks-office-seats-363`, from `origin/main` `9d83cd31`.
- **Issues:** #363 (first two task boxes and the seat part of acceptance); supplies the occupied-seat route receipt #361 is waiting on.
- **Versions:** layout `office-penthouse-1` (schemaVersion 1), contract `docs/design/office-ipic/layout-contract.json` (sourceRevision unchanged), library revision 3. Checkpoint/writer generation **v10 → v11**.

## Objective

Make the admitted penthouse's chairs authoritative server seats: one winner per seat, the measured
seated body as collision for everyone else, safe stand/release on every exit path, persistence
across Redis coordinator replacement, and a client control that never predicts what the server
would refuse. Final desk footprints are #362's; nothing here invents them.

## Decisions

1. **Seats are the plan's.** Five desk chairs (contract station seats, facing their desks, standing up
   to the desk approach) and the two revision-3 reading chairs (facing the gallery, standing up onto
   the gallery band edge, d 16.45 from the contract's `gallery-route`). The legacy room and personal
   workspaces have no seats, so the default experience is unchanged.
2. **Occupied clearance = turning radius + seated footprint (0.888 + 1.27 = 2.158 m)**, the same sum the
   legacy room's `validateRoomPlan` uses. No radius is shrunk. Every stand point lies inside its own
   seat's envelope, so nobody else can stand there and standing up is never body-blocked.
3. **A claim is refused while another standing visitor is inside the envelope** (`office_seat_blocked`),
   so sitting can never trap someone. Moves exclude an envelope that already contains the mover (only a
   restored checkpoint could produce that), so nobody is ever trapped.
4. **Persistence needs checkpoint v11.** Production runs the gateway on Vercel functions
   (`maxDuration` 300 s), so the Redis lease changes hands at least every few minutes; transient seats
   would stand people up. v11 adds optional `seat: {id}` to office visits, validated as exactly the plan
   seat's pose on its own floor with a clear stand point and unique occupancy. v10 visits stand. This is
   a checkpoint generation bump, like v9/v10: merging and deploying it migrates the production checkpoint
   to v11, and older writers then refuse it. **Merge/deploy needs Val's authorization.**
5. **Seat height 0.5 m** (graybox chairs redrawn to it; seated eye 1.2 m). Final chair art must match.

## Files

`preview/src/office-layouts.js`, `server/offices.js`, `server/world.js` (version constant and accepted list
only), `server/redis-room.js` (writer token only), `server/avatar-preferences.js`, `server/creator-rollout-audit.js`,
`preview/src/office-ui.js`, `preview/src/office-scene.js`, `preview/src/office-world-scene.js`,
`preview/src/office-penthouse-graybox.js`, `docs/offices.md` (penthouse seats bullets),
`docs/multiplayer.md` (checkpoint versions); tests `preview/tests/office-seats.test.js`,
`server/tests/penthouse-seats.test.js`, `server/tests/penthouse-seats-redis.test.js`, additions to
`preview/tests/office-ui.test.js` and `office-world-presentation.test.js`, version pins in six server tests.

Codex's `office-world-lifecycle-reliability` also edits `server/world.js`, `server/redis-room.js` and the
checkpoint paragraph of `docs/offices.md` (different hunks). Whichever lands second reconciles; if it is
this branch, update that paragraph's "fenced at v10" to v11.

## Checks (2026-10-15, machine load average ~120)

| Check | Result |
| --- | --- |
| Plan tests written first (`office-seats.test.js`) | red by import (exports absent), then 5/5 |
| Server seat tests written first (`penthouse-seats.test.js`) | 6/6 red, then 6/6 |
| Seat UI tests written first (4 in `office-ui.test.js`) | 4 red, then 30/30 in file |
| World-scene seated pose test | red, then 9/9 in file |
| `node --test preview/tests/office-*.test.js` | 81/81 |
| `REDIS_URL=<isolated :16473> node --test server/tests/*.test.js` (before UI work, after server + v11) | 727/729; the two failures were timeouts (`offices-transport` 7 s command, `design-library-gateway` 23 s) and pass alone 4/4 |
| `REDIS_URL=… node --test server/tests/penthouse-seats-redis.test.js` | 1/1: two coordinators, one winner; claim survives replacement; departure after grace releases |
| `node --test preview/tests/*.test.js` | 3101/3103 + 1 skip; the failure (plaza mill AI budget, 24 s) passes alone |

## Gaps / next

- Browser proof: extend `preview/e2e/office-penthouse-runner.mjs` with sit/stand under the browser lock.
- Core `pnpm run verify`, independent review, PR (no merge without authorization).
- Next #363 slices: desk chair opens the private desk (partly done: seated at a desk chair offers **Use this desk**);
  bounded local views; #362 desk footprints when supplied.
