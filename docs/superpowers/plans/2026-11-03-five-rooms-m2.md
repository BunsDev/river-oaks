# Five Rooms M2: the first room people use (#825 slices 3-4)

Objective: seat clusters and accept-first private talk (Val's decision 3 on #825), with an interface and a shared journey. Session `claude:river-oaks-0e (267b3d)`, task `five-rooms-m2-goal-20261103`.

Authority: Val's goal of 2026-11-03 lifts "no new gameplay" for slices 3-4 only. These PRs are not landed until Val accepts the #842 packet and says land.

## Who owns what

| Goal step | Owner | State |
| --- | --- | --- |
| Main health | `river-oaks-38`, `five-rooms-closeout-20261102` (Val's closeout goal) | Live. `8a51f750` classified in #875: attempt 1 of run 41501249712 stalled the landing at 3.6 m, attempt 2 passed. |
| #842 evidence and acceptance packet | `river-oaks-38` | Packet published (#842 comment 6597388170). Not duplicated here. |
| Codex's delivery candidate (sha256 `4c4fdd0d`) | #876 from this session | Landed as `fe2463e2` and retired. |
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
| Counter | Attachment plus [-1, -2] m (east, north) | At the attachment, a seat sat within sitting reach (3.6 m) of the shop's arrival spot, so entering the Counter also offered Sit. Hosted `contextual-first-visit` caught it on both PRs. This is the smallest move that keeps every seat more than 1 m beyond reach of the arrival spot, door, facade and outside visit spot while staying on free floor in the mapped room. |
| Shade Garden | Attachment plus [-1, 3] m | The attachment stands between the Hermès room's displays, so two seats could not be approached. The same reach rule then sets the offset. |
| Starlight Screen | None | Its attachment is not free ground (inside the IPIC lounge's furniture). Waits for that venue's interior. |
| Atelier, Studios + Overlook | None | The contract gives them no `seat-cluster` attachment. |

Each cluster is two short benches facing each other, four places. Benches are drawn in every finish and have no collider, like storefront benches, so resident and police routes do not change. They add two draw calls. Their seats carry no `storeId`, so residents do not choose them. Authoritative ground and the Ribbon are unchanged: the benches only add bench places, and `seat-chat.test.js` checks each seat stands on free ground in a mapped room and out of reach of every shop mark.

## Checks

Slice 3 is PR #879 (`feat/seat-chat-825-20261103`). Slice 4 is PR #880 (`feat/seat-chat-ui-825-20261103`, based on slice 3).

| Check | Head | Result |
| --- | --- | --- |
| `node --test server/tests/seat-chat.test.js` | #879 `6975b816` | 14 pass, 1 Redis skip, 0 fail. The new placement test failed on the old placement before the fix. |
| Same file with `REDIS_URL` (isolated server, port 16731, db 5) | #879 `6975b816` | 15 pass, 0 fail, 0 skip (40 s). |
| Hosted Verify | #879 `6975b816` | Passed, run 41594825057. |
| Hosted Verify, earlier | #879 `3713f4b3`, #880 `f86fce04` | Failed `contextual-first-visit` on both attempts of both runs (41586641658, 41586644078): a real failure, the cluster placement above. `bayou-terraces` failed attempt 1 of 41586641658 ("Execution context was destroyed") and passed attempt 2: a flake. Logs kept. |
| `seat-chat-shared` (shared runner, three browsers) | #880 `1a1ce34e` | Passed, 22 checks. None of the witness's frames carried the words or a `seatChat` field. |
| `five-rooms`, `depth-layers`, `contextual-first-visit` (Classic) | #880 `1a1ce34e` | Passed. |
| `depth-layers`, `RIVER_OAKS_FINISH=pink-jet-age` | #880 `1a1ce34e` | Passed, 0 new pairs. |
| Bench captures: 2 cameras x 2 clusters x noon/19:00 x 2 finishes | #880 `1a1ce34e` | 16 views, 1158-2494 calls. No pink hit on the benches. Night hits are main's: the merged `Five Rooms glow-usable` door jambs at the Counter door (-2755.3, -1217.7) and Shade Garden (-2758.1, -1311.3), which the audit cannot name, and a pink sign in the Counter's boutique interior (-2746.2, -1217.7). Both classes are already filed by `river-oaks-38` on #839/#835 (#842 comment 6597388170). |
| `pnpm run verify` | #880 `1a1ce34e` | Passed: tooling 307/307; node 5265 (5234 pass, 1 skip, 30 todo); server 1425 (1139 pass, 286 skip); 132 (127 pass, 5 skip); 0 fail. |
| Hosted Verify | #880 `1a1ce34e` | Failed `preview shared (development)`: the journey routed from the Counter door while the CI player had stopped up to 3 m short, so a leg was blocked. |
| Hosted Verify | #879 `cb6aed14` | Passed, run 41607704283. |
| Hosted Verify | #880 `53a17811` | Failed `preview shared (development)`: the route started from the HUD's first value, the spawn 77 m away, before the walker caught up with the town. |
| Hosted Verify | #880 `db3f250c` | Failed `preview shared (development)` at "The sender reads their own line as You": the walk now works, but the check read alice's log right after bob's copy arrived. Each account's view rides its own frame. Fixed in `35f1bf81` by waiting up to 10 s for the line. |
| Journey fixes `bde56f83`, `db3f250c`, `35f1bf81` | | Route from the town's position once the walker has caught up. Prefer cells with 0.6 m clearance, so the walk stops grazing the serving counter's corner. Grow a press that moved nothing. On a stall, report the strides, focus, corrections and a backward step. `RIVER_OAKS_FINISH=classic` runs it under `?finish=classic`. |
| `seat-chat-shared`, Chromium, Pink (default) | #880 `db3f250c` tree | Passed, 23 checks, 137 s. The witness got 614 frames, none with the words or a `seatChat` field. Panel text worst case 10.93:1 over a white or black world. |
| `seat-chat-shared`, Chromium, `RIVER_OAKS_FINISH=classic` | #880 `db3f250c` tree | Passed, 26 checks (three confirm the page drew Classic), 134 s. |
| `seat-chat-shared`, WebKit | #880 `db3f250c` tree | Failed 9 of 9 runs (09:04Z to 12:01Z): alice stopped at north -1219.17 on the walk round the serving counter. **Cause found: an engine difference in room planning, not in seat chat.** An in-page probe showed Chromium and WebKit building different walking maps from the same data. `planStoreRooms` chooses between equal-size bay spans by area, and V8's `Math.hypot` (the Node town, Chromium) is one unit in the last place off the correctly rounded value JavaScriptCore returns. So Safari planned Amorino one bay over (`aMin -8.8253` against `-5.5677`), and IPIC's wall crossed the corridor. 6 of 30 shops differ. Fixed separately in #883 (`fb34d690`) with a V8-identical `stableHypot`; the server's plan is unchanged byte for byte. |
| `seat-chat-shared`, WebKit, with #883 on #880 `9168c019` (snapshot), `development-seats` | | **Passed**, 23 checks, 138 s. Chromium on the same tree passed, 23 checks, 148 s. |
| `pnpm run verify full` from a git-archive snapshot of `db3f250c` (commit `7f079165`), isolated Redis on port 16731 | #880 `db3f250c` | Passed, 19 stages, 10:07Z to 10:57Z, start load 3.2, receipt not dirty. Tooling 307/307. Node 5265 (5234 pass, 1 skip). Server with Redis 1467/1467. 132 (127 pass, 5 skip). Desktop 2/2. Experience 976 s, commons 243 s, shared 1332 s (includes `seat-chat-shared`, passed), IPIC screening 91 s. The first attempt stopped at `server-redis-tests` because `REDIS_URL` was unset; log kept. |
| `seat-chat-shared` after `35f1bf81` | #880 `35f1bf81` | Passed on Chromium (Pink). |
| Hosted Verify | #880 `35f1bf81` | Cancelled at the 20-min cut (run 41623952304). `seat-chat-shared` passed on the hosted runner for the first time but took 10 min 55 s, so the `development` shard ran out during `crime-residents`. |
| Own shard, `9168c019` | #880 | A `development-seats` mode runs `seat-chat-shared` alone with the `development` environment, as a new `preview shared (development-seats)` job. No timeout changed. `verify full` still runs every mode. `node preview/e2e/shared-runner.js development-seats` passed locally (11:25Z), and `pnpm run test:agent` 307/307. |
| Hosted Verify | #880 `9168c019` | Passed, run 41627394179, all 28 check runs. `preview shared (development-seats)` 6 min 19 s; `development` back to 7 min 8 s. |
| `five-rooms` inside `pnpm run verify full` (#842) | #884 `f6a5abb0` | New stage `experience-five-rooms`, default 10-min deadline, no timeout changed. `verify full` from a snapshot with isolated Redis passed 20/20 (`experience-five-rooms` 351 s). Hosted 34/34. Landed via `pnpm run land 884` as `f7d22cff` (13:56:40Z); evidence on #842. |

## Findings for others

- Room planning differed between engines (V8 `Math.hypot`), so Safari had different walls in six shops. Fixed in #883.

- On a phone, a seat within reach adds "More actions" to the walking HUD, and the summary sits under `.touch-stick-zone`, so a tap cannot reach it. This predates seat chat (any seat does it). Not fixed here.
- `PINK_RULE.usable` does not read a material's `role: 'usable'`, so merged shell glow counts as a violation (already filed by `river-oaks-38`).

## Gaps

- No human accessibility or device proof. The journey drives real keyboard events and reads roles and names, which is not the same thing.
- Groups are not built: a conversation is two people.
- WebKit passes only with #883 applied. Until #883 lands, Safari players see six shops laid out differently from the server.
- Since `9168c019` the journey lives in the `development-seats` mode only. `RIVER_OAKS_SHARED_JOURNEY=seat-chat-shared` with mode `development` runs nothing and exits 0.

## Next step

#884 is merged (`f7d22cff`). Val's acceptance page for slices 3–4: https://claude.ai/artifact/4hsAQdu6gWAzYMeXpPJvBx (private until shared). #879, #880 and #883 are ready for review. Do not land #879/#880 until Val accepts the packet and says land; #883 needs a landing decision too.
