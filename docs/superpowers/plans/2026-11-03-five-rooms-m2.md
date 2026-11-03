# Five Rooms M2: the first room people use (#825 slices 3-4)

Objective: seat clusters and accept-first private talk (Val's decision 3 on #825), with an interface and a shared journey. Session `claude:river-oaks-0e (267b3d)`, task `five-rooms-m2-goal-20261103`.

Authority: Val's goal of 2026-11-03 lifts "no new gameplay" for slices 3-4 only. These PRs are not landed until Val accepts the #842 packet and says land.

## Who owns what

| Goal step | Owner | State |
| --- | --- | --- |
| Main health | `river-oaks-38`, `five-rooms-closeout-20261102` (Val's closeout goal) | Live. `8a51f750` classified in #875: attempt 1 of run 41501249712 stalled the landing at 3.6 m, attempt 2 passed. |
| #842 evidence and acceptance packet | `river-oaks-38` | Live. Not duplicated here. |
| Codex's delivery candidate (sha256 `4c4fdd0d`) | Draft #876 from this session; `river-oaks-38` holds a copy on `feat/five-rooms-delivery-fixes-20261103` | Asked which one carries it. Seat chat stacks on #876 for now. |
| Slices 3-4 | This session | In progress. |

## Files owned

- `server/seat-chat.js`, `preview/src/seat-clusters.js`, `server/tests/seat-chat.test.js`
- Hooks in `server/world.js`, `server/app.js`, `server/distributed-app.js`, `server/redis-room.js`, `server/blocks.js`, `preview/src/world-interactions.js`
- `preview/src/seat-chat-ui.js`, `preview/src/seat-chat.css`, `preview/src/five-rooms/seat-furniture.js`, `preview/tests/seat-furniture.test.js`, `preview/e2e/seat-chat-shared.js`

## Decisions

- **Two people, one conversation.** Decision 3 says "both people", so a conversation is a pair. Groups are not built.
- **Private view, not snapshot.** The shared snapshot is one frame for everyone. Each account's view travels beside it as a `seatChat` field on that account's frame only, and accounts with no conversation still get the shared frame. On the hosted path the committed Redis view carries `seatChat` by account, and each gateway picks out one.
- **Refusals read alike.** Asking someone who is absent, not seated there, or who has blocked you all return `seat_chat_unavailable`. Declining and lapsing look the same to the asker, and both stop repeat asking for 60 s.
- **Checked against where people sit now.** Sessions are reconciled against current seats on each step, view and command, so every way of leaving a seat ends the talk. That includes standing, travel, a knockdown, a restore and the end of the reconnect grace.
- **Late-response fence.** `send` names its session, so a line typed for one conversation cannot reach a later one. Starting a new conversation also clears the input.
- **Checkpoint.** Saved only while something is live, so an idle town's checkpoint is unchanged and needs no version bump. An older build ignores the field on rollback, which ends any open conversation. A malformed save starts clean rather than refusing the town.
- **Reports.** A report can quote lines the reporter could already read in their own conversation. Nobody else's are added.

## Placement

| Venue | Cluster | Why |
| --- | --- | --- |
| Counter | At its `seat-cluster` attachment | Free ground inside the mapped room, reachable from the door around the serving counter. |
| Shade Garden | Attachment plus [0.5, -2.85] m | The attachment stands between the Hermes room's displays, so two seats could not be approached. The offset reaches open floor. |
| Starlight Screen | None | Its attachment is not free ground (inside the IPIC lounge's furniture). Waits for that venue's interior. |
| Atelier, Studios + Overlook | None | The contract gives them no `seat-cluster` attachment. |

Each cluster is two short benches facing each other, four places. Benches are drawn in every finish and have no collider, like storefront benches, so resident and police routes do not change. They add two draw calls. Their seats carry no `storeId`, so residents do not choose them.

## Checks

| Check | Result |
| --- | --- |
| `node --test server/tests/seat-chat.test.js` | 13 pass, 1 Redis skip, 0 fail. It caught a real leak while being written: my first edit placed the private state in `snapshot()` instead of `checkpoint()`. |
| Same file, Redis case, isolated server on port 16731 | 1 pass (two gateways, 19 s) |
| `world-interactions`, `blocks-*`, `seating`, `account-erasure-world`, `world`, `resident-locations`, `resident-life` | 133 pass, 6 skip, 0 fail |
| `seat-furniture`, `five-rooms-integration`, `five-rooms-shells`, `resident-locations`, `walking`, `seat-chat` | 51 pass, 2 fail, 1 skip. Both failures were one wrong test assertion on emissive intensity, since corrected; `seat-furniture` then passed 3/3. The combined set has not been rerun. |
| `pnpm run build` | Passed |
| `seat-chat-shared` journey | Pending (queued behind the browser lock) |
| `pnpm run verify`, `pnpm run verify full`, hosted checks | Pending |

## Gaps

- No human accessibility or device proof. The journey drives real keyboard events, which is not the same thing.
- The benches have not been reviewed in rendered night captures against the pink rule.
- `hud-token-contrast` is not run against the new panel colours yet. The panel uses existing HUD tokens.

## Next step

Read the journey result, fix what it finds, run core verify, then push slices 3 and 4 as stacked PRs marked ready for review, not landed.
