# Garden campus leases #509: owner-managed tenancy, grants and persistence

## Objective

Deliver #509's server authority for the Garden Offices campus (#505). It covers a
bounded inventory of #506's real suites, owner-managed and non-charging leases with
explicit terms, tenant guest grants, resident requests, atomic and idempotent
acquisition across gateways, revocation and expiry that end access, and
persistence through the private world checkpoint. Paid rentals are a documented
proposal only. No payment code, prices or provider fixtures exist.

## Ownership and base

- Task `garden-campus-leases-509`, owner `claude:river-oaks-95/agent-509 (5bececff)`,
  a delegated package owner under the #505 tracker. The coordinator is river-oaks-95.
- Branch `feat/garden-campus-leases-509-20261018` in the sibling worktree
  `river-oaks-garden-campus-509-20261018`. It is based on #506's first
  fixture-stable head `8921ca42` (branch `feat/garden-campus-contract-506-20261018`,
  owned by river-oaks-c5), with `origin/main` merged in before the PR. The draft PR
  targets the #506 branch so the diff stays reviewable.

## Files owned

- `server/campus-leases.js` (new): the state machine, access decision, views,
  receipts, checkpoint validation and `parseCampusOperators`.
- `shared/garden-campus-lease-contract.js` (new): the command parser, constants,
  limits, error sentences and `campusLeaseUnits()` (inventory plus door and
  landing), shared with #510.
- `server/world.js`: dispatch, prune in `step`, the snapshot field, the checkpoint
  section and its restore, `campusSuiteAccess`/`campusAccess`, the
  `campusAccessEnded` seam and the region-migration carry. All of it is localised.
  #508 owns movement and levels.
- `server/redis-room.js`, `server/world-gateway.js`, `server/redis-backend.js` and
  `server/town.js`: writer generation and `RIVER_OAKS_CAMPUS_OPERATOR_IDS`
  threading.
- Version pins: `server/avatar-preferences.js`, `server/creator-rollout-audit.js`,
  and `server/tests/*`, where only the 12 → 13 pins change.
- Docs: `docs/garden-campus-leases.md` (new), plus the writer-generation sentences in
  `docs/offices.md`, `docs/multiplayer.md`, `docs/screenings.md` and
  `docs/character-studio.md`. `.env.example` gains the variable's name.
- Tests: `server/tests/campus-leases.test.js` and
  `server/tests/campus-leases-transport.test.js`.

## Interfaces

**Consumed.** #506 `shared/garden-campus-layout.js` at `8921ca42`:
`campusUnitInventory()` (43 suites), `GARDEN_CAMPUS_LAYOUT` (doors and inside
points), `campusLevelId`, `checkCampusCompatibility` and
`GARDEN_CAMPUS_VERSIONS {schema 1, layout '3.0', floors 1, support 1, units 1}`.
One difference from the agreed sketch: `campusUnitInventory().door` is the door
position array. `opensTo` and the inside point come from the layout's suites.

**Published.**

- Lease contract `CAMPUS_LEASE_CONTRACT = {id: 'river-oaks-garden-campus', layout:
  '3.0', units: 1}`.
- Command `{type: 'campus', action, …}` with the actions `list`, `request`,
  `cancel`, `decline`, `issue`, `accept`, `release`, `renew`, `revoke`, `grant`
  and `ungrant`. Error codes are in `CAMPUS_LEASE_ERRORS`.
- `world.campusSuiteAccess(userId, unitId)` returns `{ok, role, unitId, leaseId,
  version, until, landing}` or `{ok: false, reason}`. `world.campusAccess(userId)`
  lists current access.
- The access-ended report `{userId, role, unitId, leaseId, reason, landing}` goes
  to the world's `campusAccessEnded` seam.
- Snapshot field `campus: {contract, leasing, leased}`.
- Checkpoint v13 `payload.campus = {serial, leases, requests, receipts}`. Writer
  generations are `v13:` and `v14:` (character store).

Full reference: `docs/garden-campus-leases.md`.

## Decisions and deviations

- Main was already at checkpoint v12 (f1db4d5c, selected character revisions),
  with tokens `v${characters?13:12}`. So this package takes **v13** and tokens
  `v${characters?14:13}`. The coordinator approved it on 2026-10-18. No other
  branch or open PR bumps the version.
- Smallest state machine: request (pending → offered, declined, cancelled, expired
  or retired) and lease (offered → active or ended; active → ended). Acceptance is
  the acquisition, and other offers for the suite are superseded. Renewal is
  operator-only and only extends.
- Restore never depends on operator configuration. Operators are re-read from the
  running process, so removing one retires their outstanding offers
  (`campus_operator_retired`) but keeps accepted leases until they end.
- Older checkpoints (v2–12) restore with an empty campus. An empty section in an
  older version is tolerated, as with v12's `characters`. Lease data cannot
  masquerade as older.
- The campus is enabled only in the `river-oaks` world.

## Checks

The results follow.

## Gaps and next steps

- #508: wire `campusAccessEnded` to move a suite occupant to `event.landing`, and
  call `campusSuiteAccess` on suite entry and when restoring an occupant.
- #510: rental UI. The desk route needs a campus visit context that checks
  `campusSuiteAccess`, and the UI needs offer and lease notifications (it polls
  `list` today).
- #512: carry the campus section through the garage → campus district migration.
  The existing migrations re-sign it unchanged. Cover the old-writer cases.
- Paid mode needs Val's decisions (see the doc's readiness condition).
