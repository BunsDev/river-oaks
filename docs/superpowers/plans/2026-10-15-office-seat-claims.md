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
3. **A taken seat also keeps a 0.7 m disc around its stand point clear** (`OFFICE_BODY_SPACING`, the spacing
   landings and standing already used). Independent review found that without it a bystander just outside
   the envelope could keep the occupant seated (`de13bbcb`). A claim is refused while another standing
   visitor is inside either area (`office_seat_blocked`), so sitting never traps anyone and standing up is
   never body-blocked. A standing visit inside a taken seat is therefore unreachable: moves no longer
   tolerate it, and a checkpoint holding one fails closed.
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
| `node preview/e2e/office-penthouse-runner.mjs` at `d79016c1` + journey edits | passed 13 checks: seated at `[3.65, 5.6]` facing 0, eye 0.480 m lower, desk offered, keys do not move, stood at `[3.65, 3.55]`; stairs eye rise 3.800 m. Its screenshot showed **Stand up · Z** behind the header (fixed in `de13bbcb`, now asserted) |
| Rerun before the fix | failed before any office step: `#office-lobby` not attached in 15 s (load ~80) |
| After the review fix: office preview tests | 82/82 |
| After the review fix: `REDIS_URL=… node --test server/tests/penthouse-*.test.js server/tests/offices*.test.js` | 26/26 |
| After the review fix: `REDIS_URL=<isolated :16473> node --test server/tests/*.test.js` at `de13bbcb` | 732/732, 0 skipped |

## Independent review (subagent, 2026-10-15, at `d79016c1`)

- **Confirmed, fixed in `de13bbcb`:** a bystander within 0.7 m of a stand point but outside the envelope
  blocked `stand` (reproduced at [3.65, 3.44] beside desk A1). Regressions: plan disc test, server
  `a visitor beside the stand point blocks the claim…`, `nobody walks… beside its stand point`.
- **Folded in:** the escape rule (broader than an escape) and the client's matching rule were removed;
  restore now refuses the unreachable state. **Seat taken** replaces **Sit down** for an occupied chair.
  Rollout-audit proof labels now say v11.
- **Accepted as is:** a stale tick snapshot can briefly flip the client's seat state after a reply; the
  next snapshot corrects it, the same as the existing floor adoption.
- **Deferred to merge time:** `docs/offices.md`'s checkpoint paragraph ("fenced at v10") and
  `docs/screenings.md`'s Versions bullet (Codex's branch says "the current Redis writer generation is
  `v10:`") are rewritten by `fix/office-world-lifecycle-reliability`; whichever lands second updates both to v11.
- **Hosted CI:** all checks green on #400 at `7ba96bd0` (aggregate `preview`, shared and experience shards,
  verify 3.11/3.13, CodeQL, dependency review).

## Gaps / next

- Browser proof: extend `preview/e2e/office-penthouse-runner.mjs` with sit/stand under the browser lock.
- Core `pnpm run verify`, independent review, PR (no merge without authorization).
- Next #363 slices: desk chair opens the private desk (partly done: seated at a desk chair offers **Use this desk**);
  bounded local views; #362 desk footprints when supplied.
