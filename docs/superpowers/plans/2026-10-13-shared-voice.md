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

PR 1 landed as #300 (`7b14325`). PR 2 is #302 (reconciler, sweep, headers;
its own ledger section lands with it).

## PR 3: browser controller and controls (shows only when the snapshot says voice is available)

Branch `feat/voice-client-20261013`, from `main` (client files only; the
server PRs land independently).

- `preview/src/voice-chat.js`: the controller. States `unavailable | idle |
  joining | joined | rejoining | error` with a microphone sub-state `off |
  requesting | on | denied | none`, deafen, playback-blocked and per-resident
  mutes. Every asynchronous step is fenced by a generation counter like
  `speech.js`, so a late join result, token or microphone grant is disposed
  instead of applied. Join creates and resumes the AudioContext inside the
  gesture, asks `/api/voice/join`, loads `livekit-client` by dynamic import on
  first use, connects with the lease token and keeps the microphone off. Unmute
  is the only action that asks for the microphone; denial or missing hardware
  is reported without leaving. Renew runs on the lease cadence and sends the
  participant identity; `space_changed` rejoins keeping deafen and mutes;
  anything else ends voice. A space change seen in the snapshot rejoins too;
  our own identity missing from the snapshot (after a 2.5 s stamp grace) ends
  voice. Hidden tab mutes and never auto-unmutes; blur releases push-to-talk;
  pagehide, sign-out and dispose leave with `keepalive`. A lost town connection
  leaves quietly and rejoins with the microphone off when the town is back.
- `preview/src/voice-spatial.js`: the distance and pan math (full gain inside
  `ENCOUNTER_FAR`, silence at 25 m, hysteresis for subscriptions at 22/25 m,
  coordinates matching `remote-players.js`). The audio graph that uses it is
  PR 4.
- `preview/src/voice-preferences.js`: validated `localStorage` for device,
  push-to-talk, automatic unmute (only once the microphone was allowed) and
  per-resident mutes; one shared store per page so Settings and the town client
  see each other's changes.
- `preview/src/voice-ui.js` and `voice.css`: the walking-console row (Join Y,
  Unmute M with keycaps, one `role=status` region), the chat-dock row (Join,
  Mute, Deafen, Enable audio) with a "Voice on · N talking" pill in the dock
  summary, a Mute button per resident in the roster, and the Settings → Audio
  pane (device list read on focus without prompting, open mic or push-to-talk,
  automatic unmute). `aria-pressed` for toggles, `aria-disabled` while busy.
- `walking-ui.js`: Y joins or leaves, M toggles or, in push-to-talk, rides the
  held-keys set so blur, Escape and an open dialogue release it like movement;
  `mountVoice` places the row under the actions. `rail-navigation.js`: palette
  entries and the key reference. `multiplayer-client.js`: the controller is
  created with the chat dock; snapshots feed availability, the authoritative
  space and identities; close, sign-out and dispose end voice. `main.js`:
  `window.__riverVoice()` and the walking `getVoice` hook. `vite.config.js`: a
  dedicated `livekit` chunk so the core bundle never references the SDK.
- Known compact-screen gap: the single live region sits in the walking console,
  which hides while the chat dock is open at ≤ 900 px; the dock row mirrors the
  text without announcing it.

### Checks

- `voice-chat`, `voice-spatial`, `voice-preferences`, `voice-ui`: 27 tests, 27
  passed with a fake transport (join loads the SDK once and keeps the mic off;
  a late join is inert and its room torn down; denial and missing hardware keep
  the room; renew cadence and a refused renewal; space change from renew and
  from the snapshot keeping deafen and mutes; sign-out, pagehide and dispose
  release once; hidden tab; deafen and per-resident mutes with subscriptions;
  mute survives reload; blocked playback unlock; join failures explain
  themselves; speaking maps to players; push-to-talk; own revocation after the
  stamp grace; lost connection rejoins with the mic off; device switch).
- Three test corrections were harness bugs (Node's getter-only `navigator`, a
  missing `getAttribute` in the fake); one controller bug was caught by the
  tests: the status line was computed before the microphone state changed.
- No unit test drives `walking-ui.js` keys (it is DOM-bound and untested
  today); Y and M are covered by the PR 4 browser journey instead.
- `pnpm run build`: LiveKit lands in its own chunk (557 KB raw, 144 KB gzip);
  the `index` chunk has no static reference to it.
- `pnpm test`: 2723 tests, 2722 passed, 1 skipped. `pnpm run verify` core: passed
  (tooling 76; preview 2722 passed, 1 skipped; server 407 passed, 133 Redis-only
  skipped; desktop 49; Python and secrets clean).

## PR 4: spatial audio, speaking rings and the two-browser journey

Branch `feat/voice-spatial-20261013`, from PR 3's head.

- `preview/src/voice-spatial.js`: `createPeerGraph(context, track)`, one
  resident's voice as source → gain → stereo pan → output. The track stays
  attached to a muted element that never plays, because Chromium decodes a
  remote WebRTC track only while an element holds it. Gain starts at silence
  and ramps over 80 ms. The listener is measured at the feet (ground plus
  altitude), like residents.
- `preview/src/voice-chat.js`: a graph per subscribed audio track, keyed by
  participant identity (a track can arrive before the snapshot names its
  player; it stays silent until then). At snapshot cadence every resident gets
  gain from distance and pan from bearing, mutes and deafen force silence, and
  subscriptions follow the 22/25 m hysteresis. Leaving, a dropped track or a
  departed participant disposes its graph once.
- `preview/src/remote-players.js`: `setSpeaking(ids)` sets a nameplate marker
  at event time and feeds the speaker cadence of `conversation-motion` through
  `avatar.update`; `main.js` wires it to the controller's speaking set.
  `voice.css`: a ring on the nameplate, no pulse under reduced motion or
  software rendering.
- `server/tests/browser-fixture.js`: `RIVER_OAKS_VOICE_FIXTURE=1` runs the real
  voice routes, leases and reconciler over the fake LiveKit from
  `livekit-fixture.js`; `preview/e2e/experience-runner.js` sets it for the voice
  journey and launches Chromium with fake media, so the journey can grant a
  microphone without a device or a prompt.
- `preview/e2e/voice-shared.js`: two residents. Alice joins with Y (no
  microphone asked), the token names the server-derived outdoor room, M asks
  for the microphone once, Bob's identity reaches Alice's snapshot through the
  reconciler, Bob's oscillator track plays at full gain through the production
  graph, the speaking ring and dock pill follow an active-speaker event, walking
  away lowers the gain according to the snapshot distance, a resident mute and
  deafen unsubscribe at the transport, Y leaves and stops the microphone track,
  the server drops the lease, and at 390 px the dock row keeps 44 px targets.
  Not covered here: an interior change (unit-tested) and real audio (PR 5).

### Checks

- `voice-graph`, `voice-chat`, `voice-spatial`, `voice-ui`,
  `voice-preferences`, `remote-players`: 40 tests, 40 passed. Two of the
  corrections were harness bugs; one was a wrong expectation (the curve gives
  0.63 at ten metres, not 1). One product change came out of the tests: an
  unknown distance no longer freezes a subscription under hysteresis.
- The `voice-shared` journey, `pnpm test`, `pnpm run build` and `pnpm run
  verify` have not run yet: the machine's disk and swap were critical and the
  journey is a browser run. This PR is not opened until they have.

## Next

- PR 5: desktop audio-only microphone permission; the live acceptance against a
  LiveKit Cloud dev project with `data/reports/voice-live.json` and the measured
  revocation delays.
- PR 4: spatial audio graph, speaking rings, two-context journey.
- PR 5: desktop audio-only permission; real two-browser acceptance against a
  LiveKit Cloud dev project with the receipt in `data/reports/voice-live.json`.
