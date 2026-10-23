# The Gardens campus: operation, cutover and rollback

The Gardens replaces the parking garage (`osm-way-625330790`) with three office towers, public
skywalks, shared work halls and rentable suites (#505). The geometry is #506's contract,
[`shared/garden-campus-layout.js`](../shared/garden-campus-layout.js). This page covers how a
town serves the campus, how to switch it on and back off, and what happens to residents, leases
and private work when you do.

## What decides whether the campus is served

| Setting | Values | Default | Effect |
| --- | --- | --- | --- |
| `RIVER_OAKS_DISTRICT_REVISION` | `river-oaks-garage-1`, `river-oaks-gardens-3`, `east-garden-commons-blockout-1` (Gardens plus the East Garden Commons; see [world expansion](world-expansion.md)) | garage | The district the server and every page draw. An unknown value keeps the garage and logs `district_revision_ignored`. |
| `RIVER_OAKS_DISTRICT_EPOCH` | whole number | `0` | Raised with every switch (Redis towns). Anything else stops the process at startup. |
| `RIVER_OAKS_CAMPUS_OPERATOR_IDS` | comma-separated account ids | none | Who may offer, extend and end leases (#509). With none, leasing is closed and the directory says so. |

- **One configuration everywhere.** Every gateway of a town must run the same values.
  Configuration comes from the running application, never from a checkpoint.
- **How the page learns the district.** Pages ask `/api/world-data` which district the town
  serves before drawing it, and every snapshot repeats it.
- **When the page and the town disagree:** the page reloads once. If they still disagree, it
  shows the "has been improved · Refresh" notice rather than drawing the wrong district.

Leases are owner-managed and never charge. See
[garden campus leases](garden-campus-leases.md) for terms, commands and the paid-mode decisions
still open.

## Switching the campus on (Redis town)

1. **Deploy the code with the garage still selected** (`RIVER_OAKS_DISTRICT_REVISION` unset).
   - The world fingerprint, checkpoint record and every page stay exactly as before.
   - Checkpoints move to v13 with this code (#509), so an older deployment can't take the town
     back afterwards.
2. **Nothing to land beforehand.** The cutover moves any flight over the parcel to the
   street (step 4).
3. **Set the campus values on every gateway:**
   - `RIVER_OAKS_DISTRICT_REVISION=river-oaks-gardens-3`;
   - `RIVER_OAKS_DISTRICT_EPOCH=` one more than the current epoch, `1` the first time;
   - `RIVER_OAKS_CAMPUS_OPERATOR_IDS` if leasing should open.

   Then replace the processes.
4. **The first coordinator on the new configuration switches the town once.**
   - It validates the garage checkpoint, through the older district recoveries if needed.
   - It moves any resident flying in or over the parcel to clear street ground outside the
     nearest entry.
   - It re-signs the checkpoint for the campus and commits the new district record
     (`{revision, epoch}`).
   - It logs `district_gardens_checkpoint_migrated {from:'garage', to:'gardens', moved}` once.
5. **During the overlap**, an old deployment still serving sockets refuses to coordinate the
   newer town ("Invalid durable town district", `newer_district_epoch`). It never switches the
   town back. Its pages reload onto the new deployment.

Everything durable is carried unchanged: accounts, chat, appearances, characters, creations,
ledgers, office invitations, screening state and private desks. Leases start empty the first
time; there is nothing to migrate.

## Switching it back (the rollback)

Roll back by configuration, on the same code:

1. Set `RIVER_OAKS_DISTRICT_REVISION=river-oaks-garage-1` and raise the epoch again.
2. Replace the processes.

The first coordinator then:

- checks the checkpoint against the exact campus this code builds;
- moves everyone on the campus to street ground outside the parcel: the platform, the halls,
  any campus level and any campus seat;
- clears their level, seat and vehicle;
- re-signs the checkpoint for the garage, and logs
  `district_gardens_checkpoint_migrated {from:'gardens', to:'garage', moved}`.

What a rollback keeps:

- **Leases** stay in the checkpoint, inert and byte for byte. Nobody gets access, nothing
  expires, and switching the campus on again honours them. A lease that ended while inert
  expires on the first tick.
- **Private desks** are untouched. They live outside the world checkpoint.

A **code revert** past checkpoint v13 is not a supported rollback. An older writer cannot read
or replace a v13 town, and a downgrade path has not been built or tested. Roll back by
configuration first.

## Failure modes

| Situation | Result | Recovery |
| --- | --- | --- |
| The revision was switched without raising the epoch | The coordinator refuses (`district_epoch_unchanged`); the town does not start | Raise the epoch on every gateway and replace processes |
| Gateways run different epochs | Only the newest epoch coordinates; older ones refuse | Make the configuration consistent |
| The campus contract changed between switching on and rolling back | The rollback refuses: the checkpoint names a campus this code no longer builds | Roll forward to the code that built it, or keep the campus |
| A checkpoint fails validation for the target district | The switch refuses; the previous committed town stays authoritative | Inspect `checkpointReason` and fix the configuration |
| Standalone (memory) town | No checkpoint; a restart starts the selected district fresh | None needed |

## Verification

- `REDIS_URL=<isolated redis> node --test server/tests/district-gardens-checkpoint-migration.test.js`
  covers both directions, the older-district chain, refusals and laundering. The Redis
  coordinator case covers the epoch rules: a forgotten bump, a switch, an old deployment
  refused with the state left untouched, the rollback, and a late campus deployment refused.
- `node --test preview/tests/garden-campus-district.test.js server/tests/garden-campus-district.test.js`
  covers the overlay, the walkable ground, the halls and the revision gate.
- `node preview/e2e/garden-campus-views.mjs both` produces matched garage and campus views
  from the contract's cameras.
