# IPIC auditorium, round 2: draw only IPIC (2026-10-15)

Task `ipic-auditorium-interiors` · branch `perf/ipic-auditorium-interiors-20261015` · worktree `../river-oaks-ipic-interiors-20261015` · owner claude:river-oaks-1b (b929a625).

Val chose "More IPIC performance" on 2026-10-15. This follows #431, which stops drawing the district in the auditorium.

## Objective

With #431, a seated viewer's frame still drew every other store's interior. Those are behind IPIC's walls and never visible from the auditorium. The goal was to remove them too, without changing a pixel.

## What was still drawn (experiment, temporary hook, not committed)

At alice's front-row seat, with #431's culling on, the frame was 218 calls and 671k triangles. bob stood on the street. Each remaining group was hidden on its own and the frames compared:

| Group | Calls | Triangles | Pixels changed |
| --- | --- | --- | --- |
| All store interiors (`Boutique interiors`) | 171 | 353,808 | yes (contains IPIC) |
| IPIC's own interior (`IPIC River Oaks`) | 61 | 196,060 | yes; must stay |
| Every other store's instanced batches, one at a time | up to about 8 calls / 19k triangles each, about 110 calls / 158k triangles together | — | 0 each |
| Store people, generated room shells, birds, player creations | 0 beyond frame noise | — | 0 |

The frame-to-frame noise was one small object: ±9 calls and ±1.5k triangles.

## Change

- **`interior-exterior-culling.js`**
  - New `renderOnly(root, keep, render)`. For one render, it hides every visible branch under `root` that holds none of the kept objects, opens the branches that do hold one, and restores all of it afterwards, even if rendering throws.
  - `renderWithoutExterior` is now `renderOnly(worldGroup, [interiorsLayer])`. Its behaviour is unchanged, and so is its test.
- **`main.js`** (auditorium branch)
  - The frame keeps only IPIC's interior root and IPIC's own people group.
  - If the IPIC root is missing, it falls back to #431's exterior-only culling.
  - Generated rooms are unchanged.
- **`ipic-interior.js`:** the root carries `userData.interior = 'ipic-photo-v1'`, so it is found by data, not by its display name.
- **Unit test:** `renderOnly` keeps two deep branches (it opens their parents and hides siblings at each level), leaves a hidden branch hidden, and restores everything after a throw.

## Checks

| Command | Result |
| --- | --- |
| `node --test preview/tests/interior-exterior-culling.test.js` | 5/5 |
| Focused: culling, `ipic-*` and `generated-*` tests | 43 pass, 1 todo, 0 fail |
| `node preview/e2e/ipic-exterior-culling.mjs` (#431's on/off pixel comparison, now covering the extended culling), run 1 | **Every culled pose was pixel-identical**, with the seated own camera at 555 → 99 calls and 2.66M → 0.20M triangles. The run failed on one check: at the back-to-doorway pose, where culling correctly did not fire, the on and off frames differed by 1,255 px (max channel difference 36). Both frames take the same render path there, so this is animation seen through the doorway, the same noise as #431's runs 2–3. The pixel-equality check now applies only where culling fires. The decision and the 5 % count check still cover the other poses. |
| Same runner, run 2 | Failed, as a test artefact rather than a rendering one. The first pose's culled capture differed by 453,183 px because the first-visit welcome overlay ("IPIC Theaters / Welcome inside / Continue") opened late under load and closed by itself before the unculled capture. The 3D scene under it matches #431's culled frame of the same pose. Every other culled pose was pixel-identical (seated own camera 564 → 108 calls, 2.66M → 0.20M triangles; seated p50 10.2 → 5.9 ms). The runner now dismisses `.store-intro` after entering. |
| Same runner, run 3 (receipt `2026-10-15-ipic-auditorium-interiors/receipt.json`) | **Passed.** Every culled pose was pixel-identical. The doorway and back-row sideways views correctly did not cull. |

### Run 3 numbers (culling off → on; #431's culled values for comparison)

| Pose | Calls | Triangles | Changed px |
| --- | --- | --- | --- |
| #364 review pose | 780 → **152** (#431: 314) | 3,374,326 → **570,204** (#431: 746,722) | 0 |
| Front-row eye on the screen | 612 → **140** (240) | 3,031,507 → **545,384** (698,738) | 0 |
| Back centre on the screen | 628 → **152** (269) | 3,097,356 → **570,204** (739,270) | 0 |
| Front row to the left wall | 627 → **140** (255) | 3,147,619 → **526,920** (673,886) | 0 |
| Front row to the right wall | 1,391 → **138** (560) | 4,583,786 → **526,352** (1,212,178) | 0 |
| Ceiling | 603 → **144** (256) | 3,009,441 → **545,920** (703,956) | 0 |
| **alice seated, her own camera** | 555 → **99** (218) | 2,660,999 → **199,130** (358,392) | 0 |

### Frame time at alice's seated view (run 3)

Interleaved windows, three on and three off, with vsync off:

| | Interval p50 | Interval p95 | Render CPU p50 |
| --- | --- | --- | --- |
| Culling off | 9.2 ms | 14.5 ms | 8.5 ms |
| Culling on (this change) | **5.9 ms** | **9.6 ms** | **5.1 ms** |

That is about 36 % less frame time. #431 alone measured 29 % in a quieter window. Runs 1 and 2 measured 9.6 → 6.0 ms and 10.2 → 5.9 ms.
| `pnpm run verify` (core) | **Passed:** agent 111/111; preview 3246, plus 1 skip and 1 todo; server 581, plus 149 Redis skips (core runs without Redis); desktop 69/69 |

## Not covered

- Phones, Safari and iOS.
- The film playing (the screen is compared idle).

## Next action

Mark #435 ready, land it with `pnpm run land 435 --owner claude:river-oaks-1b`, retire the worktree, and post to #368.
