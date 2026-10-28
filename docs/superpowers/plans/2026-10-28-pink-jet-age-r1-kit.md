# Pink Jet-Age R1: shared materials, rounded kit and reversible style contract

- **Issue:** #739 (package R1 under epic #738)
- **Task id:** `pink-jet-age-r1-kit` (live register)
- **Owner:** `claude:cody-pja-r1-20261028`
- **Branch:** `feat/pink-jet-age-r1-kit-20261028`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r1`
- **Baseline head:** `36e906b2ea0cfe0a301eff19eb73ff8e1709361a` (fetched `origin/main`, 2026-10-28)
- **Authorization (Val, 2026-10-28):** land automatically once all gates and review
  pass; ping only for visual/human acceptance. Parallelism after R1 interfaces land:
  as wide as the browser queue allows.

## Objective

One reusable pink-led art system (TypeSafe pink #F486A1 leads; ivory, mint glass,
restrained chrome, garden green and ink as proposed semantic roles). It must work
through the existing city-kit and recipe architecture without new draw-call
multiplication, saved-identity changes or earlier-revision drift. Coordinate with
#584 (city kit) and #585 (deterministic recipes); do not create a second kit.

## Ownership and coordination

- `neighborhood-584-586` (codex, **blocked**) owns `shared/streetscape-kit.js`,
  `shared/neighborhood-blocks.js` and `preview/src/streetscape-kit.js`. R1 does not
  edit those files.
- `destination-slice-584-586` (retired, PR #611) delivered `shared/city-kit/`,
  `preview/src/city-kit/`, `config/destinations/` and `scripts/destination.mjs`.
  R1 extends that seam.
- `gardens-pink-glass` (retired, PR #610) already tinted the Gardens glazing pink in
  `preview/src/garden-campus.js`. Reconcile it; do not duplicate it.

## Plan

1. Read `docs/city-kit.md`, `shared/city-kit/`, `preview/src/city-kit/`, the
   material callers, recipe locks and tests. Pick the style/revision seam.
2. Inventory materials, textures, meshes and shaders, and capture a fixed
   source/quality baseline (R9 baseline).
3. Add regressions for revision stability, deterministic recipe overrides, material
   reuse and teardown before any visual change.
4. Add the minimum rounded-form vocabulary: canopy/fascia, shallow fin, capsule sign,
   porthole, pedestal furniture, ring light. Use shared materials, instancing and
   low-tier fallbacks.
5. Build a showcase, run matched captures, measure resources, document interfaces
   for consumers (R2–R8), then land.

## Checks

- Focused city-kit and recipe tests
- `pnpm run verify`
- Matched fixed-camera and resource captures across quality tiers
- Applicable browser gates through the shared browser lock

## Chosen seam (increment 1)

A render-time **finish**, not a new style, kit version or content revision.

- `shared/city-kit/catalog.js`: `PINK_JET_AGE` (named roles), `KIT_FINISHES`
  (`classic` is empty; `pink-jet-age` recolours slots using `color`, `roughness` and
  `metalness` only), and `kitFinish()`.
- `preview/src/city-kit/render.js`: `buildCityKit(plan, { …, finish })` and
  `createMaterials(finish)`. Slot and material names are unchanged, so batching, draw
  calls and material counts are identical. `userData.finish` is recorded on the
  group and on every material.
- Why not a new style or kit version? Styles are drawn by the seeded assembly, so
  changing them would change plan hashes and every committed lock. `content_revision`
  is a strict geometry/version gate in every `*-world.js`. A finish touches neither,
  and reverting it means omitting the option.
- Review: the fixture takes `?finish=`; `city-kit-review.js --finish=classic,pink-jet-age`
  renders matched pairs.
- Rounded-form vocabulary (canopy nose, fin, capsule sign, porthole, pedestal, ring
  light) is **increment 2**, as a separate task and PR (one task per PR branch).

## Results

- 2026-10-28: worktree created clean at `36e906b2`; register claim active; pickup
  comment posted on #738 (issuecomment-6477470013).
- 2026-10-28: `node --test preview/tests/city-kit.test.js` → 17/17 pass, 3 of them new:
  - finish table validity;
  - plans, locks, geometry and draw calls identical under `pink-jet-age`, with slot
    recolours applied (Commons and Yale);
  - full material and geometry release across classic ↔ pink switches.
- 2026-10-28: core `pnpm run verify` passed on `10ce1a47`. Committed, pushed and
  opened as draft PR #749.
- 2026-10-28, matched review 1 (`.runtime/city-kit/review-2026-10-28T18-58-18-924Z`):
  - resources: identical calls, triangles, geometries and textures in all 18 views;
  - **defect:** Commons Market Row showed no pink. The luxe styles use `steel-black`
    trim and a `bronze-satin` accent, and both had been mapped to dark or chrome;
  - **defect:** reflective glass read as saturated cyan.
- Fix: `bronze-satin` → pink lacquer; `glass-dark` → muted grey-mint `#7a9591`. New
  test: every storefront block has TypeSafe pink in its own facade detail. Mutation
  check: with the old mapping it fails on `bayou-market-commons/market-row`; with the
  fix, 17/17 pass. A looser first version, "any pink anywhere", passed on the old
  mapping and was replaced.
- 2026-10-28, matched review 2 (`.runtime/city-kit/review-2026-10-28T19-05-03-163Z`):
  - 18 views, 0 resource mismatches, 0 page errors or failed requests;
  - pink shows on canopies, fins and loggias on Commons, and on fascias and sills on Yale.
  - Core verify passed again: tooling 289/289, preview 4341 + 1 skip, server 1077 +
    283 Redis skips, desktop 127 + 5 skips, 0 failures.

## Visual notes for Val (not automated acceptance)

- Commons court loggia piers are fully pink. Pink leads strongly there.
- Limestone over the pavement map still reads as warm grey rather than ivory.
- Yale ground-floor kickplates are pink.

## Gaps

- Physical-device and human visual acceptance are Val's (not automatable here).

## Next step

Step 1: read the city-kit seam and inventory materials.
