# #491: walk across creator-region streets (2026-10-18)

## Ownership

- Register task `creator-street-ground-491`, owner `claude:river-oaks-cafe-420 (eb49c122)`.
- Branch `fix/creator-street-ground-491-20261018` in `../river-oaks-street-ground-491`,
  from `main` `dd9b61ee`.
- Val asked for this work on 2026-10-18, after it was found during #420 (see #491).

## Cause

The street profile (`street-profile.js`) draws everything around a 0.2 m walking datum: the
original district's `walkSurfaceOffset`.

| Surface | Height above the terrain |
| --- | --- |
| Plaza paving | 0.17 m |
| Sidewalks | 0.17–0.25 m |
| Road crown | up to 0.30 m |
| Shop floors | 0.2 m |

The browser stands on those drawn surfaces (`registerGroundSurfaces`). The server stands on
terrain plus `walkSurfaceOffset` and refuses a pose more than 0.2 m away (`invalid_ground`).
In the district every drawn surface is within 0.11 m of the datum.

Creator regions have compiled `walkSurfaceOffset: 0` since #108 (2026-10-03), two days
after the street profile settled on the 0.2 m datum. So the server's creator ground was
bare terrain, up to 0.31 m below the drawn road, and visitors stalled at the first
sidewalk. Built-in creator rooms sat 17 cm below the paving for the same reason.

## Change

1. **Datum:** `STREET.walkSurfaceOffset = 0.2` names the datum. `server/region-package.js`
   compiles creator regions with it.
2. **Revisions:** `migrateWorldCheckpoint` carries creations across a datum change. When a
   revision changes `walkSurfaceOffset` (a region published before this fix, now
   recompiled), creations outdoors or in built-in rooms move with it. Creations on a
   generated level keep their floor. Without this, the next revision of such a
   region with creations was refused as `incompatible_region`, because restore requires
   each creation's ground within 2 cm.
3. **Plaza surface:** `buildPlazaSurface` moved from `main.js` into
   `preview/src/plaza-surface.js`, unchanged, so tests compare the same triangles the
   browser registers.
4. **Journey:** `creator-street-crossing` publishes a flat creator region with a residential
   street and walks across it and back with the keyboard. It checks the server's own
   positions. It runs in the `development-publish` shared mode.

**Unchanged:**
- The district data, the street geometry and the server's 0.2 m tolerance.
- Generated levels' floors and plan digests (`baseElevation` is still the doorway's
  terrain height).
- Stored worlds until their owner applies a revision.

## Checks

| Command | Result |
| --- | --- |
| `node --test server/tests/creator-street-ground.test.js` on `dd9b61ee` (before the fix) | 4/4 failed for the expected reasons: flat fixture drawn 0.307 m vs server 0 m; sample region 0.306 m gap on a road crown; the walk was refused at north −30.5 (`invalid_ground`); the shop floor sat 17 cm below the paving. The revision test failed with `incompatible_region` before the migration change. |
| The same file after the change | 6/6 |
| Whole sample region, every free point on a 0.5 m grid | browser minus server ground −0.130 to +0.107 m |
| `node --test server/tests/*.test.js` | 757 tests: 603 passed, 0 failed, 154 skipped (Redis, no `REDIS_URL`) |
| `node --test preview/tests/*.test.js` | 3,412 tests: 3,411 passed, 0 failed, 1 skipped |
| `RIVER_OAKS_SHARED_JOURNEY=creator-street-crossing pnpm run test:shared development-publish` with the fix | passed in 43 s (receipt `data/reports/street-491-shared.json`). Server positions: start (0, −40), across (0, −14.76), back (0, −36.24), all at ground 0.2 m, with no page errors. Capture `output/playwright/creator-street-crossing.png` (local) shows the visitor mid-street on the asphalt. |
| The same journey with only the datum line reverted to `walkSurfaceOffset:0` | **failed**: "The walk stopped at [0, 1.88, 30.59] on the way to [0, −27]", the same stall seen during #420. The line was restored and checked byte for byte afterwards. |

| `pnpm run verify` (core) | passed; receipt `.runtime/agent/core.json`. Node suites: 116/116, 3,411/3,412 (1 skip), 605/759 (154 Redis skips), 76/76 |
| `pnpm run test:shared development-publish` (all four journeys) | `world-publish`, `creator-generated-levels`, `creator-four-levels` and `creator-street-crossing` passed (receipt `data/reports/street-491-publish.json`). An earlier full run failed `creator-street-crossing` because the walk began before the walker had a pose (assets 71/74 loaded); the journey now waits for one. |

| `REDIS_URL=<disposable local redis-server 8.10.2> pnpm run test:server` | 801 tests: 799 passed, 2 failed, 0 skipped. The failures were `connection-rotation` "memory: voice carries on across a hand-over" (timed out) and `town-worlds` "publishes and joins a second world" (`fetch failed`, `ECONNRESET`), with a load average of about 60 from other sessions. Both files then passed alone, twice (10/10 each run). |
| First Redis attempt | Redis 8.10.2 itself segfaulted (`kvGetKey`, during a `ZADD` in the ticket script) 42 s in, and the remaining tests could not connect. The run was discarded and Redis restarted; the same binary had run the full suite cleanly three times earlier that day. |

The journeys ran on ANGLE Metal (M3 Max, 1440 × 1000). CI results follow.

**Coordination:** the #489 Café branch pins golden digests of compiled creator regions from
`d109648a`. Once this lands, those regions compile `walkSurfaceOffset: 0.2`, so #489's
golden test and fixtures need recomputing when it is updated from `main`. Its approved
Café rooms also need checking against the revision carry: a creation on an approved
level must keep that level's floor, as on a generated one.

## Limits

- **Older published worlds:** they keep the old ground until a revision. No load-time
  migration: reinterpreting stored data would change each world's fingerprint and its
  checkpoint.
- **Generated levels:** creator generated levels still sit at the doorway's terrain
  height, so visitors step down 17–20 cm into them. Changing that changes generation-v1
  plan digests; it's a separate decision.
- **Gait:** the server still checks ground with its datum where the browser draws a
  surface. The fix keeps them within 0.13 m of each other; it doesn't make them identical.
