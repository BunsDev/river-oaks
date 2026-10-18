# Penthouse review packet (#362): captures by stage, defects and open visual decisions

The package is original art from the JS master `preview/src/office-penthouse-furnishings.js`. It is
exported to `assets/office-penthouse/`, and its manifest entries are `repo-penthouse-*` in
`asset-manifest.json`. Captures are labelled by stage and never mixed:

| Stage | What it is | Where |
| --- | --- | --- |
| Concept | The supplied kit's generated mood and object images. Not published. | Local only, indexed by hash in `reference-index.json` (`kit-reference-*`) |
| Blockout | The graybox before #362's art, at noon and dusk, from #473's lighting pass | `docs/office-review/penthouse-lighting-{noon,dusk}.jpg` |
| Asset preview | The fixture page's own lights, not the game. Daylight 12:00 and evening 18:45. | `captures/penthouse/asset-preview/` |
| Blender preview | Cycles stills from the exported `.blend`. Daylight only. | `captures/penthouse/blender-preview/` |
| Runtime | The game on the loopback fixture: live district outlook, two accounts, hardware rendering, noon and dusk | `captures/penthouse/runtime/` |

Cameras O1-P, O2-P, O3-P, O4 and O4-T are in `camera-manifest.json`. At runtime, O2–O4 use the
office's own fixed views (Main floor, Workstations, Library, Terrace), and O1 and the seated O3s
are first person. Every runtime capture is taken with the resident seated at creative desk 01, so the
room is occupied. Nothing here is device, Safari, iOS or human visual acceptance.

## What the package contains

Twenty-five assets, each with LOD0, LOD1, a `COL_` proxy and anchors.

- **Work:**
  - the executive desk (walnut on rose-stone pedestals) and two workbenches;
  - the executive and task chairs;
  - eleven `SCREEN_DYNAMIC` displays;
  - the meeting table and chairs.
- **Hosting:**
  - the boucle lounge sofa, blush tub chairs and the rose-stone lounge table;
  - the back console;
  - walnut panelling on the back wall under the mezzanine;
  - the rose-stone arrival wall with its bronze door surround.
- **Retreat:**
  - library club chairs, side table and lamp, bookcases, and the fluted walnut backdrop;
  - terrace planters, loungers, side table and bistro set.
- **Botanical:** one standard tree in a travertine planter.
- **Shared:** rugs and pendant drums.

The asset list and the measured numbers are in the manifest and `assets/office-penthouse/export.json`.

| Measure (this Mac, M3 Max, Chromium 156 with Metal ANGLE; load 17–26) | Value |
| --- | --- |
| Office draws (scene graph, before avatars) | 92 (furnishings 48), against a provisional 150 |
| Office triangles | about 87,000 (the placed GLB reimports as 184 meshes, 87,136 triangles), against a provisional 250,000 |
| Frame draw calls in the asset preview, with the sun's shadow pass | 44 (terrace) to 98 (overview) |
| Textures | three shared 512 px surfaces (travertine, rose stone, wood); 8 textures in the frame |
| First build of the furnished office | 77 ms in the page. A repeat visit reuses the cached parts, about 14 ms in Node. Phones are unmeasured. |
| Shadow casters | 11 (the shell, the desk and table tops, the workbench and bookcase carcasses) |
| Package on disk | 9 MB: indexed GLBs, the placed office 3.4 MB, plus the `.blend` |

## Defect matrix

Severity: **high** blocks the package; **medium** needs a decision or a follow-up before activation;
**low** is a polish item. None is high. Owners: design, engineering, Val.

| Id | Severity | Defect | Proposed correction | Owner |
| --- | --- | --- | --- | --- |
| P1 | medium | The lift still reads as two floating bronze plates (the graybox platform and overhead frame), with no cab, shaft or doors. | A lift design (glass shaft or bronze cage) outside the walkable platform, with collision. The art/collision test must still hold. | design + engineering (#359) |
| P2 | medium | The lounge sofa and tub chairs are props, not plan seats. With the occupied-seat clearance (0.888 + 1.27 m), two adjacent sofa seats could not both be taken. | Decide a conversation-seat model, such as IPIC-style bench seats or a seated clearance for sofas, then add the seats. The assets already carry `SEAT` anchors. | Val/design, then engineering |
| P3 | medium | The canopy is 1,100 stylised leaf cards. It reads as a tree from the floor and as flat cards from the mezzanine (O4). | A leaf-atlas pass (alpha-tested), once a planting reference is approved. | design |
| P4 | low | The first visit builds the furnishings in about 77 ms on this Mac, during the arrival. Phones are unmeasured. | Warm the parts cache at the office door. Measure on named devices. | engineering |
| P5 | low | LOD1 is exported and measured but not selected at runtime. | Use LOD1 on the low quality tier once device budgets exist. | engineering |
| P6 | low | Static batches cover a whole floor per finish, so pieces are not frustum-culled one by one. | Revisit with device budgets. Indoors, nearly everything is in view anyway. | engineering |
| P7 | low | Floors and treads now carry the travertine map at roughness 0.6, not #473's flat 0.8. | Re-run `office-penthouse-lighting.mjs` before/after on main once #473 and this land, and retune if the floor hot-spots. | engineering |
| P8 | low | The terrace has no shade and no evening light of its own; it goes dark at dusk. | Decide the terrace activity density (an open #359 item), then add shade or planter lights. | design / Val |
| P9 | low | Rugs are flat slabs with no pile or fringe. | A wool normal map. | design |
| P10 | low | The displays are idle dark glass, and nothing binds `SCREEN_DYNAMIC` at runtime. | Optional: show the owner's own private desk on her own monitor, to her only. It needs a privacy review. | Val + engineering |
| P11 | low | At runtime on Sharpest quality, the ambient occlusion pass leaves noisy dark halos on the travertine around furniture bases (the desk pedestals, chair bases). | Tune the GTAO radius and denoise for interiors, or exclude rugs and floor-hugging bases. Compare with `?ao=off`. | engineering |
| P12 | fixed here | #363's runtime **Library** view stood 0.8 m from the back wall, looking along it, so a bookcase's end panel and the wall filled the frame. | Moved to the mezzanine's east end, looking down the library past the bookcase faces to the reading chairs. `office-views.test.js` still holds it inside the floor and clear of every landing, anchor and stand point. | engineering (this change) |

## Runtime review

`node preview/e2e/office-penthouse-review.mjs` runs two accounts on the loopback fixture: Jevica (owner) and an approved
resident. Rendering is hardware (Metal ANGLE), with the live district outlook and the time-of-day clock at 12:00
and 18:45. The receipt `captures/penthouse/runtime/result.json` records the checks, every capture's
floor, seat and position, the load average and the scene sources' hashes.

| Capture | Stance | Shows |
| --- | --- | --- |
| `O1-arrival-standing` | owner, standing, first person at the arrival | The executive desk on rose stone, the panelled back wall, the library above, and the resident seated at bench A. |
| `O2-main-floor-view` | owner's Main floor view (her own body in frame) | Hosting and work: the lounge, the executive desk and the benches, with the resident seated. |
| `O3-workstation-seated` | resident seated at creative desk 01, first person | Two idle `SCREEN_DYNAMIC` displays at arm's length, the desk pad, a cup. |
| `O3-workstations-view` | owner's Workstations view | Bench A occupied. |
| `O3-executive-seated` | owner seated at the executive desk, first person | Three idle displays, the pad and books. |
| `O4-library-view`, `O4-terrace-view` | owner's Library and Terrace views | The mezzanine library and the terrace retreat. |
| `overview` | owner's Overview | The whole programme, occupied. |

The asset preview and Blender preview are not the runtime: they use their own lights and no avatars.

## Open visual decisions (not defects; for Val and design)

- **Rose stone's extent.** It covers the whole arrival wall (6 × 7.6 m), the desk pedestals, the lounge
  table and the reading table. At dusk the arrival wall reads terracotta.
- **Lounge orientation.** The sofa faces the street glazing, with the chairs' backs to the desk zone.
  The alternative faces the terrace.
- **Back panelling tone.** Walnut under the mezzanine warms the room, but darkens the back in the evening.
- **Tree species and form.** The tree is a standard with a clear trunk to 2.9 m; its canopy must
  stay above the tallest body plus 0.3 m wherever it overhangs the floor.
- **Chair styles.** Blush task chairs throughout; the executive chair is deeper blush with bronze.
- **Terrace programme** (P8), and **lounge seating** (P2).
