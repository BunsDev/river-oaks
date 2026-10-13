# Shared voice with LiveKit Cloud

Objective: let residents talk to each other in the shared town, in the space
they are standing in, following [the deferred spatial-voice plan](2026-10-05-spatial-voice.md).
Val resumed it on 13 October 2026 and chose LiveKit Cloud as the media server,
with the hosted site, local development and the desktop app all in scope.

Owner: Claude Code session `46fc41e0-26d1-4116-956a-7cac77a13769`. Task
`shared-voice-livekit`.

## Shape

Audio never touches the game WebSocket (binary frames close it, and it carries
8 KiB frames at most). Instead:

1. The browser asks `POST /api/voice/join` for its room. The server derives the
   world and the space (`outdoor` or a store id) from the player's live game
   connection, never from the request, and mints a one-room, microphone-only
   LiveKit token for a random participant identity.
2. A lease ties that identity to the player's game connection for 45 s. The
   browser renews every 15 s with `POST /api/voice/renew`, which also notices a
   change of space and ends the old room's audio before any new token exists.
3. Renew and leave carry the participant identity from join. Two tabs share one
   session cookie, so this is what stops a replaced tab from renewing or
   releasing its successor's lease.
4. Every kick (ban, approval ended, logout, another world) revokes the lease and
   removes the participant from LiveKit. A tick reconciler and a per-minute sweep
   (PR 2) cover expiry, interior changes and participants the server never
   authorised.

Spaces: flying is always outdoors; a private home counts only for those allowed
inside, otherwise there is no voice there at all.

## PR 1: leases, routes and world authority (flag off)

Branch `feat/voice-server-20261013`. Nothing runs unless `RIVER_OAKS_VOICE=on`
and the three `LIVEKIT_*` settings are present.

Files:
- `server/livekit-client.js`: the only importer of `livekit-server-sdk` (loaded
  lazily). Tokens carry `roomJoin`, one `room`, publish and subscribe,
  `canPublishData:false`, `canUpdateOwnMetadata:false` and
  `canPublishSources:[microphone]`. Every provider failure is replaced by one
  fixed `livekit_unavailable` error so no host, key or response body leaks.
- `server/voice.js`: room naming (`<namespace with dots>.<world>.<space>`), the
  memory and Redis lease stores (one contract; Redis uses one hashed key per
  account plus one expiry-scored set, with fenced Lua `ISSUE`/`TOUCH`/`RELEASE`
  scripts in the style of `presence.js`), the service (join, renew, leave,
  revokeUser, status) with a global daily join budget and a three-failure pause
  copied from `chauffeur.js`, and `configureVoice(env)`.
- `server/voice-routes.js`: `POST /api/voice/{join,renew,leave}?world=` behind
  the usual gates (session, approval, ban, exact Origin, CSRF, 30 calls a minute).
  `present(identity)` is injected by each transport and is the only source of
  the connection id and the space.
- `server/world.js`: `voiceSpaceOf(userId)`, `setVoice(userId, identity|null)`
  (not checkpointed), `voice: {space, id}` on every public player, and an
  explicit rejection of a client `{type:'voice'}` command.
- `server/app.js`, `server/distributed-app.js`: mount the routes, add
  `voice: {available}` to snapshots, and revoke the lease inside the one kick
  path each transport has.
- `server/town.js`, `server/redis-backend.js`, `server/world-gateway.js`: build
  the service from the environment (memory leases on the standalone town,
  Redis leases on the hosted gateway; the daily budget uses the shared
  `voice_daily` rate scope).
- `server/redis-security.js` (scopes `voice`, `voice_daily`),
  `server/vercel-routing.js`, `vercel.json`, `preview/vite.config.js`,
  `server/tests/browser-fixture.js`, `.env.example`, `package.json`.

Contract (shared with the browser client, PR 3):

| Call | Success | Refusals |
| --- | --- | --- |
| join | `{ok, url, token, space, participantIdentity, expiresAt, renewMs}` | 409 `not_connected`, `no_space`; 429 `space_full`, `capacity`, `budget_exhausted`; 503 `voice_unavailable` |
| renew `{participantIdentity}` | `{ok, token, expiresAt, renewMs, space}` | 409 `space_changed` (+`space`), `no_lease`, `stale_connection`; 503 |
| leave `{participantIdentity}` | `{ok, left}` | none; allowed without a live connection |
| snapshot | `voice: {available}`; per player `voice: {space, id}` | absent when the service is off |

Timing: lease 45 s, renew every 15 s, token 60 s. Caps: 32 per space, 256
leases per namespace, 5000 joins per UTC day (env overrides in `.env.example`).

### Checks

- Red first: the four new suites failed with `ERR_MODULE_NOT_FOUND` before the
  modules existed.
- `node --test` on `voice-leases`, `voice-service`, `livekit-client` and
  `voice-routes`: 36 tests, 36 passed with `REDIS_URL` pointing at an isolated
  local Redis 8.10 on port 6390 (memory and Redis lease stores answer one
  scripted sequence identically; the hosted edge derives the space from the
  committed room view). Without Redis the 9 Redis cases skip.
- `pnpm run test:server` without Redis: 540 tests, 406 passed, 133 skipped, 0
  failed after the fixture fix below.
- The two test corrections during the run were test bugs, not product bugs: a
  second `travel` inside the 1 s cooldown (the fixture's world now has an
  adjustable clock), and a lease helper deriving an identity from an `@` user id.
- Known gap in PR 1: the per-player `voice.id` in snapshots is stamped only by
  the PR 2 reconciler, so it stays `null` after a join until then. Joins still
  work; the client uses the join response for its own identity.

PR 1 is #300: `pnpm run test:server` with Redis 582 passed, `pnpm run verify`
core passed, queued in `pnpm run land`.

## PR 2: reconciler, sweep and headers (flag still off)

Branch `feat/voice-controller-20261013`, from #300's head.

- `server/voice.js`: `reconcileWorld({worldId, present, removed})` answers
  each present player's participant identity or null. A connection or world
  mismatch, or a space of `null`, revokes at once; another space revokes after
  three consecutive reconciles (600 ms on the hosted tick), so a doorway does
  not flap; removed players are revoked. Provider removals run behind the tick
  with at most eight in flight. `sweep({budgetMs})` removes every participant of
  this namespace's rooms without a live lease, deletes rooms nobody holds, and
  leaves other namespaces' rooms alone; `sweepEvery(ms)` for long-lived hosts.
- `server/redis-room.js`: the lease holder reconciles after this tick's kicks
  and before the snapshot, so a kicked player's voice ends in the same tick.
  `server/app.js`: a 1 s loop does the same on the standalone town, and the
  departure grace revokes a tab that never came back.
- `server/voice-routes.js`: `GET /api/voice-sweep` behind the `CRON_SECRET`
  bearer; `vercel.json` cron, rewrite and allowlist; `api/server.js` answers it
  404 while voice is off so the per-minute cron costs nothing.
- `server/security-headers.js` and `vercel.json`: `connect-src` gains
  `https://*.livekit.cloud wss://*.livekit.cloud` (clients are redirected to
  regional hosts) and a new `Permissions-Policy: microphone=(self), camera=(),
  geolocation=(), display-capture=()`. The pinned header test was changed
  deliberately for both.
- `docs/multiplayer.md`: env rows and a "Shared voice" section with the
  revocation layers and bounds.

Revocation bound: about 2 s with a live lease holder (one 200 ms tick plus the
provider call); worst case with no instance alive for the world, lease TTL 45 s
plus one cron period 60 s plus the 20 s sweep budget, about 127 s. The unit
tests assert the mechanism under a fake clock; real numbers are a PR 5 item.

### Checks

- The PR 2 tests were written before the code in the same pass; no separate
  red run was recorded for them.
- `voice-reconcile`, `voice-sweep`, `hardening2-security-headers`,
  `cron-workplace`, `vercel-routing`, `voice-routes`, `voice-service`,
  `voice-leases` with Redis: 58 tests, 58 passed (the hosted room tick stamps,
  replaces, revokes after three ticks and revokes on a same-tick kick; the
  standalone town stamps identities and revokes a departed tab).
- `pnpm run test:server` with Redis: 597 tests, 597 passed, 0 skipped.
- `pnpm run verify` core: passed (tooling 76; preview 2695 passed, 1 skipped;
  server 421 passed, 134 Redis-only skipped; desktop 49; Python and secrets
  clean; build ok).

## Next

- PR 3: browser controller, Y/M keys, chat-dock and roster controls, settings.
- PR 4: spatial audio graph, speaking rings, two-context journey.
- PR 5: desktop audio-only permission; real two-browser acceptance against a
  LiveKit Cloud dev project with the receipt in `data/reports/voice-live.json`.
