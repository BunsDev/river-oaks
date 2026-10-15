# Venue screenings

The town holds one screening timeline per venue. Today the only venue is the IPIC
auditorium, and the only media is a labelled fixture clip. A host with an explicit
server-side grant starts, pauses, resumes and stops the film; everyone else reads the
timeline from the snapshot. This page describes the authority (#366). The client
player, captions and recovery are #367; the approved short is #365.

## What the town publishes

Every snapshot carries `serverTimeMs` and a `screenings` list with one entry per venue:

| Field | Meaning |
| --- | --- |
| `venueId` | `ipic` |
| `screeningId` | A new id for each start; `null` when stopped |
| `mediaId` | An id from `SCREENING_MEDIA`; `null` when stopped |
| `status` | `stopped`, `playing`, `paused` or `ended` |
| `revision` | Increases on every change, including a reset |
| `epoch` | Changes when the town resets or a region migration starts a fresh checkpoint |
| `positionMs` | Position at the anchor |
| `anchorServerTimeMs` | Server time when that position was true |
| `durationMs` | From the media allowlist, never from a client |
| `hostId` | The host who started or resumed the film; `null` when stopped |

A client projects the position as `positionMs + (serverNow - anchorServerTimeMs)`, clamped
to the duration (`screeningPositionAt` in `preview/src/screening-contract.js`). Estimate
`serverNow` from the snapshot's `serverTimeMs`, or from a `sync` reply's. The client's
own clock never sets the shared position.

The snapshot is one frame for every player, so it holds only these public fields. The
screening module never reads desk, workspace or office data.

## Commands

```json
{"type":"screening","action":"sync","venueId":"ipic"}
{"type":"screening","action":"start","venueId":"ipic","epoch":"…","expectedRevision":4,"operationId":"…","mediaId":"ipic-fixture-v1"}
{"type":"screening","action":"pause","venueId":"ipic","epoch":"…","expectedRevision":5,"operationId":"…"}
```

- `sync` returns the venue's view, `serverTimeMs` and `canHost` for the caller alone.
- `start` works from `stopped` or `ended`. Replaying a film is an explicit new start.
- `play` resumes from `paused`; `pause` stops a playing film at the server-computed position; `stop` returns to `stopped`.
- There is no seek. No command accepts a URL, position, duration, host or owner.

### Checks

The town checks each control in this order:

1. The exact field set.
2. The current `epoch` (`screening_stale`).
3. That the caller is in the venue (`screening_not_in_venue`).
4. A live host grant (`screening_host_required`).
5. The operation receipt.
6. `expectedRevision` (`screening_stale`).

A client that gets `screening_stale` sends `sync` and asks again with the new revision.

### Retries

`operationId` (8–64 characters) is the client's idempotency key. It is separate from the
transport's per-socket `requestId`. The receipt is scoped to actor, session, venue and
epoch:

- Resending the same request returns the original result with `replayed: true` and applies once.
- Reusing the id for different content returns `screening_operation_conflict`.

The town keeps the latest 64 receipts in the checkpoint, so a retry after a transport
`request_timeout` still deduplicates after a lease handoff.

Commands share the world's ledger rate limit (12 burst, one per 500 ms) and the
transports' frame limits.

## Who can host

Hosting is an explicit grant, set in the server environment:

```sh
RIVER_OAKS_SCREENING_HOSTS="ipic:<userId>,ipic:<otherUserId>@2026-12-01T00:00:00Z"
```

An entry may carry an ISO expiry after `@`. A malformed entry grants nothing and logs
`screening_host_grant_ignored`. With nothing set, nobody can control a screening. Admin
status, Jevica's appearance, office ownership and a recliner seat are not grants. Local
acceptance fixtures set synthetic grants only.

## Lifecycle

- **The host leaves town.** The film pauses where it was at that moment. The memory town removes a disconnected player after its 30 s reconnect grace. The Redis room does so 10 s after an explicit leave, or 20 s after the last heartbeat.
- **The host walks out or loses the grant.** Walking out of the IPIC room pauses the film on the next tick. A lapsed grant pauses it at the instant of expiry. Nobody is promoted automatically.
- **The film ends.** It stops at its duration with status `ended`.
- **Restore.** A checkpoint restored within 15 s of being saved keeps playing, as in a lease handoff between gateways. An older one pauses at its saved position, so an outage never jumps the film forward.
- **Reset.** A trusted reset, or a region migration, opens a new epoch and stops every venue. Commands from the old epoch are stale.
- **Versions.** Checkpoint version 9 adds screenings; version 10 adds office layout/floor state, and the current Redis writer generation is `v10:`. Pre-v9 checkpoints restore with a stopped timeline.

### Turning it off

Unset `RIVER_OAKS_SCREENING_HOSTS` and replace the running gateways/coordinators with that configuration, consistently across gateways. The new processes use the current grants when restoring and ticking the room: films whose host lost the grant pause, and nobody can start another. Running processes do not reread environment values each tick.

## Watching in the browser (#367)

Inside IPIC, a panel shows the shared status and this viewer's own controls. The film plays on
the auditorium's existing screen material, which is restored when the viewer leaves; no
second interior or renderer is built.

- **Media.** Only bundled sources from `SCREENING_MEDIA` play. The fixture is a 30 s test
  pattern with one beep a second, in WebM (VP9/Opus) and MP4 (H.264/AAC), with English
  captions (`preview/public/assets/ipic/screening`). `scripts/make-screening-fixture.mjs`
  regenerates it and `--check` verifies the committed hashes and durations. It is labelled
  as a fixture everywhere and is not the approved short (#365).
- **Sync.** The player projects the shared position from the snapshot and an estimate of
  server time. It prefers `sync` replies measured over a round trip, taken on entry, every
  15 s and on return to the foreground, and falls back to snapshot frames. Drift up to 40 ms
  is left alone, drift up to 400 ms is corrected with the playback rate (at most ±8 %), and
  anything larger seeks. A stale revision is ignored and a new epoch resets the player.
- **Local states.** Loading, playing, buffering, paused, ended, blocked (autoplay refused),
  error and unsupported belong to this viewer only. None of them sends a command or changes
  the shared film. **Play film** answers a refused autoplay, **Retry** reloads after an
  error, and **Stop watching** releases the film locally.
- **Sound, captions and transcript.** The film starts muted. **Sound on** is the viewer's
  choice and plays only inside the auditorium; the lounge and the street stay silent.
  Captions are on by default, and the transcript opens in the panel. No microphone is
  involved.
- **Host controls.** **Start**, **Pause**, **Resume** and **Stop** appear only when the
  server's `sync` reply says this viewer may host. Each sends one operation id and retries
  once with the same id if the reply is lost.
- **Cleanup.** Leaving IPIC, losing the connection, a world rebuild or disposal stops the
  film and releases the video element, the screen texture, listeners and timers. A late
  `play()` cannot start a disposed film.
- **Serving.** The standalone server sends video and caption types and honours single byte
  ranges, which Safari needs. The Vite dev server and Vercel already do.

## Tests

```sh
node --test preview/tests/screening-contract.test.js server/tests/screenings.test.js
REDIS_URL=redis://127.0.0.1:<isolated port> node --test server/tests/screenings-transport.test.js
```

Browser and player:

```sh
node --test preview/tests/ipic-screening.test.js preview/tests/ipic-screening-ui.test.js server/tests/static-media.test.js
node scripts/make-screening-fixture.mjs --check
node preview/e2e/ipic-screening-runner.mjs   # two real browsers; takes the shared browser lock
```

The transport test covers the real ticket and WebSocket gates in memory and Redis, and
two Redis coordinators racing one start. Without `REDIS_URL` the Redis cases skip. A skip
is not evidence.

### Historical fixture checkpoints

Before bundled playback, `ipic-fixture-v1` described a 12-second placeholder.
The bundled fixture is 30 seconds. Recovery validates the known old timeline and
receipts, then stops the screening with a fresh epoch and clears its receipts.
Commands from the old epoch are stale; the current configured host can start the
bundled fixture normally. This also handles a stopped venue retaining an old
receipt. Other world state, including office visits, remains intact. Unknown media,
other duration mismatches and malformed timelines still fail validation. No manual
checkpoint editing or provider changes are needed.
