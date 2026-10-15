# Voice survives the socket hand-over (2026-10-15)

Task `voice-continuity` · branch `fix/voice-continuity-20261015` · worktree `../river-oaks-voice-continuity-20261015` · owner claude:river-oaks-1b (b929a625). Val chose "Remove the voice gap at rotation" on 2026-10-15. This follows #447.

## Problem

#447 moves a page to a fresh town socket every 270 s without dropping anything except voice:
- Voice leases are fenced to a connection id, so that a stale tab cannot renew or release its successor's voice.
- After the swap, `reconcileWorld` revoked the lease on its next tick, because the lease named another connection, and removed the participant from LiveKit.
- A renewal from the new connection was refused with `stale_connection`.

The page re-joined voice, keeping the microphone, but with about a second of silence every 4.5 minutes.

## Change

- **The rotate notice names the connection being left** (`rotateNotice(…, connectionId)` in `server/connection-close.js`). The fresh socket presents it as `continues=<id>`, validated by `continuedConnection`. Only the page holding that socket knows the id.
- **`voice.continueConnection({userId, from, to})`** moves the lease with a compare-and-swap on the stored connection id. That is `leases.move` in memory, and a `MOVE` Lua script in Redis that keeps the key's remaining TTL. A wrong id, another account, a no-op move, or an id that no longer holds the lease are all refused.
- **Both servers** call it once the continuing socket has joined: `server/app.js` with its `token`, and `server/distributed-app.js` with its `connectionId`.
- **`reconcileWorld`** now holds a lease that names another connection for `VOICE_MOVE_GRACE_MS` (3 s) before revoking it, so the move can land. Explicit leave and revoke stay immediate. A replaced tab's lease now goes after the grace instead of on the next tick; `docs/voice-livekit-setup.md` notes the measurement target.
- **Client.**
  - `multiplayer-client.js` passes `continues` on the replacement socket.
  - `voice.onConnectionChanged()` now renews straight away and stays in the room. If the server could not move the lease (`stale_connection` just after a move), it re-joins, keeping the microphone. An ordinary stale renewal still ends voice.

## Checks

| Command | Result |
| --- | --- |
| `node --test preview/tests/voice-chat.test.js` | 19/19. The hand-over test now expects one renewal, no join, no leave and the same room, with the microphone on. It also covers the re-join fallback on `stale_connection` and that an ordinary stale renewal still ends voice. |
| Voice server tests on a throwaway Redis (`voice-reconcile`, `voice-service`, `voice-leases`, `voice-routes`, `voice-sweep`) | 48/48. The memory and Redis stores answer the new `move` steps identically. The grace and move tests run in memory and on the hosted room tick. |
| `server/tests/connection-rotation.test.js` (memory + Redis) | 6/6, twice. **Voice across a hand-over:** the same participant renews on the fresh connection, and nobody is removed. **Control** (a fresh socket without `continues`): the participant is removed after the grace. |
| Mutation: `server/app.js` stops calling `continueConnection`, then restored (`cmp` identical) | **Fails as intended**: `the fresh connection renews the same participant: {"ok":false,"error":"no_lease"}` |
| Full server suite on a throwaway Redis, first run | 787/792. All 5 failures were load: 4 `request_timeout` or slow-tick failures in Redis coordinator tests, and #447's rotation check. The browser journey and other sessions' runs were sharing the machine at load average 36–47. Run alone, `distributed-app` 11/11, `office-desk-transport` 2/2, `office-world-lifecycle` 6/6 and `penthouse-seats-redis` 1/1 passed. |
| Rotation test hardening | #447's rotation test (on `main`) could pass with no snapshot inside a fixed 600 ms window, and its 3 s lifetime retired the fresh socket under load. It now uses a 6 s lifetime with a 4 s notice, and waits up to 5 s for the next snapshot. Passes 6/6, twice. |
| Full server suite on a throwaway Redis, after hardening | **792/792, nothing skipped**, run in parallel at the same load |
| `node preview/e2e/connection-continuity.mjs` (rotations now carry `continues`) | JOURNEY |
| `pnpm run verify` (core) | VERIFY |

## Not covered

- Live LiveKit audio. The fake LiveKit records removals; it does not measure the audio gap.
- Production, where voice is still off (`RIVER_OAKS_VOICE`).
