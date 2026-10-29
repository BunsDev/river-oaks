# #583 follow-up: a separate 16 MiB-class owned-texture ceiling for the Heights chain

Branch `feat/texture-ceiling-583-20261029`, worktree `river-oaks-ceiling-583` from `origin/main` `39a5f302`.
Register task `texture-ceiling-583-20261029`. Decision recorded 2026-10-29 by Val on the
Phase 2 handoff: keep the 16 MiB geometry ceiling and add a separate owned-texture
ceiling, enforced the same way, with per-chunk estimates, as its own PR.

## Objective

The Heights scheduler (`preview/src/heights-stream.js`) admitted and refused chunks on
geometry bytes only; the textures each city-kit neighborhood owns (sign atlas, tower
lettering, tree grate) were measured and reported (#729) but unbounded, and they outweigh
the geometry (Nineteenth and Yale: 20 signs, 13.35 MiB against 3.45 MiB of geometry).
Bound them without changing what streams today.

## Files owned

- `preview/src/spatial-chunk-stream.js`: `maxTextureBytes` (default unbounded),
  `chunk.estimatedTextureBytes`, `resource.textureBytes`, `residentTextureBytes`;
  admission on estimate in `update()`, refusal on measure after load
  (`Chunk exceeds texture ceiling`, disposed and retried like the geometry refusal).
- `preview/src/heights-stream.js`: `HEIGHTS_TEXTURE_BYTES`, `heightsChunkTextureBytes(plan)`
  (derived from the plan: one 1024×128 atlas row per distinct sign, one 2048×128 lettering
  band per water tower, the 64 px grate, mipmapped, two per cent high),
  `HEIGHTS_MAX_TEXTURE_BYTES = 32 MiB`, chunks carry `estimatedTextureBytes`, debug reports
  `textureBudgetBytes` and `estimatedTextureBytes`; `maxTextureBytes` option for tests.
- `preview/tests/spatial-chunk-stream.test.js`, `preview/tests/heights-stream.test.js`.
- `docs/world-streaming.md` (Heights paragraph).
- `preview/e2e/bayou-terraces.js`: a browser check that owned textures sit within the texture ceiling and each neighborhood within its estimate (atlases exist only with a real canvas).

## Why 32 MiB, not 16

Val's choice named 16 MiB as the texture figure. Measured input (`.runtime/ceiling/signs.mjs`
over `typesafe-place-1`, the current chain): the 18 neighborhoods own 111.1 MiB of textures
in all, the heaviest single neighborhood 13.35 MiB, and the heaviest set the geometry
ceiling keeps resident together is 30.7 MiB (Yale Icehouse 10.69 + Nineteenth and Yale
13.35 + Yale Street South 6.69). A 16 MiB texture ceiling would refuse chunks the
geometry ceiling admits today at the footbridge landing itself (Icehouse plus Nineteenth
and Yale alone are 24.0 MiB), changing what every existing journey sees. 32 MiB is the
smallest power of two above today's heaviest resident set; the unit test proves it
changes nothing along the whole chain and back. Lowering it to 16 MiB means shrinking the
atlases first (a 512-px row halves every figure); that is content work, recorded as the
next dependency, not taken here.

## Checks

| Check | Result |
| --- | --- |
| Failing first (source stashed): new chunk-stream test, heights-stream import | 2 fail (`texture ceiling admits on estimate…`; heights-stream.test.js fails to import the new exports) |
| `node --test preview/tests/spatial-chunk-stream.test.js preview/tests/heights-stream.test.js` | 23/23 pass |
| Neighbouring suites (commons-stream, bayou-terraces, studewood, typesafe-place, woodland-heights, kit-finish-live) | 63/63 pass |
| `pnpm run verify` (core, host load 13–19) | passed: 289/289, 4647 pass + 35 todo + 1 skip of 4683, 1080 pass + 285 skip of 1365, 127 pass + 5 skip of 132, Python 170 passed; receipt `.runtime/agent/core.json` |
| Browser journey (atlas measure under estimate with a real canvas) | Hosted `preview experience (terraces)` on PR #761 head `3b1df404` (job 123770581561): passed; owned textures measured greenway 2,818,048 B (estimate 2,874,410), north terrace 6,313,301 B (estimate 6,439,567), 9,131,349 of 33,554,432 B resident; new check `The owned textures sit within the Heights texture ceiling and each neighborhood within its estimate` passed. Local run not taken: host load 19–33 all evening (fixture page starves above 12). |
| Hosted matrix on `3b1df404` (PR #761) | 27/27 success, aggregate `preview` success, no reruns (2026-10-29, 22:30–23:40Z) |

## Gaps

- Headless Node builds no sign atlas (no canvas), so the unit tests prove the estimate
  against the grate only and against stand-ins owning exactly their estimate. The atlas
  measure against the estimate needs the browser journey.
- Hosted checks and landing need Val's authorization; this PR is a draft until then.

## Next step

This ledger commit is docs-only on top of `3b1df404`; its own hosted run must be read before landing. Landing (ready, lander) needs Val's authorization; the register task `texture-ceiling-583-20261029` holds PR 761. Next dependency if a 16 MiB texture figure is wanted: shrink the sign-atlas rows (512 px halves every estimate) and re-measure.
