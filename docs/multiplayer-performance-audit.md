# Multiplayer performance audit — updated 5 October 2026

## Scope and result

The shared town now simulates **98 NPCs instead of 193**, a **49.2% reduction**.
All 24 outdoor scenario residents remain; each of 30 shops retains a staff
member, 44 guests remain indoors, and 14 static mannequins render. Solo play
keeps its existing population. The browser, server, room descriptions, and
checkpoint recovery use the same deterministic selection.

The 32-player admission limit passed short loopback WebSocket and Redis room
probes with no connection errors, and the full Redis-backed server suite passed
with a local Redis container. This is **local functional readiness**, not a
global capacity sign-off. A single Redis writer, one `iad1` region, crowded
client rendering, and the absence of long-running multi-region measurements
are the remaining capacity risks. The 4 October navigation follow-up below
measures the cold route pause below 200 ms locally; hosted headroom remains
unverified.

## Repeatable measurements

Run `REDIS_URL=redis://127.0.0.1:<test-port> npm run audit:multiplayer`
against an isolated test Redis instance to regenerate
[`data/reports/multiplayer-performance-audit.json`](../data/reports/multiplayer-performance-audit.json).
The probe uses the shipped district and vegetation, Node 24.18.1 on an Apple M3
Max, synthetic accounts, real loopback WebSockets, local Redis for the Redis
tiers, and no live WorkOS.
Each world sample has 80 initial 50 ms simulation steps followed by 80 more
steps after routes have warmed. Transport samples 1, 8, 16, and 32 clients for
2 seconds each after a 500 ms settling period. Redis samples 20 room ticks per
player tier, maintaining synthetic presence with heartbeats. The short windows
are smoke tests, not throughput or latency percentiles suitable for an SLA.

| World | Players | NPCs | Snapshot JSON | Checkpoint JSON | Initial step p95 | Warm step p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Full | 1 | 193 | 112,391 B | 268,072 B | 108 ms | 1.41 ms |
| Shared | 1 | 98 | 57,344 B | 140,066 B | 108 ms | 1.13 ms |
| Full | 32 | 193 | 118,905 B | 281,698 B | 107 ms | 1.18 ms |
| Shared | 32 | 98 | 63,858 B | 153,692 B | 106 ms | 1.11 ms |

At one player, snapshot JSON is 49% smaller and the durable checkpoint is 48%
smaller. The same synthetic snapshot compressed with level-1 DEFLATE shrank
from about 10.6 KB to 6.9 KB; this is a size proxy, not captured wire traffic.
The outdoor walkers are deliberately retained, so cutting indoor NPCs does not
remove the cold route-planning cost: 8–9 of the 80 initial steps exceeded
50 ms across the sampled populations. No warm step exceeded 50 ms in this run.

| Loopback clients | Admitted | Snapshots per client in 2 s | p95 receive gap | Decoded JSON delivered | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 10 | 246 ms | 0.27 MiB/s | 0 |
| 8 | 8 | 10 | 280 ms | 2.22 MiB/s | 0 |
| 16 | 16 | 10 | 356 ms | 4.57 MiB/s | 0 |
| 32 | 32 | 10 | 279 ms | 9.65 MiB/s | 0 |

The server targets one complete snapshot every 200 ms. These receive gaps show
short pauses even on loopback. At 32 clients, the process used roughly 47% of
one CPU core during the 2-second window and added about 2 MiB of RSS; neither
number predicts hosted steady-state headroom. Slow sockets skip superseded
snapshots above a 256 KiB send buffer and close above 4 MiB.

| Redis room clients | Admitted | Tick p95 | Slowest tick | Compressed checkpoint | Compressed view |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 186 ms | 1,080 ms | 15,372 B | 6,154 B |
| 8 | 8 | 31 ms | 80 ms | 15,666 B | 6,396 B |
| 16 | 16 | 16 ms | 16 ms | 16,208 B | 6,729 B |
| 32 | 32 | 15 ms | 16 ms | 16,991 B | 7,326 B |

The first Redis tier includes cold navigation work, with one tick over 200 ms.
Later tiers inherit warmed routes. The 32-player Redis sample therefore
demonstrates warm local commit capacity, not cold-start or remote Redis
performance. Room state and public view are compressed before Redis storage.

## Architecture and limits

- Capacity is **32 players in one town**. Admission beyond that returns
  `world_full`; there is no dynamic room sharding or cross-region simulation.
- Production routes through one Vercel region (`iad1`) and a 300-second
  function window. Clients reconnect to another instance, while Redis keeps
  the canonical checkpoint. Players far from `iad1` have unmeasured latency.
- One fenced Redis lease serializes simulation and commands. Its 200 ms tick
  compresses and commits a checkpoint and view. More edge instances do not
  increase the one-room simulation write rate.
- The server sends complete snapshots at a 5 Hz target. A 32-player room
  generates approximately 10 MiB/s of **uncompressed** snapshot JSON before
  WebSocket compression and backpressure, based on the sampled 64 KB snapshot.
  The original probe did not measure client frame costs at 32 rendered avatars.
  The local rendered follow-up below now measures one hardware browser; hosted
  and physical mobile frame costs remain unverified.
- The population migration validates the old checkpoint before filtering,
  transfers an active wish from a removed shop resident to an available
  retained resident in the same shop when possible, then another free resident,
  and rejects an incompatible checkpoint
  instead of silently discarding state.
- Authenticated user IDs gate building, saved designs, and wish granting on
  the server. UI hiding is a convenience, not the permission boundary.
- Cross-world groups add one group-list request per visible connected client
  every 10 seconds, plus one selected-group read. At 32 clients with a group
  open, this is about 6.4 requests per second before invitations and messages.
  The existing audit did not include group traffic; include it in the hosted
  multi-region soak before claiming global capacity.
- The per-IP API access window allows 1,000 requests per minute. This leaves
  room for the existing 10-second social poll and the group list/read poll from
  32 players behind one address (about 576 requests per minute), while
  authenticated group and contact mutations retain their tighter per-account
  write limits. A 16-account shared-IP integration test covers the previous
  120-request ceiling; wider NAT and hosted load remain unmeasured.

## Verification and next release gates

`npm run test:server` passed **136/136** with a local Redis 7 container,
including separate backend instances, lease replacement, persistence,
authorization, and transport tests. The development two-browser journey also
passed after the population and admin changes. These fixtures use local test
identities; they do not exercise live WorkOS credentials or geographic RTT.

Before raising the 32-player limit or claiming global readiness, run a hosted
soak with 8, 16, and 32 authenticated clients from multiple regions for at
least 30 minutes. Record join and reconnect success, p50/p95/p99 command and
snapshot latency, missed ticks, CPU, memory, Redis operation latency and
checkpoint size, outbound compressed bytes, and client frame time on desktop
and mobile. Exercise a writer lease takeover, function recycle, one slow
client, and concurrent build/wish/chat/movement commands. Set a target from
those measurements and confirm the cold route-planning margin under hosted
load before expanding capacity. No such hosted soak or multi-region client run was available in
this audit, so global readiness remains unverified.

## Navigation follow-up — 3 October 2026

The profiler traced much of the cold route cost to scanning all 30 boutique
rooms for every collision sample. Room lookups now reject points outside the
room's footprint and doorway bounds, then search only rooms in the relevant
16 m spatial bucket. The full 635-test preview suite, including a comparison
against an unindexed room scan across doorway and district samples, passed.

In sequential local runs of `node server/performance-audit.js` without Redis,
the shared-world initial-step p95 fell from 108–113 ms to 64–66 ms across
1, 8, and 32 synthetic players; steps over 50 ms fell from 9–11 to 6 of 80.
The same 160-step single-player reproduction's worst step fell from 872 ms to
464 ms. These are machine-specific observations, and transport gaps vary with
host load. The cold route pause still exceeds the 200 ms room tick target;
this optimization does not satisfy the hosted, multi-region release gate above.

## Navigation follow-up — 4 October 2026

A CPU profile showed repeated collision checks on both directions of each
pedestrian grid edge and nine vegetation-bucket lookups for every route sample.
The planner now reuses a checked edge when A* reaches its other endpoint, and
each trunk is indexed into the grid cells touched by its clearance radius.
The same 5 cm segment sampling, terrain checks, road rules, and obstacle
clearance remain in place. Navigation and walking tests cover routes around
walls, public-stop reachability, and trunk clearance across bucket boundaries.

Three focused 160-step shared-world runs on the same M3 Max had worst cold
steps of **121–133 ms**, down from **483 ms** before these changes and
**240–255 ms** after edge reuse alone. The refreshed [machine-readable
audit](../data/reports/multiplayer-performance-audit.json) used a local Redis 7
container. With 98 shared NPCs and 1, 8, and 32 synthetic players, its worst
measured initial steps were **131, 139, and 139 ms** respectively, with zero
steps over 200 ms. The 32-player Redis room admitted all players; its warm
tick p95 was **11.41 ms** and maximum **12.33 ms**, with no tick over 200 ms.
The cold one-player Redis tier's maximum tick was **139.33 ms**. Loopback
transport admitted 32 WebSockets without errors and had a **223 ms** p95
snapshot receive gap over its two-second window.

These are local short-window measurements on a busy workstation, not a hosted
latency guarantee. The required 30-minute multi-region soak, client frame-time
measurements, and function-recycle/writer-takeover load observations are still
missing. Do not raise the 32-player room limit or claim global readiness from
this result.

## Command responsiveness follow-up — 4 October 2026

The local WebSocket server now coalesces waiting movement poses, as the Redis
gateway already did. A travel action remains between the newest pose sent
before it and the newest pose sent after it. Both gateways acknowledge a
successful travel immediately after the town accepts it, before preparing or
reading the full snapshot for broadcast. The travel result includes the
server-corrected player pose, so the caller can move promptly while the normal
snapshot still reaches the room. Other commands retain their existing
snapshot-before-result order.

Transport tests hold a movement queue and a Redis broadcast read to verify
these orderings. This addresses two avoidable sources of command delay found
while investigating an intermittent CPU-rendered browser timeout. It does not
establish hosted command latency or replace the multi-region soak above.

A subsequent CPU-rendered run exposed a separate Wave visibility issue:
gesture motion froze whenever a visible frame exceeded 250 ms. Gesture updates
now use a bounded frame step even on a slow visible frame. Avatars paused by
distance culling explicitly suspend their gesture clocks, so reappearance
still resumes from the last displayed pose.

## Live player map — 4 October 2026

The Places map reuses the room snapshots already delivered every 200 ms. It
adds no Redis reads or transport messages. At the 32-player room limit, it can
update at most 31 peer markers per snapshot; the accessible player list is
rebuilt only when membership or a name changes. Meeting a player is one
server-authoritative travel command. Its arrival search is bounded to 72
candidate positions and checks at most 31 other players at each candidate.
The two-browser shared journey verifies joining, meeting, and departure. Client
frame cost at the 32-player limit and hosted multi-region latency remain
unmeasured; the release gates above still apply.

Creator-region parcels add at most 32 rectangular boundaries to the world
package and map. Their owner IDs are static region metadata; displaying them
adds no room-tick or Redis lookup. Client map rendering cost with all 32 plots
is not yet measured in the hosted frame-time gate.

## Account design library — 4 October 2026

Jevica's new saved designs live in an account-scoped Redis record rather than
being copied into every world checkpoint. Library reads occur on builder
open, design placement, and library mutations; saves, copies, and deletes are
limited to 12
per minute per account. This adds no periodic work to the 200 ms room tick.
The two-owner library is bounded at 48 designs per account. Local Redis tests
cover concurrent writes from separate world edges and a cross-world placement;
the hosted soak has not measured these extra on-demand Redis operations.

## Cross-world landmarks — 4 October 2026

The Places panel loads the signed-in account's landmarks from the original
district and up to 16 published worlds when the account connects. This is at
most 17 small Redis list reads plus the world catalog read, outside the 200 ms
room tick; each per-world list remains capped at 50 entries. Older browser tabs
request only their current world's list. The hosted soak has not measured the
combined-list latency or payload at the 17-world, 850-landmark bound.

## Route-cost follow-up — 4 October 2026

CPU sampling of the first long resident route found repeated pedestrian segment
cost calculations for the same grid edge, direct path, and path-smoothing
candidate. The planner now evaluates each cost once and retains its existing
collision and road checks. The navigation, walking, and crowd tests passed;
the shipped district still produces the same 17-waypoint route in the focused
reproduction.

Sequential baseline and candidate runs of `node server/performance-audit.js`
on this Mac, without Redis, measured the slowest early world step at **112–122
ms before** and **98–107 ms after** across the full and shared casts with 1,
8, and 32 synthetic players. Early-step p95 fell from 18–20 ms to 16–17 ms.
Each run still had one step over 50 ms. Transport snapshot gaps varied in both
directions, so this change is not evidence of better network delivery. The
hosted multi-region soak and cold-start margin remain release gates.

## Event calendar — 5 October 2026

The calendar stores at most 128 events with 32 RSVP accounts each. Redis
operations are atomic and occur on calendar HTTP requests, outside room ticks.
The visible directory refreshes every 30 seconds and skips hidden tabs/panels.
A local Redis 7 full-calendar sample on Apple M3 Max measured 100 list reads:
1.97 ms median, 2.86 ms p95, 8.56 ms maximum; public response 44,592 bytes.
Overflow was rejected. This is loopback storage evidence. Hosted multi-region
latency, many simultaneous calendar readers, and full-calendar DOM rendering
cost remain unmeasured. See [events](world-events.md) for limits and semantics.

## Rendered crowd follow-up — 5 October 2026

`npm run audit:multiplayer:render` now exercises the real district in a hardware
Chromium browser with 1, 8, 16 and 32 authenticated **synthetic** guest accounts.
One browser renders the scene; the other accounts are real WebSocket transport
actors using mixed shipped humanoid looks, bounded movement and periodic waves.
The crowd camera frames every peer landmark. Models may occlude one another,
and the ordinary HUD remains present. The development build retains the full
materials, shadows, reflection captures and postprocessing; this is not a
production-bundle profile, live WorkOS acceptance, or a multi-browser soak.
All 98 shared NPCs remain. Every transport actor is checked for denied
building/wish commands; the complete roster, including the browser visitor, is
checked for false capability flags using the production admin predicate.

The receipts record the base revision and SHA-256 hashes of the measured runtime,
harness and dependency lockfile. The final runs used Node 24.18.1, Three 0.186.1,
ws 8.22.0, Vite 8.3.2 and Playwright 1.63.0 on a **busy Apple M3 Max** with the
ANGLE Metal renderer. Desktop is 1280×800 at DPR 1; the phone-sized viewport is
390×844 at DPR 2 **on the same Mac GPU**, not physical phone hardware.

### Fixed Sharpest quality

Eight samples used a five-second warmup, waited for all started assets to finish,
and measured at least 15 seconds each with native resolution and AO enabled.
Frame intervals retain stalls; no frames over 250 ms are discarded by the audit.
Main-loop timing is wall time inside animation/render submission, including any
driver waits; it is not GPU timer-query time or exclusive CPU utilization.
Draw calls include the composer's passes and shadows, not only the beauty pass.

| Viewport | Players | Frame p50 | Frame p95 | Main loop p95 | Snapshot gap p95 | Gesture ack p95 | Draw calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| desktop | 1 | 16.7 ms | 33.4 ms | 21.8 ms | 237.3 ms | 49.4 ms | 1,766 |
| desktop | 8 | 33.3 ms | 33.4 ms | 28.4 ms | 224.7 ms | 65.4 ms | 2,636 |
| desktop | 16 | 33.4 ms | 50.1 ms | 45.9 ms | 227.9 ms | 98.1 ms | 5,085 |
| desktop | 32 | 66.6 ms | 66.8 ms | 64.4 ms | 251.6 ms | 141 ms | 10,305 |
| phone-viewport | 1 | 16.7 ms | 33.4 ms | 23.2 ms | 238.8 ms | 47.8 ms | 1,478 |
| phone-viewport | 8 | 33.3 ms | 33.4 ms | 27.4 ms | 214.9 ms | 84.2 ms | 2,329 |
| phone-viewport | 16 | 33.3 ms | 50 ms | 38.9 ms | 227.8 ms | 82.4 ms | 4,790 |
| phone-viewport | 32 | 50 ms | 66.7 ms | 59.4 ms | 236.5 ms | 126.3 ms | 9,999 |

### Default Auto quality at capacity

Separate 32-player samples used a 20-second warmup and at least 30 seconds of
measurement. These sequential runs are observations, not a controlled claim
about the percentage benefit of Auto under changing host load.

| Viewport | Frame p50 | Frame p95 | Main loop p95 | Effective scale | AO | Draw calls |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| desktop | 50 ms | 50.1 ms | 50.2 ms | 0.6 | off | 6,821 |
| phone-viewport | 50 ms | 66.7 ms | 56.8 ms | 0.6 | off | 6,663 |

Both Auto samples had already settled at 60% resolution with AO disabled before
measurement and kept those settings. The crowded scene still has substantial
frame costs on this high-end host. Profile the production bundle's animation,
skinning, procedural accessories and multipass draw workload, then reduce avatar
draw calls/geometry and measure again before accepting a client frame budget.
The current samples do not establish smooth 32-player play on typical hardware.

### Dynamic connections and cleanup

All ten samples admitted their requested roster and loaded every peer without
asset failures, browser exceptions, unplanned connection closes, rejected sampled
commands or movement corrections. Each populated tier reconnected the same
authenticated peer and recovered the complete roster; the 32-player samples
exercise this at the room limit. The reports
separate socket admission, browser/model convergence, measured warmup, reconnect
and departure times. Departures use the normal ten-second grace rather than an
admin kick, followed by three seconds for resource observation.

- desktop: reconnect 171 ms; roster departure 10299 ms. Renderer geometry count fell from 3,111 to 357; textures from 335 to 252.
- phone-viewport: reconnect 167 ms; roster departure 10265 ms. Renderer geometry count fell from 3,082 to 332; textures from 321 to 239.

These are renderer resource **counts**, not VRAM bytes or proof against long-term
leaks. Cached templates and the evolving district remain after peers leave.
Snapshot traffic in the receipts is decoded UTF-8 JSON delivered to the browser,
not compressed TCP/WebSocket wire bytes. Actors do not run all residents' social,
group or calendar UI polls; add that traffic to the hosted soak.

### Reproduce and remaining gates

```sh
npm ci
npx playwright install chromium
npm run audit:multiplayer:render
npm run audit:multiplayer:render -- --players=32 --seconds=30 --warmup=20 \
  --quality=auto --output=data/reports/rendered-multiplayer-auto-audit.json
```

`--seconds` accepts 5–600, `--warmup` 1–60, `--quality` sharp/auto/smooth,
and `--players` an increasing subset of 1,8,16,32. Software renderers, empty
timing samples, overflow, missing peers/assets, permission escalation and failed
connection convergence fail the command. Sampled gestures wait for their ack
and cooldown; a deadline regression test prevents an extra early final gesture.
Owned services close on completion or interruption; no existing server is reused
or stopped. Development audit hooks are absent from the production build.

Receipts: [Sharpest](../data/reports/rendered-multiplayer-audit.json),
[Auto](../data/reports/rendered-multiplayer-auto-audit.json). A successful audit
means the probe completed with valid data and functional checks; there is no
passing frame-rate SLA in this command.

The room limit stays at 32. Production GPU/CPU profiling and a defined client
frame target, physical mobile and ordinary desktop measurements, and the hosted
30-minute multi-region WorkOS/Redis soak described above remain required gates.
Include lease takeover, function recycling, slow clients, real API polling and
compressed outbound bytes in that soak. **Global readiness is unverified.**


## Crowded accessory follow-up — 5 October 2026

A 1 ms Chromium CDP CPU sampler at 32 players attributed 74.1% of desktop and
78.1% of phone-viewport sampled time to the composer, including 19.5%/21.2%
in shadows. Remote-player updates accounted for 7.8%/7.5%. These are overlapping
inclusive samples and include submission/driver waits, not GPU timer queries.
The [diagnostic summary](../data/reports/crowded-avatar-cpu-summary.json) records
host load and profile hashes; raw profiles and the temporary instrumented
harness were used locally and are not checked-in audit receipts.

The procedural forest aristocrat had 265/294 accessory meshes per avatar.
Static opaque pieces sharing a bone and material now use the existing costume
batcher, reducing those counts to 49/62. Every authored accessory triangle is
retained. Baking preserves positions, normals and UVs; bone animation still
moves the complete accessory. Named pieces, transparent meshes, hidden pieces
and Lyra's independently toggled prowl outfit stay separate. No graphics setting,
NPC population, room limit or admin capability changes are involved.

Sequential unprofiled baseline/candidate runs used the same Apple M3 Max,
Sharpest settings, viewports, mixed human looks, 10-second warmup and at least
15 seconds of measurement. All 98 shared NPCs remain. CPU load averages at start
were 21.6/33.9/29.0 for baseline and 31.6/40.1/32.9 for candidate; this busy host
and asynchronous scene movement prevent a controlled percentage frame-speed
claim. Draw calls include shadows and composer passes.

| Viewport | Players | Frame p95 before / after | Main loop p95 before / after | Draw calls before / after |
| --- | ---: | ---: | ---: | ---: |
| desktop | 1 | 33.4 / 33.4 ms | 20.3 / 21.0 ms | 1,748 / 1,703 |
| desktop | 32 | 83.3 / 50.1 ms | 68.2 / 44.7 ms | 10,292 / 4,557 |
| phone-viewport | 1 | 33.4 / 33.4 ms | 19.0 / 19.5 ms | 1,445 / 1,418 |
| phone-viewport | 32 | 66.7 / 50.0 ms | 61.9 / 41.2 ms | 10,009 / 4,297 |

At capacity, these samples submitted 56–57% fewer draws. All 31 peers loaded
and their labels were in view. Both runs passed reconnect at capacity, normal
departure, asset/error checks, and denial of forged guest build/wish commands,
with zero movement corrections. Desktop capacity triangle totals stayed near
18.76 million; dynamic scene/culling differences affect complete-frame totals.
The regression suite independently checks exact accessory triangle counts for
all 20 human/furry reference forms, animated surface transforms, disposal,
transparent/named exclusions and Lyra's outfit visibility. Crowd screenshots
were inspected with full rendering. Physical mobile remains unmeasured.

Receipts: [baseline](../data/reports/crowded-avatar-baseline.json) and
[batched](../data/reports/crowded-avatar-batched.json). They hash the measured
accessory and batching modules as well as the original audit sources. To repeat
on a chosen revision (use a distinct output path for each):

```sh
npm run audit:multiplayer:render -- --players=1,32 --seconds=15 --warmup=10 \
  --output=data/reports/crowded-avatar-batched.json
```

This fixes a substantial draw-submission cost; it does not establish a 32-player
frame target on ordinary hardware. The production GPU profile, physical-device
measurements and hosted multi-region WorkOS/Redis soak above remain required.
Jevica alone retains building and wish granting. **Global readiness is unverified.**

## Shared furniture seating — 5 October 2026

Placed garden seats and lounge chairs now carry server-authoritative occupancy.
Reservations live in the existing player checkpoint, with no extra Redis key,
API poll or background simulation. A public player adds `sitting: null` while
standing, or a build ID, slot, height and facing while seated. The existing 5 Hz
snapshot carries this bounded metadata for at most 32 players. An occupied build
cannot move or disappear; local and remote renderers pin hips to its cushion.
All seven rigs were checked against both authored cushion heights. High seats
allow naturally bent, dangling legs instead of stretching shoes to the ground.

A sit command scans at most 32 players. A stand command searches at most 24
nearby candidates, checks other players/creations, and samples a same-room path
at 15 cm spacing. It runs only on explicit intent. The client reuses snapshots,
throttles nearby choices to 5 Hz, exposes at most eight slots, and changes option
nodes only when their membership/occupancy labels change. The world remains
capped at 192 placed creations; building remains restricted to Jevica.

Local Redis tests race two coordinators for one slot, replace the coordinator,
recover the reservation and release it after the normal disconnect grace.
World tests cover private-home revocation, compatible region updates, blocked
stand-up exits, travel, corrupt/duplicate seat checkpoints and guest capability
flags. The full-render two-browser journey checks a human and a fox form, occupied
options, seated movement/facing, removal denial, a real socket reconnect, and
keyboard standing at a phone-sized viewport. The phone viewport uses this Mac's
GPU and is not physical mobile acceptance.

Checkpoint version 3 fences pre-seating writers; valid older checkpoints upgrade.
The actual prior main implementation rejects the new format. A monotonic writer
generation atomically takes over older leases while
respecting same/newer generations; the existing commit fence protects state,
replies and queue trimming. A local probe using the actual prior main coordinator
held its commit, upgraded its active lease, replayed the queued intent and
confirmed that its late commit could not overwrite the seat. Redis ticks still
use two round trips. Rollback requires a coordinator that understands version 3.
This local evidence does not measure hosted rollout availability. Include mixed-version
draining, seating/standing while crowded,
and combined UI/API traffic in the required hosted multi-region soak. The
32-player limit and global/device release gaps above remain unchanged.

The integrated local run on base `c80fc3f` passed 677 preview tests and 289
Redis-backed server tests with zero failures/skips. The [seating browser
receipt](../data/reports/shared-seating.json) hashes the measured sources and
records the full-render journey. The build and reflection smoke passed.
