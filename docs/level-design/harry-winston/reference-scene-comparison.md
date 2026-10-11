# Harry Winston reference comparison

Browser Three.js, district scene, 2026-10-09, base 22d0043 plus local patch on `codex/harry-winston-reference-20261009`. Units: metres; data east/north/up maps to Three.js east/up/negative north. This is a local architectural reconstruction, not native Unreal or surveyed-site acceptance.

## References and camera

- REF-HW-01: user supplied Street View screenshot, Google 2025 watermark, full facade and foreground planting. Lens, location, capture month and camera height are unknown. Used for qualitative comparison; not a runtime texture.
- REF-HW-02: [Harry Winston official Houston opening photograph, July 2016](https://www.harrywinston.com/en/the-house/news-and-events/news16_openinghouston). Confirms the stone facade, awning profile, iron rails, recessed arch and tree composition; older planting is not evidence of current botanical placement.
- Both references are retained only in ignored `output/playwright/harry-*-reference.*`. No photo is distributed with the runtime.
- CAM-HW-01: fixed fixture `[east,north,height above building datum]=[-2774,-1356,1.8]`, target `[-2758,-1359,5.4]`, world camera `[-2774,20.010636806322427,1356]`; 62° vertical FOV, 1600×1000, clear 15:00, ACES exposure 0.95, no characters or tree layer. Baseline and updated PNGs and matching metadata live in `output/playwright/harry-{baseline,updated}-matched.*`. The metadata helper passes; this is not a calibrated match to Street View.
- CAM-HW-02: closer view `[-2771.5,-1356.5,1.8]` targeting `[-2758,-1359,5.3]`, same projection/render settings, tree layer present. `harry-winston-reference.png` shows the final reference study.

## Findings and implementation

| Element | Baseline difference | Change and remaining limit |
| --- | --- | --- |
| Mass and bays | Generic glass shopfront and continuous retail fascia | Dedicated two-story, five-upper/four-lower-bay stone frontage; mapped door and bay boundaries retained. Width 22.49 m and height 11.5 m are authored fits, not survey measurements. |
| Entrance | Small torus arch, plain glass door | Broad segmented arch, recessed jambs, fanlight, black/brass grille following the existing swinging leaf. Clear opening 1.8 m; no static grille across the route. Ornamental carving and exact filigree remain simplified. |
| Windows | Broad teal rectangles | Narrow dark glazing, projecting navy HW awnings, crossed iron rails and stone sills. Exact reflection/curtain appearance remains approximate. |
| Stone/signage | Generic ceramic/teal materials | Cream limestone courses, cornices and serif metal-toned signage. Procedural stone grain is not the photographed travertine scan. |
| Planting | Door-flanking pots; inferred foreground stem obscured windows | Local chamfered bed, five clipped shrubs, green and purple lance-leaf ground cover. Two watering IDs now point at visible bed shrubs. Species and exact leaf shapes are authored approximations. |
| Tree composition | Short right-hand crown plus an extra inferred middle stem | Right-hand source stem `[-2761,-1365]` retained, estimated height 12 m/radius 2.6 m; inferred `[-2761,-1355]` support omitted by the shared selector. This omission is a photographic interpretation, not proof the source support was a duplicate. Other streets retain their source records. |

## Topography and collision review

The source declares USGS 3DEP/NAVD88. Native source resolution is ~1 m, but the actual exported raster is 8.8193 m, bilinearly sampled into the 65×65 runtime grid at 3.9679×4.5380 m. It cannot establish centimetre curb heights, tree rooting, or pavement joints. No DEM, footprint or road-source data was rewritten.

The eight bed corner supports range from 18.35361 to 18.42143 m, a 6.8 cm change; the mesh samples the existing ground at each corner instead of imposing a flat base. The 14 cm curb is an inferred decorative edge. At the mapped doorway, ground support is 18.42535 m versus building datum 18.21064 m; the established room threshold/floor contract remains intact and physical crossing was tested. This is not a survey discrepancy correction.

The bed remains outside mapped vehicle lanes and more than 3 m from the door center. The tree's square grate is excluded where the new soil bed covers it. Shared resident navigation continues to block the retained trunk, verified by the negative trunk test; the existing absence of player trunk collision is not changed or claimed fixed. Canopy/facade bounds were reviewed visually, not by exhaustive triangle intersection tests. No new player collider was added for decorative ground cover.

## Evidence and limits

- Focused suites: 27 passed, zero skipped, covering facade ownership/no overlap, retained door, planting/road clearance, stable watering IDs, source immutability, corrected trunk navigation and grates.
- Required fixture `storefront-threshold`: passed 21 route legs across Harry Winston, Hermès, Vince and Steak 48, using keyboard/drag input and a second client observing positions. Harry Winston center and left entry/exit passed. No teleport across the threshold. Final leaf-detail-only addition does not change these movement paths.
- Required fixture `sit-and-water`: passed shared seating and watering, at the harness-selected Alice + Olivia planter. Harry Winston target coordinates are covered by focused tests, not a dedicated watering browser journey. Reports: `data/reports/harry-winston-{threshold,watering}-20261009.json`.
- Existing facade browser resource check: 70 canvas textures disposed exactly once; no page errors.
- Core gate passed: agent 17; preview 2508 passed/1 skipped; server 276 passed/102 skipped; desktop 9; Python 141 passed/2 warnings. Build/lint/format/secret scan passed. Full Redis/browser/native/live auth and human acceptance are separate.
- CAM-HW-01 render counts: baseline 512 calls / 1,559,515 triangles; updated 603 / 2,148,437. CAM-HW-02 with trees: 621 / 2,380,607. These whole-fixture counts include shadows and other blocks; they are a measured rendering-cost increase, not an FPS benchmark. Shared browser harness reports Apple M3 Max / ANGLE Metal. Target performance remains unaccepted.

Status: local implementation and listed checks complete; **pixel-perfect acceptance remains open**. Exact Street View link/neighboring angles, camera calibration, stronger stone/botanical assets and target-performance review are needed for that stronger claim. No commit, PR, deployment, native modification or publication. Keep the worktree until delivered.
