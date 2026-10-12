# Cut #253's CPU-renderer load and frame cost

**Status:** implemented and measured locally; PR pending.
**Owner:** Claude session `6136f6c0-2b65-4eef-92a0-9ce4bb13c5f4` (task `interior-cpu-cost`).
**Branch / worktree:** `fix/interior-cpu-cost` at `../river-oaks-interior-cpu-20261011`, from `main` `640abe3`.

## Problem

river-oaks-3b found that the CI `Email access and content security browser regressions` step began timing out after #253 merged. The step waits 60 s for `.multiplayer-roster[data-connected="true"]` at `preview/e2e/email-access.test.js:162`. Across 40 Verify runs it failed 7 times, all after #253 (f1 found one earlier failure, at `c4a871b`, so #253 made the flake much more frequent rather than introducing it). The test serves the production build under Mesa CPU rendering. Unlike dev software acceptance, production has no `MeshNormalMaterial` override, so #253's shaders run there:

- `room-ground-clip.js` looped over all 30 rooms in every ground, road and sidewalk fragment, and the ground covers most of the screen.
- `interior-luxe.js` generated eight procedural floor canvases (up to 1024²) synchronously while the district was built.

Slow first frames then let the client's 12 s connection deadline close the socket before the first snapshot was processed, and the reconnect backoff ran past 60 s. #260 (river-oaks-3b, merged as `7c3f4ea`) fixed that client half separately: a late timer now restarts instead of closing.

## Change

| File | Change |
| --- | --- |
| `preview/src/room-ground-clip.js` | A 1 m RGBA mask over the rooms' bounds lists up to four candidate rooms per cell. Room frames come from a float texture via `texelFetch`, so no uniform array is indexed dynamically (software rasterizers can turn that into a scan of every room). Each fragment does one mask fetch and at most four exact footprint tests, instead of 30. Frames are stored relative to the mask origin, keeping float32 precision under a millimetre. The clip is as exact as before, and the mask has zero overflow. |
| `preview/src/main.js` | Clips only the terrain surface. Roads and sidewalks never rise above a walk-in floor (see the guard test), so clipping them only added shader variants. Also disposes the previous mask textures when the world reloads. |
| `preview/src/interior-luxe.js` | Floor canvases (marble, terrazzo, limestone, chevron, carpet) start as 1×1 base-colour swatches and are drawn one per idle slot after the district appears. Each swap releases the swatch's immutable GPU storage first, which three.js needs before a larger upload. The material keeps its map, so nothing recompiles. Canvases are cached as before. |
| `preview/tests/room-ground-clip.test.js` | Emulates the mask and `texelFetch` path exactly. Checks that every footprint sample's cell names its room, that there is no overflow and no dynamically indexed uniform arrays, and that roads and sidewalks never rise into a room, which is what keeps the terrain-only clip correct. |
| `preview/tests/interior-luxe-deferred.test.js` | With a stub canvas: floors load as swatches, receive full canvases in idle slots, reallocate GPU storage while staying live, and skip textures disposed before their slot; a rebuild reuses cached canvases. |

## Checks

- `pnpm test`: 2648 tests, 0 fail, 1 skip. `pnpm run build` succeeds.
- SwiftShader load probe (scratch `cpu-load.mjs`: fixture server, headless Chromium `--use-angle=swiftshader`): see Results.

## Results

SwiftShader probe (`--use-angle=swiftshader`, dev fixture server, real materials, 1280×800). This Mac has no Mesa, so treat these as relative numbers only. The same commit varies about ±50% between runs.

| Variant | Load to `#loading` hidden | Town joined | Longest main-thread task | Programs linked |
| --- | --- | --- | --- | --- |
| `d195907` (before #253) | 80.3 s, 124.7 s | 99.6 s, 165.1 s | 49.2 s, 73.5 s | 128, 134 |
| `d24b379` (#253 merged) | 252.2 s, 85.4 s | **266.0 s, 255.6 s** | 131.8 s, 50.5 s | 138, 138 |
| `d24b379` with the clip removed (diagnostic) | 54.1 s | 80.7 s | 35.7 s | 120 |
| Fix: mask plus deferred floors, all outdoor surfaces clipped | 93.5 s | 128.5 s | 58.8 s | 133 |
| Fix: as above, terrain only (this branch) | 110.0 s | 160.6 s | 75.5 s | 131 |

#253's time to join the town was consistently 2–2.5× the pre-#253 runs, and removing the clip alone undid it, so the all-rooms loop was the regression. With the fix, the join time is back inside the pre-#253 range. An earlier fix run made while the unit suite was running (328.8 s) is excluded as contaminated.

Visual: in Chromium with Metal, Steak 48, Dior and Moreau show their own floors with no pavers, and the deferred floor textures arrive. One capture caught the first deferral attempt leaving floors as flat swatches (three.js cannot grow immutable storage); fixed and covered by the deferred test.

Unit: `node --test` on the three interior and clip test files gives 11 of 11. `pnpm test` gives 2648 (before the guard and deferred tests were added); rerun after rebase.

## Gaps

- SwiftShader is not Mesa: absolute times are far slower than CI, so only the relative comparison counts. The hosted email-access step is the acceptance signal.
