# Pink Jet-Age R6 slice 1: opt-in IPIC lounge finish (#744 under #738)

## Objective

The first interior route under R6: an opt-in, render-only Pink Jet-Age finish for the IPIC
reception, lounge and Tuck Room. The auditorium stays as photographed. Classic stays the
default and is unchanged.

- Task: `pink-jet-age-r6-ipic-lounge` (live register)
- Owner: `claude:river-oaks-01 (483949)`
- Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r6`
- Branch: `feat/pink-jet-age-r6-ipic-lounge-20261030`
- Base: `a6f4b9c9` (origin/main, 2026-10-30)

## Files owned

- `preview/src/ipic-kit-finish.js` (new): the finish table.
- `preview/src/ipic-materials.js`: `createIpicMaterials({ finish })` applies the table.
- `preview/src/ipic-interior.js`: reads `options.finish`, else in a page `readFinishPreference()`.
- `preview/tests/ipic-kit-finish.test.js` (new).
- this ledger.

`preview/src/store-interiors.js` is not edited: the Cartier pilot task owns it. The builder
reads the visitor's preference itself, as the HUD (R8) and street (R1-R4) do; exports and
Node builds (no `document`) stay classic.

## Inventory (from the source, not the concept sheet)

Materials by zone in `ipic-interior.js` at `a6f4b9c9`:

- Auditorium (`section('Auditorium')`): confetti carpet, black, glass, glow, screen; recliners
  draw cognac `leather` and `timber`, which the lounge also uses.
- Reception, mural landing, lounge, Tuck Room, cinema corridor: everything else.

So the finish only touches materials the auditorium never draws, and leaves the shared
leather and timber alone.

## Mapping (pink-jet-age)

| Material (`m.<key>`, mesh name unchanged) | Classic | Pink Jet-Age |
| --- | --- | --- |
| `sofa` (lounge sofa) | olive brown #504638 | TypeSafe pink #F486A1 |
| `pillow` | oatmeal #b1a086 | ivory #F7F1E8 |
| `bronze` (lift doors, pendant bars, guardrail rods, throwing line, back-bar rail) | #a38758 | chrome #BCC5C8 |
| `red` (Tuck Room back-bar wall) | burgundy #692b2f | deep rose #8e2a4e |
| `plaster` (reception walls and coffers, well ceilings) | #b6ab98 | shaded ivory #d9cfbf |
| `carpet` (lounge; painted palette) | red ground, dark swirl | ivory ground [236,226,212], rose swirl [196,106,130]; flat #e3d6c6 |

Unchanged under every finish: leather, timber, marble, oak, stone, reception stone, rattan
cocoons, plants, glass, lamps, the auditorium, escalator steel and the yellow step edges.

## Checks and results

- `node --test preview/tests/ipic-kit-finish.test.js`: 5/5. Classic and an unknown finish
  build a deep-equal interior to the default (per-mesh geometry, placement and material
  fields); pink keeps every mesh, name, placement, light and the screen frame; only the
  listed materials change, and only in colour; the auditorium zone is identical.
- `node --test preview/tests/ipic-*.test.js`: 137/137.
- `pnpm run verify`: see the PR.
- Browser captures (classic vs pink, reception, lounge, Tuck Room, auditorium): not run yet.

## Gaps

- No visual sign-off. The plaster value and the carpet palette are first proposals.
- Not run: the IPIC journey, seated and third-person views in a browser, low-tier cost
  (expected none: no new material, texture or draw).
- Out of scope in this slice: offices, campus shared areas, World Studio templates.
- The reception and lounge are photographed real spaces. As with R2's reference facades,
  whether they should ever default to the pink finish is Val's decision; this slice is opt-in.

## Next step

Draft PR; capture matched views when the host is quiet; then the office/campus shared areas.
