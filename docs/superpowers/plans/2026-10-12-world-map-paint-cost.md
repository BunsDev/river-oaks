# Stop the district map repainting while it is open — 2026-10-12

**Objective:** #274 gave the district map a breathing halo, a turning selection
ring and a gliding arrow inside the same SVG as drop-shadow-filtered buildings.
SVG children are not composited, so while the map was open every animation
frame repainted the whole drawing, filters included, on GPU machines too. Two
related fixes are also in scope:
- reduced motion should stop the town gate's status bead;
- #281's software-rendering map overrides never applied.

**Branch / worktree:** `fix/world-map-paint-cost-20261012` in
`../river-oaks-map-paint-20261012`, a sparse checkout from `6d73a2c`. The disk
had 1.3 GB free, so there was no dependency install.

## Change

- `preview/src/world-map.js`: three layers.
  - The **drawing** (ground, grid, parcels, roads, buildings with their shadows)
    is one SVG that repaints only when the world or the selected parcel
    changes.
  - **Places and players** sit on a second, filter-free SVG above it
    (`.world-map-live`). Pointer events pass through to parcels.
  - **You and the chosen point** are HTML, placed with container-query units
    (`--x`/`--y` in `cqw`/`cqh`) and moved or turned with composited
    transforms. The breathing halo and the turning ring are compositor
    animations on HTML elements.
  - The element counts the journeys rely on are unchanged.
- `preview/src/world-map.css`:
  - Rules for the new layers.
  - The software-rendering overrides now carry the same
    `:is(#control-panel,.places-guide)` prefix as the base rules. Without it,
    the base rules' id made them win, so in software mode the buildings kept
    their shadows and the halo kept breathing.
  - Pseudo-elements are kept out of `:is()`, where they are dropped silently.
- `preview/src/multiplayer.css`: reduced motion now removes the status bead
  (`content: none`). The old `#multiplayer-status::after { animation: none }`
  was (1,1,1) against the bead rule's (1,2,2), found by river-oaks-c2.
- `preview/e2e/hardware-acceleration.js`: the software and GPU probes also
  read `.world-map-buildings` `filter` and `.world-map-self-halo`
  `animationName`.
- The `town-first-snapshot-stall` ledger notes that its map overrides only
  took effect here.

## Verification

- `node --test preview/tests/world-map.test.js`: 8/8.
- Bench: a page that serves `preview/src` with `python3 -m http.server`, using
  Playwright's Chromium with Metal and no Vite. The map was open with a place
  selected, refreshing every 500 ms while walking and turning, for 4 s:

  | | Paint events | Main-thread paint |
  |---|---|---|
  | main | 74 | 4.1 ms |
  | this branch | 24 | 1.1 ms |

  Screenshots match main in both themes.
- Computed styles, main → this branch:

  | Mode | Main | This branch |
  |---|---|---|
  | software rendering | buildings `drop-shadow`, halo `world-map-breathe`, ring `world-map-turn` | all `none` |
  | GPU | all kept | all kept |
  | reduced motion | halo and ring `none` | halo and ring `none` |
  | gate bead under reduced motion | `content: ""`, still animating | `content: none` |

- **Not run locally:** `pnpm test`, `pnpm run verify` and the browser
  journeys, including the edited hardware-acceleration probe (not in the
  hosted shards). The disk could not hold an install. Hosted Verify runs the
  core gate, `destination-minimap` and the places journeys.

## Next step

PR, then `pnpm run land` in queue order.
