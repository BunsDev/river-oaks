# IPIC Tuck Room from IMG_9756–9757 (photo review P13, P14)

- **Task:** `ipic-tuck-room-photo` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/ipic-tuck-room-photo-20261018` in `../river-oaks-ipic-tuck`, from main `74f9414a`.
- **Decision:** Val chose all four photo areas on 2026-10-18 and authorized merging this one to main.

## Change

- **P13 (`ipic-plan.js` `IPIC_BAR`, `IPIC_BACK_BAR`; `ipic-interior.js`):**
  - **The island bar.** Its counter rings a lower service well, open at the south-east corner for the
    bartender. The collider follows the counter top (a 3.8–5.4, d 21.05–24.95).
  - **The back bar.** It starts at a 6.28, leaving a 0.88 m aisle behind the island. It has two amber wine
    fridges with bottle shelves between and above them.
  - **The rack.** A two-tier black steel rack hangs from the ceiling over the island. Two rows of 31 wine
    glasses hang upside down beneath it, and four troughs of plants sit on top.
  - Stools are unchanged; they already had backs.
- **P14:**
  - **Pothos.** Five timber beams under a dense pothos canopy, with strands hanging from each and a string of
    lamps along every beam. No leaf over walkable floor is below 2.45 m (the tallest accepted body). Over the
    island the strands stop above the rack's plants. Leaves are placed by a seeded random, so exports repeat.
  - **Planters.** The slab leaves (T2c's foreground) are now broad, double-sided leaf cards along each stem.
    They stay within the old leaves' reach, so the agreement test's foliage allowances are unchanged.
- **New materials:** `pothos`, `black-steel`, `stemware`, `wine-fridge`. `hanging-greenery` is now
  double-sided.

## Checks

| Check | Result |
| --- | --- |
| New tests, written first: an island with an aisle and a well; a rack with glassware and plants; pothos coverage and headroom | Failed first (0.68 m aisle, no stemware, no pothos). Two fixes followed. A test bug: 10 cm sampling stepped over the glass rows. A model bug: the canopy leaves stood on edge because the helper pitches after yawing. All pass now. |
| IPIC, darts, room-exit and contract tests | 82 pass, 1 Redis skip; review data unchanged |
| Exports, Blender and `ipic-photo-views.mjs` (Metal) | Passed: 70 meshes; T1–T3 recaptured at `0c38119a` with no errors. T2c shows the island, glassware rack, fridges and pothos canopy as in IMG_9756–9757, and the planters read as leafy plants. |
| `node preview/e2e/ipic-runner.mjs` | Passed 8 checks |
| `pnpm run verify` | Agent 116 and preview 3409 passed. Server: 750 of 753 passed. The 3 failures were timing tests: `connection-rotation` hand-over, `voice-reconcile` departure grace, and `office-world-lifecycle` publication retry. They failed at a load average of 387–425, from other sessions' Rust builds and headless browsers, with swap nearly full. Alone, at the same load, those three files passed 16 of 16. Hosted CI runs the full suite before the merge. |

## Gaps

- The photo's island is longer and has a bartender inside; ours has no staff at the bar.
- The back wall's TVs and booth seating behind the bar are not modelled.
