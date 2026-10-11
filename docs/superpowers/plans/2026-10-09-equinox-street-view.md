# Equinox block from Street View

## Objective and authority

The user supplied six Street View screenshots and asked for the storefronts in them to be implemented as true references, matched as closely as possible and checked end to end. Afterwards, the user approved sizing sign textures physically in this same change. Branch `feat/equinox-street-view` on `origin/main` `0ff3742`, worktree `.worktrees/river-oaks/equinox-street-view`.

Files owned:
- `preview/src/reference-blocks.js` (the Equinox block)
- `preview/src/reference-facades.js` (sign canvases)
- `preview/src/district.js` (stepped mass)
- `preview/e2e/fixtures/facades.js` (registered stations)
- `preview/tests/reference-facades.test.js`
- `docs/storefront-reference-audit.md`

The Harry Winston block is out of scope: Codex has an undelivered branch rebuilding it.

## What changed

- **Le Colonial's wing:** the Kettering Drive end becomes Le Colonial's two-storey wing.
  - White tile, iron windows and French doors, lanterns, the iron marquise with its blue neon script.
  - A glazed veranda on gooseneck brackets that turns the corner, and the terrace.
  - The block's mass is stepped (`plan.steps`), so the tower rises only east of the wing and the wing has sky above it.
- **North lane, from the photographs:**
  - Three wide Equinox bays under a deep dark-bronze soffit with fans.
  - Five-pane windows with EQUINOX in metal letters.
  - The bronze pylon with vertical EQUINOX and the 4444 plaque.
  - The office lobby under its green-glass canopy, with the curtain wall coming down to it.
  - Davidoff of Geneva's two 3.5 m bays: the name band, orange rule, louvres and three-pane windows.
- **East lane:** Saint Bernard's red letters on a reclaimed-timber band, its shield sign on solid stone, three glazed bays under the soffit, and the steel-and-glass lane canopy.
- **Heights:** storeys from the registered photographs. Shop glass about 3.6 m, second-storey windows 6.9–11 m, podium cornice 12.78 m, curtain wall to 28 m.
- **Signs sized to the sign:** `letteringCanvasSize` gives 256 texels a metre, at least 64 on the short side, and at most 2048 × 1024, keeping proportions. Previously every sign had a 2048-wide canvas.
- **Vertical lettering:** the EQUINOX pylon is one vertical sign rather than seven.

## Registration

- The camera for each photograph was solved from known storey heights, giving the lens, pitch and distance with an RMS height error of 0.03 m or less. A symmetric edge-chamfer fit then refined it.
- Three stations are in the facade fixture: `sv-davidoff`, `sv-equinox` and `sv-saint-bernard`.
- Side by side at 1908 × 1146:
  - Davidoff's bays, pier, wing and veranda land within about 10 px horizontally, and the name band sits about 25 px high.
  - Equinox's pylon, letters, window and soffit land within about 15–20 px.
  - Saint Bernard's name, glass edges, shield, soffit and corner coincide.
- The three lane photographs are references only. Their foregrounds are the Harry Winston block and the paving, which are outside this change.
- Pixel identity is not achievable: lighting, people, vehicles, trees, the valet stand and window displays aren't modelled.

## Checks

- [x] `node --test preview/tests/reference-facades.test.js`: 12 pass. New tests cover:
  - the stepped wing (height, a ring inset by `WING_WIDTH`, flight height still 28)
  - `clipRing`
  - sign canvas sizes, with proportions kept
- [x] Facade fixture: the Equinox, Kettering, Saint Bernard corner and overview views render without page errors.
- [x] `npm test` 2507 pass, 0 fail (1 skipped); `npm run build`.
- [x] Experience journeys passed: reference-facades (texture disposal), contextual-first-visit, street-level, experience.
- [x] storefront-lighting failed only on the voice bridge's 502s, as it does on main. A temporary copy that ignores 502s passed, including the doorway check (one pane of storefront glass per door). The copy was deleted.
- [x] `npm run verify` (core) passed (receipt `.runtime/agent/core.json`):
  - preview 2507 pass (1 skipped)
  - server 276 pass, 102 Redis-only skips
  - desktop 9 pass
  - Python 141 pass
- [x] Render cost, facade fixture:
  - texture pixels 51 Mpx on main, 23 Mpx here (lettering about 63 → 15 Mpx)
  - overview draw calls 1030 → 1077, from the richer block, before the separate performance pass

## Limits

- Flight and walking still treat the block as 28 m everywhere (`building.size[2]`), so a flyer over the wing hovers above the tower's height.
- The district's lane paving is unchanged. Street View shows wide sidewalks where the model has asphalt lanes.
- Human visual review and Safari or Firefox were not done.
