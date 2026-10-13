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

Remaining for PR 1: `pnpm run test:server` with Redis (in progress), `pnpm run
verify`, PR, land.

## Next

- PR 2: tick reconciler in `redis-room.js` and the standalone loop, direct
  revocation on every kick is already in; `/api/voice-sweep` cron; CSP
  `connect-src` for `*.livekit.cloud` and `Permissions-Policy: microphone=(self)`;
  measured maximum revocation delay; `docs/multiplayer.md`.
- PR 3: browser controller, Y/M keys, chat-dock and roster controls, settings.
- PR 4: spatial audio graph, speaking rings, two-context journey.
- PR 5: desktop audio-only permission; real two-browser acceptance against a
  LiveKit Cloud dev project with the receipt in `data/reports/voice-live.json`.
