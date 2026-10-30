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
