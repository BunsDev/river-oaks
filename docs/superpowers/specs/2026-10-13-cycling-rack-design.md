# Cycling rack and miles leaderboard — design (2026-10-13)

Players take a bike from a rack on the Dior–Toulouse plaza, ride it through the
district, and their validated cycling distance accumulates on a per-account
leaderboard. Approved in conversation with Val on 2026-10-13: dock anywhere,
all-time miles per account shared across worlds, leaderboard as a Play-dock
sheet plus a hint at the rack.

## Goals

- Any signed-in player can ride a bike; the bike is a server-validated vehicle,
  not a client speed mode.
- Miles are counted only from pose updates the server has already accepted, so
  the total is as trustworthy as movement itself.
- One lifetime total per account, visible on a top-20 board with the viewer's
  own rank.
- Works in the dev town (Memory store) and the hosted gateway (Redis store).

## Non-goals

Weekly or per-world boards, bikes for residents, abandoned bikes in the world,
new bike physics beyond the speed model, bike customisation.

## 1. World: rack, slots and the bicycle vehicle

**Plan data.** `preview/src/plaza-salon-plan.js` gains a `rack` entry:
position on the open paving on the plaza's north edge, east of the second
planter and clear of the Dior entrance (east ≈ -2784.7), heading along the
footway. `plazaSalonRack(world)` returns the rack and four slots as
`{rackId:'plaza-salon-rack', slot, x, north, heading, approach}` using the
seat conventions (`[east, north]` metres, heading `atan2(dx, -dnorth)`,
`approach` 0.9 m behind the slot). `plazaSalonFootprints` adds a row of
overlapping discs for the rack bar so nobody walks through it; slots stay
open because the mount position must be free. The plan is pure data and is
imported by the browser and the server; nothing copies the coordinates.

**Prop.** `preview/src/plaza-salon.js` draws a smoked-bronze hoop rack and four
parked bikes from authored geometry (no image assets), one `InstancedMesh` per
part. `plazaSalon.userData.rack.setTaken(slots)` hides a parked bike while its
slot is held.

**Vehicle.** `preview/src/vehicle-config.js` adds `bicycle` to `VehicleKind` and
`VEHICLES`: label "Plaza bicycle", length 1.8, width 0.6, height 1.1,
wheelbase 1.05, maxSpeed 8.05 (18 mph, the hard cap), cruiseSpeed 5 (the
pedalling speed without sprint), steeringLimit 0.6, one steered wheel, driverSeat
and grips from the motorcycle scaled to the frame, no passenger seat
(`passengerSeat: null`; the carriage code that reads it must tolerate null).
`vehicleKind()` accepts it. `road-vehicles.js` adds a bicycle mesh;
`riding-clothes.js` and `driving-hands.js` reuse the motorcycle pose.

**Variable speed.** Pedalling speed follows the drive input: the target speed
is `forward × cruiseSpeed`, or `forward × maxSpeed` while the sprint key
(Shift, the brisk-walk key) or the sprint button is held, so a rider can coast
slowly, cruise at 5 m/s, or sprint up to 18 mph. `carriage-motion.js` reads
`cruiseSpeed` when the spec has one and the input carries `sprint: true`
(`drivingInput` learns the optional boolean); the car and motorcycle have no
`cruiseSpeed` and keep their single target speed. The server budget uses
`maxSpeed` (8.05 m/s) for every bicycle pose, so sprint changes nothing in the
validator; the cap is the same whichever key is held.

**Taking and returning.** Within `SEAT_REACH` of a free slot the walking
console shows "Take a bike (G)" (or the rack tap target). The client sends
`{type:'cycle', rackId, slot}`; on `ok` it mounts the bicycle controller via
`walking.mount` exactly as `parked-carriage.js` boards the car. Step out (the
existing leave action, which already uses the server travel command so the
dismount is not rejected as too fast) sends `{type:'uncycle'}` and the slot is
released. Disconnect releases it. The bike never exists outside the rack and
the rider; there is nothing to recover.

**Eligibility.** `server/world.js` `pose()` keeps `exclusive_vehicle` for
`rolls` and `motorcycle`; `bicycle` is accepted from any player who holds a
slot (`player.cycling`), otherwise `bike_required`.

## 2. Server authority and persistence

**Room state.** The room holds `cycling: Map<slotId, connectionId>`; the
snapshot carries `cycling: {taken: slotId[]}` at the top level, and the public
player keeps `vehicle: 'bicycle'` while riding. `slotId` is
`'plaza-salon-rack:<n>'`.

**Commands** (dispatched beside `sit`/`stand` in `world.js`):

| Command | Checks | Effect |
| --- | --- | --- |
| `cycle {rackId, slot}` | signed in, not seated, on the ground, within `SEAT_REACH` of the slot's approach, same room, slot free | `player.cycling = slotId`, pose snapped to the slot with its heading, `vehicle = 'bicycle'`, `rideMeters = 0` |
| `uncycle` | holds a slot | flush ride meters, release slot, `vehicle = null`; the exit spot uses the `stand()` ring search |

Refusals: `slot_taken`, `rack_out_of_reach`, `bike_required`, `seated`.
Disconnect runs the same release path as `uncycle`.

**Counting.** In `pose()`, after the speed budget and collision sampling have
accepted a `bicycle` pose, add the accepted ground distance to
`player.rideMeters`. Rejected poses, seated, airborne and walking poses add
nothing. The 8.05 m/s (18 mph) budget bounds earning.

**Store.** `server/cycling-miles.js` exports `MemoryCyclingMiles` and
`RedisCyclingMiles` with one contract:

- `add(userId, meters, name)` → new total
- `top(limit)` → `[{userId, name, meters}]`
- `rank(userId)` → `{rank, meters} | null`

Redis layout under `accountPrefixFor(namespace)` (cross-world):
`<prefix>:cycling-miles:v1` sorted set, member `sha256(userId)`, score meters
(`ZINCRBY`); `<prefix>:cycling-riders:v1` hash, field `sha256(userId)`, value
`{name, updatedAt}`. Capacity follows the profiles cap (reject new riders
beyond the cap; existing riders always add). Both twins pass the same test
suite; the Redis half is gated on `REDIS_URL`.

**Flushing.** The ride meter flushes on `uncycle`, on disconnect, and every
30 s while riding (room tick). A flush writes only when meters > 0 and
re-reads nothing. The display name is the player's public roster name at
flush time.

**Route.** `GET /api/cycling/leaderboard` (profile-api pattern, mounted in
`app.js` and `distributed-app.js`) returns
`{top:[{rank, name, miles}], me:{rank, miles} | null, limit: 20}`. Miles are
`meters / 1609.344` rounded to one decimal. The response is cached in memory
for 10 s per world router instance. Requires a session; no ids leave the
server.

## 3. Client UI

**Rack prompt.** `preview/src/world-interactions.js` adds the rack as an
interaction target; the walking console shows "Take a bike (G)" with "You've
cycled N mi" beneath (from the last leaderboard `me`), or "All bikes are out".
While riding, the console distance line reads "N mi cycled this ride" from the
client's own accepted-step tally (display only; the server total is the
record).

**Dock sheet.** `preview/src/play-dock.js` gains a "Cycling" entry that opens a
glass sheet (`sidebar.js` sheet pattern, `hud-glass.css` tokens) titled
"Cycling leaderboard": an `<ol>` of the top 20 with rank, name and miles,
keyed row reuse as in `community-ui.js`, the viewer's row highlighted, and a
pinned footer "You: #rank · N mi" when the viewer is outside the top 20.
Fetch on open, refresh every 30 s while open, stop when closed. Empty state:
"No miles yet. Take a bike at the plaza rack." Fetch errors show "Leaderboard
unavailable" and keep the last list.

**Remote riders.** `remote-players.js` renders `vehicle: 'bicycle'` with the
bicycle mesh and the seated rider pose, as it does for the motorcycle.

**Dev.** The dev town (`server/town.js`) wires `MemoryCyclingMiles`; the
gateway wires the Redis twin. Loopback fixture identities ride and rank at
`localhost:5173` with no Redis. Acceptance uses a worktree dev server with
`RIVER_OAKS_ACCEPTANCE_FIXTURE=1` on its own ports, never the primary 5173.

## 4. Testing

**Server** (`server/tests/cycling.test.js`, real local transport):
- claim a slot; a second player is refused the same slot; the fifth rider is
  refused; the slot frees on `uncycle` and on disconnect.
- `bicycle` pose without a slot → `bike_required`; a pose over budget →
  `movement_too_fast` and no meters.
- an accepted ride adds the stepped distance; `uncycle` flushes; a reconnect
  keeps the total; the 30 s tick flushes mid-ride.
- `cycling-miles` contract suite over Memory and Redis (gated).
- leaderboard route: top ordering, `me` outside the top, cache window.

**Client** (`preview/tests/`): rack slots and footprints are deterministic
and inside the plaza bounds; miles formatting; leaderboard list rendering and
row reuse; `vehicleKind('bicycle')`; `carriage-motion` targets cruise speed
without sprint and the 18 mph cap with it.

**Journeys** (`preview/e2e/`): `cycling-rack` — take a bike, ride, parked
count drops and recovers, remote player sees the rider; `cycling-leaderboard`
— second account opens the sheet and sees the first ranked with non-zero
miles. Both join the preview matrix.

## 5. Delivery

Two PRs, one task per branch (`project:prune` needs that):

1. `cycling-rack` (`feat/cycling-rack-20261013`): vehicle kind, plan and prop,
   `cycle`/`uncycle`, pose gating, ride counting, store and flush, server and
   client unit tests, `cycling-rack` journey.
2. `cycling-leaderboard` (`feat/cycling-leaderboard-20261013`, branched after
   1 lands): route, dock sheet, rack prompt, `cycling-leaderboard` journey.

Ledger: `docs/superpowers/plans/2026-10-13-cycling-rack.md`. Core verify
excludes Redis and browser coverage; run `pnpm run verify full` with a local
Redis before each PR and read the receipts.

## Open risks

- The carriage controller assumes a passenger seat; the first PR must prove a
  null passenger seat does not break the car or the chauffeur tour.
- Account-prefix stores are shared across worlds; a world reset must not touch
  cycling totals (it does not today for profiles, keep it so).
