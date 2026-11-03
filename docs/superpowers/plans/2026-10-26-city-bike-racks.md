# More bike racks around the District

## Objective
Val asked (2026-10-26): "place more bicycle racks around the city." Add curbside
racks with bikes to take, beside the plaza rack, without moving the plaza rack's
slots and without changing the cycling rules.

## Ownership and baseline
- Owner claude:river-oaks-f1 (613f8aea), register task `city-bike-racks-20261026`.
- Worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-city-bike-racks`,
  branch `feat/city-bike-racks-20261026`, base `main` a13c853b.
- Coordinated before editing:
  - river-oaks-0b owns `server/world.js` (account-safety-292). It agreed, since
    rackSlots is outside its regions, and asked that the plaza slots keep their
    ids for its cycling-flush fixture. They do.
  - river-oaks-32 owns #289's draw budget. It asked for instanced bikes with one
    shadow proxy per rack and the exact names 'Parked bikes' and
    'Parked bikes shadow'. Done that way.
  - river-oaks-32's coming rider-pose branch changes the bicycle mesh (still 11
    meshes and 7 materials when parked). The merge picks that up unchanged.

## Files
- New `preview/src/bike-racks.js`:
  - six curbside racks in the plaza rack's shape;
  - `rackSlots`, `bikeRackSlots` (the plaza slots first) and `cityBikeRackFootprints`.
- New `preview/src/city-bike-racks.js`: the renderer.
  - All the bars are one bronze mesh.
  - The bicycle is merged by material (7 batches) and instanced per rack.
  - Each rack has one hidden shadow proxy.
  - A taken slot's bike drops to zero scale.
- `preview/src/walking.js`: each curbside bar blocks walkers and low flight, like
  the plaza bar. Each rack gets its own box, so the fast path stays a few compares.
- `server/world.js`: the town arbitrates every rack's slots (`bikeRackSlots`).
- `preview/src/plaza-bicycle.js`: the G prompt offers the nearest free slot at any rack.
- `preview/src/main.js`:
  - builds the layer, hides taken bikes from the snapshot, and lists the proxies for shadows;
  - adds `cityParked` and a dev-only `frame(slotId)` to `__riverCycling`.
- Copy and docs:
  - leaderboard copy: "Bike racks · lifetime miles" and "Take a bike from any bike rack.";
  - `docs/multiplayer.md`.
- Tests:
  - new `preview/tests/bike-racks.test.js`;
  - one new case in `server/tests/cycling.test.js`.
- New local journey `preview/e2e/city-bike-racks.js`, not in the default suite.

## Spots
Each rack was found by a scratch search on open paving within 16 m of a store. The
search ran over all three main revisions, the garage, Gardens and Commons, and
kept a spot only if:
- it's 0.5–4 m from an access lane, with the bar parallel to it;
- it's clear of lanes and walkways, crossings, doors (3.5 m), seats, planters,
  lamps, bins, tree pits, the plaza (6 m) and the spawn (8 m);
- each bike can stand there and ride out.

`bike-racks.test.js` checks the same rules for each revision.

| Rack | Bar centre (east, north) | Bikes point |
| --- | --- | --- |
| amorino-rack | -2760.0, -1210.5 | east |
| cartier-rack | -2744.0, -1295.5 | south |
| harry-winston-rack | -2762.0, -1355.0 | east |
| saint-bernard-rack | -2683.0, -1405.0 | east |
| steak-48-rack | -2877.0, -1427.0 | north |
| diptyque-rack | -2823.5, -1316.0 | west |

## Commands and results
- Focused tests: 150 files touching walking, plaza, cycling, build or the shared
  world. 2923 tests, 2882 pass, 41 skipped, 0 fail.
- `pnpm run verify` (core, 21:36–21:47Z, load ~37), passed:
  - agent 276/276;
  - preview 4178 pass, 1 skip;
  - server 916 pass, 225 Redis skips;
  - desktop 120 pass, 3 skips;
  - build, Python (170), demo and secrets.
- #673 stack (946e8cd2, read-only extract in the scratchpad): the slot layout and
  placement tests pass in all seven revisions, through woodland-heights-1.
- Mutation checks, each restored afterwards. Every one made its guarding test fail:
  - a rack moved onto Cartier's door;
  - the bar collision dropped;
  - the shadow proxy left out of the per-rack batch;
  - server slots cut to the plaza's.

- Browser, at 2eb2805c, 21:48–21:53Z, load 19–42, under the browser lock. In both
  Chromium and WebKit, all passed:
  - city-bike-racks 45 checks;
  - cycling-rack 12;
  - cycling-leaderboard 8.
  The reports are `data/reports/city-bike-racks-{chromium,webkit}.json`
  (untracked), and the rack screenshots are `output/playwright/city-bike-racks-*.png`.
- Draw census, scratch `rack-census.mjs`, with draw-census-local's setup (WebKit,
  Gardens, 440×796, AO off):

  | View | Total main / shadow | City racks main / shadow | Triangles main / shadow |
  | --- | --- | --- | --- |
  | Arrival (amorino in view) | 421.6 / 455 | 8 / 3 | 40k / 78k |
  | At Cartier | 473 / 449 | 15 / 2 | 78k / 40k |

  Sent to river-oaks-32.
- Draft #688 opened at 2eb2805c.
- Screenshot review: all six racks sit on open paving in front of storefronts.
  - Saint Bernard is at the southeast edge, facing the open ground.
  - The west rack is between Diptyque and Baccarat, under the arcade.
- Follow-up: renamed the dev hook `face()` to `frame()`. A walker faces
  (-sin, -cos) yaw, so the hook turns the player's back to the bike and the
  camera frames the rack. The west rack's comment now names both stores.
- Follow-up verification:
  - `pnpm run verify` passed (22:06–22:21Z, load 22–65), with the same counts as
    above: agent 276/276; preview 4178 pass, 1 skip; server 916 pass, 225 Redis
    skips; desktop 120 pass, 3 skips; build, Python, demo and secrets.
  - city-bike-racks passed 45 checks in Chromium (22:21Z) and in WebKit (22:45Z),
    each after waiting its turn in the browser lock. The reports are
    `data/reports/city-bike-racks-{chromium,webkit}-2.json`.

## Gaps
- Not checked against player creations saved on a live town. A saved creation on
  a rack spot would only make that slot refuse a rider (`isFree`).

## Next action
1. Watch hosted CI on #688.
2. Leave the PR as a draft for Val's review. No merge.
