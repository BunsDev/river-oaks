# The Gardens finish pass (#511): sources and rebuild receipt

## Sources

The finish uses no downloaded, generated or imported asset. Every part is procedural
geometry or an existing repository material, built at district load from #506's contract
([`shared/garden-campus-layout.js`](../../../../shared/garden-campus-layout.js)).

| Part | Source | Licence / provenance |
| --- | --- | --- |
| Boxes (bands, fins, copings, planters, canopies, furniture, luminaires) | `THREE.BoxGeometry` instances in [`garden-campus.js`](../../../../preview/src/garden-campus.js), dimensions from [`garden-campus-finish.js`](../../../../preview/src/garden-campus-finish.js) | authored here |
| Limestone | `physicalSurface('stone', …)`, the green-roof path parameters ([`green-roofs.js`](../../../../preview/src/green-roofs.js)) | existing `preview/public/assets/materials/stone-*.jpg`, see [`sources.json`](../../../../preview/public/assets/materials/sources.json) |
| Platform grass | `physicalSurface('grass', …)`, the district ground's parameters ([`main.js`](../../../../preview/src/main.js)) | existing `grass-*.jpg`, same receipt |
| Paths | `paverSurface()` ([`materials.js`](../../../../preview/src/materials.js)) | procedural district paver ([`paver-textures.js`](../../../../preview/src/paver-textures.js)) |
| Perennials | `buildProceduralPlants` ([`procedural-plants.js`](../../../../preview/src/procedural-plants.js)), species from [`planting-palette.js`](../../../../preview/src/planting-palette.js) | authored procedural parts, existing |
| Ornamental grass | `buildRoofGrasses` ([`roof-grasses.js`](../../../../preview/src/roof-grasses.js)) | authored procedural, existing |
| Foliage clumps, trunks | `IcosahedronGeometry` (detail 0 and 1), `CylinderGeometry`, coloured per instance in [`garden-campus-planting.js`](../../../../preview/src/garden-campus-planting.js) | authored here |

Placement is deterministic: every random draw is seeded from its position
(`seedFromPosition`, `plantingRandom`), so the same contract always builds the same campus.

## Rebuild and capture

- Unit checks: `node --test preview/tests/garden-campus-finish.test.js preview/tests/garden-campus-district.test.js preview/tests/garden-campus-layout.test.js`.
- Furnishings: the 67 terrace, roof and ground finishes #511 proposed are now the contract's
  own `GARDEN_CAMPUS_LAYOUT.furnishings` (#506 layout 3.2), validated there. The proposal file
  and its generator are retired; the unit checks draw them from `campusLevels()`.
- Matched views: `node preview/e2e/garden-campus-render-views.mjs both`. Writes
  `output/playwright/garden-campus-render-views/`. Cameras: the contract's five plus seven
  finish cameras ([`garden-campus-render-common.mjs`](../../../../preview/e2e/garden-campus-render-common.mjs)).
  Profile: 15:00 and 18:30, Smoothest, 1280x800 at DPR 1, interface hidden.
- Resources: `node preview/e2e/garden-campus-render-resources.mjs garage=garage gardens=gardens main=garage@<origin/main copy>`.
  Writes `output/playwright/garden-campus-render-resources/result.json`. The run interleaves
  the arms, with vsync off.

Both runners take the shared browser lock and start their own loopback fixtures.
