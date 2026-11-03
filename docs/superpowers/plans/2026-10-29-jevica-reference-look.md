# Jevica: the 2026-10-29 reference look (pink satin pantsuit)

- **Request:** Val, 2026-10-29: "convert the jevica and jev models to emulate the
  attachments in a pixel-perfect manner with realistic animation mechanics from our
  animations libraries e2e". This ledger is the Jevica half; Jev is
  `jev-reference-look-20261029`.
- **Task id:** `jevica-reference-look-20261029` (live register)
- **Owner:** `claude:river-oaks-22 (b90b7d)` (fork)
- **Branch / worktree:** `feat/jevica-reference-look-20261029` at
  `/Users/buns/Documents/GitHub/BunsDev/river-oaks-jevica-reference-look`
- **Baseline head:** `39a5f30272ea620ce692b95fcc15a8c69b9aff9f` (`origin/main`)
- **Reference:** `preview/public/assets/characters/references/jevica-pink-suit-20261029.png`
  (848×1264, sha256 `93917f582c726a802403c70f6d88de8aa86aabb17f862ecbe91aeed8a05f9336`),
  supplied by Val on 2026-10-29 as generated image file `hf_20261029_182708_807651bf…png`;
  not a photograph; art direction only; redistributed in the repository as a reference.

## Honest framing

A procedural Three.js rig built on CC0 MakeHuman assets cannot be literally pixel-identical
to a 2D illustration (different face mesh, hair-card hair, no cloth simulation). The build
is the closest faithful procedural version, and the likeness is **measured** by
`preview/e2e/jevica-reference-likeness.js` rather than claimed.

## Objective

1. Replace the rose gown, crown and visible wand with the reference outfit: an iridescent
   pink satin blazer (notched lapels, one rose-gold button, short peplum, rose-gold vine
   piping), a high mandarin-collar pale pink blouse with a flower brooch, slim satin
   trousers with a front crease, glossy pink pumps on a slim rose-gold heel, lily clusters
   above each ear, flower-drop earrings, and espresso-to-rose ombré hair.
2. Keep every garment on the existing animation: the blazer and trousers are offset shells
   of her own skin, skinned to her skeleton (the riding-trousers technique), so walking,
   turning, flight, seated and riding poses carry them with no new locomotion code; the
   peplum is draped by `jevica-drape.js`; the earrings swing as a damped pendulum driven by
   the head's acceleration (still under reduced motion).
3. Measure the likeness end to end: figure-box silhouette IoU, median colour per named
   region (ΔE76), and the presence of every piece, with a side-by-side composite.

## Files

- `preview/src/jevica-suit.js` (new): shells, piping shader, peplum, lapels, collar,
  brooch, button, heels, lilies, earrings, ombré hair.
- `preview/src/jevica-costume.js`: rebuilt around the suit; wand hidden unless
  `update(flying, now, riding, {casting:true})` (no spell system calls `getWandTip` today,
  so nothing shows it; the hook is documented, not invented into callers).
- `preview/src/riding-clothes.js` + `preview/tests/riding-clothes.test.js`: removed; the
  trousers are always worn now (same shell technique, in `jevica-suit.js`).
- `preview/src/shared-appearances.js`: Jevica's `reference` points at the illustration
  (the UI shows her `portrait` first; no UI change).
- `preview/e2e/fixtures/jevica.js`: `?view=reference&background=white` framing.
- `preview/e2e/fixtures/jevica-clearance.js`: measures the skinned shells too.
- `preview/e2e/jevica-reference-likeness.js` (new); `jewel-optics.js`, `gown-sampling.js`,
  `gown-contact-samples.js`: renamed pieces.
- `preview/tests/jevica-reference-look.test.js` (new, real rig).
- `docs/character-forms.md`, `preview/public/assets/characters/README.md`.

## Checks

- `node --test preview/tests/jevica-reference-look.test.js preview/tests/player-costume.test.js`
- `pnpm run verify` (core)
- `pnpm run test:experience jevica-reference-likeness` (browser); `jevica-gown`, `jevica-waist`,
  `jewel-optics` as regression of the clearance and jewel rules.

## Results

- Node (2026-10-29): `jevica-reference-look` 5/5, `player-costume` 7/7,
  `default-appearance-realism` updated for the ombré hair shader key.
- Likeness journey (`jevica-reference-likeness`, Chromium/Metal on an M3 Max, host load
  ~25): **silhouette IoU 0.598**, **mean ΔE76 17.7** over nine landmarks:

  | Landmark | ΔE76 | Baseline limit |
  | --- | --- | --- |
  | jacket-sleeve | 7.3 | 11 |
  | jacket-chest | 9.9 | 13 |
  | skin-face | 12.0 | 16 |
  | trousers-thigh | 14.2 | 18 |
  | trousers-shin | 18.9 | 23 |
  | blouse | 22.2 | 26 |
  | jacket-hem | 23.3 | 27 |
  | shoe | 23.5 | 27 |
  | hair-crown | 27.7 | 31 |
  | hair-ends | not visible | recorded gap |

  Limits are the measured result plus a small margin, so a regression fails; they are a
  floor for this build, not an acceptance of the likeness. The first runs used
  figure-box fractions, which landed between her legs and on her parting (shin ΔE 69,
  shoe 54); landmarks are now matched anatomically, with a raycast recording what each
  render pixel shows. Artifacts: `output/playwright/jevica-reference-likeness.png`
  (side by side) and `-render.png` (not committed).
- `jevica-gown` (30/60/120 Hz walk, turn, fast walk, stop, bubble, landing): passed;
  worst leg overlap −2.5 mm (cloth outside skin everywhere), arms clear of the peplum,
  costume update median 2.8–2.9 ms. Legs are now measured from their own bone chain,
  skipping skin inside the shoe cuff; the waist-axis rays of the gown check graze tight
  trousers and reported false misses.
- `jevica-waist`, `jewel-optics`, `gown-sampling`, `gown-contact-samples`: passed on 44e8185e
  (detached snapshot, shared browser lock), after an earlier pass on a prior iteration.
- Fixed while measuring: the shells now copy the skin's bind inverse (`attached` mode
  only refreshes it in `updateMatrixWorld`, so node-side sampling saw a 3 cm offset).
- `pnpm run verify` (core): passed, receipt `.runtime/agent/core.json`; agent 289/289,
  preview 4649 pass / 0 fail / 1 skip of 4685, server 1080 pass / 285 skipped (Redis),
  desktop 127 pass / 5 skipped, build, Python lint/format/tests, demo, secrets.
  Garment bakes unchanged: `shared-appearances.js` was left untouched.

## Gaps (cannot match the illustration)

- The face, body proportions, stance and hair volume are the shipped rig's. The
  illustration's long legs and voluminous waves are not reproducible without new assets;
  the pink hair ends fall behind her back and are **not visible from the front**.
- The shoes are the rig's flat shoes recoloured pink with a rose-gold heel column; they
  read as trainers, not stilettos.
- The blazer is a skin offset shell: the bust shape still shows through the smoothed
  front. Lapels are thin pinned ribbons; the vine piping is vertex-painted at the skin's
  density, so it suggests filigree rather than drawing it.
- The peplum keeps a straight seam at its top edge and uses the pose-driven clearance
  field, not cloth simulation.
- A deep knee bend (thigh −0.9 rad, calf 1.4 rad) lets the inner knee poke 6 mm through
  the 5 mm trousers in a node probe; walking and the measured stages stay clear.
- The wand is hidden unless `update(..., {casting:true})`; no caller passes it yet.
- `preview/e2e/goldens/character-hero/manifest.json` still lists `riding-clothes.js` as a
  historical input of the Sable golden; it was not re-recorded (pinned renderer).
- Human visual review against the reference remains.

## Next step

Signed commit, push, draft PR, register update; then rerun `jevica-waist`,
`jewel-optics`, `gown-sampling` and `gown-contact-samples` on the final head from a
detached snapshot and record them here. Human review of the side-by-side image.
