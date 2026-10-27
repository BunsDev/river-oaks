# Interior depth correction and regression evidence

This follow-up builds on PR #695 at `3d666a2982b1c422f1ad7e1d0acde9dc3b8d13e8`. Its second increment, shared-frame gap correction and paving repair are already incorporated. The independent triage is [recorded on #695](https://github.com/BunsDev/river-oaks/pull/695#issuecomment-6433393987); that older review's counts describe its older head.

## Focus and visibility

| Candidate | Evidence and player relevance | Treatment |
| --- | --- | --- |
| Boutique wall and fitting-table mirrors | Actual geometry and front-facing ray tests reproduce brass covering the reflective centre. Near-coplanar vertical joins matter at display approach/turn distances; prior modelled onset was roughly 1.5–1.8 m. | Replace the slab with four brass border bars. Keep the freestanding mirror's opaque rear face. Preserve placement, reflective material, frame silhouette and collision. |
| IPIC reception wall/coffer ends | Isolated actual geometry reproduces plaster/timber sharing exposed end planes. A normal entrance/turn is more relevant than a long-distance room-wide class count; prior modelled onset was roughly 0–5 m. | Fit the reception ceiling and coffers to the walls' inner faces. Preserve desk, flutes, lighting, openings and room dimensions. |
| Premium frontage | The owner's second increment already addresses facade layers, sills and caps. The large Hermès overlap identified in triage faces downward; its size alone does not establish a visible shopfront problem. | Preserve that work. Require a specific exposed face and route capture before another facade edit. |
| Gardens guards, skywalk and terraces | Vertical guard/stone and bronze/partition candidates remain. Transparent guards and intentional layers need view-specific examination. | Follow-up route inspection; no global glass/depth-write change. |
| Axe layers, IPIC mural/booth/fridge layers, green roofs | Several predicted failure distances exceed the room sightline; some roof/campus candidates are undersides. These are candidates, not confirmed walking-route flicker. | Retain intentional layering and architectural quality pending visible-route evidence. |

Onset distances are the existing model's estimates, not observed physical-GPU distances. The town scan is streaming coverage, not a continuous movement or camera-visibility test.

## Regression protection

The old 292-entry file at this base contains material-pair classes. Version 2 binds exceptions to a 4 m spatial cell, face direction, actual world overlap bounds, triangle-pair count, overlap area, width and minimum separation. Station observations use maxima, not three copies of the same defect. Ordinary record mode compares first, refuses additions/enlargement/relocation and removes resolved exceptions; tolerated noise cannot widen budgets over repeated recording.

The extractor now follows live, visible BatchedMesh instances and geometry ranges under parent transforms; intersects draw ranges and material groups correctly; and compares instance tint, active vertex colours and texture-selected UV interpolation rather than assuming identical materials look identical. Unknown shader patches are conservative. The physical-surface material gained descriptive audit metadata, with no shader-policy change.

A failing regression also exposed a traversal-order dependency: a bucket's projection frame used its first face's exact normal. A canonical normalized bucket direction now makes the measured bounds independent of unrelated geometry order. The expanded, canonical detector was migrated only on the exact unchanged base geometry; it observed **9,296 bounded occurrences**. This larger count is expanded diagnostic coverage, not thousands of new geometry defects. The legacy class summary remains informational.

The focused fixes reduce that snapshot to **9,255**, removing 23 brass/mirror, 16 brass/leather backing and two reception plaster/timber occurrences. No new, enlarged or relocated occurrence was accepted. A broader generic wall/soffit trim experiment failed this rule and was removed from the increment; its resulting newly exposed overlaps were not added to the baseline. General boutique-shell joints remain a separate investigation.

This is stronger geometry regression protection, not proof that all permitted occurrences are visually acceptable. The pre-existing plane-offset broad phase can still miss near-parallel overlaps far from the origin. Small/alpha-cut/moving geometry exclusions and sampled occlusion remain. Route, light, camera and target-device acceptance remain necessary.

## Controlled rendering evidence

The reception captures use the existing `preview/e2e/fixtures/ipic.html` camera, lights and reference textures, at 1280 × 900. The before image was captured with exact base geometry and the after image with this follow-up. Both use Chromium 141.0.7390.37 headless shell, SwiftShader and the locked Playwright driver. Downloads of the locked Chromium 156 and runtime Chromium 151 failed archive validation; this alternate software renderer is disclosed rather than presented as the target environment.

- [Before reception](reception-before.png)
- [After reception](reception-after.png)
- [Pixel comparison](comparison.json)

Both captures: 59 rendered calls, 109,062 triangles, 17 textures, GL error 0. Exactly 864 pixels change (0.075% of the image), all within the top 232 rows containing the ceiling/coffer edges; mean absolute RGB-channel difference is 0.004683 on the 0–255 scale. The desk, floor, wall finishes and other room silhouettes are preserved in this view. These images were inspected side by side. A static fixture comparison cannot establish daylight/dusk movement parity, phone quality or physical-GPU timing.

Geometry allocation probes over the actual planned generic boutiques and isolated IPIC use textures disabled/nonpainting canvas stubs. They count visible mesh allocations before culling, not frame submission timing. Generic boutiques: 318 → 319 mesh batches, 512,818 → 513,288 triangles, geometry buffers unchanged at 196,944 bytes, instance buffers 721,164 → 724,204 bytes. IPIC remains 70 mesh batches, 136,340 triangles, 5,857,304 geometry bytes and 192 instance bytes. The additional shared rear-cover batch preserves the fitting mirror's rear appearance. Existing performance thresholds are unchanged; target-device performance is unverified.

## Verification and remaining acceptance

The implementation ledger records failing-first cases, reviewer findings and exact command outcomes: [depth review hardening](../../superpowers/plans/2026-10-27-depth-review-hardening.md).

The final shrink-only recording journey passed 13 checks, including all five shader probes, with no page or shader-compile errors. All three scans were untruncated: 1,177,702 / 1,212,499 / 1,265,962 faces, taking 46.033 / 78.724 / 54.988 seconds on this software runner. The diagnostic class summary is 430 → 425 under the expanded canonical detector; it is not comparable to the legacy 292 classes. [Structured results and exact source hashes](results.json) preserve the renderer and allocation scope.

The standard reproduction command is `pnpm run test:experience depth-layers`. Local execution used a temporary runner around the same journey and authenticated fixture to select the disclosed alternate Chromium, rewrite fixture/import URLs and capture the existing reception view. It did not change depth thresholds or assertions. `RIVER_OAKS_DEPTH_LAYERS_RECORD=1` compares before shrinking; migration was run only on the recorded unchanged geometry.

`pnpm run verify` is blocked locally at tooling: 284/289 pass and five unchanged `project-prune-cancel` tests fail because native `ps -axo command=` reports `fatal library error, lookup self`. The isolated unchanged-tooling control reproduces all five. No safety guard was relaxed. Full preview and the remaining core profiles are running separately; their results must be reconciled before merge readiness.

The source changes do not alter global camera depth, clipping planes, material policy, authoritative movement or collision. This work remains a draft increment pending hosted checks and player-height approach/strafe/turn/back-away captures at fixed daylight/dusk settings on desktop and phone profiles. No merge, deployment or physical-device visual/performance acceptance is claimed.
