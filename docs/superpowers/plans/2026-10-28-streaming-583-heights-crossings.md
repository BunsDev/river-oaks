# #583 follow-up on current main: Heights chain crossings, owned textures, District release

Task `streaming-583-heights-crossings-20261028`, branch `feat/streaming-583-heights-crossings-20261028`,
worktree `river-oaks-streaming-583` created at main `1781924a` on 2026-10-28.

## Objective

The #583 follow-up prompt on the source main serves today: repeated crossings, leaks,
duplicate meshes, failed-load recovery and measured resources for the streamed Heights
chain (Bayou Heights, Studewood, the Bayou Terraces, Woodland Heights). The Commons
route already has twenty-trip browser evidence and its review fixes are in draft #697
(`river-oaks-phase2`); this task does not touch `commons-stream.js`, `server/app.js`
or #697's harness. Phase 2 travel itself (#582) is on main through #594 and #623.

## Findings on main `1781924a`

1. **Walking home never released Heights on the Terraces revisions.** With the Bayou
   Terraces at the District edge (`bayou-terraces-1`, `woodland-heights-1`, the
   development town default), `heights-stream.js` drops District points so they cannot
   prefetch the terraces, and the scheduler ignores an update with no valid point (an
   invalid position must not evict). Once everyone was back in the District nothing was
   wanted and nothing was released: five chunks, 11,090,376 geometry bytes and their
   textures stayed resident until world teardown. `bayou-heights-1` (the hosted
   `heights-return` shard) was unaffected, which is why no journey saw it.
2. **The 16 MiB ceiling counts geometry only, and each neighborhood owns textures that
   outweigh its geometry.** A city-kit neighborhood builds its own sign atlas (1024 px by
   128 px per distinct sign, mipmapped), tower lettering and tree-grate texture and
   disposes them on eviction. Nineteenth and Yale has 20 signs: about 13.3 MiB of atlas
   against a 3.45 MiB geometry estimate. `docs/world-streaming.md` already said to
   extend byte accounting before textures arrived; they arrived with the kit.
3. **Per-frame state queries built the whole debug picture.** `heights-stream.js` asked
   `stream.debug().chunks.find(...)` up to several times per frame for notice states.

## Changes

- `preview/src/spatial-chunk-stream.js`: `state(id)` returns one chunk's lifecycle
  state without building `debug()`; `'absent'` after disposal, `null` for an unknown id.
- `preview/src/heights-stream.js`: when no point anchors Heights (everyone in the
  District on a Terraces revision) the scheduler is updated with a point beyond every
  chunk's retention distance, so Heights streams out as it does on `bayou-heights-1`;
  an all-invalid update still evicts nothing. `ownedTextureBytes(group)` sums textures
  marked `userData.owned` (RGBA, mipmaps add a third); each chunk's value is recorded on
  attach and reported as `measuredTextureBytes` and `residentTextureBytes` beside the
  geometry figures. The geometry ceiling and the authored estimates are unchanged: the
  texture figure is instrumentation for a ceiling decision, not a new admission rule.
  `state(id)` is exposed on the Heights stream.
- `preview/src/city-kit/render.js`: marks the sign atlas, tower lettering and tree-grate
  textures `userData.owned`. The halo and the landscape template maps stay unmarked
  because they survive eviction.
- Tests: `spatial-chunk-stream.test.js` (state accessor through every state);
  `heights-stream.test.js` (twenty footbridge round trips with the real builders checking
  bounded bytes, exact disposal of every owned geometry, material and texture, identical
  laps, no duplicate groups; three laps along the whole chain to Woodland and back on
  `woodland-heights-1`; the District release on the Terraces revisions; owned-texture
  accounting with mipmapped, flat and shared textures).

## Files owned

`preview/src/spatial-chunk-stream.js`, `preview/src/heights-stream.js`,
`preview/src/city-kit/render.js`, `preview/tests/spatial-chunk-stream.test.js`,
`preview/tests/heights-stream.test.js`, `docs/world-streaming.md`, this ledger.

## Checks and results

| Check | Result |
| --- | --- |
| Failing first: chain laps and District release without the `away` anchor | 2 of 10 fail (`home in the District nothing stays`: 5 chunks, 11,090,376 bytes, 87,380 texture bytes resident), 10/10 with it |
| `node --test` spatial-chunk-stream, heights-stream, commons-stream, woodland-heights, bayou-heights, studewood, bayou-terraces, city-kit, streetscape-kit | 102 passed, 0 failed, 0 skipped (6.4 s) |
| `git diff --check` | clean |
| Headless benchmark, `update()` at the footbridge with 6 resident chunks, 20,000 updates ×2 | new `state(id)` 6.63 / 6.49 µs per update; previous `debug().chunks.find` 7.46 / 7.90 µs (host load 11–17; small in absolute terms) |
| `RIVER_OAKS_E2E_REPORT=streaming-583-terraces.json pnpm run test:experience bayou-terraces` (local, two rendered fixture clients, host load 17) | Passed, 14/14 checks, 0 page errors, reconnect 1,011 ms with 0 m drift. At the greenway: geometry 13,918,686 of 16,777,216 bytes (landscape 8,175,390; greenway 2,849,856; north terrace 2,893,440, each within its estimate) and owned textures 9,131,349 bytes resident (greenway 2,818,048; north terrace 6,313,301; landscape 0). Travel home approved for both players; both waited until `ready === false`, `residentBytes === 0`, `residentTextureBytes === 0`, `pending === 0`. Report kept in the session scratchpad, not committed. |
| `pnpm run verify` (core), worktree at main `1781924a` with this patch, host load 11–17 | Passed 2026-10-28T14:25:25Z (`.runtime/agent/core.json`): tooling 289; preview 4,313 + 1 existing skip; server 1,051 + 280 Redis skips; desktop 127 + 5 skips; Ruff; pytest 170; demo and demo-verify; secret scan clean. Core excludes Redis, browser and native coverage. |

## Gaps and risks

- Texture bytes are reported, not enforced. Whether the ceiling should become a total
  (geometry plus owned textures, which would need higher estimates or a raised 16 MiB
  ceiling) is Val's decision; the figures this adds are the input for it.
- Headless builds make no canvas, so the unit tests measure the tree-grate DataTexture
  and synthetic textures; atlas sizes in the browser come from the journey evidence.
- The hosted `terraces` and `woodland` shards do not walk home to the District, so the
  release fix needs a journey check or a local run to be browser-verified.

## Next step

Draft PR published; hosted Verify (including the `terraces` and `woodland` shards) is
the merge gate. Mark ready and land only with Val's authorization. Open for Val: whether
the Heights ceiling should count owned textures (and at what total).
