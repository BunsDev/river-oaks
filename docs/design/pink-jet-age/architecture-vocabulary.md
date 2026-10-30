# Pink Jet-Age architecture vocabulary

Status: increment 1 (Gardens) implemented behind the `pink-jet-age` finish; consumer rollout
planned below. Epic #738, package R3 #741, follow-ons R2/R4/R5/R6.

## Why

R1–R4 changed **colour** (materials, trims, uniforms). Val's review of the Gardens route on
2026-10-29 (a01 arrival, a02 facade, a03 entrance hall, a05 Floor-4 skywalk, a07 roof seat,
a08 pergola) found the buildings still read as boxes: flat glass slabs, a stone block on each
roof, flat timber canopies, a slatted pergola and an empty white hall. Optimistic retrofuturism
is carried mostly by **form**. This vocabulary adds that form without breaking the world contract.

## Research basis and limits

The web tools were not available in this session (search and fetch were both refused by
permissions), so this note cites no external sources. The vocabulary rests on the epic's
approved direction ("rounded canopies, gardens, clear social spaces", #738) and on the widely
documented traits of mid-century Googie and Streamline Moderne:

| Trait | Where it appears in this vocabulary |
| --- | --- |
| Saucer and disc roofs, hovering over a smaller volume | `saucer` crown over each roof headhouse |
| Upswept, cantilevered "boomerang" canopies with no visible support | `boomerang` entrance wings |
| Rounded corners, horizontal speed lines (Streamline) | `rounded-rect` headhouses, pink band, bullnosed slab bands |
| Parabolic arches and vaults | `parabolic-arch` pergola ribs |
| Tapered pilotis, slender columns wider at the head | `tapered-column` pergola posts |
| Atomic and starburst ornament | `starburst` hall chandeliers |
| Ring and halo light fixtures | ring lights in the halls and under each saucer |
| Ribbed tube structures (jet bridges, monorail stations) | `hoop` frames over skywalks B12 and B23 |

A human design pass with real references is still open. It should check proportions,
especially saucer reach, canopy rise and vault crown, against period precedents.

## Contract rules every form obeys

The source world is authoritative (#506 contract, #511 finish rules). A form may only sit:

1. inside a published obstacle, headhouse or suite partition;
2. in the facade line (0.2 m inside a plate edge);
3. in the air above body clearance (2.45 m body + 0.3 m headroom) over any walkable surface;
4. inside a tower silhouette, never above `headhouseTop`, and never over a roof planting bed;
5. inside a ground building's declared height (café 4.8 m, pergola 4.2 m), i.e. its flight volume;
6. never in a skywalk portal, terrace door or entrance opening.

`preview/tests/garden-campus-jet-age.test.js` samples every triangle against these rules.
Mutation checks broke five rules one at a time: hoop legs in the deck, saucer over a bed,
canopy into the slab band, chandelier at head height, pergola above its height. Each one failed.

Changes that need a **contract decision** (not made here): curved glass corners, which would
move the glazing line into suites and galleries; masts or finials above `capZ`, which would change
the flight volumes; a raised pergola vault; reshaped floor plates.

## The vocabulary (reproducible assets)

- Source of truth: `shared/city-kit/jet-age-forms.js`, pure and deterministic, version
  `jet-age-forms-v1`. Each form is a function of its parameters and returns metre point lists.
- Three.js builders: `preview/src/jet-age-forms.js` (prism, lathe, boomerang extrusion, tube,
  ring, starburst) plus `mergeJetAgeParts`, which costs one draw call per material.
- Regenerable sheet and manifest: `node scripts/jet-age-forms.mjs` writes
  `jet-age-forms.svg` and `jet-age-forms.json` here; `--check` fails when they are stale.
- The manifest digests are pinned in `preview/tests/jet-age-forms.test.js`. Changing a
  profile means bumping the version and re-pinning, with a note.

## Gardens increment (implemented)

| Place | Before (classic boxes) | Pink Jet-Age forms |
| --- | --- | --- |
| Roof headhouse ×3 | limestone block, bronze cap, lantern line | rounded-corner ivory volume with the door bay kept, pink band, elliptical chrome saucer, ring light under the rim |
| Entrance canopies ×4 | flat timber slab, bronze edge, pink inlay | upswept boomerang wing, pink tube leading edge, glow line beneath |
| Skywalks B12, B23 | glass guards only | 13 chrome hoops, legs in the edge zones, crowns over the deck |
| Social pergola | timber posts, flat slats | 11 tapered chrome pilotis, 19 parabolic ribs (crown at 4.2 m) |
| F1 halls ×3 | empty white hall | starburst chandelier with glow beads, field of ring lights |
| Slab bands | square ends | bullnose at every plate corner (76) |

Budget: 220 parts, about 34.7k triangles, +4 draw calls (merged per material), +3 materials,
and the flat canopy inlay removed. Classic and `jetAgeForms: false` (colour only) are unchanged.

## Rollout plan (next increments)

1. **R4 Commons/Heights (city kit):** reuse the same forms in `preview/src/city-kit/render.js`
   detail batch: saucer kiosks on plazas, boomerang shop canopies (replacing R1 increment 2's
   rounded noses), stadium sign plates, pilotis arcades on gallery fronts.
2. **R2 District:** boomerang canopies and rounded fascia corners on the original blocks;
   starburst pylons only where a block's flight volume already covers them.
3. **R5 Eastern neighbourhoods/terraces:** hoops on the terrace walkways; vaulted bus-stop
   shelters within the streetscape kit's envelopes (coordinate with `neighborhood-584-586`).
4. **R6 Interiors:** ring-light coffers and starburst fixtures in the fit-out; rounded
   reception desks inside the furniture footprints.
5. **Contract proposals (needs Val):** curved glass corners, a raised pergola vault, crown
   masts above `capZ`. Each needs a contract revision with collision and flight updates.

## Acceptance

Automated rules and budgets pass locally (see the task ledger). Visual acceptance needs matched
day/dusk captures on the same eight Gardens cameras, plus Val's in-game review. Browser
automation is not human accessibility acceptance.
