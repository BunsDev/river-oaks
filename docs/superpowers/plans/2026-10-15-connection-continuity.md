# Players stay connected (2026-10-15)

Task `connection-continuity` · branch `fix/connection-continuity-20261015` · worktree `../river-oaks-connection-continuity-20261015` · owner claude:river-oaks-1b (b929a625).

Val asked for a review of how players stay connected, then chose all four fixes. Val added: "when an update is pushed out, please make it clear the world is improving not that they are disconnected".

## Review findings (before)

1. **Every player was kicked every 4.5 minutes.**
   - Production runs the town in a Vercel Function capped at 300 s (`vercel.json`), so `server/distributed-app.js` closed each socket at 270 s with 1012.
   - The page treated that close as a lost connection:
     - the full-screen gate came up with "Connection lost. Rejoining the town…" and the app went inert;
     - commands in flight failed;
     - every other resident's avatar was removed;
     - chat was disabled;
     - voice left the room.
   - When voice came back it rejoined through `join()`, which unmutes only with the auto-unmute preference (off by default), so anyone talking came back muted.
2. **No dead-socket detection after connecting.** `watchConnection` guarded only the open and the first snapshot. A Wi-Fi switch, sleep or a router timeout froze the page until TCP gave up. Meanwhile the town removed the player after 10–20 s.
3. **No reaction to coming back online or into view**, and retries backed off to 30 s.
4. **Retries had no jitter**, so after a restart every page retried at the same instants.
5. **The production reconnect grace was 10 s** (the standalone server's was 30 s).

## Change

- **`server/connection-close.js` (new).** The shared close contract:
  - `retireAfter` sends `{type:'rotate', closeInMs}` 15 s before the lifetime ends, then closes with 4010 "Moving to a fresh connection."
  - `closeForUpdate` closes with 1012 "River Oaks is updating.", waits briefly for the handshakes, then terminates whatever is left.
- **`server/distributed-app.js`:** uses both. A connection refused while stopping also gets the update close.
- **`server/app.js`:**
  - adds `connectionLifetime` (off by default; for hosts with a request limit, and for the browser fixture) and the update close on shutdown;
  - `server/world-gateway.js` passes the options through;
  - `server/tests/browser-fixture.js` reads `RIVER_OAKS_TEST_CONNECTION_LIFETIME_MS` and `RIVER_OAKS_TEST_ROTATE_NOTICE_MS`.
- **`server/redis-room.js`:** `LEAVE_GRACE_MS` is 30 s (was 10 s). `HEARTBEAT_TIMEOUT_MS` is 40 s (was 20 s); it stays above the grace, as before.
- **`preview/src/connection-policy.js` (new).**
  - Jittered retry delays (upper half of each step, still capped at 30 s).
  - The staleness watch: 8 s without a snapshot while visible. A late check or a return to view gets 3 s of grace.
  - What each close says:
    - 1012 says "River Oaks is improving / Updating the world…" and keeps rejoining;
    - 4000 or 426 says "River Oaks has been improved" and offers Refresh;
    - 4003 and 4009 are unchanged;
    - anything else is a lost connection.
- **`preview/src/multiplayer-client.js`**
  - **Seamless hand-over on `rotate`:**
    - commands in flight finish (up to 3 s);
    - new commands are held;
    - a fresh session, ticket and socket are opened, and the page switches on that socket's first snapshot;
    - the held commands are sent, and the old socket's close is ignored;
    - if the replacement fails, the old socket carries on until it closes, then the page reconnects as usual.
  - **Other:**
    - the watchdog;
    - `online` and visibility resume;
    - the gate wording follows the close, and the Refresh button reloads;
    - development-only hooks (`window.__riverConnection`) for the journey.
- **`preview/src/voice-chat.js`**
  - A reconnect within 60 s restores a microphone that was on. After a longer outage the resident unmutes themselves.
  - `onConnectionChanged()` takes a fresh lease after a hand-over (leases are fenced to a connection), keeping mic and deafen.
- **`docs/multiplayer.md`:** the 30 s grace and a "Staying connected" section.

## Checks

| Command | Result |
| --- | --- |
| `node --test preview/tests/connection-policy.test.js` | 5/5 |
| `node --test preview/tests/voice-chat.test.js` | 19/19. The connection-loss test now expects the mic restored within 60 s and off after a longer outage, and a new test covers the hand-over lease. |
| `node --test server/tests/connection-rotation.test.js` (memory + throwaway Redis) | 4/4. Notice timing, a fresh socket taking over while bob keeps seeing alice, 4010 without a replacement, and 1012 "River Oaks is updating." on shutdown. Redis mode needed a warm-up connection, because the gateway builds the world on its first connection and that held the event loop for about 2 s. |
| Redis suite files touched by the grace (`redis-room`, `ipic-routes`, `penthouse-seats-redis`) | Pass, once the heartbeat timeout was kept above the grace. With both at 30 s, residents who stayed but sent no heartbeat during a 31 s jump were removed (`stale_connection`). |
| `node preview/e2e/connection-continuity.mjs`, run 1 | Every continuity check passed: 4 hand-overs in 45 s, 427 samples at most 169 ms apart, the gate never shown, bob never gone, 29/29 chats confirmed. It failed only on a check that a sample fell inside a hand-over, because each hand-over completed inside one sampling gap on loopback. That check now records each hand-over's time and requires samples within 300 ms on both sides. |
| Runs 2–5 | Run 2: the old deaf hook still heard the rotate notice, so the page moved to a healthy socket. The hook now ignores every message, as a dead socket would. Runs 3 and 4 passed every check (noticed after 8.9 s and 8.2 s; online reconnect in 0.4 s and 0.03 s). Run 5 timed out in the watchdog step with no diagnostics. The journey now polls on a timer and reports the page's state on any timeout. |
| Watchdog rule after run 5 | The earlier rule gave grace to any check that ran more than 2 s late, so a page whose every check runs late (a slow device, or software rendering at load 40) never reached a verdict. Now the socket is judged after more than 8 s without a snapshot **and** at least 5 watchdog checks since the last one. The policy tests cover a frozen page, late checks and a return to view. |
| Run 6 (final code) | RUN6 |
| Mutation: the client ignores `rotate`, then restored (`cmp` identical) | **Failed as intended**: `the gate never appeared: {connected:false, gate:true, status:"Reconnecting to the town…", bobInTown:false, bobShown:false}`. Without the hand-over the old experience returns: the gate, and the other resident gone. |
| Neighbouring journeys | JOURNEYS |
| Full server suite on throwaway Redis | REDIS_FULL |
| `pnpm run verify` (core) | VERIFY |

## Not covered

- **Production.** These changes are not exercised against a real Vercel function lifetime. The fixture uses 15 s lifetimes on the standalone server, and the Redis transport test uses 3 s.
- **Live voice.** LiveKit is unit-tested with a fake SDK, so the audio gap during a voice rejoin (about a second) is not measured.
- Phones, Safari and real network changes. `online` and visibility are simulated by dispatching events.
