# Plant diversity ledger (2026-10-11)

- Objective: replace the single repeated planter planting with seeded, layered
  River Oaks District species mixes (lane planters and the Harry Winston bed).
- Branch/worktree: `feat/plant-diversity`, `../river-oaks-plant-diversity-20261011`.
- Files owned: `preview/src/planting-palette.js`, `preview/src/procedural-plants.js`,
  `preview/src/landscape-models.js` (planter and reference-bed builders),
  `preview/src/reference-planting.js` (bed kinds, `winstonBedPlants`),
  `preview/src/street-furniture.js` (planter mulch slab only),
  `preview/tests/plant-diversity.test.js`, `docs/vegetation.md`.
- Not touched: sidewalks, pedestrian network, street profile, paver textures,
  tree placements, GIS/vegetation data, assets.
- Checks: `node --test preview/tests/plant-diversity.test.js`, `pnpm test`,
  `pnpm run build`, isolated WebGL fixture screenshots before/after (scratchpad, not committed).
- Gaps: no human visual sign-off; the live-town camera was not framed on a planter
  (fixture views only); draw calls rise slightly at planter views; no target-hardware frame timing.
- Next step: parent session reviews screenshots, pushes and opens the PR.
