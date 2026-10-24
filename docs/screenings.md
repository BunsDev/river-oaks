# Venue screenings

The town holds one screening timeline per venue. Today the only venue is the IPIC
auditorium. It shows the approved original short (#365), and keeps a labelled fixture clip for tests. A host with an explicit
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

**Production host (Val, 2026-10-18):** Jevica's production account,
`ipic:user_01M402HKJYDTH1QJM5NAQDZ4HH`, with no expiry. It is set in Vercel Production and takes
effect on the next deployment, only on Val's go; #359 records whether it has been.

## Lifecycle

- **The host leaves town.** The film pauses where it was at that moment. The memory town removes a disconnected player after its 30 s reconnect grace. The Redis room does so 10 s after an explicit leave, or 20 s after the last heartbeat.
- **The host walks out or loses the grant.** Walking out of the IPIC room pauses the film on the next tick. A lapsed grant pauses it at the instant of expiry. Nobody is promoted automatically.
- **The film ends.** It stops at its duration with status `ended`.
- **Restore.** A checkpoint restored within 15 s of being saved keeps playing, as in a lease handoff between gateways. An older one pauses at its saved position, so an outage never jumps the film forward.
- **Reset.** A trusted reset, or a region migration, opens a new epoch and stops every venue. Commands from the old epoch are stale.
- **Versions.** Checkpoint version 9 adds screenings; version 10 adds office layout/floor state; version 11 adds office seat claims, version 12 selected character revisions, version 13 garden campus leases, version 14 world rules and version 15 crime state; the current Redis writer generation is `v17:` (`v18:` with the character store). Pre-v9 checkpoints restore with a stopped timeline.

### Turning it off

Unset `RIVER_OAKS_SCREENING_HOSTS` and replace the running gateways/coordinators with that configuration, consistently across gateways. The new processes use the current grants when restoring and ticking the room: films whose host lost the grant pause, and nobody can start another. Running processes do not reread environment values each tick.

## Watching in the browser (#367)

Inside IPIC, a panel shows the shared status and this viewer's own controls. The film plays on
the auditorium's existing screen material, which is restored when the viewer leaves; no
second interior or renderer is built.

- **Media.** Only bundled sources from `SCREENING_MEDIA` play. The venue's films are:
  - **The approved short**, `ipic-original-v1`. Val approved candidate 1 as cut on 2026-10-15.
    - A silent, captioned 52.6 s film captured from the game itself.
    - WebM (VP9/Opus, 1.41 Mbps) and MP4 (H.264 Main/AAC, 2.04 Mbps), 1280×720 at 24 fps, with a black border of at least 4 px (since #498 the screen draws its own mattes; the border stays, unchanged).
    - Eight English captions, a transcript and a poster.
    - `sources.json` records provenance, what Val approved, and the OpenStreetMap credit, which stays in frame.
    - `scripts/ipic-short/` holds the capture, the cut and the decode check. A new cut needs approval again.
  - **The second short**, `ipic-two-seats-v1`, "Two Seats, One Screen" (#501). Val approved candidate B, these exact files, on 2026-10-19.
    - A 62 s scene captured from the game in IPIC's auditorium: two fictional friends, Maya and Theo, settle into front-row recliners before the house lights go down.
    - Real dialogue and music: eight lines from local Kokoro-82M synthetic voices (`af_heart`, `am_liam`), under an original piano and bass score from `scripts/ipic-short/second-score.mjs`. Stereo, 48 kHz, about −18 LUFS integrated, true peak −1.5 dBTP, every line at least 10.4 dB over the music.
    - WebM (VP9 Profile 0/Opus) and MP4 (H.264 Main/AAC, fast start), 1280×720 at 24 fps, a keyframe every second, no border (the screen draws the mattes).
    - English captions with speaker names and three sound cues, an eleven-line transcript and a poster.
    - `sources.json` records provenance, what Val approved (`approvedItems`) and the encoding. `scripts/ipic-short/second-*` holds the capture, cut, intake and decode tooling. A recut needs approval again.
  - **The fixture**, `ipic-fixture-v1`. A 30 s test pattern with one beep a second, in WebM (VP9/Opus) and MP4 (H.264/AAC), with English captions. It is labelled as a fixture everywhere, and tests can still name it. `scripts/make-screening-fixture.mjs` regenerates it, rewriting only its own entry in `sources.json`.
  - **Checks.** `node scripts/make-screening-fixture.mjs --check` verifies every film's committed hashes and durations. `preview/tests/screening-media.test.js` checks each allowlisted film against `sources.json`: types, bytes, SHA-256, duration within 60 ms, captions equal to the transcript, and a recorded approval.
- **Rolling back.** Once the short has started, a town's checkpoint names `ipic-original-v1`, in its
  timeline and in the start's operation receipt (up to 64 receipts are kept, even after Stop). A server
  without that id in `SCREENING_MEDIA`, which means any build before #429, refuses the checkpoint, and the
  town does not restore. Roll back by configuration on a build that still has the entry: stop the film
  and remove the host grants. Do not redeploy an older build. #400's checkpoint v11 already rules that out.
- **Sync.** The player projects the shared position from the snapshot and an estimate of
  server time. It prefers `sync` replies measured over a round trip, taken on entry, every
  15 s and on return to the foreground, and falls back to snapshot frames. Drift up to 40 ms
  is left alone, drift up to 400 ms is corrected with the playback rate (at most ±8 %), and
  anything larger seeks. A stale revision is ignored and a new epoch resets the player.
- **Local states.** Loading, playing, buffering, paused, ended, blocked (autoplay refused),
  error and unsupported belong to this viewer only. None of them sends a command or changes
  the shared film. **Play film** answers a refused autoplay, **Retry** reloads after an
  error, and **Stop watching** releases the film locally.
- **Switching and recovery (#498).**
  - **Generations.** Every element load is a new generation: a new film, a fallback encoding, Retry or a shared
    Stop. A new screening id or epoch also reloads the same film when snapshots omit the intervening Stop.
    A play() or frame callback from an earlier generation changes nothing; a terminal failure invalidates
    pending work and pauses locally. Explicit Retry begins a fresh generation.
  - **Encodings.** Each encoding the browser may decode is tried once per attempt, WebM then MP4. Retry starts a
    new attempt.
  - **Failure reasons.** The status says why: autoplay (Play film), decode, network (the other encoding is not
    tried), stalled (no progress for 30 s while loading or buffering, or while a play request is unanswered), or playback. An aborted load is the
    player's own doing and is not a failure. A shared Stop releases the decoder.
  - **Diagnostics.** `window.__riverScreening()` reports the source that decoded, every attempt, the drift
    measured before correction (`measuredDriftMs`), and the last presented frame from requestVideoFrameCallback
    (`presented`). `driftMs` still reads 0 straight after a seek request, so it is no evidence of a visible frame. While the walking console's
  **More** actions are open, the panel steps aside, so **Step outside** stays reachable on
  narrow screens; it returns when More closes. On narrow screens the panel also stays above an
  open play dock, so its sound and caption controls remain reachable.
- **Sound, captions and transcript.** The film starts muted. **Sound on** is the viewer's
  choice and plays only inside the auditorium; the lounge and the street stay silent.
  Captions are on by default: the panel shows the active cue, because the film reaches
  the screen only as texture frames and a browser draws cues only on a visible video
  element (the caption track is kept in `hidden` mode to track them). Loading, seeking and failed
  playback hide active cues so a prior frame's caption cannot stand in for the replacement. **Captions off**
  hides the line. The transcript opens in the panel. No microphone is involved.
- **Host controls.** **Start**, **Pause**, **Resume** and **Stop** appear only when the
  server's `sync` reply says this viewer may host. Each sends one operation id and retries
  once with the same id if the reply is lost.
- **Choosing a film (#499).** While nothing plays (stopped or ended), a host sees a **Film** chooser
  above **Start film**. It lists the venue's approved films with their length, sound and captions, and a
  poster or a neutral frame. `screeningChoices` builds the list and leaves fixtures out. The approved short
  is the named default (`SCREENING_DEFAULT_MEDIA`), not whichever entry comes first.
  - **Choosing is local.** Nothing loads and nobody else sees the choice until Start succeeds, and Start
    sends the chosen id.
  - **Replacing a film.** While a film plays or is paused, the chooser is hidden: the host must Stop first.
    There is no queue, seek or next film.
  - **Authority.** The server checks every Start against the allowlist. A refused Start (stale, no grant,
    not in the venue) shows the reason and syncs the room's real state.
  - **Fixtures.** A development build lists the labelled fixture too when the page has
    `?screening-fixtures=1`, as the two-browser journey's host does. Tools can still start it by command.
  - **A film this version does not know.** This is a film a newer build added. This client stops the
    previous film and says "This film needs a newer version of River Oaks". It never shows another
    film's frames, captions or transcript under the new film's timeline.
- **Adding a film.** A new film needs its own versioned id, Val's approval of the exact bytes, a
  `sources.json` entry and a `SCREENING_MEDIA` entry with `audio` and `poster`. The intake and checks are
  #501's. Keep every id a checkpoint or receipt may name (see Rolling back).
- **The screen (#498).** `ipic-screening-screen.js` gives each source and decoded size its own VideoTexture,
  fitted at the film's aspect.
  - **Mattes.** The screen's own shader draws black mattes outside the film, so a film needs no baked border
    and its edge pixels never smear.
  - **Lighting.** While a film is bound, its masked emissive signal replaces surface diffuse/specular lighting, so scene lights do not illuminate the film a second time. Global tone mapping, exposure, fog and postprocessing remain in effect; rendered pixels are not expected to equal direct-video RGB values. The actual-screen runner compares a fixed paused frame under low/high direct and environment lighting at constant exposure. `node preview/e2e/ipic-screen-colour-runner.mjs` captures paired direct/world samples through normal full-world rendering at noon, dusk and dawn; human color approval remains #502.
  - **What shows.** The film appears only once the current source has a decoded frame. While a replacement
    loads, after a Stop and after a failure, the screen is its idle self.
  - **Restore.** Every borrowed material property is restored exactly, and one film texture is resident at
    a time.
  - **Test films.** `scripts/make-screening-test-sources.mjs` writes borderless test films to
    `preview/e2e/fixtures/screening/`, outside `SCREENING_MEDIA`. `node preview/e2e/ipic-screen-runner.mjs`
    checks them on the real screen material.
- **Viewing from a recliner (#500).**
  - **Focus on screen.** A seated viewer (a recliner that names an eye pitch) gets **Focus on screen**: a local
    camera that frames the whole film. From the seat itself the film is too close, low and to one side; the front
    row would need a vertical field of view over 100°. So focus looks from a bounded point instead
    (`ipic-screening-view.js`): on the screen's centre line, at the viewer's own row depth (at least 2.5 m away),
    at the film's centre height. That point is inside the auditorium and above seated heads.
  - **Above the panel.** The screening panel (captions and controls) stays on screen in both views, so focus fits
    the film into the band of the view above the panel's top edge (less 12 px), measured four times a second and
    on resize. A lens shift (the projection's vertical off-centre term) centres the film in that band: the camera
    keeps its height above the seats and faces the screen square-on. The field of view is between 30° and 80°.
    Where the band is too short for the viewer's row within 80° (the front row at 1440 × 900 would need about 93°), focus
    steps back along the centre line, but never past the back row (5.79 m, published with the screen frame). On a
    narrow portrait phone even that cannot show it all; `focus.fits` says so, and the film stays centred in the
    band.
  - **What focus never changes.** The avatar, the seat, the server's position, Stand up or Step outside. It eases
    in and out over 0.35 s, and is immediate with reduced motion.
  - **Ending focus.** **Look around**, a drag on the world, an arrow key, standing, leaving, disconnecting or a
    rebuild all return the walking camera's own view and field of view.
  - **Input.** The game uses no pointer lock. Keys pressed on the panel's buttons stay out of the world (the walking
    keys listen on the canvas host): no walking, no push-to-talk.
  - **Stop watching and Join screening.** **Stop watching** releases the film and its decoder and leaves a small
    panel with **Join screening**, which opens a fresh player on the room's current timeline. Neither sends a command.
  - **Volume.** The slider appears only where setting the film's volume works: iOS Safari keeps it at 1, so there
    the panel says to use the device's volume buttons. Sound on/off always works.
  - **Refused sound.** If the browser refuses to start the film with sound, the status says so and asks for
    Play film, rather than showing sound as on.
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
node --test preview/tests/ipic-screening.test.js preview/tests/ipic-screening-ui.test.js preview/tests/screening-media.test.js server/tests/static-media.test.js
node scripts/make-screening-fixture.mjs --check
node preview/e2e/ipic-screening-runner.mjs   # two real browsers; takes the shared browser lock
node preview/e2e/ipic-screen-runner.mjs      # test films on the real screen material (GPU on macOS); takes the lock
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
