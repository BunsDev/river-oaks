# Pink Jet-Age R3 slice 2: jet-age architecture forms for the Gardens

- **Issue:** #741 (package R3 under epic #738)
- **Task id:** `pink-jet-age-r3-architecture` (live register)
- **Owner:** `claude:cody-pja-arch-20261029`
- **Branch:** `feat/pink-jet-age-r3-architecture-20261029` from `origin/main` `c09cbabc`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-arch`
- **Authorization (Val, 2026-10-28/29):** land automatically once gates and review pass; ping
  only for visual/human acceptance. 2026-10-29 request: "the only thing that changed is the
  color … redesign the architecture to match the retro-futurism … reproducible assets and
  elements … for meaningful and seamless expansions."

## Objective

Change the Gardens' **shapes** under the `pink-jet-age` finish, not only their colours, while
keeping every source-contract fact (surfaces, supports, collision rects, flight volumes,
openings, levels, IDs, 6/7/6 storeys, B12/B23 only). Deliver a reusable, deterministic form
vocabulary that R2/R4/R5/R6 can adopt.

## Files owned

- `shared/city-kit/jet-age-forms.js`: pure vocabulary, `jet-age-forms-v1`
- `preview/src/jet-age-forms.js`: Three.js builders and the per-material merge
- `preview/src/garden-campus-jet-age.js`: Gardens placements (`CAMPUS_JET_AGE`)
- `preview/src/garden-campus.js`: forms wiring; skips the replaced boxes; `jetAgeForms` switch
- `preview/src/garden-campus-kit-finish.js`: `forms` role on the pink finish
- `preview/tests/jet-age-forms.test.js`, `preview/tests/garden-campus-jet-age.test.js`,
  `preview/tests/garden-campus-kit-finish.test.js` (colour tests scoped to `jetAgeForms: false`)
- `scripts/jet-age-forms.mjs`, `docs/design/pink-jet-age/{architecture-vocabulary.md, jet-age-forms.svg, jet-age-forms.json}`

## Design

See `docs/design/pink-jet-age/architecture-vocabulary.md`. Summary:
- headhouses become rounded volumes under a saucer crown with a ring light;
- canopies become boomerang wings;
- chrome hoops stand over both skywalks;
- the pergola gets tapered pilotis and a parabolic vault;
- each hall gets a starburst chandelier and ring lights;
- slab bands get bullnosed corners.

Classic and the colour-only switch (`jetAgeForms: false`) build exactly what main builds.
The switch is also the rollback lever.

## Checks and results

- Focused: `node --test preview/tests/garden-campus-jet-age.test.js preview/tests/jet-age-forms.test.js
  preview/tests/garden-campus-kit-finish.test.js preview/tests/garden-campus-finish.test.js` → 26/26.
- Mutation (`.runtime/pja-arch/mutate.mjs`, not committed): each of the five broken rules fails
  its test. The rules were hoop legs in the deck, saucer over a bed, canopy into the slab band,
  chandelier at head height, and pergola above its declared height. The canopy rule was
  missing at first, so it was added and re-checked.
- Asset stability: `node scripts/jet-age-forms.mjs --check` → clean.
- Core `pnpm run verify`: see results below.
- Visual: matched `pink-jet-age-routes.mjs` Gardens captures (classic vs pink) on the
  committed head, under the browser lock. See results below.

## Results

- 2026-10-29: worktree created at `c09cbabc`; register claim active.
- 2026-10-29: core `pnpm run verify` passed on the tree committed as `d3926495`, with one
  import-path edit (`three/examples/jsm` → `three/addons`, same module) made during the run
  and the focused tests rerun after it, 9/9. Results: tooling 289/289; preview 4655 pass,
  1 skip, 35 todo of 4691; server 1080 pass, 285 Redis skips of 1365; desktop 127 pass, 5 skip;
  Python 170 passed; gitleaks clean. Signed commit `d3926495`; draft PR #774.
- 2026-10-29: matched Gardens captures on `d3926495` (clean tree), under the browser lock:
  1280x800, sharp, a01/a02/a03/a05/a07/a08 at day and dusk. Outputs are in
  `.runtime/pja-arch/captures/{classic,pink}`, and both reports passed (`campusFinish`
  `pink-jet-age` on the pink run).
  - Pink vs classic: +9 to +32 draw calls and about +93k triangles per view. Shadow passes
    redraw the casters.
  - Frame p50 read 33 ms on a03/a07 in the pink run. A recheck flipped it (classic a07 33.3 ms,
    pink 16.7 ms) at host load 31–38, so it is vsync-quantised noise, not a measured cost.
  - Comparison page: `.runtime/pja-arch/compare/gardens-jet-age-compare.html`.
- Visual read (agent, not human review):
  - Strong: the roof (rounded headhouse, pink band, saucer brim) and the B12 skywalk hoops.
  - Moderate: hall ring lights. The starburst sits high, near the camera's top edge.
  - Weak: the boomerang canopy (0.45 m rise) reads only slightly; the pergola vault (22 cm
    rise inside the 4.2 m height) reads flat behind the climbers.
  - Unchanged: tower glass massing. Changing it needs a contract decision.

## Gaps

- No external design research: web tools were denied in this session.
- Visual and human acceptance still need Val.
- Pergola climbers were placed for the flat slats; with the vault they sit at most about 2.5 cm
  off the ribs. Check this in the captures.

## Next step

Core verify, signed commit, push a draft PR, matched captures, then land.
