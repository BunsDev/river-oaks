# IPIC auditorium from IMG_9767 (photo review P15, P16)

- **Task:** `ipic-auditorium-photo` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/ipic-auditorium-photo-20261018` in `../river-oaks-ipic-auditorium`, from main
  `89c9ba6a`.
- **Decision:** Val chose all four photo areas, said to start the auditorium after the Tuck Room landed, and
  authorized merging it to main (2026-10-18).

## Change

- **P15, stadium risers (`IPIC_RISER`, `ipicFloor`):**
  - The back row's platform stands 0.4 m over the front row's floor.
  - Steps up just inside the doorway (d 26.15–27.35, across the room) and down both side aisles (d 30.05–30.95)
    are continuous ramps underfoot. They are drawn as 10 cm treads with lit nosings, like the escalator
    flights. The west aisle's handrail follows them.
  - Across the seats (a −3.3 to 4.4) a riser wall closes the drop. It stops behind the front row's backs so
    their cushions stay usable, and short blocks close the gaps between those recliners.
  - The east aisle keeps the way round the front that the widest accepted body takes to the back row's east
    seats; it can't pass behind the seated back row.
- **Seats on their own floor:**
  - Recliners, their colliders and their seated eye pitch follow their row's floor.
  - The review data's eye heights and sight-line points do too. A fixed floor of 6 had placed recliner-0-1's
    sight line through the arms.
  - Server tests now expect back-row sitters and stand spots on the riser.
- **P16:**
  - The screen is 12.1 × 3.6 m (was 9.8 × 3.25): 93% of the front wall, under the 10.4 m ceiling, centred where
    it was (a 0.3, d 33.79).
  - The agreement test's screen allowance (0.13 m in front of the wall) widens with it.
- **T3** looks from the back row's platform down the west aisle's lit steps to the screen.

## Results

| Measure | Before | After |
| --- | --- | --- |
| Back-row seated eye over the front floor | 1.22 m | 1.62 m |
| Back-row hidden screen bottom | 35% | 22% |
| Lowest screen height every seat sees | 2.01 m | 1.44 m |
| Front row horizontal field | 104–119° | 120–130° |
| Widest accepted body: sit spot for every recliner, others seated | 8/8 | 8/8 |
| Front-row aisle (footrests to seated bodies) | 0.891 m | 0.891 m |

## Checks

| Check | Result |
| --- | --- |
| New tests, written first: riser height and continuity, raised cushions, lit aisle nosings, riser wall, handrail height, screen extent and corners | Failed first: a flat floor, no lit steps, a 9.8 m screen. They pass now. |
| IPIC, darts, room-exit and contract tests | 85 pass, 1 Redis skip |
| `REDIS_URL=<isolated 127.0.0.1:6493> node --test server/tests/ipic-routes.test.js` | 7/7, no skips |
| Exports (70 meshes) and `ipic-photo-views.mjs` (Metal) | Passed: 70 meshes; T1–T3 recaptured at `bba53099` with no errors. T3 looks down the lit west-aisle steps past the risers to the screen, as IMG_9767 does. |
| `node preview/e2e/ipic-runner.mjs` | Passed 8 checks. The first run failed because its own height check expected floor + 6 where the walk ends, which is now the back row's riser (6.4); the check now reads `ipicFloor`. |
| `pnpm run test:screening` | Passed, on the risers and the new screen (`5fe0c25e`). |
| `node preview/e2e/ipic-exterior-culling.mjs` | Passed with no changed pixels. The first run failed deterministically: 1 px changed by 12 at the east aisle's first lit nosing. A probe saving both frames traced it to sunlight through a flush seam where the treads met the riser wall and seating slab at a 4.4. Those seams now overlap inside solid geometry. |
| `pnpm run verify` | Passed: agent 116, preview 3412, server 753 with Redis skips, 76/76 |

## Gaps

- While the approved 16:9 short plays, its pillarbox sides merge with the black wall, so the picture looks
  smaller than the screen. Cropping the approved cut to fill the screen was not considered.
- The front row's horizontal field is now 120–130°: an immersive front row, as at IPIC.
