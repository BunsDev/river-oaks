# Jev's look from the 2026-10-29 reference

- **Request:** Val, 2026-10-29: "convert the jevica and jev models to emulate the
  attachments in a pixel-perfect manner with realistic animation mechanics from our
  animations libraries e2e". This ledger is the Jev half; Jevica is
  `2026-10-29-jevica-reference-look.md`.
- **Reference:** `preview/public/assets/characters/references/jev-angel-tunic-20261029.png`
  (848×1264, sha256 `349aa69c35662ad49e22eab2b10c13ffbe9d98f87e965d2462da5afa7154bf1b`;
  supplied by Val on 2026-10-29, generated image file `hf_20261029_182709…`; not a
  photograph; art direction only).
- **Task id:** `jev-reference-look-20261029`; **branch** `feat/jev-reference-look-20261029`;
  **worktree** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-jev-reference-look`;
  base `39a5f302` (origin/main).

## Honest framing

A procedural Three.js rig over CC0 MakeHuman geometry cannot be pixel-identical to a 2D
illustration: the face, the hairstyle mesh (no curls exist in the catalogue), the hand
pose and the illustration's painted shading are not reproducible without new assets.
Blender and the MakeHuman asset packs are not cached locally and downloading them is not
authorized, so everything here is runtime work over the existing `prince-jev.glb`. The
likeness is measured by a journey; the numbers are a baseline, not a pass/fail claim of
identity.

## Objective

1. Tunic and trousers from the one suit mesh: the jacket piece becomes a cream tunic
   with a pink centre placket in rose-gold trim and mint scrollwork, rose-gold
   neckline, hem and cuffs; the trouser piece becomes pink. Pieces are labelled per
   vertex on a private geometry clone; the shader reads the bind-space position.
2. Belt: a flat rose-gold band seated on the measured torso surface with a lozenge
   buckle. Coronet, royal sash, double-breasted buttons, star of order, epaulettes and
   sapphires are retired.
3. Bracers: open rose-gold cuffs fitted to each measured sleeve (`measureLimb`), with an
   engraved mint band.
4. Sandals: the boots become bare feet (skin tone) with rose-gold sole bands; two
   criss-crossing straps, an ankle band and a top cuff are fitted to each trouser leg;
   a toe strap and heel band sit on each foot.
5. Hair: `short02` recoloured caramel with golden highlights and scaled 6% about the skull
   on a private clone. Eyes: iris shifted to blue in the shader, sclera and pupil kept.
6. Wings: out and folded back at rest (`WING_REST` 0.45) with a slow breathing fold,
   fully open in flight, folded away in the car seat (`carriage-driver.js`).
7. Likeness journey `preview/e2e/jev-reference-likeness.js` on
   `/e2e/fixtures/prince.html?view=reference`.

## Files

- `preview/src/prince-costume.js` (rewritten: `measureLimb`, `labelGarmentPieces`,
  `PRINCE_PALETTE`, the costume), `preview/src/angel-wings.js` (`WING_REST`, `rest`
  option), `preview/src/carriage-driver.js` (rest amount), `preview/e2e/fixtures/prince.js`
  (`reference()` framing), `preview/e2e/jev-reference-likeness.js` (new),
  `preview/tests/prince-costume.test.js`, `preview/tests/angel-wings.test.js`,
  `preview/public/assets/characters/README.md`, `docs/character-forms.md`,
  `preview/public/assets/characters/references/jev-angel-tunic-20261029.png` (new).

## Checks

- `node --test preview/tests/prince-costume.test.js preview/tests/angel-wings.test.js preview/tests/carriage-driver.test.js preview/tests/prince-companion.test.js preview/tests/prince-flight.test.js`
- `pnpm run verify` (core)
- `pnpm run test:experience jev-reference-likeness` (browser, from a detached snapshot
  when the shared browser lock allows)

## Results

- Fit (node, real rig, `targetHeight` 1.805): bracers 4.0–4.5 mm over the sleeve; calf
  straps and cuffs 7.0 mm over the trouser leg; belt band 11.9 mm over the tunic
  (buckle to 32.6 mm at the front), measured before the belt widened to 46 mm. Costume
  build 51 ms; 20 meshes, 45 168 triangles for the dressed avatar.
- Focused tests (`prince-costume`, `angel-wings`, `carriage-driver`, `prince-companion`,
  `prince-flight`): 38 pass, 0 fail.
- Core verify (`pnpm run verify`, host load ~22–27): passed; agent tests 289/289,
  preview 4682 run / 4646 pass / 0 fail / 1 skipped, server 1365 run / 1080 pass /
  0 fail / 285 skipped (Redis/live auth), desktop 132 / 127 pass / 5 skipped, secrets
  clean. Receipt `.runtime/agent/core.json`.
- Likeness journey: see the snapshot run below.

## Gaps

- Face, hairstyle silhouette (no curls), hand pose and painted shading cannot match the
  illustration; the journey's IoU and ΔE are the honest measure.
- Straps follow the calf bone only: across the knee they do not deform with the thigh.
- Human visual review of the render on desktop and phone remains.

## Next step

Run focused tests, the core gate and the likeness journey; publish as a draft PR.
