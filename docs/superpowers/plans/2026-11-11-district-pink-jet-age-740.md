# Original District in Pink Jet-Age materials (#740, increment 1)

## Objective and authority

The repository owner asked on 2026-11-11 for the whole reskinned world to ship as the release,
with landing authorized once hosted checks are green (#738 decisions; release ledger
`2026-11-11-release-v030-pink-jet-age.md`). The Commons, Heights, Gardens, Ribbon and Five Rooms
already take Pink Jet-Age. The original District did not: its shell, storefront trim, street
furniture, rooftop lights and walk-in interiors were built from the earlier teal and brass palette.
This increment moves those colours to Pink Jet-Age roles. It changes no geometry.

## Source and ownership

- Base: `main` `a65a86a3a6357b4fa659ce72ae55cc0867e1be20`.
  Branch: `feat/district-pink-jet-age-740-20261111`.
- Written in a cloud checkout with no access to the live task register; no register claim was
  made, and `docs/project-management/tasks.json` is not edited.

## Changed behavior and files

New `preview/src/district-palette.js` names the District's roles from
`shared/city-kit/pink-jet-age.js`, following the mapping the city kit already uses under Pink
Jet-Age (`KIT_FINISHES`). Five modules read it in place of `retro-palette.js`:

| Module | Was | Now |
| --- | --- | --- |
| `district.js` tenant signs | ivory on a teal plaque, brass edge | ivory on an ink plaque, pink edge |
| `district.js` shell stone tint, planters, bench timber | warm ivory, porcelain | ivory |
| `district.js` dark frames, bench metal | deep teal | ink |
| `district.js` frame metal | brass | chrome |
| `district.js` upper glass | teal | the kit's muted grey-mint |
| `district.js` fascia bands and bulkheads, canvas awnings | deep teal, teal | pink |
| `district.js` flat canopies and cushions, entrance runners | deep teal, rose | the kit's warm rose |
| `street-furniture.js` lamp columns, cast stone, lamp canopies, lamp glow | deep teal, porcelain, brass, mint-white | ink, ivory, chrome, the kit's warm lamp glow |
| `district-fantasy.js` enamel, per-store accents, metal, glow | porcelain; teal, rose, mint, apricot; brass; mint-white | ivory; pink, rose, mint, blush; chrome; warm glow |
| `store-interiors.js` dark fixtures, white, stone | deep teal, ivory, porcelain | ink, ivory, ivory |
| `interior-luxe.js` terrazzo chips | teal, mint, rose, brass | pink, mint, rose, chrome |

Only `color` (and the lamp `emissive`) values change. Roughness, metalness, material count,
material names, batching keys, instance transforms, IDs and collision are untouched, so draw calls
and resources should not move.

Not changed: `retro-palette.js` stays for `east-garden-commons.js` and `bayou-heights.js`, where
it is the Classic base under their finish tables, and for `streetscape-kit.js`, whose sources are
recorded in the neighborhood kit snapshot. Those go with #913. The photographed reference
facades (`reference-facades.js`, `reference-blocks.js`) keep their authored look pending the
decision recorded in #740. The "home" sign plaque keeps its own colour.

## Checks

| Command | Result |
| --- | --- |
| `node --test preview/tests/district-palette.test.js` | 5 pass, 0 fail |
| `node --check` on the six changed or new source modules | passed |

Runtime: Node v22.23.4, no installed dependencies.

## Not run, and not known

- Every test that builds the District needs `three`, which is not installed here. `pnpm run
  verify`, the build and all browser journeys ran only in hosted CI.
- **Nobody has looked at this.** The mapping follows the approved kit roles, but no rendered
  frame, matched capture, night view or in-game review exists for the restyled District.
  Pink on fascia bands, bulkheads and awnings across thirty storefronts may read as too much;
  that is a visual judgement this increment cannot make.
- No depth, frame-time or draw-call measurement beyond what the hosted journeys assert.

## Rollback

Revert this increment. No IDs, saved data, protocol, geometry or baselines change.

## Next action

In-game review of the District by the owner. Then form (boomerang canopies, rounded fascia
corners) per `docs/design/pink-jet-age/architecture-vocabulary.md`, and the reference-facade
decision.
