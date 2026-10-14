# Office + IPIC review matrix (G0/G1, design side)

Class: **observed** is what the code or a verified file does today; **inferred** is
an estimate the build relies on; **proposed** is the kit or a review proposal with
no approval. Owner names who resolves the item: design, engineering, or Val. The
engineering rows that live in `layout-contract.json` and `camera-manifest.json`
are listed here only so the matrix is complete; their numbers are in those files.

| Id | Item | Class | Owner | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| R01 | Office is 9 × 7 m, 3.9 m high, one level, door 1.7 × 2.6 m | observed | engineering | `workplace-room.js`, `store-rooms.js` | baseline, keep as default |
| R02 | Avatar envelope 0.505 / 0.888 / 2.45 / 1.27 m from 22 rest-pose appearances | observed, inferred for motion | engineering | `avatar-envelope.json` | re-measure largest rig, turning and seated envelopes (#360 engineering) |
| R03 | Office movement: 2.6 m/s budget, swept segments, chairs collide | observed | engineering | `office-contract.js`, `server/offices.js` | keep |
| R04 | Office authority: admin owner, invite/approve/deny/revoke, revoke ends visit, checkpoint v6 | observed | engineering | `server/offices.js`, `docs/offices.md` | keep; #361 extends to levels |
| R05 | Arrival film 10.6 s, lift rise 24.3 m, car 3.2 × 4 × 3.3 m | observed, dimensions inferred | design | `office-arrival-model.js` | keep; the rise bounds any penthouse volume (R20) |
| R06 | First-person eye at `[x, 1.68, -d]`; kit `(x,d,h)` is Three `[x,h,-d]` | observed | engineering | `office-scene.js`, kit manifest `gltfAxes` | verified once; checker refuses other conventions |
| R07 | Two logical companion stations regardless of rendered desks | observed | engineering | `workplace-contract.js` | keep; five kit computers do not change it |
| R08 | IPIC footprint 13 × 34 m, two 3 m rises, one support height per XY | inferred | engineering | `ipic-plan.js`, `docs/ipic-interior.md` | keep for this round; survey needed for literal fidelity (#364) |
| R09 | IPIC seats: 2 sofa + 8 recliners via existing sit/stand | observed | engineering | `configureIpicRoom` | keep; seat anchors for #366 |
| R10 | IPIC lift doors decorative, treads static | observed | Val | `docs/ipic-interior.md` | decision 4 in the brief |
| R11 | IPIC screen is an illuminated surface, no playback state | observed | engineering | `docs/ipic-interior.md` | #365/#366 define playback contract |
| R12 | Five IPIC photo views (reception, mural, lounge, bar, auditorium) with eye/target | observed | engineering | `IPIC_CAMERAS`, `docs/ipic-review/review.json` | reuse as T1–T3 in `camera-manifest.json` |
| R13 | 44 IPIC photographs, hashed, no redistribution license | observed | design | `assets/ipic/references/manifest.json` | keep as colour and material direction |
| R14 | Kit: 30 × 20 m main floor, 7.6 m clear, mezzanine 180 m² at +3.8, terrace 160 m² | proposed | Val | kit `layout.json`, `docs/production-guide.md` | layout selection, see R20 |
| R15 | Kit stair 3.2 m wide, 22 risers, ramp collision; two 4 m terrace portals | proposed | engineering | kit `layout.json`, kit spatial validation | numbers in `layout-contract.json` |
| R16 | Kit stations: executive desk with 3 displays, four creative desks with 2 each | proposed | design | kit `layout.json` stations | seat/approach anchors kept; capacity per R07 |
| R17 | Kit blockout 41,864 triangles, 647 nodes, 2.78 MB; every proxy under LOD0 target | proposed, measured by the kit | design | kit `asset-manifest.json`, `asset-manifest.json` here | budget check passes; targets are proposals |
| R18 | Kit starter materials: 5 families, 512 px, factor-only in GLBs | proposed | design | kit `materials/README.md` | bind after final UVs |
| R19 | Kit bytes not committed; approval to publish not recorded | observed | Val | kit `README.md` provenance | decision 1 in the brief |
| R20 | Physical fit of 7.6 m volume above the 24.3 m rise in the mapped building | proposed, conflict | Val | engineering baseline measurement | decision 2; blocks G1 |
| R21 | Library revision 3: two chairs at d 18.3, bookcase-0 and table removed, east passing bay | proposed | Val, design | scale-review `library-final-plan.md`, `passing-bay-check.json` | decision 3; no runtime proof |
| R22 | A 2.4 m gallery cannot pass two 1.776 m standing diameters | observed arithmetic | design | scale-review `library-layout-decision.md` | design constraint for any mezzanine |
| R23 | Scale review captures 01–19 and route receipts | observed, of the kit walkthrough | design | scale-review `walk.json`, `views.json`, PNGs | prototype only; not full-cast acceptance |
| R24 | Handoff briefs C0–C5 and D0–D4 not found | observed absence | Val | `reference-index.json` missing entries | decision 5 |
| R25 | Open interiors stack #349–#358 owned by other sessions | observed | engineering | PR bodies 2026-10-14 | keep/reuse/avoid recorded in the brief |
| R26 | Review cameras O1–O4 and T1–T3 frozen with eye, target, FOV, viewport, quality | proposed | engineering | `camera-manifest.json` | not in this branch |
| R27 | Baseline captures with avatars on real materials | observed | design | `captures/receipt.json`, journeys passed at `7feef523` | eight office views O0–O3 captured; IPIC keeps `docs/ipic-review`; no O4 yet |

Agreement record for G1: the design side agrees to the observed rows as the
baseline and to R06 as the single axis convention. Rows R14, R19, R20, R21, R24
need Val. Rows R15, R16, R26, R27 wait on the engineering packet. No row here
activates a layout or changes a default.
