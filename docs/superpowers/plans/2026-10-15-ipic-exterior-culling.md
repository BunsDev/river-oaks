# IPIC auditorium: stop drawing the district while viewers face the screen (2026-10-15)

Task `ipic-exterior-culling` · branch `exp/ipic-exterior-culling-20261015` · worktree `../river-oaks-ipic-culling-20261015` · owner claude:river-oaks-1b (b929a625).

This follows #428's finding: inside IPIC, the frame still draws the district behind the interior walls.

## Objective

Viewers spend a whole film in the auditorium. #428 measured 789 draw calls and 3.5M triangles there, of which the room's own geometry is a small part. The goal is to remove the rest without changing a single pixel.

## Why only the auditorium

An experiment with a temporary development hook (not committed) hid everything outside the interiors layer at ten IPIC poses. The auditorium and the seated screen view were **pixel-identical**. Everywhere else, the district is genuinely visible:

| Area | What shows the district (pixels that changed when it was hidden) |
| --- | --- |
| Reception | the glazed frontage (36 %) |
| Gap between the escalator lanes | a see-through to the neighbouring building (30 %; recorded by #364) |
| Tuck Room bar | its window onto the street (5 %) |
| Lounge | a sun shadow cast from outside onto a tub chair (0.9 %) |
| Upper facade and lounge views looking down | glazing (18–21 %) |

So the district stays for all of IPIC except the auditorium. That room is closed apart from its back partition: the cinema wall at d = 26, 6 m above the street floor, with the doorway at a = −4.7 (`ipic-plan.js`).

## Change

- **`preview/src/interior-exterior-culling.js`**
  - The plane test is factored out, with no behaviour change for generated rooms.
  - It adds `canCullIpicAuditorium(camera, room)`. This is true only when two things hold:
    - the camera is inside the auditorium: behind d = 26, within the room's width and depth, and between 6 m and the room's top (10.4 m);
    - the whole partition plane, at the room's full width and up to its top, is outside one frustum plane.
  - The district is not drawn whenever the doorway, or anything over the partition, could be in view.
- **`preview/src/main.js`**
  - The render loop drops the district, through the existing `renderWithoutExterior`, when the player stands in IPIC and that test holds.
  - It uses the same `walking.environment.roomAt` lookup as the screening.
  - Development only: `__riverRenderAudit.exteriorCulling(on)` compares frames, and `__riverExteriorCull()` now reports `ipic`.
- **`preview/tests/interior-exterior-culling.test.js`**
  - The real IPIC room is used.
  - The plan's two cinema walls must sit at the culling constants (d = 26, 6 m), span the room's width with the doorway, and reach its top.
  - The seated eye and the review pose cull.
  - These do not cull: the view back to the doorway, a sideways view from the back row, the lounge, the reception, above the top, a non-IPIC room, and the generated-room test applied to IPIC.
- **`preview/e2e/ipic-exterior-culling.mjs`**, a browser regression on Metal with reduced motion and the film not started.
  - At each auditorium pose, it captures the frame with culling on and off.
  - Where culling fires, the frames must match pixel for pixel, consecutive frames must match too (so the comparison is valid), and draw calls must fall.
  - Where it must not fire, the decision must be false, and the counts must stay within 5 %, because animation seen through the doorway moves them slightly.
  - Then alice walks to a front-row recliner, sits, and her own camera is checked the same way.

## Checks

| Command | Result |
| --- | --- |
| `node --test preview/tests/interior-exterior-culling.test.js` | 4/4 (two existing, two new) |
| Focused: culling, `ipic-*` and `generated-*` tests | 41 pass, 1 todo, 0 fail |
| Browser regression, run 1 | Setup failure: the hidden walking console hid the seat picker. Fixed. |
| Browser regression, runs 2 and 3 | **Every culled frame was pixel-identical** to the unculled one. Both runs failed only on checks that were too strict at the doorway pose, where nothing is culled. There, consecutive frames differed by 1,926 and 2,693 px, and the counts moved from 1,701 to 1,683, because of animation seen through the doorway. The noise check now applies only where culling fires, and non-culled counts get 5 % tolerance. |
| Browser regression, run 4 | **Passed**: every pose as expected and every culled frame pixel-identical |
| Browser regression, run 5 (adds interleaved seated timing with vsync off; load average 12–14) | **Passed**, with the same counts and 0 changed pixels. Receipt: `2026-10-15-ipic-exterior-culling/receipt.json` |
| Mutation proof: `canCullIpicAuditorium` ignores the partition (returns true anywhere inside the auditorium), then restored (`cmp` identical) | **The unit suite failed (3 pass, 1 fail)**, on the doorway and sideways cases. The restored file passes 4/4. |
| `pnpm run verify` (core) | **Passed:** agent 109/109; preview 3207, plus 1 skip and 1 todo; server 580, plus 149 Redis skips (core runs without Redis); desktop 69/69. It ran before the browser runner gained its timing step, which is not part of core. |

### Run 5 numbers (draw calls and triangles, culling off → on; changed pixels)

| Pose | Culled | Calls | Triangles | Changed px |
| --- | --- | --- | --- | --- |
| #364 review pose | yes | 771 → 314 | 3,372,812 → 746,722 | 0 |
| Front-row eye on the screen | yes | 612 → 240 | 3,031,507 → 698,738 | 0 |
| Back centre on the screen | yes | 628 → 269 | 3,097,356 → 739,270 | 0 |
| Front row to the left wall | yes | 627 → 255 | 3,147,619 → 673,886 | 0 |
| Front row to the right wall | yes | 1,391 → 560 | 4,583,786 → 1,212,178 | 0 |
| Ceiling | yes | 603 → 256 | 3,009,441 → 703,956 | 0 |
| Back to the doorway | no | 1,701 / 1,719 | 5,704,588 / 5,707,616 | 0 |
| Back row sideways | no | 674 / 674 | 3,265,011 | 0 |
| **alice seated, her own camera** | yes | **564 → 218** | **2,662,513 → 358,392** | 0 |

### Frame time at alice's seated view (run 5)

Culling on and off were interleaved in 180-frame windows, three of each. Vsync and the frame cap were off, so these are render cost, not the display rate.

| | Interval p50 | Interval p95 | Render CPU p50 |
| --- | --- | --- | --- |
| Culling off | 7.6 ms (7.5–7.7) | 11.0 ms | 6.9 ms |
| Culling on | **5.4 ms** (5.2–5.6) | **8.2 ms** | **4.7 ms** |

That is about 29 % less frame time, and it is consistent in every pair. Phones, whose GPUs are far weaker, were not measured.

About 0.7M triangles remain when culled. The interiors layer holds every store's interior in the district, not only IPIC's.

## Not covered

- Phones, Safari and iOS. The browser regression runs only on this Mac's GPU.
- The film playing: video frames change between captures, so the screen is compared idle. Culling does not touch the screen's material.
- Generated rooms keep their own test unchanged, through the shared plane helper.

## Next action

Open the PR, land it with `pnpm run land <pr> --owner claude:river-oaks-1b`, retire the worktree, and post the result to #368.
