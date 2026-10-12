# Explore destinations UI (2026-10-12)

**Objective:** make the Places panel's destination explorer sleek and modern. Val asked for it on 2026-10-12. The scope is the rail entry and the district atlas dialog. Every id, role, `aria-label` and `data-place-id` that the journeys rely on stays unchanged.

**Owner:** river-oaks-c2. **Branch:** `feat/explore-destinations-ui`. **Worktree:** `river-oaks-explore-ui-20261012`.

## What changed

- **Categories:** destinations carry their store's category. Every meeting spot is a store's frontage, so the 30 spots now browse as Shopping & culture 15, Dining 6, Jewelry & accessories 5 and Beauty & wellness 4. Before, they all read "meeting spot". The grouping moved into `store-categories.js`, which the district directory now shares.
- **Atlas:**
  - Filter chips per category, with live counts and `aria-pressed`, and "6 of 31 destinations" style results.
  - A search field with an icon and a live placeholder ("Search 31 places").
  - Segmented tabs with count badges and a round close button. The accessible name "Close map" is kept.
  - An empty state with a "Show all places" reset.
- **Destination rows:**
  - Cards with a category icon tile in the category's colour (bag, fork and knife, gem, sparkle; a flag for arrival, a bookmark for landmarks).
  - The category as the row's label.
  - An action-coloured "Go →" pill and a quieter overflow button.
- **Map side:** legend entries as chips, a primary "Go here" and secondary "Copy link"/"Clear" pills, and a softer hint.
- **Rail:**
  - A "You're at …" location pill.
  - An "Explore destinations" launcher card showing the live count ("31 places · search, save and go").
  - Lighter styling for the legacy storefront directory.
- **Phones:** a shorter map, a one-row scrolling legend and filter row, and compact map controls. The tabs, search and filters show on the first screen.
- **Stylesheet:** one consolidated `places-guide.css` replaces the two stacked layers it had. It's built on the HUD tokens (light on `:root`, dark on `:root[data-theme=dark]`; no `light-dark()`). It has a short entrance animation, and reduced-motion and reduced-transparency fallbacks. Icons are CSS masks of `data:` SVGs, which the CSP allows (`img-src` includes `data:`).

## Checks

- **`pnpm test`:** 2651 passed, 1 pre-existing skip. New `places.test.js` case: every storefront destination browses under its store category, and arrival has none.
- **`pnpm run verify` (core):** passed.
- **`pnpm run build`:** the dark category tokens survive as a `:root[data-theme=dark]` block in the built CSS.
- **Journeys on this branch:** places, places-guide, destination-minimap, rail-navigation, contextual-first-visit, store-intro, ui-improvements, hud-and-quality, sidebar and ui-polish all pass.
  - `places-guide` now also checks that the Dining filter shows exactly the Dining places, with `aria-pressed`, and that "Show all places" clears search and filter.
  - `destination-minimap` failed once on unmodified `main` under machine load, then passed here.
- **`ui-polish` fix (journey only):** after Meet, a store's first-visit intro hides the HUD on `main` too; a probe saw it open with `store-introducing` on the body. The journey's close-control check raced the intro, and this branch lost the race. The journey now skips an intro if one starts, then checks; it passed twice in a row.
- **Before and after:** `places-guide` screenshots of the rail and the atlas, light and dark, at 1440 and 390 px wide, are kept outside the repo in `~/worktree-backups/river-oaks-workplace-20261011/explore-destinations-ui/`. The before set was regenerated from `0983a49`, the last `main` before #263, after the first copy was lost.
