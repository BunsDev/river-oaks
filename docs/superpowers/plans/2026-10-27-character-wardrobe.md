# Character Studio Phase 3: the wardrobe

Task `character-wardrobe-20261027`, branch `feat/character-wardrobe-20261027`, stacked on
#694 (`feat/character-recipes-20261026`).

## Objective

Val (2026-10-26) asked for tops, bottoms, dresses, suits and shoes in the Studio. On
2026-10-27 Val authorized Phase 3 ("proceed with your recommendations"), the pinned
MakeHuman download and a Blender install ("i approve of the Blender install").

The pinned CC0 pack has no separate tops, bottoms or dresses: 12 one-piece suits
(4 feminine, 8 masculine), 6 shoe pairs and 2 fedoras. The
recommendation taken: split every suit into a top and a bottom, so any top goes with any
bottom of the same frame, and offer every shoe pair on every body.

## Files owned

- `scripts/build_character_wardrobe.py` (new): the Blender build.
- `preview/public/assets/characters/wardrobe/**` (new): six GLBs, shared textures,
  `wardrobe.sources.json`.
- `preview/src/character-wardrobe.js` (new): dressing an avatar from its wardrobe.
- `preview/src/character-recipe.js`: `top`, `bottom`, `footwear`; catalogues; rolls.
- `preview/src/character-recipe-look.js`, `character-studio-recipe.js`,
  `character-studio-state.js`, `character-studio-guide.js`, `character-studio.css`.
- Tests: `character-recipe-look.test.js`, `character-recipe.test.js`,
  `character-studio-guide.test.js`, `avatar-culling.test.js`; journey
  `preview/e2e/character-recipes.js`.
- `docs/character-studio.md` (wardrobe section).

## Build

```sh
python scripts/fetch_character_assets.py   # pinned hashes, into ignored data/raw/characters
Blender -b --factory-startup --python scripts/build_character_wardrobe.py [-- <body> ...]
```

Blender 5.2.2 LTS, from the official mirror (DMG sha256 dc412539…, checked against the
release's own checksum file), installed at `~/Applications/Blender-5.2.2.app`. Its binary
hash, f5c1f2a0…, is the one in `realistic-humans.sources.json`. A full build takes about
90 s.

## Decisions

- **Shipped rigs untouched.** The wardrobe is additive: residents, NPCs and the garment
  bakes keep the shipped GLBs. A recipe in its body's own clothes takes the old path.
- **Skin.** The shipped bodies delete the skin under their suits, so each wardrobe
  carries the full skin below the head with a `_cover` bit mask per vertex (MPFB's
  conservative mask). The shipped head stays, because it carries the face targets.
  Measured: every shipped body vertex below the head matches a wardrobe skin vertex
  to within 0.1 mm.
- **Split.** Each connected piece goes whole to the half most of its weight is on;
  pieces between 20% and 80% lower-body weight (overalls, a shirt sewn to its jeans)
  are cut face by face. The first, purely per-face split put jacket tails on the bottom.
- **Offer.** Several suits share one jeans mesh, so four distinct masculine bottoms are
  offered. Fedoras are left out: they clash with hair.
- **Size.** 18 MB of GLBs and 4 MB of textures, uncompressed (the client has no Draco
  or meshopt decoder). A body's wardrobe loads only when it wears something else.

## Checks

- Focused: `node --test preview/tests/character-recipe.test.js
  preview/tests/character-recipe-look.test.js preview/tests/character-studio.test.js
  preview/tests/character-definition.test.js preview/tests/character-studio-guide.test.js
  preview/tests/avatar-culling.test.js`.
- Server: `character-equip`, `character-world`, `character-store`, `character-selection`
  and `character-transport` tests.
- `pnpm run verify`.
- Journeys: `character-recipes` (now with a mix-and-match step), `character-studio`,
  `character-studio-layout`, `character-portrait`.
- Inspected captures: `preview/e2e/wardrobe-captures.js` (local tool).

## Results

- 2026-10-27, before commit: focused suites 44/44 and the culling test pass; server
  character tests 34 pass, 22 skipped (Redis).
- The skin test failed on the first build, by 162 of 9512 vertices hidden too many,
  until MPFB's conservative mask was applied.
- The full preview suite (4244 tests) failed only the five garment-bake provenance tests:
  `character-recipe-look.js` is a bake input. The five receipts were rebaked
  (`node scripts/bake-*.mjs --write`); the morph data is byte-identical, every bake passes
  `--check`, and the bake tests pass, 18 of 18.
- Wardrobe captures (18: six mixes, front, back and walking; Chromium, local tool) were
  inspected. They show:
  - a crop top over a pencil skirt with bare midriff skin;
  - a pinstripe jacket with leggings;
  - a suit jacket over jeans, with its tails kept on the jacket;
  - overalls with jeans;
  - no seam at the neck, and no skin showing through at the waist.
  The first run failed at the pose control, which reduced motion disables; the tool no
  longer emulates reduced motion.

- `pnpm run verify` (core) passed on 4a7f8d8a's tree, 22:46–22:53Z:
  - agent 284/284;
  - preview 4243 passed, 1 skipped;
  - server 972 passed, 251 skipped;
  - desktop 127 passed, 5 skipped;
  - ruff, the build and the secrets scan passed.

  The first run failed only on ruff line lengths in the build script. After the fix, a
  rebuild was byte-identical.
- Journeys on 4a7f8d8a (local Chromium, from a snapshot): `character-recipes`,
  `character-studio`, `character-studio-layout` and `character-portrait` all passed.
  `character-recipes` passed its new checks:
  - only the frame's tops and bottoms are offered;
  - a top, a bottom from another suit and other shoes stage on the same person;
  - a second account loads the worn mixed recipe.

  The in-town capture shows the mixed outfit.
- Draft #719: 17 of 17 hosted checks pass on 4a7f8d8a. Stacked on #694's branch, so the
  main-only shared journeys run once it targets `main`.

## Gaps

- Dresses, hats, and face targets on the Jevica and realistic bodies.
- Seated drape morphs cover only a body's own garments.
- Draw cost: seven meshes per wardrobe-dressed figure instead of five.

## Next

After #694 lands, retarget #719 to `main`, update it from `main` and let the full hosted
matrix run. Merging needs Val's explicit go-ahead.
