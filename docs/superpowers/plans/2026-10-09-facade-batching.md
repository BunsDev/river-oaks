# Facade batching: shared sign pages and shared finishes

## Objective and authority

The user approved the optimization plan: sizing signs physically (shipped with the storefront change #201), then this pass:
- pack signs onto shared texture pages
- share plain-colour materials

A per-block file split may follow later. Branch `perf/facade-batching` is stacked on `feat/equinox-street-view` (#201), worktree `.worktrees/river-oaks/facade-perf`.

## Changes

- **Shared sign pages:** `reference-facades.js` packs every lettered sign, grouped by finish, onto shared 2048-wide pages, each trimmed to the rows it holds.
  - An 8-texel gutter surrounds each sign; opaque signs bleed their edge into it.
  - Each finish draws as one merged mesh per page.
  - The per-sign materials are released before they're ever drawn.
  - Sign canvases now cap at 2032 wide (a page less its gutters).
- **Shared finishes:** `district.js` regroups plain-colour batches (no maps, glow, transparency, cut-outs, breakable glass, or special or reflection materials) by finish and geometry.
  - Each finish gets one white material; every box keeps its colour as an instance colour.
  - The rule is `material-finish.js`'s `finishKey`.
- **Tried and dropped:** applying the same rule to the boutique interiors merged nothing, because each building's plain materials all have distinct finishes, so it was removed.

## Results (facade fixture, against #201)

| | #201 | This branch |
|---|---|---|
| Overview draw calls | 1077 | 959 (−11%) |
| Equinox draw calls | 522 | 484 |
| Saint Bernard corner draw calls | 444 | 412 |
| Kettering draw calls | 939 | 851 |
| Sign meshes | 128 | 17 |
| GPU textures | 116 | 51 |
| Materials | 267 | 189 |
| Separate box meshes | 445 | 416 |

- **Texture pixels:** 23 → 30 Mpx. The sign pages hold 19 Mpx against 14.6 Mpx of individual canvases, the cost of gutters and row waste. That's still far below main's 51 Mpx.
- **Pixel comparison against #201:**
  - 11 fixture views, including the registered Street View stations.
  - Under 0.1% of pixels differ by more than 8 levels in street views, 0.3% in the overview. All of it is draw-order and shadow noise.
- **Frame cost, interleaved A/B:**
  - Vsync off, 6 rounds × 40 frames per view, each render forced to complete.
  - Medians: overview 7.6 → 7.2 ms, Kettering 7.1 → 6.9 ms, Equinox 5.0 → 5.2 ms, Davidoff 5.1 → 5.1 ms.
  - An M3 Max isn't draw-call bound, so savings should show more on weaker GPUs. That isn't measured.

## Checks

- [x] `node --test preview/tests/reference-facades.test.js preview/tests/material-finish.test.js`: 15 pass. New tests cover page packing with gutters and the finish rule (shared, excluded, special).
- [x] `npm test` 2510 pass, 0 fail (1 skipped); `npm run build`.
- [x] Experience journeys passed:
  - reference-facades (each texture disposed exactly once)
  - storefront-lighting, via a temporary copy that ignores the voice bridge's 502s (doorway glass check included; the copy was deleted)
  - contextual-first-visit, street-level, experience, hud-and-quality
- [x] `npm run verify` (core) passed: server 276 pass (102 Redis-only skips), desktop 9, Python 141.

## Next step

Merge #201 first, then retarget this PR to main.
