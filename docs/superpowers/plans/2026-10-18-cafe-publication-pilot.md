# #420 approved Corner Café publication pilot (2026-10-18)

## Authority and scope

- **Opened by Val, 2026-10-18**, for a local pilot only: one owned, disposable creator-region
  fixture ([#420 comment 6246140955](https://github.com/BunsDev/river-oaks/issues/420#issuecomment-6246140955)).
  Not granted: official River Oaks placement, production database or Redis, paid services,
  merge, deployment or production activation.
- Register task `cafe-publication-pilot-420`, owner `claude:river-oaks-cafe-420 (eb49c122)`.
- Branch `feat/cafe-publication-pilot-420-20261018` in `../river-oaks-cafe-publication-420`,
  from `main` `d109648aea74dad91692d4d94bb51c8723e13ca7`.

## Inputs

| Input | Source | State |
| --- | --- | --- |
| Safe edits, `assessSpace`, profile v1 | #414 (#427, `d28939b2`) | on main |
| Asset contract (procedural forms, nine records) | #416 (#439, #459, #471) | on main |
| Review profile (desktop, M3 Max, Chromium ANGLE Metal, 1440×1000) | #417, Val 2026-10-17 | accepted, desktop only |
| Corner Café recipe | #418 slice 3 (#476, `a797d6b4`); soak/texture #478 (`a00a4d19`) | design review accepted by Val 2026-10-17 |

The Café recipe and its renderer sources are byte-identical between the reviewed `a00a4d19`
and the base `d109648a` (`git log a00a4d19..d109648a` over `space-templates.js`,
`space-scene.js`, `space-furniture.js`, `space-furniture-home.js`, `space-document.js`,
`studio-space-catalog.js` and `materials.js` is empty).

## Baseline checks (base `d109648a`)

| Check | Result |
| --- | --- |
| `node --test server/tests/region-package.test.js server/tests/world-catalog.test.js preview/tests/building-interiors-plan.test.js` | 27 tests: 25 pass, 2 skipped (Redis, no `REDIS_URL`) |

## Design

The smallest versioned adapter that reuses the existing seams: region package → compiler →
`buildingInteriors` → walking rooms → server authority and client streaming.

- **Reviewed record** (`preview/src/approved-spaces.js`): `corner-cafe@1` embeds
  `createSpace('cafe')` from the reviewed revision byte for byte. It also holds its SHA-256,
  profile `cafe` v1, the allowed `retail`/`restaurant` destination, the reviewed doorway
  (`[0,-6]`, facing south), the 16 × 12 m walk-in floor, the asset set (five renderer
  sources and six textures with their hashes) and Val's 2026-10-17 approval. Records are
  frozen and append-only. There is no approvals service, upload or storage for records.
- **Declaration** (region-v1, optional, like `generation`):
  `buildings[].interior.space = {id, revision, sha256}`, exact keys, and never together
  with `generation`. The digest is an expected-version guard, not authority. The client
  draft validator mirrors it.
- **Compiler adapter** (`preview/src/approved-space-plan.js`, called from
  `server/region-package.js`):
  - **Resolve:** look the record up, check its integrity, the declared digest
    (`approved_space_stale`), assets (`approved_space_assets`) and profile
    (`approved_space_policy`).
  - **Place:** one rigid transform maps the reviewed doorway onto the building's mapped
    entrance; no scaling.
  - **Fit** (`approved_space_fit`): the floor and indoor furnishings must be inside the
    ring. The street glazing may sit ≤ 10 cm proud.
  - **Neighbours** (`approved_space_neighbor`): the terrace stays clear of bounds, its own
    and other buildings, roads, trees, other parcels, arrivals, doors and places.
  - **Support** (`approved_space_support`): outdoor pieces and the arrival must be within
    5 cm of the doorway's height.
  - **Routes** (`approved_space_route`): every required route is walked in the assembled
    world with `spaceMovementSegment`, both ways, under the #414 budget. That covers the
    arrival to seating, service, preparation and the terrace, the exit, and the nearest
    street within 80 m.
- **Plan** (in `world.buildingInteriors`, digested like generated plans):
  - `kind: 'approved-space'`, `adapterVersion: 1`, `source`, `placement` and the
    transformed `space.objects`.
  - **Collision:** one ground level in the existing contract (room footprint, entrance
    portal `…/l0/portal/venue-…`, blocking furnishings as `layers.fixtures`). Terrace
    blockers are in `outdoor` and are appended to `collisionPolygons` after the building
    rings.
  - **Unchanged:** plain region-v1 and generation-v1 output and editable round trips are
    byte-identical (golden digests from `d109648a` in the tests).
- **Authority** (`store-rooms.js` → `approvedSpaceRoom`):
  - **Collision and access:** the same `approvedLevelRoom` geometry and door throat, with
    bounding-box culling of fixtures, no residents and no new actions.
  - **Level and checkpoints:** the server assigns `levelId: <building>/l0` as for
    generated ground floors.
  - **Unchanged:** checkpoint writer v11.
- **Client:**
  - **Rendering:** `approved-space-interior.js` builds the plan's objects with the reviewed
    `createSpaceScene` forms, minus the editor ground, sky light and arrival marker. It
    adds a ceiling, and pendants join the pooled store lights.
  - **Streaming:** the interior streams near the door; the terrace is always drawn.
    Exterior culling is off inside an approved space, which is glazed on two sides.
  - **Editor:** the region editor's **Furnished layout** choice lists only reviewed
    revisions for that destination.
- **Protocol:** `worldProtocolVersion(world)` is 4 when a world places an approved space
  and 3 otherwise. Tickets and snapshots carry it. Both servers refuse a lower client
  protocol with 426 (upgrade) or 4000 (before join), and the page shows **Refresh**.
  Plain worlds still accept protocol 3. The Redis edge reads the committed view before
  the join. When there's no view yet, or the read fails, it uses the requirement of the
  world data the gateway loaded, so admission failures keep their existing release path
  (`transport-failure.test.js`).
- **Activation (final state change):**
  - **Shared rechecks:** both catalogs recheck the owner (`not_owner`), revocation
    (`approved_space_revoked`) and the record, assets and profile (`approvedSpacesCurrent`).
  - **Memory catalog:** checks inside `applyRevision`.
  - **Redis:** `PUBLISH` and `COMMIT_ROOM` check the revocation set atomically. The room
    also rechecks before swapping, then rechecks routes against carried-forward creations
    (`approved_space_route`).
  - **Idempotency:** duplicate publish or apply is refused (`world_exists`,
    `draft_conflict`).
  - **Occupants:** a revision disconnects every occupant (4000) instead of replacing
    collision under them.
  - **Creations:** placing one that would block a Café route is refused.
  - **Revocation storage:** `{prefix}:approved-space-revocations:v1` and the memory set.
    The only writer is the catalog's `revokeApprovedSpace`; no HTTP route was added.

**Permission boundary:**
- **Publish:** Jevica's admin accounts (the local fixture owner), as before.
- **Revisions:** placing an approved space in a revision is owner-only; Jevica's accounts
  count as one owner.
- **Guests:** refused at every route.
- **Source access:** repository records only; private Studio documents are never
  publishable.
- **Grant:** one, `corner-cafe@1` for `retail`/`restaurant` placement in creator regions.
  It does not cover official district placement.

## Slices and evidence

### Reviewed record and hashes

| Item | Value |
| --- | --- |
| Record | `corner-cafe@1`, adapter v1, profile `cafe` v1, approved by Val 2026-10-17 (#418 issuecomment-6244286808, reviewed main `a00a4d19`) |
| Document SHA-256 | `ab210ecbd57ea7bfb00fb549832b3f33e05aa36d19c757b56bc88f166f6ad5ef` (7,128 bytes, 42 objects): equal to `createSpace('cafe')` on `a00a4d19` and `d109648a` (`space-templates.js` SHA-256 `bf5e9e3c…20e1df` on both) |
| Asset set SHA-256 | `615f2391fdbb92199366c25bb9b2b760091d9fea0c1624cd56a200bca1349588` over `space-scene.js` `5b363908…`, `space-furniture.js` `29532720…`, `space-furniture-home.js` `f2bcc6a2…`, `storefront-materials.js` `288aa4db…`, `studio-space-catalog.js` `758ad21a…`, and `paver-`/`stone-{color,normal,arm}.jpg` |
| Fixture plan | `server/tests/fixtures/cafe-pilot-region.json`, an 18 × 14 × 6 m restaurant on flat ground with a south door at `[0,-12]`: 30 indoor fixtures, 5 terrace blockers, 13.8 KB plan |

### Tests (fail first on the base, pass after)

On an export of `d109648a` with this branch's new tests, `approved-space.test.js` and
`approved-space-region.test.js` fail to load (no adapter modules). The transport test
fails on behaviour: the base refuses a `space` reference outright (400 where the adapter
answers 409 `approved_space_stale`), and it can't save the Café draft.

| Command | Result |
| --- | --- |
| `node --test server/tests/approved-space-region.test.js` | 7/7: placement, rigid transform at 0/37/120/45/180°, golden legacy digests, forged/unknown/stale/assets/policy, fit/neighbour/support/route, real-controller routes and budget, shared-world entry/collision |
| `node --test server/tests/approved-space-transport.test.js` | 2/2: two clients through local HTTP/WebSocket; protocol gate; walk, reconnect, exit; storage failure keeps the world; `not_owner`; occupants disconnected on apply and rollback; creations carried; deletion stays deleted; revocation during preparation; duplicate apply |
| `node --test preview/tests/approved-space.test.js` | 5/5: record and asset pins, renderer contents and lamps, unknown adapter fails closed, protocol helpers, no exterior culling |
| `REDIS_URL=<disposable> node --test server/tests/approved-space-redis.test.js` | 3/3, 0 skipped: catalog scripts, a revocation injected just before `COMMIT_ROOM` refused by Redis with the prior world kept, gateway two-client protocol gate |
| `REDIS_URL=<disposable> node --test` world-catalog, redis-room, world-gateway, office-world-lifecycle, world-invite-gateway, distributed-app | 46/46, 0 skipped |
| Existing region/catalog/town/app/contract/interior suites (no Redis) | 65 tests: 52 pass, 13 Redis skips |

### Two-client browser journey

`RIVER_OAKS_SHARED_REPORT=cafe-420-shared.json RIVER_OAKS_SHARED_JOURNEY=creator-approved-cafe
pnpm run test:shared development-publish`. The journey is `preview/e2e/creator-approved-cafe.js`
and the receipt is `data/reports/cafe-420-shared.json`.

**Final run (run 9):** passed, 19 checks in 223 s, at 2026-10-18T07:18Z on ANGLE Metal, Apple
M3 Max, full rendering. Both clients were 1440 × 1000, the #417 desktop review profile,
with loopback fixture identities on a shared, loaded machine (load average 30–130).

**The 19 checks, in order:**
1. The editor shows `corner-cafe@1` on the restaurant building.
2. Only reviewed revisions are offered.
3. The server resolves the record itself.
4. The world asks for protocol 4.
5. Both clients receive the identical plan.
6. A guest's publish is refused (403).
7. An older client (highest protocol 3, simulated by serving `world-contract.js` with
   `MAX_WORLD_PROTOCOL_VERSION = 3`) gets **Refresh**.
8. That same client still joins the original district.
9. The owner walks through the door with the keyboard controller, and both clients agree
   on `corner-cafe/l0`.
10. The owner reaches seating.
11. The owner reaches service.
12. The owner reaches preparation.
13. The guest sees the owner inside.
14. The guest reloads within the grace period and returns to the same spot on the Café
    floor.
15. The guest walks out to the arrival.
16. The owner rolls back with `disconnectedPlayers: 2`.
17. No approved plan remains.
18. Nobody is left on the replaced floor.
19. No page errors.

**Earlier runs:**
- Run 1 was aborted by a Vite reload from my own edit.
- Run 2 stalled crossing the street; see the finding below. The journey now arrives by
  store travel.
- Runs 3 and 4 hit harness timeouts and a null-snapshot wait under load.
- Runs 5–8 found the visual defects and the page error described below.

Player-height captures (local, git-ignored, `output/playwright/`, from run 9):

| Capture | SHA-256 |
| --- | --- |
| `cafe-420-owner-arrival.png` | `7cda57016f6f4c2d…` |
| `cafe-420-owner-terrace.png` | `86d37a4350b9a4c6…` |
| `cafe-420-owner-seating.png` | `1927d106ec8ae857…` |
| `cafe-420-owner-service.png` | `bf5bc231187c0ec8…` |
| `cafe-420-owner-preparation.png` | `6504d545dba8d997…` |
| `cafe-420-guest-sees-owner.png` | `01fb611e3e5c7c01…` |
| `cafe-420-guest-departed.png` | `764df86febeb2378…` |
| `cafe-420-owner-after-rollback.png` | `32f402138e0172ab…` |
| `cafe-420-older-client-district.png` | `76e75e6d87049ddc…` |

### Core gate (`pnpm run verify`)

| Run | Result |
| --- | --- |
| 1 | Agent 116/116. Preview 3,405 passed, 1 failed, 1 skipped. The failure was `office-penthouse-furnishings.test.js` "short idle slices": a wall-clock assertion that each slice is under 40 ms, at 73.2 ms under load average 35–51. |
| 2 | Agent 116/116. Preview 3,406 passed, 0 failed, 1 skipped. Server 606 passed, **2 failed**, 157 skipped (no `REDIS_URL`): `transport-failure.test.js`, my pre-join read. Fixed: an unreadable view falls back to the world data's requirement. |
| 3 | Preview: the same penthouse timing test failed. |
| 4 (with the disposable Redis) | Agent 116/116. Preview: the same timing test failed again (3,405 passed, 1 failed, 1 skipped). |

**About the timing test:**
- This branch doesn't touch `office-penthouse-furnishings.js` or its test. The test passed
  alone on this branch (1,241 ms).
- An export of `d109648a` couldn't serve as a clean comparison: it lacks files other suites
  need, and the timing test passed there in its one run.
- So it is a load-dependent wall-clock check, not evidence about this change. The preview
  code is identical between run 2 (clean preview) and now.
- The remaining core tasks then ran one by one on the final code:

| Command | Result |
| --- | --- |
| `REDIS_URL=<disposable> pnpm run verify server` | passed, 807/807, 0 skipped |
| `pnpm run verify desktop` | passed, 76/76 |
| `pnpm run verify build` | passed |
| `pnpm run verify python` | passed: lint, format, 141 pytest, demo and demo-verify |
| `uv run --locked python scripts/check_secrets.py --all` | no leaks found |
| `pnpm run agent:doctor` | passed after `uv sync --locked` gave the worktree its own `.venv` |

The disposable Redis was `redis-server` 8.10.2 bound to 127.0.0.1 on a random port with no
persistence, run from the session scratchpad. Its keys use random `river-oaks:cafe-420-test:*`
namespaces and are deleted after each test.

Compile cost on the fixture: 13–32 ms with the Café against 8–15 ms without it (load
average about 17). Route checks did 399 work units against a 30,000 budget. Before the
fixture-box cull, an approved room's `blocks` scan made route checks 75–330 ms.

## Runtime inspection: defects found and fixed

The browser journey's player-height captures showed two defects that tests had not:

1. **Storefront recesses inside the Café.**
   - **What showed:** for every facade bay without a room behind it, `district.js` draws a
     2.7 m deep "storefront" recess with the restaurant back-bar photograph. The fixture's
     18 × 14 m building puts the Café against its south face, so the north face's
     recesses reached 0.7 m into the Café: they cut through the prep cabinets and hid the
     north wall behind a bar of bottles.
   - **Fix:** in a building with an approved space, glazing is drawn only where the space
     stands behind the facade, the other bays are solid stone, and no recess is drawn.
     Other buildings are unchanged.
2. **Terrace sunk into the paving.**
   - **What showed:** creator regions draw their plaza `STREET.plazaOffset` (0.17 m) above
     the terrain, and visitors stand on it. The server walks on the terrain. The terrace,
     placed at the doorway's terrain datum, was buried 17 cm in the paving.
   - **Fix:** the terrace group is drawn at plaza height plus 5 mm. Studio floors hang
     below their datum, so without the lift the terrace's limestone top was coplanar with
     the paving and lost the depth test (run 8's capture). This is display only:
     collision and routes stay on the plan's terrain datum. The Café floor, like every creator room,
     stays at the doorway datum, so a visitor steps down 17 cm at the door.

3. **A page error on reconnect beside a bench.** This was present on `main`. While a page
   reconnects (for example after the rollback's 4000), `shared-seating-ui.js` listed
   nearby storefront benches and read `town.snapshot.players` while the snapshot was
   null. The Café's arrival stands next to one, so run 7 of the journey caught it. The
   two reads are now guarded the way the same function already guards its first.

Shared storefront benches (`street-fixtures.js`) are placed from the same world data on
both sides. Publication now refuses a terrace within 1.2 m of one (regression:
a footway that pushes the bench east).

## Finding outside this scope: creator streets can't be walked across in shared play

Found while walking the Café journey, and present on `main`. It is not caused by this
branch.
- **What the client stands on:** the browser registers the drawn street surfaces as ground
  (`main.js` → `registerGroundSurfaces`). On the fixture's 8.4 m residential street, that
  puts the road crown up to 0.31 m and the sidewalks 0.17–0.25 m above the terrain.
- **What the server walks on:** bare terrain at 0 m.
- **The refusal:** a pose more than 0.2 m off the server's ground is refused
  (`invalid_ground`). The stall begins at north −30.5, where the client's sidewalk first
  rises past 0.2 m.
- **How it was measured:** the client meshes were built in Node and compared with the
  server's ground along x = 0. A visitor walking from the spawn stopped there.
- **Why journeys missed it:** existing creator journeys arrive by travel, so none had
  crossed a creator street.

**Effect on this pilot:**
- The Café check now keeps the terrace and the arrival off the whole drawn street section
  (curb plus 3.81 m sidewalk).
- The journey arrives by store travel.
- The route-to-street check is proven against the authoritative environment only.

**Next action:** a separate fix, so the server's creator-region ground matches the street
surfaces it lets clients draw, or the drawn curbs stay within tolerance. It needs its own
issue.

## Limits and decisions left open

- **Production:** nothing was published, deployed or merged. No production Redis or
  database was touched, no paid service was called, and there is no official River Oaks
  placement. Activating approved spaces in production, and deploying protocol 4, are
  separate decisions.
- **Revocation:**
  - The catalog method and atomic enforcement exist; there is no operator route or UI to
    revoke.
  - A world already showing a revoked revision keeps it until its owner revises it away.
    Whether revocation should also close or strip live worlds is a production decision.
- **First increment only:** the Café's furniture offers no seating, ordering or other
  actions, and it has no residents or staff. Old non-object creations (seats, armchairs)
  don't collide, so only custom objects are checked against Café routes.
- **One venue per building:** region-v1 gives a building at most one interior, so the
  checks against another venue's doorway or room in the same building can't be reached
  from a package today; they guard a future multi-venue building.
- **Cost:** `history` on a Café world recompiles each retained version, including its
  route checks, at about 15–30 ms each on this machine.
- **Human and device review:** not done. The captures need design review. VoiceOver,
  touch, uncoached use, other GPUs, phones and packaged builds were not covered. The
  browser journey ran on the #417 desktop profile (M3 Max, Chromium ANGLE Metal,
  1440 × 1000) on a shared, loaded machine.

## Next step

1. **Review:** this branch is a local, signed commit. Pushing it and opening a draft PR
   for review are separate from this pilot's approval; merging and deploying are not
   granted.
2. **Val:** design review of the Café captures listed above. Then decide whether
   approved spaces may ever be activated outside local fixtures, and what revocation
   means for a world already showing one.
3. **Separate issue:** the creator-street ground mismatch above.
4. **Optional:** `pnpm run verify full` (Redis, audit, history scan and every browser
   journey) on an unloaded machine.
