# IPIC runtime against the original photographs (#364 → #359)

Each runtime view was compared side by side with the photo it is indexed to. The views are T1–T3, captured by
`node preview/e2e/ipic-photo-views.mjs` on Metal at `083373ff` (2026-10-15, 09:12Z; in git history). After P1 was
fixed they were recaptured at `9b22f088` (23:49Z); that set and its receipt are in
`docs/design/office-ipic/captures/`.

This records what differs, the photo ID, how much it matters, and who can fix it. It is not a beauty review. The
auditorium layout was inferred from three photos, so differences there are expected and listed anyway.

**Severity:**
- **S1** breaks the read of the space.
- **S2** is a clearly wrong form, material or proportion.
- **S3** is detail.

**Owner:**
- **eng** can be fixed in the JS master without new art.
- **design** needs art direction or new assets.

| # | View / photo | Observed in runtime | Photo shows | Sev | Owner | Proposed correction |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | T2a mural / IMG_9771 | Open sky and the street above the escalator runs, from the landing | An enclosed atrium with a ceiling and downlights | S1 | eng | **Fixed 2026-10-15 (`568dda7d`):** ceilings over both flights at their upper neighbours' heights (6.7 m, 10.3 m); a test now requires a ceiling above every walkable point |
| P2 | T2a mural / IMG_9771 | The mural is on a freestanding panel seen nearly edge-on; the view frames a stair wall | The mural fills a recessed bay at the landing, flanked by stacked stone, seen head-on | S1 | design + eng | **Resolved as Val chose (2026-10-18):** the mural stays large on the east bay's back wall, now walled in, and the review camera looks into the bay from the top of the first run's east lane, at an angle as a rider sees it. Facing it head-on would need the second run to turn at the landing (a layout change) |
| P3 | T1 reception / IMG_9738 | A single-height block desk | A long two-level desk: a raised marble transaction ledge with curved ends over a lower counter | S2 | design | A two-level desk form in the master |
| P4 | T1 reception / IMG_9738 | Dark, widely spaced slats | Close warm light-oak flutes with a lit cove above | S2 | design | Flute spacing, tone and a cove light |
| P5 | T1 reception / IMG_9738 | "RIVER OAKS DISTRICT" on one line | "RIVER OAKS" stacked small beside a large "DISTRICT" on a black rounded panel | S3 | eng | **Fixed 2026-10-16 (`3028b138`):** RIVER over OAKS, small and letterspaced, beside a large DISTRICT (`districtSignLayout`) |
| P6 | T1 reception / IMG_9738 | Bright white tiles with dark joints; flat dark ceiling; ceiling spot track | Warm large-format stone floor; coffered ceiling; a low linear pendant of cylinders | S2 | design | Floor material, coffer and pendant |
| P7 | T1 reception / IMG_9738 | The camera frames the escalators | The photo faces the desk from the front left | S3 | eng | **Fixed (`3028b138`):** the camera now stands in front of the desk's west end; the photo was taken from slightly farther back |
| P8 | T2b lounge / IMG_9758 | Coil-wire pendants | Elongated woven rattan cocoon pendants | S2 | design | Pendant form |
| P9 | T2b lounge / IMG_9758 | A plain-grained coffee-table top (the table is already oval, 1.5 × 0.9 m; it looked round from the camera) | An oval table with a radial sunburst wood top | S2 | eng | **Fixed (`3028b138`):** a radial sunburst timber top |
| P10 | T2b lounge / IMG_9758 | Boxy tan chairs | Rounded cognac barrel tub chairs | S2 | design | Barrel chair form |
| P11 | T2b lounge / IMG_9758 | The script wall ("…rest of my Life.") is on the left; behind the sofa is the floral mural and the "THEATER 1" sign | The script is on the right wall; behind the sofa the lounge opens to the Tuck Room bar and daylight windows, under a laser-cut timber screen | S1 | design | Check the lounge orientation against the plan; the view may be mirrored |
| P12 | T2b, T2c / IMG_9758, IMG_9756 | High-contrast red and black concentric carpet everywhere, the bar included | A dark patterned carpet in the lounge and a timber floor in the bar | S2 | eng | **Fixed (`3028b138`):** a darker, rust-on-brown lounge carpet (`IPIC_LOUNGE_CARPET`) and boards in the Tuck Room from a = 2.65. The carpet's rings are still larger and bolder than the photo's, and the boards a shade lighter: design |
| P13 | T2c bar / IMG_9756 | A wall-backed counter with backless stools | An island bar under a suspended rack with plants and glassware; stools with backs | S2 | design | An island bar with an overhead rack |
| P14 | T2c bar / IMG_9756 | Blocky green boxes; low-poly leaves in the foreground | Dense trailing pothos from the beams | S2 | design | Foliage cards or instanced trailing plants |
| P15 | T3 auditorium / IMG_9767 | A flat floor | Stadium risers, with lit steps and a handrail down the side aisle | S1 | design + eng | Risers would change seat heights, sightlines, routes and support (needs Val) |
| P16 | T3 auditorium / IMG_9767 | The screen spans about a third of the front wall | The screen spans nearly the full wall | S2 | design + eng | Screen size; changes `IPIC_SCREEN` and #365's sightline data |
| P17 | T3 auditorium / IMG_9767 | A plain grey floor | A dark carpet with an orange confetti pattern | S3 | eng | **Fixed (`3028b138`):** a dark carpet with orange and rust flecks |
| P18 | T2a mural / IMG_9771 | Past the freestanding mural panel and under the first run, the street, its storefronts and its ground show (the district through the lane gap) | The landing is walled in; nothing outside shows | S1 | eng + design | **Fixed 2026-10-18:** the landing's bays are walled in and steel decks close the runs; a test requires every sight line from the runs and the landing to meet the interior, and an in-world probe found no outside surface from the landing |

**Not judged here:** lighting levels, which depend on the capture exposure and differ between a phone camera and the
runtime tone mapping; photographic textures with baked light (the mural, the floral wall); and any real-device
rendering.

**P1, rechecked in-world:** the T2a recapture on Metal at the fix shows the ceiling closing both runs where the
sky was. It also showed P18, which the earlier frame had hidden behind the sky.

**P5, P7, P9, P12 and P17, rechecked (2026-10-16):** Val chose these five. They were compared again in the
export's review views and the Metal recapture at `3028b138` (the captures in `docs/design/office-ipic/captures/`).

**P2 and P18, rechecked (2026-10-18):** an in-world probe on Metal sampled 144 points in each of 7 landing views.
Outside surfaces showed in 6 to 26 points per view before; after, none in the bay, mural and second-run views. The
remaining hits look back down the first run at the reception and out through its glass frontage, as intended. T2a
was recaptured at `d6f3471f`.
