# Default-appearance realism trial (#517)

The owner's default Jevica and the guest's default Sable (on Jevica's rig) now
take one part of the existing realism layer: the regional skin roughness map. Their
face, eyes, hair, brows, outfit, palette and skin tone stay as authored.
This is the bounded continuation approved on #517 on 2026-10-24 under #638. It
does not establish AAA quality, a device budget or human acceptance.

Policy and rollback: [`default-appearance-realism.js`](../../preview/src/default-appearance-realism.js).
Set `enabled: false` to return both defaults to imported materials. Nothing about
it reaches the server, the saved character or other players' selections.

## How the trial was judged

`node scripts/default-appearance-trial.mjs` renders native 3840×2160 full-body
and close-up views through the production portrait path with a fixed camera and
pose, under three fixed lights (the hero's daylight, a warm dusk and a warm
interior with a room environment). Each component is rendered alone at the high
tier, the trial set at every tier, and the whole preset as evidence only. A
no-MSAA pair shows the software-rendering path. Every case is compared with
realism off under the same light: whole-image channel error, and per region
(hair, brows with lashes, skin) the covered area, its overlap with off (IoU of
8×8 cells) and the CIE76 shift of its mean colour. Regions are found by
rendering again without their meshes.

The close-up camera is about 1.0 m from the face with a 24° vertical field of
view, about 5.1 px per mm at the face.

## Component verdicts

From trial run-1 (`ed35a2e8` patch on `f33c914b`, input manifest
`54154c63f28b…`, 19:51–20:17Z, load 14–23). Ranges cover all three lights and
both views.

| Component | Jevica | Sable | Verdict |
| --- | --- | --- | --- |
| `roughness` | Skin ΔE 0.04–0.08, area and overlap 1.000. New gloss on the lower lip and nose tip only, which places the map's lip region on her lips. | Skin ΔE 0.05–0.18, overlap ≥0.998. | Accept |
| `pores` | Skin ΔE ≤0.05, overlap ≥0.999, no visible tiling. Specks 3–5 px apart (0.6–1 mm), plausible on the cheek, but applied evenly: the lips look pebbled, the eyelids rough and the neck like stucco at high. | Same. | Revise; not shipped |
| `coverage` | Brows with lashes cover ×1.73–2.60 the area, IoU 0.40–0.54, ΔE 1.7–6.7: thicker, longer, solid brows. Hair gains only thin slivers at card seams. Without MSAA ×1.82–2.89. | Same shape change, brow ΔE up to 12.3. Hair cards are already solid (the look's colour texture has no alpha), so nothing to cover. | Reject |
| `hairColor` | No pixel changes; her look keeps the source hair map. | Hair turns cream with mint-green streaks in every light, and a ragged seam appears at the hairline. | Reject |

Scatter and sheen were never candidates. In the whole-preset evidence they move
skin ΔE to 8.8–9.5 under dusk light (1.1–4.8 elsewhere), and the corneal shell
and iris recolor change both defaults' eye colour.

## Final set

Pending: trial run-3 on the final policy (roughness only), queued 20:33Z.
This section will record each tier against off, including hair and brow regions.

## Cost and lifecycle

Pending: three warmed 30 s samples per crowd (1, 8, 24) for off and the trial,
queued 20:33Z. The bar is at most +10% frame and CPU-submission p95 against off
at the same revision; no budget is added or loosened.

## Identity, fallback and reconnect

Pending: `default-appearance-tiers` (owner as Jevica, alice as Sable, each at
her own graphics tier; missing roughness map; reconnect), with the existing
character-fidelity, character-studio, character-studio-shared and
character-studio-tiers journeys.

## Limits

- One host: Apple M5 Max, Chromium 156.0.8078.4 (ANGLE Metal), shared with other
  agents' work. Load averages are kept with each result. No physical device.
- Pore normals were not shipped. A version that spares the lips and eyelids and
  weakens on the neck and body needs a new region mask, outside this trial.
- The reviewed `sable-human` hero golden (`preview/e2e/goldens/character-hero`)
  was recorded with imported materials on an M3 Max. With this change its pinned
  check is expected to fail until a new reference is reviewed; it was not
  replaced here.
- Morgan and Imani are unchanged; their tiers pass no component list.
