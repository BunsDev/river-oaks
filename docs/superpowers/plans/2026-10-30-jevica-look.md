# Jevica look, phase 1: pumps and hair (2026-10-30)

- **Request:** Val, 2026-10-30, chose "Auto-land, then characters": phase 1 of
  `character-uniqueness-20261030` (Jevica clothing, face and hair toward the
  2026-10-29 reference). Builds on `2026-10-29-jevica-reference-look.md` (#775).
- **Task:** `jevica-look-20261030` (live register). **Owner:** claude:river-oaks-ribbonwing (9b98c1a1).
- **Branch / worktree:** `feat/jevica-look-20261030` at `../river-oaks-jevica-look`, from main `e1ac3422`.
- **Reference:** `preview/public/assets/characters/references/jevica-pink-suit-20261029.png`
  (sha256 `93917f58…9336`, unchanged).

## Increment 1 (this PR)

**Files:**
- `preview/src/jevica-suit.js`:
  - `shapeJevicaPumps` and `PUMP`;
  - `HAIR` (ombré start, volume flare);
  - ombré shader v2.
- `preview/src/jevica-costume.js`: calls `shapeJevicaPumps`.
- `preview/tests/jevica-reference-look.test.js`: a new pumps-and-hair test, plus the key bump.
- `preview/tests/default-appearance-realism.test.js`: the key bump.

**Shoes:**
- The rig's ankle shoes become slim pointed pumps. In bind space, below the ankle, each
  shoe is narrowed and its toe drawn to a point, and the toe box is lowered.
- The upper above a pump topline is painted in the trouser satin with a rose-gold edge,
  so the hem seems to fall onto the pump.
- The topline is a signed distance, so the edge stays clean at the shoe's coarse mesh
  density. A per-vertex on/off flag drew a jagged, sock-like band in the first capture.
- Where the shoe meets the leg it is untouched, because her feet end inside it at 16.5 cm.
- The costume reshapes its own copy of the geometry, never the shared rig.

**Hair:**
- Below the ears the strands stand out from the head's axis by up to 22% at the ends.
- The ombré starts at the shoulders and the ends are brighter pink, not mauve.

## Results

Likeness journey (`jevica-reference-likeness`), Chromium on this host (M5 Max), load around 18–20:

| | main `e1ac3422` | increment 1 |
| --- | --- | --- |
| Silhouette IoU | 0.598 | 0.598 |
| Mean ΔE76 | 17.7 | 17.2 |
| Shoe ΔE76 | 23.5 | 19.4 |
| Hair-ends landmark | not visible | not visible |

- The main column is from the 10-29 ledger. My baseline run on `e1ac3422` drew the same
  composite, with those values printed on it.
- `jevica-gown`, `jevica-waist`, `jewel-optics`, `gown-sampling` and
  `gown-contact-samples` all passed on the final source.
- Node: `jevica-reference-look`, `player-costume` and `default-appearance-realism` passed, 18 of 18.
- Core `pnpm run verify` passed: agent 294/294; preview 4767 pass, 1 skipped; server 1110 pass, 285 skipped (Redis); desktop 127 pass, 5 skipped.

## Gaps

- **No heel lift.** The feet stay flat, so the shoes read as pointed pumps or booties, not
  stilettos. A raised-heel foot pose would change her stance, foot grounding and every
  clearance measurement; it is a later, measured step.
- **Hair ends still read as not visible from the front.** The landmark falls behind her
  back. Pink now shows at the shoulders, but the long waves need new hair cards.
- **Not attempted yet:**
  - a real blazer cut (the bust shows through);
  - the face morph and makeup.
  These are the next increments. The deep-knee poke-through was measured, and no fix shipped; see below.
- No human visual review.

## Deep-knee poke-through: measured, no fix shipped (2026-10-30)

The 10-29 ledger's gap said that at thigh −0.9 / calf 1.4 rad the inner knee pokes through
the 5 mm trousers.

**What was measured.** A node probe on the real rig counted posed skin vertices that lie
outside the nearest posed trouser triangle within 9–15 cm of the left knee:

| Bend (thigh / calf rad) | Vertices outside | Worst |
| --- | --- | --- |
| 0 / 0 (rest) | 0 | — |
| −0.5 / 0.8 | 2 | 4.6 mm |
| −0.9 / 1.4 | 46 | 4.1 mm |
| −1.2 / 2.0 | 73–85 | 4.8 mm |

- All of them are on the inside of the bend, and they reach up to 10.9 cm from the joint.
- Skinning folds the thigh and calf skin into each other there.

**Geometry fixes failed.** Both made it worse, because the shell copies the skin's weights and
folds the same way:
- a knee-local extra offset of 4–8 mm gave 86–122 vertices outside at −0.9 / 1.4, worst 7.5–11 mm;
- re-ramping the shell's thigh/calf weights over 3–12 cm gave 87–269 outside.

**A shader mask works but buys nothing visible.**
- The mask stopped drawing leg skin within ±12 cm of each knee (bind space; only leg skin is
  there). To survive a realism tier, `upgradeSkin` would have had to chain a look's own skin hook.
- It worked: node tests passed, and so did a composition test under every tier.
- A browser journey then rendered both knees at the three bends, from the side and from
  behind, close up, mask on and off. It counted skin pixels in the knee's ±10 cm box
  (skin has more green than blue; the satin does not).
- **No crease skin shows without the mask at any bend or view.** The fold hides it. The only
  skin in the box was her hand, in the deepest crouch, seen from behind.
- An earlier, looser count found one 12-pixel speck at the deepest crouch, and the mask removed it.

**Decision.** Not shipped: changing the shared realism module for no visible gain is the
wrong trade. The probe, the journey and the diff are kept outside the repo as session
evidence. If a later pose shows crease skin, start from that diff.

## Increment 2: a tailored blazer front (task `jevica-blazer-20261030`, stacked on #814)

**The problem.** The blazer is a copy of her skin pushed out and smoothed, so it followed the
body into the hollow under each side of the bust (which the V splits). The bust apex
showed through as a point.

**What changes.** `tailorFront` in `preview/src/jevica-suit.js`, applied from the collar to
the button:
- Each 1 cm row, per side of the V, is lifted to the upper convex hull of its horizontal profile.
- Each 1 cm column is lifted to the hull of its vertical profile, so the cloth hangs from
  the bust toward the button.
- Only depth moves, only outward, toward a soft 3 cm limit. The lift is feathered by
  torso and arm weight and over the last 2 cm above the button, then blended in 8 smoothing passes.

**First tries.**
- A hard 3 cm cap with no feathering drew a faceted ledge down the side.
- Feathering over 5 cm above the button let part of the under-bust curve come back.
- Both are visible in the session's captures.

**Results (bind space, central columns |x| < 9 cm):**
- Under-bust tuck, measured as the dip below the line from each column's apex to its lowest point:
  - skin: more than 15 mm (the test asserts it);
  - before this change: 17.6 mm;
  - after: 4.4 mm.
- The largest lift is 3.0 cm. The largest stand-off from the skin is 5.3 cm, under the bust; the
  shell test's bound moved from 5 to 6 cm.
- Front captures: no apex points, and the bust reads as one smooth form.
- Profile: the under-bust curve is softened, not removed.
- Likeness: IoU 0.598, mean ΔE 17.2, jacket-chest ΔE 9.9, unchanged within noise. The landmark
  metric does not see shading.
- `jevica-gown`, `jevica-waist`, `jewel-optics`, `gown-sampling` and `gown-contact-samples` pass.
- Node: 20/20 across `jevica-reference-look`, `player-costume` and `default-appearance-realism`.

**Still a gap.** The blazer is still a copy of her skin: no lapel roll, no seams, and the bust
is still shaped (rounder, not flat). A real cut garment mesh would need new modelled assets.
No human review.

## Increment 3: makeup (task `jevica-makeup-20261030`, stacked on #815)

**Why only makeup.** Her rig carries only the two blink morphs, with no MPFB face-shape
targets. Reshaping her face the supported way means rebuilding her rig with
`build_facial_candidates.py --faces jevica`. That needs the MPFB and Faceunits packs in
`data/raw/characters`, which is empty on this machine. AGENTS.md forbids downloading asset
packs without authorization, so face shapes wait for Val. Makeup needs no new assets.

**What changes.** `applyJevicaMakeup` in `preview/src/jevica-suit.js` paints rose lips and a
soft blush as vertex colours on the costume's own copy of her skin. Realism tiers leave
vertex colours alone, and the shared rig is untouched.
- **Landmarks** come from her midline profile: nose tip 1.407 m, under the nose 1.392,
  upper lip 1.386, mouth line 1.377, lower lip 1.371.
- **Lips:** an ellipse about the mouth line, front surface only. Its half-width is 0.78 of
  half the pupils' spacing (2.2 cm).
- **Blush:** a Gaussian disc on each cheek, just outside the pupil line.

**First try.** The eye meshes' outer width was used as the pupils' spacing, which made the
mouth 3.4 cm wide. It was corrected before any capture was kept.

**Results:**
- Likeness:
  - skin-face ΔE 12.0 → 9.0;
  - mean ΔE 17.2 → 16.9;
  - IoU 0.598.
- Close-ups from the front and three-quarter: the tint follows the lip line, and the blush is faint.
- `jevica-gown`, `jevica-waist`, `jewel-optics`, `gown-sampling` and `gown-contact-samples` pass.
- Node: 21/21. The new test checks:
  - landmark order;
  - mouth width;
  - the lip tint stays within the lip box;
  - the blush covers more than 200 vertices;
  - her copy of the skin, not the shared rig.

**Gaps.**
- Her face shape (eyes, jaw, nose) and bangs are unchanged: shapes wait on the asset packs,
  and bangs need new hair cards.
- No human review.

## Increment 4: bangs (task `jevica-bangs-20261030`, stacked on #816)

**What changes.** `createJevicaBangs` in `preview/src/jevica-suit.js` adds a straight fringe
as in the reference:
- **Shape:** a 41×15 sheet fitted to her forehead's depth, sampled on a 4 mm grid and blurred
  so it does not copy small bumps. It never sits closer than the skin plus 5 mm. It runs from
  5 cm above the brows to 6 mm above them, and 1.4 cm longer at the sides.
- **Edges:** the top rows tuck under the hair cap.
- **Attachment:** pinned to the head.
- **Strands:** a procedural texture, one tone per strand. Each strand ends at its own length,
  with alpha-cut tips, in her warm espresso root colour.

**Tries.**
1. Grey-black, blotchy noise, with the top edge fighting the hair cap.
2. Warm colour, a tucked top and clean strands, but it copied the forehead's bumps.
3. The blurred depth. The likeness lighting still showed a faint light edge at the cap.
4. Final: each strand starts at its own height under the cap, with darker roots. The full-figure render then showed no edge.

All three are in the session's face captures.

**Results.**
- Node: 22/22. The bangs test checks:
  - the fringe stands in front of the forehead;
  - it ends just above the brows;
  - it turns 0.5 rad with a 0.5 rad head turn.
- Browser likeness: IoU 0.598, mean ΔE 16.9, hair-crown 27.7 (that landmark is the top of the head, which the fringe doesn't change). `jevica-gown`, `jevica-waist`, `jewel-optics`,
  `gown-sampling` and `gown-contact-samples` pass.

**Gaps.**
- It is one sheet, not hair cards. The strands don't move independently or react to wind.
- The reference's side-swept face-framing locks are not attempted.
- No human review.

## Increment 5: piped lapel outlines (task `jevica-lapels-20261030`, stacked on #817)

**Problem.** The lapels were piped only along the V edge, so in close-ups they read as a
faint panel and the notched shape was lost. The reference pipes both edges.

**First hypothesis, rejected.** I thought #815's tailoring had pushed the blazer in front
of the lapels. A new test shows otherwise: under 5% of lapel points sit behind the blazer
surface, and the test passed before any change. It stays as a guard.

**What changes.** Each lapel ribbon gains two outer columns, 3.5 mm and 4.5 mm in from its
edge, piped rose-gold. The notched outline now reads in front and three-quarter close-ups.

**Results.**
- Node: `jevica-reference-look` 11/11.
- Browser: likeness IoU 0.598, mean ΔE 16.9; `jevica-gown`, `jevica-waist`, `jewel-optics`, `gown-sampling` and `gown-contact-samples` pass.
- Core verify passed: agent 294/294; preview 4772 pass, 1 skipped; server 1110 pass, 285 skipped; desktop 127 pass, 5 skipped.

**Follow-up: roll and vine.**
- **Roll:** the satin now bows up to 3.5 mm outward between its edges, so it catches light
  like a pressed lapel.
- **Vine:** a rose-gold vine winds up the lower two thirds of each lapel, about one and a
  half turns.
  - The first try broke into dashes: the line was thinner than the 3.5 mm column spacing.
    The grid went to 22 columns by 61 rows.
  - The second try lost the vine at the narrow tip by the button. It is now placed within
    the satin band itself.
  - A test requires the vine in every row below the notch. It failed on both earlier tries.
- **Likeness:** IoU 0.598 is unchanged. Mean ΔE went 16.9 → 17.1 and jacket-chest 9.9 → 11.6,
  because that sample sits on the right lapel and now picks up the rolled shading and the
  vine. It stays under the region's threshold. The reference has filigree at that spot too,
  but the sample measures flat colour.
- Core verify passed again: agent 294/294; preview 4773 pass, 1 skipped; server 1110 pass,
  285 skipped; desktop 127 pass, 5 skipped.

**Follow-up: leaves.**
- Five leaves branch off each vine on alternating sides: pointed ellipses 11 mm by 4 mm,
  leaning 40° up and out. The vine widened to 2.4 mm half-width, and the grid went to
  22 by 121.
- The first leaf try was too fine to see at chest-camera distance.
- A test counts rows that cross a leaf beside the stem: 6 on the right lapel with leaves,
  0 with the leaves removed. The threshold is 4.
- Likeness: IoU 0.598 is unchanged. Mean ΔE is 17.2, and jacket-chest is 12.7 (it sits on
  the lapel).
- Core verify passed: agent 294/294; preview 4773 pass, 1 skipped; server 1110 pass,
  285 skipped; desktop 127 pass, 5 skipped.

**Gaps.**
- The filigree is a vine with simple leaves, painted onto the lapel. The reference's
  is raised, with curling tendrils.
- The lapel is a rolled ribbon pinned to the chest, not a separate collar piece.
- No human review.
