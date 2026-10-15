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
| Same runner, run 2 | Pending: queued behind other sessions' runs on the shared browser lock |
| `pnpm run verify` (core) | **Passed:** agent 111/111; preview 3246, plus 1 skip and 1 todo; server 581, plus 149 Redis skips (core runs without Redis); desktop 69/69 |

## Not covered

- Phones, Safari and iOS.
- The film playing (the screen is compared idle).

## Next action

Open the PR, land it, retire the worktree, and post to #368.
