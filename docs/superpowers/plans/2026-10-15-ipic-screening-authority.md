# IPIC #366: authoritative screening timeline and host controls (2026-10-15)

Task `ipic-screening-authority-366` · branch `feat/ipic-screening-authority-20261015` · worktree `../river-oaks-ipic-screening-20261015` · owner claude:river-oaks-1b (f4107618) · parent #359, package #366, from `main` at `c1cfd584`.

## Objective

One authoritative screening timeline for the existing IPIC auditorium. A server-side venue host can start, pause, resume and stop one allowlisted fixture clip; everyone in town reads the same timeline from the snapshot and projects the position from server time. Viewers never change it. This package proves authority and timeline behaviour only: no decoder, no client playback (#367), no final media (#365), no deployment.

## Reused seams (reconciled against `c1cfd584`)

- **No second service.** Every world command already runs through one serialized authority: the memory town's `world.command`, or the Redis room's leased tick with one fenced `COMMIT`. Screening state lives in the world like `server/table-games.js`, so memory and Redis behave the same. Two gateways cannot hold competing timelines, because only the lease holder applies commands.
- **Receipts** follow `server/office-workspaces.js`: an operation id scoped to actor, session, venue and epoch, with a payload digest that rejects a reused id that carries different content.
- **Rate limits** are the world ledger's token bucket (12 burst, one per 500 ms), plus the transports' frame and size limits.
- **Venue membership** is the IPIC room (`ipic-photo-v1`, `preview/src/ipic-plan.js`) from the server's own `environment.roomAt`, never a client field.

## Contract

`preview/src/screening-contract.js` (pure, shared by server and client):

- `SCREENING_VENUES`: `ipic` → interior `ipic-photo-v1`.
- `SCREENING_MEDIA`: one fixture entry, `ipic-fixture-v1`, 12,000 ms, venues `['ipic']`, `fixture: true`. The server takes the duration from here and never from a client. Media files, sources and captions arrive with #367.
- `parseScreeningCommand(message)`: `{type:'screening', action, venueId, epoch, expectedRevision, operationId, mediaId?}`. Allowed actions are `start` (with `mediaId`), `play`, `pause` and `stop`, plus `sync` (`{type, action, venueId}` only). There is no seek, URL, duration, position or owner field. Any other key rejects the command.
- `screeningPositionAt(view, serverTimeMs)` and `screeningStatusAt(view, serverTimeMs)`: project the elapsed position from the anchor and clamp it to the duration. A playing view past its duration reads `ended`.

`server/screenings.js`: `createScreenings({players, inVenue, isVenueHost, now, changed, randomId})` returns `{command, prune, snapshot, checkpoint, validate, load, reset}`.

### State machine

| From | Action | To |
| --- | --- | --- |
| stopped, ended | `start {mediaId}` | playing at 0 ms, new `screeningId` |
| paused | `play` | playing from the paused position |
| playing | `pause` | paused at the server-computed position |
| playing, paused, ended | `stop` | stopped at 0 ms |
| playing | duration reached (`prune`) | ended at the duration |
| playing | host gone, out of the venue, or grant lost or expired (`prune`) | paused, `pausedBy: 'host-lost'` |
| any | `reset` (trusted hook) | stopped, new epoch |

Each change increments that venue's `revision`, which never decreases, even across a reset.

### Snapshot and replies

- The snapshot carries `serverTimeMs` and `screenings: [{venueId, screeningId, mediaId, status, revision, epoch, positionMs, anchorServerTimeMs, durationMs, hostId}]`.
- Snapshots are one frame shared by everyone, so they contain no private data. Private desk and workspace state is never read by this module.
- A command reply adds `serverTimeMs`. `sync` also returns `canHost` for the caller alone.

### Command checks, in order

1. Strict parse.
2. A known venue.
3. `epoch` equals the current epoch (`screening_stale`).
4. In the venue (`screening_not_in_venue`).
5. A server-side host grant (`screening_host_required`).
6. A receipt replay, or `screening_operation_conflict` when the same key carries a different digest.
7. `expectedRevision` equals the current revision (`screening_stale`).
8. The transition.

Receipts are kept for the latest 64 accepted operations and persist in the checkpoint, so a retry after a transport `request_timeout` still deduplicates after a lease handoff.

### Host grants

The host is an explicit server-side grant: `RIVER_OAKS_SCREENING_HOSTS="ipic:<userId>[@<ISO expiry>],…"`, parsed once per process and passed into every world. With nothing set, nobody can control a screening (fail closed). Admin status, office ownership, an appearance, and holding a seat do not grant hosting. Local fixtures set synthetic grants only.

### Lifecycle

- **Host leaves:** `world.leave` prunes immediately and pauses at that instant. The memory town calls `leave` after its 30 s reconnect grace; the Redis room after 10 s for an explicit leave, or 20 s after the last heartbeat. Walking out of the IPIC room, or losing or outliving the grant, pauses on the next tick.
- **Restore:** a checkpoint restored within 15 s of being saved keeps playing (a lease handoff). An older one pauses at the position it had when saved, so an outage never jumps the film forward.
- **Reset and region migration:** both start a fresh epoch and stop. Commands from the old epoch fail as `screening_stale`.
- **Versions:** checkpoint v9 adds `screenings`. Older checkpoints restore with a fresh stopped state. The Redis writer generation is `v9:`, so an older writer cannot drop the new field.

## Files owned

- `preview/src/screening-contract.js`
- `preview/tests/screening-contract.test.js`
- `server/screenings.js`
- `server/tests/screenings.test.js`
- `server/tests/screenings-transport.test.js`
- `server/world.js`: command, snapshot, step/leave/reset hooks, checkpoint v9
- `server/app.js` and `server/redis-room.js`: session context into `world.command`, and the `v9:` lease
- `server/town.js`, `server/redis-backend.js`, `server/world-gateway.js`: host grant option
- `server/tests/redis-room.test.js` and `server/creator-rollout-audit.js`: lease generation pins
- `docs/screenings.md`, `docs/multiplayer.md` (checkpoint history line)
- this ledger

## Checks

Built test-first in a scratch copy of `c1cfd584`, then applied to this worktree at `a714a8a5`. Redis runs use a throwaway `redis-server` on 127.0.0.1:16471 (no persistence), never a shared or production instance.

| Command | Result |
| --- | --- |
| `node --test preview/tests/screening-contract.test.js server/tests/screenings.test.js`, before the modules existed | failed: modules not found |
| same, first run with the modules | contract 4/4; world 6 pass, 8 fail (grants without an expiry read as expired), fixed by normalizing grants |
| same, after the fix | 14/14 |
| `REDIS_URL=… node --test server/tests/screenings-transport.test.js` | 3/3: memory WebSocket, Redis gateway, two Redis coordinators racing one start, plus handover |
| `REDIS_URL=… node --test server/tests/*.test.js`, first full run | 15 failures, all from the version bump: tests pinning v8, tests that downgrade a current checkpoint without dropping `screenings`, snapshot equality broken by a frame time inside `world.snapshot()`, and `avatar-preferences.js` reading only v1–v8 |
| after the fixes (frame time stamped by the transports; `avatar-preferences.js` reads v9; pins moved to 9; downgrades drop `screenings` as older writers would) | 707 tests, 706 pass, 1 fail (`creator-objects` v3 upgrade compared whole snapshots, including the fresh epoch) |
| after comparing that test without the fresh screening, and asserting the screening is stopped | `creator-objects` 10/10; full Redis-backed server run 707 of 707 |
| `pnpm run verify` (core) at `a714a8a5` + this patch | passed: agent 109/109, preview 3056 pass + 1 existing skip, server 519 pass + 146 Redis skips (core permits them; the Redis run above covers them), desktop 66/66, build, ruff, Python 141, secrets |

Not run here: browser journeys (no client change; hosted CI runs them) and `verify full`.

### Overlap with a live Codex task

`office-computer-reliability` (Codex, active) owns `server/tests/office*.test.js`. This change touches `server/tests/offices.test.js` only where the version bump forces it: the version pin, and dropping `screenings` from the v5 downgrade. It also touches one sentence of `docs/offices.md` outside its operations section.

## Decisions for Val

1. **Who hosts in production.** Hosting is off until `RIVER_OAKS_SCREENING_HOSTS` names accounts. Name the production host account(s) and any expiry when the screening should go live; until then, no one can start a film in the hosted town.

## Next action

Open the PR, land it with `pnpm run land <pr> --owner river-oaks-1b`, then hand the contract to #367.
