# #583 optimize: Heights neighborhood builds, byte-identical and about half the time

Branch `perf/heights-build-583-20261030`, worktree `river-oaks-optimize-583` from `origin/main`
`bea70e05` (after #761). Register task `heights-build-583-20261030`.

## Objective

The #583 follow-up asks to compare measured metrics to baseline and optimize. The Phase 2
optimization record (`2026-10-28-streaming-583-heights-crossings.md`) found every budgeted
metric within budget and applied no streaming optimization. One measured cost was left
unbudgeted: each Heights neighborhood is built on the main thread when it streams in, and a
build longer than a 16.7 ms frame is a dropped frame at the moment a player crosses. Reduce
that cost without changing a byte of what is drawn.

## Measured cost (main `bea70e05`, headless Node, `typesafe-place-1`)

`.runtime/opt/build-bench.mjs` builds the landscape and all 18 neighborhoods with the real
builders, seven rounds, first round discarded, and hashes every merged attribute buffer and
mesh matrix. A CPU profile of the builds put about 40 % of the time in the city-kit batch's
box path: each box cloned an indexed `BoxGeometry`, `applyMatrix4` transformed it, metric
UVs were written, and `toNonIndexed` copied it again before `mergeGeometries`.

## Change

`preview/src/city-kit/render.js` `createBatch().box` writes each box's 36 corners straight
into its material's position, normal and UV arrays, with the same three.js arithmetic in the
same order (`Vector3.applyMatrix4`, `Matrix3.getNormalMatrix` and `applyNormalMatrix`, values
stored as 32-bit floats before the UV choice reads them). A run of boxes becomes one
non-indexed geometry at build; any other geometry added to the material closes the run, so
the merge keeps insertion order. `createBatch` is exported for its test; the unused per-box
UV helper is removed.

## Checks

| Check | Result |
| --- | --- |
| Output digests, all 19 chunks, main vs change | identical (attribute buffers and mesh matrices) |
| `preview/tests/city-kit-batch.test.js` (new: 400 seeded boxes with yaw and pitch, interleaved meshes, two materials, byte comparison against the replaced clone/transform/UV/de-index path) | pass; on main it cannot import `createBatch` (the guarded path is new) |
| city-kit, Heights, streaming and neighborhood suites | 151/151 |
| Interleaved A/B build time, three alternations of seven rounds, host load 36–44 | see below |
| `pnpm run verify` (core, host load 36–44) | passed: 289/289; 4656 pass + 35 todo + 1 skip of 4692; 1081 pass + 285 skip of 1366; 127 pass + 5 skip of 132; Python 170 passed |
| Browser: `world-streaming` twenty-round-trip journey, `cc6ab7c7` (detached snapshot, 2026-10-30 03:53–05:12Z, 5-min load 13.5–17.7) | passed: 22 laps (2 warm-ups, 20 measured), scene and GPU counts bounded on every trip, post-GC heap 1.007 and 1.004 × warmed baseline (limit 1.10), no page errors, no extra sockets, camera and position continuous on all crossings |
| Browser: matched baseline audit (`world-streaming-matched.js`), `cc6ab7c7` snapshot, 05:19–05:35Z, load 14 | passed: desktop and phone viewports on `river-oaks-gardens-3` and `east-garden-commons-market-1`, 3 windows per player count, 9 reconnects each |

Build time, median of three alternation medians (ms):

| Chunk | main | change |
| --- | ---: | ---: |
| nineteenth-and-yale | 30.5 | 13.8 |
| typesafe-place-penthouse | 29.8 | 13.8 |
| typesafe-place-uptown | 28.4 | 10.6 |
| yale-street-north | 27.1 | 12.6 |
| yale-icehouse | 26.3 | 13.6 |
| all 19 summed | 385.4 | 204.3 (−47 %) |

Per-alternation sums: main 362 / 422 / 385, change 214 / 186 / 213. Before, 14 of 18
neighborhoods built in more than one 16.7 ms frame; after, none do. Measured under host load
36–44, so absolute figures are high; the comparison is interleaved so both arms saw the same
load.

## Gaps

- Headless Node measures build CPU, not GPU upload; the browser journey and matched audit
  measure the whole crossing.
- Historical reports that name `render.js` (`data/reports/default-appearance-*-517.json`)
  are evidence of their own revision and are not regenerated.

## Next step

Land (authorized by Val 2026-10-30 once the browser evidence passed).
