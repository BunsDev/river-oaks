# Character Studio: body type (build) joins the random start and the recipe

- **Goal:** Val, 2026-10-29: the Character Studio starts with a random set of eyes, brows,
  lips, hairstyle, gender, hair colour, height, body type and so on, all configurable.
- **Task id:** `studio-build-20261029` (live register)
- **Owner:** `claude:river-oaks-22 (b90b7d)`
- **Branch:** `feat/studio-build-20261029`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-studio-build`
- **Baseline head:** `39a5f30272ea620ce692b95fcc15a8c69b9aff9f` (`origin/main`, 2026-10-29)

## Objective

Main already starts the Studio from a random person once per visit (`character-studio.js`
`RANDOM_START` → `draft.create()` → `rollCharacterRecipe`), and the recipe already rolls and
exposes the frame (gender) and outfit body, height, the face sliders (eye size and spacing,
brow height, upper and lower lip, mouth, nose, chin, cheeks, head), skin, eye colour,
hairstyle, hair colour, outfit and shoe colours. The one named thing missing was the body
type. The shipped recipe bodies carry only face morph targets (`resident-face.js`); the
MPFB muscle/weight/proportion values in `*.sources.json` are bake-time macros, not runtime
targets. So the build is a validated width scale of the figure at the recipe's exact height.

## Changed behavior

- `character-recipe.js`: `build` field, -100 (slim) … 100 (broad) in steps of 5, default 0;
  `RECIPE_BUILD`, `recipeWidth()` (1 ± 0.08); `RECIPE_CATEGORIES.body` = `['body','build']`
  so the body dice and Surprise me roll it (rounded bell about 0, spread 30). The canonical
  copy now comes out in catalogue field order whatever order the fields arrived in.
- Compatibility: a version 3 record from before the build (no `build` field) is the only
  shape accepted beyond the exact field set; it validates and canonicalises with `build: 0`
  (`characterRecipe`, and the legacy fill before `equal()` in `validateCharacterDefinition`).
  `server/character-store.js` re-canonicalises stored drafts and revisions on decode, so an
  old stored revision and a fresh copy of the same person are the same JSON text and the
  revision selection compare (`initialSelection`) still passes. A present but invalid build
  (7, 150, '0', 2.5, null, undefined) is refused; unknown fields are still refused.
- `avatars.js` `instantiateAvatar({width})`: `model.scale.set(scale*width, scale, scale*width)`;
  `loadResidentAvatar` passes `recipeWidth(recipe)`. Hair, garments, the baked face and the
  skinned meshes are children of the scaled model, so they follow; `hipHeight` (y) is unchanged.
- Studio: a Build slider in the Body category (`cs-build`, aria-valuetext Neutral / Slim n /
  Broad n), live value while dragging, `recipeEdit` → `{build}`, `renderRecipe` mirrors it;
  `describeLook` names a non-neutral build ("slim build" / "broad build"); the Your-own
  summary lists "body and build".
- `server/character-store.js` exports `createCharacterStore(storage)` for the storage-level
  regression below.
- `avatars.js` is a garment bake input (`scripts/lib/bake-provenance.mjs`), so the five bake
  receipts (`coat-tail`, `lyra-drape`, `silvan-drape`, `skirt-seat`, `vesper-skirt`
  `*-morph-receipt.json`) were regenerated with the five `scripts/bake-*.mjs --write`
  commands; the `*-morph-data.js` outputs are byte-identical (receipts-only diff), as #691 did.

## Files owned

`preview/src/character-recipe.js`, `preview/src/character-definition.js`, `preview/src/avatars.js`,
`preview/src/character-studio-recipe.js`, `preview/src/character-studio.js`,
`preview/src/character-studio-guide.js`, `preview/src/character-studio.css`,
`server/character-store.js`, `preview/tests/character-recipe.test.js`,
`preview/tests/character-recipe-look.test.js`, `preview/tests/character-studio.test.js`,
`preview/tests/character-studio-guide.test.js`, `server/tests/character-store.test.js`,
`server/tests/character-equip.test.js`, `docs/character-studio.md`, this ledger.

## Checks

- `node --test preview/tests/character-recipe.test.js preview/tests/character-studio.test.js preview/tests/character-studio-guide.test.js preview/tests/character-definition.test.js server/tests/character-store.test.js server/tests/character-equip.test.js server/tests/character-world.test.js server/tests/character-selection.test.js`
- `node --test preview/tests/character-recipe-look.test.js` (loads the real rigs; asserts the
  width scale and the shoulder span follow the build while the standing height is exact)
- `pnpm run verify` (core)

## Results

- Focused run (2026-10-29): 80 tests, 59 pass, 0 fail, 21 skipped (Redis-gated).
- Recipe look run: 4 pass, 0 fail.
- Core verify, first run (2026-10-29, host load ~26 with two other verifies): preview-tests
  failed on the five garment receipt tests only (`Bake input changed: preview/src/avatars.js`);
  agent-tests passed; later stages not run. Rebaked (receipts only) and reran.
- Core verify, second run (2026-10-29 22:44Z, dirty 39a5f302, caffeinate -s, host load ~20):
  passed, 11/11 stages (agent 289/289; preview 4683 run, 4647 pass, 0 fail, 1 skip; server
  1366 run, 1081 pass, 0 fail, 285 Redis skips; desktop 132 run, 127 pass, 5 skips; build,
  python lint/format/tests, demo, demo-verify, secrets passed). The land-pr wake flake did
  not occur. The only `✖ failing tests:` block in the log is the pre-existing
  hud-token-contrast `⚠` todo (sheet-muted contrast), which the stage counts as passing on
  main too.

## Gaps

- Hosted Production has no `VITE_CHARACTER_STUDIO` / `RIVER_OAKS_CHARACTER_STUDIO` (Preview and
  Development do, per `vercel env ls` names), so the Studio is only visible in preview and dev
  builds until the owner sets them. Not changed here.
- The build is a scale, not a sculpted body: ±8% width is the authored limit, chosen to keep the
  shipped garments and foot/hand placement within tolerance; no browser capture was made in
  this slice (the character-recipes journey covers the Make-your-own flow on hosted preview).
- Brows, eyes and lips remain the existing face sliders (height; size and spacing; upper and
  lower lip volume and mouth width): no new morph targets were added.

## Next step

Draft PR open (see register `pr`); hosted preview checks (incl. the character-recipes journey) are the merge gate.
