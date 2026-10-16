# IPIC: finishes and the reception view from the photos

- **Task:** `ipic-photo-materials` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/ipic-photo-materials-20261015` in `../river-oaks-ipic-photo`, from main `ae541c70`.
- **Decision:** Val, 2026-10-15/16, chose five engineering-owned items from `docs/ipic-review/photo-review.md`:
  P9, P12, P17, P5 and P7.

## Change

- **P9** (IMG_9758): the lounge coffee table gets a radial sunburst timber top (`ipic-sunburst-timber`). The table
  was already oval (1.5 × 0.9 m). The review's "round" came from the camera angle, and that entry is corrected.
- **P12** (IMG_9756, IMG_9758): the lounge carpet is a dark ground with a restrained rust swirl
  (`IPIC_LOUNGE_CARPET`). The Tuck Room stands on boards (`ipic-bar-floor-timber`) from a = 2.65, west of the bar
  stools. The upper floor is now two boxes split there.
- **P17** (IMG_9767): the auditorium floor is a dark carpet with orange and rust flecks (`ipic-confetti-carpet`).
- **P5** (IMG_9738): the reception sign is RIVER over OAKS, small and letterspaced, beside a large DISTRICT
  (`districtSignLayout`; `label()` takes a `layout`). Its material name is unchanged.
- **P7:** the reception review camera stands in front of the desk's west end, as the photo does. The design
  packet's camera manifest (T1) follows it.
- **Textures:** they are painted with a seeded generator, so exports stay reproducible.
- **Exports**, regenerated through the JS master: the GLB, and the Blender file (63 meshes, 131,564 triangles,
  16 packed images).
- **Captures:** the review views in `docs/ipic-review/`, and T1–T3 in `docs/design/office-ipic/captures/`
  (Metal, `3028b138`).

## Checks

| Check | Result |
| --- | --- |
| `preview/tests/ipic-photo-finishes.test.js`, written first | Red on main (`ipic-materials.js` does not export `IPIC_LOUNGE_CARPET`); 6/6 here, after moving one floor sample out from under the IPIC Express counter |
| `node --test preview/tests/ipic-*.test.js server/tests/ipic*.test.js` | 55 pass, 1 Redis skip |
| `node --test scripts/tests/office-ipic-contract.test.js` | Failed on the T1 manifest (as intended by P7); 8/8 after updating it |
| `node scripts/export-ipic.mjs`, Blender export, `node preview/e2e/ipic-photo-views.mjs` | Passed; the receipt names `3028b138` with no errors |
| Visual, against the photos | The sign matches IMG_9738. The camera now frames the desk from the front left. The sunburst top and the boards match IMG_9758 and IMG_9756. The auditorium flecks match IMG_9767. The lounge carpet's rings are still larger than the photo's, and the boards a shade light: recorded in the review for design. |
| `pnpm run verify` | The first run stopped on the T1 manifest (contract test, fixed); the rerun passed: agent 112, preview 3331, server 753 with Redis skips, 69/69 |

## Still open in the photo review

The other 12 items are design or layout work for #359:
- P2, P3, P4, P6, P8, P10, P11, P13, P14, P15, P16;
- P18, the street showing past the mural panel.
