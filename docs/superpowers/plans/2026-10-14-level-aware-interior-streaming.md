# Level-aware generated interior streaming

Objective: keep each generated building's visible detail tied to the player's authoritative level while preserving a ready ground-floor entrance and the next connected landing. A building with several floors should not prepare every upper floor merely because their footprints share horizontal coordinates.

Owner: `codex-root-20261014-level-streaming`. Branch/worktree: `feat/procedural-level-streaming-20261014` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-level-streaming-20261014`, based on signed gallery head `f0a55434`. Integration owner continues on `docs/procedural-multilevel-interiors-20261013` in its own worktree.

Owned files: `preview/src/generated-interior-stream.js`, its focused test, the occupancy hint at the call in `preview/src/main.js`, the named gallery-level browser journey, this ledger and this branch's task record. The [design guide](2026-10-13-procedural-multilevel-interiors.md) keeps server-approved collision and portals authoritative.

## Evidence and limits

- Before this slice, `update(camera.position, now)` measured only east/north distance to each level's shared facade. A four-level synthetic building prepared all four detail groups from the street; the new behavioral test failed with `gallery/l0,l1,l2,l3` instead of just `gallery/l0`.
- The stream now accepts the local player's authoritative `levelId`. From the street it prepares only ground-floor detail. While assigned to a level it also prepares directly connected portal destinations in that building. Pending work for ineligible levels cancels; detail evicts after the existing 12-second delay. Cheap shells remain available and published plan/collision state is unchanged.
- `node --test preview/tests/generated-interior-stream.test.js` passed 2/2 after the change; `node --check preview/src/main.js` passed. `pnpm run agent:doctor` passed after locked dependency sync. Final `pnpm run verify` passed (`/tmp/river-oaks-level-streaming-core.log`, `.runtime/agent/core.json`): agent 76, preview 3,026 pass/1 skip, server 487 pass/141 Redis skips, desktop 54, Python 141, build and secret scan passed. This is a preparation and memory-bound improvement, not evidence that the gallery achieves 60 Hz or that all upper-floor transitions are visually seamless.
- The first `generated-gallery-levels` journey timed out at its old pre-entry assertion that both levels were ready. Its report is retained at `.runtime/level-streaming/first-gallery-levels-failure.json`; the timeout was at line 36, before walking or ascent. The journey now requires a ready level 0 and upper shell before entry, then waits for the connected level 1 after entry.
- The corrected `pnpm run test:experience generated-gallery-levels` journey passed: two clients agreed on entry, ascent, reconnect with reduced motion, and descent. The captured upper-floor player view shows the finished landing and portal frame, not the cheap shell. The one-client `pnpm run test:experience generated-gallery` also passed with cold/return preparation 384/204 ms; its final report is retained at `.runtime/level-streaming/generated-gallery-final.json`, while the tracked historical report was restored. At 1440×900 on Chromium Metal, street p95 frame interval was 16.8 ms; inside p95 was 33.4 ms. The pilot still has no 60 Hz acceptance.

## Next action

Review and sign the isolated branch, then hand it to the procedural integration owner. Integration must use that owner's committed source and rerun combined gates; the broader performance, hosted, native and human acceptance limits remain open.
