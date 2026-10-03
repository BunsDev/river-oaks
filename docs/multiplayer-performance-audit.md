# Multiplayer performance audit — 3 October 2026

## Scope and result

The shared town now simulates **98 NPCs instead of 193**, a **49.2% reduction**.
All 24 outdoor scenario residents remain; each of 30 shops retains a staff
member, 44 guests remain indoors, and 14 static mannequins render. Solo play
keeps its existing population. The browser, server, room descriptions, and
checkpoint recovery use the same deterministic selection.

The 32-player admission limit passed short loopback WebSocket and Redis room
probes with no connection errors, and the full Redis-backed server suite passed
with a local Redis container. This is **local functional readiness**, not a
global capacity sign-off. A single Redis writer, one `iad1` region, cold
route-planning pauses, and the absence of long-running multi-region measurements
are the remaining capacity risks.

## Repeatable measurements

Run `REDIS_URL=redis://127.0.0.1:<test-port> npm run audit:multiplayer`
against an isolated test Redis instance to regenerate
[`data/reports/multiplayer-performance-audit.json`](../data/reports/multiplayer-performance-audit.json).
The probe uses the shipped district and vegetation, Node 24.18.1 on an Apple M3
Max, synthetic accounts, real loopback WebSockets, and no Redis or WorkOS.
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
  Client GPU/frame costs were not measured at 32 rendered avatars.
- The population migration validates the old checkpoint before filtering,
  transfers an active wish from a removed shop resident to an available
  retained resident in the same shop when possible, then another free resident,
  and rejects an incompatible checkpoint
  instead of silently discarding state.
- Authenticated user IDs gate building, saved designs, and wish granting on
  the server. UI hiding is a convenience, not the permission boundary.

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
those measurements and address the cold route-planning pause before expanding
capacity. No such hosted soak or multi-region client run was available in
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
