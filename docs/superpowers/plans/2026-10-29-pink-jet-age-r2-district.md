# Pink Jet-Age R2 slice 1: opt-in District facades (#740 under #738)

## Objective

Make Pink Jet-Age an opt-in, render-only finish for the original District's generic facade kit, street furniture and storefront benches. The default classic look must stay byte-identical. The reference-photographed frontages keep their real look; that is pending Val's confirmation, so it is implemented conservatively.

- Task: `pink-jet-age-r2-district-optin`
- Owner: `claude:cody-pja-r2-20261029`
- Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r2`
- Branch: `feat/pink-jet-age-r2-district-optin-20261029`
- Base: `39a5f302` (main after #758, R3).

## Files owned

- `preview/src/district-kit-finish.js`: the mapping table; new.
- `preview/src/district.js`: the finish threaded through the facade table, signs, ceramic and benches.
- `preview/src/street-furniture.js`
- `preview/src/main.js`: the same `cityKitFinish` passed to furniture and benches; the district finish exposed in `__riverSpatialStream`.
- `preview/e2e/pink-jet-age-routes-plan.mjs`, `preview/e2e/pink-jet-age-routes.mjs`: Route C District cameras and a District finish check.
- `preview/tests/district-kit-finish.test.js` (new) and `preview/tests/pink-jet-age-routes.test.js`
- `docs/city-kit.md`

## Mapping (pink-jet-age)

| Slot | Classic | Pink Jet-Age |
| --- | --- | --- |
| Cut-stone ceramic (walls, cornices, surrounds) | `RETRO.ivory` #ede2c9 in the shader | ivory #F7F1E8; second program key `-retro-ceramic-v1-f7f1e8` |
| `dark`: mullions, transoms, generic door frames, pulls, awning rods | deep teal | chrome #BCC5C8 |
| `bronzeFrame`: glazing frames | brass | chrome |
| Speed lines (3 per run) | brass (`bronzeFrame`) | pink #F486A1, a clone in the same batch |
| `bulkhead`: fascia and parapet band | deep teal enamel | chrome enamel |
| Kickplates under glazing | deep teal (`bulkhead`) | pink; a physical clone, +1 draw |
| `upperGlass` | teal, opaque and reflective | mint #BFE2DE; same opacity, metalness and clearcoat |
| `reveal` | #1e2120 | ink #24242A |
| `plant`: rooftop units | #b9bab6 | chrome |
| `canvas`: awnings | teal | ivory |
| Awning valance | teal | pink; a clone in the same batch |
| `planter`, `hedge` | porcelain, #31543d | ivory, garden #4A6A55 (generic sites only; none are published) |
| Generic sign | teal plaque, brass keyline, ivory ink | ink plaque, pink keyline, ivory ink |
| Street lamp columns, planter bands, bins | deep teal | chrome |
| Lamp orbital ring, collar, planter rim | brass | pink |
| Cast-stone planters and lamp discs | porcelain | ivory |
| Storefront bench frames and posts | deep teal | chrome |
| Storefront bench slats | `RETRO.ivory` #ede2c9 | ivory #F7F1E8 |

Kept classic:
- Reference frontages: their materials, door pulls and rails, the Harry Winston door, thresholds (a classic `bulkhead` copy, +1 draw) and entrance planters and hedges.
- Named-venue gold, navy, wood and ceramic; storefront glass; interiors and lights; roofs, green roofs, roads, sidewalks and tactile paving.

## Checks and results

- **Classic identity probe** (`.runtime/pink-jet-age-r2/signature.mjs`, ignored). It hashes every mesh's geometry, matrices, material fields, program key and instance colours.
  - At base `39a5f302`, before the edit: buildings 401 meshes `28ea2238…`, furniture 106 `13c95373…`, detail 10 `3a77144d…`.
  - After the edit, with no option, `classic` and `neon`: identical hashes.
  - Pink: 403 meshes (+2), furniture and detail at the same mesh counts.
- **Pink share:** 388 of 28,965 District parts (1.34%).
- `node --test preview/tests/district-kit-finish.test.js`: 8/8.
- `node --test preview/tests/pink-jet-age-routes.test.js`: 9/9.
- `pnpm run verify`: see the PR.
- Browser captures of Route C, classic and pink at day and dusk: see the PR. Folder `.runtime/pink-jet-age-r2/<timestamp>/`.

## Gaps

- The visual sign-off and Val's reference-facade decision are pending.
- Not run: two-client walk, reconnect, the low-quality fallback journey, and target-GPU performance.
- Sidewalks and plazas are not restyled in this slice: paving, crossings and tactile warnings keep their safety colours.

## Next step

Draft PR. After review: Val confirms the reference decision, then the next slice either restyles reference-adjacent kit or extends to green roofs and the reference landscape.
