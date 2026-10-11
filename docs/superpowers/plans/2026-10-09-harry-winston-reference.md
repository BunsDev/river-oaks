# Harry Winston frontage and planting

Objective: recreate the supplied street-level Harry Winston facade and review local planting/topography against available street imagery. Browser Three.js runtime; base 22d0043. Worktree river-oaks-harry-winston-20261009, branch codex/harry-winston-reference-20261009. Canonical dirty work and prior sign-in work preserved.

Reference REF-HW-01: user supplied Google Street View screenshot (2025 watermark), unknown lens/camera/survey heights; qualitative architectural/planting reference, not redistributable texture. Official location confirms Suite B160, 4444 Westheimer. Requested additional Street View link asynchronously. No claim of pixel-perfect or surveyed reproduction without calibrated matching views.

Observed: pale horizontal limestone courses; two stories; five narrow upper bays with navy monogram awnings and iron balcony guards; four ground display bays flanking a recessed round-arched central entrance; black/brass entrance grille; floor/cornice bands; large tree to camera right; low clipped shrubs, grasses and purple ground cover in a raised angular bed. Inferred dimensions to be recorded separately.

Scope: owning reference facade renderer and plan, location-specific planting if supported by current data, focused geometry/route regressions and browser capture; exact file ownership pending source inspection. Preserve mapped footprint, entrance, server collision and terrain source.

Checks: baseline/updated reproducible captures, focused geometry tests, physical entry/exit, terrain/planting provenance and placement review, npm run verify. Full/Redis/native/live auth and human acceptance separate. Status: inspecting.

## Delivery evidence

Implementation and comparison are in `docs/level-design/harry-winston/reference-scene-comparison.md`. Owned files now include the dedicated facade and reference-landscape/planting modules, facade plan/district integration, local foliage/tree/grate selectors, shared watering coordinates, focused tests and the existing browser capture/traversal harness. No canonical/source data or sibling worktree edits.

Verified: 27 focused tests; 21 two-client threshold route legs; shared sit-and-water; 70 canvas texture disposal checks; baseline/updated metadata comparison; screenshots; `npm run verify` core passed; `git diff --check` passed. The initial harness runs exposed missing fixture cookies and a dev-page reload while source was being edited; corrected cookie setup and reran after source settled. No production auth changed.

Remaining: exact photo-level acceptance (unknown camera, approximate materials/species and topography), exhaustive canopy mesh intersection checks, target FPS, full Redis/native/live-auth/human acceptance. The final handoff must not describe this as pixel-perfect. Changes remain uncommitted. Next: review the reference study, refine from exact Street View views if supplied, then commit/PR only when requested. Do not archive/remove this worktree with undelivered changes.
