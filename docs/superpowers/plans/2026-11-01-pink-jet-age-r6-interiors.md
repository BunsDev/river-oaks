# Pink Jet-Age R6: penthouse office and World Studio spaces, opt-in finish (#744)

**Task:** `pink-jet-age-r6-interiors-20261101` · **Branch:** `feat/pink-jet-age-r6-interiors-20261101`
· **Worktree:** `river-oaks-pja-r6-interiors` · **Base:** `9d139387` (origin/main, 2026-11-01)
· **Goal:** 2026-11-01 "run as described": land #788, #789 and #832 (authorized), then extend R6
to the interiors #744 still names without a kit finish.

## Objective

#744 asks for interiors that "feel part of the same future as the streets" through the current
owners, with no functional regression. After #789 (IPIC) and #832 (the workplace fixture), two R6
surfaces had no kit finish: Jevica's penthouse office (the only live office since 10-15) and World
Studio's furnished spaces (the four stock templates and every saved v1 document). The Gardens
campus, including its workstations and fit-out, already has one (`garden-campus-kit-finish.js`,
#741). This increment gives both remaining surfaces a render-only, opt-in Pink Jet-Age finish on
the same switch (`render-quality.js readFinishPreference`), with classic byte-identical.

## Reconciliation (what was actually there)

- **Penthouse** (`office-penthouse-furnishings.js`, `office-penthouse-graybox.js`): one material
  per finish name (travertine, rose-stone, wood, bronze, upholstery, graphite, SCREEN_DYNAMIC,
  foliage, organic, objects, wool, shade), with per-vertex tints (walnut, boucle, blush …) baked
  into cached asset geometry; the shell has its own eight materials. No finish hook. The palette
  test already pins TypeSafe pink to a vertex accent under 3 % and no material exactly pink.
  Classic is already warm ivory stone, rose stone, walnut and blush: the Jet-Age gap was the
  champagne bronze and black graphite hardware and the cool glass.
- **World Studio spaces** (`studio/space-scene.js`): documents name a finish per object from an
  eleven-entry catalog; the renderer draws the catalog. No finish hook. Generated-level interiors
  (`interior-scene.js`, the "preview finishes / apply preview" flow) are a separate authoring
  system with their own per-level finishes and are **not** touched here.
- **Screens:** the penthouse's eleven displays are SCREEN_DYNAMIC, idle dark glass by #362; the
  studio draws no screens. Nothing private can reach a surface through a finish.
- **Approved spaces pin the renderer.** `approved-spaces.js` records `corner-cafe@1` with Val's
  approval and the sha256 of `space-scene.js` and its furniture and material sources
  (`approved-space.test.js`). The first version of this change edited `space-scene.js`'s catalog
  and failed that pin in `pnpm run verify` (preview-tests, 1 of 5,124). Recording a new revision
  would claim an approval Val has not given, so the finish moved out of the pinned file: Studio
  applies it to the built scene (`applySpaceKitFinish`), approved spaces in town stay exactly as
  approved, and the pinned sources are byte-identical (asserted by the new test as well).
- **Hosted coverage:** `office-desk`, `office-visit`, `office-lift-ride`, `office-computer-embed`
  (preview experience shard), `world-studio`, `city-kit-studio`, `garden-campus-office`; all classic.

## Mapping

| Surface | Classic | Pink Jet-Age | Why |
| --- | --- | --- | --- |
| Penthouse furnishings `bronze` (lamps, reveals, pulls, rails) | champagne `#c7a676`, metal 1 | chrome `#BCC5C8`, metal .5, rough .3 | restrained chrome; fully metallic read as dark lines (workplace finding) |
| Penthouse furnishings `graphite` (chair frames, casters, display stands) | `#2c2a28`, metal .2 | brushed steel `#a3abae`, metal .5, rough .35 | technology at furniture scale, not black |
| Penthouse furnishings `shade` | `#f4eadc` | ivory `#F7F1E8` (glow unchanged) | |
| Penthouse shell `bronze` (mullions, sills, heads, guard rail, lift) | `#b08d57`, metal .6 | chrome, metal .5, rough .3 | |
| Penthouse shell `glass` (guard, terrace rails) | `#cfe3ea` | mint `#e3f3ef`, same opacity | |
| Penthouse shell `wall` (arrival core, back wall) | `#efe7dc` | ivory `#F7F1E8` | |
| Penthouse tints, stone maps, screens, floors, ceiling, treads | | unchanged | selective pink already authored; privacy; no new art |
| Studio `plaster` | `#e5dfd2` | ivory `#F7F1E8` | walls |
| Studio `brass` | `#bda36d`, metal .82 | chrome, rough .3, metal .5 | hardware |
| Studio `fabric` (default upholstery and rugs) | `#e6d8bd` | pale rose `#f2cfd6` | the selective pink; sage, linen, terracotta textiles stay |
| Studio oak, walnut, limestone, concrete, terracotta, sage, white, charcoal, glass, floors | | unchanged | wood and stone are in the vocabulary; charcoal stays dark technology |

## Files

- New: `preview/src/office-kit-finish.js`, `preview/src/studio/space-kit-finish.js`,
  `preview/tests/office-kit-finish.test.js` (6), `preview/tests/studio-space-kit-finish.test.js` (11).
- Wiring: `createPenthouseFinishes({ finish })` applies the table in place (the terrace's
  like-set clones inherit it); `buildPenthouseOffice(THREE, layout, { finish })` and
  `buildOfficeGeometry(…, { finish })`; `office-scene.js` and `office-world-scene.js` pass
  `readFinishPreference()`; the asset-preview fixture takes `?finish=`; exports stay classic.
  `applySpaceKitFinish(group, finish)` recolours materials still showing a listed classic entry
  (colour, roughness, metalness; textiles by colour, sheen highlight re-derived); `createStudioScene`
  applies the designer's preference (classic in Node). `space-scene.js` is untouched. `studio-template-stations.js` takes `STUDIO_FINISH`.
- Legacy one-room office: `buildWorkplaceOffice` gains its finish option in #832; the legacy
  path here passes none until #832 is on main (follow-up line after the merge).
- `docs/offices.md`, `docs/world-studio.md`: one paragraph each. No manifest or approved-space
  change: no pinned source is edited.

## Checks

| Check | Result |
| --- | --- |
| `node --test` new finish tests | office 6/6, studio 13/13 (incl. pinned sources unchanged) |
| Neighbouring suites (penthouse furnishings/graybox/scene/presentation, studio templates/document/levels, kit-finish-live, campus finish) | 132/132, 0 skipped |
| `pnpm run build` | passed (sign-in chunk isolation check included) |
| Penthouse fixture captures, both finishes, six views × noon/dusk (24 frames, Metal) | identical draw work: 73 calls, 91,144 triangles, 75 geometries, 8 textures in every view; build 85 ms classic, 77 ms pink; no page errors |
| Garden Office template stations, 3 presets × 6 stations, classic and pink (`STUDIO_FINISH`) | both passed, 18 frames each, no page errors (load 33–60). Pink differs only in walls, brass hardware and the default textile |
| `pnpm run verify` (core) | first run failed `approved-space.test.js` (pin, see above); after the fix passed: 6,653 tests, 0 failed, 291 core skips, 2026-11-01T10:32Z, load 31–56 |
| Hosted `preview` aggregate | pending (draft PR) |

## Gaps and owners

- **Visual acceptance** of the two value sets: Val (first proposal; captures in the PR).
- **Physical device, human screen-reader/keyboard/touch:** Val (#747); desktop captures are not
  device proof.
- **Generated-level interiors** (`interior-scene.js`) keep their own authored finishes; a kit
  finish for them is a separate decision because their finishes are user-authored data.
- **Legacy office finish line** after #832 lands.

## Next step

Draft PR against main, one evidence comment on #744, register update. #832 is on main
(`5ba4a3f0`): a follow-up passes the office finish to the legacy one-room builder too.
